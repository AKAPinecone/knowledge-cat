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
  /* 投喂单全清给多少豆：读 D.ECONOMY，别再往文案里写死数字（v1.24 起） */
  function feedBonus() {
    const e = D.ECONOMY || {};
    return (e.feed && e.feed.fullBonus) != null ? e.feed.fullBonus : 50;
  }
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
      if (r.built && r.built.length) {
        r.built.forEach(function (f) { toast('🏗️ ' + f.msg, 'ok', 6000); });
      }
      /* v1.27：营业到点收工（离线回来 / 在线等着都一样结算） */
      if (r.ops && r.ops.length) {
        r.ops.forEach(function (o) { toast('✅ ' + o.msg, 'ok', 7000); });
        if (bxPaint) bxPaint();
        if (curTab === 'garden' && !activeMask()) renderView();
        renderTop();
      }
      renderTop();
      /* v1.37：地图名牌上的倒计时 / 工地进度只改文字，不重绘地图 ——
         倒计时要是进 gardenSignature，地图每 8 秒重建一次，手指下的地图会被抽走。 */
      if (curTab === 'garden') tickWorldTimers();
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

    /* v1.37：现实时钟 —— 顶栏那个一直在走的时间，还有"现在是哪个时段 / 有没有早鸟加成"。
       时钟一律读 data.js 的 D.clockText()，跟早鸟判定同源，不会两边对不上。 */
    const clockV = $('#chip-clock-v');
    if (clockV) {
      clockV.textContent = (typeof D.clockText === 'function') ? D.clockText(new Date()) : '';
      const slot = (typeof D.timeSlotOf === 'function') ? D.timeSlotOf(new Date()) : null;
      const eb = (typeof D.earlyBirdOf === 'function') ? D.earlyBirdOf(new Date()) : null;
      const ck = $('#chip-clock-k');
      if (ck) ck.textContent = eb && eb.on ? '🌅' : ((slot && slot.emoji) || '🕐');
      const chip = $('#chip-clock');
      if (chip) {
        chip.classList.toggle('early', !!(eb && eb.on));
        chip.title = (slot ? slot.emoji + ' ' + slot.name + '（' + slot.hint + '）' : '现在的时间') +
          '　' + ((eb && eb.on)
            ? '· 早鸟加成中：12:00 前交任务，豆 ×' + eb.mul
            : '· 早鸟时段（12:00 前）已过，明天早上再来');
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

  /* 今天（本地）的日期串，和 game.js 的 todayKey 同一个格式 —— 内容指纹用 */
  function todayStr() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  /* 乐园页内容指纹：地图上看得见的东西（小生物落位与生病/休眠、掉落胶囊、
     工地进度、在岗人数、剧情旗子、保存舱开合）。内容没变就不重绘——
     地图是可拖动的，8 秒拆一次会造成"抖动 + 手指下的元素被抽走"。 */
  function gardenSignature() {
    try {
      const pets = S.pets.map(function (p) {
        return p.id + (p.stored ? '|s' : '') + (p.illness ? '|i' : '') + (p.dormant ? '|d' : '') +
          (p.workDay && p.workDay === todayStr() ? '|w' : '') +
          '|' + window.Game.stageOf(p).name;
      }).join(',');
      const caps = S.capsules.map(function (c) { return c.id + (c.place || 'x'); }).join(',');
      const b = S.build || {};
      const built = (b.built || []).join(',');
      const lv = Object.keys(b.lv || {}).map(function (k) { return k + b.lv[k]; }).join(',');
      /* v1.32：岗位记到人（谁在哪栋上班）—— 地图上的打工牌子靠它刷新 */
      const staff = Object.keys(b.staff || {}).map(function (k) { return k + ':' + (b.staff[k] || []).join('+'); }).join(',');
      const story = Object.keys(b.story || {}).filter(function (k) { return b.story[k]; }).sort().join(',');
      /* 建造中的剩余分钟：让进度条每隔约 1 分钟自然推进一次 */
      const under = Object.keys(b.under || {}).map(function (k) {
        const u = b.under[k];
        return k + ':' + Math.round(Math.max(0, u.finishAt - Date.now()) / 60000);
      }).join(',');
      return [pets, caps, built, lv, staff, story, under,
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
       进度条只数这几件（当前 8 条）；碎片和加餐退到下面当辅助信息。 */
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
    else if (v.type === 'writescript') verifyTag = '✍️ 自己写 / 改一篇导游词（≥' + (v.minChars || 120) + ' 字）';
    else if (v.type === 'wrongnote') verifyTag = '📕 交一份错题笔记（图片 / 文件）';

    let needTag = [];
    if (t.need && t.need.photo) needTag.push('📸 凭证截图');
    if (t.need && t.need.feynman) needTag.push('🗣️ 费曼卡 ×' + t.need.feynman);
    /* 所有走提交弹窗的任务都需至少提交一样凭证（图片/文件/录音）；自带截图或录音的任务已在其专属标签里体现。
       v1.36：错题整理只认图片/文件，单独说，不并进「凭证必交」。 */
    const needsUniversalEvidence = v.type !== 'practice' && v.type !== 'writescript' && v.type !== 'wrongnote' &&
      !((t.need && t.need.photo) || v.type === 'record');
    if (needsUniversalEvidence) needTag.push('📎 凭证必交');
    if (v.type === 'writescript') needTag.push('📎 正文即凭证');
    if (v.type === 'wrongnote') needTag.push('📎 笔记必交（图片 / 文件）');
    if (v.type === 'reading') needTag.push('📎 笔记 / 照片选填');
    else if (t.pick === 'book' && t.ctx && t.ctx.bookName) needTag.push('📚 归属：《' + esc(t.ctx.bookName) + '》');

    /* 读书任务在卡面上就把「读到第几天 / 计划几天」亮出来——不用点进弹窗才看得到。
       进度实时算：今天选了哪本，这块标签就跟着显示哪本（在下方 onMount 里局部刷新）。 */
    let readProgTag = null;
    if (v.type === 'reading') {
      const bp = window.Study.bookProgressOf(t.ctx.bookId || '');
      /* v1.28：卡面这行跟着「读到第几页」走（以前写死的是天数口径，页码制下会一直停在"已读 1 天"） */
      readProgTag = '<span class="tag tag-bookprog' + (bp.done ? ' tag-ok' : '') + '" data-readprog="' + esc(t.uid) + '">' +
        '📖 ' + esc(t.ctx.bookName || '未选') + '：' + esc(readProgText(bp, false)) + '</span>';
    }

    let sc = null;
    if (t.ctx && t.ctx.scriptId) sc = D.SCRIPTS.filter(function (x) { return x.id === t.ctx.scriptId; })[0];

    /* 按验证类型给入口按钮 */
    let side = '';
    if (!done) {
      /* 按验证类型给入口按钮的文案。改成查表，加新类型时不用再数嵌套括号 */
      const LABELS = {
        reading: '📖 去精读', record: '🎙️ 去录音', opinion: '📸 去凭证', quiz: '✍️ 去登记',
        note: '📝 去记录', writescript: '✍️ 去写导游词', wrongnote: '📕 去交笔记', practice: '📚 去练习'
      };
      const label = LABELS[v.type] || '去完成';
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
          (readProgTag || '') +
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
    /* 池塘里的水栖生物不会缺水，别给它冒"缺水"的泡（水位恒满，本来也选不中，这里是双保险） */
    const aqua = (typeof window.Game.isAqua === 'function') && window.Game.isAqua(p);
    ['water', 'nutri', 'clean', 'fun'].forEach(function (k) {
      if (k === 'water' && aqua) return;
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

  /* v1.32：地图上的打工标识。
     v1.34 起岗位是"留职"的，所以这里的两种状态变了意思：
       今天还能出工 → 金色小牌「👜 建筑名」；
       今天已经出过工（岗位还在，明天照常上班）→ 淡灰小牌「💤 建筑名·休」。
     没有岗位又有出工记录的情况不会出现（收工不撤岗了），兜底留着也无害。 */
  function workBadgeOf(p) {
    const g = window.Game;
    if (!g || typeof g.workplaceOf !== 'function') return '';
    const at = g.workplaceOf(p.id);
    const tired = (typeof g.isWorkedToday === 'function') && g.isWorkedToday(p);
    if (at && tired) return '<span class="pp-work rest">💤 <i>' + esc(at.name) + '·休</i></span>';
    if (at) return '<span class="pp-work">👜 <i>' + esc(at.name) + '</i></span>';
    if (tired) return '<span class="pp-work rest">💤 <i>今天已出工</i></span>';
    return '';
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
      workBadgeOf(p) +
      '<span class="pp-shadow"></span>';
  }

  /* 有些老物种没有立绘、走 emoji 兜底；emoji 字形框自带上下留白，
     投影得单独抬高一截，否则看着就像悬在半空。这里给容器打个标记。 */
  function artKindCls(sp) { return sp.img ? '' : ' pet-emoji'; }

  /* v1.37：名字挂在脚底下 —— 之前地图上只有一堆头像，谁是谁全靠认脸。
     名字是**地图专用**的（列表卡片里本来就写着名字，不用再说一遍），
     所以放在这儿而不是 petFaceHtml 里。 */
  function petNameHtml(p) {
    return '<span class="pp-name">' + esc(p.name) + '</span>';
  }

  function pottedPetHtml(p, zoneId) {
    const sp = window.Game.speciesById(p.speciesId);
    /* v1.29：真菌田 / 植物田都是直接种地里，不套花盆 */
    const inBed = zoneId === 'plantfield' || zoneId === 'fungusfield';
    return '<div class="park-pet potted' + (inBed ? ' no-pot' : '') + (p.illness ? ' sick' : '') + (p.dormant ? ' dormant' : '') + artKindCls(sp) +
      '" data-act="pet-open" data-id="' + p.id + '">' +
      petFaceHtml(p) + (inBed ? '' : '<span class="pp-pot">' + potSvg() + '</span>') +
      petNameHtml(p) + '</div>';
  }

  function pondPetHtml(p) {
    const sp = window.Game.speciesById(p.speciesId);
    return '<div class="park-pet pond-pet' + (p.illness ? ' sick' : '') + artKindCls(sp) +
      '" data-act="pet-open" data-id="' + p.id + '">' +
      petFaceHtml(p) + petNameHtml(p) + '</div>';
  }

  function walkerPetHtml(p) {
    const sp = window.Game.speciesById(p.speciesId);
    return '<div class="park-pet walker' + (p.illness ? ' sick' : '') + (p.dormant ? ' dormant' : '') + artKindCls(sp) +
      '" data-act="pet-open" data-id="' + p.id + '" data-pet="' + p.id + '">' +
      petFaceHtml(p) + petNameHtml(p) + '</div>';
  }

  /* 场景排：温室 / 孵化室（v1.20 起孵化仓改用 incubatorBodyHtml 的两个板块，这里不再需要） */

  /* ---------------- 保管室（保存舱）面板（可折叠） ---------------- */
  function podPanel() {
    const stored = S.pets.filter(function (p) { return p.stored; });
    let h = '<div class="panel pod-panel' + (podOpen ? ' open' : '') + '">';
    h += '<div class="panel-head pod-head" data-act="pod-toggle">' +
      '<h2>📦 保管室</h2>' +
      '<span class="hint">谁都能存 · 状态静止</span>' +
      '<span class="spacer"></span>' +
      '<span class="pod-count">' + stored.length + ' 只</span>' +
      '<span class="pod-caret">' + (podOpen ? '▾' : '▸') + '</span></div>';
    if (podOpen) {
      if (!stored.length) {
        h += '<div class="empty">保管室空着。任何阶段的小生物都可以从它的状态面板放进这里——状态会完全静止、不再消耗道具。需要它时再「取出」回到场地。</div>';
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

  /* ---- 建筑名牌上的倒计时（v1.37）----
     松果问「这栋还有多久干完」——以前得点进去看面板才知道。
     现在名牌下面直接挂一行字：营业中/出团中 · 还剩 N 分。
     只显示"正在干活"和"今天已经出过团"两种确定信息，其他的保持安静。 */
  function wbTimerOf(id) {
    if (typeof window.Game.opCfg !== 'function') return null;
    const ocfg = window.Game.opCfg(id);
    if (!ocfg) return null;
    const st = window.Game.opStatus(id);
    if (st.on) {
      return {
        text: (ocfg.kind === 'travel' ? '🧭 出团中 · 还剩 ' : '⏳ 营业中 · 还剩 ') + st.minutes + ' 分',
        cls: ' on'
      };
    }
    if (ocfg.kind === 'travel' && window.Game.doneToday('travel:' + id)) {
      return { text: '🧭 今天出过团了', cls: ' done' };
    }
    return { text: '⏳ 待开工', cls: '' };
  }
  /* 定时把名牌上的倒计时改一次字（只动 textContent，不重绘地图）。
     地图页不在前台、或者在拖地图时直接跳过，别打扰手指。 */
  function tickWorldTimers() {
    const nodes = document.querySelectorAll('.wb-timer[data-op]');
    for (let i = 0; i < nodes.length; i++) {
      const el = nodes[i];
      const id = el.getAttribute('data-op');
      const wt = wbTimerOf(id);
      if (!wt) continue;
      if (el.textContent !== wt.text) el.textContent = wt.text;
      const cls = 'wb-timer' + wt.cls;
      if (el.className !== cls) el.className = cls;
    }
    /* 建造中的名牌也一起走字（原本只在重绘时更新，看着像卡住了） */
    const bnodes = document.querySelectorAll('.wb-name[data-build]');
    for (let j = 0; j < bnodes.length; j++) {
      const bid = bnodes[j].getAttribute('data-build');
      const uc = window.Game.buildProgress(bid);
      if (!uc.on) continue;
      const pct = Math.round(uc.p * 100);
      const minLeft = Math.max(1, Math.ceil(uc.remain / 60000));
      const txt = (window.Game.buildingById(bid) || {}).name + ' · ' + pct + '%（约' + minLeft + '分钟）';
      if (bnodes[j].textContent !== txt) bnodes[j].textContent = txt;
    }
  }

  function worldMapHtml() {
    const nb = window.Game.nextBuilding();
    const meadow = window.Game.zoneById('meadow');
    const r = (meadow && meadow.rect) || [3, 10, 94, 82];
    let h = '<div class="world-viewport" id="world-vp">';
    h += '<div class="world-map" id="world-map">';
    h += '<img class="world-img" src="' + D.WORLD.img + '" alt="乐园地图" draggable="false">';
    /* v1.32：撤掉了压红转绿 / 冷绿柔光两层滤镜——底图按原色显示（只在 CSS 里留了一点点
       饱和与亮度校正，见 .world-img），不再有那层绿膜。 */

    /* 固定槽位的区域：真菌田 / 植物田 / 池塘（建筑已画在底图里，只摆热区） */
    D.ZONES.forEach(function (z) {
      if (z.roam) return;
      const pets = window.Game.petsInZone(z.id);
      h += '<div class="wzone wzone-' + z.id + '">';
      z.slots.forEach(function (pos, i) {
        const p = pets[i];
        h += '<div class="wslot' + (p ? ' filled' : '') + '" style="left:' + pos[0] + '%;top:' + pos[1] + '%">' +
          (p ? (z.id === 'pond' ? pondPetHtml(p) : pottedPetHtml(p, z.id)) : '<span class="wslot-dot"></span>') +
          '</div>';
      });
      h += zoneTagHtml(z, pets.length);
      h += '</div>';
      /* 真菌田的永夜氛围（v1.31）：不再压黑遮罩，改用萤火虫粒子——
         暖黄 / 青绿两色微光缓浮 + 明暗呼吸，夜晚感在、地形细节也不丢 */
      if (z.night) {
        const nbx = z.nightBox || [0.8, 6, 13.4, 88];
        h += '<div class="wzone-night" style="left:' + nbx[0] + '%;top:' + nbx[1] + '%;width:' + nbx[2] + '%;height:' + nbx[3] + '%">';
        for (let i = 0; i < 18; i++) {
          const mx = 5 + ((i * 53) % 90);                       /* 伪随机但稳定，重绘不闪 */
          const my = 6 + ((i * 41) % 86);
          const dur = 7 + (i % 5) * 1.9;
          const delay = -((i * 1.7) % 11);
          const sz = 3 + (i % 3) * 2;
          h += '<span class="firefly ' + (i % 2 ? 'cool' : 'warm') + '" style="left:' + mx + '%;top:' + my +
            '%;width:' + sz + 'px;height:' + sz + 'px;animation-duration:' + dur.toFixed(1) +
            's;animation-delay:' + delay.toFixed(1) + 's"></span>';
        }
        h += '</div>';
      }
    });

    /* 动物：自由穿行整张地图（田地与道路都能走，建筑和池塘绕开） */
    const roamPets = window.Game.petsInZone('meadow');
    h += '<div class="wzone wzone-meadow" id="wzone-meadow" style="left:' + r[0] + '%;top:' + r[1] +
      '%;width:' + r[2] + '%;height:' + r[3] + '%">';
    roamPets.forEach(function (p) { h += walkerPetHtml(p); });
    h += '</div>';

    /* 三台机器：底图已画好，只放热区 + 小名牌（v1.31 热区带显式高度，互不重叠） */
    D.MACHINES.forEach(function (m) {
      h += '<button class="wmachine" data-act="' + m.act + '" style="left:' + m.x + '%;top:' + m.y +
        '%;width:' + m.w + '%;height:' + (m.h || 24) + '%" title="' + esc(m.name) + '">' +
        '<span class="wm-label">' + (m.emoji || '') + ' ' + esc(m.name) + '</span></button>';
    });

    /* 建筑：已建成 / 建造中 / 下一块空地 / 还没轮到（画在底图里，热区罩上去） */
    D.BUILDINGS.forEach(function (b) {
      const box = 'left:' + b.x + '%;top:' + b.y + '%;width:' + b.w + '%;height:' + (b.h || 22) + '%';
      const built = window.Game.isBuilt(b.id);
      const uc = window.Game.buildProgress(b.id);
      if (built) {
        /* v1.37：名牌下面挂一条倒计时（营业中 / 出团中 · 还剩 N 分）。
           它由 tickWorldTimers() 定时改字，**不进 gardenSignature** ——
           倒计时要是进了指纹，地图每 8 秒重绘一次，手指下的地图会被抽走。 */
        const wt = wbTimerOf(b.id);
        h += '<button class="wbuilding built" data-act="build-open" data-id="' + b.id +
          '" style="' + box + '" title="' + esc(b.name) + '">' +
          '<span class="wb-name wb-name-lv">' + b.emoji + ' ' + b.name + ' Lv.' + window.Game.buildLv(b.id) + '</span>' +
          (wt ? '<span class="wb-timer' + wt.cls + '" data-op="' + b.id + '">' + esc(wt.text) + '</span>' : '') +
          '</button>';
      } else if (uc.on) {
        const pct = Math.round(uc.p * 100);
        const minLeft = Math.max(1, Math.ceil(uc.remain / 60000));
        h += '<button class="wbuilding plot under" data-act="build-open" data-id="' + b.id +
          '" style="' + box + '" title="' + esc(b.name) + ' 建造中">' +
          '<span class="wb-progress"><i style="width:' + pct + '%"></i></span>' +
          '<span class="wb-name" data-build="' + b.id + '">' + b.name + ' · ' + pct +
          '%（约' + minLeft + '分钟）</span></button>';
      } else if (nb && nb.id === b.id) {
        h += '<button class="wbuilding plot" data-act="build-open" data-id="' + b.id +
          '" style="' + box + '" title="在这里盖' + esc(b.name) + '">' +
          '<span class="wb-plus">＋</span><span class="wb-name">盖 ' + b.name + '</span></button>';
      } else {
        h += '<span class="wbuilding plot locked" style="' + box + '">' +
          '<span class="wb-lock">🔒</span><span class="wb-name">' + b.name + '</span></span>';
      }
    });

    h += '</div>';

    /* 剧情旗子 / 工地入口：挂在【视口】上而不是地图上——地图能横向拖，
       旗子要是跟着地图跑，拖到另一边就看不见了，容易漏掉剧情。
       该说的话都说完之后，旗子变成「去开工」——只要下一栋还能修，
       门口永远有一条路，不会出现"没旗子、也不知道该点哪儿"的死局。 */
    const ps = window.Game.pendingStory();
    if (ps) {
      h += '<button class="wstory-flag" data-act="story-play">💬 有话想跟你说</button>';
    } else if (nb && window.Game.storySeen('labor') && window.Game.buildGate().ok && !window.Game.underConstruction(nb.id)) {
      h += '<button class="wstory-flag wstory-build" data-act="build-open" data-id="' + nb.id + '">🔨 ' +
        nb.emoji + ' ' + esc(nb.name) + '工地等着你</button>';
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
      /* 第一次进来：视线落在左侧两块田（真菌田 + 植物田） */
      wp.x = -(lay.mw - lay.vw) * 0.10;
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
    let h = '';
    h += '<div class="world-wrap">';
    h += worldMapHtml();
    h += '<div class="park-tip">👆 点小生物照顾它 · 点建筑和机器进去看看 · 地图上按住左右拖</div>';
    h += '<button class="sync-banner" data-act="sync">📲 换设备玩？点这里把进度搬过去（跨设备同步）</button>';
    h += saveNagHtml();
    h += '</div>';

    h += sitePanel();
    h += podPanel();
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

  /* ---- 乐园运行时：小动物自由穿行整张地图（4.6 秒换目标点，v1.29） ----
     坐标是相对走动区（meadow.rect）的百分比；建筑带 / 图书馆 / 旅行社 / 池塘
     由 D.ROAM_AVOID 挡住：目标点和走过去的直线路径都要落在外面，不穿模、不卡死。 */
  let parkTimer = null;
  function stopPark() { if (parkTimer) { clearInterval(parkTimer); parkTimer = null; } }
  function parkBounds() {
    /* 返回的是【整张地图】的百分比范围（ROAM_AVOID 也是地图百分比，两套坐标必须一致） */
    const z = window.Game.zoneById('meadow');
    const r = (z && z.rect) || [3, 10, 94, 82];
    return { x1: r[0], y1: r[1], x2: r[0] + r[2], y2: r[1] + r[3] };
  }
  function roamFree(x, y) {
    const av = D.ROAM_AVOID || { rects: [], ellipses: [] };
    for (let i = 0; i < (av.rects || []).length; i++) {
      const q = av.rects[i];
      if (x > q.x1 && x < q.x2 && y > q.y1 && y < q.y2) return false;
    }
    for (let i = 0; i < (av.ellipses || []).length; i++) {
      const e = av.ellipses[i];
      const dx = (x - e.cx) / e.rx, dy = (y - e.cy) / e.ry;
      if (dx * dx + dy * dy < 1) return false;
    }
    return true;
  }
  function pathClear(x1, y1, x2, y2) {
    for (let i = 1; i <= 11; i++) {
      const t = i / 12;
      if (!roamFree(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t)) return false;
    }
    return true;
  }
  function parkPick(from) {
    const b = parkBounds();
    for (let tries = 0; tries < 10; tries++) {
      const x = b.x1 + Math.random() * (b.x2 - b.x1);
      const y = b.y1 + Math.random() * (b.y2 - b.y1);
      if (!roamFree(x, y)) continue;
      /* 从当前位置一路走过去都不能穿障碍；走不通就重抽，实在不行原地不动 */
      if (from && !pathClear(from.x, from.y, x, y)) continue;
      return { x: x, y: y };
    }
    /* 兜底：在脚下小范围挪一步，同样要落在空地且走过去不穿模；不行就原地站着 */
    if (from && roamFree(from.x, from.y)) {
      for (let tries = 0; tries < 8; tries++) {
        const x = Math.max(b.x1, Math.min(b.x2, from.x + (Math.random() * 8 - 4)));
        const y = Math.max(b.y1, Math.min(b.y2, from.y + (Math.random() * 6 - 3)));
        if (roamFree(x, y) && pathClear(from.x, from.y, x, y)) return { x: x, y: y };
      }
      return { x: from.x, y: from.y };
    }
    return { x: 10, y: 60 };
  }
  function startPark() {
    stopPark();
    const zone = document.getElementById('wzone-meadow');
    if (!zone) return;
    const z = window.Game.zoneById('meadow');
    const r = (z && z.rect) || [3, 10, 94, 82];
    $$('#wzone-meadow .walker').forEach(function (el) {
      const id = el.dataset.pet;
      const map = parkPosMap();
      if (!map[id] || !roamFree(map[id].x, map[id].y)) map[id] = parkPick(null);
      /* parkPosMap 存的是地图百分比；摆到 rect 内要用 rect 相对百分比 */
      el.style.left = ((map[id].x - r[0]) / r[2] * 100) + '%';
      el.style.top = ((map[id].y - r[1]) / r[3] * 100) + '%';
    });
    parkTimer = setInterval(parkTick, 9200);   /* v1.31：目标点间隔翻倍，步子慢一半 */
  }
  function parkTick() {
    const zone = document.getElementById('wzone-meadow');
    if (!zone) { stopPark(); return; }
    const z = window.Game.zoneById('meadow');
    const r = (z && z.rect) || [3, 10, 94, 82];
    $$('#wzone-meadow .walker').forEach(function (el) {
      const id = el.dataset.pet;
      /* v1.33：刚被双击赶跑的，给它几秒安静时间 —— 不然随机游走立刻把它拖回原处，
         "跑开"就成了一次没用的动画 */
      if (fleeUntil[id] && fleeUntil[id] > Date.now()) return;
      const from = parkPosMap()[id];
      if (!from) return;
      const to = parkPick(from);
      if (Math.abs(to.x - from.x) > 0.5) el.classList.toggle('flip', to.x < from.x);
      from.x = to.x; from.y = to.y;
      el.style.left = ((to.x - r[0]) / r[2] * 100) + '%';
      el.style.top = ((to.y - r[1]) / r[3] * 100) + '%';
    });
  }

  /* ---- v1.33：连点两次，动物就跑开 ----
     为什么要有这个：草地上小动物一多就会叠在一起，挡住了就点不开想点的那只。
     双击是"让一让"的意思 —— 它自己挪到一个离得远、又不穿建筑的新位置。
     只对**动物**生效（植物、水栖不会跑）；单击照旧弹状态面板，
     所以单击要等 300ms 确认没第二次点击再打开 —— 这点延迟换来的是不误开弹窗。 */
  const fleeUntil = {};
  let tapState = { id: '', at: 0, timer: null };
  function isAnimalPet(petId) {
    const p = S.pets.filter(function (x) { return x.id === petId; })[0];
    if (!p) return false;
    const sp = window.Game.speciesById(p.speciesId);
    return !!(sp && sp.kind === 'animal');
  }
  function fleePet(petId) {
    const el = document.querySelector('#wzone-meadow .walker[data-pet="' + petId + '"]');
    const map = parkPosMap();
    const from = map[petId];
    if (!el || !from) return;
    const z = window.Game.zoneById('meadow');
    const r = (z && z.rect) || [3, 10, 94, 82];
    const b = parkBounds();
    let to = null;
    for (let i = 0; i < 30; i++) {
      const x = b.x1 + Math.random() * (b.x2 - b.x1);
      const y = b.y1 + Math.random() * (b.y2 - b.y1);
      if (!roamFree(x, y)) continue;
      const dist = Math.sqrt((x - from.x) * (x - from.x) + (y - from.y) * (y - from.y));
      if (dist < 14) continue;                       /* 太近不算"跑开" */
      if (!pathClear(from.x, from.y, x, y)) continue; /* 走过去不能穿建筑 */
      to = { x: x, y: y }; break;
    }
    if (!to) return;    /* 抽不到远处的空地就不动它 —— 宁可不动，也别把它塞进建筑里 */
    el.classList.toggle('flip', to.x < from.x);
    el.classList.add('fleeing');
    from.x = to.x; from.y = to.y;
    el.style.left = ((to.x - r[0]) / r[2] * 100) + '%';
    el.style.top = ((to.y - r[1]) / r[3] * 100) + '%';
    fleeUntil[petId] = Date.now() + 6000;
    setTimeout(function () { if (el.classList) el.classList.remove('fleeing'); }, 1300);
    const p = S.pets.filter(function (x) { return x.id === petId; })[0];
    if (p) toast('💨 ' + esc(p.name) + ' 跑开了，换了个地方待着。', 'ok', 2600);
  }
  function tapWalker(el) {
    const id = el.dataset.pet;
    if (!id) return;
    if (!isAnimalPet(id)) return openCreatureModal(id);   /* 非动物：保持单击即开 */
    const now = Date.now();
    if (tapState.id === id && now - tapState.at < 340) {  /* 第二次点同一只 → 跑开 */
      if (tapState.timer) { clearTimeout(tapState.timer); tapState.timer = null; }
      tapState.id = ''; tapState.at = 0;
      return fleePet(id);
    }
    tapState.id = id; tapState.at = now;
    if (tapState.timer) clearTimeout(tapState.timer);
    tapState.timer = setTimeout(function () {
      tapState.timer = null; tapState.id = '';
      if (activeMask()) return;      /* 这 300ms 里开了别的弹窗，就别顶掉它 */
      openCreatureModal(id);
    }, 300);
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
    /* Lv.3 那段是"最年长的那只"发起：用它的真名，并把正文里的 {pet} 换掉。
       没有成年体时（v1.20 起不再卡这个）就退回全体里最年长的那只。 */
    let elder = null;
    if (key === 'labor') elder = window.Game.elderPet ? window.Game.elderPet() : window.Game.oldestAdult();
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

  /* ---- 孵化仓（v1.20）：只有「未孵化 / 孵化完成」两个板块 ----
     以前按 温室托位 / 动物托位 分成两栏，和地图上的「温室」区域语义打架，
     而且玩家得先搞清楚物种属于哪个家才能放。现在一颗池子，按进度分板块。 */
  function incProgOf(c) {
    return Math.min(1, (Date.now() - c.hatchStart) / (c.hatchMinutes * 60000));
  }
  function incCellHtml(c, prog) {
    const sp = window.Game.speciesById(c.speciesId);
    const done = prog >= 1;
    const gate = window.Game.quizGate(c.id);
    const needQuiz = done && gate.on && !gate.passed;
    return '<div class="inc-cell filled' + (done ? ' ready' : '') + '">' +
      '<button class="inc-pod" data-act="cap-open" data-id="' + c.id +
      '" title="' + esc(sp.name) + '">' + spArt(sp, 'hp-emoji') +
      '<span class="hp-bar"><i style="width:' + Math.round(prog * 100) + '%"></i></span>' +
      (done ? '<span class="hp-tag">✨</span>' : '') + '</button>' +
      '<div class="inc-name">' + esc(sp.name) + '</div>' +
      (done
        ? '<button class="btn btn-sm btn-primary" data-act="hatch" data-id="' + c.id + '">' +
          (needQuiz ? '🧠 答题破壳' : '破壳') + '</button>'
        : '<button class="btn btn-sm btn-ghost" data-act="speedup" data-id="' + c.id +
          '" title="消耗 1 个加速沙漏，推进 30 分钟">⏳ ' + Math.round(prog * 100) + '%</button>') +
      '</div>';
  }
  function incubatorBodyHtml() {
    const inPod = S.capsules.filter(function (c) { return c.place; });
    const hatching = inPod.filter(function (c) { return incProgOf(c) < 1; });
    const ready = inPod.filter(function (c) { return incProgOf(c) >= 1; });
    const loose = S.capsules.filter(function (c) { return !c.place; });
    const u = window.Game.usedSlots();
    const empty = Math.max(0, u.cap - u.used);

    let h = '<div class="inc-head"><span class="bx-lv">🥚 托位 ' + u.used + '/' + u.cap +
      '　·　未孵化 ' + hatching.length + '　·　可破壳 ' + ready.length + '</span>' +
      '<button class="btn btn-sm" data-act="expand" title="🌰 120 扩一个托位">➕ 扩托位</button></div>';

    /* 板块一：未孵化（待安置的胶囊改在「保管室」里统一管理，见 v1.21） */
    h += '<section class="inc-sec"><div class="inc-sec-head">' +
      '<span class="inc-t">🕒 未孵化</span><span class="inc-n">' + hatching.length + '</span>' +
      '<span class="spacer"></span>' +
      (loose.length ? '<span class="inc-sub">还有 ' + loose.length + ' 颗待安置胶囊在「保管室」</span>'
        : '<span class="inc-sub">没有待安置的胶囊</span>') +
      '</div><div class="inc-grid">';
    hatching.forEach(function (c) { h += incCellHtml(c, incProgOf(c)); });
    for (let i = 0; i < empty; i++) h += '<div class="inc-cell empty"><span class="wslot-dot"></span></div>';
    if (!hatching.length && !empty) h += '<div class="empty">仓里空着。</div>';
    h += '</div></section>';

    /* 板块二：孵化完成 */
    h += '<section class="inc-sec"><div class="inc-sec-head">' +
      '<span class="inc-t">✨ 孵化完成</span><span class="inc-n">' + ready.length + '</span>' +
      '<span class="spacer"></span><span class="inc-sub">破壳前先答一份小卷</span></div>' +
      '<div class="inc-grid">';
    if (ready.length) ready.forEach(function (c) { h += incCellHtml(c, 1); });
    else h += '<div class="empty">还没有到点的胶囊。</div>';
    h += '</div></section>';
    return h;
  }

  /* 孵化仓弹窗开着时就地刷新（绝不关窗再开窗——用户可能已经划到别处了） */
  function refreshIncModal() {
    const board = $('#inc-board');
    const m = activeMask();
    if (!board || !m || !document.documentElement.contains(board)) return;
    board.innerHTML = incubatorBodyHtml();
    wireModal(m);
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
        title: '🥚 胶囊孵化仓',
        wide: true,
        body: '<div class="inc-board" id="inc-board">' + incubatorBodyHtml() + '</div>',
        foot: '<button class="btn btn-ghost" data-act="m-close">关闭</button>',
        onMount: wireModal
      });
      return;
    }
    /* 保管室：待安置胶囊 + 保存的小生物 + 旅行收藏品 */
    openModal({
      title: '📦 保管室',
      body: '<div id="storage-board">' + storageBoardHtml() + '</div>',
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

  /* ---- 保管室：格子 + 同物种堆叠（v1.23） ----
     以前一个胶囊占一行、一只小生物占一张卡，攒到十几行就得一直往下滚。
     现在同物种合成一格、右上角挂数量，点一下就在原地摊开这一格的成员：
     要放的要取的要送养的，全在那一格底下，不翻页、不滚屏。 */
  let stackOpen = null;   /* 摊开的是哪一格：{kind:'cap'|'pet', sp:'speciesId'} */

  /* 同物种归堆；稀有的排前面，同稀有度按数量多的排前面 */
  function stackGroups(list) {
    const map = {}, keys = [];
    (list || []).forEach(function (x) {
      const k = x.speciesId || '_x';
      if (!map[k]) { map[k] = []; keys.push(k); }
      map[k].push(x);
    });
    const groups = keys.map(function (k) { return { speciesId: k, items: map[k] }; });
    groups.sort(function (a, b) {
      const ra = (window.Game.speciesById(a.speciesId) || {}).rarity || 1;
      const rb = (window.Game.speciesById(b.speciesId) || {}).rarity || 1;
      if (rb !== ra) return rb - ra;
      return b.items.length - a.items.length;
    });
    return groups;
  }
  function stackIsOpen(kind, spId) {
    return !!(stackOpen && stackOpen.kind === kind && stackOpen.sp === spId);
  }

  /* 一个格子 = 一个物种，右上角 ×N */
  function stackCellHtml(g, kind) {
    const sp = window.Game.speciesById(g.speciesId) || {};
    const n = g.items.length;
    const open = stackIsOpen(kind, g.speciesId);
    return '<button class="stack-cell rar' + (sp.rarity || 1) + (open ? ' open' : '') +
      '" data-act="stack-toggle" data-kind="' + kind + '" data-sp="' + esc(g.speciesId) +
      '" title="' + esc(sp.name || '') + ' ×' + n + '">' +
      '<span class="sc-art">' + spArt(sp, 'sc-img') + '</span>' +
      (n > 1 ? '<span class="sc-n">×' + n + '</span>' : '') +
      '<span class="sc-name">' + esc(sp.name || '未知') + '</span>' +
      '</button>';
  }

  /* 摊开的那一层：这一格里每个成员一行 */
  function stackSheetHtml(g, kind) {
    const sp = window.Game.speciesById(g.speciesId) || {};
    let h = '<div class="stack-sheet">' +
      '<div class="ss-head"><span class="ss-t">' + (sp.emoji || '') + ' ' + esc(sp.name || '未知') + '</span>' +
      '<span class="ss-n">这一格 ' + g.items.length + ' 个</span>' +
      '<span class="spacer"></span>' +
      '<button class="btn btn-sm btn-ghost" data-act="stack-toggle" data-kind="' + kind +
      '" data-sp="' + esc(g.speciesId) + '">收起</button></div>';

    if (kind === 'cap') {
      const u = window.Game.usedSlots();
      const room = Math.max(0, u.cap - u.used);
      h += '<div class="ss-tip">' + (room > 0
        ? '孵化仓还有 ' + room + ' 个空托位（' + u.used + '/' + u.cap + '）'
        : '托位满了（' + u.used + '/' + u.cap + '），先回孵化仓扩一个') + '</div>';
      h += '<div class="ss-list">';
      g.items.forEach(function (c) {
        h += '<div class="ss-row">' + spArt(sp, 'ss-art') +
          '<span class="ss-txt">' + esc(sp.name || '') +
          '<span class="ss-sub"> · 孵化要 ' + c.hatchMinutes + ' 分钟</span></span>' +
          '<button class="btn btn-sm btn-primary" data-act="place" data-id="' + c.id + '"' +
          (room > 0 ? '' : ' disabled') + '>放入孵化仓</button></div>';
      });
      h += '</div>';
      if (g.items.length > 1 && room > 0) {
        h += '<div class="ss-foot"><button class="btn btn-sm btn-gold" data-act="place-batch" data-sp="' +
          esc(g.speciesId) + '">一次全放（最多 ' + Math.min(room, g.items.length) + ' 个）</button></div>';
      }
    } else {
      h += '<div class="ss-list">';
      g.items.forEach(function (p) {
        const st = window.Game.stageOf(p);
        h += '<div class="ss-row">' + spArt(sp, 'ss-art') +
          '<span class="ss-txt ss-link" data-act="pet-open" data-id="' + p.id + '">' +
          '<b>' + esc(p.name) + '</b><span class="ss-sub"> · ' + st.emoji + ' ' + st.name +
          ' · 成长 ' + Math.round(p.growth) + ' · 被照顾 ' + p.careCount + ' 次</span></span>' +
          '<button class="btn btn-sm" data-act="unstore-pet" data-id="' + p.id + '">取出</button>' +
          '<button class="btn btn-sm btn-ghost" data-act="adopt-pet" data-id="' + p.id + '">🤝 送养</button></div>';
      });
      h += '</div>';
    }
    return h + '</div>';
  }

  function stackGridHtml(groups, kind) {
    let h = '<div class="stack-grid">';
    groups.forEach(function (g) {
      h += stackCellHtml(g, kind);
      if (stackIsOpen(kind, g.speciesId)) h += stackSheetHtml(g, kind);
    });
    return h + '</div>';
  }

  /* 保管室面板内容（可原地刷新）：待安置胶囊 + 存放的小生物 + 旅行收藏品 */
  function storageBoardHtml() {
    const stored = S.pets.filter(function (p) { return p.stored; });
    const cols = window.Game.collectionsOwned();
    const loose = S.capsules.filter(function (c) { return !c.place; });
    const capG = stackGroups(loose);
    const petG = stackGroups(stored);
    let h = '<div class="bx-lv">📦 保管室 ' + stored.length + ' 只（' + petG.length + ' 格）　·　🥚 待安置胶囊 ' +
      loose.length + ' 颗（' + capG.length + ' 格）　·　🧭 收藏品 ' + cols.length +
      '/' + (D.COLLECTIONS || []).length + '</div>';

    /* 待安置胶囊（v1.21：从孵化仓挪到保管室统一管理 · v1.23 改格子堆叠） */
    h += '<div class="panel-head" style="margin-top:6px"><h2>🥚 待安置胶囊</h2>' +
      '<span class="hint">同种堆一格 · 点格子摊开</span></div>';
    h += loose.length ? stackGridHtml(capG, 'cap')
      : '<div class="empty">没有待安置的胶囊——都已经在孵化仓里开始孵化了。</div>';

    /* 存放的小生物 */
    h += '<div class="panel-head" style="margin-top:16px"><h2>📦 存放的小生物</h2>' +
      '<span class="hint">谁都能存 · 状态静止</span></div>';
    h += stored.length ? stackGridHtml(petG, 'pet')
      : '<div class="empty">保管室空着。任何阶段的小生物都能从它的状态面板放进这里，状态完全静止。</div>';

    /* 旅行收藏品 */
    h += '<div class="panel-head" style="margin-top:16px"><h2>🧭 旅行收藏品</h2>' +
      '<span class="hint">建好旅行社，让导游带回来</span></div>' + colGridHtml(cols);
    return h;
  }

  /* 保管室弹窗开着时就地刷新（绝不关窗再开窗） */
  function refreshStorageModal() {
    const board = document.getElementById('storage-board');
    const m = activeMask();
    if (!board || !m || !document.documentElement.contains(board)) return;
    const wrap = document.createElement('div');
    wrap.innerHTML = '<div id="storage-board">' + storageBoardHtml() + '</div>';
    board.parentNode.replaceChild(wrap.firstChild, board);
    wireModal(m);
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
    let anyTired = false;
    [['animal', '劳力', '动物'], ['plant', '材料', '植物'], ['fungus', '胶合料', '真菌']].forEach(function (r) {
      const pool = window.Game.workersOf(r[0]);
      h += '<div class="pick-head"><b>出' + r[1] + '的' + r[2] + '</b><span>成年体可选 · ' +
        pool.length + ' 只</span></div>';
      if (!pool.length) {
        h += '<div class="empty">还没有能出' + r[1] + '的成年' + r[2] + '。</div>';
        return;
      }
      h += '<div class="staff-grid">';
      pool.forEach(function (p) {
        const sp = window.Game.speciesById(p.speciesId);
        const st = window.Game.stageOf(p);
        /* v1.32：今天已经出过工的派不了 —— 格子上直接说清楚，别让人点完才被弹回来 */
        const tired = (typeof window.Game.isWorkedToday === 'function') && window.Game.isWorkedToday(p);
        if (tired) anyTired = true;
        const sel = !!(bxState && bxState[r[0]] === p.id);
        h += '<button type="button" class="pg-cell' + (sel ? ' on' : '') + (tired ? ' off' : '') +
          '" data-act="bx-pick" data-role="' + r[0] + '" data-pet="' + p.id + '"' + (tired ? ' disabled' : '') + '>' +
          '<span class="pg-face' + (sp.img ? '' : ' pet-emoji') + '">' +
          (sp.img ? '<img src="' + sp.img + '" alt="">' : sp.emoji) + '</span>' +
          '<span class="pg-name">' + esc(p.name) + '</span>' +
          '<span class="pg-sub">' + esc(sp.name) + ' · ' + st.name + '</span>' +
          (tired ? '<span class="pg-tag rest">💤 今天已出工</span>' : '') +
          '</button>';
      });
      h += '</div>';
    });
    if (anyTired) {
      h += '<div class="fh" style="margin:-4px 0 10px">💤 标着「今天已出工」的刚干过活，今天派不了；' +
        '明天自动刷新（一只小生物每天只出一趟工，修建和打工算同一趟）。已经上岗的不会因为收工掉岗位。</div>';
    }
    const ready = bxState && bxState.animal && bxState.plant && bxState.fungus;
    h += '<button class="btn btn-primary btn-block" data-act="bx-go" data-id="' + id + '"' +
      (gate.ok && ready ? '' : ' disabled') + '>' + (up ? '🔨 开始扩建' : '🔨 开始建造') + '</button>';
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
        const tired = (typeof window.Game.isWorkedToday === 'function') && window.Game.isWorkedToday(p);
        h += '<div class="staff-chip' + (tired ? ' tired' : '') + '"' +
          (tired ? ' title="💤 今天已经出过工了，明天自动回来上班（岗位给它留着）" ' : '') + '>' +
          '<span class="sc-face' + (sp.img ? '' : ' pet-emoji') + '">' +
          (sp.img ? '<img src="' + sp.img + '" alt="">' : sp.emoji) + '</span>' +
          '<span class="sc-name">' + esc(p.name) + (tired ? ' 💤' : '') + '</span>' +
          '<button class="sc-x" data-act="bx-unstaff" data-id="' + id + '" data-pet="' + p.id + '" title="让它下班">✕</button>' +
          '</div>';
      });
      h += '</div>';
    } else {
      h += '<div class="empty">还没有小生物来上班。点下面的头像安排一只。</div>';
    }
    /* v1.32：格子式选人（原来是个下拉菜单）。一格一只，头像 + 名字 + 状态标签，
       点一下就上岗；今天已经出过工的格子会灰掉（每天只出一趟工）。 */
    const pool = S.pets.filter(function (p) {
      return !p.stored && !p.illness && staff.indexOf(p.id) < 0;
    });
    const poolTired = pool.filter(function (p) {
      return (typeof window.Game.isWorkedToday === 'function') && window.Game.isWorkedToday(p);
    });
    if (pool.length && staff.length < cap) {
      /* 能上岗的排前面，灰掉的往后放，一眼看清"现在能派谁" */
      const sorted = pool.slice().sort(function (a, b) {
        const ta = (typeof window.Game.isWorkedToday === 'function') && window.Game.isWorkedToday(a) ? 1 : 0;
        const tb = (typeof window.Game.isWorkedToday === 'function') && window.Game.isWorkedToday(b) ? 1 : 0;
        if (ta !== tb) return ta - tb;
        const aa = (typeof window.Game.isAdult === 'function') && window.Game.isAdult(a) ? 0 : 1;
        const ab = (typeof window.Game.isAdult === 'function') && window.Game.isAdult(b) ? 0 : 1;
        return aa - ab;
      });
      h += '<div class="pick-head"><b>安排一只来上班</b><span>点一下就上岗 · 还剩 ' +
        (cap - staff.length) + ' 个空位</span></div>';
      h += '<div class="staff-grid">';
      sorted.forEach(function (p) {
        const sp = window.Game.speciesById(p.speciesId);
        const st = window.Game.stageOf(p);
        const tired = typeof window.Game.isWorkedToday === 'function' && window.Game.isWorkedToday(p);
        const adult = typeof window.Game.isAdult === 'function' ? window.Game.isAdult(p) : true;
        const at = (typeof window.Game.workplaceOf === 'function') ? window.Game.workplaceOf(p.id) : null;
        const off = tired || !adult;
        h += '<button type="button" class="pg-cell' + (off ? ' off' : '') +
          '" data-act="bx-staff" data-id="' + id + '" data-pet="' + p.id + '"' + (off ? ' disabled' : '') + '>' +
          '<span class="pg-face' + (sp.img ? '' : ' pet-emoji') + '">' +
          (sp.img ? '<img src="' + sp.img + '" alt="">' : sp.emoji) + '</span>' +
          '<span class="pg-name">' + esc(p.name) + '</span>' +
          '<span class="pg-sub">' + esc(sp.name) + ' · ' + st.name + '</span>' +
          (tired ? '<span class="pg-tag rest">💤 今天已出工</span>'
                 : (at ? '<span class="pg-tag move">👜 在' + esc(at.name) + '·转岗</span>'
                       : (adult ? '' : '<span class="pg-tag off">未成年</span>'))) +
          '</button>';
      });
      h += '</div>';
    } else if (pool.length) {
      h += '<div class="fh" style="margin:-4px 0 4px">岗位满了（' + staff.length + '/' + cap +
        '）。想多带几只的话，先扩建这栋，或者让一只下班。</div>';
    }
    if (poolTired.length) {
      h += '<div class="fh" style="margin:-4px 0 10px">💤 有 ' + poolTired.length +
        ' 只今天已经出过工了，明天自动刷新；<b>已经上岗的收工后不会掉岗位</b>，明天接着开工不用重新排班。</div>';
    }
    /* v1.27：运营建筑（食堂 / 澡堂 / 图书馆）走倒计时制 */
    if (typeof window.Game.opCfg === 'function' && window.Game.opCfg(id)) {
      h += opBoxHtml(id);
    }
    /* v1.37：旅行社不再从这里出团 —— 它有自己的倒计时开工按钮（见 opBoxHtml）。
       这里只留「查看陈列」这种纯查看的入口。 */
    const ACTS = {
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

  /* ---- 运营建筑：倒计时框 + 小日志（v1.27） ---- */
  function opBoxHtml(id) {
    const cfg = window.Game.opCfg(id);
    const stt = window.Game.opStatus(id);
    const capN = window.Game.opGuestCap(id);
    /* v1.37：旅行社也走这一套（kind:'travel'），但它没有"客人"，
       是导游带同伴出门 —— 文案与人数那几处要分开写。 */
    const isTrip = cfg.kind === 'travel';
    let h = '<div class="op-box' + (stt.on ? ' running' : '') + '">';
    /* 这一轮要花什么 */
    const costBits = [];
    Object.keys(cfg.costPerGuest || {}).forEach(function (k) {
      const it = D.ITEM_MAP[k];
      const per = cfg.costPerGuest[k] || 0;
      costBits.push((it ? it.emoji : '') + (it ? it.name : k) + ' ×' + per + '/位');
    });
    h += '<div class="op-meta">' +
      '<span>⏱️ 一轮 ' + cfg.minutes + ' 分钟</span>' +
      (isTrip ? '<span>🧭 第 1 只当导游，带同伴一起走</span>'
              : '<span>👥 接待 ' + capN + ' 位</span>') +
      (costBits.length ? '<span>🧺 ' + costBits.join('、') + '</span>' : '<span>🧺 不耗物资</span>') +
      '<span>💪 劳力：' + (cfg.labor || 1) + ' 只在岗出力' +
      (isTrip ? '（各掉 ' + (cfg.laborNeed || 8) + ' 点状态）' : '（需求 -' + (cfg.laborNeed || 6) + '）') + '</span>' +
      '</div>';
    if (stt.on) {
      h += '<div class="bar bar-lg" style="margin:10px 0 6px"><i style="width:' +
        Math.round(stt.p * 100) + '%;background:linear-gradient(90deg,#F0C36D,#E9A13B)"></i></div>';
      h += '<div class="op-run">' + (isTrip ? '🧭 出团中 · 还剩约 ' + stt.minutes + ' 分钟'
        : '营业中 · 还剩约 ' + stt.minutes + ' 分钟（' + stt.guests + ' 位客人在里面）') + '</div>';
      const names = (stt.st.guests || []).map(function (pid) {
        const p = window.Game.petById(pid);
        return p ? p.name : '';
      }).filter(Boolean);
      if (names.length) h += '<div class="op-guests">' + esc(names.join('、')) + '</div>';
      else if (isTrip) {
        const crewNames = (stt.st.crew || []).map(function (pid) {
          const p = window.Game.petById(pid);
          return p ? p.name : '';
        }).filter(Boolean);
        if (crewNames.length) h += '<div class="op-guests">🧭 同行的：' + esc(crewNames.join('、')) + '</div>';
      }
    } else {
      const tripDone = isTrip && window.Game.doneToday('travel:' + id);
      h += '<button class="btn btn-primary btn-block" data-act="op-start" data-id="' + id + '"' +
        (tripDone ? ' disabled' : '') + '>' +
        cfg.emoji + ' ' + cfg.label + (tripDone ? '（今天已经出过团了）' : '') + '</button>';
      h += '<div class="bx-tip">' + (isTrip
        ? '开工要点：至少 1 只导游 + 1 只同伴在岗（第 1 只当导游）。走的这几只各掉 ' + (cfg.laborNeed || 8) + ' 点状态，当天下班但岗位保留；约 ' + Math.round((cfg.minutes || 120) / 60) + ' 小时后回来，带回可可豆、土特产和收藏品。'
        : '开工要物资 + 在岗小生物的劳力；收工时给来光顾的小生物' +
          esc(cfg.verb === '吃了顿热乎的' ? '管饱' : (cfg.verb === '泡了个热水澡' ? '洗干净' : '补心情')) +
          '，并记进下面的小日志。') + '</div>';
    }
    h += '</div>';

    /* 小日志 */
    const logs = window.Game.opLogs(id);
    h += '<div class="panel-head" style="margin-top:14px"><h2>📔 ' + esc((window.Game.buildingById(id) || {}).name || '') + ' 的小日志</h2>' +
      '<span class="hint">最近 ' + logs.length + ' 条</span></div>';
    if (!logs.length) {
      h += '<div class="empty">还没有开过张。安排小生物来上班，点上面的按钮开工。</div>';
    } else {
      h += '<div class="op-logs">';
      logs.forEach(function (rec) {
        h += '<div class="op-log">' +
          '<div class="opl-head"><span>' + rec.emoji + ' ' + esc(rec.label) + '</span>' +
          '<span class="spacer"></span><span class="opl-time">' + esc(fmtWhen(rec.at)) + '</span></div>';
        rec.guests.forEach(function (g) {
          const dtx = g.delta.map(function (d2) {
            if (d2.stat === 'grow') return '成长 +' + d2.v;
            const si = D.STAT_INFO[d2.stat] || { label: d2.stat, emoji: '' };
            return si.emoji + si.label + (d2.v >= 0 ? ' +' : ' ') + d2.v;
          }).join('　');
          h += '<div class="opl-row">' +
            '<span class="opl-who">' + g.emoji + ' <b>' + esc(g.name) + '</b>' +
              '<i class="opl-trait">' + g.traitEmoji + esc(g.traitName) + '</i></span>' +
            '<span class="opl-act">' + esc(g.act) + '</span>' +
            (g.accident ? '<span class="opl-acc">💥 ' + esc(g.accident.name) + '：' + esc(g.accident.text) + '</span>' : '') +
            '<span class="opl-delta">' + esc(dtx) + '</span>' +
            '</div>';
        });
        h += '<div class="opl-out">产出：' + esc(rec.out) +
          (rec.crew && rec.crew.length ? '　·　出力：' + esc(rec.crew.join('、')) : '') + '</div>';
      });
      h += '</div>';
    }
    return h;
  }

  function openBuildingModal(id, forceBuild) {
    const b = window.Game.buildingById(id);
    if (!b) return;
    const built = window.Game.isBuilt(id);
    const isNext = (window.Game.nextBuilding() || {}).id === id;
    if (!built && !isNext) { toast('这栋还锁着，先把前面那栋盖好。', 'warn'); return; }
    /* 建造中：只读进度面板（不能再开工，等它自己建完或离线回来结算） */
    const uc = window.Game.buildProgress(id);
    if (uc.on) {
      const lvAfter = (window.Game.buildLv(id) || 0) + 1;
      const minLeft = Math.max(1, Math.ceil(uc.remain / 60000));
      openModal({
        title: '🏗️ ' + b.emoji + ' ' + b.name + ' · 建造中',
        body: '<div class="bx-desc">' + esc(b.desc) + '</div>' +
          '<div class="bx-cost">建造到 Lv.' + lvAfter + '</div>' +
          '<div class="bar bar-lg" style="margin:14px 0 8px"><i style="width:' + Math.round(uc.p * 100) +
          '%;background:linear-gradient(90deg,#8FD3A8,#4CA96B)"></i></div>' +
          '<div class="bx-cost">建造进度 ' + Math.round(uc.p * 100) + '%　·　约 ' + minLeft + ' 分钟后完工</div>',
        foot: '<button class="btn btn-ghost" data-act="m-close">关闭</button>',
        onMount: wireModal
      });
      return;
    }
    /* 第一次修：先把该说的话听完。
       v1.20 起这里不再"等级不够就拦下"——那样一旦剧情的条件判定有偏差，
       玩家会被卡在门口连面板都看不到。改成一律把面板打开，面板里显示差什么。 */
    if (!built && !forceBuild) {
      const ps = window.Game.pendingStory();
      if (ps === 'labor') { openStoryModal('labor'); return; }
      if (ps && ps === b.story) { openStoryModal(b.story); return; }
    }
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
      '<span>' + (s.minutes > 0 ? '⏱️ 限时 <b>' + s.minutes + '</b> 分钟' : '⏱️ <b>不限时</b>') + '</span>' +
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
    const prog = c.place ? Math.min(1, (Date.now() - c.hatchStart) / (c.hatchMinutes * 60000)) : 0;
    const canHatch = c.place && prog >= 1;
    const u = window.Game.usedSlots();
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
          h += '<div class="caps-quiz">🧠 破壳前先答 ' + gate.count + ' 道题：' +
            (gate.minutes > 0 ? '限时 ' + gate.minutes + ' 分钟，' : '不限时，') +
            '答对 ' + gate.passLine + ' 道才会出来</div>';
        } else {
          h += '<div class="caps-quiz muted">题库还没接入，先直接破壳（见本页底部「破壳题库」）</div>';
        }
      }
    } else {
      h += '<div class="caps-meta">出处：' + esc(sp.home || '云南') + ' ｜ 放进孵化仓就能开始孵化</div>';
    }
    h += '</div>';
    h += '<div class="caps-acts">';
    if (!c.place) {
      h += '<button class="btn btn-sm btn-primary" data-act="place" data-id="' + c.id + '"' +
        (full ? ' disabled title="托位已满"' : '') + '>放入孵化仓</button>';
    } else if (canHatch) {
      const needQuiz = gate.on && !gate.passed;
      h += '<button class="btn btn-sm btn-primary" data-act="hatch" data-id="' + c.id + '"' +
        (needQuiz ? ' title="先过破壳测验：' + gate.count + ' 题' +
          (gate.minutes > 0 ? ' / ' + gate.minutes + ' 分钟' : ' / 不限时') +
          ' / 答对 ' + gate.passLine + ' 题"' : '') +
        '>' + (needQuiz ? '🧠 答题破壳' : '破壳') + '</button>';
    } else {
      h += '<button class="btn btn-sm btn-ghost" data-act="speedup" data-id="' + c.id + '" title="消耗 1 个加速沙漏，推进 30 分钟">⏳ 加速</button>';
    }
    h += '</div></div>';
    return h;
  }

  /* =========================================================
   * v1.33 小生物日志：渲染（数据在 game.js 的 logPet / petLogOf）
   * 「今天 / 昨天 / 更早」分组 + 每条带属性前后值与增减量
   * ========================================================= */
  let petLogOpen = {};        /* 每只的展开状态，只在本机内存，不存盘 */
  function dKeyA(t) {
    const d = new Date(t);
    const z = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate());
  }
  function hhmmA(t) {
    const d = new Date(t);
    const z = function (n) { return (n < 10 ? '0' : '') + n; };
    return z(d.getHours()) + ':' + z(d.getMinutes());
  }
  function dayLabelOf(day, todayK, ydayK) {
    if (day === todayK) return '今天';
    if (day === ydayK) return '昨天';
    return day ? day.slice(5) : '';
  }
  /* 一条变化胶囊：属性 变化前→变化后 ▲+42 */
  function logDeltaChip(x) {
    const up = (x.d || 0) > 0;
    return '<span class="plog-d ' + (up ? 'up' : (x.d < 0 ? 'down' : 'flat')) + '">' +
      (x.icon || '') + esc(x.label || x.stat || '') + ' ' +
      '<i>' + x.before + '→' + x.after + '</i> ' +
      '<b>' + (up ? '▲+' : (x.d < 0 ? '▼' : '±')) + Math.abs(x.d || 0) + '</b></span>';
  }
  function petLogItemHtml(e) {
    let h = '<div class="plog-item k-' + esc(e.kind || 'care') + '">';
    h += '<span class="plog-ico">' + (e.icon || '📌') + '</span>';
    h += '<div class="plog-main">';
    h += '<div class="plog-text"><span class="plog-time">' + esc(e.at || '') + '</span>' +
      esc(e.text || '') + '</div>';
    const chips = [];
    (e.deltas || []).forEach(function (x) { chips.push(logDeltaChip(x)); });
    if (e.grow) {
      chips.push(logDeltaChip({ icon: '🌱', label: '成长', before: e.grow.before, after: e.grow.after, d: e.grow.d }));
    }
    if (e.exp) chips.push('<span class="plog-d flat">✳️ 经验 +' + e.exp + '</span>');
    if (e.trait) {
      chips.push('<span class="plog-d mark" title="性格印记：同类事件攒够 ' +
        (e.trait.gate || 8) + ' 分，它就会换个脾气">' +
        (e.trait.icon || '🎭') + esc(e.trait.name || '') + ' +' + e.trait.d +
        '<i>（' + e.trait.score + '/' + (e.trait.gate || 8) + '）</i></span>');
    }
    if (chips.length) h += '<div class="plog-chips">' + chips.join('') + '</div>';
    if (e.shift) {
      h += '<div class="plog-shift">🎭 它的性格从「' + esc(e.shift.from || '') +
        '」变成了「' + esc(e.shift.to || '') + '」</div>';
    }
    h += '</div></div>';
    return h;
  }
  function petLogHtml(p) {
    const list = (window.Game.petLogOf ? window.Game.petLogOf(p) : (p.log || []));
    const open = !!petLogOpen[p.id];
    const now = Date.now();
    const todayK = dKeyA(now), ydayK = dKeyA(now - 86400000);
    let h = '<div class="plog' + (open ? ' open' : '') + '">';
    h += '<button class="plog-head" id="cm-log-toggle">' +
      '<span class="plog-title">📓 它的日志</span>' +
      '<span class="plog-hint">' + (list.length ? '共 ' + list.length + ' 条 · 只记它自己的事' : '还没有记录') + '</span>' +
      '<span class="spacer"></span>' +
      '<span class="plog-caret">' + (open ? '▾' : '▸') + '</span></button>';
    if (open) {
      if (!list.length) {
        h += '<div class="empty">它的故事从今天开始：以后每次照顾、每趟出工、每次生病和长本事，都会记在这里。</div>';
      } else {
        let curDay = null;
        list.forEach(function (e) {
          if (e.day !== curDay) {
            curDay = e.day;
            h += '<div class="plog-day">' + dayLabelOf(e.day, todayK, ydayK) + '</div>';
          }
          h += petLogItemHtml(e);
        });
        if (p.logTrimmed) {
          h += '<div class="plog-note">（这台设备上只保留了最近的记录；换设备同步时只带最近几条。）</div>';
        }
      }
    }
    h += '</div>';
    return h;
  }

  /* 性格倾向：它正在变成什么脾气（事件给性格加分，攒够就换）。 */
  function traitTendencyHtml(p) {
    let tend = (window.Game.traitTendency ? window.Game.traitTendency(p) : []);
    /* 还没攒到任何印记时也把它的「现在的脾气」摆出来 —— 板块常驻，
       不然新玩家会以为这游戏没有性格系统（分从 0 开始，看得见才知道能攒）。 */
    if (!tend.length) {
      const cur = (typeof D.traitOf === 'function') ? D.traitOf(p) : null;
      if (!cur) return '';
      tend = [{ id: cur.id, name: cur.name, emoji: cur.emoji, color: cur.color, score: 0, current: true, gap: 0 }];
    }
    const gate = (D.TRAIT_SHIFT_GATE || 8);
    const top = tend.slice(0, 4);
    let h = '<div class="tend-card">' +
      '<div class="tend-head">🎭 性格倾向<span>它自己经历的事会慢慢改变它的脾气</span></div>';
    top.forEach(function (t) {
      const pct = Math.min(100, Math.round((t.score / (gate * 2)) * 100));
      h += '<div class="tend-row' + (t.current ? ' cur' : '') + '">' +
        '<span class="tend-name">' + t.emoji + ' ' + esc(t.name) + (t.current ? '（现在）' : '') + '</span>' +
        '<span class="tend-bar"><i style="width:' + pct + '%;background:' + t.color + '"></i></span>' +
        '<span class="tend-val">' + (t.current && !t.score ? '还没攒到印记'
          : t.score + (t.current ? '' : ' / 还差 ' + t.gap)) + '</span></div>';
    });
    h += '</div>';
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

    /* v1.28：干完活得歇一歇 —— 状态写在脸上，免得点了「出工」才发现派不出去。
       v1.34：休息改成按天刷新，这里原来写死的「孵化时间 × 3」早就过期了，改说人话。 */
    const restTxt = (typeof window.Game.restText === 'function') ? window.Game.restText(p) : '';
    if (restTxt) {
      const at = (typeof window.Game.workplaceOf === 'function') ? window.Game.workplaceOf(p.id) : null;
      body += '<div class="warnbox" style="margin-top:10px">' + esc(restTxt) +
        '：它今天已经出过一趟工了。<span class="fh-i">（每天一趟，第二天 0 点自动刷新' +
        (at ? '；' + esc(at.name) + ' 的岗位给它留着，明天照常上班' : '') + '）</span></div>';
    }
    const workMul = (typeof D.rarityWorkOf === 'function') ? D.rarityWorkOf(sp.rarity) : 1;
    if (workMul > 1 && !restTxt) {
      body += '<div class="okbox" style="margin-top:8px">💪 ' + rarityName(sp.rarity) +
        '体质：出工一趟的产出 <b>×' + workMul.toFixed(2) + '</b>，活儿也干得更快。</div>';
    }

    /* v1.25：住在池塘里的水栖生物不缺水，水位恒满（给个水色条 + 一句说明，
       免得玩家以为状态条坏了、一直想给它浇水） */
    const aqua = (typeof window.Game.isAqua === 'function') && window.Game.isAqua(p);
    body += '<div class="pet-stats" style="margin-top:12px">';
    ['water', 'nutri', 'clean', 'fun'].forEach(function (k) {
      const si = D.STAT_INFO[k];
      const v = Math.round(p.stats[k]);
      const free = (k === 'water' && aqua);
      const color = free ? '#5BB4D6' : (v < 20 ? '#D9534F' : (v < 45 ? '#E3A33C' : si.color));
      body += '<div class="srow"><span class="sname">' + si.emoji + ' ' + si.label + '</span>' +
        '<div class="bar bar-thin"><i style="width:' + v + '%;background:' + color + '"></i></div>' +
        '<span class="sval">' + v + '</span></div>';
    });
    body += '</div>';
    if (aqua) {
      body += '<div class="okbox" style="margin-top:8px">🌊 它住在池塘里，池水常满：<b>永远不会缺水</b>，也不会因为渴而生病。营养 / 清洁 / 娱乐照常照顾。</div>';
    }

    /* v1.33：一键照顾 —— 面板里最省事的那颗按钮。
       先把账算一遍（dry：只算不动），把"要花什么、还差什么"直接摊在按钮下面；
       道具凑不齐就**整颗按钮禁用**，绝不点了一半扣一半。 */
    const onePlan = (typeof window.Game.oneKeyCare === 'function') ? window.Game.oneKeyCare(p.id, { dry: true }) : null;
    if (onePlan) {
      const canOne = !!onePlan.ok;
      const needTxt = (onePlan.needs || []).map(function (n) { return n.emoji + n.name + '×' + n.count; }).join('　');
      const target = window.Game.ONKEY_TARGET || 75;
      let sub;
      if (canOne) {
        sub = '需要：' + needTxt + '　·　把四项状态一次抬到 ' + target + ' 以上';
      } else if (onePlan.why === 'lack') {
        sub = '道具不够：' + (onePlan.lack || []).map(function (x) {
          return x.emoji + x.label + '只有 ' + x.value + '（差 ' + x.short + '）';
        }).join('、') + '　·　补齐前一件都不会用掉';
      } else {
        sub = '状态都已经在 ' + target + ' 以上了，不用照顾';
      }
      body += '<button class="onekey' + (canOne ? '' : ' onekey-off') + '" id="cm-onekey"' +
        (canOne ? '' : ' disabled') + '>' +
        '<span class="onekey-main">✨ 一键照顾</span>' +
        '<span class="onekey-sub">' + esc(sub) + '</span></button>';
    }

    body += '<div class="grow-row"><span>成长</span>' +
      '<div class="bar bar-thin" style="flex:1"><i style="width:' + growPct + '%;background:linear-gradient(90deg,#9FDCAE,#4CA96B)"></i></div>' +
      '<span style="color:#8AA394">' + Math.round(p.growth) + (nextStage ? ' / ' + nextStage.min : '') + '</span></div>';

    /* v1.27 性格：一句话人设 + 它真实带来的三条影响（说人话，别只给个词） */
    const tr = (typeof D.traitOf === 'function') ? D.traitOf(p) : null;
    if (tr) {
      const dTxt = tr.decay < 0.85 ? '状态掉得慢，省心' : (tr.decay > 1.1 ? '状态掉得快，要多看看' : '状态掉得中不溜');
      const gTxt = (tr.grow >= 1.1 ? '成长快' : (tr.grow < 0.95 ? '成长慢一点' : '成长正常'));
      const mTxt = (tr.mischief >= 1.5 ? '爱闯祸' : (tr.mischief < 0.7 ? '几乎不惹事' : '偶尔闯点小祸'));
      const fav = Object.keys(tr.like || {}).sort(function (a, b) { return (tr.like[b] || 0) - (tr.like[a] || 0); })[0];
      const favName = fav ? ((D.BUILDINGS || []).filter(function (b) { return b.id === fav; })[0] || {}).name : '';
      body += '<div class="trait-card" style="margin-top:10px">' +
        '<span class="trait-chip" style="background:' + tr.color + '1A;border-color:' + tr.color + '55;color:#3E5A47">' +
          tr.emoji + ' ' + esc(tr.name) + '</span>' +
        '<span class="trait-one">' + esc(tr.one) + '</span>' +
        '<div class="trait-fx">' +
          '<span>' + dTxt + '</span><span>' + gTxt + '</span><span>' + mTxt + '</span>' +
          (favName ? '<span>最爱去：' + esc(favName) + '</span>' : '') +
        '</div></div>';
    }

    /* v1.33：性格倾向 —— 事件给性格加分，攒够就会真的换脾气（规则见 data.js） */
    body += traitTendencyHtml(p);

    /* v1.27：基础道具与高级道具分成两个按钮。
       以前两者混在一个数字里、由系统挑一件消耗，玩家买了高级货却看不出它到底用了没有——
       现在基础按钮用基础货，✨ 按钮明确用高级货，用完在提示里点名是哪一件。 */
    body += '<div class="pet-acts" style="margin-top:12px">';
    acts.forEach(function (a) {
      const act = D.CARE[a];
      const si = D.STAT_INFO[act.stat];
      const opt = (typeof window.Game.careOptionsFor === 'function')
        ? window.Game.careOptionsFor(p, a) : null;
      const base = opt ? opt.base : [];
      const adv = opt ? opt.adv : [];
      let baseOwn = 0; base.forEach(function (x) { baseOwn += x.own; });
      let advOwn = 0; adv.forEach(function (x) { advOwn += x.own; });
      const off = p.illness || p.stored;
      body += '<button class="act' + (baseOwn <= 0 ? ' act-out' : '') + '" data-care="' + a + '" data-prefer="base"' +
        (baseOwn <= 0 || off ? ' disabled' : '') +
        ' title="' + si.label + '：基础道具还剩 ' + baseOwn + ' 个">' +
        '<span class="act-badge' + (baseOwn <= 0 ? ' empty' : '') + '">' + baseOwn + '</span>' +
        act.emoji + ' ' + act.label + (baseOwn <= 0 ? '（缺货）' : '') + '</button>';
      if (adv.length) {
        const it = adv[0];
        body += '<button class="act act-adv' + (advOwn <= 0 ? ' act-out' : '') + '" data-care="' + a + '" data-prefer="adv"' +
          (advOwn <= 0 || off ? ' disabled' : '') +
          ' title="用「' + esc(it.name) + '」（高级道具）：' + si.label + ' +' + (it.boost ? it.boost.amount : 0) +
            '，还剩 ' + advOwn + ' 个">' +
          '<span class="act-badge adv-badge' + (advOwn <= 0 ? ' empty' : '') + '">' + advOwn + '</span>' +
          '✨ ' + it.emoji + esc(it.name) + (advOwn <= 0 ? '（缺货）' : '') + '</button>';
      }
    });
    body += '</div>';

    if (p.stored) {
      body += '<div class="warnbox" style="margin-top:10px">📦 在保管室中：状态静止，不衰减、不生病，护理已暂停。</div>' +
        '<div class="pet-acts" style="margin-top:10px"><button class="btn btn-primary" id="cm-unstore">📭 取出（放回场地）</button></div>';
    } else if (window.Game.canStore(p)) {
      body += '<div class="pet-acts" style="margin-top:10px"><button class="btn btn-ghost" id="cm-store">📦 放进保管室（幼体也能存）</button></div>';
    }

    /* v1.33：它自己的日志（默认折叠。展开后有今天/昨天/更早的分组） */
    body += petLogHtml(p);

    /* 送养（v1.23）：不要的小生物托付给别的乐园，换回可可豆。
       写在最下面、样式最轻，不跟照顾按钮抢视线——它是个出口，不是主要玩法。 */
    body += '<div class="pet-acts pet-acts-sub" style="margin-top:10px">' +
      '<button class="btn btn-ghost" id="cm-adopt">🤝 送养（回赠 🌰 ' + window.Game.adoptValue(p) + '）</button></div>';
    body += '<div class="hint" style="margin-top:8px">送养＝把它交给别的乐园照顾，人家回赠你一袋可可豆。' +
      '送走就回不来了，所以点之前会让你再确认一次。</div>';

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
          closeModal(); render(); toast('📦 ' + esc(p.name) + ' 已放进保管室。', 'ok');
        };
        const unstoreBtn = $('#cm-unstore', m);
        if (unstoreBtn) unstoreBtn.onclick = function () {
          const r = window.Game.unstorePet(p.id);
          if (!r.ok) { toast('❌ ' + r.msg, 'err'); return; }
          closeModal(); render(); toast('📭 ' + esc(p.name) + ' 回到了场地。', 'ok');
        };
        const adoptBtn = $('#cm-adopt', m);
        if (adoptBtn) adoptBtn.onclick = function () { openAdoptModal(p.id); };
        /* v1.33：一键照顾 —— 一次扣齐、一次提升，然后就是同款"演完动画原位刷新" */
        const okBtn = $('#cm-onekey', m);
        if (okBtn) okBtn.onclick = function () {
          const r = window.Game.oneKeyCare(p.id);
          if (!r.ok) { toast('❌ ' + r.msg, 'err', 5200); return; }
          $$('#cm-onekey, .act[data-care]', m).forEach(function (b) { b.disabled = true; });
          okBtn.classList.add('onekey-done');
          playSfx('music');
          careFx('fert', $('#cm-face', m));
          toast(r.msg + (r.traitShift ? '　🎭 它的性格变成「' + r.traitShift.toName + '」了！' : ''), 'ok', 6500);
          render();
          setTimeout(function () {
            if (!document.documentElement.contains(m) || m !== activeMask()) return;
            closeModal();
            openCreatureModal(p.id);
          }, 900);
        };
        /* 日志折叠/展开：只换这一块，不整窗重开（重开会丢滚动位置，看着像闪一下） */
        function bindLogToggle() {
          const lt = $('#cm-log-toggle', m);
          if (!lt) return;
          lt.onclick = function () {
            petLogOpen[p.id] = !petLogOpen[p.id];
            const box = $('.plog', m);
            if (box) box.outerHTML = petLogHtml(p);
            bindLogToggle();
          };
        }
        bindLogToggle();
        $$('.act[data-care]', m).forEach(function (el) {
          el.onclick = function () {
            const act = el.dataset.care;
            const prefer = el.dataset.prefer || 'base';
            const r = window.Game.care(p.id, act, { prefer: prefer });
            if (!r.ok) { toast('❌ ' + r.msg, 'err'); return; }
            /* 先把动作演完：音效 + 头像上的小动画；这时状态其实已经结算好了 */
            $$('.act[data-care]', m).forEach(function (b) { b.disabled = true; });
            playSfx(act);
            careFx(act, $('#cm-face', m));
            /* 明确反馈：点名用了哪一件道具（高级道具尤其要说清楚，不然像没生效）。
               v1.33：攒够性格印记、当场换了脾气的话，也要在这句话里说出来。 */
            toast(r.msg + (r.traitLine ? '　' + r.traitLine : '') +
              (r.traitShift ? '　🎭 它的性格变成「' + r.traitShift.toName + '」了！' : ''), 'ok');
            if (r.isAdv) {
              window.Store.pushLog('✨ 用掉了高级道具「' + r.itemName + '」照顾 ' + p.name + '。');
            }
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

  /* ---------------- 送养（v1.23） ----------------
     为什么不叫「卖掉」：这些小家伙是玩家一口一口喂大的，明码标价地卖会让人不舒服。
     送养是同一件事，但听起来像「给它找了个新家」，而不是「把它处理掉」。
     代价不藏：按钮上就写着送走回不来，点之前还要再确认一次。 */
  function openAdoptModal(petId) {
    const p = S.pets.filter(function (x) { return x.id === petId; })[0];
    if (!p) { toast('❌ 找不到这只小生物', 'err'); return; }
    if (p.illness) { toast('❌ ' + p.name + ' 还在生病，先治好它再送养吧。', 'err'); return; }
    const sp = window.Game.speciesById(p.speciesId);
    const st = window.Game.stageOf(p);
    const beans = window.Game.adoptValue(p);
    const mins = Math.round((Date.now() - p.bornAt) / 60000);
    /* 在建筑里上班的，得先说清楚：送走它，那个岗位会空出来 */
    const jobs = [];
    Object.keys((S.build && S.build.staff) || {}).forEach(function (k) {
      if ((S.build.staff[k] || []).indexOf(p.id) >= 0) {
        const b = (D.BUILDINGS || []).filter(function (x) { return x.id === k; })[0];
        jobs.push(b ? b.name : k);
      }
    });

    const body =
      '<div class="adopt-card">' +
        '<span class="adopt-face">' + spArt(sp, 'adopt-img') + '</span>' +
        '<div style="min-width:0"><div class="adopt-name">' + esc(p.name) + '</div>' +
        '<div class="adopt-sub">' + esc(sp.name) + ' · ' + st.emoji + ' ' + st.name +
        ' · 陪伴你 ' + fmtHM(mins) + '</div></div>' +
      '</div>' +
      '<div class="okbox" style="margin-top:10px">🤝 远处有个乐园正缺一只' + esc(sp.name) +
      '。把它送过去，那边会回赠你一袋可可豆 <b>🌰 ' + beans + '</b>。</div>' +
      (jobs.length ? '<div class="warnbox" style="margin-top:8px">👜 它现在在' + esc(jobs.join('、')) +
        '上班，送养之后那个岗位会空出来，记得再安排一只。</div>' : '') +
      '<div class="warnbox" style="margin-top:8px">⚠️ 送养之后就找不回来了——它的名字、成长、' +
      '你照顾它的那些记录都跟着它一起走。想留着就点「再想想」。</div>';

    openModal({
      title: '🤝 送养 ' + esc(p.name),
      body: body,
      foot: '<button class="btn btn-ghost" id="ad-no">再想想</button>' +
        '<button class="btn btn-primary" id="ad-yes">送它去新家（🌰 +' + beans + '）</button>',
      onMount: function (m) {
        $('#ad-no', m).onclick = function () { openCreatureModal(p.id); };
        $('#ad-yes', m).onclick = function () {
          const r = window.Game.adoptPet(p.id);
          if (!r.ok) { toast('❌ ' + r.msg, 'err'); return; }
          closeModal();
          render();
          toast(r.msg, 'ok', 6000);
        };
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
      '<div style="font-size:12.5px;color:#8AA394;margin-top:2px">住在' + window.Game.zoneNameFor(sp) + ' · 出身 ' + esc(sp.home) + '</div></div>';
    body += '<div class="okbox" style="text-align:left">' + esc(sp.tip) + '</div>';

    if (ready) {
      body += '<div class="okbox" style="margin-top:10px;text-align:left">✨ 壳已经顶得咔咔响了！</div>';
      if (gate.on && gate.passed) {
        body += '<div class="hint" style="margin-top:8px">✅ 破壳测验已通过（' + c.quizResult.correct + '/' + c.quizResult.total + '），随时可以破壳。</div>';
      } else if (gate.on) {
        body += '<div class="warnbox" style="margin-top:10px;text-align:left">🧠 破壳前先答 ' + gate.count + ' 道题：' +
          (gate.minutes > 0 ? '限时 ' + gate.minutes + ' 分钟，' : '不限时，') +
          '答对 ' + gate.passLine + ' 道才放行。</div>';
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
        '<span class="tag">' + window.Game.zoneNameFor(sp) + '</span>' +
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
        '<div style="font-size:11px;color:#8AA394;margin-top:4px">' + window.Game.zoneNameFor(sp) + '</div>' +
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
      '<div style="font-size:12.5px;color:#5B7263">照顾小生物改得经验、升级解锁更高级道具。可可豆的来路有六条：<b>投喂单</b>（做完 8 件 + 全清加成）、<b>库伯四象限</b>集齐、<b>照顾等级</b>里程碑、<b>挑战赛</b>通关、<b>食堂开饭 / 旅行社出团</b>（建筑等级越高产得越多）、<b>送养</b>用不上的小生物。护理会消耗道具，所以记得每天把任务做完。</div></div>';

    groups.forEach(function (g) {
      h += '<div class="panel shop-group"><h3>' + g.name + '<span class="hint" style="font-weight:400;color:#8AA394;font-size:12px">' + g.sub + '</span></h3>';
      h += '<div class="shop-grid">';
      D.ITEMS.filter(function (i) { return i.kind === g.k; }).forEach(function (it) {
        const locked = it.reqLevel && S.cur.level < it.reqLevel;
        /* v1.27：光写「🔒 Lv.3」太干了——顺手告诉你还差多少经验，别让人以为永远买不到 */
        const gap = locked && D.itemUnlockGap ? D.itemUnlockGap(it.id, S.cur.exp, S.cur.level) : 0;
        const q = shopQty[it.id] || 1;
        const own = (it.kind === 'facility')
          ? (it.id === 'hourglass' ? (S.bag.hourglass || 0) : window.Game.podCap())
          : (S.bag[it.id] || 0);
        const ownLabel = it.kind === 'facility'
          ? (it.id === 'hourglass' ? '持有 ' + own + ' 个' : '当前 ' + own + ' 个托位')
          : '持有 ' + own + ' 个';
        const ownShow = locked ? ('🔒 Lv.' + it.reqLevel + ' 解锁' + (gap > 0 ? '（还差 ' + gap + ' 经验）' : '')) : ownLabel;
        h += '<div class="shop-item' + (locked ? ' locked' : '') + '">' +
          '<div class="si-top"><span class="si-ico">' + it.emoji + '</span>' +
            '<div><div class="si-name">' + it.name + (locked ? ' <span class="lock-mini">🔒</span>' : '') + '</div><div class="si-own">' + ownShow + '</div></div></div>' +
          '<div class="si-desc">' + esc(it.desc) + '</div>' +
          '<div class="si-bottom">' +
            '<span class="price">' + it.price + '</span>' +
            (locked
              ? '<span class="lock-tag">🔒 Lv.' + it.reqLevel + (gap > 0 ? ' · 还差 ' + gap + ' 经验' : '') + '</span>'
              : '<button class="qty-btn" data-act="qty" data-id="' + it.id + '" data-d="-1">−</button>' +
                '<span class="qty-val" id="qty-' + it.id + '">' + q + '</span>' +
                '<button class="qty-btn" data-act="qty" data-id="' + it.id + '" data-d="1">＋</button>' +
                '<button class="btn btn-sm btn-primary" style="margin-left:auto" data-act="buy" data-id="' + it.id + '" data-qty="' + q + '">购买</button>') +
          '</div></div>';
      });
      h += '</div></div>';
    });

    /* 挑战赛（v1.23）：全游戏唯一一个「主动给自己找题做」的入口。
       放商店页最下面，因为它是挣钱的那个，不是花钱的那个。 */
    const cs = window.Game.chalStatus();
    const chalLeft = cs.left;
    const chalGo = chalLeft > 0 && cs.bank > 0;
    h += '<div class="panel chal-panel">' +
      '<div class="panel-head"><h2>🏆 挑战赛</h2>' +
      '<span class="hint">今日剩余 ' + (chalLeft > 90 ? '不限' : chalLeft + ' / ' + cs.limit + ' 局') + '</span></div>' +
      '<div class="chal-rules">' +
        '<span class="chal-chip">📕 待消错题 ' + cs.unresolved + ' / ' + cs.bank + ' 道</span>' +
        '<span class="chal-chip">⏱️ 限时 ' + cs.minutes + ' 分钟</span>' +
        '<span class="chal-chip">🎯 正确率 ' + Math.round(cs.passRate * 100) + '% 达标</span>' +
        '<span class="chal-chip chal-win">🌰 赢 ' + cs.beansPass + ' 可可豆' +
          (cs.beansPerfect ? '（满分再 +' + cs.beansPerfect + '）' : '') + '</span>' +
      '</div>' +
      '<div class="chal-note">从错题库里随机抽 ' + cs.count + ' 道（优先出你还没答对的），答对 ' +
        Math.ceil(cs.count * cs.passRate) + ' 道就结算可可豆。答错不扣东西，错题当场给解析——' +
        '<b>答对的题会当场移出错题列表，以后不再出现</b>；答错了它才会回来。' +
        '冲豆是借口，多练一遍才是真的。</div>' +
      '<div class="chal-foot">' +
        '<span class="chal-meta">打过 ' + cs.plays + ' 局 · 赢 ' + cs.wins + ' 局 · 最好 ' + cs.best +
          '% · 累计 🌰 ' + cs.beans +
          (cs.bank < cs.count && cs.bank > 0 ? '　·　题库只有 ' + cs.bank + ' 题，按实际题数出卷' : '') + '</span>' +
        '<button class="btn btn-primary" data-act="chal-start"' + (chalGo ? '' : ' disabled') + '>' +
          (cs.bank <= 0 ? '题库还是空的' : (chalLeft > 0 ? '🏆 开始挑战（' + cs.count + ' 题）' : '今天的额度用完了，明天再来')) +
        '</button>' +
      '</div></div>';
    return h;
  }

  /* ---------------- 成就页 ---------------- */
  /* v1.37：成就页按 4 条线分组显示。
     以前 100 多条摊在一个大格子里，一眼看过去全是锁，看不出"我该往哪儿使劲"；
     分组之后每块都能单独看进度，也能立刻看出哪条线快拿到下一个了。 */
  const ACH_CATS = [
    { id: 'study', icon: '📚', name: '学习', note: '投喂单、打卡、错题、挑战赛' },
    { id: 'pet',   icon: '🐾', name: '乐园', note: '扭蛋孵化、照顾、养大' },
    { id: 'build', icon: '🏛️', name: '建筑', note: '出工、出团、收藏品' },
    { id: 'time',  icon: '🌅', name: '作息', note: '早鸟、连续天数' }
  ];
  function viewAch() {
    const won = function (a) { return !!S.achievements[a.id]; };
    const got = D.ACHIEVEMENTS.filter(won).length;
    const total = D.ACHIEVEMENTS.length || 1;
    let h = '<div class="panel"><div class="panel-head"><h2>🏆 成就</h2>' +
      '<span class="hint">已达成 ' + got + ' / ' + D.ACHIEVEMENTS.length + '</span></div>' +
      '<div class="bar bar-lg"><i style="width:' + Math.round(got / total * 100) + '%;background:linear-gradient(90deg,#F0C069,#E3A33C)"></i></div>' +
      '<div class="fh" style="margin-top:8px">成就做成了「前密后疏」的阶梯：刚开始几乎每天都能拿到一个，' +
      '越往后越需要积累。每一类下面都能看到自己离下一个还差多少。</div></div>';
    ACH_CATS.forEach(function (c) {
      const list = D.ACHIEVEMENTS.filter(function (a) { return (a.cat || 'pet') === c.id; });
      if (!list.length) return;
      const cg = list.filter(won).length;
      /* 已达成：全部展开；没达成：只露出**前 3 个还没拿到的**，别一次糊一屏锁 */
      const locked = list.filter(function (a) { return !won(a); });
      const shown = list.filter(won).concat(locked.slice(0, 3));
      h += '<div class="panel"><div class="panel-head"><h2>' + c.icon + ' ' + c.name + '</h2>' +
        '<span class="hint">' + cg + ' / ' + list.length + ' · ' + c.note + '</span></div>' +
        '<div class="bar"><i style="width:' + Math.round(cg / (list.length || 1) * 100) + '%"></i></div>';
      h += '<div class="ach-grid">';
      shown.forEach(function (a) {
        const on = won(a);
        h += '<div class="ach' + (on ? ' got' : '') + '">' +
          '<div class="ach-ico">' + (on ? '🏅' : '🔒') + '</div>' +
          '<div><div class="ach-name">' + esc(a.name) + '</div>' +
          '<div class="ach-desc">' + esc(a.desc) + '</div>' +
          '<div class="ach-rw">🎟️ +' + a.reward.tickets + '　🌰 +' + a.reward.beans + (on ? '　' + fmtWhen(S.achievements[a.id]) : '') + '</div>' +
          '</div></div>';
      });
      h += '</div>';
      if (locked.length > 3) {
        h += '<div class="fh" style="margin-top:8px">这一类后面还有 ' + (locked.length - 3) +
          ' 个更远的成就，拿到了就会出现在这里。</div>';
      } else if (!locked.length) {
        h += '<div class="fh" style="margin-top:8px">🎉 这一类全部达成了。</div>';
      }
      h += '</div>';
    });
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
    const bOverview = D.booksOverview();

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
    /* v1.28：读书那格按「读到第几页 / 共几页」说（没有页数就退到章数、再退到天数）。
       下面还有一颗「📐 补全书本信息」的按钮，点开能填每本的总页数 / 章数。 */
    const bHasPage = bOverview.pagesTotal > 0;
    const bHasCh = !bHasPage && bOverview.chapterTotal > 0;
    h += meStat('📚',
      bHasPage ? (bOverview.pages + ' / ' + bOverview.pagesTotal)
        : (bHasCh ? (bOverview.chapters + ' / ' + bOverview.chapterTotal) : (bOverview.days + ' 天')),
      '读到的' + (bHasPage ? '页数' : (bHasCh ? '章数' : '天数')) + '（读完了 ' + bOverview.done + ' / ' + bOverview.total + ' 本）');
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

    /* v1.28：做题时标的「有问题的题」，都在这里汇总 */
    h += meReportsPanel();

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
        '</b> 题的小卷：' + (qs.bank.minutes > 0 ? '限时 ' + qs.bank.minutes + ' 分钟，' : '不限时，') +
        '答对 ' + Math.round(qs.bank.passRate * 100) + '% 才放行。</div>';
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
    /* v1.36：还剩几道没消掉 —— 答对一次就移出，所以这个数会自己变小 */
    const leftN = (window.QBank.unresolved ? window.QBank.unresolved().length : wrongN);
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
      '<div class="hub-desc">共 ' + wrongN + ' 道，还剩 <b>' + leftN + '</b> 道没消掉。答对一次就自动移出去、以后不再出现——挑战赛和破壳测验都算。点开就做，不强制逐题。</div></div>' +
      '<div class="hub-go">›</div></div>';

    h += '<div class="hub-card" data-act="zh-open">' +
      '<div class="hub-ico">💬</div>' +
      '<div class="hub-body"><div class="hub-title">综合问答</div>' +
      '<div class="hub-desc">导游综合知识问答（其11 已录入 ' + zhN + ' 题；11-21 共 11 题是图片扫描件，发我文字版立刻补）。照答案练，每天交一个凭证即算练过。</div></div>' +
      '<div class="hub-go">›</div></div>';

    h += '<div class="hub-card" data-act="sp-open-hub">' +
      '<div class="hub-ico">📜</div>' +
      '<div class="hub-body"><div class="hub-title">导游词</div>' +
      '<div class="hub-desc">' + spN + ' 篇范文照着读 / 背，可录音留痕；也能自己动笔写导游词，存在「我的导游词」里反复改。</div></div>' +
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
    /* v1.37：现实时钟 + 早鸟 */
    h += '<div class="hintbox">🌅 <b>顶栏那个一直在走的时间是真的。</b>你的任务如果在 <b>12:00 之前</b>交，可可豆 <b>×1.5</b>（券不变）——' +
      '早上那一段是你一天里最不容易被打断的时间，值得多给一点。过了 12 点照样能交、照样发奖，只是没有这份加成。' +
      '顶栏时钟在早鸟时段是暖金色的，一眼就能看出"现在交划不划算"。</div>';

    h += '<h3>三、养一只小生物的全流程</h3>';
    h += '<div class="step"><b>1</b><div>扭蛋拿到<b>胶囊</b>。胶囊里是植物 / 真菌 / 藻类，就去<b>温室</b>；是动物，就去<b>孵化仓</b>。放错地方不孵化。</div></div>';
    h += '<div class="step"><b>2</b><div>等孵化进度走完（普通 15 分钟 / 稀有 40 分钟 / 传说 80 分钟），点<b>破壳</b>。离线也会继续孵化。<br><span style="color:#B8791C">⚠️ 破壳前要先过「破壳测验」：<b>答对 1 道题</b>就能出生（答错可再答一次，并看解析）——见第七节。</span></div></div>';
    h += '<div class="step"><b>3</b><div>破壳后开始照顾：<b>水分、营养、清洁</b>三条状态会随时间下滑。植物用浇水/施肥/除虫，动物用喂水/喂食/洗澡。<br><span style="color:#2E7D9A">🌊 例外：住在<b>池塘</b>里的水栖生物（海菜花 / 红瘰疣螈 / 云南闭壳龟 / 藻类）<b>永远不会缺水</b>——水位常满，也绝不会渴到生病，你只需照顾它的营养、清洁、娱乐。</span></div></div>';
    h += '<div class="step"><b>4</b><div>某项状态归零超过 2 小时，它就可能<b>生病</b>。要买对症的药水（买错了不生效），病超过 24 小时会进入休眠。</div></div>';
    h += '<div class="step"><b>5</b><div>成长值到 100 / 300 / 700 会进阶：幼体 → 成长 → 成熟 → 圆满，每次进阶都有额外可可豆。</div></div>';
    h += '<div class="step"><b>6</b><div>成年之后能<b>干活</b>（修建/扩建建筑、在运营建筑上班、出团）。<b>一只小生物每天只能出一趟工</b>——修建、打工、出团共用这一趟，干完身上就写着「💤 今天已出工」，<b>第二天 0 点自动回来</b>，<b>岗位给它留着，不用每天重新排班</b>。想主动清空岗位，在建筑面板点「让全部下班」。<br><span style="color:#B8791C">💪 越稀有越能干：普通 ×1.00 / 稀有 ×1.30 / 传说 ×1.70，同一趟活产出更多、干得也更快。</span></div></div>';
    h += '<div class="step"><b>7</b><div>场地有<b>安置限额</b>（苗圃 12 / 温室 12 / 池塘 6，草地敞开不限）。住满之后新破壳的会自动送进<b>保管室</b>，不用你手动挪位置——想让它上场，从保管室「取出」再腾个位子就行。</div></div>';

    h += '<h3>四、每天喂哪 8 样：投喂单 + 加餐</h3>';
    h += '<p>学习页最上面是<b>「今日投喂单」</b>——每天固定 8 样，进度条只数这 8 件：</p>';
    h += '<table class="mini"><tr><th>#</th><th>喂什么</th><th>怎么算喂到</th></tr>' +
      '<tr><td>1</td><td>📖 读书</td><td>精读任务登记一次（哪一本你定，计划 8 天一本）</td></tr>' +
      '<tr><td>2–5</td><td>✍️ 四科刷题</td><td>法规 / 业务 / 全导 / 地导，每科 30 道，各算一笔</td></tr>' +
      '<tr><td>6</td><td>🎤 导游词</td><td>在「练习台」里任选一篇：前 12 天通读，第 13 天起默讲</td></tr>' +
      '<tr><td>7</td><td>🗣️ 综合问答</td><td>在「练习台」里看参考答案，练够 10 道问答题</td></tr>' +
      '<tr><td>8</td><td>📕 错题整理</td><td>把今天的错题理一遍，<b>传一份笔记</b>（手写拍照 / 文档都行）——录音不算</td></tr>' +
      '</table>';
    h += '<p>8 件全喂满，当天额外 <b>+2 券 / +' + feedBonus() + ' 豆</b>，连着喂满 7 天和 30 天还有成就。</p>';
    h += '<p>刷题不封顶：每科<b>每日 30 道</b>算达标，达标之后<b>每多刷 10 道再多给 6 豆</b>（单科单日封顶 90 豆）——状态好就多刷点，状态差刷够 30 道也不算欠账。</p>';
    h += '<p>8 件之外是<b>「加餐」</b>：课后练习、章节框架图、合书自测、昨日回照、费曼工作坊、合稿默讲……这些<b>做不做都行</b>，不计入 8 件，少做一件也不会让你"今天没做完"。有精力就加一口，没精力就明天再说。</p>';

    h += '<h3>五、课本精读：登记式，三步走完</h3>';
    h += '<p>精读是一张登记表——<b>能填出这两栏，就说明你今天真的翻过书</b>：</p>';
    h += '<div class="step"><b>1</b><div><b>选了哪一本</b>（必答）。四选一，顺序完全由你定，不想先读法规就先读别的。</div></div>';
    h += '<div class="step"><b>2</b><div><b>今天读到哪</b>（必答）。填「第几章 / 第几节 / 第几页」，能填几栏填几栏——填页码最准。</div></div>';
    h += '<div class="step"><b>3</b><div><b>笔记 / 感想</b>（选填）。愿意写就写两句，也可以拍一张手写笔记的照片。空着照样结算。</div></div>';
    h += '<p>登记的内容会连同时间戳存进<b>证据库</b>，日后能回头看"这本书我是哪天读到哪儿的"。</p>';
    h += '<p><b>进度怎么算：读到第几页 / 全书共几页。</b>每本课本「共几章、共几节、共多少页」由你填一次（精读窗里点「📐 书本信息」），填完存进存档、当场重算，不用改代码：</p>';
    h += '<table class="mini"><tr><th>你登记到</th><th>进度显示</th><th>意思</th></tr>' +
      '<tr><td>第 3 章 · 第 120 页</td><td>第 120 / 320 页 · 38%</td><td>按页码连续推进，读多少涨多少</td></tr>' +
      '<tr><td>第 9 章 · 第 320 页</td><td><b>✅ 读完</b> · 100%</td><td>读到最后一页就算读完，不用凑天数</td></tr>' +
      '<tr><td>还没填总页数</td><td>第 3 / 9 章</td><td>退回按章算；连章数都没有就退回按天数</td></tr>' +
      '</table>';
    h += '<div class="hintbox">🍬 读得快是好事，不是欠账。四本各按自己的节奏走，「我的」页那格「读到的页数」把四本加起来看总盘子。</div>';

    h += '<h3>六、学习验证链路：做了就是做了</h3>';
    h += '<p>这里<b>没有任何倒计时</b>，也不攒什么碎片——<b>做了就是做了，没做就是没做</b>：做完当场登记，奖励足额马上发，今天的格子立刻亮一个。</p>';
    h += '<table class="mini"><tr><th>关卡</th><th>它怎么防止你糊弄</th></tr>' +
      '<tr><td>① 精读登记</td><td>「选哪本 + 读了什么」两栏必答，内容进证据库。这一栏逼你把"读过"变成一句能说出来的话。</td></tr>' +
      '<tr><td>② 文字记录</td><td>回照、网课、框架图这类任务，交的时候要写一段<b>自己的话</b>（有最低字数），写完当场结算存档。写作这一动作就完成了一次「复述」。</td></tr>' +
      '<tr><td>③ 凭证上传</td><td>刷题、网课、模考任务要传一张<b>准题库的完成页/成绩页截图</b>；导游词任务改成<b>截图 + 看法</b>：在另一个 App 练完截一张图带过来，再写/录一句「看法」（看法可录一段音代替打字）。</td></tr>' +
      '<tr><td>④ 输出与成像</td><td>深挖、框架图、法规速记都要写<b>费曼卡</b>或拍框架图（粘贴会被记录）；反思象限用「昨日回照」两句话逼你说出"还是模糊的那一点"。</td></tr></table>';
    h += '<div class="warnbox">⚠️ 坦白说：如果你铁了心要作弊，总能找到办法（比如随便传张旧截图）。但这个链路的目标是<b>让作弊比学习更麻烦</b>，同时又不至于让"今天只学了 15 分钟"变成一件有负担的事。真正能约束你的只有一个东西：11 月 21 日那天考场上只有你一个人。</div>';
    h += '<div class="hintbox" style="margin-top:10px">📌 关于错题：<b>这里不用你抄题。</b>错题本来就躺在「资料库 → 错题复习」里（题库就是你导进来的那些），<b>答对一次它自己就移出去</b>，以后不再出现——挑战赛和破壳测验都算。投喂单里那条「📕 错题整理」要的只是一份笔记：今天哪些是真没记住、哪些是看错题、哪些是没读完题干，理完拍张照或存成文档传上来就行。<b>整理的是「为什么错」，不是把题抄一遍。</b></div>';
    h += '<div class="hintbox" style="margin-top:10px">⚑ <b>题目有问题就当场标一下</b>：做题时题干下面有一行「⚑ 这道题有问题？」，点开选个原因（内容不完整 / 答案不对 / 选项重复……）就存下了，不打断做题。所有标记汇总在「我的 → ⚑ 题目举报」，改完题可以一键清空，也可以「复制全部举报」拿出去对照着改。</div>';

    h += '<h3>七、破壳测验（小生物出生前的关卡）</h3>';
    h += '<p>小生物要从温室 / 孵化仓出来的那一刻，先过「破壳测验」：<b>每次 1 道题</b>，<b>答对就破壳</b>。答错了不破壳，可以再答一题；第二次还错，会给你看这道题的解析，看完同样能破壳（无限次数、不扣任何东西）。这样既挡住乱点破壳，又不让人卡住。</p>';
    h += '<p><b>不限时。</b>整张卷子只有 1 道题，用不上倒计时 —— 而倒计时对 ADHD 来说是压力源不是动力。慢慢想，想不出来就看解析（看完照样破壳）。游戏里<b>没有任何倒计时</b>，学习任务那边也一样。</p>';
    h += '<table class="mini"><tr><th>它在做什么</th><th>怎么做的</th></tr>' +
      '<tr><td>抽题</td><td>四科轮流取，一张卷子尽量四科都沾到；每次都是<b>新抽</b>的。</td></tr>' +
      '<tr><td>防背答案</td><td>每道题的<b>选项顺序都会重新打乱</b>，记住"答案是 B"没用。</td></tr>' +
      '<tr><td>交卷</td><td>随时交卷，<b>没有时间压力</b>；没答的算错。</td></tr>' +
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
    h += '<p>阶段一每天固定的 8 件是：精读 1 次 + 四科各 30 道 + 导游词 1 篇 + 综合问答 10 道 + 错题整理 1 次。导游词不指定具体篇目，你在「练习台」里任选一篇：前 12 天通读，第 13 天起默讲。阶段二、三同样保持这 8 件主线，只是导游词的要求随天数自动切换。</p>';
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
    h += '<div class="step"><b>1</b><div>打开「今日投喂」，最上面就是投喂单的 8 个格子——今天喂了几样，一眼看得见。下面「加餐」区是额外的，不用管它。</div></div>';
    h += '<div class="step"><b>2</b><div>精读点「📖 去精读」：选一本、填今天读到哪儿，交了就完事。笔记想写两句就写，不想写就空着。</div></div>';
    h += '<div class="step"><b>3</b><div>点「📝 去记录 / ✍️ 去登记」：写一段今日收获、登记题量，或者传截图。做完当场结算——做了就是做了，奖励马上发。</div></div>';
    h += '<div class="step"><b>4</b><div>导游词点「📸 去凭证」：在另一个 App 里通读/背诵，截一张图带过来，再写/录一句「看法」。结算后拿券和豆。</div></div>';
    h += '<div class="step"><b>5</b><div>8 件全喂满会额外给 +2 券 / +' + feedBonus() + ' 豆。用挣来的资源去扭蛋、养小生物——它们会催你明天再来。</div></div>';
    h += '<div class="step"><b>6</b><div>孵化好了先别急着点破壳——会弹 <b>1 道题</b>的破壳测验（答错可再答一次、看解析）。答对了它才出来。</div></div>';

    /* v1.37：乐园侧的三件事 —— 建筑倒计时 / 小生物的性格与名字 / 成就阶梯 */
    h += '<h3>十二、乐园：建筑的在干活、名字在脚下、性格靠它自己长</h3>';
    h += '<p><b>建筑在不在干活，名牌上写着。</b>已经建成的建筑，名牌下面有一行小字：<b>「⏳ 营业中 · 还剩 N 分」</b>（旅行社是「🧭 出团中 · 还剩 N 分」）。' +
      '金色的就是在干活，灰白的「⏳ 待开工」就是闲着。建造中的工地也会一直显示「还差百分之几、约几分钟」。</p>';
    h += '<table class="mini"><tr><th>建筑</th><th>一轮/一趟</th><th>你得到什么</th></tr>' +
      '<tr><td>🍲 食堂</td><td>30 分钟</td><td>饭钱收入：按光顾人数给可可豆</td></tr>' +
      '<tr><td>🛁 澡堂</td><td>25 分钟</td><td>营养液（烧热水要清水，比别的多花一点）</td></tr>' +
      '<tr><td>📚 图书馆</td><td>40 分钟</td><td>借阅收入（可可豆）+ 一点成长值</td></tr>' +
      '<tr><td>🏛️ 博物馆</td><td>45 分钟</td><td>门票收入（可可豆）+ 一点成长值</td></tr>' +
      '<tr><td>🧭 旅行社</td><td><b>2 小时</b></td><td>可可豆 + 土特产 + 收藏品（第 1 只当导游，带同伴走）</td></tr></table>';
    h += '<div class="hintbox">⏳ 旅行社不再是"点一下立刻回来"了 —— 它现在是一次真的行程：出发 → 挂着倒计时 → 到点回来结算。' +
      '出发时就把体力扣掉，所以中途关页面不会白赚一趟；<b>离线回来也会自动结算</b>，醒来东西就在那儿。</div>';
    h += '<p><b>每只小生物的名字挂在它脚底下。</b>地图上不用再认脸了；如果它还兼着班，金色小牌会跟在名字下面，' +
      '写着在哪栋建筑上班。</p>';
    h += '<div class="warnbox">🎭 <b>性格是怎么变的：它自己经历的事说了算，不是你照顾它。</b>在食堂帮过厨的会变得嘴馋，在图书馆当值的会变得好奇，' +
      '在澡堂当班的会变得慵懒，在博物馆看展的会变得好奇，带团出游回来会变得活泼；生病、被冷落、在保管室待久了也会留下痕迹。' +
      '每次出门回来还有小概率撞上一件小事（追一阵风、捡到半块饼、泡到水凉了……），这些也原样记进<b>它自己的日志</b>。' +
      '攒够分它就会真的换脾气 —— 性格会实打实改变它的状态衰减、成长、惹祸概率和爱去哪。</div>';
    h += '<p><b>怎么回看一只小生物的日子</b>：点地图上的它 → 「📓 它的日志」。里面按「今天 / 昨天 / 更早」分组，' +
      '每条都写着当天发生了什么、状态从多少变成多少、性格往哪偏了一点。</p>';
    h += '<p><b>成就做成了"前密后疏"的阶梯。</b>几乎每天或隔天就能拿到一个（投喂单 1 / 2 / 3 / 5 / 7 天各有一个，连着打卡也有 2 / 3 / 5 天），' +
      '越往后越需要积累。成就页按<b>学习 / 乐园 / 建筑 / 作息</b>四条线分组，每条线单独显示进度，没拿到的只露出最近三个 —— 不用盯着一屏锁发呆。</p>';

    h += '<h3>十三、换设备 / 换浏览器怎么办</h3>';
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
      /* v1.33：草地上的动物要分单击 / 双击 —— 单击看状态，双击它就跑开（让位给别的小生物） */
      if (el.dataset.act === 'pet-open' && el.dataset.pet) {
        el.onclick = function () { tapWalker(el); };
        return;
      }
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
      if (!k) { let msg = '现在没有新剧情。'; if (!window.Game.storySeen('labor')) msg = '照顾等级到 Lv.3 之后，最年长的那只就会来找你谈劳动。';
        else if (!window.Game.buildGate().ok) msg = window.Game.buildGate().msg;
        return toast(msg, 'warn'); }
      return openStoryModal(k);
    }
    if (act === 'build-open') return openBuildingModal(ds.id);
    if (act === 'bx-up') return openBuildingModal(ds.id, true);
    if (act === 'bx-pick') {
      /* v1.32：出工改成点头像格子（原来读下拉框的 value，现在读格子上的 data-pet） */
      if (bxState) bxState[ds.role] = ds.pet || el.value || null;
      if (bxPaint) { bxPaint(); return; }
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
      const pid = ds.pet || el.value;
      if (!pid) return;
      const r = window.Game.addStaff(ds.id, pid);
      toast((r.ok ? '' : '❌ ') + r.msg, r.ok ? 'ok' : 'err');
      if (bxPaint) bxPaint(); else render();
      renderTop();
      return;
    }
    /* v1.27：食堂 / 澡堂 / 图书馆改为倒计时运营，开工走这里 */
    if (act === 'op-start') {
      const r = window.Game.opStart(ds.id);
      toast((r.ok ? '✅ ' : '❌ ') + r.msg, r.ok ? 'ok' : 'warn', 6500);
      if (r.ok && r.guestNames && r.guestNames.length) {
        toast('👋 来光顾的是：' + esc(r.guestNames.join('、')), 'ok', 6000);
      }
      if (bxPaint) bxPaint(); else render();
      /* v1.37：开工是从弹窗里点的，`bxPaint()` 只重画弹窗，地图上那块名牌还停在「待开工」，
         要等 8 秒轮询才跟上。这里顺手把倒计时文字刷一遍 —— tickWorldTimers 只改 textContent，
         不重绘地图，所以不会打断手指下的拖动。 */
      tickWorldTimers();
      renderTop();
      return;
    }
    if (act === 'bx-do') {
      const k = ds.kind;
      if (k === 'museum') return openMuseumModal();
      let r = null;
      if (k === 'travel') r = window.Game.travelRun(ds.id);
      if (!r) return;
      toast((r.ok ? '✅ ' : '❌ ') + r.msg, r.ok ? 'ok' : 'warn', 6500);
      if (r.ok && k === 'travel') playCheer();
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
    /* ---- v1.28 ⚑ 题目举报 ---- */
    if (act === 'rep-undo') {
      const k = ds.key;
      if (k && S.qbankReports && S.qbankReports[k]) {
        delete S.qbankReports[k];
        window.Store.save(true);
        toast('已撤销这条标记', 'ok');
        render();
      }
      return;
    }
    if (act === 'rep-copy') {
      const txt = reportsText();
      if (!txt) return toast('还没有标记，没东西可复制。', 'warn');
      return copyText(txt).then(function (ok) {
        toast(ok ? '📋 举报清单已复制，粘到能改题的地方就行。' : '复制失败，可以手动选中下面这段。', ok ? 'ok' : 'warn');
        if (!ok) openReportTextModal();
      });
    }
    if (act === 'rep-clear') {
      const n = reportCount();
      if (!n) return toast('还没有标记。', 'warn');
      if (!confirm('清空全部 ' + n + ' 条举报标记？改完题之后可以一键清干净。')) return;
      S.qbankReports = {};
      window.Store.save(true);
      toast('已清空 ' + n + ' 条标记', 'ok');
      return render();
    }
    if (act === 'stack-toggle') {
      /* 点同一个格子＝收起，点别的＝换成那一格（收放都就地做，不换弹窗） */
      stackOpen = stackIsOpen(ds.kind, ds.sp) ? null : { kind: ds.kind, sp: ds.sp };
      return refreshStorageModal();
    }
    if (act === 'place-batch') {
      const loose = S.capsules.filter(function (c) { return !c.place && c.speciesId === ds.sp; });
      let n = 0;
      loose.forEach(function (c) { if (window.Game.placeCapsule(c.id).ok) n++; });
      toast(n ? '🌱 ' + n + ' 颗都放进孵化仓了，开始孵化。' : '❌ 托位满了，先去孵化仓扩一个。', n ? 'ok' : 'err');
      render();
      if (document.getElementById('storage-board')) refreshStorageModal();
      return refreshIncModal();
    }
    if (act === 'adopt-pet') return openAdoptModal(ds.id);
    if (act === 'chal-start') return openChallenge();
    if (act === 'place') {
      const r = window.Game.placeCapsule(ds.id);
      toast((r.ok ? '🌱 已经放进孵化仓，开始孵化。' : '❌ ' + r.msg), r.ok ? 'ok' : 'err');
      render();
      if (document.getElementById('storage-board')) refreshStorageModal();
      return refreshIncModal();
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
      render();
      return refreshIncModal();
    }
    if (act === 'expand') {
      /* 托位只有一个池（v1.20）：两种扩展位都加在同一个池上 */
      const r = window.Game.buy('slot_green', 1);
      toast((r.ok ? '🏡 ' + r.msg : '❌ ' + r.msg), r.ok ? 'ok' : 'err');
      render();
      return refreshIncModal();
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
          toast('🌿 ' + esc(r.pet.name) + ' 正式住进' + window.Game.zoneNameFor(sp) + '了。记得常来看看它。', 'ok', 6000);
          render();
        };
      }
    });
  }

  /* =========================================================
   * 破壳测验
   * 小生物出生前的关卡：每次 1 题，答对即破壳；答错可再答一次并看解析。
   * v1.22：不限时 —— 一题卷子用不上倒计时，而倒计时对 ADHD 是压力源不是动力。
   * ========================================================= */
  /* ---------------- 错题复习（自由练习，不限破壳时） ----------------
     点开就做，不计时，做完看成绩。 */
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

  /* ---------------- ⚑ 题目举报（v1.28） ----------------
     题库里内容不全（选项缺字、题干断在半个句子上）、答案可疑的题，
     做到的时候按一下就能标出来 —— 不打断做题，攒到「我的 → ⚑ 题目举报」统一看、统一改。
     标记存在存档里（S.qbankReports），连题干/选项/答案一起存快照，
     回头对着它改题，不用再去题库里翻。 */
  const REPORT_REASONS = [
    '内容不完整（选项缺字 / 题干断掉）',
    '答案不对',
    '选项有重复或错字',
    '表述含糊看不懂',
    '和另一道题重复'
  ];
  function reportKeyOf(q) {
    if (!q) return '';
    return String(q.id || q.qid || '') || ('q_' + String(q.stem || '').slice(0, 40));
  }
  function reportOf(q) {
    const k = reportKeyOf(q);
    return (k && S.qbankReports && S.qbankReports[k]) || null;
  }
  function reportSave(q, reason, note) {
    if (!q) return null;
    if (!S.qbankReports || typeof S.qbankReports !== 'object') S.qbankReports = {};
    const k = reportKeyOf(q);
    const rec = {
      key: k,
      id: String(q.id || q.qid || k),
      subject: q.subject || '',
      type: q.type || '',
      stem: String(q.stem || ''),
      options: (q.options || []).slice(),
      answer: q.answer,
      explain: String(q.explain || ''),
      reason: reason || REPORT_REASONS[0],
      note: String(note || '').trim(),
      at: Date.now()
    };
    S.qbankReports[k] = rec;
    window.Store.save(true);
    return rec;
  }
  function reportUndo(q) {
    const k = reportKeyOf(q);
    if (!k || !S.qbankReports || !S.qbankReports[k]) return false;
    delete S.qbankReports[k];
    window.Store.save(true);
    return true;
  }
  function reportCount() { return Object.keys(S.qbankReports || {}).length; }
  /* 题目卡上那一行「⚑ 举报」+ 就地展开的盒子 */
  function reportBarHtml(q) {
    const cur = reportOf(q);
    return '<div class="rep-bar">' +
      '<button type="button" class="rep-btn' + (cur ? ' on' : '') + '" data-rep="toggle">' +
        (cur ? ('⚑ 已标记 · ' + esc(cur.reason)) : '⚑ 这道题有问题？') +
      '</button>' +
      '<span class="rep-hint">' + (cur ? '点一下能改原因或撤销' : '内容不全 / 答案可疑，标一下，回头统一改') + '</span>' +
      '<div class="rep-box" data-open="0"></div>' +
      '</div>';
  }
  function reportInlineHtml(q) {
    const cur = reportOf(q);
    let h = '<div class="rep-inline">';
    h += '<div class="rep-reasons">' + REPORT_REASONS.map(function (r) {
      return '<button type="button" class="rep-chip' + ((cur && cur.reason === r) ? ' on' : '') +
        '" data-r="' + esc(r) + '">' + esc(r) + '</button>';
    }).join('') + '</div>';
    h += '<textarea class="rep-note" style="min-height:64px" placeholder="再说两句（选填）：哪个选项是空的？答案应该是哪个？">' +
      esc(cur ? cur.note : '') + '</textarea>';
    h += '<div class="posrow"><button type="button" class="btn btn-sm btn-primary rep-save">保存标记</button>' +
      (cur ? '<button type="button" class="btn btn-sm btn-ghost rep-del">撤销标记</button>' : '') +
      '<button type="button" class="btn btn-sm btn-ghost rep-close">收起</button></div>';
    h += '</div>';
    return h;
  }
  function bindReportInline(root, q, afterFn) {
    let picked = null;
    $$('.rep-chip', root).forEach(function (b) {
      if (b.classList.contains('on')) picked = b.dataset.r;
      b.onclick = function () {
        picked = b.dataset.r;
        $$('.rep-chip', root).forEach(function (x) { x.classList.toggle('on', x === b); });
      };
    });
    const sv = $('.rep-save', root);
    if (sv) sv.onclick = function () {
      reportSave(q, picked || REPORT_REASONS[0], ($('.rep-note', root) || {}).value);
      toast('⚑ 已标记这道题 —— 到「我的 → ⚑ 题目举报」能统一看、统一改', 'ok');
      if (afterFn) afterFn();
    };
    const dl = $('.rep-del', root);
    if (dl) dl.onclick = function () {
      reportUndo(q);
      toast('已撤销这道题的标记', 'ok');
      if (afterFn) afterFn();
    };
    const cl = $('.rep-close', root);
    if (cl) cl.onclick = function () { root.dataset.open = '0'; root.innerHTML = ''; };
  }
  /* 每个答题界面渲染完之后调一次，把「⚑ 举报」接上 */
  function bindReportBar(root, q, afterFn) {
    const btn = $('[data-rep="toggle"]', root);
    const box = $('.rep-box', root);
    if (!btn || !box) return;
    btn.onclick = function () {
      if (box.dataset.open === '1') { box.dataset.open = '0'; box.innerHTML = ''; return; }
      box.dataset.open = '1';
      box.innerHTML = reportInlineHtml(q);
      bindReportInline(box, q, afterFn);
    };
  }

  /* 「我的」页那块汇总：所有被标记的题，一条条列出来 */
  function meReportsPanel() {
    const list = Object.keys(S.qbankReports || {}).map(function (k) { return S.qbankReports[k]; })
      .sort(function (a, b) { return (b.at || 0) - (a.at || 0); });
    let h = '<div class="panel" id="me-reports">';
    h += '<div class="panel-head"><h2>⚑ 题目举报</h2>' +
      '<span class="hint">' + (list.length ? (list.length + ' 道待处理') : '还没有标记') + '</span></div>';
    if (!list.length) {
      h += '<div class="empty">做题时碰到内容不全、答案可疑的题，按一下题面下的「⚑ 这道题有问题？」，就会汇总到这里。</div>';
    } else {
      h += '<div class="rep-list">';
      list.forEach(function (r) {
        const sub = D.SUBJECTS.filter(function (x) { return x.id === r.subject })[0];
        h += '<div class="rep-item" data-key="' + esc(r.key) + '">' +
          '<div class="rep-i-head">' +
            '<span class="rep-i-tag">' + ((sub && sub.emoji) || '❓') + ' ' + esc((sub && sub.short) || '未分类') + '</span>' +
            '<span class="rep-i-reason">' + esc(r.reason) + '</span>' +
            '<span class="rep-i-id">' + esc(r.id) + '</span>' +
          '</div>' +
          '<div class="rep-i-stem">' + esc(String(r.stem || '').slice(0, 160)) + '</div>' +
          (r.options && r.options.length
            ? '<div class="rep-i-opts">' + r.options.map(function (o, i) {
                const isAns = Array.isArray(r.answer) ? r.answer.indexOf(i) >= 0 : r.answer === i;
                return '<span class="rep-i-opt' + (isAns ? ' ans' : '') + '">' +
                  String.fromCharCode(65 + i) + '. ' + esc(String(o || '（空）')) + (isAns ? ' ✔' : '') + '</span>';
              }).join('') + '</div>'
            : '') +
          (r.note ? '<div class="rep-i-note">📝 ' + esc(r.note) + '</div>' : '') +
          '<div class="rep-i-foot">' +
            '<span class="fh-i">' + fmtWhen(r.at) + ' 标记</span>' +
            '<button class="btn btn-sm btn-ghost" data-act="rep-undo" data-key="' + esc(r.key) + '">撤销标记</button>' +
          '</div>' +
        '</div>';
      });
      h += '</div>';
      h += '<div class="posrow">' +
        '<button class="btn btn-sm" data-act="rep-copy">📋 复制全部举报（改题时用）</button>' +
        '<button class="btn btn-sm btn-ghost" data-act="rep-clear">🧹 改完了，清空标记</button>' +
        '</div>';
    }
    h += '</div>';
    return h;
  }
  /* 复制失败时兜底：弹一段可手动选中的纯文本 */
  function openReportTextModal() {
    const txt = reportsText() || '（没有标记）';
    openModal({
      title: '⚑ 举报清单',
      wide: true,
      body: '<div class="fh" style="margin-bottom:8px">长按或全选下面这段文字复制走。</div>' +
        '<textarea class="rep-copy-area" readonly style="min-height:280px;font-size:12px">' + esc(txt) + '</textarea>',
      foot: '<button class="btn btn-primary" data-act="m-close">关闭</button>'
    });
  }
  /* 举报清单的纯文本版：复制出去对照着改题 */
  function reportsText() {
    const list = Object.keys(S.qbankReports || {}).map(function (k) { return S.qbankReports[k]; })
      .sort(function (a, b) { return (b.at || 0) - (a.at || 0); });
    const out = [];
    list.forEach(function (r, n) {
      const sub = D.SUBJECTS.filter(function (x) { return x.id === r.subject })[0];
      out.push('[' + (n + 1) + '] ' + r.id + '　科目：' + ((sub && sub.name) || '未分类'));
      out.push('问题：' + r.reason + (r.note ? ('　补充：' + r.note) : ''));
      out.push('题干：' + r.stem);
      (r.options || []).forEach(function (o, i) {
        const isAns = Array.isArray(r.answer) ? r.answer.indexOf(i) >= 0 : r.answer === i;
        out.push('  ' + String.fromCharCode(65 + i) + '. ' + String(o || '（空）') + (isAns ? '  ← 现答案' : ''));
      });
      if (r.explain) out.push('解析：' + r.explain);
      out.push('');
    });
    return out.join('\n');
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
    h += reportBarHtml(p);   /* v1.28 ⚑ 举报：就地展开，不换弹窗（换弹窗会丢掉答题进度） */
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

    bindReportBar($('.rep-bar', body), p, function () { renderWrongQuiz(mask); });   /* v1.28 ⚑ 举报 */

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

  /* =========================================================
   * 挑战赛（商店页入口，v1.23）
   * 跟破壳测验共用同一个题库，但它是「你想练就练」，不是关卡：
   * 10 题 / 5 分钟 / 正确率 80% 才结算可可豆，每天 4 局（额度与奖金都读 D.CHALLENGE）。
   * 这里保留倒计时——但这是玩家自己进来找的紧张感，
   * 跟「被倒计时盯着做任务」是两回事。（破壳测验那边依然不限时。）
   * ========================================================= */
  let chz = null;
  /* 挑战赛的达标题数自己算：QBank.passLine 用的是破壳测验那套 70%，
     两个玩法及格线不一样，不能混用（10 题 70% = 7 题，80% = 8 题）。 */
  function chalLine(total) {
    const rate = window.Game.chalCfg().passRate;
    return Math.max(1, Math.ceil((total || 0) * rate));
  }
  function openChallenge() {
    const gate = window.Game.chalOpen();
    if (!gate.ok) {
      toast((gate.why === 'empty' ? '📕 ' : '🌙 ') + gate.msg, gate.why === 'empty' ? 'warn' : 'ok', 4500);
      return;
    }
    const n = gate.count;
    /* 优先抽还没掌握的（那才是要练的）；不够 10 题就放开，会了也别闲着 */
    let paper = window.QBank.makePaper(n, {});
    if (paper.length < n) paper = window.QBank.makePaper(n, { mastered: false });
    if (!paper.length) { toast('题库还是空的', 'warn'); return; }

    chz = {
      paper: paper,
      answers: paper.map(function () { return []; }),
      idx: 0,
      endsAt: gate.minutes > 0 ? (Date.now() + gate.minutes * 60000) : 0,
      timer: null,
      done: false,
      result: null,
      reward: null
    };

    openModal({
      title: '🏆 挑战赛 · ' + paper.length + ' 题',
      wide: true,
      body: '<div id="chz-body"></div>',
      foot: '<div class="qz-foot" id="chz-foot"></div>',
      onClose: function () {
        if (chz && chz.timer) clearInterval(chz.timer);
        chz = null;   /* 中途关掉＝不打了：不扣次数、不计成绩，回来重开一局 */
      },
      onMount: function (mask) {
        renderChal(mask);
        if (chz && chz.endsAt > 0) chz.timer = setInterval(function () { tickChal(mask); }, 1000);
      }
    });
  }

  function renderChal(mask) {
    if (!chz || !mask) return;
    if (chz.done) return renderChalResult(mask);
    const body = $('#chz-body', mask), foot = $('#chz-foot', mask);
    if (!body || !foot) return;
    const cfg = window.Game.chalCfg();
    const p = chz.paper[chz.idx];
    const left = chz.endsAt > 0 ? Math.max(0, Math.round((chz.endsAt - Date.now()) / 1000)) : -1;
    const answered = chz.answers.filter(function (a) { return Array.isArray(a) && a.length > 0; }).length;
    const line = chalLine(chz.paper.length);

    let h = '<div class="qz-bar">' +
      (left >= 0
        ? '<span class="qz-clock' + (left <= 60 ? ' urgent' : '') + '" id="chz-clock">⏱️ ' + fmtClock(left) + '</span>'
        : '<span class="qz-clock" id="chz-clock">🍃 不限时</span>') +
      '<span class="qz-pill">第 ' + (chz.idx + 1) + ' / ' + chz.paper.length + ' 题</span>' +
      '<span class="qz-pill">已答 ' + answered + '</span>' +
      '<span class="qz-pill">答对 ' + line + ' 题赢 🌰 ' + cfg.beansPass + '</span>' +
      (p.multi ? '<span class="qz-pill qz-multi">多选</span>' : '') +
      '</div>';
    h += '<div class="qz-progress"><i style="width:' + ((chz.idx + 1) / chz.paper.length * 100) + '%"></i></div>';
    h += '<div class="qz-stem">' + esc(p.stem) + '</div>';
    h += reportBarHtml(p);   /* v1.28 ⚑ 举报：就地展开，不换弹窗（换弹窗会丢掉答题进度） */

    h += '<div class="qz-opts">';
    const selected = chz.answers[chz.idx] || [];
    p.options.forEach(function (o, i) {
      const on = p.multi ? (selected.indexOf(i) >= 0) : (selected.length === 1 && selected[0] === i);
      h += '<button class="qz-opt' + (on ? ' on' : '') + '" data-chz="pick" data-i="' + i + '">' +
        '<b>' + 'ABCDEFGH'.charAt(i) + '</b><span>' + esc(o) + '</span></button>';
    });
    h += '</div>';

    h += '<div class="qz-sheet"><span class="qz-sheet-k">答题卡</span>' +
      chz.paper.map(function (_, i) {
        const cur = i === chz.idx ? ' cur' : '';
        const on = (chz.answers[i] && chz.answers[i].length > 0) ? ' on' : '';
        return '<button class="qz-dot' + on + cur + '" data-chz="jump" data-i="' + i + '">' + (i + 1) + '</button>';
      }).join('') +
      '<span class="qz-sheet-h">点题号可以跳过去</span></div>';

    body.innerHTML = h;
    foot.innerHTML =
      '<button class="btn btn-ghost" data-chz="prev"' + (chz.idx === 0 ? ' disabled' : '') + '>上一题</button>' +
      (chz.idx < chz.paper.length - 1
        ? '<button class="btn" data-chz="next">下一题</button>'
        : '<button class="btn" disabled>最后一题</button>') +
      '<button class="btn btn-primary" data-chz="submit">交卷</button>';

    bindReportBar($('.rep-bar', body), p, function () { renderChal(mask); });   /* v1.28 ⚑ 举报 */

    $$('[data-chz]', mask).forEach(function (el) {
      el.onclick = function () { onChalAct(el.dataset.chz, parseInt(el.dataset.i, 10)); };
    });
  }

  function onChalAct(act, i) {
    if (!chz || chz.done) return;
    const mask = activeMask();
    if (act === 'pick') {
      const p = chz.paper[chz.idx];
      const arr = chz.answers[chz.idx] || [];
      if (p.multi) {
        const pos = arr.indexOf(i);
        if (pos >= 0) arr.splice(pos, 1); else arr.push(i);
        chz.answers[chz.idx] = arr;
      } else {
        chz.answers[chz.idx] = [i];
      }
      return renderChal(mask);
    }
    if (act === 'jump') { chz.idx = Math.max(0, Math.min(chz.paper.length - 1, i)); return renderChal(mask); }
    if (act === 'prev') { chz.idx = Math.max(0, chz.idx - 1); return renderChal(mask); }
    if (act === 'next') { chz.idx = Math.min(chz.paper.length - 1, chz.idx + 1); return renderChal(mask); }
    if (act === 'submit') return submitChal(mask, false);
  }

  /* 每秒只改时钟那一小段文字，不重绘整张卷子 */
  function tickChal(mask) {
    if (!chz || chz.done || chz.endsAt <= 0) return;
    const left = Math.max(0, Math.round((chz.endsAt - Date.now()) / 1000));
    const el = $('#chz-clock', mask);
    if (el) {
      el.textContent = '⏱️ ' + fmtClock(left);
      el.className = 'qz-clock' + (left <= 60 ? ' urgent' : '');
    }
    if (left <= 0) submitChal(mask, true);
  }

  function submitChal(mask, timeout) {
    if (!chz || chz.done) return;
    if (chz.timer) { clearInterval(chz.timer); chz.timer = null; }
    const res = window.QBank.grade(chz.paper, chz.answers);
    res.timeout = !!timeout;
    chz.done = true;
    chz.result = res;
    chz.reward = window.Game.chalFinish(res, chz.paper);
    if (chz.reward.passed) {
      confetti(chz.reward.perfect ? 70 : 40);
      render();
    } else if (timeout) {
      toast('⏰ 时间到，已自动交卷。', 'warn');
    }
    renderChalResult(mask);
  }

  function renderChalResult(mask) {
    if (!chz || !mask) return;
    const body = $('#chz-body', mask), foot = $('#chz-foot', mask);
    if (!body || !foot) return;
    const cfg = window.Game.chalCfg();
    const r = chz.result, rw = chz.reward;
    const pct = Math.round(r.rate * 100);
    const line = chalLine(r.total);

    function letterArr(arr) {
      return (arr || []).map(function (i) { return 'ABCDEFGH'.charAt(i); }).join('');
    }

    let h = '<div class="qz-score ' + (rw.passed ? 'ok' : 'no') + '">' +
      '<div class="qz-score-num">' + r.correct + '<span>/' + r.total + '</span></div>' +
      '<div class="qz-score-sub">正确率 ' + pct + '%　达标线 ' + Math.round(cfg.passRate * 100) + '%（' + line + ' 题）' +
      (r.timeout ? '　⏰ 时间到，已自动交卷' : '') + '</div>' +
      '<div class="qz-score-line">' +
      (rw.passed
        ? '🎉 赢了 <b>🌰 ' + rw.beans + ' 可可豆</b>' + (rw.perfect ? '（满分再加 🌰 ' + cfg.beansPerfect + '）' : '')
        : '差 ' + (line - r.correct) + ' 题。再来一局就有了——错题本来就该多练几遍。') +
      '</div></div>';

    h += '<div class="chal-stat">' +
      '<span>今日剩余 <b>' + (rw.left > 90 ? '不限' : rw.left + ' 局') + '</b></span>' +
      '<span>历史最好 <b>' + rw.best + '%</b></span>' +
      '</div>';

    /* v1.36：这一局消掉几道错题 —— 答对即移出，以后不再出现；答错的放回卷子 */
    const myN = (rw.mastery && rw.mastery.mastered) || 0;
    const rvN = (rw.mastery && rw.mastery.revived) || 0;
    if (myN || rvN) {
      h += '<div class="okbox" style="margin-top:12px">🎯 答对的 <b>' + myN + '</b> 道已移出错题列表，以后不再出现' +
        (rvN ? '；答错的 ' + rvN + ' 道放回了卷子，下次还会碰到。' : '。') + '</div>';
    }

    /* 错题回顾：挑战赛最值钱的东西其实在这儿，不在那几十颗豆 */
    const wrong = r.detail.filter(function (d) { return !d.ok; });
    if (wrong.length) {
      h += '<div class="qz-review"><div class="qz-review-h">📝 这 ' + wrong.length + ' 题再看一眼（不看下一局还是错）</div>';
      wrong.forEach(function (d) {
        const p = chz.paper[d.i];
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
    } else {
      h += '<div class="okbox" style="margin-top:12px">这一局没有错题。题库里这批题你已经稳了。</div>';
    }

    body.innerHTML = h;
    foot.innerHTML = (rw.left > 0
      ? '<button class="btn btn-primary" data-chz="again">再来一局</button>'
      : '<button class="btn" data-chz="later">今天到这儿，明天再来</button>') +
      '<button class="btn btn-ghost" data-chz="close">先歇会儿</button>';

    $$('[data-chz]', mask).forEach(function (el) {
      el.onclick = function () {
        const a = el.dataset.chz;
        if (a === 'again') { closeModal(); return openChallenge(); }
        if (a === 'close' || a === 'later') return closeModal();
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
      /* v1.22：minutes<=0 表示不限时，不设截止、不启动倒计时 */
      endsAt: (cfg.minutes > 0) ? (Date.now() + cfg.minutes * 60000) : 0,
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
        if (qz && qz.endsAt > 0) {
          qz.timer = setInterval(function () { tickQuiz(mask); }, 1000);
        }
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
    const left = qz.endsAt > 0 ? Math.max(0, Math.round((qz.endsAt - Date.now()) / 1000)) : -1;
    const answered = qz.answers.filter(function (a) { return Array.isArray(a) && a.length > 0; }).length;
    const line = window.QBank.passLine(qz.paper.length);

    let h = '<div class="qz-bar">' +
      (left >= 0
        ? '<span class="qz-clock' + (left <= 60 ? ' urgent' : '') + '" id="qz-clock">⏱️ ' + fmtClock(left) + '</span>'
        : '<span class="qz-clock" id="qz-clock">🍃 不限时</span>') +
      '<span class="qz-pill">第 ' + (qz.idx + 1) + ' / ' + qz.paper.length + ' 题</span>' +
      '<span class="qz-pill">已答 ' + answered + '</span>' +
      '<span class="qz-pill">答对 ' + line + ' 题及格</span>' +
      (p.multi ? '<span class="qz-pill qz-multi">多选</span>' : '') +
      '</div>';
    h += '<div class="qz-progress"><i style="width:' + ((qz.idx + 1) / qz.paper.length * 100) + '%"></i></div>';

    h += '<div class="qz-stem">' + esc(p.stem) + '</div>';
    h += reportBarHtml(p);   /* v1.28 ⚑ 举报：就地展开，不换弹窗（换弹窗会丢掉答题进度） */

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

    bindReportBar($('.rep-bar', body), p, function () { renderQuiz(mask); });   /* v1.28 ⚑ 举报 */

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

  /* 每秒只改时钟那一小段文字，不重绘整张卷子；不限时（endsAt=0）时不会被调用 */
  function tickQuiz(mask) {
    if (!qz || qz.done || qz.endsAt <= 0) return;
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

    /* v1.36：答对一题就消一题 —— 不再要求「整卷及格」才记掌握。
       需求原话是「只要答对一次即自动从错题列表中删除」，所以按题判，跟整卷过没过无关。
       规则本体统一在 QBank.applyResult（挑战赛走同一个函数）。 */
    const mastery = (window.QBank && window.QBank.applyResult)
      ? window.QBank.applyResult(qz.paper, res) : { mastered: 0, revived: 0 };
    qz.mastery = mastery;
    if (res.passed) {
      window.Game.markQuizPassed(qz.capId, res);
      confetti(qz.sp.rarity >= 2 ? 50 : 24);
    } else if (timeout) {
      toast('⏰ 时间到，已自动交卷。', 'warn');
    }
    if (mastery.mastered > 0) {
      window.Store.pushLog('🎯 破壳测验答对 ' + mastery.mastered + ' 题，已移出错题列表，以后不会再出现。');
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

    const myN = (qz.mastery && qz.mastery.mastered) || 0;
    if (myN > 0) {
      h += '<div class="okbox" style="margin-top:12px">🎯 答对的 ' + myN + ' 题已移出错题列表，以后不会再出现。</div>';
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
    qz.endsAt = (cfg.minutes > 0) ? (Date.now() + cfg.minutes * 60000) : 0;
    qz.done = false;
    qz.result = null;
    if (qz.timer) { clearInterval(qz.timer); qz.timer = null; }
    if (qz.endsAt > 0) qz.timer = setInterval(function () { tickQuiz(mask); }, 1000);
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
      '<tr><th>安置处</th><td>' + window.Game.zoneNameFor(sp) +
        ((typeof window.Game.zoneCap === 'function' && window.Game.zoneCap(window.Game.zoneIdOf(p)))
          ? '（' + window.Game.petsInZone(window.Game.zoneIdOf(p)).length + ' / ' + window.Game.zoneCap(window.Game.zoneIdOf(p)) + ' 个位置）' : '') + '</td></tr>' +
      '<tr><th>干活</th><td>' +
        ((typeof window.Game.restText === 'function' && window.Game.restText(p))
          ? esc(window.Game.restText(p))
          : '现在就能出工') +
        ' · 稀有度效益 ×' + ((typeof D.rarityWorkOf === 'function') ? D.rarityWorkOf(sp.rarity).toFixed(2) : '1.00') + '</td></tr>' +
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
  /* 通用凭证上传区：图片 / 文件 / 录音，三选一即可。
     required=true 用于「提交弹窗」任务（强制至少一样）；required=false 用于练习台（鼓励不强制）。
     opts.hint  自定义下面那句说明（错题整理要讲清楚「录音不算」）
     opts.noRec 不渲染录音按钮（该任务录音不合格时，不该给一个点了也过不去的按钮）
     target 须含 {photo, file, audios:[]}，与提交弹窗的 vf 共用结构。 */
  function evidenceZoneHTML(prefix, required, opts) {
    const o = opts || {};
    const hint = o.hint || (required
      ? '做了就是做了——传张图、传个文件（PDF / 文档截图都行）、或录段音，随便一样就能结算。'
      : '顺手留个痕迹：传张图、传个文件、或录段音都行，不强制。');
    return '<div class="field"><label>📎 提交凭证' + (required ? '<span class="req">必交</span>' : '<span class="fh-i">选填</span>') + '</label>' +
      '<div class="evi-zone">' +
        '<div class="photo-drop" id="' + prefix + '-drop">传一张图，或把图片拖进来</div>' +
        '<input type="file" accept="image/*" id="' + prefix + '-img" class="hidden">' +
        '<input type="file" id="' + prefix + '-file" class="hidden">' +
        '<div class="evi-btns">' +
          '<button type="button" class="btn btn-sm" id="' + prefix + '-pickfile">📄 传一个文件</button>' +
          (o.noRec ? '' : '<button type="button" class="btn btn-sm rec-btn" id="' + prefix + '-rec">🎙️ 录一段音</button>') +
        '</div>' +
        '<div id="' + prefix + '-prev" class="evi-prev"></div>' +
      '</div>' +
      '<div class="hintbox">' + hint + '</div></div>';
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

  /* 读书进度的文案（弹窗里的选书按钮、任务卡面、「我的」页共用一套说法）
     v1.28：按「读到第几页 / 共几页」说，百分比是主信息。
     还没登记过位置的旧存档走 v1.26 的天数口径（mode:'days'）。 */
  function readProgText(bp, long) {
    if (!bp) bp = { mode: 'days', days: 0, plan: 6, done: false };
    const pct = Math.round((bp.pct || 0) * 100);
    if (bp.mode === 'pos') {
      if (bp.done) return long ? ('✅ 已读完 · ' + pct + '%') : '✅ 读完';
      if (!bp.page && !bp.chapter) return long ? '还没登记读到哪儿（点「📖 去精读」记一下）' : '还没登记';
      /* 短式给任务卡上的标签用：一眼看到「读到第几页 / 共几页」，比光给百分比有用 */
      const short = bp.pages > 0 ? ('第 ' + bp.page + ' / ' + bp.pages + ' 页')
        : (bp.chapters > 0 ? ('第 ' + bp.chapter + ' / ' + bp.chapters + ' 章') : (pct + '%'));
      return long ? (D.bookPosText(bp) + ' · ' + pct + '%') : short;
    }
    if (bp.done) return long ? '✅ 已读完 · 已读 ' + bp.days + ' 天' : '✅ 读完';
    /* 还没登记过位置：这本书连页数/章数都没填，就先提示去补，别一直显示"已读 0 天" */
    if (!bp.pages && !bp.chapters) {
      return long ? '还没填共几页 · 点「📐 书本信息」补一下' : '还没填页数';
    }
    return long ? '已读 ' + bp.days + ' 天 / 计划 ' + bp.plan + ' 天（还没登记读到哪一页）' : '已读 ' + bp.days + ' 天';
  }

  /* 精读弹窗里「读到哪儿」那一段：换书 / 换章都要重算节数、总页数与提示。
     行里的元素（在 openVerifyModal 里生成）：
       #vf-ch 章　#vf-sec 节（select）　#vf-pg 页　#vf-pos-of 共几页　#vf-pos-hint 提示 */
  function refreshPosPad(bookId, mask) {
    mask = mask || document;
    const meta = (typeof D.bookMetaOf === 'function') ? D.bookMetaOf(bookId) : null;
    const pages = (typeof D.bookPagesOf === 'function') ? D.bookPagesOf(bookId) : 0;
    const chN = (typeof D.bookChapterCount === 'function') ? D.bookChapterCount(bookId) : 0;
    const bp = window.Study.bookProgressOf(bookId);

    const of = $('#vf-pos-of', mask);
    if (of) {
      of.textContent = pages > 0 ? ('/ 共 ' + pages + ' 页') : (chN > 0 ? ('/ 共 ' + chN + ' 章') : '/ 总页数还没填');
    }
    const chIn = $('#vf-ch', mask);
    if (chIn) {
      if (chN > 0) chIn.setAttribute('max', String(chN));
      else chIn.removeAttribute('max');
    }
    const pgIn = $('#vf-pg', mask);
    if (pgIn) {
      if (pages > 0) pgIn.setAttribute('max', String(pages));
      else pgIn.removeAttribute('max');
    }
    /* 节：跟着当前选的章重新生成选项 */
    const sec = $('#vf-sec', mask);
    if (sec && chIn) {
      const ch = parseInt(chIn.value || '0', 10) || 0;
      const n = (typeof D.bookSectionCount === 'function') ? D.bookSectionCount(bookId, ch) : 0;
      const t = meta && meta.chapters ? meta.chapters[ch - 1] : null;
      const names = (t && t.sections) ? t.sections : [];
      let h = '<option value="0">—</option>';
      for (let i = 1; i <= n; i++) {
        h += '<option value="' + i + '">第 ' + i + ' 节' + (names[i - 1] ? ' ' + esc(names[i - 1]) : '') + '</option>';
      }
      sec.innerHTML = h;
    }
    const hint = $('#vf-pos-hint', mask);
    if (hint) updatePosPreview(mask);
  }

  /* 「读到哪儿」下面那行提示：实时告诉你「这么填，进度会变成多少」 */
  function updatePosPreview(mask) {
    mask = mask || document;
    const hint = $('#vf-pos-hint', mask);
    if (!hint) return;
    const bookId = (vf && vf.bookId) || '';
    const pages = (typeof D.bookPagesOf === 'function') ? D.bookPagesOf(bookId) : 0;
    const chN = (typeof D.bookChapterCount === 'function') ? D.bookChapterCount(bookId) : 0;
    const chIn = $('#vf-ch', mask), pgIn = $('#vf-pg', mask);
    const ch = chIn ? (parseInt(chIn.value || '0', 10) || 0) : 0;
    const pg = pgIn ? (parseInt(pgIn.value || '0', 10) || 0) : 0;
    const finBtn = $('#vf-finish', mask);
    const markDone = !!(finBtn && finBtn.classList.contains('on'));

    let pct = 0;
    if (markDone) pct = 1;
    else if (pages > 0 && pg > 0) pct = Math.min(1, pg / pages);
    else if (chN > 0 && ch > 0) pct = Math.min(1, ch / chN);

    const parts = [];
    if (pages > 0) parts.push('全书 ' + pages + ' 页');
    else if (chN > 0) parts.push('全书 ' + chN + ' 章');
    else parts.push('这本书的目录还没填（点「📐 书本信息」补一下，填了总页数就能按页走）');
    if (pct > 0) {
      parts.push('登记后进度 <b>' + Math.round(pct * 100) + '%</b>' + (pct >= 1 ? ' ✅ 读完' : ''));
    }
    const bp = window.Study.bookProgressOf(bookId);
    if (!markDone && bp.mode === 'pos' && bp.at) parts.push('上次记到 ' + esc(D.bookPosText(bp)));
    hint.innerHTML = parts.join('　·　');
  }

  /* 在弹窗里换了课本 → 同步刷新任务卡面上的读书进度标签 + 位置输入区（不用重开弹窗） */
  function refreshReadProgBadge(bookId, bpEl, task) {
    const bp = window.Study.bookProgressOf(bookId);
    const sub = D.SUBJECTS.filter(function (x) { return x.id === bookId })[0];
    if (bpEl) {
      bpEl.textContent = readProgText(bp, true);
      bpEl.classList.toggle('bp-done', !!bp.done);
    }
    const hint = $('#vf-bp-hint');
    if (hint) {
      hint.textContent = bp.done
        ? '这本已经读完了（' + Math.round((bp.pct || 1) * 100) + '%）。今天再读算二刷，进度保持 100%。'
        : '进度 = 读到第几页 / 全书总页数。读到最后一页就自动标读完，不用凑天数。';
    }
    refreshPosPad(bookId, document);
    /* 任务卡面上那块标签也跟着换书走 */
    const badge = task ? $('[data-readprog="' + task.uid + '"]') : null;
    if (badge && sub) {
      badge.textContent = '📖 ' + sub.name + '：' + readProgText(bp, false);
      badge.classList.toggle('tag-ok', !!bp.done);
    }
  }

  /* ---------------- 📐 书本信息（v1.28） ----------------
     每本课本「共几章 / 共几节 / 共多少页」你说了算：填一次存进存档（S.bookToc），
     优先级高于 data.js 里的内置目录，进度条当场按新数字重算。
     在精读弹窗里是就地展开（不换弹窗，否则未保存的输入会丢）。 */
  function bookInfoHtml(bookId) {
    const meta = (typeof D.bookMetaOf === 'function') ? (D.bookMetaOf(bookId) || {}) : {};
    const ov = (S.bookToc && S.bookToc[bookId]) || {};
    const chN = (meta.chapters || []).length;
    let h = '<div class="bi-grid">' +
      '<label class="bi-i">总页数<input id="bi-pages" type="number" min="0" inputmode="numeric" placeholder="比如 320" value="' +
        (meta.pages || '') + '"></label>' +
      '<label class="bi-i">共几章<input id="bi-chs" type="number" min="0" inputmode="numeric" placeholder="比如 9" value="' +
        (chN || '') + '"></label>' +
      '<label class="bi-i">共几节<input id="bi-secs" type="number" min="0" inputmode="numeric" placeholder="选填" value="' +
        (ov.sectionCount || '') + '"></label>' +
      '</div>' +
      '<div class="fh">填上<b>总页数</b>，进度条就按「读到第几页 / 总页数」走（最准）；只填章数也能按章算。</div>';
    if (chN) {
      h += '<div class="bi-toc">' + meta.chapters.map(function (c, i) {
        return '<div class="bi-row"><span class="bi-ch">' + (i + 1) + '</span>' +
          '<span class="bi-t">' + esc(c.title || ('第 ' + (i + 1) + ' 章')) + '</span>' +
          (c.page ? '<span class="bi-p">P' + c.page + '</span>' : '') + '</div>';
      }).join('') + '</div>';
    }
    return h;
  }
  function bindBookInfo(root, bookId, cb) {
    const btn = $('#bi-save', root);
    if (!btn) return;
    btn.onclick = function () {
      const pages = parseInt(($('#bi-pages', root) || {}).value || '0', 10) || 0;
      const chs = parseInt(($('#bi-chs', root) || {}).value || '0', 10) || 0;
      const secs = parseInt(($('#bi-secs', root) || {}).value || '0', 10) || 0;
      if (pages > 0 && pages < 10) return toast('总页数看着不太对（至少 10 页吧）', 'warn');
      D.bookSetToc(bookId, { pages: pages, chapterCount: chs, sectionCount: secs });
      window.Store.save(true);
      const sub = D.SUBJECTS.filter(function (x) { return x.id === bookId })[0];
      toast('📐 《' + ((sub && sub.name) || '课本') + '》的书本信息已存下，进度按新数据重算', 'ok');
      if (cb) cb();
    };
  }
  function toggleBookInfo(box, bookId, cb, headText) {
    if (!box) return;
    if (box.dataset.open === '1') { box.dataset.open = '0'; box.innerHTML = ''; return; }
    box.dataset.open = '1';
    box.innerHTML = '<div class="bi-head">' + (headText || '📐 书本信息（填一次就行）') + '</div>' +
      bookInfoHtml(bookId) +
      '<div class="posrow"><button type="button" class="btn btn-sm btn-primary" id="bi-save">保存并重算进度</button></div>';
    bindBookInfo(box, bookId, cb);
  }

  function openVerifyModal(task) {
    if (!task) return;
    const v = task.verify, need = task.need || {};
    /* 练习台任务：不打开验证弹窗，直接进练习台对应标签 */
    if (v.type === 'practice') {
      return openPracticePanel(task.libId === 'p_interview' ? 'interview' : 'script');
    }
    /* v1.34 自己写导游词：不进通用验证弹窗，直接进写作台（正文本身就是凭证） */
    if (v.type === 'writescript') return openScriptWriter(task);
    const isReading = v.type === 'reading';
    const isNote = v.type === 'note';
    vf = {
      task: task, photo: null, file: null, feynmanCount: 0,
      audios: [],
      bookId: (task.pick === 'book' || isReading) ? (task.ctx.bookId || '') : '',
      reading: { read: '', note: '', chapter: 0, section: 0, page: 0, finish: false }
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
          const bp = window.Study.bookProgressOf(s.id);
          return '<button class="bpick" data-bid="' + s.id + '">' +
            '<span class="bp-emoji">' + s.emoji + '</span>' +
            '<span class="bp-name">' + esc(s.name) + '</span>' +
            '<span class="bp-prog' + (bp.done ? ' bp-done' : '') + '" data-bp="' + s.id + '">' +
            readProgText(bp, true) +
            '</span>' +
            '</button>';
        }).join('') + '</div>';
      /* v1.28：进度按页码走。今天选这本，卡面和下面的「读到哪儿」就跟着这本走 */
      body += '<div class="fh" id="vf-bp-hint">' +
        '进度 = 读到第几页 / 全书总页数。读到最后一页就自动标读完，不用凑天数。' +
        '</div>' +
        '<label class="chk-line"><input type="checkbox" id="vf-whole"> ' +
        '<span>今天一整天都在读这本（读完才收工）</span></label>' +
        '</div>';
    }

    /* v1.28 精读第二步：读到哪儿了（章 / 节 / 页）——进度条就按这个往前走 */
    if (isReading) {
      const bp0 = window.Study.bookProgressOf(vf.bookId || '');
      body += '<div class="field"><label>② 读到哪儿了？<span class="req">必答</span>' +
        '<span class="fh-i">填了页码，进度条自动更新</span></label>' +
        '<div class="pospad">' +
          '<label class="pos-i">第 <input id="vf-ch" type="number" min="0" max="999" step="1" inputmode="numeric" value="' +
            (bp0.chapter || '') + '"> 章</label>' +
          '<label class="pos-i">第 <select id="vf-sec"><option value="0">—</option></select> 节</label>' +
          '<label class="pos-i">第 <input id="vf-pg" type="number" min="0" max="99999" step="1" inputmode="numeric" value="' +
            (bp0.page || '') + '"> 页</label>' +
          '<span class="pos-of" id="vf-pos-of">/ 共 ? 页</span>' +
        '</div>' +
        '<div class="posrow">' +
          '<button type="button" class="btn btn-sm" id="vf-finish">📕 这本我读完了</button>' +
          '<button type="button" class="btn btn-sm btn-ghost" id="vf-bookinfo">📐 书本信息</button>' +
        '</div>' +
        '<div class="fh" id="vf-pos-hint"></div>' +
        '<div class="bookinfo-box" id="vf-bookinfo-box" data-open="0"></div></div>';
    }

    /* 精读第三步：今天读了什么（选填；填了位置就不强制写字了） */
    if (isReading) {
      const mChars = v.minChars || 6;
      body += '<div class="field"><label>③ 今天读了什么？<span class="opt">选填</span></label>' +
        '<textarea id="vf-read" style="min-height:72px" placeholder="比如：第三章 3.2 节，P78–P96，旅行社的责任范围。懒得写就空着。"></textarea>' +
        '<div class="fh"><span id="vf-read-cnt">0 / ' + mChars + ' 字起</span></div></div>';
      body += '<div class="field"><label>④ 笔记 / 感想（选填）</label>' +
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
       已自带必交截图(need.photo)或录音(record)的任务不重复加区，但同样受提交时「至少一样」约束。
       v1.36：错题整理只认图片/文件（笔记要留下来回看），所以那一档不给录音按钮、说明也换一句。 */
    const needEvidenceDedicated = !!need.photo || v.type === 'record';
    if (!needEvidenceDedicated) {
      body += evidenceZoneHTML('vf-u', true, v.type === 'wrongnote' ? {
        noRec: true,
        hint: '错题整理要交一份「笔记」：拍一张手写笔记的照片，或传一个整理好的文档（PDF / Word / 图片都行）。录音代替不了它——笔记是要留下来回头看的。'
      } : null);
    }

    /* v1.36：错题整理给一个直达错题库的入口 —— 要整理的东西就在那儿 */
    if (v.type === 'wrongnote') {
      body += '<div class="okbox" style="margin-top:4px">📕 <b>错题都在「资料库 → 错题复习」里。</b>' +
        '不用手动删——在挑战赛或破壳测验里答对一次，它自己就移出去了，以后不再出现。' +
        '<div style="margin-top:8px"><button type="button" class="btn btn-sm" id="vf-wrongopen">📕 打开错题库看看</button></div></div>';
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

        /* v1.36 错题整理：直达错题库（先关窗，免得遮罩压住题库面板） */
        const wo = $('#vf-wrongopen', m);
        if (wo) wo.onclick = function () { closeModal(); openWrongQuiz(); };

        /* 选课本：精读 / 课后练习共用 */
        if (task.pick === 'book' || isReading) {
          $$('.bpick', m).forEach(function (b) {
            if (b.dataset.bid === vf.bookId) b.classList.add('on');
            b.onclick = function () {
              vf.bookId = b.dataset.bid;
              $$('.bpick', m).forEach(function (x) { x.classList.toggle('on', x === b); });
              /* 选了哪本，卡面上的进度就跟着切到哪本，下面的「读到哪儿」也跟着换书 */
              refreshReadProgBadge(b.dataset.bid, b.querySelector('.bp-prog'), task);
              /* 换书时把「读到哪儿」预填成这本书上次记的位置，省得每天重填 */
              if (isReading) {
                const bp = window.Study.bookProgressOf(b.dataset.bid);
                const chI = $('#vf-ch', m), pgI = $('#vf-pg', m);
                if (chI) chI.value = bp.chapter || '';
                if (pgI) pgI.value = bp.page || '';
                const f = $('#vf-finish', m);
                if (f) f.classList.toggle('on', !!bp.done);
                refreshPosPad(b.dataset.bid, m);
              }
            };
          });
        }

        /* 精读：「读到哪儿」——章 / 节 / 页，边填边更新进度预览 */
        if (isReading) {
          const chI = $('#vf-ch', m), pgI = $('#vf-pg', m), secI = $('#vf-sec', m);
          if (chI) {
            chI.oninput = function () { refreshPosPad(vf.bookId, m); updatePosPreview(m); };
            chI.onchange = function () { refreshPosPad(vf.bookId, m); updatePosPreview(m); };
          }
          if (secI) secI.onchange = function () { updatePosPreview(m); };
          if (pgI) pgI.oninput = function () { updatePosPreview(m); };
          const fBtn = $('#vf-finish', m);
          if (fBtn) {
            const bp0 = window.Study.bookProgressOf(vf.bookId || '');
            fBtn.classList.toggle('on', !!bp0.done);
            fBtn.onclick = function () {
              const on = !fBtn.classList.contains('on');
              fBtn.classList.toggle('on', on);
              fBtn.textContent = on ? '📕 已标记：这本读完了' : '📕 这本我读完了';
              const pages = (typeof D.bookPagesOf === 'function') ? D.bookPagesOf(vf.bookId) : 0;
              const chN = (typeof D.bookChapterCount === 'function') ? D.bookChapterCount(vf.bookId) : 0;
              vf.reading.finish = on;
              if (on) {
                if (pages > 0 && pgI) pgI.value = pages;
                if (chN > 0 && chI) chI.value = chN;
                refreshPosPad(vf.bookId, m);
              }
              updatePosPreview(m);
            };
          }
          const biBtn = $('#vf-bookinfo', m);
          if (biBtn) {
            biBtn.onclick = function () {
              const box = $('#vf-bookinfo-box', m);
              if (!box) return;
              if (box.dataset.open === '1') {
                box.dataset.open = '0'; box.innerHTML = '';
                biBtn.classList.remove('on');
                return;
              }
              box.dataset.open = '1'; biBtn.classList.add('on');
              box.innerHTML = '<div class="bi-head">📐 书本信息（填一次就行）</div>' +
                bookInfoHtml(vf.bookId) +
                '<div class="posrow"><button type="button" class="btn btn-sm btn-primary" id="bi-save">保存并重算进度</button></div>';
              bindBookInfo(box, vf.bookId, function () {
                refreshPosPad(vf.bookId, m);
                updatePosPreview(m);
                /* 卡面上的百分比也跟着新页数走 */
                const el = $('.bpick.on .bp-prog', m);
                refreshReadProgBadge(vf.bookId, el, task);
              });
            };
          }
          refreshPosPad(vf.bookId, m);
          updatePosPreview(m);
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
    else if (v.type === 'writescript') parts.push('自己动笔写 / 改一篇导游词（≥' + (v.minChars || 120) + ' 字，正文就是凭证）');
    else if (v.type === 'wrongnote') parts.push('交一份错题笔记：拍一张手写笔记的照片，或传一个整理好的文档（录音不算）');
    else if (task.pick === 'book') parts.push('选定这套题属于哪一科');
    if (task.need && task.need.photo) parts.push('凭证截图');
    if (task.need && task.need.feynman) parts.push('费曼卡 ×' + task.need.feynman);
    /* 所有走提交弹窗的任务都需至少提交一样凭证（图片/文件/录音）；
       writescript 的正文即凭证、wrongnote 只认图片/文件，都不用这句话 */
    if (v.type !== 'practice' && v.type !== 'writescript' && v.type !== 'wrongnote' &&
        !((task.need && task.need.photo) || v.type === 'record')) parts.push('至少提交一样凭证（图片/文件/录音）');
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

    /* 收集精读登记（必答：读哪本 + 读到哪儿；选填：读了什么 / 笔记） */
    let reading = null;
    if (v.type === 'reading') {
      const finEl = $('#vf-finish', mask);
      reading = {
        bookId: vf.bookId,
        chapter: parseInt((($('#vf-ch', mask) || {}).value) || '0', 10) || 0,
        section: parseInt((($('#vf-sec', mask) || {}).value) || '0', 10) || 0,
        page: parseInt((($('#vf-pg', mask) || {}).value) || '0', 10) || 0,
        finish: !!(finEl && finEl.classList.contains('on')),
        whole: !!($('#vf-whole', mask) || {}).checked,
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

    /* 通用凭证门槛：所有提交弹窗的任务，至少提交一样凭证（图片 / 文件 / 录音）。
       v1.36：错题整理只认「图片 / 文件」—— 录音代替不了笔记，所以单独一条规则。
       Study.validate 里还有一份同样的判断（双保险，防绕过 UI 直接调 finish）。 */
    const hasFileEv = !!(vf.photo || vf.file);
    const hasEvidence = hasFileEv || !!(vf.audios && vf.audios.length);
    if (v.type === 'wrongnote') {
      if (!hasFileEv) errs.push('错题整理要交一份笔记：拍一张手写笔记的照片，或传一个文档（PDF / Word / 图片都行）。录音代替不了它。');
    } else if (!hasEvidence) {
      errs.push('请至少提交一样凭证：传一张图、传一个文件、或录一段音');
    }

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
    if (vf.photo) {
      summary.push(v.type === 'reading' ? '已存笔记照片'
        : v.type === 'opinion' ? '已存导游词练习截图'
        : v.type === 'wrongnote' ? '已交错题笔记（照片）'
        : '已存截图');
    }
    if (vf.file) {
      summary.push(v.type === 'wrongnote'
        ? ('已交错题笔记（文件：' + vf.file.name + '）')
        : ('已存文件：' + vf.file.name));
    }
    if (reading && reading.bookId) {
      const bk = D.SUBJECTS.filter(function (x) { return x.id === reading.bookId })[0];
      if (bk) {
        summary.push('精读《' + bk.name + '》');
        const posBits = [];
        if (reading.chapter > 0) posBits.push('第 ' + reading.chapter + ' 章');
        if (reading.section > 0) posBits.push('第 ' + reading.section + ' 节');
        if (reading.page > 0) posBits.push('第 ' + reading.page + ' 页');
        if (posBits.length) summary.push('读到 ' + posBits.join(' '));
        if (reading.finish) summary.push('✅ 这本读完了');
        if (reading.whole) summary.push('今天一整天都在读这本');
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

      /* v1.34：我的导游词 —— 自己动笔写的稿子，反复改到考前 */
      const my = window.Study.myScripts();
      body += '<div class="practice-evi ws-mine">' +
        '<div class="practice-evi-head">✍️ 我的导游词（' + my.length + ' 篇）</div>' +
        '<div class="hint">参考完范文，自己动笔写一篇才是真会讲。写下来的稿子一直在，考前能一遍遍改。</div>' +
        '<div class="ws-mine-list">';
      if (!my.length) {
        body += '<div class="hint" style="margin:6px 0">还没写过自己的导游词。第一篇不用长，先把欢迎词和欢送词写顺。</div>';
      } else {
        my.slice(0, 8).forEach(function (s) {
          body += '<div class="ws-mine-row">' +
            '<span class="ws-mine-name">' + esc(s.name) + '</span>' +
            '<span class="ws-mine-meta">' + (s.chars || (s.text || '').length) + ' 字' +
            (s.writes > 1 ? ' ｜ ' + s.writes + ' 稿' : '') + '</span>' +
            '<button class="btn btn-sm btn-ghost" data-act="ws-edit" data-sid="' + s.id + '">✍️ 接着改</button>' +
            '<button class="btn btn-sm btn-ghost" data-act="ws-del" data-sid="' + s.id + '" title="删掉这篇稿子">🗑</button>' +
            '</div>';
        });
        if (my.length > 8) body += '<div class="hint">还有 ' + (my.length - 8) + ' 篇，先显示最近的 8 篇。</div>';
      }
      body += '</div>' +
        '<button class="btn btn-primary" data-act="ws-new">✍️ 新写一篇导游词</button>' +
        '</div>';

      body += '<div class="practice-hint" style="margin-top:10px"><div>📄 内置范文（12 篇，读 / 背用）</div>' +
        '<div class="hint">点「阅读 / 背诵」看全文、隐藏自测、写背诵大纲；点「今天读了 / 今天背了」完成今日任务。</div></div>';
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
        /* v1.34 我的导游词：新写 / 接着改 / 删掉 */
        $$('[data-act="ws-new"]', m).forEach(function (b) {
          b.onclick = function () { openScriptWriter(null, ''); };
        });
        $$('[data-act="ws-edit"]', m).forEach(function (b) {
          b.onclick = function () { openScriptWriter(null, b.dataset.sid); };
        });
        $$('[data-act="ws-del"]', m).forEach(function (b) {
          b.onclick = function () {
            const s = window.Study.myScriptById(b.dataset.sid);
            if (!s) return;
            if (!confirm('删掉《' + s.name + '》这篇稿子？删了就找不回来了。')) return;
            window.Study.removeMyScript(s.id);
            toast('🗑 已删掉《' + s.name + '》。', 'ok');
            render();
            openPracticePanel('script');
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

  /* ---------------- 写 / 修改导游词（v1.34） ----------------
     两条路进来：① 自建任务的「✍️ 去写导游词」；② 练习台导游词页的「✍️ 我的导游词」。
     有 task 时保存即结算；没有 task（纯练习台进来）就只存稿。
     稿子存在 S.myScripts，同一篇能反复改，考前就是自己的独门讲解稿。 */
  function openScriptWriter(task, presetId) {
    const v = (task && task.verify) || { minChars: 0 };
    const minChars = v.minChars || 0;
    const my = window.Study.myScripts();
    /* 当前在改哪一篇：'' = 新写一篇 */
    let curId = presetId || (task && task.ctx && task.ctx.scriptId) || '';
    if (curId && !window.Study.myScriptById(curId)) curId = '';

    function curScript() { return curId ? window.Study.myScriptById(curId) : null; }

    let body = '<div class="warnbox">' +
      (task
        ? '本任务要过验证才发奖：' + verifyText(task) + '。<br>奖励 🎟️ ' + task.reward.tickets + ' / 🌰 ' + task.reward.beans +
          '，写多少就是多少，不看你写得漂不漂亮。'
        : '这里是你的导游词草稿本。写下来的稿子会一直存着，考前能一遍遍改。') +
      '</div>';

    /* ① 选一篇来改 / 新建 */
    body += '<div class="field"><label>① 写哪一篇？<span class="fh-i">新写一篇，或点下面的稿子接着改</span></label>' +
      '<div class="ws-pick" id="ws-pick">' +
      '<button class="ws-card" data-sid=""><span class="ws-emoji">🆕</span>' +
      '<span class="ws-name">新写一篇</span><span class="ws-meta">从空白开始</span></button>';
    my.forEach(function (s) {
      body += '<button class="ws-card" data-sid="' + s.id + '"><span class="ws-emoji">✍️</span>' +
        '<span class="ws-name">' + esc(s.name) + '</span>' +
        '<span class="ws-meta">' + (s.chars || (s.text || '').length) + ' 字' +
        (s.writes > 1 ? ' ｜ 改了 ' + s.writes + ' 稿' : '') + '</span></button>';
    });
    body += '</div></div>';

    /* ② 篇名 + 景点（选填） */
    body += '<div class="field"><label>② 篇名<span class="req">必答</span></label>' +
      '<input type="text" id="ws-name" maxlength="30" placeholder="例如：昆明市石林风景区（我自己的版本）"></div>';
    body += '<div class="field"><label>景点 / 团型<span class="opt">选填</span></label>' +
      '<div class="inline">' +
        '<div><span style="font-size:11.5px;color:#8AA394">景点</span><input type="text" id="ws-place" maxlength="20" placeholder="昆明"></div>' +
        '<div><span style="font-size:11.5px;color:#8AA394">团型</span><input type="text" id="ws-group" maxlength="12" placeholder="研学团"></div>' +
      '</div></div>';

    /* ③ 正文 */
    body += '<div class="field"><label>③ 导游词正文<span class="req">必答</span>' +
      '<span class="fh-i">按欢迎词 → 景点 → 欢送词的顺序写，写着写着就顺了</span></label>' +
      '<textarea id="ws-text" class="ws-text" placeholder="1.欢迎词&#10;各位朋友大家好，我是大家今天的导游……&#10;&#10;2.景点概况&#10;……"></textarea>' +
      '<div class="fh"><span id="ws-cnt">0 字</span>' +
      '<span id="ws-hint">' + (minChars ? '这件任务要求至少 ' + minChars + ' 字（不算空格换行）' : '边写边存，写不完明天接着改') + '</span></div></div>';

    /* 参考：内置 12 篇可以对照着看，但只做参考不覆盖 */
    body += '<div class="field"><label>📚 参考内置范文<span class="opt">选填</span>' +
      '<span class="fh-i">点开只是看看，不会动你写的内容</span></label>' +
      '<div class="ws-refs">' +
      D.SCRIPTS.map(function (sc) {
        return '<button class="ws-ref" data-ref="' + sc.id + '">' + esc(sc.name) + '</button>';
      }).join('') +
      '</div><div id="ws-ref-box"></div></div>';

    body += '<div id="ws-err"></div>';

    const foot = (task
      ? '<button class="btn btn-ghost" id="ws-save">💾 先存着（不算完成）</button>' +
        '<button class="btn btn-primary" id="ws-ok">✅ 保存并结算</button>'
      : '<button class="btn btn-ghost" id="ws-close2">关闭</button>' +
        '<button class="btn btn-primary" id="ws-ok">💾 保存这篇稿子</button>');

    openModal({
      title: task ? ('✍️ 写导游词 · ' + esc(task.title)) : '✍️ 我的导游词',
      body: body, wide: true, dismissable: true,
      foot: foot,
      onMount: function (m) {
        const nameEl = $('#ws-name', m), textEl = $('#ws-text', m), cntEl = $('#ws-cnt', m);
        if ($('#ws-close2', m)) $('#ws-close2', m).onclick = closeModal;

        function bareLen(s) { return String(s || '').replace(/\s/g, '').length; }
        function paintCnt() {
          const n = bareLen(textEl.value);
          const ok = !minChars || n >= minChars;
          cntEl.textContent = n + ' 字' + (minChars ? ' / ' + minChars + ' 字起' : '');
          cntEl.style.color = (minChars && !ok && n > 0) ? '#B03B37' : (ok && n > 0 ? '#2E7A4C' : '');
          cntEl.style.fontWeight = (n > 0 && ok) ? '600' : '';
        }
        textEl.oninput = paintCnt;

        /* 载入某一篇（新写 = 清空） */
        function loadInto() {
          const s = curScript();
          nameEl.value = s ? s.name : '';
          textEl.value = s ? (s.text || '') : '';
          $('#ws-place', m).value = s ? (s.place || '') : '';
          $('#ws-group', m).value = s ? (s.group || '') : '';
          $$('.ws-card', m).forEach(function (b) {
            b.classList.toggle('on', (b.dataset.sid || '') === curId);
          });
          paintCnt();
        }
        $$('.ws-card', m).forEach(function (b) {
          b.onclick = function () {
            /* 切走之前把当前输入留在本地（不落盘），避免手一滑丢掉刚写的 */
            const s = curScript();
            if (s) { s.name = nameEl.value.trim() || s.name; s.text = textEl.value; }
            curId = b.dataset.sid || '';
            loadInto();
          };
        });
        loadInto();

        /* 参考范文：就地展开 */
        $$('.ws-ref', m).forEach(function (b) {
          b.onclick = function () {
            const sc = D.SCRIPTS.filter(function (x) { return x.id === b.dataset.ref; })[0];
            const box = $('#ws-ref-box', m);
            if (!sc || !box) return;
            if (box.dataset.open === sc.id) { box.dataset.open = ''; box.innerHTML = ''; return; }
            box.dataset.open = sc.id;
            box.innerHTML = '<div class="ws-ref-head">📄 ' + esc(sc.name) + ' · ' + esc(sc.place) + ' · 约 ' + sc.minutes + ' 分钟</div>' +
              '<div class="script-flow">' + (sc.nodes || []).map(function (n) { return '<span>' + esc(n) + '</span>'; }).join('') + '</div>' +
              '<div class="ws-ref-text">' + (sc.content ? esc(sc.content).replace(/\n/g, '<br>') : '<span class="hint">这篇还没录入正文，只能看大纲。</span>') + '</div>';
          };
        });

        function collect() {
          return {
            id: curId || '',
            name: String(nameEl.value || '').trim(),
            place: String($('#ws-place', m).value || '').trim(),
            group: String($('#ws-group', m).value || '').trim(),
            text: String(textEl.value || '').trim()
          };
        }
        function showErrs(errs) {
          $('#ws-err', m).innerHTML = '<div class="errbox">还不能存，先补齐这些：<ul>' +
            errs.map(function (e) { return '<li>' + esc(e) + '</li>'; }).join('') + '</ul></div>';
        }

        /* 💾 先存着：只落稿，不结算（写一半也能保住） */
        const saveBtn = $('#ws-save', m);
        if (saveBtn) saveBtn.onclick = function () {
          const d = collect();
          if (!d.name) return showErrs(['先给这篇导游词起个名字']);
          if (!d.text) return showErrs(['正文还是空的']);
          const up = window.Study.upsertMyScript(d);
          if (!up.ok) return showErrs([up.msg || '保存失败']);
          curId = up.script.id;
          toast('💾 存住了：《' + up.script.name + '》' + up.script.text.length + ' 字，明天接着改。', 'ok', 4500);
          render();
          openScriptWriter(task, curId);
        };

        /* ✅ 保存并结算（没 task 时就是纯保存） */
        $('#ws-ok', m).onclick = function () {
          const d = collect();
          if (!task) {
            const errs = [];
            if (!d.name) errs.push('先给这篇导游词起个名字（景点名就行）');
            if (!d.text) errs.push('正文还是空的，写点什么吧');
            if (errs.length) return showErrs(errs);
            const up = window.Study.upsertMyScript(d);
            if (!up.ok) return showErrs([up.msg || '保存失败']);
            toast('✍️ 存下了：《' + up.script.name + '》' + up.script.text.length + ' 字。', 'ok', 4500);
            render();
            return openScriptWriter(null, up.script.id);
          }
          /* 有 task：交给 Study 统一验证 + 结算（字数按去掉空白算） */
          const r = window.Study.finish(task.uid, { writing: d });
          if (!r.ok) return showErrs(r.errs || ['结算失败']);
          let msg = '✅ 「' + task.title + '」完成：+' + r.gain.tickets + ' 券 / +' + r.gain.beans + ' 豆';
          (r.extra || []).forEach(function (x) { msg += '　' + x; });
          toast(msg, 'ok', 6000);
          confetti(46); playCheer();
          closeModal();
          render();
        };
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
