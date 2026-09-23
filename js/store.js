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
      cur: { tickets: 5, beans: 60, freeQuestions: 0, exp: 0, level: 1 },  /* 开局小礼包；照顾得经验、升级解锁道具 */
      profile: { nick: '', avatar: '' },   /* 「我的」页：昵称 + 头像（emoji） */
      bag: { water: 5, fert: 3, pest: 2, food: 5, soap: 2, music: 3, teaser: 3 },
      capsules: [],
      pets: [],
      slots: { pod: 8 },     /* v1.20：孵化仓只有一个托位池（老存档 greenhouse+hatchery 由 migrate 合并） */
      /* 大世界建筑系统（v1.18） */
      build: {
        built: [],         /* 已建成的建筑 id，按修建顺序 */
        under: {},        /* v1.21：建造中 { id:{startAt,finishAt,lvAfter,assign} } */
        story: {},         /* 已看过的剧情：{ labor:true, canteen:true, ... } */
        assign: {},        /* 修建时指派的三人：{ canteen:{a,p,f} }（宠物 id） */
        staff: {},         /* 建筑里安排的小生物：{ canteen:[petId,...] } */
        stock: {},         /* 物资：{ canteen:{water,food} } */
        day: {},           /* 当天已做过的事：{ 'canteen:work':'2026-09-14' } */
        lv: {},            /* 建筑等级：{ canteen:1 } */
        ops: {},           /* v1.27 运营中：{ canteen:{startAt,finishAt,guests,crew,cost,lv} } */
        logs: {},          /* v1.27 建筑小日志：{ canteen:[rec,...] }，每栋留最近 12 条 */
        trips: [],         /* 出游记录 */
        collection: []     /* 旅行带回来的收藏品 */
      },
      pity: 0,
      saves: [],                   /* 存档槽：每项是一枚可带走的快照（含存档码） */
      save: { lastAt: 0, sinceTake: 0, lastTakeAt: 0, autoCount: 0 },  /* 存档统计 + 唠叨计数 */
      masteredQuestions: {},  /* 已答对的题 id -> timestamp（= 错题列表里「已消掉」的名单）。v1.36 起挑战赛和破壳测验都写它；QBank.makePaper 默认排除，所以答对一次就不再出现。 */
      /* 挑战赛（v1.23）：date 变了就当天清零；best 是历史最高正确率（0~1） */
      challenge: { date: '', used: 0, plays: 0, wins: 0, best: 0, beans: 0 },
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
        quizAccum: {},       /* taskUid -> {q, correct} 刷题任务的累计进度 */
        interviewPractice: {}, /* date -> [qid...] 练习台面试每日记录 */
        scriptPractice: {}    /* date -> {read:[], recite:[]} 练习台导游词每日记录 */
      },
      stats: {
        totalPulls: 0, totalHatched: 0, uniqueSpecies: 0, legendOwned: 0,
        careCount: 0, healedCount: 0, adultCount: 0, eliteCount: 0,
        streak: 0, bestStreak: 0, lastCheckin: '',
        shards: 0, notes: 0, questions: 0, correct: 0,
        booksDone: 0, scriptsMastered: 0, feynmanCards: 0,
        mockCount: 0, fullFeedDays: 0,
        kolbFullDays: 0, daysPassed: 0, noSickStreak: 0, sickFreeDays: 0,
        /* v1.37：出工次数（打工/出团各算一次）与早鸟完成次数 —— 成就阶梯用。
           老存档由 migrate 的 stats 补全逻辑自动填 0，不用单独迁移。 */
        worksDone: 0, earlyFinishes: 0,
        evidenceCount: 0,
        quizAttempts: 0, quizPassed: 0, quizAnswered: 0, quizCorrect: 0
      },
      achievements: {},
      qbank: [],            /* 自己粘贴导入的破壳测验题（内置题库在 data.js 的 QUESTION_BANK） */
      qbankReports: {},     /* v1.28 题目举报：题号 -> {id, subject, stem, reason, note, at} */
      bookToc: {},          /* v1.28 自己填的书本信息：subjectId -> {pages, chapterCount, sectionCount, chapters?}
                               优先级高于 data.js 里的内置目录（见 D.bookMetaOf） */
      bookProgress: { /* subjectId -> 读到哪儿
                        v1.28 起是对象：{page, chapter, section, at, reads, hist:[{d,page,chapter,section}], done}
                        —— 进度 = 已读页 / 总页数（目录见 data.js 的 BOOKS）。
                        v1.26 及更早的存档里是纯数字（已读天数），继续按旧口径显示，不迁移；
                        等你下一次登记「读到哪」，它会自动变成对象、切到页码制。
                        唯一入口：data.js 的 bookProgressOf() 读、bookSetPos() 写。 */ },
      scripts: {},          /* scriptId -> {read, recite, mastered, lastAt} */
      myScripts: [],        /* v1.34 自己写的导游词：[{id, name, place, group, text, createdAt, updatedAt, at}]
                               内置 12 篇在 data.js 的 SCRIPTS 里（只读参考），这里是玩家自己的稿子。
                               唯一写入口：study.js 的 upsertMyScript()；读：myScripts / myScriptById()。 */
      feynman: [],          /* 费曼卡 */
      evidence: [],         /* 证据索引 */
      notes: [],            /* 我的笔记（文字内联；文件存 IndexedDB，索引在此） */
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
    /* v1.34：自己写的导游词。老存档没有这个字段 —— 补一个空数组就行，不迁移、不编造。 */
    if (!Array.isArray(s.myScripts)) s.myScripts = [];
    if (!s.study.quizAccum || typeof s.study.quizAccum !== 'object') s.study.quizAccum = {};
    if (s.study.dailyRewardDate === undefined) s.study.dailyRewardDate = '';
    if (!s.cur || typeof s.cur !== 'object') s.cur = {};
    if (s.cur.freeQuestions === undefined) s.cur.freeQuestions = 0;
    /* 老存档补照顾等级（经验 / 等级） */
    if (typeof s.cur.exp !== 'number') s.cur.exp = 0;
    if (typeof s.cur.level !== 'number') s.cur.level = 1;
    /* 老存档补小生物：第四状态条「娱乐」与保存舱标记 */
    /* v1.27：性格写进 pet.trait；老存档没有这个字段，由 data.js 的 traitOf()
       按 pet.id 稳定地推一个出来（同一只永远是同一个），所以这里不用硬补。 */
    if (Array.isArray(s.pets)) s.pets.forEach(function (p) {
      if (!p.stats) p.stats = {};
      if (typeof p.stats.fun !== 'number') p.stats.fun = 72;
      if (typeof p.stored !== 'boolean') p.stored = false;
      if (!p.neglect || typeof p.neglect !== 'object') p.neglect = { water: 0, nutri: 0, clean: 0 };
      /* v1.33：每只小生物自己的日志与性格印记分。
         老存档没有这两个字段 —— 就地补空壳，不迁移、不编造历史。
         日志条目本身是"往后发生的事"，从今天开始记就行。 */
      if (!Array.isArray(p.log)) p.log = [];
      if (!p.traitScore || typeof p.traitScore !== 'object' || Array.isArray(p.traitScore)) p.traitScore = {};
      if (typeof p.neglectDay !== 'string') p.neglectDay = '';
    });
    /* v1.25：池塘里的水栖生物永远不缺水 —— 打开存档就把它补满，
       不然要等下一次 tick（8 秒后）才回正，那几秒状态条会显示它在渴着。 */
    if (Array.isArray(s.pets) && window.GAME_DATA && typeof window.GAME_DATA.isWaterDweller === 'function') {
      s.pets.forEach(function (p) {
        if (!window.GAME_DATA.isWaterDweller(p.speciesId)) return;
        p.stats.water = 100;
        p.neglect.water = 0;
      });
    }
    /* 老存档补大世界建筑系统（v1.18）。
       built/story/assign/staff/stock/day/lv 是对象，trips/collection 是数组。 */
    if (!s.build || typeof s.build !== 'object') s.build = {};
    [['built', 'o'], ['under', 'o'], ['story', 'o'], ['assign', 'o'], ['staff', 'o'],
     ['stock', 'o'], ['day', 'o'], ['lv', 'o'], ['ops', 'o'], ['logs', 'o'],
     ['trips', 'a'], ['collection', 'a']].forEach(function (pair) {
      const k = pair[0], t = pair[1];
      if (s.build[k] === undefined || s.build[k] === null) s.build[k] = (t === 'a') ? [] : {};
      if (t === 'a' && !Array.isArray(s.build[k])) s.build[k] = [];
      if (t === 'o' && typeof s.build[k] !== 'object') s.build[k] = {};
    });
    /* v1.20：孵化仓托位合并成一个池（S.slots.pod），胶囊的 place 统一改成 'pod'。
       老存档里 greenhouse / hatchery 两个池的容量相加就是新池容量。 */
    if (!s.slots || typeof s.slots !== 'object') s.slots = {};
    if (typeof s.slots.pod !== 'number') {
      s.slots.pod = (Number(s.slots.greenhouse) || 0) + (Number(s.slots.hatchery) || 0);
    }
    if (!s.slots.pod) s.slots.pod = 8;
    if (Array.isArray(s.capsules)) {
      s.capsules.forEach(function (c) { if (c && c.place) c.place = 'pod'; });
    }
    /* v1.23：挑战赛的当日额度 */
    if (!s.challenge || typeof s.challenge !== 'object') s.challenge = {};
    const ch = s.challenge;
    if (typeof ch.date !== 'string') ch.date = '';
    if (typeof ch.used !== 'number') ch.used = 0;
    if (typeof ch.plays !== 'number') ch.plays = 0;
    if (typeof ch.wins !== 'number') ch.wins = 0;
    if (typeof ch.best !== 'number') ch.best = 0;
    if (typeof ch.beans !== 'number') ch.beans = 0;
    /* v1.28：题目举报（tí mù jǔ bào）——题号 -> {id, subject, stem, reason, note, at}
       题目内容不全 / 答案可疑的时候按一下，攒到「我的」页统一看，回头一起改。 */
    if (!s.qbankReports || typeof s.qbankReports !== 'object' || Array.isArray(s.qbankReports)) {
      s.qbankReports = {};
    }
    /* v1.28：自己填的书本信息（总页数 / 章数 / 节数） */
    if (!s.bookToc || typeof s.bookToc !== 'object' || Array.isArray(s.bookToc)) {
      s.bookToc = {};
    }
    /* v1.32：出工改成「每天一次」—— pet.workDay 记着最近一次出工的日子，
       和当天日期一致就是"今天已经出过工了"，第二天自动能再出工。
       旧存档是「歇 N 分钟」的计时制：还在休息的（restUntil 在未来）直接折成"今天已出工"，
       其余的 restUntil 一律清零，免得旧计时和新规则打架。 */
    const workDayNow = dateKey(new Date());
    if (Array.isArray(s.pets)) s.pets.forEach(function (p) {
      if (typeof p.restUntil !== 'number') p.restUntil = 0;
      if (typeof p.workDay !== 'string') p.workDay = '';
      if (p.restUntil > Date.now()) { p.workDay = workDayNow; p.restUntil = 0; }
    });
    /* v1.32：一只小生物同一时间只能在一个建筑上班。
       老存档 / 同步码里同一只被塞进多栋建筑的岗位名单时，只留最先遇到的那一处（v1.31 及之前的 bug）。 */
    if (s.build && s.build.staff && typeof s.build.staff === 'object' && !Array.isArray(s.build.staff)) {
      const seated = {};
      Object.keys(s.build.staff).forEach(function (k) {
        const arr = s.build.staff[k];
        if (!Array.isArray(arr)) { s.build.staff[k] = []; return; }
        s.build.staff[k] = arr.filter(function (pid) {
          if (!pid || seated[pid]) return false;
          seated[pid] = true;
          return true;
        });
      });
    }
    /* v1.28：安置区满了就自动进保管室 —— 不要求玩家手动挪。
       老存档 / 同步码带进来的小生物如果本来就超了（比如以前没有容量限制），
       在这里一次收干净：先来的留在场地，后来的自动进保管室。 */
    const autoStored = autoStoreOverflowIn(s);
    if (autoStored.length) {
      pushLog('📦 安置区住满了，' + autoStored.length + ' 只小生物（' +
        autoStored.slice(0, 3).join('、') + (autoStored.length > 3 ? ' 等' : '') +
        '）已自动住进保管室，想让它回场地的话在保管室里放出来就行。');
    }
  }

  /* 把超出区域容量的（最晚出生的）小生物收进保管室。返回被收起来的名字。
     不依赖 Game —— store.js 在 game.js 下层，只能读 data 层的 zone 规则。 */
  function autoStoreOverflowIn(s) {
    const Z = window.GAME_DATA;
    const names = [];
    if (!Z || typeof Z.zoneIdOfSpecies !== 'function' || !Array.isArray(s.pets)) return names;
    const zs = Z.ZONES || [];
    zs.forEach(function (z) {
      const cap = Z.zoneCapOf(z.id);
      if (!cap) return;                       /* 0 = 不限（草地这种敞开区域） */
      const living = s.pets.filter(function (p) {
        return !p.stored && Z.zoneIdOfSpecies(p.speciesId) === z.id;
      });
      if (living.length <= cap) return;
      living.sort(function (a, b) { return (a.bornAt || 0) - (b.bornAt || 0); });
      living.slice(cap).forEach(function (p) {
        p.stored = true;
        names.push(p.name || '小生物');
      });
    });
    return names;
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

  /* ---------------- 我的笔记（文字内联 + 文件存 IndexedDB） ---------------- */
  function addNote(opts) {
    /* opts: {title, kind:'text'|'file', text, blob, mime} */
    const id = 'nt_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const entry = {
      id: id,
      title: (opts.title || '未命名笔记').trim().slice(0, 60) || '未命名笔记',
      kind: opts.kind === 'file' ? 'file' : 'text',
      mime: opts.mime || (opts.blob && opts.blob.type) || '',
      sizeKB: opts.blob ? Math.round(opts.blob.size / 1024) : Math.round(((opts.text || '').length * 2) / 1024),
      text: opts.text || '',
      at: Date.now()
    };
    const p = opts.blob ? idbPut(id, opts.blob) : Promise.resolve(true);
    return p.then(function (ok) {
      entry.stored = ok ? 'idb' : (opts.blob ? 'none' : 'inline');
      state.notes.unshift(entry);
      state.stats.notes = (state.stats.notes || 0) + 1;
      save(true);
      return entry;
    });
  }

  function getNoteBlob(id) { return idbGet(id); }

  function removeNote(id) {
    return idbDel(id).then(function () {
      state.notes = state.notes.filter(function (n) { return n.id !== id; });
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
    const report = { minutes: Math.round(minutes), grown: [], hatched: [], sick: [], recovered: [], built: [], ops: [] };

    /* 1. 孵化推进 —— 每次都要算（与界面上的进度条保持一致），不受"不足 1 分钟"影响 */
    state.capsules.forEach(function (c) {
      if (!c.place || !c.hatchStart) return;
      c.hatchProgress = Math.min(1, (now - c.hatchStart) / (c.hatchMinutes * 60000));
      if (c.hatchProgress >= 1 && !c.ready) {
        c.ready = true;
        report.hatched.push(c);
      }
    });

    /* 1.5 离线期间 / 在线轮询到期的建筑建造 */
    if (state.build && state.build.under) {
      if (window.Game && window.Game.finishOfflineBuilds) {
        const done = window.Game.finishOfflineBuilds(now);
        if (done && done.length) report.built = (report.built || []).concat(done);
      } else {
        Object.keys(state.build.under).forEach(function (id) {
          const u = state.build.under[id];
          if (now >= u.finishAt) {
            if (!state.build.built) state.build.built = [];
            if (state.build.built.indexOf(id) < 0) state.build.built.push(id);
            state.build.lv[id] = u.lvAfter;
            state.build.assign[id] = u.assign;
            delete state.build.under[id];
          }
        });
      }
    }

    /* 1.6 离线期间 / 在线轮询到期的「营业」（食堂 / 澡堂 / 图书馆，v1.27）
          必须放在下面的 `minutes < 1` 早退之前——否则在线时倒计时归零也不结算，
          只能等下一次跨分钟，看着像"倒计时走完了却什么都没发生"。 */
    if (state.build && state.build.ops && window.Game && window.Game.finishOfflineOps) {
      const fin = window.Game.finishOfflineOps(now);
      if (fin && fin.length) report.ops = (report.ops || []).concat(fin);
    }
    /* v1.28：安置区满了就把超出的收进保管室（离线回来也算一遍，玩家不用手动挪） */
    if (window.Game && window.Game.autoStoreOverflow) {
      const st = window.Game.autoStoreOverflow();
      if (st && st.length) {
        report.stored = st.map(function (p) { return p.name; });
        pushLog('📦 安置区住满了，' + st.length + ' 只小生物已自动住进保管室：' +
          st.slice(0, 3).map(function (p) { return p.name; }).join('、') +
          (st.length > 3 ? ' 等' : ''));
      }
    }

    if (minutes < 1) { state.lastTick = now; return report; }

    /* 2. 生物状态衰减（保存舱里的不衰减、不生病，状态静止）
          水栖生物（海菜花 / 红瘰疣螈 / 云南闭壳龟 / 藻类）住在池塘里，
          v1.25 起永不缺水：水位恒满、不累积"欠照顾"时长，也就不会渴到生病。 */
    state.pets.forEach(function (p) {
      if (p.stored) return;
      const aqua = (typeof D.isWaterDweller === 'function') ? D.isWaterDweller(p.speciesId) : false;
      /* v1.27：性格决定掉得多快——慵懒的省心得多（0.72×），活泼的掉得快（1.15×） */
      const tr = (typeof D.traitOf === 'function') ? D.traitOf(p) : null;
      const decayMul = (tr && typeof tr.decay === 'number') ? tr.decay : 1;
      let illnessHappened = false;
      ['water', 'nutri', 'clean', 'fun'].forEach(function (k) {
        if (k === 'water' && aqua) {
          p.stats.water = 100;
          p.neglect.water = 0;
          return;
        }
        const before = p.stats[k];
        p.stats[k] = Math.max(0, before - D.DECAY_PER_MIN * minutes * decayMul);
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
          /* v1.33：生病也算它的经历，写进它自己的日志（并给一点「胆小」印记） */
          if (window.Game && window.Game.logPet) {
            const smark = window.Game.traitMark(p, 'sick');
            window.Game.logPet(p, {
              kind: 'sick', icon: '😷',
              text: '得了「' + p.illness.name + '」——有一项状态空了太久，身体扛不住了。',
              trait: smark ? { id: smark.id, name: smark.name, icon: smark.icon, d: smark.d, score: smark.score, gate: smark.gate } : null,
              shift: (smark && smark.shifted) ? { from: smark.fromName, to: smark.toName } : null
            });
          }
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
      /* v1.33：被冷落也留痕。条件是「某项状态空了 1 小时以上」，
         而且**每天最多记一条** —— 不设这个上限，日志会被刷成一堵墙。 */
      if (!p.illness && worstNeglect >= 60 && p.neglectDay !== today()) {
        p.neglectDay = today();
        if (window.Game && window.Game.logPet) {
          const nmark = window.Game.traitMark(p, 'neglect');
          window.Game.logPet(p, {
            kind: 'neglect', icon: '🕸️',
            text: '有一项状态空了 ' + Math.round(worstNeglect / 60) + ' 小时没人管，它有点蔫。',
            trait: nmark ? { id: nmark.id, name: nmark.name, icon: nmark.icon, d: nmark.d, score: nmark.score, gate: nmark.gate } : null,
            shift: (nmark && nmark.shifted) ? { from: nmark.fromName, to: nmark.toName } : null
          });
        }
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
    addNote: addNote, getNoteBlob: getNoteBlob, removeNote: removeNote,
    exportAll: exportAll, importAll: importAll,
    makeSave: makeSave, listSaves: listSaves, loadSave: loadSave,
    removeSave: removeSave, markSavedTaken: markSavedTaken, saveMeta: saveMeta,
    backupCurrent: backupCurrent, backupInfo: backupInfo, restoreBackup: restoreBackup,
    advanceOffline: advanceOffline,
    resetDaily: resetDaily, markCheckin: markCheckin
  };
})();
