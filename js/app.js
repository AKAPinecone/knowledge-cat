/* =========================================================
 * 知识喂了猫 · 界面与交互
 * ========================================================= */
(function () {
  const D = window.GAME_DATA;
  let S = null;
  let curTab = 'garden';   /* 打开游戏先看到乐园（主体是游戏） */
  const shopQty = {};
  let podOpen = false;     /* 保存舱面板是否展开 */
  /* v1.18 大世界地图 */
  let wp = { x: 0, y: 0 }; /* 地图平移量（px） */
  let wpInit = false;      /* 是否已经做过首次定位 */
  let bxId = null;         /* 正在打开的修建弹窗：建筑 id */
  let bxState = null;      /* 修建弹窗里选中的三人 {animal,plant,fungus} */
  let laborAutoShown = false; /* 本会话里 Lv.3 剧情是否已自动弹过 */
  let vf = null;          /* 验证弹窗的临时状态 */
  let qz = null;          /* 破壳测验弹窗的临时状态 */
  let modalCleanup = null;/* 关窗时要执行的清理（比如停掉测验倒计时） */
  let evFilter = 'all';
  let studySig = '';      /* 学习页内容指纹：没变化就不重绘，避免手机上读着读着跳一下 */
  let gardenSig = '';     /* 乐园页内容指纹：没变化就不重绘，别把手指下的地图拆了重建 */

  /* ---------------- 小工具 ---------------- */
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function esc(s) {
    return String(s === undefined || s === null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function fmtClock(sec) {
    sec = Math.max(0, Math.floor(sec));
    const m = Math.floor(sec / 60), s = sec % 60;
    return (m < 10 ? '0' + m : m) + ':' + (s < 10 ? '0' + s : s);
  }
  function fmtHM(min) {
    min = Math.round(min || 0);
    if (min < 60) return min + ' 分钟';
    return Math.floor(min / 60) + ' 小时 ' + (min % 60) + ' 分';
  }
  function fmtWhen(ts) {
    const d = new Date(ts);
    const today = window.Store.today() === window.Store.dateKey(d);
    const hh = d.getHours(), mm = d.getMinutes();
    return (today ? '今天 ' : (d.getMonth() + 1) + '月' + d.getDate() + '日 ') +
      (hh < 10 ? '0' + hh : hh) + ':' + (mm < 10 ? '0' + mm : mm);
  }
  function kolbOf(key) {
    return D.KOLB.filter(function (k) { return k.key === key; })[0] || D.KOLB[0];
  }
  function rarityName(r) { return { 1: '普通', 2: '稀有', 3: '传说' }[r] || '普通'; }

  /* 碎片进度点：● ● ○ */
  function dotsHtml(need, done, big) {
    let s = '<span class="shard-dots' + (big ? ' big' : '') + '">';
    for (let i = 0; i < need; i++) s += '<i class="' + (i < done ? ' on' : '') + '"></i>';
    return s + '</span>';
  }

  /* ---------------- Toast / 特效 ---------------- */
  function toast(text, kind, ms) {
    const box = document.createElement('div');
    box.className = 'toast ' + (kind || '');
    box.innerHTML = text;
    $('#toast-root').appendChild(box);
    setTimeout(function () {
      box.style.transition = 'opacity .3s, transform .3s';
      box.style.opacity = '0';
      box.style.transform = 'translateX(20px)';
      setTimeout(function () { box.remove(); }, 320);
    }, ms || 4200);
  }
  function confetti(n) {
    const root = $('#fx-root');
    const colors = ['#8FD3A8', '#4CA96B', '#E3A33C', '#35B7A8', '#C4708E', '#F0C069'];
    for (let i = 0; i < (n || 40); i++) {
      const d = document.createElement('i');
      d.className = 'confetti';
      d.style.left = Math.random() * 100 + '%';
      d.style.top = '-20px';
      d.style.background = colors[Math.floor(Math.random() * colors.length)];
      d.style.animationDuration = (1.6 + Math.random() * 1.4) + 's';
      d.style.animationDelay = (Math.random() * 0.4) + 's';
      root.appendChild(d);
      setTimeout(function () { d.remove(); }, 3400);
    }
  }

  /* ---------------- 音频系统 ---------------- */
  const BGM_TRACKS = [
    { id: 'morning-dew', name: '晨露轻闪', src: 'assets/audio/morning-dew.mp3' },
    { id: 'summer-night', name: '夏夜翻书声', src: 'assets/audio/summer-night.mp3' }
  ];
  let _bgm = null, _bgmCur = -1, _actx = null;

  function ensureSettings() {
    if (!S || !S.settings) return;
    if (typeof S.settings.bgmOn !== 'boolean') S.settings.bgmOn = false;
    if (typeof S.settings.bgmTrack !== 'number') S.settings.bgmTrack = 0;
  }
  function bgmEl() {
    if (!_bgm) { _bgm = new Audio(); _bgm.loop = true; _bgm.preload = 'auto'; _bgm.volume = 0.45; }
    return _bgm;
  }
  function startBgm() {
    ensureSettings(); if (!S || !S.settings) return;
    const t = BGM_TRACKS[S.settings.bgmTrack] || BGM_TRACKS[0];
    const a = bgmEl();
    if (_bgmCur !== S.settings.bgmTrack) { a.src = t.src; _bgmCur = S.settings.bgmTrack; }
    let p = null;
    try { p = a.play(); } catch (e) { p = null; }
    if (p && typeof p.then === 'function') {
      p.then(function () {
        if (S && S.settings) { S.settings.bgmOn = true; window.Store.save(); }
        updateMusicChip();
      }).catch(function () { /* 浏览器拦截自动播放，等用户手势 */ });
      return;
    }
    /* 环境不支持播放（例如测试用的 jsdom）：把开关状态记下就好，别抛错 */
    if (S && S.settings) { S.settings.bgmOn = true; window.Store.save(); }
    updateMusicChip();
  }
  function stopBgm() {
    if (_bgm) _bgm.pause();
    if (S && S.settings) { S.settings.bgmOn = false; window.Store.save(); }
    updateMusicChip();
  }
  function toggleBgm() {
    ensureSettings(); if (!S || !S.settings) return;
    if (S.settings.bgmOn) stopBgm(); else startBgm();
  }
  function updateMusicChip() {
    const ico = $('#music-ico'), nm = $('#music-name');
    if (!ico || !nm) return;
    const on = S && S.settings && S.settings.bgmOn;
    ico.textContent = on ? '🎶' : '🎵';
    nm.textContent = on ? (BGM_TRACKS[S.settings.bgmTrack] || BGM_TRACKS[0]).name : '音乐关';
  }
  function audioCtx() {
    if (!_actx) { try { _actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { _actx = null; } }
    if (_actx && _actx.state === 'suspended') { try { _actx.resume(); } catch (e) {} }
    return _actx;
  }
  function tone(freq, dur, type, vol, delay) {
    const ctx = audioCtx(); if (!ctx) return;
    const t0 = ctx.currentTime + (delay || 0);
    const osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol || 0.18, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g); g.connect(ctx.destination);
    osc.start(t0); osc.stop(t0 + dur + 0.03);
  }
  function noiseBurst(dur, vol) {
    const ctx = audioCtx(); if (!ctx) return;
    const n = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const g = ctx.createGain(); g.gain.value = vol || 0.12;
    const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 1200;
    src.connect(f); f.connect(g); g.connect(ctx.destination);
    src.start();
  }
  /* 照顾动作音效（Web Audio 合成，无需素材文件） */
  function playSfx(act) {
    switch (act) {
      case 'water': tone(820, 0.18, 'sine', 0.2, 0); tone(520, 0.16, 'sine', 0.15, 0.08); break;
      case 'drink': tone(820, 0.18, 'sine', 0.2, 0); tone(520, 0.16, 'sine', 0.15, 0.08); break;
      case 'fert':  tone(1100, 0.10, 'triangle', 0.16, 0); tone(1500, 0.10, 'triangle', 0.14, 0.09); break;
      case 'pest':  noiseBurst(0.22, 0.14); break;
      case 'food':  tone(520, 0.10, 'sine', 0.18, 0); tone(680, 0.12, 'sine', 0.16, 0.1); break;
      case 'bath':  tone(600, 0.10, 'sine', 0.15, 0); tone(500, 0.10, 'sine', 0.13, 0.08); tone(660, 0.10, 'sine', 0.13, 0.16); break;
      case 'clean': tone(440, 0.12, 'square', 0.12, 0); tone(700, 0.14, 'sine', 0.14, 0.1); break;
      case 'music': tone(660, 0.14, 'sine', 0.13, 0); tone(880, 0.16, 'sine', 0.12, 0.1); tone(1046, 0.18, 'sine', 0.1, 0.22); break;
      case 'build': noiseBurst(0.16, 0.12); tone(300, 0.2, 'triangle', 0.14, 0.05); tone(420, 0.22, 'triangle', 0.12, 0.16); break;
      default: tone(700, 0.12, 'sine', 0.15, 0);
    }
  }
  /* 任务完成欢呼（cheer.mp3） */
  function playCheer() {
    try { const a = new Audio('assets/audio/cheer.mp3'); a.volume = 0.75; a.play().catch(function () {}); } catch (e) {}
  }
  /* 照顾动作小动画：在头像处飘出对应表情，并轻微弹一下 */
  function careFx(act, container) {
    if (!container) return;
    const map = { water: '💧', drink: '💧', fert: '✨', pest: '🧴', food: '🥣', bath: '🫧', clean: '✨' };
    const emo = map[act] || '✨';
    const n = (act === 'water' || act === 'drink' || act === 'bath') ? 5 : 3;
    for (let i = 0; i < n; i++) {
      const s = document.createElement('span');
      s.className = 'care-fx';
      s.textContent = emo;
      s.style.left = (18 + Math.random() * 56) + '%';
      s.style.animationDelay = (i * 0.07) + 's';
      container.appendChild(s);
      setTimeout(function () { if (s.parentNode) s.parentNode.removeChild(s); }, 1300);
    }
    container.classList.add('bounce');
    setTimeout(function () { container.classList.remove('bounce'); }, 420);
  }
  function openMusicPanel() {
    ensureSettings();
    let body = '<div class="music-list">';
    body += '<div class="music-row"><button class="btn btn-primary btn-sm" id="m-toggle">' +
      ((S.settings && S.settings.bgmOn) ? '⏸️ 暂停' : '▶️ 播放') + '</button>' +
      '<span class="hint" style="margin-left:8px">循环播放，做题时陪着你</span></div>';
    BGM_TRACKS.forEach(function (t, i) {
      const on = S.settings && S.settings.bgmTrack === i;
      body += '<button class="music-track' + (on ? ' on' : '') + '" data-trk="' + i + '">' +
        '<span class="mt-ico">🎵</span><span class="mt-name">' + t.name + '</span>' +
        (on ? '<span class="mt-on">▶ 播放中</span>' : '<span class="mt-off">点击播放</span>') + '</button>';
    });
    body += '</div>';
    openModal({
      title: '🎵 背景音乐', body: body,
      foot: '<button class="btn btn-ghost" id="m-close">关闭</button>',
      onMount: function (m) {
        $('#m-close', m).onclick = closeModal;
        $('#m-toggle', m).onclick = function () { toggleBgm(); $('#m-toggle', m).textContent = (S.settings.bgmOn) ? '⏸️ 暂停' : '▶️ 播放'; };
        $$('.music-track', m).forEach(function (b) {
          b.onclick = function () {
            S.settings.bgmTrack = parseInt(b.dataset.trk, 10);
            startBgm(); window.Store.save(); updateMusicChip();
            openMusicPanel();
          };
        });
      }
    });
  }

  /* ---------------- 每日签到 ---------------- */
  function canClaimDailyReward() {
    return S.study.dailyRewardDate !== window.Store.today();
  }
  function rollDailyReward() {
    const r = Math.random();
    if (r < 0.45) return { type: 'beans', amount: 10 + Math.floor(Math.random() * 21), label: '可可豆', icon: '🌰' };
    if (r < 0.75) return { type: 'tickets', amount: 1, label: '抽奖券', icon: '🎟️' };
    return { type: 'freeQuestions', amount: 1, label: '免题券', icon: '🧾' };
  }
  function applyDailyReward(reward) {
    if (reward.type === 'beans') S.cur.beans += reward.amount;
    else if (reward.type === 'tickets') S.cur.tickets += reward.amount;
    else if (reward.type === 'freeQuestions') S.cur.freeQuestions = (S.cur.freeQuestions || 0) + reward.amount;
    S.study.dailyRewardDate = window.Store.today();
    window.Store.save(true);
    renderTop();
  }
  function openDailyRewardModal(auto) {
    if (!canClaimDailyReward()) {
      if (!auto) toast('今日签到奖励已经领过啦，明天再来。', 'ok');
      return;
    }
    let picked = false;
    const reward = rollDailyReward();
    const cardHtml = function (i) {
      return '<div class="dcard" id="dcard-' + i + '" data-i="' + i + '">' +
        '<div class="dcard-inner">' +
          '<div class="dcard-front">' +
            '<div class="dcard-sym">' + ['◐', '◑', '◒'][i] + '</div>' +
            '<div class="dcard-tip">点我翻开</div>' +
          '</div>' +
          '<div class="dcard-back" id="dcard-back-' + i + '"></div>' +
        '</div>' +
      '</div>';
    };
    openModal({
      title: '🎁 每日签到 · 今日运势',
      body: '<div class="daily-hint">每天首次打开都会有一次抽象签运。翻一张卡片，看看今天猫给你叼来了什么。</div>' +
        '<div class="daily-cards">' + cardHtml(0) + cardHtml(1) + cardHtml(2) + '</div>' +
        '<div id="daily-result" class="daily-result" style="display:none"></div>',
      foot: '<button class="btn btn-primary" id="daily-claim" style="display:none">收下奖励</button>',
      dismissable: false,
      onMount: function (mask) {
        $$('.dcard', mask).forEach(function (c) {
          c.onclick = function () {
            if (picked) return;
            picked = true;
            const idx = parseInt(c.dataset.i, 10);
            const back = $('#dcard-back-' + idx, mask);
            back.innerHTML = '<div class="dcard-reward">' + reward.icon + '</div>' +
              '<div class="dcard-reward-name">' + reward.label + ' × ' + reward.amount + '</div>';
            c.classList.add('flipped');
            const res = $('#daily-result', mask);
            res.textContent = '今日签运：' + reward.icon + ' ' + reward.label + ' × ' + reward.amount;
            res.style.display = '';
            $('#daily-claim', mask).style.display = '';
          };
        });
        $('#daily-claim', mask).onclick = function () {
          applyDailyReward(reward);
          closeModal();
          toast('🎁 签到成功：获得 ' + reward.icon + ' ' + reward.label + ' × ' + reward.amount, 'ok', 4000);
        };
      }
    });
  }

  /* ---------------- 每日投喂单全满奖励弹窗 ---------------- */
  function openFeedBonusModal() {
    openModal({
      title: '🍽️ 今日投喂单全满！',
      body: '<div class="feed-bonus-body">' +
        '<div class="feed-bonus-cat">🐱</div>' +
        '<div class="feed-bonus-text">你喂满了今天的全部核心任务，猫很满意。</div>' +
        '<div class="feed-bonus-prize">🎟️ +2 抽奖券　🌰 +50 可可豆</div>' +
      '</div>',
      foot: '<button class="btn btn-primary" id="fb-ok">收下奖励</button>',
      onMount: function (mask) {
        $('#fb-ok', mask).onclick = closeModal;
      }
    });
  }

  /* ---------------- 弹窗 ---------------- */
  function openModal(opts) {
    /* opts: {title, body, foot, wide, onMount, dismissable} */
    closeModal();
    const mask = document.createElement('div');
    mask.className = 'modal-mask';
    const closable = opts.dismissable !== false;
    mask.innerHTML =
      '<div class="modal ' + (opts.wide ? 'wide' : '') + '">' +
        '<div class="modal-head"><h3>' + opts.title + '</h3>' +
          (closable ? '<button class="x" id="modal-x">✕</button>' : '') + '</div>' +
        '<div class="modal-body">' + opts.body + '</div>' +
        (opts.foot ? '<div class="modal-foot">' + opts.foot + '</div>' : '') +
      '</div>';
    $('#modal-root').appendChild(mask);
    if (closable) {
      mask.addEventListener('click', function (e) {
        if (e.target === mask) closeModal();
      });
      $('#modal-x').onclick = function () { closeModal(); };
    }
    if (opts.onClose) modalCleanup = opts.onClose;
    if (opts.onMount) opts.onMount(mask);
    return mask;
  }
  function closeModal() {
    const fn = modalCleanup;
    modalCleanup = null;
    if (fn) { try { fn(); } catch (e) { /* 清理出错不该挡住关窗 */ } }
    const m = $('#modal-root');
    if (m) m.innerHTML = '';
  }

  /* 手机键盘弹出来时，把底部抽屉整体顶上去，别让键盘盖住输入框和确认按钮。
     桌面端 visualViewport 高度差恒为 0，等同于没有这段逻辑。 */
  function setupKeyboardShift() {
    const vv = window.visualViewport;
    if (!vv) return;
    function apply() {
      const gap = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      document.documentElement.style.setProperty('--kb', gap + 'px');
    }
    vv.addEventListener('resize', apply);
    vv.addEventListener('scroll', apply);
    apply();
  }

  /* =========================================================
   * 初始化
   * ========================================================= */
  function init() {
    window.Store.load();
    S = window.Store.state;

    /* 存档写不进去时必须让松果知道。不然他会以为"游戏把我的档搞丢了"，
       实际是浏览器存储满了、后面几十次保存全都没落盘。 */
    window.Store.hooks.onSaveError = function () {
      toast('⚠️ 存档写不进去了：浏览器存储满了。去「证据库」删几张截图，或先在跨设备同步里复制一份同步码。', 'err', 10000);
    };
    window.Store.hooks.onSaveSlim = function () {
      toast('⚠️ 存档太大了，已自动把截图缩略图从存档里摘掉（原图还在），进度不受影响。', 'warn', 9000);
    };

    /* 链接里带了存档（#s=...）：先把进度接过来，再正常启动 */
    const incoming = window.Sync ? window.Sync.codeFromHash() : null;
    if (incoming) {
      window.Sync.decode(incoming).then(function (obj) {
        window.Store.importAll(obj);
        window.Sync.clearHash();
        toast('🔗 已通过链接接入进度：' + window.Sync.brief(window.Store.state), 'ok', 8000);
        boot();
      }).catch(function (e) {
        window.Sync.clearHash();
        toast('❌ 这条链接里的存档读不出来：' + e.message, 'err', 8000);
        boot();
      });
      return;
    }
    boot();
  }

  function boot() {
    S = window.Store.state;

    const dayReset = window.Store.resetDaily();
    window.Game.init();
    window.Study.init();

    /* 学习链路只需一个提示回调；这里没有任何计时器 */
    window.Study.hooks.onNotice = function (t, k) { toast(t, k); };

    /* 跨设备同步：顶栏那颗显眼的按钮，一键开同步码（不联网、不登录） */
    const syncChip = $('#chip-sync');
    if (syncChip) syncChip.onclick = openSyncModal;
    const saveChip = $('#chip-save');
    if (saveChip) saveChip.onclick = openSaveModal;
    const checkinChip = $('#chip-checkin');
    if (checkinChip) checkinChip.onclick = function () { openDailyRewardModal(false); };

    /* 背景音乐：顶栏的小胶囊，点开选曲 / 暂停。默认关，不硬塞给用户。 */
    const musicChip = $('#music-chip');
    if (musicChip) musicChip.onclick = openMusicPanel;
    ensureSettings();
    updateMusicChip();
    /* 上次开着音乐的话，等第一次点屏幕再接上（浏览器不许页面自动出声） */
    if (S.settings && S.settings.bgmOn) {
      const kick = function () { document.removeEventListener('pointerdown', kick); startBgm(); };
      document.addEventListener('pointerdown', kick);
    }

    /* 离线结算 */
    const report = window.Store.advanceOffline();
    window.Store.save(true);

    bindTabs();
    setupKeyboardShift();
    render();
    /* 页脚版本号：方便松果判断是否更新（随发版 bump D.VERSION） */
    const fv = document.getElementById('foot-version');
    if (fv) fv.textContent = '版本 ' + (D.VERSION || '?');
    afterOffline(report);
    if (dayReset) toast('☀️ 新的一天，投喂单已经刷新。', 'ok');

    /* 每日签到：首次进入自动弹出（如果还没领），也可点顶栏 🎁 手动打开 */
    if (canClaimDailyReward()) {
      setTimeout(function () { openDailyRewardModal(true); }, 600);
    }

    setInterval(function () {
      const r = window.Store.advanceOffline();
      if (r.sick.length) {
        r.sick.forEach(function (p) { toast('😷 ' + esc(p.name) + ' 生病了：' + p.illness.name + '，去乐园用药水治它。', 'err', 7000); });
      }
      renderTop();
      /* 乐园页含可拖动的地图：正在拖、或开着弹窗时不重绘，免得把手指下的地图抽走；
         内容指纹没变也不重绘，省得每 8 秒抖一下。 */
      if (curTab === 'garden') {
        if (!activeMask() && !$('#world-vp.dragging') && gardenSignature() !== gardenSig) renderView();
      }
      else if (curTab === 'study' && studySignature() !== studySig) renderView();
    }, 8000);

    /* 每 20 秒检查一次可破壳 */
    setInterval(function () {
      const ready = S.capsules.filter(function (c) { return c.place && (Date.now() - c.hatchStart) / (c.hatchMinutes * 60000) >= 1; });
      const dot = $('#dot-garden');
      if (dot) dot.className = 'dot' + (ready.length ? ' show' : '');
    }, 5000);
  }

  function afterOffline(report) {
    const bits = [];
    if (report.hatched && report.hatched.length) {
      bits.push(report.hatched.length + ' 颗胶囊已经孵化完成' +
        (window.QBank && window.QBank.count() ? '（点「答题破壳」，答对 1 道题就能请它出来）' : '（可以破壳了）'));
    }
    if (report.sick && report.sick.length) bits.push(report.sick.length + ' 只小生物生病了');
    if (report.minutes >= 5) bits.push('离开了 ' + fmtHM(report.minutes));
    if (!bits.length) return;
    const expired = S.pets.filter(function (p) { return p.illness; });
    openModal({
      title: '🌤️ 你不在的这段时间',
      body: '<div class="warnbox">乐园一直在自己运转。你离开的 ' + fmtHM(report.minutes) +
        '，温室和孵化仓里发生了这些事：</div>' +
        '<ul style="font-size:13.5px;color:#5B7263;padding-left:20px">' +
        bits.map(function (b) { return '<li>' + b + '</li>'; }).join('') +
        '</ul>' +
        (expired.length ? '<div class="errbox" style="margin-top:12px">😷 有 ' + expired.length + ' 只小生物正病着：' +
          expired.map(function (p) { return esc(p.name); }).join('、') + '。去「我的乐园」用药水治好它们。</div>' : ''),
      foot: '<button class="btn btn-primary" id="of-ok">去看看</button>',
      onMount: function (mask) {
        $('#of-ok', mask).onclick = function () {
          closeModal();
          if (window.Store.state.pets.some(function (p) { return p.illness; })) switchTab('garden');
        };
      }
    });
  }

  function bindTabs() {
    $$('#tabs .tab').forEach(function (b) {
      b.onclick = function () { switchTab(b.dataset.tab); };
    });
  }
  /* 手机端标签栏是横向滚动的，切页时把当前标签滑到中间 */
  function centerTab(el) {
    const strip = $('#tabs');
    if (!strip || !el || !strip.scrollTo) return;
    const br = el.getBoundingClientRect(), sr = strip.getBoundingClientRect();
    const want = strip.scrollLeft + (br.left - sr.left) - (strip.clientWidth - br.width) / 2;
    strip.scrollTo({ left: Math.max(0, want), behavior: 'smooth' });
  }
  function switchTab(tab) {
    curTab = tab;
    $$('#tabs .tab').forEach(function (b) {
      const on = b.dataset.tab === tab;
      b.classList.toggle('active', on);
      if (on) centerTab(b);
    });
    renderView();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* =========================================================
   * 渲染
   * ========================================================= */
  function render() {
    renderTop();
    renderView();
  }

  function renderTop() {
    const left = window.Store.daysLeft();
    $('#chip-dday .chip-v').textContent = 'D-' + left;
    const info = window.Store.currentPhase();
    $('#chip-phase .chip-v').textContent = info.phase.name + ' D' + info.day;
    $('#chip-streak .chip-v').textContent = (S.stats.streak || 0) + ' 天';
    const checkinEl = $('#chip-checkin');
    if (checkinEl) checkinEl.classList.toggle('ready', canClaimDailyReward());
    const checkinV = $('#chip-checkin-v');
    if (checkinV) checkinV.textContent = canClaimDailyReward() ? '签到' : '已签';
    const svEl = $('#chip-save-v');
    if (svEl) svEl.textContent = '存档 ' + window.Store.saveMeta().count;
    $('#cur-tickets').textContent = S.cur.tickets;
    $('#cur-beans').textContent = Math.floor(S.cur.beans);
    const fqEl = $('#cur-freeq');
    if (fqEl) fqEl.textContent = S.cur.freeQuestions || 0;
    const lvEl = $('#cur-level');
    if (lvEl) {
      const lv = S.cur.level;
      const curExp = S.cur.exp;
      const nextExp = (D.LEVELS[lv] !== undefined) ? D.LEVELS[lv] : null;
      const prevExp = (D.LEVELS[lv - 1] !== undefined) ? D.LEVELS[lv - 1] : 0;
      lvEl.textContent = 'Lv.' + lv;
      const expEl = $('#cur-exp');
      if (expEl) expEl.textContent = (nextExp === null) ? 'MAX' : ((curExp - prevExp) + '/' + (nextExp - prevExp));
      const bar = $('#cur-exp-bar');
      if (bar) {
        const pct = (nextExp === null) ? 100 : Math.min(100, Math.round((curExp - prevExp) / (nextExp - prevExp) * 100));
        bar.style.width = pct + '%';
      }
    }

    const ts = window.Study.todayTaskStats();
    const dot = $('#dot-study');
    if (dot) dot.className = 'dot' + (ts.done < ts.total ? ' show' : '');
  }

  function renderView() {
    const v = $('#view');
    if (curTab === 'study') v.innerHTML = viewStudy();
    else if (curTab === 'garden') v.innerHTML = viewGarden();
    else if (curTab === 'gacha') v.innerHTML = viewGacha();
    else if (curTab === 'shop') v.innerHTML = viewShop();
    else if (curTab === 'ach') v.innerHTML = viewAch();
    else if (curTab === 'evidence') v.innerHTML = viewEvidence();
    else if (curTab === 'me') v.innerHTML = viewMe();
    else if (curTab === 'help') v.innerHTML = viewHelp();
    else if (curTab === 'docs') v.innerHTML = viewDocs();
    else if (curTab === 'notes') v.innerHTML = viewNotes();
    if (curTab === 'garden') { startPark(); wireWorld(); gardenSig = gardenSignature(); }
    else stopPark();
    if (curTab === 'study') studySig = studySignature();
    wireView();
    /* Lv.3 剧情：条件满足后自动开启一次，之后靠地图上的旗子 */
    if (curTab === 'garden' && !laborAutoShown && !activeMask() &&
        window.Game.pendingStory() === 'labor') {
      laborAutoShown = true;
      setTimeout(function () {
        if (curTab === 'garden' && !activeMask()) openStoryModal('labor');
      }, 600);
    }
  }

  /* 学习页内容指纹：任务状态。内容没变就不重绘，免得手机上正读着被刷一下。 */
  function studySignature() {
    try {
      return window.Study.ensureTodayTasks().map(function (t) {
        return t.uid + ':' + t.state;
      }).join('|');
    } catch (e) { return ''; }
  }

  /* 乐园页内容指纹：地图上看得见的东西（小生物落位与生病/休眠、掉落胶囊、
     工地进度、在岗人数、剧情旗子、保存舱开合）。内容没变就不重绘——
     地图是可拖动的，8 秒拆一次会造成"抖动 + 手指下的元素被抽走"。 */
  function gardenSignature() {
    try {
      const pets = S.pets.map(function (p) {
        return p.id + (p.stored ? '|s' : '') + (p.illness ? '|i' : '') + (p.dormant ? '|d' : '') +
          '|' + window.Game.stageOf(p).name;
      }).join(',');
      const caps = S.capsules.map(function (c) { return c.id + (c.place || 'x'); }).join(',');
      const b = S.build || {};
      const built = (b.built || []).join(',');
      const lv = Object.keys(b.lv || {}).map(function (k) { return k + b.lv[k]; }).join(',');
      const staff = Object.keys(b.staff || {}).map(function (k) { return k + (b.staff[k] || []).length; }).join(',');
      const story = Object.keys(b.story || {}).filter(function (k) { return b.story[k]; }).sort().join(',');
      return [pets, caps, built, lv, staff, story,
        podOpen ? 'p1' : 'p0',
        window.Game.pendingStory() || '',
        window.Game.buildGate().ok ? 'g1' : 'g0'].join('|');
    } catch (e) { return ''; }
  }

  /* ---------------- 学习页 ---------------- */
  /* 库伯学习圈做成真正的环形图：四个象限首尾相连、顺时针闭环 */
  function kolbRingSvg(kolb) {
    const cx = 140, cy = 140, R = 118, r = 64;
    function pt(ang, rad) {                 /* ang: 0=正上方，顺时针增大 */
      const a = (ang - 90) * Math.PI / 180;
      return [cx + rad * Math.cos(a), cy + rad * Math.sin(a)];
    }
    function fmt(p) { return Math.round(p[0]) + ',' + Math.round(p[1]); }
    const order = [
      { key: 'CE', a1: 0,   a2: 90  },
      { key: 'RO', a1: 90,  a2: 180 },
      { key: 'AC', a1: 180, a2: 270 },
      { key: 'AE', a1: 270, a2: 360 }
    ];
    let svg = '<svg viewBox="0 0 280 280" class="kolb-ring" role="img" aria-label="库伯学习圈">';
    order.forEach(function (s) {
      const k = kolbOf(s.key);
      const on = (kolb[s.key] || 0) > 0;
      const o1 = pt(s.a1, R), o2 = pt(s.a2, R), i2 = pt(s.a2, r), i1 = pt(s.a1, r);
      const d = 'M' + fmt(o1) + ' A' + R + ' ' + R + ' 0 0 1 ' + fmt(o2) +
                ' L' + fmt(i2) + ' A' + r + ' ' + r + ' 0 0 0 ' + fmt(i1) + ' Z';
      svg += '<path d="' + d + '" fill="' + (on ? k.color : '#E6ECE7') + '" ' +
             (on ? '' : 'opacity="0.6" ') + 'stroke="#fff" stroke-width="3"/>';
      const mid = (s.a1 + s.a2) / 2;
      const lp = pt(mid, (R + r) / 2);
      svg += '<text x="' + Math.round(lp[0]) + '" y="' + Math.round(lp[1] - 7) + '" text-anchor="middle" class="kr-emoji">' + k.emoji + '</text>';
      svg += '<text x="' + Math.round(lp[0]) + '" y="' + Math.round(lp[1] + 9) + '" text-anchor="middle" class="kr-name">' + k.name + '</text>';
      svg += '<text x="' + Math.round(lp[0]) + '" y="' + Math.round(lp[1] + 23) + '" text-anchor="middle" class="kr-count' + (on ? ' on' : '') + '">' +
             (on ? ('今日 ' + kolb[s.key] + ' 次') : '未做') + '</text>';
    });
    /* 四段箭头：沿环顺时针指向，连成闭环 */
    [90, 180, 270, 360].forEach(function (ang) {
      const rm = (R + r) / 2;
      const c = Math.cos((ang - 90) * Math.PI / 180), s = Math.sin((ang - 90) * Math.PI / 180);
      const px = cx + rm * c, py = cy + rm * s;
      const tx = -s, ty = c, nx = -ty, ny = tx;          /* 切线(顺时针) + 法线 */
      const tip = [px + tx * 13, py + ty * 13];
      const b1 = [px - tx * 4 + nx * 8, py - ty * 4 + ny * 8];
      const b2 = [px - tx * 4 - nx * 8, py - ty * 4 - ny * 8];
      svg += '<polygon points="' + fmt(tip) + ' ' + fmt(b1) + ' ' + fmt(b2) + '" fill="#3C8C5A"/>';
    });
    const lit = order.filter(function (s) { return (kolb[s.key] || 0) > 0; }).length;
    svg += '<text x="' + cx + '" y="' + (cy - 4) + '" text-anchor="middle" class="kr-center">库伯学习圈</text>';
    svg += '<text x="' + cx + '" y="' + (cy + 15) + '" text-anchor="middle" class="kr-center-num">' + lit + ' / 4 闭环</text>';
    svg += '</svg>';
    return svg;
  }

  function viewStudy() {
    const info = window.Store.currentPhase();
    const ts = window.Study.todayTaskStats();
    const kolb = window.Study.kolbProgress();

    let h = '';
    h += saveNagHtml();

    /* 阶段卡（Step 1 …）：置顶，放在「今日投喂单」上面，一眼看清今天处在哪个阶段 */
    h += '<div class="panel">';
    h += '<div class="panel-head"><h2>' + info.phase.tag + ' · ' + info.phase.name + '</h2>' +
      '<span class="hint">第 ' + info.day + ' 天 / 第 ' + info.dayInPhase + ' 天（本阶段共 ' + info.phase.days + ' 天）</span></div>';
    h += '<div style="font-size:13.5px;color:#5B7263">' + esc(info.phase.detail) + '</div>';
    h += '<div class="warnbox" style="margin:12px 0 0">🎯 ' + esc(info.phase.focus) + '</div>';
    h += '</div>';

    /* 顶部：今日投喂单 —— 7 个小格子，这是每天的主线。
       进度条只数这 7 件；碎片和加餐退到下面当辅助信息。 */
    h += '<div class="panel feed">';
    h += '<div class="feed-head">';
    h += '<div class="feed-num">' + ts.done + '<small>/ ' + ts.total + '</small></div>';
    h += '<div style="flex:1;min-width:0">' +
      '<div class="feed-title">🍽️ 今日投喂单</div>' +
      '<div class="hint" style="font-size:12px;color:#8AA394">' +
      (ts.full ? (ts.total + ' 样全喂满了，今天这只猫吃饱了') : '喂满这 ' + ts.total + ' 样，猫今天就不会饿') + '</div></div>';
    h += '<div class="feed-badge' + (ts.full ? ' on' : '') + '">' + (ts.full ? '✅ 喂饱' : ts.pct + '%') + '</div>';
    h += '</div>';

    h += '<div class="feed-slots">';
    ts.slots.forEach(function (s2) {
      h += '<div class="feed-slot' + (s2.done ? ' on' : '') + '">' +
        '<span class="fs-ico">' + (s2.done ? '✅' : s2.icon) + '</span>' +
        '<span class="fs-name">' + esc(s2.label) + '</span></div>';
    });
    h += '</div>';

    h += '<div class="bar bar-lg"><i style="width:' + ts.pct + '%;background:linear-gradient(90deg,#8FD3A8,#4CA96B)"></i></div>';

    h += '<div class="feed-sub">' +
      '<span>🍰 加餐 ' + ts.extraDone + ' / ' + ts.extraTotal + ' 件（做不做都行）</span>' +
      '</div>';

    h += '<div class="warnbox" style="margin-top:12px">✅ <b>做了就是做了。</b>没有计时器，也不攒碎片——做完登记一下，奖励马上发，今天的格子立刻亮一个。</div>';
    h += '</div>';

    /* 库伯四象限：真正的环形闭环图 */
    h += '<div style="margin-top:16px">';
    h += '<div style="font-size:13px;font-weight:700;color:#2E7A4C;margin-bottom:8px">🔄 库伯学习圈 · 今日闭环情况</div>';
    h += '<div class="kolb-wrap">' + kolbRingSvg(kolb) + '</div>';
    let legend = '<div class="kolb-legend">';
    D.KOLB.forEach(function (k) {
      const on = (kolb[k.key] || 0) > 0;
      legend += '<div class="kolb-leg' + (on ? ' on' : '') + '" style="border-color:' + (on ? k.color : '#E3ECE4') + '">' +
        '<span class="kl-dot" style="background:' + (on ? k.color : '#CDD8CF') + '">' + k.emoji + '</span>' +
        '<span class="kl-name" style="color:' + (on ? k.color : '#6B7E70') + '">' + k.name + '</span>' +
        '<span class="kl-desc">' + k.desc + '</span></div>';
    });
    legend += '</div>';
    h += legend;
    h += '<div class="kolb-arrow">具体经验 → 反思观察 → 抽象概念化 → 主动实验 →（回到新的经验）四格都亮 = +1 胶囊券 / +30 可可豆</div>';
    h += '</div>';
    h += '</div>';

    /* 投喂单：固定的那几件 */
    h += '<div class="panel">';
    h += '<div class="panel-head"><h2>🍽️ 投喂单</h2>' +
      '<span class="hint">每天就这几样，喂满就算今天没白过（每条都要过验证）</span>' +
      '<span class="spacer"></span>' +
      '<span class="tag ' + (ts.full ? 'tag-ok' : '') + '">' + ts.done + ' / ' + ts.total + '</span></div>';
    h += '<div class="task-list">';
    ts.core.forEach(function (t) { h += taskCard(t); });
    h += '</div></div>';

    /* 加餐：做不做都行 */
    h += '<div class="panel">';
    h += '<div class="panel-head"><h2>🍰 加餐</h2>' +
      '<span class="hint">课后练习、框架图、自测这些——有精力就加一口，不做也不扣分</span>' +
      '<span class="spacer"></span>' +
      '<span class="tag">' + ts.extraDone + ' / ' + ts.extraTotal + '</span>' +
      '<button class="btn btn-sm btn-ghost" data-act="task-new">＋ 自建任务</button></div>';
    h += '<div class="task-list">';
    ts.extra.forEach(function (t) { h += taskCard(t); });
    h += '</div></div>';

    /* 练习台：面试问答 + 导游词，点进去随时练 */
    const phInfo = window.Store.currentPhase();
    const scriptModeText = phInfo.day < D.PRACTICE.RECITE_START_DAY
      ? '前 12 天：每天通读 1 篇'
      : '第 13 天起：每天默讲 1 篇';
    h += '<div class="panel practice-card-panel">';
    h += '<div class="panel-head"><h2>📚 练习台</h2><span class="hint">综合问答、导游词，点进去随时练</span></div>';
    h += '<div class="practice-card" data-act="practice-open">' +
      '<div class="practice-card-main">' +
      '<div class="practice-card-title">🗣️ 综合问答</div>' +
      '<div class="practice-card-meta">交一个凭证即完成</div>' +
      '</div>' +
      '<div class="practice-card-main">' +
      '<div class="practice-card-title">🎤 导游词</div>' +
      '<div class="practice-card-meta">' + scriptModeText + '</div>' +
      '</div>' +
      '<button class="btn btn-primary" data-act="practice-open">📚 开始练习</button>' +
      '</div>';
    h += '</div>';

    return h;
  }

  function taskCard(t) {
    const k = kolbOf(t.kolb);
    const done = t.state === 'done';
    const v = t.verify;
    const isUser = !!(t.libId && t.libId.indexOf('user_') === 0);
    let verifyTag = '';
    if (v.type === 'note') verifyTag = '📝 写一段今日收获';
    else if (v.type === 'quiz') verifyTag = v.needScore ? '✍️ 登记题量 / 正确率' : ('✍️ 刷题累计满 ' + v.minQuestions + ' 道（可分批交）');
    else     if (v.type === 'record') verifyTag = '🎙️ 录音 ≥' + v.minMinutes + ' 分钟（可分段）';
    else if (v.type === 'opinion') verifyTag = '📸 截图 + 💬 看法（看法可录一段音）';
    else if (v.type === 'feynman') verifyTag = '🗣️ 费曼卡 ×' + (v.minCards || 1);
    else if (v.type === 'reading') verifyTag = '📖 登记：读哪本 + 读了什么';
    else if (v.type === 'practice') verifyTag = '📚 去练习台完成';

    let needTag = [];
    if (t.need && t.need.photo) needTag.push('📸 凭证截图');
    if (t.need && t.need.feynman) needTag.push('🗣️ 费曼卡 ×' + t.need.feynman);
    /* 所有走提交弹窗的任务都需至少提交一样凭证（图片/文件/录音）；自带截图或录音的任务已在其专属标签里体现 */
    const needsUniversalEvidence = v.type !== 'practice' && !((t.need && t.need.photo) || v.type === 'record');
    if (needsUniversalEvidence) needTag.push('📎 凭证必交');
    if (v.type === 'reading') needTag.push('📎 笔记 / 照片选填');
    else if (t.pick === 'book' && t.ctx && t.ctx.bookName) needTag.push('📚 归属：《' + esc(t.ctx.bookName) + '》');

    let sc = null;
    if (t.ctx && t.ctx.scriptId) sc = D.SCRIPTS.filter(function (x) { return x.id === t.ctx.scriptId; })[0];

    /* 按验证类型给入口按钮 */
    let side = '';
    if (!done) {
      const label = v.type === 'reading' ? '📖 去精读'
        : (v.type === 'record' ? '🎙️ 去录音'
        : (v.type === 'opinion' ? '📸 去凭证'
        : (v.type === 'quiz' ? '✍️ 去登记'
        : (v.type === 'note' ? '📝 去记录'
        : (v.type === 'practice' ? '📚 去练习'
        : '去完成')))));
      side = '<button class="btn btn-primary btn-sm" data-act="task-verify" data-uid="' + t.uid + '">' + label + '</button>';
    }

    return '<div class="task' + (done ? ' done' : '') + (t.core ? ' core' : ' extra') + '">' +
      '<div class="task-ico">' + t.icon + '</div>' +
      '<div class="task-main">' +
        '<div class="t-head"><span class="t-title">' + esc(t.title) + '</span>' +
          (t.core
            ? '<span class="tag tag-core">🍽️ 投喂单</span>'
            : '<span class="tag tag-extra">🍰 加餐</span>') +
          (isUser ? '<span class="tag">🧩 自建</span>' : '') +
        '</div>' +
        '<div class="t-body">' + esc(t.desc) + '</div>' +
        (sc ? '<div class="script-flow">' + sc.nodes.map(function (n) { return '<span>' + esc(n) + '</span>'; }).join('') + '</div>' : '') +
        '<div class="t-meta">' +
          '<span class="tag tag-kolb" style="background:' + k.color + '">' + k.emoji + ' ' + k.name + '</span>' +
          '<span class="tag tag-verify">' + verifyTag + '</span>' +
          needTag.map(function (x) { return '<span class="tag">' + x + '</span>'; }).join('') +
          '<span class="tag tag-reward">🎟️ +' + t.reward.tickets + '　🌰 +' + t.reward.beans + '</span>' +
        '</div>' +
      '</div>' +
      '<div class="task-side">' +
        (done
          ? '<button class="btn btn-ghost btn-sm" data-act="task-log" data-uid="' + t.uid + '">查看凭证</button>' +
            '<div style="font-size:11px;color:#4CA96B;text-align:center;font-weight:600">✓ 已结算</div>'
          : side + '<div style="font-size:10.5px;color:#8AA394;text-align:center">需通过验证</div>'
        ) +
        (isUser ? '<button class="btn btn-ghost btn-sm" data-act="task-del" data-tpl="' + esc(t.tplId || '') + '" title="删掉这条自建任务">🗑 删除</button>' : '') +
      '</div>' +
    '</div>';
  }

  /* =========================================================
   * 乐园页（游戏主场景）
   * 上面两排：温室 / 孵化室 —— 正在孵化的胶囊住在托位里
   * 下面空场：小动物自由遛弯；小植物 / 小真菌在花盆圈；藻类在池塘
   * 点小生物看状态；不舒服会冒会话气泡
   * ========================================================= */

  function parkPosMap() { return (window.__parkPos = window.__parkPos || {}); }

  /* 不舒服气泡：生病 > 休眠 > 最缺的那项状态；都好好的就不冒泡 */
  function needBubbleOf(p) {
    if (p.illness) return { icon: '😷', text: p.illness.name, cls: 'bad' };
    if (p.dormant) return { icon: '😴', text: '休眠中', cls: 'zzz' };
    const sp = window.Game.speciesById(p.speciesId);
    const animal = sp.kind === 'animal';
    const names = animal
      ? { water: '口渴', nutri: '肚子饿', clean: '身上脏', fun: '无聊' }
      : { water: '缺水', nutri: '缺肥', clean: '生虫', fun: '闷了' };
    const icons = animal
      ? { water: '💧', nutri: '🍖', clean: '🧼', fun: '🎈' }
      : { water: '💧', nutri: '🌰', clean: '🐛', fun: '🎈' };
    let worst = null;
    ['water', 'nutri', 'clean', 'fun'].forEach(function (k) {
      const v = p.stats[k];
      if (v < 45 && (!worst || v < worst.v)) worst = { k: k, v: v };
    });
    if (!worst) return null;
    return { icon: icons[worst.k], text: names[worst.k], cls: worst.v < 20 ? 'bad' : 'warn' };
  }

  /* 物种立绘：新物种用图片，老物种兜底 emoji */
  function spArt(sp, cls) {
    if (sp.img) return '<img class="' + cls + ' pp-img" src="' + sp.img + '" alt="" draggable="false">';
    return '<span class="' + cls + '">' + sp.emoji + '</span>';
  }

  /* 干净的花盆贴图（无植物）：植物立绘叠在上面 = "种在花盆里" */
  function potSvg() {
    return '<svg class="pot-svg" viewBox="0 0 48 48" aria-hidden="true">' +
      '<path d="M9 17 L39 17 L34 41 Q24 46 14 41 Z" fill="#D9824A"/>' +
      '<path d="M14 41 Q24 46 34 41 L33 37 Q24 40 15 37 Z" fill="#B5612F"/>' +
      '<rect x="7" y="12" width="34" height="7" rx="3.5" fill="#EBA468"/>' +
      '<rect x="7" y="12" width="34" height="3" rx="1.5" fill="#F4C089"/>' +
      '<path d="M12 18 L36 18 L33 30 L15 30 Z" fill="#E0925A" opacity=".45"/>' +
      '</svg>';
  }

  function petFaceHtml(p) {
    const sp = window.Game.speciesById(p.speciesId);
    const mood = window.Game.moodOf(p);
    const b = needBubbleOf(p);
    const happy = !b && mood.emoji === '😊';
    return '<span class="pp-bubble ' + (b ? b.cls : 'hide') + '">' +
        (b ? b.icon + ' <i>' + esc(b.text) + '</i>' : '…') + '</span>' +
      '<span class="pp-body">' + spArt(sp, 'pp-emoji') + '</span>' +
      (happy ? '<span class="pp-happy">💗</span>' : '') +
      '<span class="pp-shadow"></span>';
  }

  /* 有些老物种没有立绘、走 emoji 兜底；emoji 字形框自带上下留白，
     投影得单独抬高一截，否则看着就像悬在半空。这里给容器打个标记。 */
  function artKindCls(sp) { return sp.img ? '' : ' pet-emoji'; }

  function pottedPetHtml(p, zoneId) {
    const sp = window.Game.speciesById(p.speciesId);
    /* 苗圃（nursery）是沃土地：植物直接种地里，不套花盆；温室窗口里才用盆 */
    const inBed = zoneId === 'nursery';
    return '<div class="park-pet potted' + (inBed ? ' no-pot' : '') + (p.illness ? ' sick' : '') + (p.dormant ? ' dormant' : '') + artKindCls(sp) +
      '" data-act="pet-open" data-id="' + p.id + '">' +
      petFaceHtml(p) + (inBed ? '' : '<span class="pp-pot">' + potSvg() + '</span>') + '</div>';
  }

  function pondPetHtml(p) {
    const sp = window.Game.speciesById(p.speciesId);
    return '<div class="park-pet pond-pet' + (p.illness ? ' sick' : '') + artKindCls(sp) +
      '" data-act="pet-open" data-id="' + p.id + '">' +
      petFaceHtml(p) + '</div>';
  }

  function walkerPetHtml(p) {
    const sp = window.Game.speciesById(p.speciesId);
    return '<div class="park-pet walker' + (p.illness ? ' sick' : '') + (p.dormant ? ' dormant' : '') + artKindCls(sp) +
      '" data-act="pet-open" data-id="' + p.id + '" data-pet="' + p.id + '">' +
      petFaceHtml(p) + '</div>';
  }

  /* 场景排：温室 / 孵化室（只放正在孵化的胶囊 + 空托位） */
  function parkRow(kind, ico, name, sub) {
    const caps = S.capsules.filter(function (c) { return c.place === kind; });
    const cap = S.slots[kind] || 0;
    let h = '<div class="park-row park-row-' + kind + '">';
    h += '<div class="prow-head"><span class="prow-ico">' + ico + '</span><b>' + name + '</b>' +
      '<span class="prow-sub">' + sub + '</span>' +
      '<span class="spacer"></span>' +
      '<span class="slot-badge">🥚 ' + caps.length + ' / ' + cap + '</span>' +
      '<button class="btn btn-sm prow-add" data-act="expand" data-kind="' + kind + '" title="扩一个孵化位（🌰 120）">➕</button></div>';
    h += '<div class="prow-slots">';
    const n = Math.max(cap, caps.length);
    for (let i = 0; i < n; i++) {
      const c = caps[i];
      h += '<div class="hatch-slot' + (c ? ' filled' : '') + '">';
      if (c) {
        const sp = window.Game.speciesById(c.speciesId);
        const prog = Math.min(1, (Date.now() - c.hatchStart) / (c.hatchMinutes * 60000));
        const ready = prog >= 1;
        h += '<button class="hatch-pod' + (ready ? ' ready' : '') + '" data-act="cap-open" data-id="' + c.id + '" title="' + esc(sp.name) + '">' +
          spArt(sp, 'hp-emoji') +
          '<span class="hp-bar"><i style="width:' + Math.round(prog * 100) + '%"></i></span>' +
          (ready ? '<span class="hp-tag">✨破壳</span>' : '') +
          '</button>';
      } else {
        h += '<span class="slot-empty">＋</span>';
      }
      h += '</div>';
    }
    h += '</div></div>';
    return h;
  }

  /* ---------------- 保存舱面板（可折叠） ---------------- */
  function podPanel() {
    const stored = S.pets.filter(function (p) { return p.stored; });
    let h = '<div class="panel pod-panel' + (podOpen ? ' open' : '') + '">';
    h += '<div class="panel-head pod-head" data-act="pod-toggle">' +
      '<h2>📦 保存舱</h2>' +
      '<span class="hint">成年体仓库 · 状态静止</span>' +
      '<span class="spacer"></span>' +
      '<span class="pod-count">' + stored.length + ' 只</span>' +
      '<span class="pod-caret">' + (podOpen ? '▾' : '▸') + '</span></div>';
    if (podOpen) {
      if (!stored.length) {
        h += '<div class="empty">保存舱空着。成熟的成年体（「成熟 / 圆满」）可以从它的状态面板放进这里——状态会完全静止、不再消耗道具。需要它时再「取出」回到场地。</div>';
      } else {
        h += '<div class="pet-list">';
        stored.forEach(function (p) {
          const sp = window.Game.speciesById(p.speciesId);
          const st = window.Game.stageOf(p);
          h += '<div class="pet-card pod-card">' +
            '<div class="pc-face' + (sp.img ? '' : ' pet-emoji') + '">' + (sp.img ? '<img class="pc-img" src="' + sp.img + '" alt="">' : sp.emoji) + '</div>' +
            '<div class="pc-body" data-act="pet-open" data-id="' + p.id + '">' +
              '<div class="pc-name">' + esc(p.name) + '</div>' +
              '<div class="pc-sub">' + esc(sp.name) + ' · ' + st.emoji + ' ' + st.name + ' · 📦 静止中</div></div>' +
            '<button class="btn btn-sm btn-primary pod-take" data-act="unstore-pet" data-id="' + p.id + '">取出</button>' +
            '</div>';
        });
        h += '</div>';
      }
    }
    h += '</div>';
    return h;
  }

  /* =========================================================
   * v1.18 大世界地图（可拖动）+ 建筑系统
   * 底图只有地形；区域槽位、机器、建筑都是浮在上面的立绘
   * ========================================================= */
  function zoneTagHtml(z, count) {
    if (!z) return '';
    return '<span class="wzone-tag wzone-tag-' + z.id + '">' + z.emoji + ' ' + z.name +
      (z.roam ? '' : ' <i>' + count + '/' + z.cap + '</i>') + '</span>';
  }

  function worldMapHtml() {
    const nb = window.Game.nextBuilding();
    const meadow = window.Game.zoneById('meadow');
    const r = (meadow && meadow.rect) || [44, 22, 30, 18];
    let h = '<div class="world-viewport" id="world-vp">';
    h += '<div class="world-map" id="world-map">';
    h += '<img class="world-img" src="' + D.WORLD.img + '" alt="乐园地图" draggable="false">';

    /* 固定槽位的区域：苗圃 / 池塘；enter 型（温室）只画热区，点了开窗进去 */
    D.ZONES.forEach(function (z) {
      if (z.roam) return;
      const pets = window.Game.petsInZone(z.id);
      h += '<div class="wzone wzone-' + z.id + '">';
      if (z.enter) {
        const d = z.door || { x: 50, y: 50, w: 16 };
        h += '<button class="wzone-enter" data-act="z-enter" data-id="' + z.id + '" style="left:' + d.x + '%;top:' + d.y + '%;width:' + d.w + '%" title="' + esc(z.name) + ' · 点我进去">' +
          '<span class="wze-tag">' + z.emoji + ' ' + esc(z.name) + ' ' + pets.length + '/' + z.cap + ' · 点我进去</span></button>';
        h += '</div>';
        return;
      }
      z.slots.forEach(function (pos, i) {
        const p = pets[i];
        h += '<div class="wslot' + (p ? ' filled' : '') + '" style="left:' + pos[0] + '%;top:' + pos[1] + '%">' +
          (p ? (z.id === 'pond' ? pondPetHtml(p) : pottedPetHtml(p, z.id)) : '<span class="wslot-dot"></span>') +
          '</div>';
      });
      h += zoneTagHtml(z, pets.length);
      h += '</div>';
    });

    /* 草地：动物自由遛弯 */
    const roamPets = window.Game.petsInZone('meadow');
    h += '<div class="wzone wzone-meadow" id="wzone-meadow" style="left:' + r[0] + '%;top:' + r[1] +
      '%;width:' + r[2] + '%;height:' + r[3] + '%">';
    roamPets.forEach(function (p) { h += walkerPetHtml(p); });
    h += zoneTagHtml(meadow, roamPets.length);
    h += '</div>';

    /* 三台机器：点击开窗 */
    D.MACHINES.forEach(function (m) {
      h += '<button class="wmachine" data-act="' + m.act + '" style="left:' + m.x + '%;top:' + m.y +
        '%;width:' + m.w + '%" title="' + esc(m.name) + '">' +
        '<img src="' + m.img + '" alt="' + esc(m.name) + '" draggable="false"></button>';
    });

    /* 建筑：已建成 / 下一块空地 / 还没轮到 */
    D.BUILDINGS.forEach(function (b) {
      const built = window.Game.isBuilt(b.id);
      if (built) {
        h += '<button class="wbuilding built" data-act="build-open" data-id="' + b.id +
          '" style="left:' + b.x + '%;top:' + b.y + '%;width:' + b.w + '%" title="' + esc(b.name) + '">' +
          '<img src="' + b.img + '" alt="' + esc(b.name) + '" draggable="false">' +
          '<span class="wb-name">' + b.emoji + ' ' + b.name + ' Lv.' + window.Game.buildLv(b.id) + '</span></button>';
      } else if (nb && nb.id === b.id) {
        h += '<button class="wbuilding plot" data-act="build-open" data-id="' + b.id +
          '" style="left:' + b.x + '%;top:' + b.y + '%;width:' + b.w + '%" title="在这里盖' + esc(b.name) + '">' +
          '<span class="wb-plus">＋</span><span class="wb-name">盖 ' + b.name + '</span></button>';
      } else {
        h += '<span class="wbuilding plot locked" style="left:' + b.x + '%;top:' + b.y + '%;width:' + b.w + '%">' +
          '<span class="wb-lock">🔒</span><span class="wb-name">' + b.name + '</span></span>';
      }
    });

    h += '</div>';

    /* 有话想说的旗子：挂在【视口】上而不是地图上——地图能横向拖，
       旗子要是跟着地图跑，拖到另一边就看不见了，容易漏掉剧情。 */
    if (window.Game.pendingStory()) {
      h += '<button class="wstory-flag" data-act="story-play">💬 有话想跟你说</button>';
    }
    h += '<span class="world-pan-hint">👈 按住拖动，看全整个乐园 👉</span>';
    h += '</div>';
    return h;
  }

  /* 地图按视口高度定标：横向比视口宽，左右可拖 */
  function layoutWorld() {
    const vp = $('#world-vp'), map = $('#world-map');
    if (!vp || !map) return null;
    const vw = vp.clientWidth || 320;
    const vh = vp.clientHeight || Math.round(vw * 4 / 3);
    const mw = Math.round(vh * (D.WORLD.w / D.WORLD.h));
    map.style.width = mw + 'px';
    map.style.height = vh + 'px';
    return { vw: vw, vh: vh, mw: mw };
  }
  function clampPan(lay) {
    const minX = Math.min(0, lay.vw - lay.mw);
    wp.x = Math.max(minX, Math.min(0, wp.x));
    wp.y = 0;
  }
  /* instant=true：刚落位/刚重绘时直接摆好，别让 .2s 过渡把它从错误位置滑过来 */
  function applyPan(instant) {
    const map = $('#world-map');
    if (!map) return;
    const tf = 'translate3d(' + Math.round(wp.x) + 'px,0,0)';
    if (instant) {
      map.style.transition = 'none';
      map.style.transform = tf;
      requestAnimationFrame(function () {
        if (map.style) map.style.transition = '';
      });
    } else {
      map.style.transform = tf;
    }
  }
  function wireWorld() {
    const vp = $('#world-vp');
    if (!vp) return;
    const lay = layoutWorld();
    if (!lay) return;
    if (!wpInit) {
      /* 第一次进来：把视线落在温室 + 草地这一片 */
      wp.x = -(lay.mw - lay.vw) * 0.42;
      wpInit = true;
    }
    clampPan(lay);
    applyPan(true);

    let drag = null;
    vp.onpointerdown = function (e) {
      /* 从任何地方都能按住拖（包括按在小生物 / 建筑上）；
         拖过 8px 之后落下的那次 click 会被下面的捕获监听吞掉，所以不会误点。 */
      drag = { x: e.clientX, y: e.clientY, ox: wp.x, moved: 0, claimed: false, id: e.pointerId };
    };
    vp.onpointermove = function (e) {
      if (!drag) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (!drag.claimed) {
        if (Math.abs(dx) < 6) return;
        /* 竖向手势让给页面滚动，横向才接管 */
        if (Math.abs(dy) > Math.abs(dx) + 4) { drag = null; return; }
        drag.claimed = true;
        vp.classList.add('dragging');
        try { vp.setPointerCapture(e.pointerId); } catch (er) {}
      }
      drag.moved = Math.max(drag.moved, Math.abs(dx));
      wp.x = drag.ox + dx;
      clampPan(lay);
      applyPan();
    };
    function endDrag() {
      if (!drag) return;
      const moved = drag.moved;
      drag = null;
      vp.classList.remove('dragging');
      if (moved > 8) {
        vp.dataset.dragged = '1';
        setTimeout(function () { if (vp.dataset) delete vp.dataset.dragged; }, 80);
      }
    }
    vp.onpointerup = endDrag;
    vp.onpointercancel = endDrag;
    /* 拖动结束后落下的那次 click 要拦掉，免得误点小生物（捕获阶段先于子元素） */
    vp.addEventListener('click', function (e) {
      if (vp.dataset.dragged === '1') { e.stopPropagation(); e.preventDefault(); }
    }, true);
  }

  function viewGarden() {
    window.Game.ensureBuild();
    const loose = S.capsules.filter(function (c) { return !c.place; });
    let h = '';
    h += '<div class="world-wrap">';
    h += worldMapHtml();
    h += '<div class="park-tip">👆 点小生物照顾它 · 点建筑和机器进去看看 · 地图上按住左右拖</div>';
    h += '<button class="sync-banner" data-act="sync">📲 换设备玩？点这里把进度搬过去（跨设备同步）</button>';
    h += saveNagHtml();
    h += '</div>';

    h += sitePanel();
    h += podPanel();

    h += '<div class="panel">';
    h += '<div class="panel-head"><h2>🥚 待安置的胶囊</h2>' +
      '<span class="hint">点「孵化仓」放进去孵化</span></div>';
    if (!loose.length) {
      h += '<div class="empty">没有待安置的胶囊。去扭蛋机抽一颗吧。</div>';
    } else {
      h += '<div class="pet-list">';
      loose.forEach(function (c) { h += capsuleCard(c); });
      h += '</div>';
    }
    h += '</div>';
    return h;
  }

  /* ---- 工地面板：进度 + 已建成的入口 ---- */
  function sitePanel() {
    const gate = window.Game.buildGate();
    const nb = window.Game.nextBuilding();
    const sawStory = window.Game.storySeen('labor');
    const built = (D.BUILDINGS || []).filter(function (b) { return window.Game.isBuilt(b.id); });
    let h = '<div class="panel" id="site-panel">';
    h += '<div class="panel-head"><h2>🏗️ 乐园工地</h2><span class="hint">动物出劳力 · 植物出材料 · 真菌出胶合料</span></div>';
    h += '<div class="site-dots">';
    (D.BUILDINGS || []).forEach(function (b) {
      const ok = window.Game.isBuilt(b.id);
      const isNext = nb && nb.id === b.id;
      h += '<span class="site-dot' + (ok ? ' ok' : (isNext ? ' next' : '')) + '" title="' + esc(b.name) + '">' +
        (ok ? b.emoji : (isNext ? '＋' : '🔒')) + '</span>';
    });
    h += '</div>';

    if (nb) {
      const canDo = gate.ok && sawStory;
      h += '<div class="site-next">';
      h += '<div class="sn-info"><b>' + nb.emoji + ' ' + nb.name + '</b><span>' + esc(nb.desc) + '</span></div>';
      h += '<button class="btn ' + (canDo ? 'btn-primary' : '') + '" data-act="build-open" data-id="' + nb.id + '">' +
        (canDo ? '🔨 开工' : (sawStory ? '条件未满' : '先去聊聊')) + '</button>';
      if (!sawStory) h += '<div class="site-why">先把 Lv.3 的那段对话看完——最年长的小动物有话要讲。</div>';
      else if (!gate.ok) h += '<div class="site-why">' + esc(gate.msg) + '</div>';
      h += '</div>';
    } else {
      h += '<div class="empty">五栋都盖起来了 —— 这一小片草地，成了个自给自足的小社会。</div>';
    }

    if (built.length) {
      h += '<div class="site-built">';
      built.forEach(function (b) {
        const staff = window.Game.staffOf(b.id);
        h += '<button class="sbt" data-act="build-open" data-id="' + b.id + '">' +
          '<span class="sbt-ico">' + b.emoji + '</span>' +
          '<span class="sbt-name">' + b.name + '</span>' +
          '<span class="sbt-lv">Lv.' + window.Game.buildLv(b.id) + '</span>' +
          '<span class="sbt-staff">👥 ' + staff.length + '/' + window.Game.staffCap(b.id) + '</span></button>';
      });
      h += '</div>';
    }
    h += '</div>';
    return h;
  }

  /* ---- 乐园运行时：小动物在草地上遛弯（4.6 秒换目标点） ---- */
  let parkTimer = null;
  function stopPark() { if (parkTimer) { clearInterval(parkTimer); parkTimer = null; } }
  function startPark() {
    stopPark();
    const zone = document.getElementById('wzone-meadow');
    if (!zone) return;
    $$('#wzone-meadow .walker').forEach(function (el) {
      const id = el.dataset.pet;
      const map = parkPosMap();
      if (!map[id]) map[id] = { x: 10 + Math.random() * 74, y: 20 + Math.random() * 58 };
      el.style.left = map[id].x + '%';
      el.style.top = map[id].y + '%';
    });
    parkTimer = setInterval(parkTick, 4600);
  }
  function parkTick() {
    const zone = document.getElementById('wzone-meadow');
    if (!zone) { stopPark(); return; }
    $$('#wzone-meadow .walker').forEach(function (el) {
      const id = el.dataset.pet;
      const pos = parkPosMap()[id];
      if (!pos) return;
      pos.x = Math.max(8, Math.min(92, pos.x + (Math.random() * 40 - 20)));
      pos.y = Math.max(14, Math.min(86, pos.y + (Math.random() * 26 - 13)));
      el.style.left = pos.x + '%';
      el.style.top = pos.y + '%';
      if (Math.random() < 0.5) el.classList.toggle('flip');
    });
  }

  /* =========================================================
   * 剧情（文字冒险） / 机器弹窗 / 建筑弹窗
   * ========================================================= */
  let bxPaint = null;   /* 修建弹窗的重绘函数 */

  /* 弹窗里的按钮不归 wireView 管，得自己接 */
  function wireModal(m) {
    $$('[data-act]', m).forEach(function (el) {
      if (el.tagName === 'SELECT') el.onchange = function () { onAction(el.dataset.act, el); };
      else el.onclick = function () { onAction(el.dataset.act, el); };
    });
  }

  /* 说话的人：pet 用剧情的 caster；若传了 name（比如 Lv.3 由「最年长的那只」开口），
     就用它自己的名字，读起来才像同伴在跟你说话。 */
  function storyCaster(who, st, name) {
    if (who === 'narr') return { name: '', ico: '🎬', cls: 'narr' };
    if (who === 'me') return { name: '你', ico: '🧑', cls: 'me' };
    return { name: name || st.caster || '小生物', ico: '🐾', cls: 'pet' };
  }

  function openStoryModal(key) {
    const st = D.STORY && D.STORY[key];
    if (!st) return;
    /* Lv.3 那段是"最年长的那只"发起：用它的真名，并把正文里的 {pet} 换掉 */
    let elder = null;
    if (key === 'labor') elder = window.Game.oldestAdult();
    const elderName = elder ? (elder.name || '小生物') : '';
    const say = function (t) { return elderName ? String(t).replace(/\{pet\}/g, elderName) : t; };
    let i = 0;
    openModal({
      title: '💬 ' + st.title,
      body: '<div class="story-box" id="story-box" tabindex="0"></div>',
      foot: '<button class="btn btn-ghost" data-act="story-skip">跳过</button>' +
        '<button class="btn btn-primary" data-act="story-next">继续 ▶</button>',
      onMount: function (m) {
        const box = $('#story-box', m);
        let finished = false;
        function paint() {
          box.innerHTML = st.lines.slice(0, i + 1).map(function (ln, idx) {
            const c = storyCaster(ln.who, st, elderName);
            return '<div class="story-line ' + c.cls + (idx === i ? ' now' : '') + '">' +
              (c.name ? '<span class="sl-who">' + c.ico + ' ' + esc(c.name) + '</span>' : '') +
              '<p>' + esc(say(ln.text)) + '</p></div>';
          }).join('');
          requestAnimationFrame(function () { box.scrollTop = box.scrollHeight; });
        }
        function finish() {
          if (finished) return;
          finished = true;
          window.Game.markStory(key);
          closeModal();
          toast('✅ ' + st.after, 'ok', 7000);
          render();
          /* 建筑剧情看完 → 顺手把开工面板递上来 */
          const b = (D.BUILDINGS || []).filter(function (x) { return x.story === key; })[0];
          if (b && !window.Game.isBuilt(b.id)) {
            setTimeout(function () {
              if (curTab === 'garden' && !activeMask()) openBuildingModal(b.id, true);
            }, 550);
          }
        }
        $$('[data-act]', m).forEach(function (el) {
          el.onclick = function () {
            if (el.dataset.act === 'story-skip') { i = st.lines.length - 1; return finish(); }
            if (i >= st.lines.length - 1) return finish();
            i++;
            paint();
          };
        });
        paint();
      }
    });
  }

  /* ---- 区域窗口（进入型区域：温室。玻璃房只是外观，里面在这看） ---- */
  function openZoneModal(zid) {
    const z = window.Game.zoneById(zid);
    if (!z) return;
    const pets = window.Game.petsInZone(zid);
    let h = '<div class="bx-lv">' + z.emoji + ' ' + esc(z.tip || '') + ' · ' + pets.length + '/' + z.cap + '</div>';
    h += '<div class="zone-grid">';
    const n = Math.max(z.cap, pets.length);
    for (let i = 0; i < n; i++) {
      const p = pets[i];
      h += '<div class="zone-cell' + (p ? ' filled' : '') + '">' +
        (p ? pottedPetHtml(p, zid) : '<span class="wslot-dot"></span>') + '</div>';
    }
    h += '</div>';
    openModal({
      title: z.emoji + ' ' + z.name,
      body: h,
      foot: '<button class="btn btn-ghost" data-act="m-close">关上门出去</button>',
      onMount: wireModal
    });
  }

  /* ---- 机器弹窗 ---- */
  function openMachineModal(id) {
    if (id === 'gacha') {
      const c1 = D.GACHA.costPerPull, c10 = D.GACHA.costTenPull;
      openModal({
        title: '🎰 扭蛋机',
        body: '<div class="bx-desc">投胶囊券，扭出一颗新的生命胶囊。</div>' +
          '<div class="bx-lv">🎟️ 现有胶囊券 ' + S.cur.tickets + ' 张　·　保底还差 ' +
          Math.max(0, D.GACHA.pity + 1 - (S.pity || 0)) + ' 次</div>',
        foot: '<button class="btn btn-ghost" data-act="m-close">关闭</button>' +
          '<button class="btn" data-act="pull" data-n="1">抽 1 次（🎟️ ' + c1 + '）</button>' +
          '<button class="btn btn-gold" data-act="pull" data-n="10">十连（🎟️ ' + c10 + '）</button>',
        onMount: wireModal
      });
      return;
    }
    if (id === 'incubator') {
      openModal({
        title: '🥚 孵化仓',
        wide: true,
        body: parkRow('greenhouse', '🏡', '温室托位', '植物 · 真菌 · 藻类在这儿孵化') +
          parkRow('hatchery', '🐣', '动物托位', '小动物在这儿破壳'),
        foot: '<button class="btn btn-ghost" data-act="m-close">关闭</button>',
        onMount: wireModal
      });
      return;
    }
    /* 保管室：保存舱 + 旅行收藏品 */
    const stored = S.pets.filter(function (p) { return p.stored; });
    const cols = window.Game.collectionsOwned();
    let h = '<div class="bx-lv">📦 保存舱 ' + stored.length + ' 只　·　🧭 收藏品 ' +
      cols.length + '/' + (D.COLLECTIONS || []).length + '</div>';
    if (stored.length) {
      h += '<div class="pet-list">';
      stored.forEach(function (p) {
        const sp = window.Game.speciesById(p.speciesId);
        const st = window.Game.stageOf(p);
        h += '<div class="pet-card pod-card">' +
          '<div class="pc-face' + (sp.img ? '' : ' pet-emoji') + '">' +
          (sp.img ? '<img class="pc-img" src="' + sp.img + '" alt="">' : sp.emoji) + '</div>' +
          '<div class="pc-body" data-act="pet-open" data-id="' + p.id + '">' +
          '<div class="pc-name">' + esc(p.name) + '</div>' +
          '<div class="pc-sub">' + esc(sp.name) + ' · ' + st.emoji + ' ' + st.name + ' · 📦 静止中</div></div>' +
          '<button class="btn btn-sm btn-primary pod-take" data-act="unstore-pet" data-id="' + p.id + '">取出</button>' +
          '</div>';
      });
      h += '</div>';
    } else {
      h += '<div class="empty">保存舱空着。成年体可以从它的状态面板放进这里，状态完全静止。</div>';
    }
    h += '<div class="panel-head" style="margin-top:16px"><h2>🧭 旅行收藏品</h2>' +
      '<span class="hint">建好旅行社，让导游带回来</span></div>' + colGridHtml(cols);
    openModal({
      title: '📦 保管室', body: h,
      foot: '<button class="btn btn-ghost" data-act="m-close">关闭</button>',
      onMount: wireModal
    });
  }

  function colGridHtml(cols) {
    const own = {};
    (cols || []).forEach(function (c) { own[c.id] = c; });
    let h = '<div class="col-grid">';
    (D.COLLECTIONS || []).forEach(function (c) {
      const got = own[c.id];
      h += '<div class="col-card r' + c.rarity + (got ? '' : ' miss') + '" title="' + esc(c.from) + '">' +
        '<span class="col-ico">' + (got ? c.emoji : '❔') + '</span>' +
        '<span class="col-name">' + (got ? esc(c.name) : '未收集') + '</span>' +
        '<span class="col-meta">' + (got ? '×' + got.n + ' · ' + esc(c.from) : '· · ·') + '</span></div>';
    });
    h += '</div>';
    return h;
  }

  /* ---- 建筑：修建面板 / 工作面板 ---- */
  function buildBodyHtml(id, b) {
    const cost = window.Game.buildCost(id);
    const gate = window.Game.buildGate();
    const up = cost.upgrade;
    let h = '<div class="bx-desc">' + esc(b.desc) + '</div>';
    h += '<div class="bx-cost">🧾 ' + (up ? '扩建到 Lv.' + (window.Game.buildLv(id) + 1) : '破土动工') +
      '：动物 ×1（劳力）＋ 植物 ×1（材料）＋ 真菌 ×1（胶合料）<br>' +
      '三位一起出工，需求值各 −' + cost.need + (cost.beans ? '　·　额外花费 🌰 ' + cost.beans : '') + '</div>';
    if (!gate.ok) h += '<div class="warnbox">⚠️ ' + esc(gate.msg) + '</div>';
    [['animal', '劳力', '动物'], ['plant', '材料', '植物'], ['fungus', '胶合料', '真菌']].forEach(function (r) {
      const pool = window.Game.workersOf(r[0]);
      h += '<div class="field"><label>出' + r[1] + '的' + r[2] + '（可选 ' + pool.length + ' 只）</label>' +
        '<select data-act="bx-pick" data-role="' + r[0] + '">' +
        '<option value="">— 选一只 —</option>' +
        pool.map(function (p) {
          const st = window.Game.stageOf(p);
          return '<option value="' + p.id + '"' + (bxState && bxState[r[0]] === p.id ? ' selected' : '') + '>' +
            esc(p.name) + '（' + esc(window.Game.speciesById(p.speciesId).name) + ' · ' + st.name +
            (p.illness ? ' · 生病中' : '') + '）</option>';
        }).join('') + '</select></div>';
    });
    const ready = bxState && bxState.animal && bxState.plant && bxState.fungus;
    h += '<button class="btn btn-primary btn-block" data-act="bx-go" data-id="' + id + '"' +
      (gate.ok && ready ? '' : ' disabled') + '>' + (up ? '🔨 扩建' : '🔨 开工') + '</button>';
    return h;
  }

  function workBodyHtml(id, b) {
    const lv = window.Game.buildLv(id);
    const cap = window.Game.staffCap(id);
    const staff = window.Game.staffOf(id);
    let h = '<div class="bx-desc">' + esc(b.desc) + '</div>';
    h += '<div class="bx-lv">Lv.' + lv + '　岗位 ' + staff.length + '/' + cap + '</div>';
    if (staff.length) {
      h += '<div class="staff-list">';
      staff.forEach(function (pid) {
        const p = window.Game.petById(pid);
        if (!p) return;
        const sp = window.Game.speciesById(p.speciesId);
        h += '<div class="staff-chip">' +
          '<span class="sc-face' + (sp.img ? '' : ' pet-emoji') + '">' +
          (sp.img ? '<img src="' + sp.img + '" alt="">' : sp.emoji) + '</span>' +
          '<span class="sc-name">' + esc(p.name) + '</span>' +
          '<button class="sc-x" data-act="bx-unstaff" data-id="' + id + '" data-pet="' + p.id + '" title="让它下班">✕</button>' +
          '</div>';
      });
      h += '</div>';
    } else {
      h += '<div class="empty">还没有小生物来上班。</div>';
    }
    const pool = S.pets.filter(function (p) {
      return !p.stored && !p.illness && staff.indexOf(p.id) < 0;
    });
    if (pool.length && staff.length < cap) {
      h += '<div class="field"><label>安排一只来上班</label>' +
        '<select data-act="bx-staff" data-id="' + id + '"><option value="">— 选一只 —</option>' +
        pool.map(function (p) {
          const st = window.Game.stageOf(p);
          const sp = window.Game.speciesById(p.speciesId);
          return '<option value="' + p.id + '">' + esc(p.name) + '（' + esc(sp.name) + ' · ' + st.name + '）</option>';
        }).join('') + '</select></div>';
    }
    if (id === 'canteen') {
      const stk = (S.build.stock && S.build.stock[id]) || {};
      h += '<div class="stock-row">' +
        '<span class="stock-ico">💧 清水 ' + (stk.water || 0) + '</span>' +
        '<span class="stock-ico">🍖 饲料 ' + (stk.food || 0) + '</span>' +
        '<button class="btn btn-sm" data-act="bx-stock" data-id="' + id + '" data-item="water">投清水</button>' +
        '<button class="btn btn-sm" data-act="bx-stock" data-id="' + id + '" data-item="food">投饲料</button>' +
        '</div>';
    }
    const ACTS = {
      canteen: { k: 'canteen', label: '🍲 开饭', tip: '按人头消耗清水 + 饲料，食堂上交可可豆' },
      bath: { k: 'bath', label: '🛁 烧水洗澡', tip: '全员洗澡，清洁值回升，收到营养液' },
      library: { k: 'library', label: '📚 一起看书', tip: '全员娱乐值回升，不用买逗猫棒' },
      travel: { k: 'travel', label: '🧭 出团', tip: '第 1 只当导游，带同伴出游，回来带土特产和收藏品' },
      museum: { k: 'museum', label: '🏛️ 查看陈列', tip: '看旅行收藏品和成就奖杯' }
    };
    const a = ACTS[id];
    const done = window.Game.doneToday(id + ':' + id);
    if (a) {
      const lockable = a.k !== 'museum' && done;
      h += '<button class="btn ' + (a.k === 'museum' ? '' : 'btn-primary') + ' btn-block" data-act="bx-do" ' +
        'data-id="' + id + '" data-kind="' + a.k + '"' + (lockable ? ' disabled' : '') + '>' +
        a.label + (lockable ? '（今天做过了）' : '') + '</button>';
      h += '<div class="bx-tip">' + a.tip + '</div>';
    }
    h += '<button class="btn btn-sm btn-block" data-act="bx-up" data-id="' + id + '">🔨 扩建（更大容量 · 更多产出）</button>';
    return h;
  }

  function openBuildingModal(id, forceBuild) {
    const b = window.Game.buildingById(id);
    if (!b) return;
    const built = window.Game.isBuilt(id);
    const isNext = (window.Game.nextBuilding() || {}).id === id;
    if (!built && !isNext) { toast('这栋还锁着，先把前面那栋盖好。', 'warn'); return; }
    if (!window.Game.storySeen('labor')) { toast('先去乐园跟最年长的小动物聊两句。', 'warn'); return; }
    /* 第一次修：先听它把话说完 */
    if (!built && !forceBuild && !window.Game.storySeen(b.story)) { openStoryModal(b.story); return; }
    const mode = (!built || forceBuild) ? 'build' : 'work';
    bxId = id;
    bxState = { animal: null, plant: null, fungus: null };
    openModal({
      title: (mode === 'build' ? '🏗️ ' : '🏢 ') + b.emoji + ' ' + b.name +
        (built ? ' · Lv.' + window.Game.buildLv(id) : ' · 准备开工'),
      body: '<div id="bx-body"></div>',
      foot: '<button class="btn btn-ghost" data-act="m-close">关闭</button>',
      onMount: function (m) {
        bxPaint = function () {
          const body = $('#bx-body', m);
          if (!body) return;
          body.innerHTML = (mode === 'build' ? buildBodyHtml(id, b) : workBodyHtml(id, b));
          wireModal(m);
        };
        bxPaint();
      },
      onClose: function () { bxPaint = null; }
    });
  }

  function openMuseumModal() {
    const cols = window.Game.collectionsOwned();
    const achs = D.ACHIEVEMENTS.filter(function (a) { return S.achievements[a.id]; });
    let h = '<div class="bx-lv">🧭 收藏品 ' + cols.length + '/' + (D.COLLECTIONS || []).length +
      '　·　🏆 奖杯 ' + achs.length + '/' + D.ACHIEVEMENTS.length + '</div>';
    h += '<div class="panel-head" style="margin-top:14px"><h2>🧭 收藏品陈列</h2>' +
      '<span class="hint">旅行社一次次带回来的</span></div>' + colGridHtml(cols);
    h += '<div class="panel-head" style="margin-top:16px"><h2>🏆 成就奖杯</h2>' +
      '<span class="hint">你干成过的事</span></div>';
    if (!achs.length) h += '<div class="empty">还没有奖杯。</div>';
    else {
      h += '<div class="ach-grid">';
      achs.forEach(function (a) {
        h += '<div class="ach-card got"><span class="ac-ico">🏆</span>' +
          '<span class="ac-name">' + esc(a.name) + '</span>' +
          '<span class="ac-desc">' + esc(a.desc || '') + '</span></div>';
      });
      h += '</div>';
    }
    openModal({
      title: '🏛️ 博物馆', body: h,
      foot: '<button class="btn btn-ghost" data-act="m-close">关闭</button>',
      onMount: wireModal
    });
  }

  /* ---------------- 破壳题库面板（端口） ----------------
   * 题库是可以空的：空的就自动放行，接上了就每次破壳先考一份。 */
  function qbankPanel() {
    const s = window.QBank.summary();
    const subjBits = Object.keys(s.bySubject).map(function (k) {
      return window.QBank.subjectName(k) + ' ' + s.bySubject[k];
    });

    let h = '<div class="panel" id="qbank-panel">';
    h += '<div class="panel-head"><h2>🧠 破壳题库</h2>' +
      '<span class="hint">小生物出生前那 ' + s.need + ' 道题，都从这儿出</span>' +
      '<span class="spacer"></span>' +
      '<span class="tag ' + (s.ready ? 'tag-ok' : 'tag-warn') + '">' +
      (s.ready ? '✅ 已接入 · ' + s.total + ' 题' : '⚠️ 未接入 · ' + s.total + ' 题') + '</span>' +
      '</div>';

    h += '<div class="qbank-rule">' +
      '<span>📋 每次抽 <b>' + s.need + '</b> 题</span>' +
      '<span>⏱️ 限时 <b>' + s.minutes + '</b> 分钟</span>' +
      '<span>🎯 答对 <b>' + Math.round(s.passRate * 100) + '%</b> 才放行</span>' +
      '</div>';

    if (!s.total) {
      h += '<div class="hintbox">题库现在是空的 —— <b>端口已经接好，题还没来</b>。' +
        '题库为空时破壳闸门自动放行，小生物照常出生，不影响你现在玩。' +
        '哪天拿到题，往下面粘贴一次就行，之后每次破壳都会先考你一份卷子。</div>';
    } else {
      h += '<div class="hintbox">现有 <b>' + s.total + '</b> 题' +
        (subjBits.length ? '（' + esc(subjBits.join(' / ')) + '）' : '') +
        (s.ready
          ? '，够出卷了。'
          : '，还差 <b>' + s.shortage + '</b> 题才凑得满 ' + s.need + ' 题；不够时按实际题数折算及格线。') +
        '</div>';
    }

    h += '<div class="qbank-acts">' +
      '<button class="btn btn-primary" data-act="qbank-open">' +
      (s.total ? '✏️ 补充 / 替换题库' : '➕ 粘贴导入题库') + '</button>' +
      (s.custom ? '<button class="btn btn-warn" data-act="qbank-clear">清空我导入的 ' + s.custom + ' 题</button>' : '') +
      '</div>';

    h += '<details class="qbank-help"><summary>题目格式长什么样？点开看</summary>' +
      '<pre class="qbank-pre">' + esc(D.QUESTION_TEXT_SAMPLE) + '</pre>' +
      '<div class="hint">也支持整段粘贴 JSON 数组：' +
      '<code>[{"stem":"题干","options":["选项一","选项二"],"answer":0,"subject":"law"}]</code><br>' +
      '（JSON 里的 <code>answer</code> 是<b>下标</b>，0 表示第一项）</div>' +
      '</details>';

    h += '</div>';
    return h;
  }

  /* ---------------- 题库导入弹窗 ---------------- */
  function openQbankModal() {
    const body =
      '<div class="hintbox">一行一题，用竖线 <b>|</b> 分隔：<br>' +
      '<code>题干 | 选项一 | 选项二 | 选项三 | 选项四 | 答案:A | 解析:可省略 | 科目:可省略</code><br>' +
      '答案写字母（<b>A/B/C/D</b>）或序号（<b>1/2/3/4</b>）都行，<b>答案不能省</b>；选项至少 2 个。' +
      '以 <code>#</code> 开头的行当注释忽略。导入的题存在这台设备里，跟着存档一起导出。</div>' +
      '<div class="field" style="margin-top:12px"><label>粘贴题目</label>' +
      '<textarea id="qb-text" style="min-height:190px" placeholder="题干 | 选项一 | 选项二 | 答案:A"></textarea>' +
      '<div class="fh"><span id="qb-pv">还没有内容</span>' +
      '<span class="spacer"></span>' +
      '<button class="btn btn-sm" id="qb-sample">填入格式示例</button></div></div>' +
      '<div id="qb-out"></div>';

    openModal({
      title: '🧠 导入破壳题库',
      body: body, wide: true,
      foot: '<button class="btn btn-ghost" id="qb-cancel">取消</button>' +
            '<button class="btn btn-primary" id="qb-ok">校验并导入</button>',
      onMount: function (m) {
        const ta = $('#qb-text', m), pv = $('#qb-pv', m), out = $('#qb-out', m);
        let parsed = null;
        ta.oninput = function () {
          if (!ta.value.trim()) { parsed = null; pv.textContent = '还没有内容'; pv.className = ''; return; }
          parsed = window.QBank.parseText(ta.value);
          pv.textContent = '识别到 ' + parsed.list.length + ' 题' +
            (parsed.errors.length ? '，' + parsed.errors.length + ' 处有问题' : '，格式没问题');
          pv.className = parsed.list.length ? (parsed.errors.length ? '' : 'ok') : 'no';
        };
        $('#qb-sample', m).onclick = function () {
          ta.value = D.QUESTION_TEXT_SAMPLE;
          ta.oninput();
          ta.focus();
        };
        $('#qb-cancel', m).onclick = closeModal;
        $('#qb-ok', m).onclick = function () {
          const r = parsed || window.QBank.parseText(ta.value);
          if (!r.list.length) {
            out.innerHTML = '<div class="errbox">没读到任何题目。' +
              (r.errors.length
                ? '<ul>' + r.errors.slice(0, 8).map(function (e) { return '<li>' + esc(e) + '</li>'; }).join('') + '</ul>'
                : '') + '</div>';
            return;
          }
          const add = window.QBank.addBatch(r.list);
          closeModal();
          toast('🧠 题库已更新：新增 ' + add.added + ' 题' +
            (add.skipped ? '，跳过 ' + add.skipped + ' 题（重复或格式不对）' : '') + '。', 'ok', 6500);
          render();
        };
      }
    });
  }

  function capsuleCard(c) {
    const sp = window.Game.speciesById(c.speciesId);
    const home = window.Game.homeOf(sp);
    const prog = c.place ? Math.min(1, (Date.now() - c.hatchStart) / (c.hatchMinutes * 60000)) : 0;
    const canHatch = c.place && prog >= 1;
    const u = window.Game.usedSlots(home);
    const full = u.used >= u.cap;
    const gate = window.Game.quizGate(c.id);

    let h = '<div class="caps">';
    h += '<div class="caps-ico">' + spArt(sp, 'caps-ico') + '</div>';
    h += '<div style="flex:1;min-width:0">';
    h += '<div class="caps-name">' + esc(sp.name) + ' <span class="badge-rar rar-' + sp.rarity + '">' + rarityName(sp.rarity) + '</span></div>';
    if (c.place) {
      h += '<div class="caps-meta">' + (canHatch ? '✨ 可以破壳了' : '孵化中 ' + Math.round(prog * 100) + '% · 还需 ' + fmtHM((1 - prog) * c.hatchMinutes) ) + '</div>';
      h += '<div class="bar bar-thin" style="margin-top:5px"><i style="width:' + (prog * 100) + '%;background:linear-gradient(90deg,#8FD3A8,#4CA96B)"></i></div>';
      if (canHatch) {
        if (gate.on && gate.passed) {
          h += '<div class="caps-quiz ok">✅ 破壳测验已通过（' + c.quizResult.correct + '/' + c.quizResult.total + '，及格 ' + c.quizResult.line + ' 题）</div>';
        } else if (gate.on) {
          h += '<div class="caps-quiz">🧠 破壳前先答 ' + gate.count + ' 道题：限时 ' + gate.minutes +
            ' 分钟，答对 ' + gate.passLine + ' 道才会出来</div>';
        } else {
          h += '<div class="caps-quiz muted">题库还没接入，先直接破壳（见本页底部「破壳题库」）</div>';
        }
      }
    } else {
      h += '<div class="caps-meta">出处：' + esc(sp.home || '云南') + ' ｜ 需要「' + window.Game.homeName(home) + '」</div>';
    }
    h += '</div>';
    h += '<div class="caps-acts">';
    if (!c.place) {
      h += '<button class="btn btn-sm btn-primary" data-act="place" data-id="' + c.id + '" data-home="' + home + '"' + (full ? ' disabled title="托位已满"' : '') + '>放入' + window.Game.homeName(home) + '</button>';
    } else if (canHatch) {
      const needQuiz = gate.on && !gate.passed;
      h += '<button class="btn btn-sm btn-primary" data-act="hatch" data-id="' + c.id + '"' +
        (needQuiz ? ' title="先过破壳测验：' + gate.count + ' 题 / ' + gate.minutes + ' 分钟 / 答对 ' + gate.passLine + ' 题"' : '') +
        '>' + (needQuiz ? '🧠 答题破壳' : '破壳') + '</button>';
    } else {
      h += '<button class="btn btn-sm btn-ghost" data-act="speedup" data-id="' + c.id + '" title="消耗 1 个加速沙漏，推进 30 分钟">⏳ 加速</button>';
    }
    h += '</div></div>';
    return h;
  }

  /* ---------------- 乐园：点小生物 / 点胶囊 ---------------- */
  function openCreatureModal(petId) {
    const p = S.pets.filter(function (x) { return x.id === petId; })[0];
    if (!p) return;
    const sp = window.Game.speciesById(p.speciesId);
    const st = window.Game.stageOf(p);
    const mood = window.Game.moodOf(p);
    const acts = window.Game.careActionsFor(p);
    const nextStage = D.STAGES.filter(function (s) { return s.min > p.growth; })[0];
    const growPct = Math.min(100, p.growth / 700 * 100);
    const mins = Math.round((Date.now() - p.bornAt) / 60000);

    let body = '<div class="cm-head">' +
      '<span class="cm-face" id="cm-face">' +
        (sp.img ? '<img class="cm-face-art" src="' + sp.img + '" alt="" draggable="false">' : sp.emoji) +
      '</span>' +
      '<div style="flex:1;min-width:0">' +
      '<div class="field" style="margin:0"><input type="text" id="cm-name" value="' + esc(p.name) + '" maxlength="12">' +
      '<div class="fh"><span>' + esc(sp.name) + ' · ' + rarityName(sp.rarity) + ' · ' + st.emoji + ' ' + st.name + ' · ' + mood.emoji + ' ' + mood.text + '</span>' +
      '<span class="spacer"></span><button class="btn btn-sm" id="cm-rename">✏️ 改名字</button></div></div>' +
      '</div></div>';
    body += '<div class="okbox" style="margin-top:10px">' + esc(sp.tip) + '</div>';

    if (p.illness) {
      body += '<div class="errbox" style="margin-top:10px">😷 患了「' + esc(p.illness.name) + '」，需要「' +
        esc((D.ITEM_MAP[p.illness.cure] || {}).name || '药水') + '」或百宝药箱。' +
        '<button class="btn btn-sm btn-warn" id="cm-heal" style="margin-left:8px">💉 治疗</button></div>';
    } else if (p.dormant) {
      body += '<div class="warnbox" style="margin-top:10px">😴 生病超过 24 小时进入了休眠：成长暂停、不会消失，治好就醒。</div>';
    }

    body += '<div class="pet-stats" style="margin-top:12px">';
    ['water', 'nutri', 'clean', 'fun'].forEach(function (k) {
      const si = D.STAT_INFO[k];
      const v = Math.round(p.stats[k]);
      const color = v < 20 ? '#D9534F' : (v < 45 ? '#E3A33C' : si.color);
      body += '<div class="srow"><span class="sname">' + si.emoji + ' ' + si.label + '</span>' +
        '<div class="bar bar-thin"><i style="width:' + v + '%;background:' + color + '"></i></div>' +
        '<span class="sval">' + v + '</span></div>';
    });
    body += '</div>';

    body += '<div class="grow-row"><span>成长</span>' +
      '<div class="bar bar-thin" style="flex:1"><i style="width:' + growPct + '%;background:linear-gradient(90deg,#9FDCAE,#4CA96B)"></i></div>' +
      '<span style="color:#8AA394">' + Math.round(p.growth) + (nextStage ? ' / ' + nextStage.min : '') + '</span></div>';

    body += '<div class="pet-acts" style="margin-top:12px">';
    acts.forEach(function (a) {
      const act = D.CARE[a];
      const si = D.STAT_INFO[act.stat];
      const tiers = D.CARE_TIERS[act.stat] || [act.item];
      let own = 0; tiers.forEach(function (t) { own += (S.bag[t] || 0); });
      const disabled = (own <= 0 || p.illness || p.stored);
      body += '<button class="act" data-care="' + a + '"' + (disabled ? ' disabled' : '') +
        ' title="' + si.label + '道具还剩 ' + own + ' 个">' +
        '<span class="act-badge' + (own <= 0 ? ' empty' : '') + '">' + own + '</span>' +
        act.emoji + ' ' + act.label + (own <= 0 ? '（缺货）' : '') + '</button>';
    });
    body += '</div>';

    if (p.stored) {
      body += '<div class="warnbox" style="margin-top:10px">📦 在保存舱中：状态静止，不衰减、不生病，护理已暂停。</div>' +
        '<div class="pet-acts" style="margin-top:10px"><button class="btn btn-primary" id="cm-unstore">📭 取出（放回场地）</button></div>';
    } else if (window.Game.canStore(p)) {
      body += '<div class="pet-acts" style="margin-top:10px"><button class="btn btn-ghost" id="cm-store">📦 放入保存舱</button></div>';
    }

    body += '<div class="hint" style="margin-top:10px">出生 ' + fmtWhen(p.bornAt) + ' · 陪伴你 ' + fmtHM(mins) +
      ' · 被照顾 ' + p.careCount + ' 次 · 出身 ' + esc(sp.home) + '</div>';

    openModal({
      title: '📋 ' + esc(p.name) + ' 的状态',
      body: body,
      foot: '<button class="btn btn-primary" id="cm-ok">好哒</button>',
      onMount: function (m) {
        $('#cm-ok', m).onclick = closeModal;
        $('#cm-rename', m).onclick = function () {
          const r = window.Game.renamePet(p.id, $('#cm-name', m).value);
          closeModal();
          if (r) { toast('✏️ 改好啦，现在叫「' + esc(r.name) + '」。', 'ok'); render(); }
        };
        const hb = $('#cm-heal', m);
        if (hb) hb.onclick = function () { openHealModal(p.id); };
        const storeBtn = $('#cm-store', m);
        if (storeBtn) storeBtn.onclick = function () {
          const r = window.Game.storePet(p.id);
          if (!r.ok) { toast('❌ ' + r.msg, 'err'); return; }
          closeModal(); render(); toast('📦 ' + esc(p.name) + ' 已放进保存舱。', 'ok');
        };
        const unstoreBtn = $('#cm-unstore', m);
        if (unstoreBtn) unstoreBtn.onclick = function () {
          const r = window.Game.unstorePet(p.id);
          if (!r.ok) { toast('❌ ' + r.msg, 'err'); return; }
          closeModal(); render(); toast('📭 ' + esc(p.name) + ' 回到了场地。', 'ok');
        };
        $$('.act[data-care]', m).forEach(function (el) {
          el.onclick = function () {
            const act = el.dataset.care;
            const r = window.Game.care(p.id, act);
            if (!r.ok) { toast('❌ ' + r.msg, 'err'); return; }
            /* 先把动作演完：音效 + 头像上的小动画；这时状态其实已经结算好了 */
            $$('.act[data-care]', m).forEach(function (b) { b.disabled = true; });
            playSfx(act);
            careFx(act, $('#cm-face', m));
            toast(r.msg, 'ok');
            render();                     /* 乐园场景里的状态气泡跟着变 */
            /* 动画放完，原位刷新这张状态面板。
               守卫：期间用户要是关了窗或点开了别的弹窗，就什么都不做——
               绝不异步把别的界面顶掉（那会像"界面自己乱跳"）。 */
            setTimeout(function () {
              if (!document.documentElement.contains(m) || m !== activeMask()) return;
              closeModal();
              openCreatureModal(p.id);
            }, 820);
          };
        });
      }
    });
  }

  function openCapsuleModal(capId) {
    const c = S.capsules.filter(function (x) { return x.id === capId; })[0];
    if (!c) return;
    const sp = window.Game.speciesById(c.speciesId);
    const prog = Math.min(1, (Date.now() - c.hatchStart) / (c.hatchMinutes * 60000));
    const ready = prog >= 1;
    const gate = window.Game.quizGate(c.id);

    let body = '<div style="text-align:center;margin-bottom:10px"><div style="font-size:52px">' + sp.emoji + '</div>' +
      '<div style="font-size:16px;font-weight:700;margin-top:4px">' + esc(sp.name) +
      ' <span class="badge-rar rar-' + sp.rarity + '">' + rarityName(sp.rarity) + '</span></div>' +
      '<div style="font-size:12.5px;color:#8AA394;margin-top:2px">住在' + window.Game.homeName(window.Game.homeOf(sp)) + ' · 出身 ' + esc(sp.home) + '</div></div>';
    body += '<div class="okbox" style="text-align:left">' + esc(sp.tip) + '</div>';

    if (ready) {
      body += '<div class="okbox" style="margin-top:10px;text-align:left">✨ 壳已经顶得咔咔响了！</div>';
      if (gate.on && gate.passed) {
        body += '<div class="hint" style="margin-top:8px">✅ 破壳测验已通过（' + c.quizResult.correct + '/' + c.quizResult.total + '），随时可以破壳。</div>';
      } else if (gate.on) {
        body += '<div class="warnbox" style="margin-top:10px;text-align:left">🧠 破壳前先答 ' + gate.count + ' 道题：限时 ' + gate.minutes +
          ' 分钟，答对 ' + gate.passLine + ' 道才放行。</div>';
      } else {
        body += '<div class="hint" style="margin-top:8px">题库还没接入，直接破壳。</div>';
      }
    } else {
      body += '<div style="margin-top:12px"><div class="caps-meta">孵化中 ' + Math.round(prog * 100) + '% · 还需 ' + fmtHM((1 - prog) * c.hatchMinutes) + '</div>' +
        '<div class="bar bar-lg" style="margin-top:6px"><i style="width:' + (prog * 100) + '%;background:linear-gradient(90deg,#8FD3A8,#4CA96B)"></i></div></div>' +
        '<div class="hint" style="margin-top:8px">急的话可以花 1 个加速沙漏推进 30 分钟。</div>';
    }

    openModal({
      title: '🥚 ' + esc(sp.name),
      body: body,
      foot: (!ready
          ? '<button class="btn btn-ghost" id="cp-speed">⏳ 加速 30 分钟</button>'
          : '') +
        '<span class="spacer"></span>' +
        '<button class="btn btn-ghost" id="cp-ok">先不管它</button>' +
        (ready ? '<button class="btn btn-primary" id="cp-hatch">' +
          ((gate.on && !gate.passed) ? '🧠 答题破壳' : '🎉 破壳！') + '</button>' : ''),
      onMount: function (m) {
        $('#cp-ok', m).onclick = closeModal;
        const sp2 = $('#cp-speed', m);
        if (sp2) sp2.onclick = function () {
          const r = window.Game.speedUp(c.id);
          toast(r.ok ? '⏳ 推进了 30 分钟。' : '❌ ' + r.msg, r.ok ? 'ok' : 'err');
          closeModal();
          render();
        };
        const hb = $('#cp-hatch', m);
        if (hb) hb.onclick = function () {
          closeModal();
          if (gate.on && !gate.passed) openHatchQuizModal(c.id);
          else doHatch(c.id);
        };
      }
    });
  }

  /* ---------------- 扭蛋页 ---------------- */
  function viewGacha() {
    const G = D.GACHA;
    let h = '';
    h += '<div class="gacha-wrap">';

    h += '<div class="machine"><div class="machine-inner">';
    h += '<div class="dome" id="dome">🥚</div>';
    h += '<div style="font-size:15px;font-weight:700;color:#2E7A4C;margin-bottom:4px">云南生命扭蛋机</div>';
    h += '<div style="font-size:12.5px;color:#5B7263">每一颗胶囊里，都睡着一个云岭的生灵</div>';
    h += '<div class="gacha-btns" style="margin-top:16px">';
    h += '<button class="btn btn-primary btn-lg" data-act="pull" data-n="1" ' + (S.cur.tickets < G.costPerPull ? 'disabled' : '') + '>🎟️ 抽 1 次（' + G.costPerPull + ' 券）</button>';
    h += '<button class="btn btn-gold btn-lg" data-act="pull" data-n="10" ' + (S.cur.tickets < G.costTenPull ? 'disabled' : '') + '>🎟️ 十连（' + G.costTenPull + ' 券）</button>';
    h += '</div>';
    h += '<div class="rate-table">';
    h += '<div style="font-size:12px;color:#8AA394;margin-bottom:8px">当前持有 <b style="color:#35B7A8">' + S.cur.tickets + '</b> 张胶囊券。扭蛋券只能靠学习任务和成就获得，不能买——所以每一抽都是你挣来的。</div>';
    [3, 2, 1].forEach(function (r) {
      h += '<div class="rate-row"><span class="badge-rar rar-' + r + '">' + rarityName(r) + '</span>' +
        '<div class="bar bar-thin"><i style="width:' + G.rarityRate[r] + '%;background:' + (r === 3 ? '#E3A33C' : (r === 2 ? '#4EA8DE' : '#B7C7BA')) + '"></i></div>' +
        '<span style="width:38px;text-align:right;font-size:11.5px">' + G.rarityRate[r] + '%</span></div>';
    });
    h += '<div style="font-size:11.5px;color:#8AA394;margin-top:8px">保底：连续 ' + G.pity + ' 抽没出稀有及以上，下一抽必出稀有或传说（当前累积 ' + (S.pity || 0) + '/' + G.pity + '）</div>';
    h += '</div>';
    h += '</div></div>';

    /* 图鉴 */
    h += '<div class="panel">';
    h += '<div class="panel-head"><h2>📖 已收录的生命</h2><span class="hint">' +
      S.stats.uniqueSpecies + ' / ' + D.SPECIES_ACTIVE.length + ' 种</span></div>';
    h += '<div style="display:flex;flex-direction:column;gap:8px;max-height:520px;overflow:auto">';
    D.SPECIES_ACTIVE.forEach(function (sp) {
      const owned = S.pets.some(function (p) { return p.speciesId === sp.id; });
      const caps = S.capsules.some(function (c) { return c.speciesId === sp.id; });
      const known = owned || caps;
      h += '<div style="display:flex;align-items:center;gap:10px;padding:8px 10px;border:1px solid ' + (known ? '#D9E8D8' : '#EEF3EE') + ';border-radius:12px;background:' + (known ? '#fff' : '#FAFCFA') + '">' +
        '<span style="font-size:20px;filter:' + (known ? 'none' : 'grayscale(1) opacity(.4)') + '">' + spArt(sp, 'dex-ico') + '</span>' +
        '<div style="flex:1;min-width:0">' +
          '<div style="font-size:13.5px;font-weight:600;color:' + (known ? '#22332A' : '#B7C7BA') + '">' + (known ? esc(sp.name) : '？？？') +
            ' <span class="badge-rar rar-' + sp.rarity + '">' + rarityName(sp.rarity) + '</span></div>' +
          '<div style="font-size:11.5px;color:#8AA394">' + (known ? esc(sp.tip) : '还没见过这个物种') + '</div>' +
        '</div>' +
        '<span class="tag">' + window.Game.homeName(window.Game.homeOf(sp)) + '</span>' +
      '</div>';
    });
    h += '</div></div>';

    h += '</div>';
    return h;
  }

  function doPull(n) {
    const res = window.Game.pull(n);
    if (!res.ok) { toast('❌ ' + res.msg, 'err'); return; }
    const dome = $('#dome');
    if (dome) {
      dome.classList.add('spin');
      dome.textContent = '🌀';
    }
    setTimeout(function () {
      if (dome) { dome.classList.remove('spin'); dome.textContent = '🥚'; }
      showPullResult(res.capsules);
      render();
    }, 900);
  }

  function showPullResult(caps) {
    let best = 0;
    caps.forEach(function (c) { best = Math.max(best, c.rarity); });
    let body = '<div class="warnbox">' + (caps.length > 1 ? '十连结果：' : '抽到了：') + '胶囊已经放进「待安置」区，去乐园把它们安置到温室或孵化仓。</div>';
    body += '<div style="display:flex;flex-wrap:wrap;gap:10px;justify-content:center">';
    caps.forEach(function (c, i) {
      const sp = window.Game.speciesById(c.speciesId);
      const delay = i * 0.08;
      body += '<div style="width:120px;text-align:center;padding:12px 8px;border:1px solid #D9E8D8;border-radius:16px;background:#fff;animation:pop .3s ' + delay + 's both">' +
        '<div style="font-size:34px">' + sp.emoji + '</div>' +
        '<div style="font-size:13px;font-weight:700;margin-top:4px">' + esc(sp.name) + '</div>' +
        '<div><span class="badge-rar rar-' + sp.rarity + '">' + rarityName(sp.rarity) + '</span></div>' +
        '<div style="font-size:11px;color:#8AA394;margin-top:4px">' + window.Game.homeName(window.Game.homeOf(sp)) + '</div>' +
        '</div>';
    });
    body += '</div>';
    if (best === 3) body += '<div class="okbox" style="margin-top:14px">✨ 传说级！这是云南最珍贵的生灵之一，好好养。</div>';
    openModal({
      title: '🎊 扭蛋结果',
      body: body,
      foot: '<button class="btn btn-ghost" id="pr-again">再来一次</button>' +
            '<button class="btn btn-primary" id="pr-go">去乐园安置</button>',
      onMount: function (mask) {
        $('#pr-again', mask).onclick = function () { closeModal(); doPull(caps.length === 10 ? 10 : 1); };
        $('#pr-go', mask).onclick = function () { closeModal(); switchTab('garden'); };
      }
    });
    if (best === 3) confetti(60);
  }

  /* ---------------- 商店页 ---------------- */
  function viewShop() {
    const groups = [
      { k: 'greenhouse', name: '🏡 温室用品', sub: '植物 / 真菌 / 藻类用' },
      { k: 'hatchery', name: '🏗️ 孵化仓用品', sub: '动物用' },
      { k: 'medicine', name: '💊 药水', sub: '生病了要对症下药' },
      { k: 'facility', name: '🧰 设施与加速', sub: '扩展托位、推进孵化' }
    ];
    let h = '<div class="panel"><div class="panel-head"><h2>🛒 可可豆商店</h2>' +
      '<span class="hint">当前 🌰 ' + Math.floor(S.cur.beans) + ' 可可豆</span></div>' +
      '<div style="font-size:12.5px;color:#5B7263">照顾小生物改得经验、升级解锁更高级道具；可可豆来自升级里程碑、成就与学习任务奖励。护理会消耗道具，所以记得每天把任务做完。</div></div>';

    groups.forEach(function (g) {
      h += '<div class="panel shop-group"><h3>' + g.name + '<span class="hint" style="font-weight:400;color:#8AA394;font-size:12px">' + g.sub + '</span></h3>';
      h += '<div class="shop-grid">';
      D.ITEMS.filter(function (i) { return i.kind === g.k; }).forEach(function (it) {
        const locked = it.reqLevel && S.cur.level < it.reqLevel;
        const q = shopQty[it.id] || 1;
        const own = (it.kind === 'facility')
          ? (it.id === 'hourglass' ? (S.bag.hourglass || 0) : (it.id === 'slot_green' ? S.slots.greenhouse : S.slots.hatchery))
          : (S.bag[it.id] || 0);
        const ownLabel = it.kind === 'facility'
          ? (it.id === 'hourglass' ? '持有 ' + own + ' 个' : '当前 ' + own + ' 个托位')
          : '持有 ' + own + ' 个';
        const ownShow = locked ? ('🔒 需 Lv.' + it.reqLevel + ' 解锁') : ownLabel;
        h += '<div class="shop-item' + (locked ? ' locked' : '') + '">' +
          '<div class="si-top"><span class="si-ico">' + it.emoji + '</span>' +
            '<div><div class="si-name">' + it.name + (locked ? ' <span class="lock-mini">🔒</span>' : '') + '</div><div class="si-own">' + ownShow + '</div></div></div>' +
          '<div class="si-desc">' + esc(it.desc) + '</div>' +
          '<div class="si-bottom">' +
            '<span class="price">' + it.price + '</span>' +
            (locked
              ? '<span class="lock-tag">🔒 Lv.' + it.reqLevel + '</span>'
              : '<button class="qty-btn" data-act="qty" data-id="' + it.id + '" data-d="-1">−</button>' +
                '<span class="qty-val" id="qty-' + it.id + '">' + q + '</span>' +
                '<button class="qty-btn" data-act="qty" data-id="' + it.id + '" data-d="1">＋</button>' +
                '<button class="btn btn-sm btn-primary" style="margin-left:auto" data-act="buy" data-id="' + it.id + '" data-qty="' + q + '">购买</button>') +
          '</div></div>';
      });
      h += '</div></div>';
    });
    return h;
  }

  /* ---------------- 成就页 ---------------- */
  function viewAch() {
    const got = D.ACHIEVEMENTS.filter(function (a) { return S.achievements[a.id]; }).length;
    let h = '<div class="panel"><div class="panel-head"><h2>🏆 成就</h2>' +
      '<span class="hint">已达成 ' + got + ' / ' + D.ACHIEVEMENTS.length + '</span></div>' +
      '<div class="bar bar-lg"><i style="width:' + Math.round(got / D.ACHIEVEMENTS.length * 100) + '%;background:linear-gradient(90deg,#F0C069,#E3A33C)"></i></div></div>';
    h += '<div class="panel"><div class="ach-grid">';
    D.ACHIEVEMENTS.forEach(function (a) {
      const on = !!S.achievements[a.id];
      h += '<div class="ach' + (on ? ' got' : '') + '">' +
        '<div class="ach-ico">' + (on ? '🏅' : '🔒') + '</div>' +
        '<div><div class="ach-name">' + esc(a.name) + '</div>' +
        '<div class="ach-desc">' + esc(a.desc) + '</div>' +
        '<div class="ach-rw">🎟️ +' + a.reward.tickets + '　🌰 +' + a.reward.beans + (on ? '　' + fmtWhen(S.achievements[a.id]) : '') + '</div>' +
        '</div></div>';
    });
    h += '</div></div>';
    return h;
  }

  /* ---------------- 我的（用户信息） ---------------- */
  const AVATARS = ['🐱', '🐻', '🦊', '🐸', '🐰', '🐼', '🐨', '🦉', '🌷', '🍄', '🌱', '🍀'];

  function profileOf() {
    const p = S.profile || {};
    return {
      nick: p.nick || '',
      avatar: p.avatar || ''
    };
  }

  function viewMe() {
    const pf = profileOf();
    const rate = S.stats.questions ? Math.round(S.stats.correct / S.stats.questions * 100) : 0;
    const achN = Object.keys(S.achievements).length;
    const achAll = D.ACHIEVEMENTS.length;
    const booksDone = D.SUBJECTS.filter(function (x) { return S.bookProgress['done_' + x.id]; }).length;

    let h = '';

    /* 资料卡 */
    h += '<div class="panel me-card">';
    h += '<div class="me-head">';
    h += '<button class="me-avatar" data-act="me-edit" title="点我换头像">' + (pf.avatar || '🐱') + '</button>';
    h += '<div class="me-id">';
    h += '<div class="me-nick">' + esc(pf.nick || '未设置昵称') + '</div>';
    h += '<div class="me-sub">考试倒计时 <b>' + window.Store.daysLeft() + '</b> 天 · ' + esc(window.Store.currentPhase().phase.name) + ' 第 ' + window.Store.currentPhase().day + ' 天</div>';
    h += '</div>';
    h += '<button class="btn btn-sm" data-act="me-edit">✏️ 编辑资料</button>';
    h += '</div>';

    /* 存档面板 */
    const svList = window.Store.listSaves();
    h += '<div class="panel">';
    h += '<div class="panel-head"><h2>💾 我的存档</h2><span class="hint">' + svList.length + ' / 12 · 完成一项任务自动存一份</span></div>';
    if (!svList.length) {
      h += '<div class="empty">还没有存档。完成任意一项任务，系统会自动存下第一份。</div>';
    } else {
      h += '<div class="save-list">';
      svList.slice(0, 5).forEach(function (sv, i) { h += saveRowHtml(sv, i); });
      h += '</div>';
    }
    h += '<div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">' +
      '<button class="btn btn-sm btn-primary" data-act="save-open">💾 打开存档</button>' +
      '<button class="btn btn-sm" data-act="sync">🔗 用存档码跨设备</button>' +
      '</div>';
    h += '</div>';

    h += '<div class="me-sync">' +
      '<div class="me-sync-t"><b>📲 换设备继续玩</b>' +
      '<span>进度存在这台设备的浏览器里（安全沙箱，网页绕不过去）。' +
      '用同步码，一分钟就能把乐园搬到手机 / 电脑 / iPad 上，不联网也不用注册。</span></div>' +
      '<button class="btn btn-primary" data-act="sync">🔗 打开跨设备同步</button>' +
      '</div>';
    h += '</div>';

    /* 数据总览 */
    h += '<div class="panel">';
    h += '<div class="panel-head"><h2>📊 学习档案</h2><span class="hint">从开玩到现在的总账</span></div>';
    h += '<div class="me-stats">';
    h += meStat('🎟️', S.cur.tickets, '胶囊券');
    h += meStat('🌰', S.cur.beans, '可可豆');
    h += meStat('🐾', S.pets.length, '小生物');
    h += meStat('🏅', achN + ' / ' + achAll, '成就');
    h += meStat('📚', booksDone + ' / 4', '读完的课本');
    h += meStat('🎤', S.stats.scriptsMastered + ' / 12', '拿下的导游词');
    h += meStat('✍️', S.stats.questions, '刷过的题');
    h += meStat('🎯', rate + '%', '总正确率');
    h += meStat('📝', S.stats.notes || 0, '文字记录');
    h += meStat('🗣️', S.stats.feynmanCards || 0, '费曼卡');
    h += meStat('🔥', S.stats.streak || 0, '连续打卡');
    h += meStat('🍽️', S.stats.fullFeedDays || 0, '喂饱天数');
    h += '</div>';
    h += '</div>';

    /* 我的资料：资料库 / 笔记 / 证据库 入口（都收进「我的」，不单列板块） */
    h += '<div class="panel">';
    h += '<div class="panel-head"><h2>🗂️ 我的资料</h2>' +
      '<span class="hint">资料库、笔记、证据库都收在这里</span></div>';
    h += '<div class="me-links">' +
      '<button class="me-link" data-act="goto-docs"><span class="ml-ico">📚</span>' +
        '<span class="ml-t">资料库</span><span class="ml-d">错题 / 综合问答 / 导游词，直接练</span><span class="ml-go">›</span></button>' +
      '<button class="me-link" data-act="goto-notes"><span class="ml-ico">📝</span>' +
        '<span class="ml-t">我的笔记</span><span class="ml-d">' + (S.notes || []).length + ' 条</span><span class="ml-go">›</span></button>' +
      '<button class="me-link" data-act="goto-evidence"><span class="ml-ico">🗂️</span>' +
        '<span class="ml-t">证据库</span><span class="ml-d">' + S.evidence.length + ' 份凭证</span><span class="ml-go">›</span></button>' +
      '</div>';
    h += '</div>';

    /* 破壳题库（从乐园页搬过来的） */
    h += qbankPanel();

    return h;
  }

  function meStat(ico, val, label) {
    return '<div class="me-stat"><span class="ms-ico">' + ico + '</span>' +
      '<span class="ms-val">' + esc(String(val)) + '</span>' +
      '<span class="ms-label">' + esc(label) + '</span></div>';
  }

  function openProfileModal() {
    const pf = profileOf();
    let body = '';
    body += '<div class="field"><label>昵称</label>' +
      '<input type="text" id="pf-nick" maxlength="12" placeholder="最多 12 个字" value="' + esc(pf.nick) + '">' +
      '<div class="fh"><span>给自己起个名字，证据库和乐园都会更有"这是我的"的感觉。</span></div></div>';
    body += '<div class="field"><label>头像（点一个）</label>' +
      '<div class="avatar-pick" id="pf-avatars">' +
      AVATARS.map(function (a) {
        return '<button class="av' + (a === pf.avatar ? ' on' : '') + '" data-av="' + a + '">' + a + '</button>';
      }).join('') +
      '</div></div>';

    let picked = pf.avatar;
    openModal({
      title: '✏️ 编辑资料',
      body: body,
      foot: '<button class="btn btn-ghost" id="pf-cancel">取消</button>' +
            '<button class="btn btn-primary" id="pf-save">保存</button>',
      onMount: function (m) {
        $$('.av', m).forEach(function (b) {
          b.onclick = function () {
            picked = b.dataset.av;
            $$('.av', m).forEach(function (x) { x.classList.toggle('on', x === b); });
          };
        });
        $('#pf-cancel', m).onclick = closeModal;
        $('#pf-save', m).onclick = function () {
          S.profile.nick = String($('#pf-nick', m).value || '').trim().slice(0, 12);
          S.profile.avatar = picked;
          window.Store.save(true);
          closeModal();
          toast('✅ 资料已更新，' + (S.profile.nick || '无名氏') + '！', 'ok');
          render();
        };
      }
    });
  }

  /* ---------------- 证据库 ---------------- */
  function evIcon(t) {
    if (t === 'photo') return '📸';
    if (t === 'audio') return '🎙️';
    if (t === 'file') return '📄';
    if (t === 'quiz') return '🧠';
    return '📝';
  }

  function openEvidenceFile(id) {
    const e = S.evidence.filter(function (x) { return x.id === id; })[0];
    if (!e) return toast('凭证不见了', 'warn');
    window.Store.getEvidenceBlob(id).then(function (blob) {
      if (!blob) return toast('文件没存下来（浏览器不支持本地数据库）', 'warn');
      const url = URL.createObjectURL(blob);
      const w = window.open(url, '_blank');
      if (!w) toast('浏览器拦了新窗口，可到证据库长按打开', 'warn');
      setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
    });
  }

  function viewEvidence() {
    const evs = S.evidence.filter(function (e) {
      if (evFilter === 'all') return true;
      return e.type === evFilter;
    }).slice(0, 120);

    let h = '<div class="panel">';
    h += '<div class="panel-head"><h2>🗂️ 证据库</h2><span class="hint">这里是你每天真实学习过的痕迹</span></div>';
    h += '<div style="font-size:13px;color:#5B7263">共 <b>' + S.evidence.length + '</b> 份凭证：文字笔记 ' +
      S.evidence.filter(function (e) { return e.type === 'note'; }).length + ' 条、截图 ' +
      S.evidence.filter(function (e) { return e.type === 'photo'; }).length + ' 张、录音 ' +
      S.evidence.filter(function (e) { return e.type === 'audio'; }).length + ' 段、文件 ' +
      S.evidence.filter(function (e) { return e.type === 'file'; }).length + ' 个、破壳测验 ' +
      S.evidence.filter(function (e) { return e.type === 'quiz'; }).length + ' 份。' +
      '它们只存在这台电脑的浏览器里，导出后就是一份可以自己回看的学习档案。</div>';
    h += '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">' +
      ['all:全部', 'note:📝 文字笔记', 'photo:📸 截图', 'audio:🎙️ 录音', 'file:📄 文件', 'quiz:🧠 破壳测验'].map(function (x) {
        const k = x.split(':')[0];
        return '<button class="btn btn-sm ' + (evFilter === k ? 'btn-primary' : '') + '" data-act="ev-filter" data-k="' + k + '">' + x.split(':')[1] + '</button>';
      }).join('') +
      '<span class="spacer"></span>' +
      '<span class="ev-admin">' +
        '<button class="btn btn-sm btn-primary" data-act="sync">🔗 跨设备同步</button>' +
        '<button class="btn btn-sm" data-act="export">⬇️ 导出存档</button>' +
        '<button class="btn btn-sm" data-act="import">⬆️ 导入存档</button>' +
        '<button class="btn btn-sm btn-warn" data-act="reset">重置全部数据</button>' +
      '</span>' +
      '</div>';
    h += '</div>';

    /* 费曼卡 */
    h += '<div class="panel">';
    h += '<div class="panel-head"><h2>🗣️ 费曼卡</h2><span class="hint">共 ' + S.feynman.length + ' 张</span></div>';
    if (!S.feynman.length) {
      h += '<div class="empty">费曼学习法的核心：把一个概念讲到 12 岁小孩能听懂。第一张卡会出现在「费曼工作坊」任务里。</div>';
    } else {
      h += '<div style="display:flex;flex-direction:column;gap:9px;max-height:320px;overflow:auto">';
      S.feynman.slice(0, 15).forEach(function (f) {
        h += '<div class="mistake-row">' +
          '<div style="font-size:13.5px;font-weight:700;color:#2E7A4C">💡 ' + esc(f.concept) + '</div>' +
          '<div style="font-size:13px;color:#5B7263;margin-top:5px">' + esc(f.plain) + '</div>' +
          (f.gap ? '<div style="font-size:12.5px;color:#B8791C;margin-top:5px">⚠️ 卡壳处：' + esc(f.gap) + '</div>' : '') +
          (f.analogy ? '<div style="font-size:12.5px;color:#4EA8DE;margin-top:3px">🌀 类比：' + esc(f.analogy) + '</div>' : '') +
          '<div style="font-size:11px;color:#8AA394;margin-top:5px">' + fmtWhen(f.at) + '</div>' +
          '</div>';
      });
      h += '</div>';
    }
    h += '</div>';

    /* 破壳测验战绩 */
    const qs = {
      attempts: S.stats.quizAttempts || 0,
      passed: S.stats.quizPassed || 0,
      answered: S.stats.quizAnswered || 0,
      correct: S.stats.quizCorrect || 0,
      bank: window.QBank.summary()
    };
    h += '<div class="panel">';
    h += '<div class="panel-head"><h2>🧠 破壳测验</h2>' +
      '<span class="hint">小生物出生前的那道关卡</span>' +
      '<span class="spacer"></span>' +
      '<span class="tag ' + (qs.bank.ready ? 'tag-ok' : 'tag-warn') + '">' +
      (qs.bank.total ? '题库 ' + qs.bank.total + ' 题' : '题库未接入') + '</span></div>';
    if (!qs.attempts) {
      h += '<div class="empty">还没答过。题库接好之后，每次小生物出生前都会来一份 <b>' + qs.bank.need +
        '</b> 题的小卷：限时 ' + qs.bank.minutes + ' 分钟，答对 ' +
        Math.round(qs.bank.passRate * 100) + '% 才放行。</div>';
    } else {
      h += '<table class="mini" style="margin-top:4px">' +
        '<tr><th>答过</th><th>通过</th><th>累计答题</th><th>总正确率</th></tr>' +
        '<tr><td>' + qs.attempts + ' 份</td><td>' + qs.passed + ' 份</td><td>' + qs.answered + ' 题</td>' +
        '<td>' + (qs.answered ? Math.round(qs.correct / qs.answered * 100) + '%' : '—') + '</td></tr>' +
        '</table>';
      const recent = S.evidence.filter(function (e) { return e.type === 'quiz'; }).slice(0, 6);
      if (recent.length) {
        h += '<div class="shard-log" style="margin-top:10px">' + recent.map(function (e) {
          return '<div class="shard-item"><span class="si-time">' + fmtWhen(e.at) + '</span>' +
            '<span class="si-text">' + esc(e.label) + '　' + esc(e.text) + '</span></div>';
        }).join('') + '</div>';
      }
    }
    h += '</div>';

    /* 时间线 */
    h += '<div class="panel">';
    h += '<div class="panel-head"><h2>📜 凭证时间线</h2><span class="hint">最近 ' + evs.length + ' 条</span></div>';
    if (!evs.length) {
      h += '<div class="empty">还没有凭证。完成任务时上传的截图、录的背诵音频，都会出现在这里。</div>';
    } else {
      h += '<div class="ev-list">';
      evs.forEach(function (e) {
        h += '<div class="ev">';
        if (e.type === 'photo' && e.thumb) {
          h += '<img class="ev-thumb" src="' + e.thumb + '" alt="凭证">';
        } else if (e.type === 'audio') {
          h += '<div class="ev-thumb" style="font-size:26px">🎙️</div>';
        } else if (e.type === 'file') {
          h += '<div class="ev-thumb" style="font-size:26px">📄</div>';
        } else {
          h += '<div class="ev-thumb" style="font-size:26px">📝</div>';
        }
        h += '<div class="ev-body">';
        h += '<div class="ev-title">' + (e.type === 'photo' ? '📸 ' : e.type === 'audio' ? '🎙️ ' : e.type === 'file' ? '📄 ' : '📝 ') + esc(e.label || '凭证') + '</div>';
        h += '<div class="ev-meta">' + fmtWhen(e.at) + (e.duration ? ' ｜ 时长 ' + fmtClock(e.duration) : '') +
          (e.sizeKB ? ' ｜ ' + e.sizeKB + ' KB' : '') + (e.store === 'ls-only' ? ' ｜ ⚠️ 文件未持久化（浏览器不支持本地数据库）' : '') + '</div>';
        if (e.text) h += '<div class="ev-text">' + esc(e.text) + '</div>';
        if (e.type === 'file') {
          h += '<div style="margin-top:6px"><button class="btn btn-sm" data-act="ev-open" data-id="' + e.id + '">📂 打开文件</button></div>';
        }
        if (e.type === 'audio') {
          h += '<div style="display:flex;gap:8px;align-items:center;margin-top:6px">' +
            '<button class="btn btn-sm" data-act="play" data-id="' + e.id + '">▶️ 播放录音</button>' +
            '<span class="hint" id="pl-' + e.id + '" style="font-size:11px;color:#8AA394"></span>' +
            '</div><div id="au-' + e.id + '"></div>';
        }
        h += '</div>';
        h += '<button class="btn btn-sm btn-warn" data-act="ev-del" data-id="' + e.id + '">删除</button>';
        h += '</div>';
      });
      h += '</div>';
    }
    h += '</div>';
    return h;
  }

  function playEvidence(id, btn) {
    const holder = $('#au-' + id);
    const stat = $('#pl-' + id);
    if (!holder) return;
    if (holder.dataset.loaded === '1') {
      const a = holder.querySelector('audio');
      if (a) a.play();
      return;
    }
    if (stat) stat.textContent = '读取中…';
    window.Store.getEvidenceBlob(id).then(function (blob) {
      if (!blob) { if (stat) stat.textContent = '文件已丢失'; return; }
      const url = URL.createObjectURL(blob);
      holder.innerHTML = '<audio controls src="' + url + '"></audio>';
      holder.dataset.loaded = '1';
      if (stat) stat.textContent = '';
      const a = holder.querySelector('audio');
      if (a) a.play();
    });
  }

  /* ---------------- 资料库 ---------------- */
  function viewDocs() {
    const wrongN = window.QBank.all().length;
    const zhN = (D.INTERVIEW_QA || []).length;
    const spN = (D.SCRIPTS || []).length;
    let h = '<div class="panel">';
    h += '<div class="panel-head"><h2>📚 资料库</h2>' +
      '<span class="hint">不翻 PDF，直接上手练</span>' +
      '<span class="spacer"></span>' +
      '<button class="btn btn-sm btn-ghost" data-act="goto-me">← 返回「我的」</button></div>';

    h += '<div class="hub-cards">';

    h += '<div class="hub-card" data-act="wrong-open">' +
      '<div class="hub-ico">📕</div>' +
      '<div class="hub-body"><div class="hub-title">错题复习</div>' +
      '<div class="hub-desc">题库里 ' + wrongN + ' 道错题，随时自测（不只破壳时）。点开就做，不强制逐题。</div></div>' +
      '<div class="hub-go">›</div></div>';

    h += '<div class="hub-card" data-act="zh-open">' +
      '<div class="hub-ico">💬</div>' +
      '<div class="hub-body"><div class="hub-title">综合问答</div>' +
      '<div class="hub-desc">导游综合知识问答（其11 已录入 ' + zhN + ' 题；11-21 共 11 题是图片扫描件，发我文字版立刻补）。照答案练，每天交一个凭证即算练过。</div></div>' +
      '<div class="hub-go">›</div></div>';

    h += '<div class="hub-card" data-act="sp-open-hub">' +
      '<div class="hub-ico">📜</div>' +
      '<div class="hub-body"><div class="hub-title">导游词</div>' +
      '<div class="hub-desc">' + spN + ' 篇，照着读 / 背，可录音留痕。点开任选一篇。</div></div>' +
      '<div class="hub-go">›</div></div>';

    h += '</div>';
    h += '<div class="hint" style="margin-top:10px">破壳测验的错题、综合问答、导游词，都收在这。不用翻 PDF，打开就练。</div>';
    h += '</div>';
    return h;
  }

  function openDocViewer(doc) {
    openModal({
      title: '📖 ' + doc.title,
      wide: true,
      body: '<div class="doc-viewer"><iframe class="doc-frame" src="' + doc.file + '" title="' + esc(doc.title) + '"></iframe></div>',
      foot: '<button class="btn" id="doc-ext">🔗 新窗口打开</button>',
      onMount: function (mask) {
        const ext = $('#doc-ext', mask);
        if (ext) ext.onclick = function () { window.open(doc.file, '_blank'); };
      }
    });
  }

  /* ---------------- 我的笔记 ---------------- */
  function viewNotes() {
    let h = '<div class="panel">';
    h += '<div class="panel-head"><h2>📝 我的笔记</h2>' +
      '<span class="hint">随手记、随手传，进度都存这台设备里</span></div>';

    /* 新建文字笔记 */
    h += '<div class="note-form">' +
      '<div class="field"><label>标题</label>' +
        '<input type="text" id="note-title" maxlength="60" placeholder="例如：石林地质小抄"></div>' +
      '<div class="field"><label>内容</label>' +
        '<textarea id="note-body" class="note-area" placeholder="把易混点、口诀、今天卡住的地方写下来…"></textarea></div>' +
      '<button class="btn btn-primary" data-act="note-new">💾 保存笔记</button>' +
    '</div>';

    /* 上传笔记文件 */
    h += '<div class="note-form" style="margin-top:14px">' +
      '<div class="panel-head" style="margin-bottom:8px"><h3 style="font-size:15px">📎 上传笔记文件</h3></div>' +
      '<div class="hint">支持 .txt / .md（直接存文字）与 .pdf / 图片（原文件留存，随时打开看）。</div>' +
      '<div style="margin-top:8px"><input type="file" id="note-file" ' +
        'accept=".txt,.md,.pdf,.png,.jpg,.jpeg,.webp,.gif,text/plain,application/pdf,image/*"></div>' +
      '<button class="btn" data-act="note-upload" style="margin-top:8px">⬆️ 上传这份文件</button>' +
    '</div>';
    h += '</div>';

    /* 列表 */
    h += '<div class="panel">';
    h += '<div class="panel-head"><h2>🗒️ 全部笔记</h2><span class="hint">共 ' + (S.notes || []).length + ' 条</span></div>';
    if (!(S.notes || []).length) {
      h += '<div class="empty">还没有笔记。上面写一条，或上传一份文件，复习时随时回来翻。</div>';
    } else {
      h += '<div class="note-list">';
      S.notes.forEach(function (n) {
        h += '<div class="note-row">' +
          '<div class="note-info">' +
            '<div class="note-title">' + esc(n.title) + '</div>' +
            '<div class="note-meta">' + (n.kind === 'file' ? '📄 文件' : '✍️ 文字') + ' ｜ ' +
              n.sizeKB + ' KB ｜ ' + fmtWhen(n.at) + '</div>' +
          '</div>' +
          '<div class="note-acts">' +
            '<button class="btn btn-sm" data-act="note-open" data-id="' + n.id + '">👁 查看</button>' +
            '<button class="btn btn-sm btn-warn" data-act="note-del" data-id="' + n.id + '">删除</button>' +
          '</div>' +
        '</div>';
      });
      h += '</div>';
    }
    h += '</div>';
    return h;
  }

  function openNoteViewer(n) {
    if (n.kind === 'text') {
      openModal({
        title: '📝 ' + n.title,
        body: '<div class="note-view"><div class="note-view-meta">' + fmtWhen(n.at) + '</div>' +
          '<div class="note-text">' + esc(n.text || '（空笔记）') + '</div></div>'
      });
      return;
    }
    if (!window.Store.getNoteBlob) { toast('当前环境不支持读取文件笔记。', 'err'); return; }
    window.Store.getNoteBlob(n.id).then(function (blob) {
      if (!blob) { toast('⚠️ 这份笔记的原文件丢了（可能换过浏览器 / 清过缓存）。', 'err'); return; }
      const url = URL.createObjectURL(blob);
      openModal({
        title: '📄 ' + n.title,
        wide: true,
        body: '<div class="doc-viewer"><iframe class="doc-frame" src="' + url + '"></iframe></div>',
        foot: '<button class="btn" id="note-ext">🔗 新窗口打开</button>',
        onClose: function () { try { URL.revokeObjectURL(url); } catch (e) {} },
        onMount: function (mask) {
          const ext = $('#note-ext', mask);
          if (ext) ext.onclick = function () { window.open(url, '_blank'); };
        }
      });
    });
  }

  /* ---------------- 帮助页 ---------------- */
  function viewHelp() {
    let h = '<div class="panel help">';
    h += '<div class="panel-head"><h2>❓ 怎么玩（也是怎么学）</h2></div>';

    h += '<h3>一、这个游戏到底在做什么</h3>';
    h += '<p>它是一款放置类养成游戏：你<b>学习 → 挣胶囊券和可可豆 → 扭蛋 → 养小生物</b>。小生物不是奖励，是"人质"——它会渴、会饿、会脏、会闷（缺娱乐），还会生病，需要你每天回来照顾。所以你每偷懒一天，乐园都会变糟一点。</p>';
    h += '<p><b>为什么叫「知识喂了猫」</b>：因为你背进去的东西，转头就忘，跟喂了猫没两样。既然靠硬记不行，那就换个法子——每天喂一点，让猫替你养着。</p>';

    h += '<h3>二、两套货币</h3>';
    h += '<table class="mini"><tr><th>货币</th><th>怎么来</th><th>怎么花</th></tr>' +
      '<tr><td>🎟️ 胶囊券</td><td>完成学习任务、达成成就</td><td>在扭蛋机抽胶囊（1 券 1 抽，9 券十连）</td></tr>' +
      '<tr><td>🌰 可可豆</td><td>升级里程碑、成就、学习任务奖励</td><td>买清水/营养液/饲料/药水，扩展托位，买加速沙漏</td></tr>' +
      '<tr><td>🎖️ 照顾等级</td><td>照顾小生物得经验</td><td>升级解锁更高级照顾道具（环绕音响 / 猫爬架 / 高蛋白营养液 / 营养大餐）</td></tr></table>';
    h += '<p>注意：胶囊券<b>不能买</b>，只能靠学习挣。所以每一次扭蛋，都是你真的学过。</p>';

    h += '<h3>三、养一只小生物的全流程</h3>';
    h += '<div class="step"><b>1</b><div>扭蛋拿到<b>胶囊</b>。胶囊里是植物 / 真菌 / 藻类，就去<b>温室</b>；是动物，就去<b>孵化仓</b>。放错地方不孵化。</div></div>';
    h += '<div class="step"><b>2</b><div>等孵化进度走完（普通 15 分钟 / 稀有 40 分钟 / 传说 80 分钟），点<b>破壳</b>。离线也会继续孵化。<br><span style="color:#B8791C">⚠️ 破壳前要先过「破壳测验」：<b>答对 1 道题</b>就能出生（答错可再答一次，并看解析）——见第七节。</span></div></div>';
    h += '<div class="step"><b>3</b><div>破壳后开始照顾：<b>水分、营养、清洁</b>三条状态会随时间下滑。植物用浇水/施肥/除虫，动物用喂水/喂食/洗澡。</div></div>';
    h += '<div class="step"><b>4</b><div>某项状态归零超过 2 小时，它就可能<b>生病</b>。要买对症的药水（买错了不生效），病超过 24 小时会进入休眠。</div></div>';
    h += '<div class="step"><b>5</b><div>成长值到 100 / 300 / 700 会进阶：幼体 → 成长 → 成熟 → 圆满，每次进阶都有额外可可豆。</div></div>';

    h += '<h3>四、每天喂哪 7 样：投喂单 + 加餐</h3>';
    h += '<p>学习页最上面是<b>「今日投喂单」</b>——每天固定 7 样，进度条只数这 7 件：</p>';
    h += '<table class="mini"><tr><th>#</th><th>喂什么</th><th>怎么算喂到</th></tr>' +
      '<tr><td>1</td><td>📖 读书</td><td>精读任务登记一次（哪一本你定，一本 8 天）</td></tr>' +
      '<tr><td>2–5</td><td>✍️ 四科刷题</td><td>法规 / 业务 / 全导 / 地导，每科 30 道，各算一笔</td></tr>' +
      '<tr><td>6</td><td>🎤 导游词</td><td>在「练习台」里任选一篇：前 12 天通读，第 13 天起默讲</td></tr>' +
      '<tr><td>7</td><td>🗣️ 综合问答</td><td>在「练习台」里看参考答案，练够 10 道问答题</td></tr>' +
      '</table>';
    h += '<p>7 件全喂满，当天额外 <b>+2 券 / +50 豆</b>，连着喂满 7 天和 30 天还有成就。</p>';
    h += '<p>7 件之外是<b>「加餐」</b>：课后练习、章节框架图、合书自测、昨日回照、费曼工作坊、合稿默讲……这些<b>做不做都行</b>，不计入 7 件，少做一件也不会让你"今天没做完"。有精力就加一口，没精力就明天再说。</p>';

    h += '<h3>五、课本精读：登记式，三步走完</h3>';
    h += '<p>精读是一张登记表——<b>能填出这两栏，就说明你今天真的翻过书</b>：</p>';
    h += '<div class="step"><b>1</b><div><b>选了哪一本</b>（必答）。四选一，顺序完全由你定，不想先读法规就先读别的。</div></div>';
    h += '<div class="step"><b>2</b><div><b>今天读了什么</b>（必答）。章节、页数、范围都行，比如「第三章 3.2 节，P78–P96」。要写满几个字，光填个数字不算。</div></div>';
    h += '<div class="step"><b>3</b><div><b>笔记 / 感想</b>（选填）。愿意写就写两句，也可以拍一张手写笔记的照片。空着照样结算。</div></div>';
    h += '<p>登记的内容会连同时间戳存进<b>证据库</b>，日后能回头看"这本书我是哪天读到哪儿的"。一本书攒够 8 次，就算读完一遍。</p>';

    h += '<h3>六、学习验证链路：做了就是做了</h3>';
    h += '<p>这里<b>没有任何倒计时</b>，也不攒什么碎片——<b>做了就是做了，没做就是没做</b>：做完当场登记，奖励足额马上发，今天的格子立刻亮一个。</p>';
    h += '<table class="mini"><tr><th>关卡</th><th>它怎么防止你糊弄</th></tr>' +
      '<tr><td>① 精读登记</td><td>「选哪本 + 读了什么」两栏必答，内容进证据库。这一栏逼你把"读过"变成一句能说出来的话。</td></tr>' +
      '<tr><td>② 文字记录</td><td>回照、网课、框架图这类任务，交的时候要写一段<b>自己的话</b>（有最低字数），写完当场结算存档。写作这一动作就完成了一次「复述」。</td></tr>' +
      '<tr><td>③ 凭证上传</td><td>刷题、网课、模考任务要传一张<b>准题库的完成页/成绩页截图</b>；导游词任务改成<b>截图 + 看法</b>：在另一个 App 练完截一张图带过来，再写/录一句「看法」（看法可录一段音代替打字）。</td></tr>' +
      '<tr><td>④ 输出与成像</td><td>深挖、框架图、法规速记都要写<b>费曼卡</b>或拍框架图（粘贴会被记录）；反思象限用「昨日回照」两句话逼你说出"还是模糊的那一点"。</td></tr></table>';
    h += '<div class="warnbox">⚠️ 坦白说：如果你铁了心要作弊，总能找到办法（比如随便传张旧截图）。但这个链路的目标是<b>让作弊比学习更麻烦</b>，同时又不至于让"今天只学了 15 分钟"变成一件有负担的事。真正能约束你的只有一个东西：11 月 21 日那天考场上只有你一个人。</div>';
    h += '<div class="hintbox" style="margin-top:10px">📌 另外：<b>这里没有错题本</b>。你另一个 App 已经在管错题了，这个游戏不再碰它。反思象限换成「昨日回照」，就写两句话，不抄题、不整理。</div>';

    h += '<h3>七、破壳测验（小生物出生前的关卡）</h3>';
    h += '<p>小生物要从温室 / 孵化仓出来的那一刻，先过「破壳测验」：<b>每次 1 道题</b>，<b>答对就破壳</b>。答错了不破壳，可以再答一题；第二次还错，会给你看这道题的解析，看完同样能破壳（无限次数、不扣任何东西）。这样既挡住乱点破壳，又不让人卡住。</p>';
    h += '<p>这是整个游戏<b>唯一</b>带倒计时的地方，因为它要的就是考场那点限时感。学习任务那边仍然没有任何倒计时，两者是两回事，别混。</p>';
    h += '<table class="mini"><tr><th>它在做什么</th><th>怎么做的</th></tr>' +
      '<tr><td>抽题</td><td>四科轮流取，一张卷子尽量四科都沾到；每次都是<b>新抽</b>的。</td></tr>' +
      '<tr><td>防背答案</td><td>每道题的<b>选项顺序都会重新打乱</b>，记住"答案是 B"没用。</td></tr>' +
      '<tr><td>交卷</td><td>可以随时交；时间到<b>自动交卷</b>，没答的算错。</td></tr>' +
      '<tr><td>复盘</td><td>交卷后直接列出错题：你选了什么、正确答案、解析。看一眼再答下一份。</td></tr>' +
      '<tr><td>留档</td><td>成绩存一份进<b>证据库</b>，日后能回看"为了这只小生物我答过几份卷子"。</td></tr></table>';
    h += '<div class="hintbox">📥 <b>题库现在还是空的。</b>端口已经接好了：在「🙋 我的」页找到「破壳题库」，粘贴导入即可，不用改代码。' +
      '<b>题库为空时闸门自动放行</b>，所以现在小生物照常出生，不影响你玩。</div>';
    h += '<p style="font-size:12.5px;color:#8AA394;margin-top:8px">题目考什么、从哪来，完全由你决定。这个游戏不判断题目好坏，只负责在你最想要东西的那一刻（小生物要出来了）拦一下，让你顺手刷十道。</p>';

    h += '<h3>八、任务为什么这样发：费曼 + 库伯学习圈</h3>';
    h += '<p>每条任务都标了所属象限，你可以在学习页看到四个格子。四格都亮，额外奖励 +1 券 / +30 豆。</p>';
    h += '<div class="grid-4" style="margin-top:10px">';
    D.KOLB.forEach(function (k) {
      h += '<div class="kolb-cell on" style="border-color:' + k.color + '55">' +
        '<div class="k-emoji">' + k.emoji + '</div>' +
        '<div class="k-name" style="color:' + k.color + '">' + k.name + '</div>' +
        '<div style="font-size:11.5px;color:#5B7263;margin-top:5px">' + k.desc + '</div></div>';
    });
    h += '</div>';
    h += '<p style="margin-top:12px"><b>费曼卡</b>的字段是刻意设计的：<code>概念</code> → <code>用大白话讲一遍</code> → <code>哪里卡住了</code> → <code>打个比方</code>。"卡住的地方"就是你的知识漏洞，写下来才算真的发现它。</p>';

    h += '<h3>九、70 天怎么分</h3>';
    h += '<table class="mini"><tr><th>阶段</th><th>天数</th><th>主线</th></tr>';
    D.PHASES.forEach(function (p) {
      h += '<tr><td><b>' + p.tag + ' ' + p.name + '</b></td><td>' + p.days + ' 天</td><td>' + esc(p.detail) + '</td></tr>';
    });
    h += '</table>';
    h += '<p>阶段一每天固定的 7 件是：精读 1 次 + 四科各 30 道 + 导游词 1 篇 + 综合问答 10 道。导游词不指定具体篇目，你在「练习台」里任选一篇：前 12 天通读，第 13 天起默讲。阶段二、三同样保持这 7 件主线，只是导游词的要求随天数自动切换。</p>';
    h += '<div class="hintbox">📖 <b>读哪本由你定。</b>精读登记的第一步就是四选一，进度按本记录，每本 8 天。上来先读法规读不下去？那就先读导游业务或全导，顺序不影响结果。</div>';

    h += '<h3>十、12 篇导游词（2025 云南考区科目五 · 中文类）</h3>';
    h += '<p>我把这 12 个景点和<b>每个景点的讲解顺序</b>做进了「练习台」，任务不再限定你今天必须读哪一篇。你可以按自己的节奏任选：哪篇不熟练哪篇，每天一篇，12 天后进入默讲阶段。</p>';
    h += '<table class="mini"><tr><th>#</th><th>景点</th><th>模拟团型</th><th>讲解顺序</th></tr>';
    D.SCRIPTS.forEach(function (sc, i) {
      h += '<tr><td>' + (i + 1) + '</td><td>' + esc(sc.name) + '</td><td>' + sc.group + '</td><td style="font-size:11.5px">' + sc.nodes.join(' → ') + '</td></tr>';
    });
    h += '</table>';
    h += '<p style="font-size:12.5px;color:#8AA394">说明：这份名单和讲解顺序来自云南省 2025 年科目五考试大纲（中文类 12 个景点）。考试形式通常是抽取若干景点后选择一个讲解，所以 12 篇都要准备。导游词正文请以官方指定教材或云南省文旅培训中心的材料为准，本游戏只负责排进度和逼你开口。</p>';

    h += '<h3>十一、每天怎么用</h3>';
    h += '<div class="step"><b>1</b><div>打开「今日投喂」，最上面就是投喂单的 7 个格子——今天喂了几样，一眼看得见。下面「加餐」区是额外的，不用管它。</div></div>';
    h += '<div class="step"><b>2</b><div>精读点「📖 去精读」：选一本、填今天读到哪儿，交了就完事。笔记想写两句就写，不想写就空着。</div></div>';
    h += '<div class="step"><b>3</b><div>点「📝 去记录 / ✍️ 去登记」：写一段今日收获、登记题量，或者传截图。做完当场结算——做了就是做了，奖励马上发。</div></div>';
    h += '<div class="step"><b>4</b><div>导游词点「📸 去凭证」：在另一个 App 里通读/背诵，截一张图带过来，再写/录一句「看法」。结算后拿券和豆。</div></div>';
    h += '<div class="step"><b>5</b><div>7 件全喂满会额外给 +2 券 / +50 豆。用挣来的资源去扭蛋、养小生物——它们会催你明天再来。</div></div>';
    h += '<div class="step"><b>6</b><div>孵化好了先别急着点破壳——会弹 <b>1 道题</b>的破壳测验（答错可再答一次、看解析）。答对了它才出来。</div></div>';

    h += '<h3>十二、换设备 / 换浏览器怎么办</h3>';
    h += '<p><b>登录一次，处处同步</b>：点顶栏的云朵 ☁️，用一个邮箱登录（收 6 位验证码即可）。之后进度自动上云——手机、电脑、iPad、任何浏览器，打开就是最新进度，什么都不用管。</p>';
    h += '<div class="step"><b>1</b><div>主设备：点顶栏 ☁️ → 填邮箱 → 收验证码 → 登录。</div></div>';
    h += '<div class="step"><b>2</b><div>其他设备：打开同一个游戏，点 ☁️ → 用<b>同一个邮箱</b>登录一次。</div></div>';
    h += '<div class="step"><b>3</b><div>完事。本机一有变化几秒内自动推送；换设备打开时自动接上最新进度（冲突时谁的新用谁的，覆盖前还会自动备份）。</div></div>';
    h += '<p style="margin-top:10px">没网 / 不想登录也照常玩，进度存本机。老办法「🔗 跨设备同步码」仍然保留在证据库里，当作备用通道。</p>';
    h += '<div class="hint">证据库里的<b>录音 / 截图原件</b>存在各设备本地，云端同步的是进度与文字记录——原件太大，会拖慢同步。</div>';
    h += '<p style="font-size:12.5px;color:#8AA394;margin-top:14px">祝你 11 月 21 日走进考场的时候，是这 70 天里最好的一次状态。</p>';
    h += '</div>';
    return h;
  }

  /* =========================================================
   * 事件绑定
   * ========================================================= */
  function wireView() {
    $$('#view [data-act]').forEach(function (el) {
      el.onclick = function () { onAction(el.dataset.act, el); };
    });
  }

  function onAction(act, el) {
    const ds = el.dataset;
    if (act === 'practice-open') return openPracticePanel(practiceTab || 'interview');
    if (act === 'practice-tab') return openPracticePanel(ds.tab);
    if (act === 'goto-docs') return switchTab('docs');
    if (act === 'goto-notes') return switchTab('notes');
    if (act === 'goto-evidence') return switchTab('evidence');
    if (act === 'goto-me') return switchTab('me');
    /* ---- v1.18 大世界：机器 / 建筑 / 剧情 ---- */
    if (act === 'm-close') { closeModal(); return; }
    if (act === 'z-enter') return openZoneModal(ds.id);
    if (act === 'm-gacha') return openMachineModal('gacha');
    if (act === 'm-incubator') return openMachineModal('incubator');
    if (act === 'm-storage') return openMachineModal('storage');
    if (act === 'story-play') {
      const k = window.Game.pendingStory();
      if (!k) { let msg = '现在没有新剧情。'; if (!window.Game.storySeen('labor')) msg = '照顾等级到 Lv.3、且至少 3 只成年小生物时，会有人来找你。';
        else if (!window.Game.buildGate().ok) msg = window.Game.buildGate().msg;
        return toast(msg, 'warn'); }
      return openStoryModal(k);
    }
    if (act === 'build-open') return openBuildingModal(ds.id);
    if (act === 'bx-up') return openBuildingModal(ds.id, true);
    if (act === 'bx-pick') {
      if (bxState) bxState[ds.role] = el.value || null;
      const go = $('[data-act="bx-go"][data-id="' + bxId + '"]', activeMask() || document);
      if (go) go.disabled = !(bxState && bxState.animal && bxState.plant && bxState.fungus);
      return;
    }
    if (act === 'bx-go') {
      const r = window.Game.buildStart(ds.id, bxState || {});
      if (!r.ok) return toast('❌ ' + r.msg, 'err');
      playSfx('build');
      toast('✅ ' + r.msg, 'ok', 7000);
      closeModal();
      const nk = window.Game.pendingStory();
      render();
      /* 建好一栋 → 下一栋的剧情接着来 */
      if (r.built && nk) setTimeout(function () { if (!activeMask()) openStoryModal(nk); }, 700);
      return;
    }
    if (act === 'bx-unstaff') {
      const r = window.Game.removeStaff(ds.id, ds.pet);
      toast((r.ok ? '👋 ' + r.msg : '❌ ' + r.msg), r.ok ? 'ok' : 'err');
      if (bxPaint) bxPaint(); else render();
      renderTop();
      return;
    }
    if (act === 'bx-staff') {
      if (!el.value) return;
      const r = window.Game.addStaff(ds.id, el.value);
      toast((r.ok ? '👜 ' + r.msg : '❌ ' + r.msg), r.ok ? 'ok' : 'err');
      if (bxPaint) bxPaint(); else render();
      renderTop();
      return;
    }
    if (act === 'bx-stock') {
      const r = window.Game.canteenStock(ds.id, ds.item);
      toast((r.ok ? '🥣 ' + r.msg : '❌ ' + r.msg), r.ok ? 'ok' : 'err');
      if (bxPaint) bxPaint(); else render();
      return;
    }
    if (act === 'bx-do') {
      const k = ds.kind;
      if (k === 'museum') return openMuseumModal();
      let r = null;
      if (k === 'canteen') r = window.Game.canteenRun(ds.id);
      else if (k === 'bath') r = window.Game.bathRun(ds.id);
      else if (k === 'library') r = window.Game.libraryRun(ds.id);
      else if (k === 'travel') r = window.Game.travelRun(ds.id);
      if (!r) return;
      toast((r.ok ? '✅ ' : '❌ ') + r.msg, r.ok ? 'ok' : 'warn', 6500);
      if (r.ok) {
        if (k === 'canteen') playSfx('food');
        else if (k === 'bath') playSfx('bath');
        else if (k === 'library') playSfx('music');
        else if (k === 'travel') playCheer();
      }
      if (bxPaint) bxPaint(); else render();
      renderTop();
      return;
    }
    if (act === 'wrong-open') return openWrongQuiz();
    if (act === 'zh-open') return openPracticePanel('interview');
    if (act === 'sp-open-hub') return openPracticePanel('script');
    if (act === 'ev-open') return openEvidenceFile(ds.id);
    if (act === 'task-verify') return openVerifyModal(window.Study.taskByUid(ds.uid));
    if (act === 'task-log') return showTaskLog(ds.uid);
    if (act === 'task-new') return openTaskBuilder();
    if (act === 'task-del') {
      if (!confirm('删掉这条自建任务？之前的完成记录会留着，只是以后不再出现。')) return;
      const n = window.Study.removeUserTask(ds.tpl);
      toast(n ? '🗑 已删掉这条自建任务。' : '没找到这条任务，可能已经删过了。', n ? 'ok' : 'warn');
      return render();
    }
    if (act === 'me-edit') return openProfileModal();
    if (act === 'place') {
      const r = window.Game.placeCapsule(ds.id, ds.home);
      toast((r.ok ? '🌱 已经放进' + window.Game.homeName(ds.home) + '，开始孵化。' : '❌ ' + r.msg), r.ok ? 'ok' : 'err');
      return render();
    }
    if (act === 'hatch') {
      const g = window.Game.quizGate(ds.id);
      if (g.on && !g.passed) return openHatchQuizModal(ds.id);
      return doHatch(ds.id);
    }
    if (act === 'qbank-open') return openQbankModal();
    if (act === 'qbank-clear') {
      const s = window.QBank.summary();
      if (!s.custom) return;
      if (!confirm('清空你自己导入的 ' + s.custom + ' 题？内置题库不受影响。')) return;
      const n = window.QBank.clearCustom();
      toast('已清空 ' + n + ' 题。', 'ok');
      return render();
    }
    if (act === 'speedup') {
      const r = window.Game.speedUp(ds.id);
      toast((r.ok ? '⏳ 推进了 30 分钟。' : '❌ ' + r.msg), r.ok ? 'ok' : 'err');
      return render();
    }
    if (act === 'expand') {
      const id = ds.kind === 'greenhouse' ? 'slot_green' : 'slot_hatch';
      const r = window.Game.buy(id, 1);
      toast((r.ok ? '🏡 ' + r.msg : '❌ ' + r.msg), r.ok ? 'ok' : 'err');
      render();
      /* 孵化仓弹窗里的托位也要跟着刷新 */
      if (activeMask() && $('#modal-root .prow-slots')) openMachineModal('incubator');
      return;
    }
    if (act === 'care') {
      const r = window.Game.care(ds.id, ds.care);
      toast((r.ok ? r.msg : '❌ ' + r.msg), r.ok ? 'ok' : 'err');
      return render();
    }
    if (act === 'heal') return openHealModal(ds.id);
    if (act === 'pet-open' || act === 'pet-info') return openCreatureModal(ds.id);
    if (act === 'pod-toggle') { podOpen = !podOpen; return renderView(); }
    if (act === 'store-pet') {
      const r = window.Game.storePet(ds.id);
      toast((r.ok ? '📦 ' + r.msg : '❌ ' + r.msg), r.ok ? 'ok' : 'err');
      return render();
    }
    if (act === 'unstore-pet') {
      const r = window.Game.unstorePet(ds.id);
      toast((r.ok ? '📭 ' + r.msg : '❌ ' + r.msg), r.ok ? 'ok' : 'err');
      return render();
    }
    if (act === 'cap-open') return openCapsuleModal(ds.id);
    if (act === 'pull') return doPull(parseInt(ds.n, 10));
    if (act === 'qty') {
      const id = ds.id;
      shopQty[id] = Math.max(1, Math.min(20, (shopQty[id] || 1) + parseInt(ds.d, 10)));
      const e2 = $('#qty-' + id);
      if (e2) e2.textContent = shopQty[id];
      const btn = document.querySelector('[data-act="buy"][data-id="' + id + '"]');
      if (btn) btn.dataset.qty = shopQty[id];
      return;
    }
    if (act === 'buy') {
      const r = window.Game.buy(ds.id, parseInt(ds.qty || '1', 10));
      toast((r.ok ? r.msg : '❌ ' + r.msg), r.ok ? 'ok' : 'err');
      return render();
    }
    if (act === 'ev-filter') { evFilter = ds.k; return renderView(); }
    if (act === 'play') return playEvidence(ds.id, el);
    if (act === 'ev-del') {
      if (!confirm('确定删除这份凭证？删除后无法恢复。')) return;
      window.Store.removeEvidence(ds.id).then(function () { renderView(); toast('已删除。', 'ok'); });
      return;
    }
    if (act === 'doc-open') {
      const d = (D.DOCS || []).filter(function (x) { return x.id === ds.id; })[0];
      if (d) openDocViewer(d); else toast('找不到这份资料。', 'err');
      return;
    }
    if (act === 'note-new') {
      const title = ($('#note-title') || {}).value || '';
      const body = ($('#note-body') || {}).value || '';
      if (!body.trim() && !title.trim()) { toast('写点什么再保存吧～', 'warn'); return; }
      window.Store.addNote({ kind: 'text', title: title, text: body }).then(function () {
        toast('💾 笔记已保存。', 'ok');
        renderView();
      });
      return;
    }
    if (act === 'note-upload') {
      const inp = $('#note-file');
      const file = inp && inp.files && inp.files[0];
      if (!file) { toast('先选一个文件再上传。', 'warn'); return; }
      const name = file.name;
      const isText = /\.(txt|md)$/i.test(name) || file.type === 'text/plain' ||
        file.type === 'text/markdown' || file.type === 'text/x-markdown';
      if (isText) {
        if (typeof file.text === 'function') {
          file.text().then(function (txt) {
            window.Store.addNote({ kind: 'text', title: name, text: txt }).then(function () {
              toast('📝 已存入文字笔记。', 'ok'); renderView();
            });
          }).catch(function () { toast('读取文件失败。', 'err'); });
        } else {
          /* 老环境：降级用 FileReader */
          const fr = new FileReader();
          fr.onload = function () {
            window.Store.addNote({ kind: 'text', title: name, text: String(fr.result) }).then(function () {
              toast('📝 已存入文字笔记。', 'ok'); renderView();
            });
          };
          fr.onerror = function () { toast('读取文件失败。', 'err'); };
          fr.readAsText(file);
        }
      } else {
        window.Store.addNote({ kind: 'file', title: name, blob: file, mime: file.type }).then(function () {
          toast('📄 文件已上传，随时可看。', 'ok'); renderView();
        });
      }
      return;
    }
    if (act === 'note-open') {
      const n = (S.notes || []).filter(function (x) { return x.id === ds.id; })[0];
      if (n) openNoteViewer(n); else toast('找不到这条笔记。', 'err');
      return;
    }
    if (act === 'note-del') {
      if (!confirm('删除这条笔记？删除后无法恢复。')) return;
      window.Store.removeNote(ds.id).then(function () { renderView(); toast('已删除。', 'ok'); });
      return;
    }
    if (act === 'export') return doExport();
    if (act === 'import') return doImport();
    if (act === 'reset') return doReset();
    if (act === 'sync') return openSyncModal();
    if (act === 'save-open') return openSaveModal();
    if (act === 'save-code') return takeSaveCode(ds.id);
    if (act === 'save-load') return loadSaveSlot(ds.id);
    if (act === 'save-del') {
      if (!window.confirm('删掉这份存档？删了就找不回来了。')) return;
      window.Store.removeSave(ds.id);
      return render();
    }
  }

  /* ---------------- 云端同步弹窗 ---------------- */
  /* 把云端 SDK 的生硬报错翻译成人话（服务方平台故障时最常见） */
  function doHatch(id) {
    const r = window.Game.hatch(id);
    if (!r.ok) {
      /* 逻辑层说"要先过测验" → 直接开考，别给松果甩一个错误提示 */
      if (r.needQuiz) return openHatchQuizModal(id);
      return toast('❌ ' + r.msg, 'err');
    }
    const sp = r.species;
    confetti(sp.rarity >= 2 ? 60 : 28);
    openModal({
      title: '🎉 破壳！',
      body: '<div style="text-align:center">' +
        '<div style="font-size:66px">' + sp.emoji + '</div>' +
        '<div style="font-size:18px;font-weight:700;color:#2E7A4C;margin-top:6px">' + esc(r.pet.name) +
        ' <span class="badge-rar rar-' + sp.rarity + '">' + rarityName(sp.rarity) + '</span></div>' +
        '<div style="font-size:13.5px;color:#5B7263;margin-top:6px">' + esc(sp.name) + ' · 来自 ' + esc(sp.home) + '</div>' +
        '<div class="okbox" style="margin-top:14px;text-align:left">' + esc(sp.tip) + '</div>' +
        '<div class="field" style="margin-top:14px;text-align:left"><label>给它起个名字</label>' +
        '<input type="text" id="hn" value="' + esc(r.pet.name) + '" maxlength="12"></div>' +
        '</div>',
      foot: '<button class="btn btn-primary" id="hn-ok">就叫这个</button>',
      onMount: function (mask) {
        $('#hn-ok', mask).onclick = function () {
          window.Game.renamePet(r.pet.id, $('#hn', mask).value || r.pet.name);
          closeModal();
          toast('🌿 ' + esc(r.pet.name) + ' 正式住进' + window.Game.homeName(window.Game.homeOf(sp)) + '了。记得常来看看它。', 'ok', 6000);
          render();
        };
      }
    });
  }

  /* =========================================================
   * 破壳测验
   * 小生物出生前的关卡：每次 1 题，答对即破壳；答错可再答一次并看解析。
   * 这是全游戏唯一带倒计时的地方 —— 因为它就是要模拟考场那点限时感。
   * 学习任务仍然没有任何倒计时（那是另一回事）。
   * ========================================================= */
  /* ---------------- 错题复习（自由练习，不限破壳时） ----------------
     全游戏唯一带倒计时的是破壳测验；这里不计时，点开就做，做完看成绩。 */
  let wz = null;
  function openWrongQuiz() {
    const all = window.QBank.all();
    if (!all.length) return toast('题库还是空的，先去「我的 → 破壳题库」粘贴错题', 'warn');
    const n = Math.min(10, all.length);
    const paper = window.QBank.makePaper(n, { mastered: false });
    if (!paper.length) return toast('错题都掌握了，没有可复习的～', 'ok');
    wz = {
      paper: paper,
      answers: paper.map(function () { return []; }),
      idx: 0,
      checked: false,
      done: false,
      result: null
    };
    openModal({
      title: '📕 错题复习 · 自由练习',
      body: '<div id="wz-body"></div>',
      foot: '<div id="wz-foot"></div>',
      onClose: function () { wz = null; },
      onMount: function (mask) { renderWrongQuiz(mask); }
    });
  }

  function renderWrongQuiz(mask) {
    if (!wz || !mask) return;
    if (wz.done) return renderWrongResult(mask);
    const body = $('#wz-body', mask), foot = $('#wz-foot', mask);
    if (!body || !foot) return;
    const p = wz.paper[wz.idx];
    const total = wz.paper.length;
    const checked = wz.checked;
    const sel = wz.answers[wz.idx] || [];

    let h = '<div class="qz-bar">' +
      '<span class="qz-pill">第 ' + (wz.idx + 1) + ' / ' + total + ' 题</span>' +
      (p.multi ? '<span class="qz-pill qz-multi">多选</span>' : '') +
      '</div>';
    h += '<div class="qz-progress"><i style="width:' + ((wz.idx + 1) / total * 100) + '%"></i></div>';
    h += '<div class="qz-stem">' + esc(p.stem) + '</div>';
    h += '<div class="qz-opts">';
    p.options.forEach(function (o, i) {
      let cls = 'qz-opt';
      if (checked) {
        const isAns = p.answer.indexOf(i) >= 0;
        const isSel = sel.indexOf(i) >= 0;
        if (isAns) cls += ' correct';
        else if (isSel) cls += ' wrong';
      } else if (sel.indexOf(i) >= 0) {
        cls += ' on';
      }
      h += '<button class="' + cls + '" data-wz="pick" data-i="' + i + '">' +
        '<b>' + 'ABCDEFGH'.charAt(i) + '</b><span>' + esc(o) + '</span></button>';
    });
    h += '</div>';

    if (checked) {
      const ok = window.QBank.grade([p], [sel]).detail[0].ok;
      h += '<div class="qz-fb ' + (ok ? 'ok' : 'no') + '">' + (ok ? '✅ 答对了' : '❌ 答错了') + '</div>';
      if (p.explain) h += '<div class="qz-explain"><b>解析：</b>' + esc(p.explain) + '</div>';
    }

    body.innerHTML = h;

    if (!checked) {
      foot.innerHTML = '<button class="btn btn-primary" data-wz="reveal">看答案</button>';
    } else {
      const last = wz.idx >= total - 1;
      foot.innerHTML = (wz.idx > 0 ? '<button class="btn btn-ghost" data-wz="prev">上一题</button>' : '') +
        (last ? '<button class="btn btn-primary" data-wz="finish">看成绩</button>'
              : '<button class="btn btn-primary" data-wz="next">下一题</button>');
    }

    $$('[data-wz]', mask).forEach(function (el) {
      el.onclick = function () { onWrongAct(el.dataset.wz, parseInt(el.dataset.i, 10)); };
    });
  }

  function onWrongAct(act, i) {
    if (!wz || wz.done) return;
    const mask = activeMask();
    if (act === 'pick') {
      if (wz.checked) return;            /* 揭晓后不能再改 */
      const p = wz.paper[wz.idx];
      const arr = wz.answers[wz.idx] || [];
      if (p.multi) {
        const pos = arr.indexOf(i);
        if (pos >= 0) arr.splice(pos, 1); else arr.push(i);
        wz.answers[wz.idx] = arr;
      } else {
        wz.answers[wz.idx] = [i];
      }
      return renderWrongQuiz(mask);
    }
    if (act === 'reveal') { wz.checked = true; return renderWrongQuiz(mask); }
    if (act === 'prev') { wz.idx = Math.max(0, wz.idx - 1); wz.checked = !!(wz.answers[wz.idx] && wz.answers[wz.idx].length > 0); return renderWrongQuiz(mask); }
    if (act === 'next') { wz.idx = Math.min(wz.paper.length - 1, wz.idx + 1); wz.checked = !!(wz.answers[wz.idx] && wz.answers[wz.idx].length > 0); return renderWrongQuiz(mask); }
    if (act === 'finish') {
      wz.done = true;
      wz.result = window.QBank.grade(wz.paper, wz.answers);
      return renderWrongResult(mask);
    }
  }

  function renderWrongResult(mask) {
    if (!wz || !mask) return;
    const body = $('#wz-body', mask), foot = $('#wz-foot', mask);
    if (!body || !foot) return;
    const r = wz.result;
    const pct = Math.round(r.rate * 100);
    let h = '<div class="qz-score ' + (r.correct === r.total ? 'ok' : 'no') + '">' +
      '<div class="qz-score-num">' + r.correct + '<span>/' + r.total + '</span></div>' +
      '<div class="qz-score-sub">正确率 ' + pct + '%</div>' +
      '<div class="qz-score-line">' + (r.correct === r.total ? '🎉 全对！' : '复习一遍，下次破壳更稳') + '</div></div>';
    const wrong = r.detail.filter(function (d) { return !d.ok; });
    if (wrong.length) {
      h += '<div class="qz-review"><div class="qz-review-h">📝 这 ' + wrong.length + ' 题再看一眼</div>';
      wrong.forEach(function (d) {
        const p = wz.paper[d.i];
        h += '<div class="qz-review-item"><div class="qz-review-q">' + (d.i + 1) + '. ' + esc(p.stem) + '</div>' +
          '<div class="qz-review-a">正确答案：' + d.answer.map(function (x) { return 'ABCDEFGH'.charAt(x); }).join('') + '</div></div>';
      });
      h += '</div>';
    }
    body.innerHTML = h;
    foot.innerHTML = '<button class="btn btn-primary" data-wz="again">再来一组</button>' +
      '<button class="btn btn-ghost" data-wz="close">关闭</button>';
    $$('[data-wz]', mask).forEach(function (el) {
      el.onclick = function () {
        if (el.dataset.wz === 'again') { closeModal(); openWrongQuiz(); }
        else closeModal();
      };
    });
  }

  function openHatchQuizModal(capId) {
    const c = S.capsules.filter(function (x) { return x.id === capId; })[0];
    if (!c) return toast('❌ 找不到这颗胶囊', 'err');
    const gate = window.Game.quizGate(capId);
    /* 题库没接、或者已经过了 → 不挡路 */
    if (!gate.on || gate.passed) return doHatch(capId);

    const cfg = window.Game.quizCfg();
    const sp = window.Game.speciesById(c.speciesId);
    const paper = window.QBank.makePaper(gate.count);
    if (!paper.length) return doHatch(capId);

    qz = {
      capId: capId,
      sp: sp,
      paper: paper,
      answers: paper.map(function () { return []; }),
      previousIds: [],
      attempt: 1,
      idx: 0,
      endsAt: Date.now() + (cfg.minutes || 5) * 60000,
      timer: null,
      done: false,
      result: null
    };

    openModal({
      title: '🧠 破壳测验 · ' + esc(sp.name),
      body: '<div id="qz-body"></div>',
      foot: '<div class="qz-foot" id="qz-foot"></div>',
      onClose: function () {
        if (qz && qz.timer) clearInterval(qz.timer);
        qz = null;   /* 中途关掉＝放弃这一份，不计成绩、没有惩罚，回来重开一份新的 */
      },
      onMount: function (mask) {
        renderQuiz(mask);
        qz.timer = setInterval(function () { tickQuiz(mask); }, 1000);
      }
    });
  }

  function activeMask() { return $('#modal-root .modal-mask'); }

  function renderQuiz(mask) {
    if (!qz || !mask) return;
    if (qz.done) return renderQuizResult(mask);
    const body = $('#qz-body', mask), foot = $('#qz-foot', mask);
    if (!body || !foot) return;

    const p = qz.paper[qz.idx];
    const left = Math.max(0, Math.round((qz.endsAt - Date.now()) / 1000));
    const answered = qz.answers.filter(function (a) { return Array.isArray(a) && a.length > 0; }).length;
    const line = window.QBank.passLine(qz.paper.length);

    let h = '<div class="qz-bar">' +
      '<span class="qz-clock' + (left <= 60 ? ' urgent' : '') + '" id="qz-clock">⏱️ ' + fmtClock(left) + '</span>' +
      '<span class="qz-pill">第 ' + (qz.idx + 1) + ' / ' + qz.paper.length + ' 题</span>' +
      '<span class="qz-pill">已答 ' + answered + '</span>' +
      '<span class="qz-pill">答对 ' + line + ' 题及格</span>' +
      (p.multi ? '<span class="qz-pill qz-multi">多选</span>' : '') +
      '</div>';
    h += '<div class="qz-progress"><i style="width:' + ((qz.idx + 1) / qz.paper.length * 100) + '%"></i></div>';

    h += '<div class="qz-stem">' + esc(p.stem) + '</div>';

    h += '<div class="qz-opts">';
    const selected = qz.answers[qz.idx] || [];
    p.options.forEach(function (o, i) {
      const on = p.multi ? (selected.indexOf(i) >= 0) : (selected.length === 1 && selected[0] === i);
      h += '<button class="qz-opt' + (on ? ' on' : '') + '" data-qz="pick" data-i="' + i + '">' +
        '<b>' + 'ABCDEFGH'.charAt(i) + '</b><span>' + esc(o) + '</span></button>';
    });
    h += '</div>';

    h += '<div class="qz-sheet"><span class="qz-sheet-k">答题卡</span>' +
      qz.paper.map(function (_, i) {
        const cur = i === qz.idx ? ' cur' : '';
        const on = (qz.answers[i] && qz.answers[i].length > 0) ? ' on' : '';
        return '<button class="qz-dot' + on + cur + '" data-qz="jump" data-i="' + i + '">' + (i + 1) + '</button>';
      }).join('') +
      '<span class="qz-sheet-h">点题号可以跳过去</span></div>';

    body.innerHTML = h;

    foot.innerHTML =
      '<button class="btn btn-ghost" data-qz="prev"' + (qz.idx === 0 ? ' disabled' : '') + '>上一题</button>' +
      (qz.idx < qz.paper.length - 1
        ? '<button class="btn" data-qz="next">下一题</button>'
        : '<button class="btn" disabled>最后一题</button>') +
      '<button class="btn btn-primary" data-qz="submit">交卷</button>';

    $$('[data-qz]', mask).forEach(function (el) {
      el.onclick = function () { onQuizAct(el.dataset.qz, parseInt(el.dataset.i, 10)); };
    });
  }

  function onQuizAct(act, i) {
    if (!qz || qz.done) return;
    const mask = activeMask();
    if (act === 'pick') {
      const p = qz.paper[qz.idx];
      const arr = qz.answers[qz.idx] || [];
      if (p.multi) {
        const pos = arr.indexOf(i);
        if (pos >= 0) arr.splice(pos, 1); else arr.push(i);
        qz.answers[qz.idx] = arr;
      } else {
        qz.answers[qz.idx] = [i];
      }
      return renderQuiz(mask);
    }
    if (act === 'jump') { qz.idx = Math.max(0, Math.min(qz.paper.length - 1, i)); return renderQuiz(mask); }
    if (act === 'prev') { qz.idx = Math.max(0, qz.idx - 1); return renderQuiz(mask); }
    if (act === 'next') { qz.idx = Math.min(qz.paper.length - 1, qz.idx + 1); return renderQuiz(mask); }
    if (act === 'submit') return submitQuiz(mask, false);
  }

  /* 每秒只改时钟那一小段文字，不重绘整张卷子 */
  function tickQuiz(mask) {
    if (!qz || qz.done) return;
    const left = Math.max(0, Math.round((qz.endsAt - Date.now()) / 1000));
    const el = $('#qz-clock', mask);
    if (el) {
      el.textContent = '⏱️ ' + fmtClock(left);
      el.className = 'qz-clock' + (left <= 60 ? ' urgent' : '');
    }
    if (left <= 0) submitQuiz(mask, true);
  }

  function submitQuiz(mask, timeout) {
    if (!qz || qz.done) return;
    if (qz.timer) { clearInterval(qz.timer); qz.timer = null; }

    const res = window.QBank.grade(qz.paper, qz.answers);
    res.timeout = !!timeout;
    qz.done = true;
    qz.result = res;

    /* 记账：统计 + 存档一条凭证 */
    window.QBank.recordResult(res, qz.capId, qz.sp.name);

    if (res.passed) {
      const masteredIds = [];
      qz.paper.forEach(function (p, i) { if (res.detail[i].ok) masteredIds.push(p.qid); });
      const masteredN = window.QBank.markMastered(masteredIds);
      window.Game.markQuizPassed(qz.capId, res);
      confetti(qz.sp.rarity >= 2 ? 50 : 24);
      if (masteredN > 0) window.Store.pushLog('🎯 破壳测验答对 ' + masteredN + ' 题，已加入“已掌握”，以后不会再出现。');
    } else if (timeout) {
      toast('⏰ 时间到，已自动交卷。', 'warn');
    }
    renderQuizResult(mask);
  }

  function renderQuizResult(mask) {
    if (!qz || !mask) return;
    const body = $('#qz-body', mask), foot = $('#qz-foot', mask);
    if (!body || !foot) return;
    const r = qz.result, sp = qz.sp;
    const pct = Math.round(r.rate * 100);

    function letterArr(arr) {
      return (arr || []).map(function (i) { return 'ABCDEFGH'.charAt(i); }).join('');
    }

    let h = '<div class="qz-score ' + (r.passed ? 'ok' : 'no') + '">' +
      '<div class="qz-score-num">' + r.correct + '<span>/' + r.total + '</span></div>' +
      '<div class="qz-score-sub">正确率 ' + pct + '%　及格线 ' + r.line + ' 题' +
      (r.timeout ? '　⏰ 时间到，已自动交卷' : '') + '</div>' +
      '<div class="qz-score-line">' +
      (r.passed
        ? '🎉 过了！' + esc(sp.name) + ' 可以出来了'
        : '还差 ' + (r.line - r.correct) + ' 题，它得再等等') +
      '</div></div>';

    if (r.passed) {
      const okIds = qz.paper.filter(function (_, i) { return r.detail[i].ok; }).map(function (p) { return p.qid; });
      h += '<div class="okbox" style="margin-top:12px">🎯 答对 ' + okIds.length + ' 题已加入“已掌握”，以后破壳测验里不会再出现。</div>';
    }

    const wrong = r.detail.filter(function (d) { return !d.ok; });
    if (wrong.length) {
      h += '<div class="qz-review"><div class="qz-review-h">📝 这 ' + wrong.length + ' 题再看一眼（不看下一份还是错）</div>';
      wrong.forEach(function (d) {
        const p = qz.paper[d.i];
        const pickedLetters = letterArr(d.picked);
        const answerLetters = letterArr(d.answer);
        const pickedText = pickedLetters ? pickedLetters + ' · ' + d.picked.map(function (i) { return esc(p.options[i]); }).join(' / ') : '没答';
        const answerText = answerLetters + ' · ' + d.answer.map(function (i) { return esc(p.options[i]); }).join(' / ');
        h += '<div class="qz-rv">' +
          '<div class="qz-rv-q">' + (d.i + 1) + '. ' + esc(p.stem) + (p.multi ? ' <span class="badge">多选</span>' : '') + '</div>' +
          '<div class="qz-rv-a">你选了：<b class="no">' + pickedText + '</b></div>' +
          '<div class="qz-rv-a">正确答案：<b class="ok">' + answerText + '</b></div>' +
          (p.explain ? '<div class="qz-rv-e">💡 ' + esc(p.explain) + '</div>' : '') +
          '</div>';
      });
      h += '</div>';
    } else if (!r.passed) {
      h += '<div class="okbox" style="margin-top:12px">这次虽然没过，但没有错题——只是没答完。</div>';
    }

    body.innerHTML = h;

    const canRetry = qz.attempt < (window.Game.quizCfg().maxAttempts || 2);
    foot.innerHTML = r.passed
      ? '<button class="btn btn-primary" data-qz="hatch">🐣 破壳，请它出来</button>'
      : '<button class="btn btn-ghost" data-qz="later">待会儿再来</button>' +
        (canRetry ? '<button class="btn btn-primary" data-qz="retry">再答一题</button>' : '');

    $$('[data-qz]', mask).forEach(function (el) {
      el.onclick = function () {
        const a = el.dataset.qz;
        if (a === 'hatch') { const id = qz.capId; closeModal(); return doHatch(id); }
        if (a === 'later') return closeModal();
        if (a === 'retry') return startNewPaper(mask);
      };
    });
  }

  function startNewPaper(mask) {
    if (!qz) return;
    const gate = window.Game.quizGate(qz.capId);
    const cfg = window.Game.quizCfg();
    qz.previousIds = qz.paper.map(function (p) { return p.qid; });
    const paper = window.QBank.makePaper(gate.count, { excludeIds: qz.previousIds });
    if (!paper.length) return closeModal();

    qz.paper = paper;
    qz.answers = paper.map(function () { return []; });
    qz.idx = 0;
    qz.attempt = (qz.attempt || 1) + 1;
    qz.endsAt = Date.now() + (cfg.minutes || 5) * 60000;
    qz.done = false;
    qz.result = null;
    if (qz.timer) clearInterval(qz.timer);
    qz.timer = setInterval(function () { tickQuiz(mask); }, 1000);
    renderQuiz(mask);
  }

  /* ---------------- 用药 ---------------- */
  function openHealModal(petId) {
    const p = S.pets.filter(function (x) { return x.id === petId; })[0];
    if (!p || !p.illness) return;
    const need = p.illness.cure;
    let body = '<div class="warnbox">😷 <b>' + esc(p.name) + '</b> 得了「' + p.illness.name + '」。对症的药是 <b>' +
      (D.ITEM_MAP[need] ? D.ITEM_MAP[need].name : '未知') + '</b>。买错药不生效，别浪费可可豆。</div>';
    body += '<div class="shop-grid">';
    D.ITEMS.filter(function (i) { return i.kind === 'medicine'; }).forEach(function (it) {
      const own = S.bag[it.id] || 0;
      const isRight = (it.id === need) || it.id === 'med_kit';
      body += '<div class="shop-item"' + (isRight ? ' style="border-color:#CFE7D6;background:#F7FCF8"' : '') + '>' +
        '<div class="si-top"><span class="si-ico">' + it.emoji + '</span><div><div class="si-name">' + it.name + '</div>' +
        '<div class="si-own">持有 ' + own + ' 个' + (isRight ? ' · 对症' : '') + '</div></div></div>' +
        '<div class="si-desc">' + esc(it.desc) + '</div>' +
        '<div class="si-bottom"><span class="price">' + it.price + '</span>' +
        '<button class="btn btn-sm btn-primary" style="margin-left:auto" data-use="' + it.id + '"' + (own > 0 ? '' : ' disabled') + '>用药</button>' +
        '<button class="btn btn-sm" data-buyuse="' + it.id + '" data-price="' + it.price + '">买并用药</button>' +
        '</div></div>';
    });
    body += '</div>';
    const mask = openModal({
      title: '💊 治疗 ' + esc(p.name),
      body: body, wide: true,
      foot: '<button class="btn btn-ghost" id="heal-cancel">再等等</button>',
      onMount: function (m) {
        $('#heal-cancel', m).onclick = closeModal;
        $$('[data-use]', m).forEach(function (b) {
          b.onclick = function () {
            const r = window.Game.heal(petId, b.dataset.use);
            toast((r.ok ? r.msg : '❌ ' + r.msg), r.ok ? 'ok' : 'err');
            closeModal(); render();
          };
        });
        $$('[data-buyuse]', m).forEach(function (b) {
          b.onclick = function () {
            const id = b.dataset.buyuse, price = parseInt(b.dataset.price, 10);
            if (S.cur.beans < price) return toast('❌ 可可豆不够（需要 ' + price + '）', 'err');
            S.cur.beans -= price;
            S.bag[id] = (S.bag[id] || 0) + 1;
            const r = window.Game.heal(petId, id);
            toast((r.ok ? r.msg : '❌ ' + r.msg), r.ok ? 'ok' : 'err');
            closeModal(); render();
          };
        });
      }
    });
    return mask;
  }

  function showPetInfo(petId) {
    const p = S.pets.filter(function (x) { return x.id === petId; })[0];
    if (!p) return;
    const sp = window.Game.speciesById(p.speciesId);
    const st = window.Game.stageOf(p);
    const mins = Math.round((Date.now() - p.bornAt) / 60000);
    let body = '<div style="text-align:center;margin-bottom:12px"><div style="font-size:54px">' + sp.emoji + '</div>' +
      '<div style="font-size:17px;font-weight:700;margin-top:4px">' + esc(p.name) + '</div>' +
      '<div style="font-size:12.5px;color:#8AA394">' + esc(sp.name) + ' · ' + rarityName(sp.rarity) + ' · ' + st.name + '</div></div>';
    body += '<div class="okbox" style="text-align:left">' + esc(sp.tip) + '</div>';
    body += '<table class="mini" style="margin-top:12px">' +
      '<tr><th>出生</th><td>' + fmtWhen(p.bornAt) + '（陪伴你 ' + fmtHM(mins) + '）</td></tr>' +
      '<tr><th>成长值</th><td>' + Math.round(p.growth) + '</td></tr>' +
      '<tr><th>被照顾</th><td>' + p.careCount + ' 次</td></tr>' +
      '<tr><th>出身地</th><td>' + esc(sp.home) + '</td></tr>' +
      '<tr><th>安置处</th><td>' + window.Game.homeName(window.Game.homeOf(sp)) + '</td></tr>' +
      '</table>';
    openModal({
      title: '📋 ' + esc(p.name) + ' 的档案', body: body,
      foot: '<button class="btn btn-primary" id="pi-ok">知道啦</button>',
      onMount: function (m) { $('#pi-ok', m).onclick = closeModal; }
    });
  }

  /* =========================================================
   * 验证弹窗
   * ========================================================= */
  /* 自建加餐任务：从既有任务模型里挑一种（读书 / 刷题 / 读背导游词 / 费曼卡 / 文字登记），填个标题就能加 */
  function openTaskBuilder() {
    let model = D.TASK_MODELS[1];   /* 默认「刷题」 */
    let body = '<div class="warnbox">加餐任务做不做都行。自己加的也走同一套验证：挑一个现成的模型，填个标题就成。</div>';
    body += '<div class="field"><label>① 选一个任务模型<span class="req">必答</span></label><div class="tm-grid" id="tb-models">';
    D.TASK_MODELS.forEach(function (m2, i) {
      body += '<button class="tm-card' + (i === 1 ? ' on' : '') + '" data-mi="' + i + '">' +
        '<span class="tm-emoji">' + m2.emoji + '</span>' +
        '<span class="tm-name">' + m2.name + '</span>' +
        '<span class="tm-desc">' + esc(m2.desc) + '</span></button>';
    });
    body += '</div></div>';
    body += '<div class="field"><label>② 任务标题<span class="req">必答</span></label>' +
      '<input type="text" id="tb-title" maxlength="20" placeholder="例如：睡前跟读 1 篇导游词"></div>';
    body += '<div class="field" id="tb-target-wrap" style="display:none"><label id="tb-target-label">目标</label>' +
      '<input type="number" id="tb-target" min="1" value="20"></div>';
    body += '<div class="okbox" style="margin:2px 0 4px">🎁 自建任务奖励固定为 <b>🎟️ 1 券 + 🌰 15 可可豆</b>，做完当场发。</div>';
    body += '<div id="tb-err"></div>';

    openModal({
      title: '🧩 自建加餐任务', body: body, wide: true,
      foot: '<button class="btn btn-ghost" id="tb-cancel">取消</button>' +
            '<button class="btn btn-primary" id="tb-ok">加进加餐</button>',
      onMount: function (m) {
        $('#tb-cancel', m).onclick = closeModal;
        function paintModel() {
          const tw = $('#tb-target-wrap', m), tl = $('#tb-target-label', m);
          if (model.targetLabel) {
            tw.style.display = '';
            tl.innerHTML = model.targetLabel + '<span class="fh-i">达到这个量就算完成</span>';
            $('#tb-target', m).value = model.defaultTarget;
          } else {
            tw.style.display = 'none';
          }
        }
        $$('.tm-card', m).forEach(function (b) {
          b.onclick = function () {
            $$('.tm-card', m).forEach(function (x) { x.classList.remove('on'); });
            b.classList.add('on');
            model = D.TASK_MODELS[parseInt(b.dataset.mi, 10)];
            paintModel();
          };
        });
        paintModel();
        $('#tb-ok', m).onclick = function () {
          const title = String($('#tb-title', m).value || '').trim();
          if (!title) { $('#tb-err', m).innerHTML = '<div class="errbox">先给它起个名字吧。</div>'; return; }
          window.Study.addUserTask({
            type: model.type, title: title, desc: model.desc,
            target: parseInt($('#tb-target', m).value || '0', 10) || model.defaultTarget
          });
          closeModal();
          toast('🧩 加好了：「' + title + '」已经在加餐里等你。', 'ok', 5000);
          render();
        };
      }
    });
  }

  /* 通用凭证上传区：图片 / 文件 / 录音，三选一即可。
     required=true 用于「提交弹窗」任务（强制至少一样）；required=false 用于练习台（鼓励不强制）。
     target 须含 {photo, file, audios:[]}，与提交弹窗的 vf 共用结构。 */
  function evidenceZoneHTML(prefix, required) {
    return '<div class="field"><label>📎 提交凭证' + (required ? '<span class="req">必交</span>' : '<span class="fh-i">选填</span>') + '</label>' +
      '<div class="evi-zone">' +
        '<div class="photo-drop" id="' + prefix + '-drop">传一张图，或把图片拖进来</div>' +
        '<input type="file" accept="image/*" id="' + prefix + '-img" class="hidden">' +
        '<input type="file" id="' + prefix + '-file" class="hidden">' +
        '<div class="evi-btns">' +
          '<button type="button" class="btn btn-sm" id="' + prefix + '-pickfile">📄 传一个文件</button>' +
          '<button type="button" class="btn btn-sm rec-btn" id="' + prefix + '-rec">🎙️ 录一段音</button>' +
        '</div>' +
        '<div id="' + prefix + '-prev" class="evi-prev"></div>' +
      '</div>' +
      '<div class="hintbox">' + (required
        ? '做了就是做了——传张图、传个文件（PDF / 文档截图都行）、或录段音，随便一样就能结算。'
        : '顺手留个痕迹：传张图、传个文件、或录段音都行，不强制。') + '</div></div>';
  }

  function wireEvidence(prefix, m, target) {
    const drop = $('#' + prefix + '-drop', m), img = $('#' + prefix + '-img', m),
      file = $('#' + prefix + '-file', m), prev = $('#' + prefix + '-prev', m);
    /* 当前弹窗没有凭证区（如练习台「导游词」tab 不渲染该区，只面试问答 tab 有）
       时 drop 为 null，跳过接线避免抛错打断后续按钮绑定。 */
    if (!drop) return;
    function setPrev(t) { prev.innerHTML = '<div class="evi-prev-item">✅ ' + t + '</div>'; }
    function pickImg(f) {
      if (!/^image\//.test(f.type)) return toast('请选一张图片', 'warn');
      drop.textContent = '正在压缩…';
      window.Study.compressImage(f, 1400, 0.72).then(function (res) {
        target.photo = { blob: res.blob, thumb: res.thumb, name: f.name };
        drop.textContent = '✅ 已选图片：' + f.name;
        setPrev('📸 ' + f.name + '（' + Math.round(res.blob.size / 1024) + ' KB）');
      }).catch(function (e) { toast('图片处理失败：' + e.message, 'err'); drop.textContent = '重选一张'; });
    }
    drop.onclick = function () { img.click(); };
    drop.addEventListener('dragover', function (e) { e.preventDefault(); drop.style.borderColor = '#8FD3A8'; });
    drop.addEventListener('dragleave', function () { drop.style.borderColor = ''; });
    drop.addEventListener('drop', function (e) {
      e.preventDefault(); drop.style.borderColor = '';
      if (e.dataTransfer.files && e.dataTransfer.files[0]) pickImg(e.dataTransfer.files[0]);
    });
    img.onchange = function () { if (img.files[0]) pickImg(img.files[0]); };
    $('#' + prefix + '-pickfile', m).onclick = function () { file.click(); };
    file.onchange = function () {
      if (!file.files[0]) return;
      const f = file.files[0];
      target.file = { blob: f, name: f.name, mime: f.type || 'application/octet-stream', sizeKB: Math.round(f.size / 1024) };
      setPrev('📄 ' + f.name + '（' + target.file.sizeKB + ' KB）');
    };
    const recBtn = $('#' + prefix + '-rec', m);
    if (recBtn) {
      recBtn.onclick = function () {
        const cur = window.Study.getRecorder();
        if (!cur) {
          window.Study.startRecord().then(function (r) {
            if (!r.ok) { toast('❌ ' + r.msg, 'err', 8000); return; }
            recBtn.className = 'btn btn-warn rec-btn';
            recBtn.textContent = '⏹ 录音中…（点停止）';
          });
        } else {
          window.Study.stopRecord().then(function (r) {
            recBtn.className = 'btn btn-sm rec-btn';
            recBtn.textContent = '🎙️ 再录一段';
            if (!r.ok) { toast('❌ ' + r.msg, 'err'); return; }
            if (r.duration < 3) { toast('这一段不到 3 秒，没存。', 'warn'); return; }
            target.audios.push({ blob: r.blob, duration: r.duration, url: URL.createObjectURL(r.blob) });
            const d = document.createElement('div');
            d.className = 'evi-prev-item';
            d.textContent = '🎙️ 已录 ' + fmtClock(r.duration);
            prev.appendChild(d);
          });
        }
      };
    }
  }

  /* 练习台可选凭证：鼓励传、不强制。在用户标记「练过/读了」时，
     若 pEv 里带了图片/文件/录音，就顺手存进证据库（归属当日练习台任务）。*/
  function storePracticeEvidence(target, taskId, label) {
    if (!taskId) return;
    const jobs = [];
    if (target.photo) {
      jobs.push(window.Store.addEvidence({
        type: 'photo', taskId: taskId, label: label,
        blob: target.photo.blob, thumb: target.photo.thumb
      }));
    }
    if (target.file) {
      jobs.push(window.Store.addEvidence({
        type: 'file', taskId: taskId, label: label,
        blob: target.file.blob, mime: target.file.mime,
        name: target.file.name, sizeKB: target.file.sizeKB
      }));
    }
    (target.audios || []).forEach(function (a) {
      jobs.push(window.Store.addEvidence({
        type: 'audio', taskId: taskId, label: label,
        blob: a.blob, duration: a.duration
      }));
    });
    if (jobs.length) {
      Promise.all(jobs).then(function () { render(); }).catch(function () {});
    }
  }

  function openVerifyModal(task) {
    if (!task) return;
    const v = task.verify, need = task.need || {};
    /* 练习台任务：不打开验证弹窗，直接进练习台对应标签 */
    if (v.type === 'practice') {
      return openPracticePanel(task.libId === 'p_interview' ? 'interview' : 'script');
    }
    const isReading = v.type === 'reading';
    const isNote = v.type === 'note';
    vf = {
      task: task, photo: null, file: null, feynmanCount: 0,
      audios: [],
      bookId: (task.pick === 'book' || isReading) ? (task.ctx.bookId || '') : '',
      reading: { read: '', note: '' }
    };

    const needFeyn = Math.max(need.feynman || 0, v.type === 'feynman' ? (v.minCards || 1) : 0);

    let body = '';
    body += '<div class="warnbox">本任务要过验证才发奖：' + verifyText(task) + '。<br>奖励 🎟️ ' + task.reward.tickets + ' / 🌰 ' + task.reward.beans +
      '，写多少就是多少，不看你写得漂不漂亮。</div>';

    /* 文字登记：写一段今日收获（做了就是做了，写完当场结算） */
    if (isNote) {
      const mChars = v.minChars || 10;
      const prompts = v.prompts || [];
      const ph = prompts.length ? prompts.join('\n') : '这一段我拿到的是……';
      body += '<div class="field"><label>📝 今天的收获<span class="req">必答</span></label>' +
        '<textarea id="vf-ntext" style="min-height:110px" placeholder="' + esc(ph) + '"></textarea>' +
        '<div class="fh"><span id="vf-ntext-cnt">0 / ' + mChars + ' 字起</span>' +
        '<span>写你自己的话，写完当场结算</span></div></div>';
    }

    /* 选课本：精读（必答第一步）和课后练习（这套题属于哪一科）共用同一个选择器 */
    if (task.pick === 'book' || isReading) {
      body += '<div class="field"><label>' +
        (isReading ? '① 今天读了哪一本？' : '📚 这套课后练习属于哪一科？') +
        '<span class="req">必答</span>' +
        (isReading ? '<span class="fh-i">顺序完全由你定，不必从法规开始</span>' : '') +
        '</label>' +
        '<div class="bookpick">' +
        D.SUBJECTS.map(function (s) {
          const d = S.bookProgress[s.id] || 0;
          const dn = S.bookProgress['done_' + s.id];
          const total = D.BOOK_DAYS || 8;
          return '<button class="bpick" data-bid="' + s.id + '">' +
            '<span class="bp-emoji">' + s.emoji + '</span>' +
            '<span class="bp-name">' + esc(s.name) + '</span>' +
            '<span class="bp-prog">' + (dn ? '✅ 已读完一遍' : '进度 ' + d + ' / ' + total + ' 天') + '</span>' +
            '</button>';
        }).join('') + '</div></div>';
    }

    /* 精读第二步：今天读了什么（必答） */
    if (isReading) {
      const mChars = v.minChars || 6;
      body += '<div class="field"><label>② 今天读了什么？<span class="req">必答</span></label>' +
        '<textarea id="vf-read" style="min-height:72px" placeholder="章节、页数、范围都行，例如：第三章 3.2 节，P78–P96，旅行社的责任范围"></textarea>' +
        '<div class="fh"><span id="vf-read-cnt">0 / ' + mChars + ' 字起</span></div></div>';
      body += '<div class="field"><label>③ 笔记 / 感想（选填）</label>' +
        '<textarea id="vf-note" style="min-height:92px" placeholder="今天这一段，最想记住的一点是什么？哪里还没看明白？（空着也行）"></textarea>' +
        '<div class="fh"><span id="vf-note-cnt">0 字</span></div></div>';
    }

    /* 截图：刷题 / 网课 / 导游词(看法) 是必答凭证；精读给一个选填的笔记照片位 */
    if (need.photo || v.optionalPhoto) {
      const isOpt = !need.photo && v.optionalPhoto;
      const upLabel = isOpt
        ? '📎 上传笔记 / 感想照片（选填）'
        : (v.type === 'opinion' ? '📸 上传导游词练习截图（在另一个 App 练完，截一张带过来）' : '📸 上传学习凭证截图（准题库的完成页 / 成绩页 / 网课播放页）');
      body += '<div class="field"><label>' + upLabel + '</label>' +
        '<div class="photo-drop" id="vf-drop">点这里选一张图片，或把图片拖进来<br><span style="font-size:11px;color:#8AA394">会压缩后存入本机证据库，可随时回看</span></div>' +
        '<input type="file" accept="image/*" id="vf-file" class="hidden">' +
        '<div id="vf-prev"></div></div>';
    }

    /* 看法（读 / 背导游词的凭证：可打字，也可录一段音代替） */
    if (v.type === 'opinion') {
      const mChars = v.minChars || 8;
      body += '<div class="field"><label>💬 今天对这篇导游词的「看法」<span class="req">必答</span></label>' +
        '<textarea id="vf-opinion" style="min-height:84px" placeholder="今天顺不顺？哪段最熟、哪段还卡？在另一个 App 里发现了什么讲解顺序？写一句，或者点下面录一段语音代替。"></textarea>' +
        '<div class="fh"><span id="vf-opinion-cnt">0 / ' + mChars + ' 字起（也可录语音代替）</span></div></div>';
    }

    /* 录音：record 任务强制；opinion 任务里「看法」可录一段音 */
    if (v.type === 'record' || v.type === 'opinion') {
      const isOpinion = v.type === 'opinion';
      const sc = (!isOpinion && task.ctx && task.ctx.scriptId) ? D.SCRIPTS.filter(function (x) { return x.id === task.ctx.scriptId; })[0] : null;
      body += '<div class="field"><label>' + (isOpinion ? '🎙️ 录一段「看法」（选填，可代替打字）' : '🎙️ 朗读 / 背诵录音（累计 ≥' + v.minMinutes + ' 分钟，可分几次录）') + '</label>';
      if (sc) {
        body += '<div style="font-size:12.5px;color:#5B7263;margin-bottom:8px">按官方讲解顺序走一遍：</div>' +
          '<div class="script-flow">' + sc.nodes.map(function (n) { return '<span>' + esc(n) + '</span>'; }).join('') + '</div>';
      }
      if (isOpinion) {
        body += '<div class="hintbox" style="margin:6px 0 8px">不想打字就录一段：说一句今天顺不顺、哪段卡壳。录不录都行，但截图必须有。</div>';
      } else {
        body += '<div class="hintbox" style="margin:6px 0 8px">碎片时间就录一段，凑够总时长即可——不必一次坐下来讲完。</div>';
      }
      body += '<button class="btn btn-primary rec-btn" id="vf-rec">' + (isOpinion ? '🎙️ 录一段看法' : '🎙️ 开始录音') + '</button>' +
        '<div id="vf-rec-info" style="margin-top:10px;font-size:12.5px;color:#8AA394">' + (isOpinion ? '还没录音（选填）。也可以直接在上面写一句看法。' : '还没有录音。录音需要麦克风权限。') + '</div>' +
        '<div id="vf-rec-list" class="seg-list" style="margin-top:8px"></div></div>';
    }

    /* 刷题登记：每次可以只交几道，累计到目标题数才算完成（模考除外，一次一整套） */
    if (v.type === 'quiz') {
      if (!v.needScore) {
        const qp = window.Study.quizProgress(task.uid);
        const left = Math.max(0, v.minQuestions - qp.count);
        body += '<div class="okbox" id="vf-accum">' +
          (qp.count > 0
            ? '📈 已累计 <b>' + qp.count + '</b> / ' + v.minQuestions + ' 道' + (left > 0 ? '，还差 ' + left + ' 道' : '，已达标 ✅')
            : '📈 这是一件「累计型」刷题任务') +
          '<div class="hint" style="margin-top:4px">每次刷多少就交多少，分几次都行——加起来满 ' + v.minQuestions + ' 道才算这件做完。</div></div>';
      }
      body += '<div class="field"><label>✍️ 本次刷题登记</label>' +
        '<div class="inline">' +
          '<div><span style="font-size:11.5px;color:#8AA394">本次题量</span><input type="number" id="vf-q" min="0" placeholder="10"></div>' +
          '<div><span style="font-size:11.5px;color:#8AA394">本次答对</span><input type="number" id="vf-c" min="0" placeholder="8"></div>' +
        '</div>' +
        (v.needScore ? '<div style="margin-top:10px"><span style="font-size:11.5px;color:#8AA394">模考分数（满分 100）</span><input type="number" id="vf-score" min="0" max="100" placeholder="78"></div>' : '') +
        '<div class="fh"><span id="vf-rate">正确率会算给你看</span></div>' +
        '</div>';
    }

    /* 费曼卡 */
    if (needFeyn > 0) {
      body += '<div class="field"><label>🗣️ 费曼卡 ×' + needFeyn + '（讲给小白听，粘贴会被记录）</label><div id="vf-fm"></div></div>';
    }

    /* 通用凭证门槛：所有走提交弹窗的任务，至少提交一样凭证（图片/文件/录音）。
       已自带必交截图(need.photo)或录音(record)的任务不重复加区，但同样受提交时「至少一样」约束。 */
    const needEvidenceDedicated = !!need.photo || v.type === 'record';
    if (!needEvidenceDedicated) {
      body += evidenceZoneHTML('vf-u', true);
    }

    body += '<div id="vf-err"></div>';

    const mask = openModal({
      title: (isReading ? '📖 今日精读登记' : '✅ 结算：' + esc(task.title)),
      body: body, wide: true,
      foot: '<button class="btn btn-ghost" id="vf-cancel">稍后再交</button>' +
            '<button class="btn btn-primary" id="vf-submit">' +
              (isReading ? '📖 登记完成' : (v.type === 'quiz' && !v.needScore ? '✍️ 记入累计' : '提交结算')) +
            '</button>',
      onMount: function (m) {
        $('#vf-cancel', m).onclick = closeModal;

        /* 截图 */
        if (need.photo || v.optionalPhoto) {
          const drop = $('#vf-drop', m), file = $('#vf-file', m);
          drop.onclick = function () { file.click(); };
          drop.addEventListener('dragover', function (e) { e.preventDefault(); drop.style.borderColor = '#8FD3A8'; });
          drop.addEventListener('dragleave', function () { drop.style.borderColor = ''; });
          drop.addEventListener('drop', function (e) {
            e.preventDefault(); drop.style.borderColor = '';
            if (e.dataTransfer.files && e.dataTransfer.files[0]) handlePhoto(e.dataTransfer.files[0]);
          });
          file.onchange = function () { if (file.files[0]) handlePhoto(file.files[0]); };
          function handlePhoto(f) {
            if (!/^image\//.test(f.type)) return toast('请选一张图片', 'warn');
            drop.textContent = '正在压缩…';
            window.Study.compressImage(f, 1400, 0.72).then(function (res) {
              vf.photo = { blob: res.blob, thumb: res.thumb, name: f.name };
              drop.textContent = '✅ 已选：' + f.name + '（压缩后 ' + Math.round(res.blob.size / 1024) + ' KB，点击可更换）';
              $('#vf-prev', m).innerHTML = '<img class="photo-prev" src="' + res.thumb + '">';
            }).catch(function (e) { toast('图片处理失败：' + e.message, 'err'); drop.textContent = '重选一张'; });
          }
        }

        /* 录音：每录一段就存一段（record 强制、opinion 选填） */
        if (v.type === 'record' || v.type === 'opinion') {
          const isRec = v.type === 'record';
          const btn = $('#vf-rec', m), info = $('#vf-rec-info', m), holder = $('#vf-rec-list', m);
          let iv = null;
          function totalDur() {
            return vf.audios.reduce(function (a, x) { return a + x.duration; }, 0);
          }
          function paint() {
            const tot = totalDur();
            const has = vf.audios.length > 0;
            if (isRec) {
              const need = v.minMinutes * 60;
              info.innerHTML = has
                ? (tot >= need
                  ? '<span style="color:#2E7A4C;font-weight:600">✅ 已录 ' + vf.audios.length + ' 段，累计 ' + fmtClock(tot) + '，达标</span>'
                  : '<span style="color:#B03B37;font-weight:600">已录 ' + vf.audios.length + ' 段，累计 ' + fmtClock(tot) +
                    '，还差 ' + fmtClock(need - tot) + '（接着录，或者晚点再录都行）</span>')
                : '还没有录音。可以分几次录，累计够 ' + v.minMinutes + ' 分钟就行。';
            } else {
              info.innerHTML = has
                ? '已录 ' + vf.audios.length + ' 段（选填，可代替打字）：累计 ' + fmtClock(tot)
                : '还没录音（选填）。也可以直接在上面写一句看法。';
            }
            holder.innerHTML = vf.audios.map(function (x, i) {
              return '<div class="seg-item"><span class="seg-i">第 ' + (i + 1) + ' 段</span>' +
                '<span class="seg-d">' + fmtClock(x.duration) + '</span>' +
                '<audio controls src="' + x.url + '"></audio></div>';
            }).join('');
          }
          paint();
          btn.onclick = function () {
            const cur = window.Study.getRecorder();
            if (!cur) {
              window.Study.startRecord().then(function (r) {
                if (!r.ok) { toast('❌ ' + r.msg, 'err', 8000); return; }
                btn.className = 'btn btn-warn rec-btn';
                btn.textContent = '⏹ 停止这一段';
                const t0 = Date.now();
                if (isRec) {
                  const left = Math.max(30, Math.round((v.minMinutes * 60 - totalDur()) / 60));
                  info.innerHTML = '<div class="rec-live"><span class="rec-dot"></span><span id="vf-rt">00:00</span>　还差约 ' + left + ' 分钟，随时可以停</div>' +
                    '<div class="bar bar-thin" style="margin-top:8px"><i id="vf-rb" style="width:0%;background:linear-gradient(90deg,#D9534F,#E8846F)"></i></div>';
                  iv = setInterval(function () {
                    const sec = (Date.now() - t0) / 1000;
                    const e1 = $('#vf-rt', m), e2 = $('#vf-rb', m);
                    if (e1) e1.textContent = fmtClock(sec);
                    if (e2) e2.style.width = Math.min(100, (totalDur() + sec) / (v.minMinutes * 60) * 100) + '%';
                  }, 500);
                } else {
                  info.innerHTML = '<div class="rec-live"><span class="rec-dot"></span><span id="vf-rt">00:00</span>　录完点停止即可（选填）</div>';
                  iv = setInterval(function () {
                    const sec = (Date.now() - t0) / 1000;
                    const e1 = $('#vf-rt', m);
                    if (e1) e1.textContent = fmtClock(sec);
                  }, 500);
                }
              });
            } else {
              clearInterval(iv);
              window.Study.stopRecord().then(function (r) {
                btn.className = 'btn btn-primary rec-btn';
                btn.textContent = vf.audios.length ? (isRec ? '🎙️ 再录一段' : '🎙️ 再录一段看法') : (isRec ? '🎙️ 开始录音' : '🎙️ 录一段看法');
                if (!r.ok) { toast('❌ ' + r.msg, 'err'); return; }
                if (r.duration < 3) { toast('这一段不到 3 秒，没存。', 'warn'); paint(); return; }
                vf.audios.push({ blob: r.blob, duration: r.duration, url: URL.createObjectURL(r.blob) });
                paint();
              });
            }
          };
        }

        /* 看法文字：实时字数提示（opinion 任务） */
        if (v.type === 'opinion') {
          const mc = v.minChars || 8;
          const el = $('#vf-opinion', m), cnt = $('#vf-opinion-cnt', m);
          function upd() {
            const n = el.value.trim().length;
            cnt.textContent = n + ' / ' + mc + ' 字起' + (vf.audios.length ? '（已录 ' + vf.audios.length + ' 段音，可代替）' : '（也可录语音代替）');
            cnt.className = n >= mc ? 'ok' : '';
          }
          el.oninput = upd; upd();
        }

        /* 通用凭证区（图片/文件/录音，三选一，必交） */
        if (!needEvidenceDedicated) {
          wireEvidence('vf-u', m, vf);
        }

        /* 选课本：精读 / 课后练习共用 */
        if (task.pick === 'book' || isReading) {
          $$('.bpick', m).forEach(function (b) {
            if (b.dataset.bid === vf.bookId) b.classList.add('on');
            b.onclick = function () {
              vf.bookId = b.dataset.bid;
              $$('.bpick', m).forEach(function (x) { x.classList.toggle('on', x === b); });
            };
          });
        }

        /* 精读登记：读了什么（必答）+ 笔记（选填） */
        if (isReading) {
          const mc = v.minChars || 6;
          const rdEl = $('#vf-read', m), rdCnt = $('#vf-read-cnt', m);
          const ntEl = $('#vf-note', m), ntCnt = $('#vf-note-cnt', m);
          function readCnt() {
            const n = rdEl.value.trim().length;
            rdCnt.textContent = n + ' / ' + mc + ' 字起';
            rdCnt.className = n >= mc ? 'ok' : '';
          }
          rdEl.oninput = readCnt;
          ntEl.oninput = function () { ntCnt.textContent = ntEl.value.trim().length + ' 字'; };
          readCnt();
        }

        /* 文字登记：今天的收获（必答） */
        if (isNote) {
          const mc = v.minChars || 10;
          const nt = $('#vf-ntext', m), ntCnt = $('#vf-ntext-cnt', m);
          function ntCntFn() {
            const n = nt.value.trim().length;
            ntCnt.textContent = n + ' / ' + mc + ' 字起';
            ntCnt.className = n >= mc ? 'ok' : '';
          }
          nt.oninput = ntCntFn;
          ntCntFn();
        }

        /* 正确率实时提示（累计型任务顺带显示"交完这一笔累计多少"） */
        if (v.type === 'quiz') {
          const qEl = $('#vf-q', m), cEl = $('#vf-c', m);
          const base = (!v.needScore) ? window.Study.quizProgress(task.uid).count : 0;
          function upd() {
            const q = parseInt(qEl.value || '0', 10), c = parseInt(cEl.value || '0', 10);
            const r = $('#vf-rate', m);
            let s = q > 0
              ? '正确率 <b>' + Math.round(c / q * 100) + '%</b>（' + c + '/' + q + '）' + (c / q < 0.8 ? ' ⚠️ 不到 80%，这几科多看两眼' : ' 👍')
              : '正确率会算给你看';
            if (!v.needScore) {
              const tot = base + (q > 0 ? q : 0);
              s += '<br><span style="color:' + (tot >= v.minQuestions ? '#2E7A4C' : '#8AA394') + '">累计 ' + tot + ' / ' + v.minQuestions + ' 道' +
                (tot >= v.minQuestions ? '（够啦，这一笔就结算 ✅）' : '') + '</span>';
            }
            r.innerHTML = s;
          }
          qEl.oninput = upd; cEl.oninput = upd;
          upd();
        }

        /* 费曼卡 */
        if (needFeyn > 0) {
          const wrap = $('#vf-fm', m);
          for (let i = 0; i < needFeyn; i++) {
            const div = document.createElement('div');
            div.className = 'fm-card';
            div.innerHTML = '<div class="fm-t">💡 费曼卡 ' + (i + 1) + '</div>' +
              '<input type="text" class="fm-concept" placeholder="概念名称（例如：旅行社责任保险的赔偿限额）" style="margin-bottom:7px">' +
              '<textarea class="fm-plain" placeholder="用大白话讲给完全没学过的人听（至少 30 字）" style="min-height:64px"></textarea>' +
              '<input type="text" class="fm-gap" placeholder="讲到哪儿卡住了？（这是最值钱的一栏，选填）" style="margin-top:7px">' +
              '<input type="text" class="fm-analogy" placeholder="打个比方 / 类比（选填）" style="margin-top:7px">' +
              '<div class="fh"><span class="fm-cnt">0 字</span></div>';
            wrap.appendChild(div);
            const ta = div.querySelector('.fm-plain');
            ta.oninput = function () { div.querySelector('.fm-cnt').textContent = ta.value.trim().length + ' 字'; };
            ['fm-concept', 'fm-plain', 'fm-gap', 'fm-analogy'].forEach(function (cls) {
              const el = div.querySelector('.' + cls);
              el.addEventListener('paste', function (e) {
                const txt = (e.clipboardData || window.clipboardData).getData('text') || '';
                div.dataset.pasteCount = (parseInt(div.dataset.pasteCount || '0', 10) + 1);
                div.dataset.pastedChars = (parseInt(div.dataset.pastedChars || '0', 10) + txt.length);
              });
            });
          }
        }

        /* 提交 */
        $('#vf-submit', m).onclick = function () { submitVerify(m); };
      }
    });
  }

  function verifyText(task) {
    const v = task.verify, parts = [];
    if (v.type === 'note') parts.push('写一段今日收获（至少 ' + (v.minChars || 10) + ' 字）');
    if (v.type === 'quiz') parts.push(v.needScore ? ('登记 ≥' + v.minQuestions + ' 题 + 分数') : ('刷题累计满 ' + v.minQuestions + ' 道（可分次交）'));
    if (v.type === 'record') parts.push('录音累计 ≥' + v.minMinutes + ' 分钟');
    if (v.type === 'opinion') parts.push('传一张导游词练习截图 + 写/录一句「看法」（看法可打字可录音）');
    if (v.type === 'reading') parts.push('选课本 + 填「今天读了什么」（笔记和照片选填）');
    if (v.type === 'practice') parts.push('在练习台完成对应练习');
    else if (v.type === 'evidence') parts.push('交一个面试练习凭证即可（录音 / 截图 / 文件 任一）');
    else if (task.pick === 'book') parts.push('选定这套题属于哪一科');
    if (task.need && task.need.photo) parts.push('凭证截图');
    if (task.need && task.need.feynman) parts.push('费曼卡 ×' + task.need.feynman);
    /* 所有走提交弹窗的任务都需至少提交一样凭证（图片/文件/录音） */
    if (v.type !== 'practice' && !((task.need && task.need.photo) || v.type === 'record')) parts.push('至少提交一样凭证（图片/文件/录音）');
    return parts.join('、');
  }

  function submitVerify(mask) {
    const task = vf.task, v = task.verify;
    const errs = [];

    /* 收集刷题 */
    let quiz = null;
    if (v.type === 'quiz') {
      const q = parseInt(($('#vf-q', mask) || {}).value || '0', 10);
      const c = parseInt(($('#vf-c', mask) || {}).value || '0', 10);
      const sc = v.needScore ? parseInt(($('#vf-score', mask) || {}).value || '', 10) : undefined;
      if (v.needScore && (isNaN(sc) || sc === '')) errs.push('模考必须填写分数');
      if (isNaN(q) || q <= 0) errs.push('请填写本次题量');
      quiz = { questions: q || 0, correct: c || 0, score: isNaN(sc) ? undefined : sc };
    }

    /* 收集精读登记（必答：读哪本 + 读了什么；选填：笔记） */
    let reading = null;
    if (v.type === 'reading') {
      reading = {
        bookId: vf.bookId,
        read: String((($('#vf-read', mask) || {}).value) || '').trim(),
        note: String((($('#vf-note', mask) || {}).value) || '').trim()
      };
    }

    /* 收集看法（opinion：截图 + 看法文字；可录一段音代替打字） */
    let opinion = null;
    if (v.type === 'opinion') {
      opinion = {
        text: String((($('#vf-opinion', mask) || {}).value) || '').trim(),
        audios: (vf.audios || [])
      };
    }

    /* 收集文字登记（做了就是做了） */
    let noteText = '';
    if (v.type === 'note') {
      noteText = String((($('#vf-ntext', mask) || {}).value) || '').trim();
    }

    /* 收集费曼卡 */
    let fmCards = [];
    $$('#vf-fm .fm-card', mask).forEach(function (div) {
      const concept = div.querySelector('.fm-concept').value.trim();
      const plain = div.querySelector('.fm-plain').value.trim();
      fmCards.push({
        concept: concept, plain: plain,
        gap: div.querySelector('.fm-gap').value.trim(),
        analogy: div.querySelector('.fm-analogy').value.trim(),
        subject: (task.ctx && task.ctx.subjectName) || '',
        pasteCount: parseInt(div.dataset.pasteCount || '0', 10),
        pastedChars: parseInt(div.dataset.pastedChars || '0', 10)
      });
    });
    const needFeyn = Math.max((task.need && task.need.feynman) || 0, v.type === 'feynman' ? (v.minCards || 1) : 0);
    if (needFeyn) {
      const good = fmCards.filter(function (f) {
        return f.concept.length >= 2 && f.plain.length >= 30;
      });
      if (good.length < needFeyn) errs.push('费曼卡至少 ' + needFeyn + ' 张，每张要写清概念名 + 用大白话讲 ≥30 字（现在完整的有 ' + good.length + ' 张）');
      fmCards = good;
    }

    /* 录音：所有分段加起来算总时长 */
    const recTotal = (vf.audios || []).reduce(function (a, x) { return a + x.duration; }, 0);
    if (v.type === 'record' && !vf.audios.length) errs.push('还没有录音。背导游词总得留个音频凭证，哪怕先录一小段。');
    if (v.type === 'record' && vf.audios.length && recTotal < v.minMinutes * 60) {
      errs.push('录音累计时长不足 ' + v.minMinutes + ' 分钟（现在 ' + fmtClock(recTotal) + '，可以再录几段）');
    }

    /* 截图（精读的笔记照片是选填，不拦） */
    if ((task.need && task.need.photo) && !vf.photo) errs.push('缺少凭证截图');

    /* 通用凭证门槛：所有提交弹窗的任务，至少提交一样凭证（图片 / 文件 / 录音） */
    const hasEvidence = !!(vf.photo || vf.file || (vf.audios && vf.audios.length));
    if (!hasEvidence) errs.push('请至少提交一样凭证：传一张图、传一个文件、或录一段音');

    /* 前置校验：交给 Study.validate 复核（文字登记 / 题量 / 录音 / 看法 / 费曼卡 / 精读登记 / 选书） */
    const proof = {
      photo: vf.photo, file: vf.file, quiz: quiz, feynmanCount: fmCards.length,
      reading: reading,
      opinion: opinion,
      note: noteText,
      record: v.type === 'record' ? { duration: recTotal, segments: vf.audios.length } : null,
      bookId: (task.pick === 'book' || v.type === 'reading') ? vf.bookId : ''
    };
    const preErrs = window.Study.validate(task, proof);
    preErrs.forEach(function (e) { if (errs.indexOf(e) < 0) errs.push(e); });

    const errBox = $('#vf-err', mask);
    if (errs.length) {
      errBox.innerHTML = '<div class="errbox">还不能结算，先补齐这些：<ul>' +
        errs.map(function (e) { return '<li>' + esc(e) + '</li>'; }).join('') + '</ul></div>';
      errBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    /* 落库：先存凭证，再发奖 */
    const jobs = [];
    if (vf.photo) {
      jobs.push(window.Store.addEvidence({
        type: 'photo', taskId: task.uid, label: task.title,
        blob: vf.photo.blob, thumb: vf.photo.thumb
      }));
    }
    if (vf.file) {
      jobs.push(window.Store.addEvidence({
        type: 'file', taskId: task.uid, label: task.title,
        blob: vf.file.blob, mime: vf.file.mime
      }));
    }
    (vf.audios || []).forEach(function (seg, i) {
      jobs.push(window.Store.addEvidence({
        type: 'audio', taskId: task.uid,
        label: '录音第 ' + (i + 1) + ' 段：' + task.title,
        blob: seg.blob, duration: seg.duration
      }));
    });
    fmCards.forEach(function (f) { window.Study.addFeynman(f); });

    const summary = [];
    if (noteText) summary.push('写了 ' + noteText.length + ' 字收获');
    if (quiz) summary.push('刷题 ' + quiz.questions + ' 道' + (quiz.score !== undefined ? '，模考 ' + quiz.score + ' 分' : ''));
    if (fmCards.length) summary.push('费曼卡 ' + fmCards.length + ' 张');
    if (opinion && opinion.text) summary.push('写了看法 ' + opinion.text.length + ' 字');
    if (vf.audios && vf.audios.length) summary.push((v.type === 'opinion' ? '看法录音 ' : '录音 ') + vf.audios.length + ' 段 / ' + fmtClock(recTotal));
    if (vf.photo) summary.push(v.type === 'reading' ? '已存笔记照片' : (v.type === 'opinion' ? '已存导游词练习截图' : '已存截图'));
    if (vf.file) summary.push('已存文件：' + vf.file.name);
    if (reading && reading.bookId) {
      const bk = D.SUBJECTS.filter(function (x) { return x.id === reading.bookId })[0];
      if (bk) {
        summary.push('精读《' + bk.name + '》');
        if (reading.read) summary.push('读了：' + reading.read);
        if (reading.note) summary.push('写了笔记');
      }
    } else if (task.pick === 'book' && vf.bookId) {
      const bk = D.SUBJECTS.filter(function (x) { return x.id === vf.bookId })[0];
      if (bk) summary.push('课后练习《' + bk.name + '》');
    }
    proof.summary = summary.join('，');

    /* 等凭证写入完成再结算，保证证据先落盘 */
    Promise.all(jobs).then(function () {
      const res = window.Study.finish(task.uid, proof);
      if (!res.ok) {
        errBox.innerHTML = '<div class="errbox">结算失败：<ul>' + res.errs.map(function (e) { return '<li>' + esc(e) + '</li>'; }).join('') + '</ul></div>';
        return;
      }
      /* 累计型刷题：只记进度、还没达标，不撒花不欢呼，给个鼓励提示 */
      if (res.progress) {
        toast('✍️ 「' + esc(res.title) + '」已累计 ' + res.count + ' / ' + res.target + ' 道，继续加油～', 'ok', 4500);
        autoSave('任务 · ' + task.title);
        render();
        return;
      }
      closeModal();
      confetti(42);
      playCheer();
      let msg = '✅ 「' + esc(task.title) + '」结算完成：🎟️ +' + res.gain.tickets + '　🌰 +' + res.gain.beans;
      toast(msg, 'ok', 6500);
      autoSave('任务 · ' + task.title);   /* 每完成一项任务，自动存档一次 */
      res.extra.forEach(function (x) { setTimeout(function () { toast(x, 'ok', 6500); }, 350); });
      if (res.feedBonus) {
        setTimeout(function () { openFeedBonusModal(); confetti(60); }, 900);
      }
      if (fmCards.some(function (f) { return f.pastedChars > 300; })) {
        setTimeout(function () {
          toast('ℹ️ 检测到费曼卡里有大段粘贴内容。粘贴不是作弊罪，但费曼法要的是"你自己的话"——下次试着先合上资料讲一遍。', 'warn', 9000);
        }, 700);
      }
      render();
    });
  }

  /* =========================================================
   * 练习台：面试问答 + 导游词
   * 用户随时点进来练，进度自动记入今日任务。
   * ========================================================= */
  let practiceTab = 'interview';
  function openPracticePanel(tab) {
    practiceTab = tab || 'interview';
    /* 练习台凭证：鼓励传、不强制（用户选了「不强制」） */
    const pEv = { photo: null, file: null, audios: [] };
    const info = window.Store.currentPhase();
    const reciteMode = info.day >= D.PRACTICE.RECITE_START_DAY;

    let body = '<div class="practice-tabs">' +
      '<button class="practice-tab' + (practiceTab === 'interview' ? ' on' : '') + '" data-act="practice-tab" data-tab="interview">🗣️ 综合问答</button>' +
      '<button class="practice-tab' + (practiceTab === 'script' ? ' on' : '') + '" data-act="practice-tab" data-tab="script">🎤 导游词</button>' +
      '</div>';

    if (practiceTab === 'interview') {
      body += '<div class="practice-hint">' +
        '<div>🗣️ 综合问答题库（共 <b>' + D.INTERVIEW_QA.length + '</b> 道，会越来越多）</div>' +
        '<div class="hint">点「看答案」对照着练。每天只要在「投喂单」给面试交一个凭证（录音 / 截图 / 文件 任一）就算今天练过了——不必一题一题点。</div>' +
        '</div>';
      body += '<div class="qa-list">';
      D.INTERVIEW_QA.forEach(function (q, i) {
        body += '<div class="qa-item" data-qid="' + q.id + '">' +
          '<div class="qa-head"><span class="qa-no">' + (i + 1) + '</span><span class="qa-q">' + esc(q.q) + '</span></div>' +
          '<div class="qa-answer" id="qa-ans-' + q.id + '">' + esc(q.a).replace(/\\n/g, '<br>') + '</div>' +
          '<div class="qa-actions">' +
          '<button class="btn btn-sm btn-ghost" data-act="qa-reveal" data-qid="' + q.id + '">👁 看答案</button>' +
          '</div></div>';
      });
      body += '</div>';
      /* 完成今日面试任务：交一个凭证即可（不再逐题累计） */
      body += '<div class="practice-evi">' +
        '<div class="practice-evi-head">✅ 完成今日面试任务</div>' +
        '<div class="hint">回到「投喂单」点「面试 → 去提交」，交一个凭证即可完成。也可以直接点：</div>' +
        '<button class="btn btn-primary" data-act="iv-submit">📎 交一个凭证完成今日面试</button>' +
        '</div>';
    } else {
      body += '<div class="practice-hint">' +
        '<div>' + (reciteMode ? '第 13 天起：每天默讲 1 篇导游词' : '前 12 天：每天通读 1 篇导游词') + '</div>' +
        '<div class="hint">点「今天读了这篇」或「今天背了这篇」即完成今日导游词任务。哪一篇完全由你定。</div>' +
        '</div>';
      body += '<div class="sp-grid">';
      D.SCRIPTS.forEach(function (sc) {
        const st = S.scripts[sc.id] || { read: 0, recite: 0, mastered: false };
        const readToday = window.Study.scriptPracticeToday().read.indexOf(sc.id) >= 0;
        const reciteToday = window.Study.scriptPracticeToday().recite.indexOf(sc.id) >= 0;
        body += '<div class="sp-card">' +
          '<div class="sp-head"><span>' + (st.mastered ? '🏵️' : '📄') + '</span><span class="sp-name">' + esc(sc.name) + '</span></div>' +
          '<div class="sp-meta">' + esc(sc.place) + ' ｜ ' + esc(sc.group) + ' ｜ 约 ' + sc.minutes + ' 分钟</div>' +
          '<div class="script-flow">' + sc.nodes.map(function (n) { return '<span>' + esc(n) + '</span>'; }).join('') + '</div>' +
          '<div class="sp-counts">通读 ' + (st.read || 0) + ' 次 ｜ 默讲 ' + (st.recite || 0) + ' 次' + (st.mastered ? ' ｜ ✅已背下' : '') + '</div>' +
          '<div class="sp-actions">' +
          '<button class="btn btn-sm btn-primary" data-act="sp-open" data-sid="' + sc.id + '">📖 阅读 / 背诵</button>' +
          '<button class="btn btn-sm' + (readToday ? ' btn-ghost' : ' btn-primary') + '" data-act="sp-read" data-sid="' + sc.id + '"' + (readToday ? ' disabled' : '') + '>' + (readToday ? '✓ 今日已读' : '今天读了') + '</button>' +
          '<button class="btn btn-sm' + (reciteToday ? ' btn-ghost' : ' btn-primary') + '" data-act="sp-recite" data-sid="' + sc.id + '"' + (reciteToday ? ' disabled' : '') + '>' + (reciteToday ? '✓ 今日已背' : '今天背了') + '</button>' +
          '</div></div>';
      });
      body += '</div>';
    }

    openModal({
      title: '📚 练习台 · ' + (practiceTab === 'interview' ? '综合问答' : '导游词'),
      body: body, wide: true, dismissable: true,
      foot: '<button class="btn btn-ghost" id="pr-close">关闭</button>',
      onMount: function (m) {
        $('#pr-close', m).onclick = closeModal;
        /* 可选凭证区接线（鼓励传、不强制） */
        wireEvidence('pEv', m, pEv);
        /* 切换 面试问答 / 导游词 两个 tab（弹窗内按钮需自行绑定，openModal 不会自动接线） */
        $$('[data-act="practice-tab"]', m).forEach(function (b) {
          b.onclick = function () { openPracticePanel(b.dataset.tab); };
        });
        /* 进入单篇导游词阅读/背诵器 */
        $$('[data-act="sp-open"]', m).forEach(function (b) {
          b.onclick = function () {
            const sid = b.dataset.sid;
            const sc = D.SCRIPTS.filter(function (x) { return x.id === sid; })[0];
            if (sc) openScriptReader(sc);
          };
        });
        /* 答案展开 */
        $$('[data-act="qa-reveal"]', m).forEach(function (b) {
          b.onclick = function () {
            const qid = b.dataset.qid;
            const ans = $('#qa-ans-' + qid, m);
            if (ans) { ans.style.display = 'block'; b.style.display = 'none'; }
          };
        });
        /* 完成今日面试：交一个凭证（走验证弹窗，不再逐题累计） */
        $$('[data-act="iv-submit"]', m).forEach(function (b) {
          b.onclick = function () {
            const tk = window.Study.coreTaskByLib('p_interview');
            if (!tk) { toast('今日面试任务还没生成', 'err'); return; }
            openVerifyModal(tk);
          };
        });
        /* 导游词读/背 */
        $$('[data-act="sp-read"], [data-act="sp-recite"]', m).forEach(function (b) {
          b.onclick = function () {
            const sid = b.dataset.sid;
            const type = b.dataset.act === 'sp-read' ? 'read' : 'recite';
            /* 先抓住当前面板里可选的凭证，避免重渲后丢失 */
            const snap = { photo: pEv.photo, file: pEv.file, audios: pEv.audios.slice() };
            const tk = window.Study.coreTaskByLib('p_script');
            const r = window.Study.finishScriptCore(sid, type);
            if (snap.photo || snap.file || snap.audios.length) {
              storePracticeEvidence(snap, tk ? tk.uid : null, '导游词练习凭证');
            }
            if (r.ok && r.taskDone && r.task) {
              toast('🎤 今日导游词任务完成：+' + r.task.reward.tickets + ' 券 / +' + r.task.reward.beans + ' 豆', 'ok', 5000);
              confetti(42); playCheer();
            } else if (!r.ok) {
              toast('❌ ' + (r.msg || (r.errs && r.errs.join('；')) || '记录失败'), 'err');
            }
            render();
            openPracticePanel('script');
          };
        });
      }
    });
  }

  /* ---------------- 导游词阅读 / 背诵器 ----------------
     进入单篇导游词：① 照着读/背（显示正文）② 隐藏内容自测 ③ 写背诵大纲笔记。 */
  function openScriptReader(sc) {
    const sid = sc.id;
    if (!S.scripts[sid]) S.scripts[sid] = { read: 0, recite: 0, mastered: false, lastAt: 0, notes: '' };
    const st = S.scripts[sid];
    const info = window.Store.currentPhase();
    const reciteMode = info.day >= D.PRACTICE.RECITE_START_DAY;
    const pEv = { photo: null, file: null, audios: [] };
    const hasContent = !!(sc.content && sc.content.trim());

    let body = '<div class="reader-head">' + esc(sc.name) +
      '<div class="reader-sub">' + esc(sc.place) + ' ｜ ' + esc(sc.group) + ' ｜ 约 ' + sc.minutes + ' 分钟</div></div>';

    /* 模式切换：照着读/背 ↔ 隐藏内容自测 */
    body += '<div class="reader-toolbar">' +
      '<button class="btn btn-sm btn-primary" id="reader-toggle" data-act="reader-toggle">🔍 隐藏内容（自测背诵）</button>' +
      '<span class="reader-mode-hint" id="reader-mode-hint">' + (reciteMode ? '当前阶段：默讲' : '当前阶段：通读') + '</span>' +
      '</div>';

    /* 正文区：有 content 显示全文；否则退化为大纲 */
    body += '<div class="reader-content" id="reader-content">';
    if (hasContent) {
      body += '<div class="script-text" id="script-text">' + esc(sc.content).replace(/\n/g, '<br>') + '</div>';
    } else {
      body += '<div class="script-flow big">' + sc.nodes.map(function (n) { return '<span>📍 ' + esc(n) + '</span>'; }).join('') + '</div>' +
        '<div class="hint">这篇还没录入完整正文，先按大纲点背。把正文发我或贴进来，我就能给你完整文本对照。</div>';
    }
    body += '</div>';

    /* 背诵大纲笔记（自动保存） */
    body += '<div class="reader-notes">' +
      '<div class="reader-notes-head">📝 我的背诵大纲笔记</div>' +
      '<textarea id="reader-notes" class="notes-area" placeholder="写你的背诵大纲 / 易忘点 / 顺口溜 / 串词……（自动保存，存在本机）">' + esc(st.notes || '') + '</textarea>' +
      '</div>';

    /* 可选凭证：阅读/背诵时顺手留痕，归属当日导游词任务 */
    body += '<div class="practice-evi">' +
      '<div class="practice-evi-head">📎 留个学习痕迹（选填）</div>' +
      evidenceZoneHTML('pEv', false) +
      '</div>';

    /* 完成按钮 */
    body += '<div class="reader-actions">' +
      '<button class="btn btn-primary" data-act="sp-read" data-sid="' + sid + '">今天读了这篇</button>' +
      '<button class="btn btn-primary" data-act="sp-recite" data-sid="' + sid + '">今天背了这篇</button>' +
      '</div>';

    openModal({
      title: '🎤 ' + esc(sc.name),
      body: body, wide: true, dismissable: true,
      foot: '<button class="btn btn-ghost" id="reader-close">关闭</button>',
      onMount: function (m) {
        $('#reader-close', m).onclick = closeModal;
        wireEvidence('pEv', m, pEv);

        /* 隐藏 / 显示内容 */
        var hidden = false;
        const toggle = $('#reader-toggle', m);
        if (toggle) toggle.onclick = function () {
          hidden = !hidden;
          const t = $('#script-text', m);
          if (t) t.style.display = hidden ? 'none' : 'block';
          toggle.textContent = hidden ? '👁 显示内容（对照检查）' : '🔍 隐藏内容（自测背诵）';
          toggle.classList.toggle('btn-ghost', hidden);
          toggle.classList.toggle('btn-primary', !hidden);
        };

        /* 笔记自动保存 */
        const ta = $('#reader-notes', m);
        if (ta) ta.oninput = function () {
          if (!S.scripts[sid]) S.scripts[sid] = { read: 0, recite: 0, mastered: false, lastAt: 0, notes: '' };
          S.scripts[sid].notes = ta.value;
          window.Store.save();
        };

        /* 读 / 背（复用练习台逻辑 + 可选凭证） */
        $$('[data-act="sp-read"], [data-act="sp-recite"]', m).forEach(function (b) {
          b.onclick = function () {
            const type = b.dataset.act === 'sp-read' ? 'read' : 'recite';
            const snap = { photo: pEv.photo, file: pEv.file, audios: pEv.audios.slice() };
            const tk = window.Study.coreTaskByLib('p_script');
            const r = window.Study.finishScriptCore(sid, type);
            if (snap.photo || snap.file || snap.audios.length) {
              storePracticeEvidence(snap, tk ? tk.uid : null, '导游词练习凭证');
            }
            if (r.ok && r.taskDone && r.task) {
              toast('🎤 今日导游词任务完成：+' + r.task.reward.tickets + ' 券 / +' + r.task.reward.beans + ' 豆', 'ok', 5000);
              confetti(42); playCheer();
            } else if (!r.ok) {
              toast('❌ ' + (r.msg || '记录失败'), 'err');
            }
            render();
            openScriptReader(sc);
          };
        });
      }
    });
  }

  /* ---------------- 任务凭证回顾 ---------------- */
  function showTaskLog(uid) {
    const task = window.Study.taskByUid(uid);
    if (!task) return;
    const rec = S.study.done[uid] || {};
    const evs = S.evidence.filter(function (e) { return e.taskId === uid; });
    let body = '<div class="okbox">' + fmtWhen(rec.at) + ' 完成，获得 🎟️ ' + (rec.tickets || 0) + ' / 🌰 ' + (rec.beans || 0) + '。</div>';
    if (rec.detail) body += '<div class="warnbox" style="margin-top:12px">登记内容：' + esc(rec.detail) + '</div>';
    if (!evs.length) {
      body += '<div class="empty" style="margin-top:12px">这个任务没有留下文件凭证（例如纯计时类任务）。</div>';
    } else {
      body += '<div class="ev-list" style="margin-top:12px">';
      evs.forEach(function (e) {
        body += '<div class="ev">' +
          (e.type === 'photo' && e.thumb ? '<img class="ev-thumb" src="' + e.thumb + '">'
            : '<div class="ev-thumb" style="font-size:24px">' + (e.type === 'audio' ? '🎙️' : '📝') + '</div>') +
          '<div class="ev-body"><div class="ev-title">' + esc(e.label) + '</div>' +
          (e.type === 'note' && e.text ? '<div class="ev-text">' + esc(e.text) + '</div>' : '') +
          '<div class="ev-meta">' + fmtWhen(e.at) + (e.duration ? ' ｜ ' + fmtClock(e.duration) : '') + '</div>' +
          (e.type === 'audio' ? '<button class="btn btn-sm" style="margin-top:6px" data-act="play" data-id="' + e.id + '">▶️ 播放</button><div id="au-' + e.id + '"></div>' : '') +
          '</div></div>';
      });
      body += '</div>';
    }
    openModal({
      title: '📄 ' + esc(task.title) + ' · 凭证', body: body, wide: true,
      foot: '<button class="btn btn-primary" id="tl-ok">关闭</button>',
      onMount: function (m) {
        $('#tl-ok', m).onclick = closeModal;
        $$('[data-act="play"]', m).forEach(function (b) {
          b.onclick = function () {
            const holder = $('#au-' + b.dataset.id, m);
            window.Store.getEvidenceBlob(b.dataset.id).then(function (blob) {
              if (!blob) return;
              holder.innerHTML = '<audio controls src="' + URL.createObjectURL(blob) + '" style="margin-top:6px"></audio>';
              holder.querySelector('audio').play();
            });
          };
        });
      }
    });
  }

  /* ---------------- 导入导出 ---------------- */
  function doExport() {
    const data = JSON.stringify(window.Store.exportAll(), null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = '知识喂了猫_存档_' + window.Store.today() + '.json';
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
    toast('⬇️ 存档已导出。截图和录音文件不包含在里面，需要单独备份浏览器数据。', 'ok', 7000);
  }

  function doImport() {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = '.json,application/json';
    inp.onchange = function () {
      const f = inp.files[0];
      if (!f) return;
      const fr = new FileReader();
      fr.onload = function () {
        try {
          window.Store.importAll(JSON.parse(fr.result));
          S = window.Store.state;
          window.Game.init();
          window.Study.init();
          toast('⬆️ 存档导入成功。', 'ok');
          render();
        } catch (e) { toast('❌ 导入失败：' + e.message, 'err'); }
      };
      fr.readAsText(f);
    };
    inp.click();
  }

  function doReset() {
    openModal({
      title: '⚠️ 重置全部数据',
      body: '<div class="errbox">这会清空你的全部进度：胶囊、小生物、任务记录、证据库索引、成就。' +
        '<br><br>截图与录音文件本身不会自动删除，但会失去索引（等于找不到）。<br><br>' +
        '<b>如果只是想重新开始，建议先导出存档备份。</b></div>' +
        '<div class="field"><label>确认请输入 <code>重置</code> 两个字</label><input type="text" id="rs-txt" placeholder="重置"></div>',
      foot: '<button class="btn btn-ghost" id="rs-no">取消</button><button class="btn btn-warn" id="rs-yes">确认重置</button>',
      onMount: function (m) {
        $('#rs-no', m).onclick = closeModal;
        $('#rs-yes', m).onclick = function () {
          if ($('#rs-txt', m).value.trim() !== '重置') return toast('请输入"重置"两个字确认。', 'warn');
          window.Store.reset();
          S = window.Store.state;
          window.Game.init();
          window.Study.init();
          closeModal();
          toast('已重置。又是干干净净的一窝。', 'ok');
          render();
        };
      }
    });
  }

  /* ---------------- 跨设备同步 ---------------- */
  /* 导入 / 还原之后，各模块缓存的派生数据要重算一遍 */
  function afterStoreSwap() {
    S = window.Store.state;
    window.Game.init();
    window.Study.init();
    render();
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(function () { return true; },
        function () { return legacyCopy(text); });
    }
    return Promise.resolve(legacyCopy(text));
  }
  /* 老浏览器 / 非安全上下文里 navigator.clipboard 不存在，退回到选中复制 */
  function legacyCopy(text) {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand && document.execCommand('copy');
      document.body.removeChild(ta);
      return !!ok;
    } catch (e) { return false; }
  }

  /* ---------------- 存档（自动存档 + 唠叨提醒 + 存档弹窗） ---------------- */
  const SAVE_NAG_AT = 3;   /* 攒够这么多次进度没带走，就开始唠叨 */

  function saveNagHtml() {
    const m = window.Store.saveMeta();
    if (m.sinceTake < SAVE_NAG_AT) return '';
    return '<button class="save-nag" data-act="save-open">' +
      '<b>💾 该存档了</b>' +
      '<span>已经攒了 ' + m.sinceTake + ' 次进度没带走。点这里取一份存档码，' +
      '存到微信「文件传输助手」，换设备或重装都能接着玩。</span></button>';
  }

  /* 自动存档：每完成一项任务就存一份，不打断操作 */
  function autoSave(why) {
    window.Store.makeSave(why || '', true).then(function (r) {
      const m = window.Store.saveMeta();
      const chipV = $('#chip-save-v');
      if (chipV) chipV.textContent = '存档 ' + m.count;
      if (!r.ok) { toast('⚠️ 自动存档没成功：' + r.msg, 'warn', 5000); return; }
      toast('💾 已自动存档（第 ' + m.count + ' 号）· ' + (why || '进度'), 'ok', 4200);
      if (m.sinceTake >= SAVE_NAG_AT) {
        setTimeout(function () {
          toast('📼 攒了 ' + m.sinceTake + " 次进度还没带走 —— 点顶栏「💾 存档」取一份存档码吧。", 'warn', 8000);
        }, 900);
      }
      render();
    });
  }

  function saveRowHtml(sv, i) {
    const when = fmtWhen(sv.at);
    return '<div class="save-row">' +
      '<div class="save-no">' + (i + 1) + '</div>' +
      '<div class="save-main">' +
        '<div class="save-t">' + esc(sv.name || (sv.auto ? '自动存档' : '手动存档')) +
          ' <span class="tag">' + (sv.auto ? '自动' : '手动') + '</span></div>' +
        '<div class="save-b">' + esc(when) + ' · ' + esc(sv.brief || '') + ' · ' + (sv.size || 0) + ' 字</div>' +
      '</div>' +
      '<div class="save-ops">' +
        '<button class="btn btn-sm btn-primary" data-act="save-code" data-id="' + sv.id + '">取码</button>' +
        '<button class="btn btn-sm" data-act="save-load" data-id="' + sv.id + '">读档</button>' +
        '<button class="btn btn-sm btn-warn" data-act="save-del" data-id="' + sv.id + '">删</button>' +
      '</div>' +
      '</div>';
  }

  function openSaveModal() {
    const list = window.Store.listSaves();
    const m = window.Store.saveMeta();
    let body = '<div class="warnbox">这个游戏没有服务器，所以<b>存档就是一枚能带走的快照</b>：' +
      '每完成一项任务自动存一份；取一份存档码发给自己，换设备、换浏览器、甚至重装都能接着玩。' +
      '存档码和「跨设备同步」里那串码是同一个东西 —— 在这里叫存档，到了那头就叫同步。</div>' +
      '<div class="field"><label>现在就存一份</label>' +
      '<input id="sv-name" class="sv-inp" type="text" maxlength="24" placeholder="给这份存档起个名（可留空），比如「刷完法规第一章」">' +
      '<button class="btn btn-primary btn-sm" id="sv-new">💾 存为新的存档位</button>' +
      '<div class="hint">手动存档不会被自动存档挤掉，一共 12 个位置（自动档最多占 8 个）。</div>' +
      '</div>' +
      '<div class="field"><label>存档位（' + list.length + ' / 12）</label>';
    if (!list.length) {
      body += '<div class="empty">还没有存档。完成一项任务就会自动存第一份。</div>';
    } else {
      body += '<div class="save-list">';
      list.forEach(function (sv, i) { body += saveRowHtml(sv, i); });
      body += '</div>';
    }
    body += '</div>';

    const foot = '<button class="btn btn-ghost" id="sv-close">关闭</button>' +
      '<button class="btn" id="sv-sync">🔗 用存档码跨设备</button>';

    openModal({
      title: '💾 存档',
      body: body,
      foot: foot,
      onMount: function (m) {
        $('#sv-close', m).onclick = closeModal;
        $('#sv-sync', m).onclick = function () { closeModal(); openSyncModal(); };
        $('#sv-new', m).onclick = function () {
          const name = ($('#sv-name', m).value || '').trim();
          const btn = $('#sv-new', m);
          btn.disabled = true; btn.textContent = '正在存档…';
          window.Store.makeSave(name, false).then(function (r) {
            btn.disabled = false; btn.textContent = '💾 存为新的存档位';
            if (!r.ok) { toast('⚠️ 存档失败：' + r.msg, 'err', 6000); return; }
            toast('💾 存档成功（' + r.size + ' 字）', 'ok');
            closeModal(); openSaveModal(); render();
          });
        };
        Array.prototype.forEach.call(m.querySelectorAll('[data-act="save-code"]'), function (b) {
          b.onclick = function () { takeSaveCode(b.dataset.id); };
        });
        Array.prototype.forEach.call(m.querySelectorAll('[data-act="save-load"]'), function (b) {
          b.onclick = function () { loadSaveSlot(b.dataset.id); };
        });
        Array.prototype.forEach.call(m.querySelectorAll('[data-act="save-del"]'), function (b) {
          b.onclick = function () {
            if (!window.confirm('删掉这份存档？删了就找不回来了。')) return;
            window.Store.removeSave(b.dataset.id);
            closeModal(); openSaveModal(); render();
          };
        });
      }
    });
  }

  /* 取码：这份存档的码就是同步码，复制到剪贴板 */
  function takeSaveCode(id) {
    const sv = window.Store.listSaves().filter(function (x) { return x.id === id; })[0];
    if (!sv) { toast('没找到这份存档', 'err'); return; }
    copyText(sv.code).then(function (ok) {
      if (ok) window.Store.markSavedTaken();
      toast(ok ? '📋 存档码已复制（' + sv.size + ' 字）。发到微信「文件传输助手」，' +
        '在另一台设备打开「🔗 跨设备同步」粘进去就接着玩。'
        : '复制没成功，去「🔗 跨设备同步」里生成一份新的吧。', ok ? 'ok' : 'warn', 8000);
      render();
    });
  }

  /* 读档：回到那一格（覆盖前会自动留一手备份） */
  function loadSaveSlot(id) {
    const sv = window.Store.listSaves().filter(function (x) { return x.id === id; })[0];
    if (!sv) { toast('没找到这份存档', 'err'); return; }
    if (!window.confirm('读档会回到 ' + fmtWhen(sv.at) + ' 那一份进度，现在的进度会被覆盖（会自动留备份）。确定吗？')) return;
    window.Store.loadSave(id).then(function (r) {
      if (!r.ok) { toast('❌ 读档失败：' + r.msg, 'err', 6000); return; }
      S = window.Store.state;
      toast('💾 已读档：回到 ' + fmtWhen(r.at) + ' 那一份。', 'ok', 6000);
      closeModal(); render();
    });
  }

  function openSyncModal() {
    const bak = window.Store.backupInfo();
    const body =
      '<div class="warnbox">浏览器把存档按「设备 + 浏览器 + 网址（含端口）」分开存放，这是它的安全沙箱，' +
      '任何网页都绕不过去。所以换手机、换浏览器、换个端口打开，看到的都是各存各的一份——' +
      '<b>不是丢档，是两头各有一份</b>。同步码就是用来把其中一份搬到另一头的。</div>' +

      '<div class="sync-now"><span class="k">本机这一份</span><b>' + esc(window.Sync.when(S.savedAt)) + '</b>' +
      '<div class="hint">' + esc(window.Sync.brief(S)) + '</div></div>' +

      '<div class="field"><label>① 把这台的进度搬到别的设备</label>' +
      '<div class="sync-gens">' +
        '<button class="btn btn-primary btn-sm" id="sy-gen">生成同步码</button>' +
        '<button class="btn btn-sm" id="sy-gen-raw">🧓 老设备兼容码</button>' +
      '</div>' +
      '<textarea id="sy-code" class="sync-code" readonly placeholder="点上面的按钮生成，然后复制"></textarea>' +
      '<div class="sync-acts">' +
        '<button class="btn btn-sm" id="sy-copy" disabled>📋 复制同步码</button>' +
        '<button class="btn btn-sm" id="sy-link" disabled>🔗 复制为链接</button>' +
      '</div>' +
      '<div class="hint" id="sy-note">同步码是一段文本，发到微信「文件传输助手」，在另一台设备粘进下面第 ② 步就行。</div>' +
      '</div>' +

      '<div class="field"><label>② 把别的设备的进度搬进来</label>' +
      '<textarea id="sy-in" class="sync-code" placeholder="把那边生成的同步码（或整条链接）粘在这里"></textarea>' +
      '<button class="btn btn-primary btn-sm" id="sy-import">导入到这台</button>' +
      '<div class="hint">导入前会自动把本机现在这份存成备份，导错了能一键还原。</div>' +
      '</div>';

    const foot = '<button class="btn btn-ghost" id="sy-close">关闭</button>' +
      (bak ? '<button class="btn btn-warn" id="sy-restore">↩️ 还原导入前的备份</button>' : '');

    openModal({
      title: '🔗 跨设备同步',
      body: body,
      foot: foot,
      onMount: function (m) {
        let code = '';
        const codeEl = $('#sy-code', m);
        const copyBtn = $('#sy-copy', m);
        const linkBtn = $('#sy-link', m);
        const noteEl = $('#sy-note', m);

        $('#sy-close', m).onclick = closeModal;

        /* 老手机（荣耀自带浏览器、微信 X5 内核等）读不了压缩码时的退路：
           出一份不压缩的码，长是长，但只要是浏览器就能读。 */
        $('#sy-gen-raw', m).onclick = function () {
          codeEl.value = '正在打包（不压缩，请稍等）…';
          window.Sync.encode(S, { raw: true }).then(function (r) {
            code = r.code;
            codeEl.value = code;
            copyBtn.disabled = false;
            linkBtn.disabled = r.size > 6000;
            noteEl.innerHTML = '共 ' + r.size + ' 个字符（<b>未压缩的兼容码</b>）。这份会更长，' +
              '但连老手机自带的浏览器也读得出来——对面要是报「解不开压缩的同步码」，就发这一份。' +
              (r.droppedThumbs ? ' 码太长，已不带证据库里的图片缩略图。' : '') +
              (r.size > 6000 ? ' 太长不适合做成链接，直接复制文本发过去。' : '');
          }).catch(function (e) {
            codeEl.value = '';
            toast('❌ 生成失败：' + e.message, 'err');
          });
        };

        $('#sy-gen', m).onclick = function () {
          codeEl.value = '正在打包…';
          window.Sync.encode(S).then(function (r) {
            code = r.code;
            codeEl.value = code;
            copyBtn.disabled = false;
            linkBtn.disabled = r.size > 6000;
            noteEl.innerHTML = '共 ' + r.size + ' 个字符' +
              (r.compressed ? '（已压缩）' : '（这台浏览器不支持压缩，码会偏长）') +
              (r.droppedThumbs
                ? '。码太长，已<b>不带证据库里的图片缩略图</b>——原文和全部进度都在，图片缩略图到了新设备要重新生成。'
                : '。') +
              (r.size > 6000 ? ' 太长了不适合做成链接，直接复制文本发过去更稳。' : '');
          }).catch(function (e) {
            codeEl.value = '';
            toast('❌ 生成失败：' + e.message, 'err');
          });
        };

        copyBtn.onclick = function () {
          if (!code) return;
          copyText(code).then(function (ok) {
            toast(ok ? '📋 同步码已复制，去另一台设备粘贴导入。' : '复制没成功，手动全选上面的文本框复制吧。',
              ok ? 'ok' : 'warn', 6000);
          });
        };

        linkBtn.onclick = function () {
          if (!code) return;
          copyText(window.Sync.linkFor(code)).then(function (ok) {
            toast(ok ? '🔗 链接已复制。在另一台设备打开它，进度自动接上，不用再粘贴。' : '复制没成功。',
              ok ? 'ok' : 'warn', 7000);
          });
        };

        $('#sy-import', m).onclick = function () {
          window.Sync.decode($('#sy-in', m).value).then(function (obj) {
            openImportConfirm(obj);
          }).catch(function (e) {
            toast('❌ ' + e.message, 'err', 6000);
          });
        };

        const res = $('#sy-restore', m);
        if (res) res.onclick = function () {
          openModal({
            title: '↩️ 还原导入前的备份',
            body: '<div class="warnbox">会把本机存档退回到「上次导入 / 重置<b>之前</b>」那一份：<br>' +
              '<b>' + esc(window.Sync.when(bak.savedAt)) + '</b>' +
              '<div class="hint">' + esc(window.Sync.brief(bak.state)) + '</div></div>' +
              '<div class="hint">本机现在这一份也会先被存成备份，所以这一步同样可以反悔。</div>',
            foot: '<button class="btn btn-ghost" id="rb-no">取消</button><button class="btn btn-warn" id="rb-yes">确认还原</button>',
            onMount: function (m2) {
              $('#rb-no', m2).onclick = function () { openSyncModal(); };
              $('#rb-yes', m2).onclick = function () {
                if (!window.Store.restoreBackup()) return toast('备份读不出来。', 'err');
                closeModal();
                afterStoreSwap();
                toast('↩️ 已还原到备份那一份。', 'ok');
              };
            }
          });
        };
      }
    });
  }

  /* 导入前先把两边摊开对比，别让旧档悄悄盖掉新档 */
  function openImportConfirm(obj) {
    const remote = obj.state || {};
    const rAt = remote.savedAt || 0;
    const lAt = S.savedAt || 0;
    const older = !!(rAt && lAt && rAt < lAt);
    const same = !!(rAt && lAt && rAt === lAt);

    const rows = '<div class="sync-cmp">' +
      '<div><span class="k">这一码来自</span><b>' + esc(window.Sync.when(rAt)) + '</b>' +
        '<div class="hint">' + esc(window.Sync.brief(remote)) + '</div></div>' +
      '<div><span class="k">本机现在</span><b>' + esc(window.Sync.when(lAt)) + '</b>' +
        '<div class="hint">' + esc(window.Sync.brief(S)) + '</div></div>' +
      '</div>';

    const warn = older
      ? '<div class="errbox">⚠️ 这段同步码比本机这份<b>更旧</b>。继续导入会盖掉本机的新进度' +
        '（本机这份会自动留成备份，可以还原）。真的要盖吗？</div>'
      : (same
        ? '<div class="warnbox">两边看起来是同一份，导入等于再写一遍，不会出错。</div>'
        : '<div class="warnbox">导入会用这一份替换本机存档。本机现在这份会自动留成备份。</div>');

    openModal({
      title: '📥 导入这段同步码？',
      body: rows + warn +
        (obj.slim ? '<div class="hint">这段码是瘦身过的：不带证据库里的图片缩略图，文字笔记、进度、生物、成就都在。</div>' : ''),
      foot: '<button class="btn btn-ghost" id="ic-no">取消</button>' +
        '<button class="btn ' + (older ? 'btn-warn' : 'btn-primary') + '" id="ic-yes">' +
        (older ? '仍然覆盖导入' : '导入') + '</button>',
      onMount: function (m) {
        $('#ic-no', m).onclick = function () { openSyncModal(); };
        $('#ic-yes', m).onclick = function () {
          try { window.Store.importAll(obj); }
          catch (e) { return toast('❌ 导入失败：' + e.message, 'err'); }
          window.Sync.clearHash();
          closeModal();
          afterStoreSwap();
          toast('✅ 已导入，进度接上了：' + window.Sync.brief(S), 'ok', 8000);
        };
      }
    });
  }

  /* ---------------- 启动 ---------------- */
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
