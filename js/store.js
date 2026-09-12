/* =========================================================
 * 知识喂了猫 · 存档 / 时间 / 证据库
 * ========================================================= */
window.Store = (function () {

  const KEY = 'yunling_capsule_garden_v1';
  const KEY_BAK = 'yunling_capsule_garden_v1__bak';   /* 危险操作前的上一份快照，用于回滚 */
  const DB_NAME = 'yunling_evidence';
  const DB_STORE = 'files';

  let state = null;
  let idb = null;

  /* ---------------- 时间工具 ---------------- */
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function dateKey(d) {
    d = d || new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function dayStart(d) {
    const x = new Date(d || Date.now());
    x.setHours(0, 0, 0, 0);
    return x.getTime();
  }
  function daysBetween(aKey, bKey) {
    const a = new Date(aKey + 'T00:00:00');
    const b = new Date(bKey + 'T00:00:00');
    return Math.round((b - a) / 86400000);
  }
  function nowISO() { return new Date().toISOString(); }

  /* ---------------- 默认存档 ---------------- */
  function defaultState() {
    const today = dateKey();
    return {
      v: 1,
      savedAt: 0,          /* 最后一次成功落盘的时间：跨设备同步时用来判断哪一份更新 */
      createdAt: today,
      planStart: today,
      examDate: window.GAME_DATA.EXAM_DATE,
      cur: { tickets: 5, beans: 60, freeQuestions: 0 },  /* 开局小礼包；freeQuestions=每日签到可能抽到的“1道题”免题券 */
      profile: { nick: '', avatar: '' },   /* 「我的」页：昵称 + 头像（emoji） */
      bag: { water: 5, fert: 3, pest: 2, food: 5, soap: 2 },
      capsules: [],
      pets: [],
      slots: { greenhouse: 4, hatchery: 4 },
      pity: 0,
      saves: [],                   /* 存档槽：每项是一枚可带走的快照（含存档码） */
      save: { lastAt: 0, sinceTake: 0, lastTakeAt: 0, autoCount: 0 },  /* 存档统计 + 唠叨计数 */
      masteredQuestions: {},  /* 破壳测验里已答对的题 id -> timestamp；不再重复出现 */
      study: {
        tasksDate: '',
        taskVer: 0,         /* 任务库版本；升级后强制重算今日任务 */
        tasks: [],
        done: {},           /* taskUid -> {at, detail, tickets, beans} */
        shards: {},         /* taskUid -> [{idx, text, at}] 今日拾光碎片 */
        kolbToday: { CE: 0, RO: 0, AC: 0, AE: 0 },
        kolbBonusDate: '',
        feedBonusDate: '',  /* 投喂单全满的奖励日期（每天只发一次） */
        dailyRewardDate: '',/* 每日签到奖励最后领取日期 */
        userTasks: [],      /* 自建加餐任务模板（跨天保留） */
        quizAccum: {}       /* taskUid -> {q, correct} 刷题任务的累计进度 */
      },
      stats: {
        totalPulls: 0, totalHatched: 0, uniqueSpecies: 0, legendOwned: 0,
        careCount: 0, healedCount: 0, adultCount: 0, eliteCount: 0,
        streak: 0, bestStreak: 0, lastCheckin: '',
        shards: 0, notes: 0, questions: 0, correct: 0,
        booksDone: 0, scriptsMastered: 0, feynmanCards: 0,
        mockCount: 0, fullFeedDays: 0,
        kolbFullDays: 0, daysPassed: 0, noSickStreak: 0, sickFreeDays: 0,
        evidenceCount: 0,
        quizAttempts: 0, quizPassed: 0, quizAnswered: 0, quizCorrect: 0
      },
      achievements: {},
      qbank: [],            /* 自己粘贴导入的破壳测验题（内置题库在 data.js 的 QUESTION_BANK） */
      bookProgress: { /* subjectId -> 已读天数 */ },
      scripts: {},          /* scriptId -> {read, recite, mastered, lastAt} */
      feynman: [],          /* 费曼卡 */
      evidence: [],         /* 证据索引 */
      log: []
    };
  }

  /* ---------------- 读写 ---------------- */
  /* 就地替换存档内容。
     重要：Game / Study / app 都持有 state 的引用（`S = window.Store.state`），
     所以导入存档、重置这类操作绝对不能直接换对象，只能把内容搬进去，
     否则那些模块会继续对着一个已经没人管的旧对象读写（旧版本就踩过这个坑）。 */
  function replaceState(next) {
    if (!state) { state = next; return state; }
    Object.keys(state).forEach(function (k) { delete state[k]; });
    Object.keys(next).forEach(function (k) { state[k] = next[k]; });
    return state;
  }

  function load() {
    let raw = null, fromBak = false;
    try { raw = localStorage.getItem(KEY); } catch (e) { raw = null; }
    if (!raw) {
      /* 主档不见了（换浏览器/清缓存/写失败），看看有没有上一份快照 */
      try {
        const b = localStorage.getItem(KEY_BAK);
        if (b) { raw = b; fromBak = true; }
      } catch (e) { /* 读不到就当没有 */ }
    }
    if (raw) {
      try {
        replaceState(JSON.parse(raw));
        migrate(state);
        if (fromBak) pushLog('主存档读不到，已从上一份备份恢复。');
        return state;
      } catch (e) {
        console.warn('主存档损坏，尝试备份', e);
      }
    }
    if (!fromBak) {
      try {
        const b = localStorage.getItem(KEY_BAK);
        if (b) {
          replaceState(JSON.parse(b));
          migrate(state);
          pushLog('主存档损坏，已从备份恢复。');
          return state;
        }
      } catch (e2) { /* 备份也坏了，只能重建 */ }
    }
    replaceState(defaultState());
    pushLog('欢迎来到「知识喂了猫」。距离考试还有 ' + daysLeft() + ' 天，从今天开始，每天来一次。');
    return state;
  }

  function migrate(s) {
    const d = defaultState();
    /* 浅层补全，保证老存档不炸 */
    Object.keys(d).forEach(function (k) {
      if (s[k] === undefined) s[k] = d[k];
    });
    ['cur', 'bag', 'slots', 'study', 'stats', 'bookProgress', 'scripts'].forEach(function (k) {
      Object.keys(d[k]).forEach(function (kk) {
        if (s[k][kk] === undefined) s[k][kk] = d[k][kk];
      });
    });
    /* 老存档补 profile（「我的」页的昵称 + 头像） */
    if (!s.profile || typeof s.profile !== 'object') s.profile = { nick: '', avatar: '' };
    if (s.profile.nick === undefined) s.profile.nick = '';
    if (s.profile.avatar === undefined) s.profile.avatar = '';
    /* 老存档补存档槽 */
    if (!Array.isArray(s.saves)) s.saves = [];
    if (!s.save || typeof s.save !== 'object') s.save = { lastAt: 0, sinceTake: 0, lastTakeAt: 0, autoCount: 0 };
    ['lastAt', 'sinceTake', 'lastTakeAt', 'autoCount'].forEach(function (k) {
      if (s.save[k] === undefined) s.save[k] = 0;
    });
    /* 老存档补已掌握题目集合 */
    if (!s.masteredQuestions || typeof s.masteredQuestions !== 'object') s.masteredQuestions = {};
    /* 老存档补音乐偏好 */
    if (!s.settings || typeof s.settings !== 'object') s.settings = { bgmOn: false, bgmTrack: 0 };
    if (typeof s.settings.bgmOn !== 'boolean') s.settings.bgmOn = false;
    if (typeof s.settings.bgmTrack !== 'number') s.settings.bgmTrack = 0;
    /* 老存档补自建任务列表 + 刷题累计进度 + 每日签到 + 免题券 */
    if (!s.study || typeof s.study !== 'object') s.study = {};
    if (!Array.isArray(s.study.userTasks)) s.study.userTasks = [];
    if (!s.study.quizAccum || typeof s.study.quizAccum !== 'object') s.study.quizAccum = {};
    if (s.study.dailyRewardDate === undefined) s.study.dailyRewardDate = '';
    if (!s.cur || typeof s.cur !== 'object') s.cur = {};
    if (s.cur.freeQuestions === undefined) s.cur.freeQuestions = 0;
  }

  /* localStorage 只有 5MB 上下，而证据库里每条凭证都带一张 base64 缩略图。
     配额一满，setItem 会直接抛异常——如果只是 console.warn 了事，
     玩家会觉得"存档莫名其妙退回上一次"，其实是后面几十次保存全都没写进去。
     所以：先原样写；写不下就摘掉缩略图再写；再写不下才认输并报给界面。 */
  function slimCopy(s) {
    const c = JSON.parse(JSON.stringify(s));
    (c.evidence || []).forEach(function (e) {
      if (e.thumb) { e.thumb = ''; e.thumbDropped = true; }
    });
    return c;
  }

  let saveTimer = null;
  let slimWarned = false;
  const hooks = { onSaveError: null, onSaveSlim: null, onSaved: null };
  function fireSaved() { if (hooks.onSaved) { try { hooks.onSaved(); } catch (e) { /* 云同步失败不影响游戏 */ } } }

  function save(immediate) {
    if (!state) return true;
    if (!immediate) {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(function () { save(true); }, 400);
      return true;
    }
    clearTimeout(saveTimer);
    state.savedAt = Date.now();

    let raw = null;
    try { raw = JSON.stringify(state); } catch (e) { raw = null; }
    if (raw !== null) {
      try { localStorage.setItem(KEY, raw); slimWarned = false; fireSaved(); return true; }
      catch (e) { /* 多半是配额满了，往下走瘦身分支 */ }
    }
    try {
      localStorage.setItem(KEY, JSON.stringify(slimCopy(state)));
      if (!slimWarned) {
        slimWarned = true;
        if (hooks.onSaveSlim) hooks.onSaveSlim();
      }
      fireSaved();
      return true;
    } catch (e2) {
      if (hooks.onSaveError) hooks.onSaveError(e2);
      else console.warn('存档写入失败', e2);
      return false;
    }
  }

  /* 危险操作（导入 / 重置 / 还原）之前先把现在这份存成快照 */
  function backupCurrent() {
    if (!state) return false;
    try { localStorage.setItem(KEY_BAK, JSON.stringify(state)); return true; }
    catch (e) {
      try { localStorage.setItem(KEY_BAK, JSON.stringify(slimCopy(state))); return true; }
      catch (e2) { return false; }
    }
  }

  function backupInfo() {
    try {
      const b = localStorage.getItem(KEY_BAK);
      if (!b) return null;
      const o = JSON.parse(b);
      return { savedAt: o.savedAt || 0, size: b.length, state: o };
    } catch (e) { return null; }
  }

  function restoreBackup() {
    let b = null;
    try { b = localStorage.getItem(KEY_BAK); } catch (e) { b = null; }
    if (!b) return false;
    try {
      replaceState(JSON.parse(b));
      migrate(state);
      save(true);
      return true;
    } catch (e) { return false; }
  }

  function reset() {
    backupCurrent();
    try { localStorage.removeItem(KEY); } catch (e) { /* 无所谓 */ }
    replaceState(defaultState());
    save(true);
    return state;
  }

  function pushLog(text) {
    if (!state) return;
    state.log.unshift({ t: Date.now(), text: text });
    if (state.log.length > 200) state.log.length = 200;
  }

  /* ---------------- 考试 / 阶段 ---------------- */
  function today() { return dateKey(); }
  function daysLeft() { return Math.max(0, daysBetween(today(), state.examDate)); }
  function planDay() {
    /* 第几天（1 起算），以 planStart 为 D1 */
    return Math.max(1, daysBetween(state.planStart, today()) + 1);
  }
  function currentPhase() {
    const d = planDay();
    const P = window.GAME_DATA.PHASES;
    let acc = 0;
    for (let i = 0; i < P.length; i++) {
      acc += P[i].days;
      if (d <= acc) return { phase: P[i], dayInPhase: d - (acc - P[i].days), day: d };
    }
    /* 超出计划期（冲刺结束/临考），仍按第三阶段算 */
    return { phase: P[P.length - 1], dayInPhase: P[P.length - 1].days, day: d, overtime: true };
  }

  /* ---------------- 证据库（IndexedDB，降级 localStorage） ---------------- */
  function openDB() {
    return new Promise(function (resolve) {
      if (idb) return resolve(idb);
      if (!window.indexedDB) return resolve(null);
      let req;
      try { req = indexedDB.open(DB_NAME, 1); }
      catch (e) { return resolve(null); }
      req.onupgradeneeded = function () {
        const db = req.result;
        if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE);
      };
      req.onsuccess = function () { idb = req.result; resolve(idb); };
      req.onerror = function () { resolve(null); };
      req.onblocked = function () { resolve(null); };
    });
  }

  function idbPut(key, value) {
    return openDB().then(function (db) {
      if (!db) return false;
      return new Promise(function (resolve) {
        try {
          const tx = db.transaction(DB_STORE, 'readwrite');
          tx.objectStore(DB_STORE).put(value, key);
          tx.oncomplete = function () { resolve(true); };
          tx.onerror = function () { resolve(false); };
        } catch (e) { resolve(false); }
      });
    });
  }

  function idbGet(key) {
    return openDB().then(function (db) {
      if (!db) return null;
      return new Promise(function (resolve) {
        try {
          const tx = db.transaction(DB_STORE, 'readonly');
          const r = tx.objectStore(DB_STORE).get(key);
          r.onsuccess = function () { resolve(r.result || null); };
          r.onerror = function () { resolve(null); };
        } catch (e) { resolve(null); }
      });
    });
  }

  function idbDel(key) {
    return openDB().then(function (db) {
      if (!db) return false;
      return new Promise(function (resolve) {
        try {
          const tx = db.transaction(DB_STORE, 'readwrite');
          tx.objectStore(DB_STORE).delete(key);
          tx.oncomplete = function () { resolve(true); };
          tx.onerror = function () { resolve(false); };
        } catch (e) { resolve(false); }
      });
    });
  }

  /* 把文件写进证据库；图片会压缩成小缩略图存进 state，便于快速渲染 */
  function addEvidence(opts) {
    /* opts: {type:'photo'|'audio'|'note', taskId, label, blob, dataURL, text, duration} */
    const id = 'ev_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
    const entry = {
      id: id,
      type: opts.type,
      taskId: opts.taskId || '',
      label: opts.label || '',
      at: Date.now(),
      day: today(),
      mime: (opts.blob && opts.blob.type) || '',
      sizeKB: opts.blob ? Math.round(opts.blob.size / 1024) : 0,
      duration: opts.duration || 0,
      text: opts.text || '',
      thumb: opts.thumb || '',
      store: 'idb'
    };

    const payload = opts.blob || (opts.dataURL ? opts.dataURL : null);
    return idbPut(id, payload).then(function (ok) {
      if (!ok) {
        /* 降级：localStorage 只留下文本与缩略图 */
        entry.store = 'ls-only';
        if (opts.dataURL && opts.type === 'note') entry.text = opts.dataURL;
      }
      state.evidence.unshift(entry);
      state.stats.evidenceCount++;
      save(true);
      return entry;
    });
  }

  function getEvidenceBlob(id) { return idbGet(id); }

  function removeEvidence(id) {
    return idbDel(id).then(function () {
      state.evidence = state.evidence.filter(function (e) { return e.id !== id; });
      save(true);
    });
  }

  /* ---------------- 存档（本地快照 + 可带走的存档码） ----------------
     这个游戏没有服务器，所以「存档」就是一枚能带走的快照：
     每完成一项任务自动存一份，随时读档回到那一格；存档码抄到别的设备，
     就是同步码——同一个东西，两种用法。 */
  const SAVE_MAX = 12;      /* 存档位总数 */
  const SAVE_AUTO_MAX = 8;  /* 其中自动档最多占几格（手动档不会被挤掉） */

  function makeSave(name, auto) {
    if (!state) return Promise.resolve({ ok: false, msg: '存档系统还没准备好' });
    if (!window.Sync || !window.Sync.encode) return Promise.resolve({ ok: false, msg: '同步模块没加载' });
    return window.Sync.encode(state).then(function (r) {
      const sv = {
        id: 'sv_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        at: Date.now(),
        name: name || '',
        auto: !!auto,
        size: r.size,
        brief: window.Sync.brief ? window.Sync.brief(state) : '',
        code: r.code
      };
      const list = [sv].concat(state.saves || []);
      /* 手动档永远留着；自动档只留最近几份，最老的先被挤掉 */
      const kept = [];
      let autoN = 0;
      list.forEach(function (x) {
        if (x.auto) { autoN++; if (autoN <= SAVE_AUTO_MAX) kept.push(x); }
        else kept.push(x);
      });
      state.saves = kept.slice(0, SAVE_MAX);
      state.save = state.save || {};
      state.save.lastAt = sv.at;
      if (auto) {
        state.save.autoCount = (state.save.autoCount || 0) + 1;
        state.save.sinceTake = (state.save.sinceTake || 0) + 1;
      } else {
        state.save.sinceTake = 0;   /* 手动存过一次就别再唠叨 */
      }
      save(true);
      return { ok: true, save: sv, size: r.size };
    }).catch(function (e) { return { ok: false, msg: (e && e.message) || String(e) }; });
  }

  function listSaves() { return state && state.saves ? state.saves.slice() : []; }

  function loadSave(id) {
    const sv = listSaves().filter(function (x) { return x.id === id; })[0];
    if (!sv) return Promise.resolve({ ok: false, msg: '没找到这份存档' });
    return window.Sync.decode(sv.code).then(function (obj) {
      importAll(obj);   /* importAll 收的是整包（含 state 字段） */

      return { ok: true, at: sv.at, name: sv.name };
    }).catch(function (e) { return { ok: false, msg: (e && e.message) || String(e) }; });
  }

  function removeSave(id) {
    if (!state || !state.saves) return false;
    const n = state.saves.length;
    state.saves = state.saves.filter(function (x) { return x.id !== id; });
    if (state.saves.length !== n) { save(true); return true; }
    return false;
  }

  function markSavedTaken() {   /* 导出存档码之后：唠叨计数清零 */
    if (!state) return;
    state.save = state.save || {};
    state.save.sinceTake = 0;
    state.save.lastTakeAt = Date.now();
    save(true);
  }

  function saveMeta() {
    const m = (state && state.save) || {};
    return {
      count: listSaves().length, lastAt: m.lastAt || 0,
      sinceTake: m.sinceTake || 0, lastTakeAt: m.lastTakeAt || 0
    };
  }

  /* ---------------- 导出 / 导入 ---------------- */
  function exportAll() {
    const clone = JSON.parse(JSON.stringify(state));
    return { exportedAt: nowISO(), state: clone };
  }

  function importAll(obj) {
    if (!obj || !obj.state) throw new Error('文件格式不对');
    backupCurrent();          /* 覆盖前留一手，导错了还能退回去 */
    replaceState(obj.state);
    migrate(state);
    save(true);
    return state;
  }

  /* ---------------- 离线时间推进 ---------------- */
  /* 返回本次结算摘要，供 UI 提示"你离开的这段时间发生了……" */
  function advanceOffline() {
    const D = window.GAME_DATA;
    const now = Date.now();
    const last = state.lastTick || now;
    let minutes = (now - last) / 60000;
    if (minutes < 0) minutes = 0;
    if (minutes > 60 * 24 * 30) minutes = 60 * 24 * 30; /* 上限 30 天 */
    const report = { minutes: Math.round(minutes), grown: [], hatched: [], sick: [], recovered: [] };

    /* 1. 孵化推进 —— 每次都要算（与界面上的进度条保持一致），不受"不足 1 分钟"影响 */
    state.capsules.forEach(function (c) {
      if (!c.place || !c.hatchStart) return;
      c.hatchProgress = Math.min(1, (now - c.hatchStart) / (c.hatchMinutes * 60000));
      if (c.hatchProgress >= 1 && !c.ready) {
        c.ready = true;
        report.hatched.push(c);
      }
    });

    if (minutes < 1) { state.lastTick = now; return report; }

    /* 2. 生物状态衰减 */
    state.pets.forEach(function (p) {
      let illnessHappened = false;
      ['water', 'nutri', 'clean'].forEach(function (k) {
        const before = p.stats[k];
        p.stats[k] = Math.max(0, before - D.DECAY_PER_MIN * minutes);
        if (p.stats[k] <= 0) {
          p.neglect[k] = (p.neglect[k] || 0) + minutes;
        } else {
          p.neglect[k] = 0;
        }
      });

      /* 生病判定：某项长期归零 */
      const worstNeglect = Math.max(p.neglect.water || 0, p.neglect.nutri || 0, p.neglect.clean || 0);
      if (!p.illness && worstNeglect > D.NEGLECT_MINUTES_BEFORE_SICK) {
        const hoursOver = (worstNeglect - D.NEGLECT_MINUTES_BEFORE_SICK) / 60;
        const chance = 1 - Math.pow(1 - D.SICK_CHANCE_PER_HOUR, hoursOver);
        if (Math.random() < chance) {
          p.illness = Game.rollIllness(p);
          p.illnessSince = now;
          illnessHappened = true;
          report.sick.push(p);
          pushLog('😷 ' + p.name + ' 生病了：' + p.illness.name);
        }
      }

      /* 生病期间：状态自然下滑，但不掉成长（不惩罚到清零） */
      if (p.illness) {
        p.stats.clean = Math.max(0, p.stats.clean - 0.4 * minutes / 60);
        /* 卧床超过 24 小时，成长停滞进入休眠（不会死亡/丢失） */
        if (now - p.illnessSince > 24 * 3600000) p.dormant = true;
      } else {
        p.dormant = false;
      }
      if (illnessHappened) state.stats.sickFreeDays = 0;
    });

    state.lastTick = now;
    save();
    return report;
  }

  /* ---------------- 每日重置 ---------------- */
  function resetDaily() {
    const t = today();
    if (state.study.tasksDate === t) return false;
    state.study.tasksDate = t;
    state.study.tasks = [];
    state.study.done = {};
    state.study.shards = {};
    state.study.kolbToday = { CE: 0, RO: 0, AC: 0, AE: 0 };
    state.study.kolbBonusDate = '';
    state.study.feedBonusDate = '';
    state.pets.forEach(function (p) { p.careToday = {}; });
    /* 连续天数统计 */
    if (state.stats.lastCheckin) {
      const gap = daysBetween(state.stats.lastCheckin, t);
      if (gap > 1) state.stats.streak = 0;
    }
    state.stats.daysPassed = planDay();
    save(true);
    return true;
  }

  function markCheckin() {
    const t = today();
    if (state.stats.lastCheckin !== t) {
      const gap = state.stats.lastCheckin ? daysBetween(state.stats.lastCheckin, t) : 999;
      state.stats.streak = (gap === 1) ? state.stats.streak + 1 : 1;
      state.stats.lastCheckin = t;
      state.stats.bestStreak = Math.max(state.stats.bestStreak, state.stats.streak);
      /* 零生病连续天数 */
      state.stats.sickFreeDays = (state.stats.sickFreeDays || 0) + 1;
      state.stats.noSickStreak = Math.max(state.stats.noSickStreak || 0, state.stats.sickFreeDays);
      save(true);
    }
  }

  return {
    get state() { return state; },
    load: load, save: save, reset: reset, hooks: hooks,
    today: today, dateKey: dateKey, dayStart: dayStart, daysBetween: daysBetween,
    daysLeft: daysLeft, planDay: planDay, currentPhase: currentPhase,
    pushLog: pushLog,
    addEvidence: addEvidence, getEvidenceBlob: getEvidenceBlob, removeEvidence: removeEvidence,
    exportAll: exportAll, importAll: importAll,
    makeSave: makeSave, listSaves: listSaves, loadSave: loadSave,
    removeSave: removeSave, markSavedTaken: markSavedTaken, saveMeta: saveMeta,
    backupCurrent: backupCurrent, backupInfo: backupInfo, restoreBackup: restoreBackup,
    advanceOffline: advanceOffline,
    resetDaily: resetDaily, markCheckin: markCheckin
  };
})();
