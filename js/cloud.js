/* =========================================================
 * 知识喂了猫 · 云端同步（打开就同步）
 *
 * 登录一次邮箱（验证码），之后每台设备自动拉取 / 推送存档。
 * - 只在正式发布域名上可用（服务端校验 Origin，localhost 会自动降级为"本地模式"）
 * - 数据按账号隔离（数据库行级安全：owner_id = auth.uid()）
 * - 冲突策略：启动时谁新用谁（按 savedAt）；运行中以本机为准、自动推送
 * - 证据库的音频/截图原件不进云端（体积原因），云端同步的是进度与索引
 * ========================================================= */
window.CloudSync = (function () {

  /* publicConfig（由云服务环境分配；publishableKey 无权限、靠 Origin 校验） */
  var ENDPOINT = 'https://knowledge-cat.app.workbuddy.link';
  var PKEY = 'wbpk_Pza5dflAYKH5VhnQOQJVkv_sCVMF0FRPcqNmfAJmgXPhG0N368r9m45';
  var TABLE = 'game_saves';

  var cloud = null;
  var state = 'boot';      /* boot 初始化中 | off 无SDK/本地 | out 未登录 | code 待验证码 | in 已登录 | err 出错 */
  var email = '';
  var pendingStart = null; /* 验证码流程句柄 */
  var rowId = null;
  var lastPushAt = 0, lastPullAt = 0, lastErr = '';
  var pushTimer = null;
  var applyingRemote = false;  /* 正在把云端存档灌进本机，期间不回推 */
  var onRemoteApplied = null;  /* app 注入：应用云端存档后的 UI 回调 */
  var pushFailStreak = 0;

  /* ---------------- 状态查询 ---------------- */
  function status() {
    return {
      state: state, email: email, rowId: rowId,
      lastPushAt: lastPushAt, lastPullAt: lastPullAt,
      lastErr: lastErr, applyingRemote: applyingRemote,
      available: available()
    };
  }
  function available() {
    return typeof window.WorkBuddyCloud !== 'undefined' && typeof window.fetch === 'function';
  }
  function signedIn() { return state === 'in' && !!cloud; }
  function deviceName() {
    try {
      const ua = navigator.userAgent || '';
      if (/iPad|Tablet/i.test(ua) || (/Macintosh/.test(ua) && 'ontouchend' in document)) return 'iPad/平板';
      if (/Mobi|iPhone|Android/i.test(ua)) return '手机';
      return '电脑';
    } catch (e) { return '设备'; }
  }

  /* ---------------- 顶栏小云朵 ---------------- */
  function paintChip() {
    const v = document.getElementById('chip-cloud-v');
    const chip = document.getElementById('chip-cloud');
    if (!v || !chip) return;
    chip.classList.remove('cloud-in', 'cloud-out', 'cloud-warn');
    if (state === 'in') {
      chip.classList.add('cloud-in');
      v.textContent = lastPushAt || lastPullAt ? '已同步' : '已登录';
      chip.title = '云端同步开启中（' + deviceName() + '）\n邮箱：' + email +
        '\n最近推送：' + (lastPushAt ? new Date(lastPushAt).toLocaleTimeString() : '—') +
        '\n点击查看详情 / 退出登录';
    } else if (state === 'boot') {
      v.textContent = '连接中…';
      chip.title = '正在连接云端存档…';
    } else if (state === 'code') {
      chip.classList.add('cloud-warn');
      v.textContent = '输验证码';
      chip.title = '正在登录：' + email;
    } else if (state === 'err') {
      chip.classList.add('cloud-warn');
      v.textContent = '同步异常';
      chip.title = '云端同步出了问题：' + lastErr + '（点击查看）';
    } else if (state === 'off') {
      chip.classList.add('cloud-out');
      v.textContent = '本地模式';
      chip.title = '当前环境连不上云端（本地预览 / 无网络）。\n游戏照常玩、存档在本机；正式版里会自动云同步。';
    } else {
      chip.classList.add('cloud-out');
      v.textContent = '未登录';
      chip.title = '登录邮箱后，进度会在手机 / 电脑 / iPad 之间自动同步。点击登录。';
    }
  }
  function notify() { paintChip(); }

  /* ---------------- 初始化 ---------------- */
  /* SDK 用 async 从 CDN 加载：这里轮询等它就绪（最多 8 秒），等不到就本地模式。
     这样 CDN 慢 / 挂了都不影响游戏本体的加载。 */
  function whenSdkReady(cb, t0) {
    if (typeof window.WorkBuddyCloud !== 'undefined') { cb(); return; }
    if (Date.now() - t0 > 8000) {
      state = 'off';
      lastErr = 'SDK 未加载';
      notify();
      return;
    }
    setTimeout(function () { whenSdkReady(cb, t0); }, 300);
  }
  function init() {
    notify();
    /* 连 fetch 都没有的环境（老浏览器 / 测试器）直接本地模式，不用等 SDK */
    if (typeof window.fetch !== 'function') {
      state = 'off';
      lastErr = '环境不支持 fetch';
      notify();
      return;
    }
    whenSdkReady(function () { initReal(); }, Date.now());
  }
  function initReal() {
    try {
      cloud = window.WorkBuddyCloud.createWorkBuddyCloud({
        endpoint: ENDPOINT,
        publishableKey: PKEY
      });
    } catch (e) {
      state = 'err'; lastErr = (e && e.message) || String(e);
      notify();
      return;
    }
    /* 本机存档一落盘就排队推云端 */
    if (window.Store && window.Store.hooks) {
      window.Store.hooks.onSaved = function () { onLocalSave(); };
    }
    refreshSession();
  }

  function refreshSession() {
    state = 'boot'; notify();
    cloud.auth.getSession().then(function (r) {
      const sess = r.data;
      if (r.error || !sess || !sess.user) { state = 'out'; notify(); return; }
      email = sess.user.email || '';
      state = 'in'; notify();
      return bootSync();
    }).catch(function (e) {
      state = 'out';
      lastErr = (e && e.message) || String(e);
      notify();
    });
  }

  /* ---------------- 启动对账：谁新用谁 ---------------- */
  function bootSync() {
    return pull().then(function (row) {
      lastPullAt = Date.now();
      if (row && row.payload && row.payload.state) {
        const cloudAt = row.payload.state.savedAt || 0;
        const localAt = (window.Store.state && window.Store.state.savedAt) || 0;
        if (cloudAt > localAt + 1000) {
          /* 云端更新 → 整份接过来（importAll 会先自动备份本机这份） */
          applyingRemote = true;
          try {
            window.Store.importAll({ state: row.payload.state });
          } finally { applyingRemote = false; }
          notify();
          if (onRemoteApplied) onRemoteApplied(row.payload.state);
          return;
        }
      }
      /* 本机更新（或云端还没有）→ 推上去 */
      return pushNow();
    }).catch(function (e) {
      state = 'err';
      lastErr = (e && e.message) || String(e);
      notify();
    });
  }

  /* ---------------- 拉取 ---------------- */
  function pull() {
    return cloud.database.from(TABLE)
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(1)
      .then(function (r) {
        if (r.error) throw r.error;
        const row = (r.data && r.data[0]) || null;
        rowId = row ? row.id : null;
        return row;
      });
  }

  /* ---------------- 推送 ---------------- */
  function pushNow() {
    if (!signedIn() || applyingRemote) return Promise.resolve(false);
    const st = window.Store.state;
    if (!st) return Promise.resolve(false);
    const payload = JSON.parse(JSON.stringify(st));
    const body = { payload: payload, device: deviceName() };

    const job = rowId
      ? cloud.database.from(TABLE).update(body).eq('id', rowId).select()
      : cloud.database.from(TABLE).insert(body).select();

    return job.then(function (r) {
      if (r.error) throw r.error;
      const rows = Array.isArray(r.data) ? r.data : [];
      if (!rows.length) { rowId = null; throw new Error('云端没有接住这次保存（行不存在或权限变了）'); }
      rowId = rows[0].id;
      lastPushAt = Date.now();
      pushFailStreak = 0;
      if (state === 'err') { state = 'in'; lastErr = ''; }
      notify();
      return true;
    }).catch(function (e) {
      pushFailStreak++;
      lastErr = (e && e.message) || String(e);
      state = 'err';
      notify();
      return false;
    });
  }

  /* 本机 save() 之后的钩子：防抖 2.5s 推一次 */
  function onLocalSave() {
    if (!signedIn() || applyingRemote) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(function () { pushNow(); }, 2500);
  }

  /* ---------------- 登录 / 登出（邮箱验证码，一次就够） ---------------- */
  function sendCode(mail) {
    mail = String(mail || '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) {
      return Promise.reject(new Error('邮箱格式看着不对，再检查一下'));
    }
    return cloud.auth.signInWithOtp({ email: mail }).then(function (r) {
      if (r.error) throw r.error;
      pendingStart = r;
      email = mail;
      state = 'code';
      notify();
      return true;
    });
  }
  function verifyCode(code) {
    if (!pendingStart || !pendingStart.data || !pendingStart.data.verify) {
      return Promise.reject(new Error('先填邮箱获取验证码'));
    }
    return pendingStart.data.verify({ token: String(code || '').trim() }).then(function (r) {
      if (r.error) throw r.error;
      const user = r.data && r.data.user;
      email = (user && user.email) || email;
      pendingStart = null;
      state = 'in';
      notify();
      return bootSync();
    });
  }
  function signOut() {
    if (!cloud) return Promise.resolve();
    return cloud.auth.signOut().catch(function () {}).then(function () {
      email = ''; rowId = null; state = 'out';
      lastPushAt = 0; lastPullAt = 0;
      notify();
    });
  }

  return {
    init: init,
    status: status,
    available: available,
    signedIn: signedIn,
    sendCode: sendCode,
    verifyCode: verifyCode,
    signOut: signOut,
    pushNow: pushNow,
    set onRemoteApplied(fn) { onRemoteApplied = fn; },
    get onRemoteApplied() { return onRemoteApplied; }
  };
})();
