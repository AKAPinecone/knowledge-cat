/* =========================================================
 * 知识喂了猫 · 核心玩法
 * 扭蛋 / 孵化 / 护理 / 生病 / 商店 / 成就
 * ========================================================= */
window.Game = (function () {
  const D = window.GAME_DATA;
  let S = null;

  const PET_NAME_A = ['小', '阿', '大', '老', '毛', '圆', '团', '球'];
  const PET_NAME_B = ['团', '豆', '芽', '毛', '茸', '铃', '果', '宝', '崽', '子', '卷', '兜'];

  function rand(n) { return Math.floor(Math.random() * n); }
  function pick(arr) { return arr[rand(arr.length)]; }

  function init() {
    S = window.Store.state;
    ensureTick();
  }

  function ensureTick() {
    if (!S.lastTick) S.lastTick = Date.now();
  }

  /* ---------------- 物种 ---------------- */
  function speciesById(id) {
    for (let i = 0; i < D.SPECIES.length; i++) if (D.SPECIES[i].id === id) return D.SPECIES[i];
    return D.SPECIES[0];
  }
  function homeOf(sp) {
    return (sp.kind === 'animal') ? 'hatchery' : 'greenhouse';
  }
  function homeName(kind) { return (kind === 'animal' || kind === 'hatchery') ? '孵化室' : '温室'; }
  /* 这只小生物现在住在地图的哪片区域（苗圃 / 温室 / 池塘 / 草地） */
  function zoneNameFor(sp) {
    let id = 'nursery';
    if (sp.water === true || sp.kind === 'algae') id = 'pond';
    else if (sp.kind === 'animal') id = 'meadow';
    else if (sp.kind === 'fungus') id = 'greenhouse';
    const zs = D.ZONES || [];
    for (let i = 0; i < zs.length; i++) if (zs[i].id === id) return zs[i].name;
    return '乐园';
  }

  /* ---------------- 扭蛋 ---------------- */
  function rollRarity() {
    S.pity = S.pity || 0;
    S.pity++;
    if (S.pity >= D.GACHA.pity + 1) { S.pity = 0; return Math.random() < 0.15 ? 3 : 2; }
    const r = Math.random() * 100;
    let rarity;
    if (r < D.GACHA.rarityRate[3]) rarity = 3;
    else if (r < D.GACHA.rarityRate[3] + D.GACHA.rarityRate[2]) rarity = 2;
    else rarity = 1;
    if (rarity >= 2) S.pity = 0;
    return rarity;
  }

  function pullOnce() {
    const rarity = rollRarity();
    const pool = D.SPECIES.filter(function (s) { return s.rarity === rarity && !s.legacy; });
    const sp = pick(pool);
    const c = {
      id: 'cap_' + Date.now() + '_' + rand(9999),
      speciesId: sp.id,
      rarity: rarity,
      bornAt: Date.now(),
      place: null,
      hatchStart: null,
      hatchProgress: 0,
      hatchMinutes: D.GACHA.hatchMinutes[rarity],
      ready: false
    };
    S.capsules.push(c);
    S.stats.totalPulls++;
    return c;
  }

  function pull(n) {
    n = n || 1;
    const cost = (n === 10) ? D.GACHA.costTenPull : D.GACHA.costPerPull * n;
    if (S.cur.tickets < cost) return { ok: false, msg: '胶囊券不够啦（需要 ' + cost + ' 张）' };
    S.cur.tickets -= cost;
    const got = [];
    for (let i = 0; i < n; i++) got.push(pullOnce());
    window.Store.save(true);
    checkAchievements();
    return { ok: true, capsules: got, cost: cost };
  }

  /* ---------------- 放槽与孵化 ----------------
   * 托位（孵化位）只数正在孵化的胶囊。破壳后的小生物住进乐园的
   * 空场 / 花盆圈，不再占用托位 —— 孵化位留给下一颗胶囊。 */
  /* v1.20：孵化仓不再分「温室托位 / 动物托位」，合并成一个托位池
     （S.slots.pod）。板块只按孵化进度分：孵化中 / 待破壳。 */
  function podCap() {
    if (!S.slots) S.slots = {};
    if (typeof S.slots.pod !== 'number') {
      S.slots.pod = (S.slots.greenhouse || 0) + (S.slots.hatchery || 0) || 8;
    }
    return S.slots.pod;
  }
  function usedSlots() {
    return { used: S.capsules.filter(function (c) { return c.place; }).length, cap: podCap() };
  }

  function placeCapsule(capId, kind) {
    const c = S.capsules.filter(function (x) { return x.id === capId; })[0];
    if (!c) return { ok: false, msg: '找不到这颗胶囊' };
    const u = usedSlots();
    if (u.used >= u.cap) return { ok: false, msg: '孵化仓的托位满了（' + u.used + '/' + u.cap + '），先扩展或腾位置' };
    c.place = 'pod';
    c.hatchStart = Date.now();
    c.hatchProgress = 0;
    c.ready = false;
    c.quizPassed = false;      /* 每次放进托位都重新来过测验 */
    c.quizResult = null;
    window.Store.save(true);
    return { ok: true, capsule: c };
  }

  function speedUp(capId) {
    const c = S.capsules.filter(function (x) { return x.id === capId; })[0];
    if (!c || !c.place) return { ok: false, msg: '这颗胶囊还没放进托位' };
    if (S.bag.hourglass === undefined) S.bag.hourglass = 0;
    if (S.bag.hourglass <= 0) return { ok: false, msg: '没有加速沙漏了，去商店买一个' };
    S.bag.hourglass--;
    c.hatchStart -= 30 * 60000;
    const p = Math.min(1, (Date.now() - c.hatchStart) / (c.hatchMinutes * 60000));
    c.hatchProgress = p;
    if (p >= 1) c.ready = true;
    window.Store.save(true);
    return { ok: true };
  }

  /* ---------------- 破壳测验闸门 ----------------
   * 小生物要从温室 / 孵化仓出来，先过 1 道题（v1.22 起不限时 / 70%）。
   * 题库是空的（端口已接、题还没来）→ 闸门自动放行，不挡路。 */
  function quizCfg() {
    return window.GAME_DATA.HATCH_QUIZ || { count: 1, minutes: 0, passRate: 0.7, minCount: 1, maxAttempts: 2 };
  }
  function quizAvailable() {
    return !!(window.QBank && window.QBank.count() > 0);
  }
  /* 这道闸门此刻要不要拦 */
  function quizGate(capId) {
    const c = S.capsules.filter(function (x) { return x.id === capId })[0];
    const cfg = quizCfg();
    const n = window.QBank ? window.QBank.count() : 0;
    const base = {
      on: false, passed: !!(c && c.quizPassed), bankCount: n,
      count: Math.min(cfg.count, n) || cfg.count,
      minutes: cfg.minutes,
      passRate: cfg.passRate
    };
    if (!c || !quizAvailable()) return base;
    base.on = true;
    base.passLine = window.QBank.passLine(base.count);
    return base;
  }
  /* 测验通过后写回胶囊；之后点破壳才放行 */
  function markQuizPassed(capId, result) {
    const c = S.capsules.filter(function (x) { return x.id === capId })[0];
    if (!c) return null;
    c.quizPassed = true;
    c.quizResult = {
      at: Date.now(),
      correct: result.correct, total: result.total, line: result.line,
      rate: result.rate
    };
    window.Store.save(true);
    return c;
  }

  function hatch(capId) {
    const c = S.capsules.filter(function (x) { return x.id === capId })[0];
    if (!c) return { ok: false, msg: '找不到胶囊' };
    if (!c.place) return { ok: false, msg: '先把它放进对应的托位' };
    const p = Math.min(1, (Date.now() - c.hatchStart) / (c.hatchMinutes * 60000));
    if (p < 1) return { ok: false, msg: '还没到破壳时间' };
    const gate = quizGate(capId);
    if (gate.on && !gate.passed) {
      return {
        ok: false, needQuiz: true,
        msg: '破壳前要先过一份 ' + gate.count + ' 题的小卷（' +
          (gate.minutes > 0 ? '限时 ' + gate.minutes + ' 分钟，' : '不限时，') +
          '至少答对 ' + gate.passLine + ' 题）'
      };
    }
    const sp = speciesById(c.speciesId);
    const name = pick(PET_NAME_A) + pick(PET_NAME_B);
    const pet = {
      id: 'pet_' + Date.now() + '_' + rand(9999),
      speciesId: sp.id,
      name: name,
      trait: (typeof D.rollTrait === 'function') ? D.rollTrait() : 'lively',  /* v1.27 性格 */
      bornAt: Date.now(),
      growth: 0,
      stats: { water: 72, nutri: 72, clean: 72, fun: 72 },
      illness: null,
      illnessSince: 0,
      dormant: false,
      neglect: { water: 0, nutri: 0, clean: 0 },
      lastCare: Date.now(),
      careToday: {},
      log: [],               /* v1.33：它自己的日志（每只一本，见 logPet） */
      traitScore: {},        /* v1.33：性格印记分（事件给性格加分，攒够换性格） */
      careCount: 0
    };
    S.pets.push(pet);
    /* v1.33：日志的第一条永远是出生，带着它的初始状态与脾气
       （这里不能借下面那行 `const tr`——它还没声明，用了会踩 TDZ） */
    const traitBorn = (typeof D.traitOf === 'function') ? D.traitOf(pet) : null;
    logPet(pet, {
      kind: 'birth',
      text: '破壳出生，成了一只' + sp.name + '。' +
        (traitBorn ? '天生一副「' + traitBorn.name + '」脾气。' : ''),
      deltas: ['water', 'nutri', 'clean', 'fun'].map(function (k) {
        return statSnap(k, 0, pet.stats[k]);
      })
    });
    /* v1.28：目标区域住满了就自动进保管室 —— 玩家不用手动挪位置。
       判定放在 push 之后：这时 pet 已经被算进区域人数，超了就是真的超了。 */
    let storedNow = false;
    const zid = zoneIdOf(pet);
    if (zoneFull(zid)) {
      pet.stored = true;
      storedNow = true;
    }
    S.capsules = S.capsules.filter(function (x) { return x.id !== capId; });
    S.stats.totalHatched++;
    const uniq = {};
    S.pets.forEach(function (x) { uniq[x.speciesId] = 1; });
    S.stats.uniqueSpecies = Object.keys(uniq).length;
    if (sp.rarity === 3) S.stats.legendOwned = (S.stats.legendOwned || 0) + 1;
    const tr = (typeof D.traitOf === 'function') ? D.traitOf(pet) : null;
    const zname = (zoneById(zid) || {}).name || '场地';
    window.Store.pushLog('🎉 ' + name + '（' + sp.name + '）破壳啦！' + (sp.rarity === 3 ? ' 这是传说级的生命！' : '') +
      (tr ? '　' + tr.emoji + ' 性格：' + tr.name : '') +
      (storedNow ? '　📦 ' + zname + '已经住满，它直接住进了保管室。' : ''));
    window.Store.save(true);
    checkAchievements();
    return {
      ok: true, pet: pet, species: sp, storedNow: storedNow, zone: zid, zoneName: zname,
      msg: storedNow
        ? '🎉 ' + name + '破壳啦！不过' + zname + '已经住满（' + zoneCap(zid) + ' 个位置），已经自动送进保管室。'
        : '🎉 ' + name + '破壳啦！'
    };
  }

  /* 注意：这里曾经有个 autoHatchReady() 会自动破壳。
     加了破壳测验之后它就是个「绕过闸门」的后门，已经删掉了。
     到点的胶囊只会被标记为 c.ready = true，破壳必须玩家自己来点。 */

  /* ---------------- 挑战赛（商店页 · 用错题换可可豆，v1.23） ----------------
     跟破壳测验共用同一个题库，但它不是关卡，是「你想练就练」：
     一局 10 题 / 5 分钟，正确率 80% 以上才结算可可豆。
     每天 4 局封顶 —— 不是限制学习，是不想让刷题变成刷豆，那会把别的玩法全饿死。
     答错不扣东西、不中断，只是没钱拿；练到就是赚到。 */
  function chalCfg() {
    return window.GAME_DATA.CHALLENGE ||
      { count: 10, minutes: 5, passRate: 0.8, dailyLimit: 3, beansPass: 50, beansPerfect: 50 };
  }
  /* 取今天的挑战赛记账（跨天自动清零） */
  function chalDay() {
    if (!S.challenge || typeof S.challenge !== 'object') S.challenge = {};
    const c = S.challenge;
    if (c.date !== todayKey()) {
      c.date = todayKey();
      c.used = 0;
    }
    if (typeof c.used !== 'number') c.used = 0;
    if (typeof c.plays !== 'number') c.plays = 0;
    if (typeof c.wins !== 'number') c.wins = 0;
    if (typeof c.best !== 'number') c.best = 0;
    if (typeof c.beans !== 'number') c.beans = 0;
    return c;
  }
  /* 今天还能打几局（dailyLimit 设 0 就是不限） */
  function chalLeft() {
    const cfg = chalCfg();
    if (!cfg.dailyLimit) return 99;
    return Math.max(0, cfg.dailyLimit - chalDay().used);
  }
  /* 商店页那块牌子要的全都在这儿（纯读，不改存档） */
  function chalStatus() {
    const cfg = chalCfg();
    const c = chalDay();
    return {
      left: chalLeft(),
      limit: cfg.dailyLimit || 0,
      plays: c.plays,
      wins: c.wins,
      best: Math.round(c.best * 100),
      beans: c.beans,
      count: cfg.count,
      minutes: cfg.minutes,
      passRate: cfg.passRate,
      beansPass: cfg.beansPass,
      beansPerfect: cfg.beansPerfect,
      bank: (window.QBank ? window.QBank.count() : 0),
      /* v1.36：还没消掉的错题数（答对一次就少一道）。界面拿它显示进度 */
      unresolved: (window.QBank && window.QBank.unresolved) ? window.QBank.unresolved().length : 0
    };
  }
  /* 开局前检查：题库够不够、今天还有没有额度 */
  function chalOpen() {
    const cfg = chalCfg();
    const n = window.QBank ? window.QBank.count() : 0;
    if (!n) return { ok: false, why: 'empty', msg: '题库还是空的，先去「我的 → 破壳题库」粘贴错题' };
    if (!chalLeft()) {
      return { ok: false, why: 'limit', msg: '今天的 ' + (cfg.dailyLimit) + ' 局打完了，明天再来' };
    }
    const want = Math.min(cfg.count, n);
    return { ok: true, count: want, minutes: cfg.minutes, passRate: cfg.passRate };
  }
  /* 结算：算豆、记账、写日志。res 来自 QBank.grade()，paper 是那一局的卷子 */
  function chalFinish(res, paper) {
    const cfg = chalCfg();
    const c = chalDay();
    const perfect = res.total > 0 && res.correct === res.total;
    const passed = res.total > 0 && res.correct / res.total >= cfg.passRate - 1e-9;
    let beans = 0;
    if (passed) {
      beans = cfg.beansPass + (perfect ? cfg.beansPerfect : 0);
      S.cur.beans += beans;
    }
    c.used += 1;
    c.plays += 1;
    if (passed) c.wins += 1;
    if (res.rate > c.best) c.best = res.rate;
    c.beans += beans;

    /* 学习量照样进统计 —— 挑战赛刷的题也是真刷的 */
    S.stats.quizAttempts = (S.stats.quizAttempts || 0) + 1;
    S.stats.quizAnswered = (S.stats.quizAnswered || 0) + res.total;
    S.stats.quizCorrect = (S.stats.quizCorrect || 0) + res.correct;
    if (passed) S.stats.quizPassed = (S.stats.quizPassed || 0) + 1;

    /* v1.36：挑战赛也走「答对一次就移出错题列表」这条统一规则。
       以前只有破壳测验会移出（而且只在整卷及格时才移），挑战答对了反而还躺在错题列表里。
       现在两处共用 QBank.applyResult：答对 → 移出；答错 → 放回卷子。 */
    const mastery = (window.QBank && window.QBank.applyResult)
      ? window.QBank.applyResult(paper, res) : { mastered: 0, revived: 0 };
    window.Store.pushLog('🏆 挑战赛 ' + res.correct + '/' + res.total +
      '（' + Math.round(res.rate * 100) + '%）' +
      (passed ? '，赢下 ' + beans + ' 可可豆。' : '，没到 ' + Math.round(cfg.passRate * 100) + '%，这次没有奖励。') +
      (mastery.mastered > 0 ? '　🎯 答对的 ' + mastery.mastered + ' 道已移出错题列表。' : ''));
    window.Store.save(true);
    checkAchievements();
    return {
      passed: passed, perfect: perfect, beans: beans,
      left: chalLeft(), best: Math.round(c.best * 100),
      mastery: mastery
    };
  }

  /* =========================================================
   * v1.33 小生物日志 + 性格印记
   * 每只小生物一本自己的日志，就存在它自己身上（pet.log）。
   * 别的宠物看不见、也改不动它 —— 天然互不干扰，跟着存档 / 同步码一起走。
   * ========================================================= */
  function twoDigit(n) { return (n < 10 ? '0' : '') + n; }
  function dayKeyAt(t) {
    const d = new Date(t);
    return d.getFullYear() + '-' + twoDigit(d.getMonth() + 1) + '-' + twoDigit(d.getDate());
  }
  function stampAt(t) {
    const d = new Date(t);
    return twoDigit(d.getMonth() + 1) + '-' + twoDigit(d.getDate()) + ' ' +
      twoDigit(d.getHours()) + ':' + twoDigit(d.getMinutes());
  }
  /* 这只小生物的日志本体（懒建，老存档不用迁移） */
  function petLogOf(pet) {
    if (!pet) return [];
    if (!Array.isArray(pet.log)) pet.log = [];
    return pet.log;
  }
  /* 写一条日志。rec: {t, kind, icon, text, deltas, grow, exp, trait, shift}
     只留最近 D.PET_LOG_MAX 条 —— 够回看它的日子，又不至于把存档撑爆。 */
  function logPet(pet, rec) {
    if (!pet || !rec) return null;
    const t = rec.t || Date.now();
    const kind = rec.kind || 'care';
    const km = D.LOG_KINDS[kind] || {};
    const entry = {
      t: t, day: dayKeyAt(t), at: stampAt(t),
      kind: kind, icon: rec.icon || km.icon || '📌', text: rec.text || ''
    };
    if (rec.deltas && rec.deltas.length) entry.deltas = rec.deltas;
    if (rec.grow && rec.grow.d) entry.grow = rec.grow;
    if (rec.exp) entry.exp = rec.exp;
    if (rec.trait) entry.trait = rec.trait;
    if (rec.shift) entry.shift = rec.shift;
    const arr = petLogOf(pet);
    arr.unshift(entry);
    const max = D.PET_LOG_MAX || 40;
    if (arr.length > max) arr.length = max;
    return entry;
  }
  /* 属性变化快照：before 用取操作前的原值，天然带"增减量" */
  function statSnap(stat, before, after) {
    const si = D.STAT_INFO[stat] || { label: stat, emoji: '•' };
    const b = Math.round(before), a = Math.round(after);
    return { stat: stat, label: si.label, icon: si.emoji, before: b, after: a, d: a - b };
  }

  /* ---- 性格印记：事件给性格加分，攒够就换性格（规则见 data.js 的 TRAIT_RULES） ---- */
  function traitScoreOf(pet) {
    if (!pet) return {};
    if (!pet.traitScore || typeof pet.traitScore !== 'object') pet.traitScore = {};
    return pet.traitScore;
  }
  /* 底层：直接给某个性格加分，顺带判定换不换脾气。
     返回 {id,name,icon,d,score,gate,shifted,from,to,fromName,toName} 或 null。
     v1.37 拆出这一层，是因为「随机经历」（D.TRAIT_EVENTS）自带 trait/delta，
     不需要在 TRAIT_RULES 里另开一条规则 —— 它直接调这里。 */
  function traitApply(pet, traitId, delta, icon) {
    if (!pet || !traitId) return null;
    const map = D.PERSONALITY_MAP || {};
    const cur = (typeof D.traitOf === 'function') ? D.traitOf(pet) : null;
    const curId = (cur && cur.id) || traitId;
    const sc = traitScoreOf(pet);
    sc[traitId] = (sc[traitId] || 0) + (delta || 1);
    const newScore = sc[traitId];
    const gate = D.TRAIT_SHIFT_GATE || 8;
    /* 谁分数最高（并列时当前性格优先，免得来回横跳） */
    let best = curId, bestScore = sc[curId] || 0;
    Object.keys(sc).forEach(function (k) {
      if (k === curId) return;
      if ((sc[k] || 0) > bestScore) { best = k; bestScore = sc[k] || 0; }
    });
    let shifted = false, from = null, to = null;
    if (best !== curId && bestScore - (sc[curId] || 0) >= gate) {
      shifted = true; from = curId; to = best;
      pet.trait = best;
      const keep = (typeof D.TRAIT_SHIFT_KEEP === 'number') ? D.TRAIT_SHIFT_KEEP : 0.5;
      Object.keys(sc).forEach(function (k) { sc[k] = Math.floor((sc[k] || 0) * keep); });
    }
    const em = (map[traitId] || {}).emoji || icon || '🎭';
    return {
      id: traitId,
      name: (map[traitId] || {}).name || traitId,
      icon: em, emoji: em,
      d: delta || 1, score: newScore, gate: gate,
      shifted: shifted, from: from, to: to,
      fromName: from ? ((map[from] || {}).name || from) : '',
      toName: to ? ((map[to] || {}).name || to) : ''
    };
  }
  /* 按 TRAIT_RULES 里的规则记一次性格印记 */
  function traitMark(pet, ruleId) {
    if (!pet || !ruleId) return null;
    const rule = (typeof D.traitRuleById === 'function') ? D.traitRuleById(ruleId) : null;
    if (!rule) return null;
    const m = traitApply(pet, rule.trait, rule.delta, rule.icon);
    if (m) m.rule = rule;
    return m;
  }
  /* 随机经历（v1.37）：它出门一趟回来，有概率撞上一件小事，写进它自己的日志并改脾气。
     每只每天最多 D.TRAIT_EVENT_MAX 件，免得日志被刷屏。
     whereId = 建筑 id（'canteen' / 'travel' …），决定能抽到哪些事。 */
  function traitEventFor(pet, whereId) {
    if (!pet) return null;
    if (typeof D.rollTraitEvent !== 'function') return null;
    const max = D.TRAIT_EVENT_MAX || 2;
    const day = dayKeyAt(Date.now());
    if (!pet.traitEventDay || pet.traitEventDay.day !== day) pet.traitEventDay = { day: day, n: 0 };
    if (pet.traitEventDay.n >= max) return null;
    const roll = D.rollTraitEvent(whereId);
    if (!roll || !roll.event) return null;
    const ev = roll.event;
    pet.traitEventDay.n++;
    const mark = traitApply(pet, ev.trait, ev.delta, ev.icon);
    logPet(pet, {
      kind: 'life',
      icon: ev.icon || '🎈',
      text: '出门一趟，' + (roll.text || '遇见了一点小事') + '',
      trait: traitSnap(mark),
      shift: (mark && mark.shifted) ? { from: mark.fromName, to: mark.toName } : null
    });
    return { ev: ev, text: roll.text, mark: mark };
  }
  /* 只给日志用的一份精简印记（不含规则对象，省地方） */
  function traitSnap(mark) {
    if (!mark) return null;
    return { id: mark.id, name: mark.name, icon: mark.icon, d: mark.d, score: mark.score, gate: mark.gate };
  }
  /* 性格倾向排行：界面上的"它正在变成什么脾气"（按分数从高到低，只留 >0 的） */
  function traitTendency(pet) {
    const sc = traitScoreOf(pet);
    const cur = (typeof D.traitOf === 'function') ? D.traitOf(pet) : null;
    const curId = cur ? cur.id : '';
    const map = D.PERSONALITY_MAP || {};
    return Object.keys(sc).filter(function (k) { return (sc[k] || 0) > 0; })
      .map(function (k) {
        const t = map[k] || {};
        return {
          id: k, name: t.name || k, emoji: t.emoji || '🎭', color: t.color || '#8AA394',
          score: sc[k] || 0, current: k === curId,
          /* 还差多少分能超过当前性格（当前性格自己显示为"正在成型"） */
          gap: k === curId ? 0 : Math.max(0, (sc[curId] || 0) + (D.TRAIT_SHIFT_GATE || 8) - (sc[k] || 0))
        };
      })
      .sort(function (a, b) { return b.score - a.score; });
  }

  /* ---------------- 护理 ---------------- */
  function stageOf(pet) {
    let st = D.STAGES[0];
    D.STAGES.forEach(function (s) { if (pet.growth >= s.min) st = s; });
    return st;
  }

  function careActionsFor(pet) {
    const sp = speciesById(pet.speciesId);
    if (sp.kind === 'animal') return ['drink', 'food', 'bath', 'teaser'];
    return ['water', 'fert', 'pest', 'music'];
  }

  /* 照顾等级：累计经验 -> 等级 */
  function levelOf(exp) {
    let lv = 1;
    for (let i = 0; i < D.LEVELS.length; i++) {
      if (exp >= D.LEVELS[i]) lv = i + 1;
    }
    return lv;
  }
  /* 升级里程碑奖励：少量可可比 + 券，维持商店经济（照顾本身不再掉豆）
     系数在 D.ECONOMY.level（v1.24 起集中管理，改平衡只动 data.js 那一张表）。 */
  function levelReward(lv) {
    const c = (D.ECONOMY && D.ECONOMY.level) || { base: 15, perLv: 5 };
    return { beans: c.base + lv * c.perLv, tickets: 1 + Math.floor(lv / 3) };
  }

  /* 这个动作现在能用到哪些道具（同类、分基础/高级）——界面据此渲染按钮，
     也是「高级道具有没有入口」的唯一真相来源。 */
  function careOptionsFor(pet, actionId) {
    const act = D.CARE[actionId];
    if (!act || !pet) return null;
    const sp = speciesById(pet.speciesId);
    const kind = sp.kind === 'animal' ? 'animal' : 'plantish';
    const split = (typeof D.careTierSplit === 'function')
      ? D.careTierSplit(kind, act.stat)
      : { base: (D.CARE_TIERS[act.stat] || []).slice(), adv: [], all: (D.CARE_TIERS[act.stat] || []).slice() };
    function pack(ids) {
      return ids.map(function (id) {
        const it = D.ITEM_MAP[id];
        if (!it) return null;
        return {
          id: id, name: it.name, emoji: it.emoji, own: S.bag[id] || 0,
          reqLevel: it.reqLevel || 0,
          unlocked: D.itemUnlocked ? D.itemUnlocked(id, S.cur.level) : true,
          boost: it.boost
        };
      }).filter(Boolean);
    }
    return { stat: act.stat, base: pack(split.base), adv: pack(split.adv), all: pack(split.all) };
  }

  function care(petId, actionId, opts) {
    opts = opts || {};
    const pet = S.pets.filter(function (p) { return p.id === petId })[0];
    if (!pet) return { ok: false, msg: '找不到这只小生物' };
    if (pet.illness) return { ok: false, msg: pet.name + '正在生病，先治病再护理吧' };
    const act = D.CARE[actionId];
    if (!act) return { ok: false, msg: '未知操作' };
    const allowed = careActionsFor(pet);
    if (allowed.indexOf(actionId) < 0) return { ok: false, msg: '它需要的不是这个' };
    /* 【v1.27】只在这一类小生物用得上的道具里挑：
       植物/真菌/藻类只消耗温室货，动物只消耗孵化仓货，不再互相串味。
       opts.prefer='adv' → 优先用高级道具；默认先用基础的，基础没了再动高级的。 */
    const sp = speciesById(pet.speciesId);
    const kind = sp.kind === 'animal' ? 'animal' : 'plantish';
    const opt = careOptionsFor(pet, actionId) || { base: [], adv: [], all: [] };
    let item = null;
    if (opts.item) {
      const hit = opt.all.filter(function (x) { return x.id === opts.item; })[0];
      if (!hit) return { ok: false, msg: '这件道具用不到这儿' };
      if (hit.own <= 0) return { ok: false, msg: hit.name + '用完了，去商店补货' };
      item = opts.item;
    } else {
      const order = (opts.prefer === 'adv')
        ? opt.adv.concat(opt.base)
        : opt.base.concat(opt.adv);
      for (let i = 0; i < order.length; i++) {
        if (order[i].own > 0) { item = order[i].id; break; }
      }
    }
    if (!item) {
      const advHint = opt.adv.length ? '（高级道具「' + opt.adv[0].name + '」也能用，去商店买）' : '';
      return { ok: false, msg: D.STAT_INFO[act.stat].label + '道具用完了，去商店补货' + advHint };
    }
    const it = D.ITEM_MAP[item];
    const boost = it.boost;
    const tr = (typeof D.traitOf === 'function') ? D.traitOf(pet) : null;
    const growAdd = Math.round(boost.grow * ((tr && tr.grow) || 1));
    const expAdd = Math.round(boost.exp * ((tr && tr.exp) || 1));
    const before = stageOf(pet);
    /* v1.33：护理前的原值，用于日志里的「变化前 → 变化后」 */
    const statBefore = pet.stats[act.stat] || 0;
    const growBefore = pet.growth;
    S.bag[item]--;
    pet.stats[act.stat] = Math.min(100, (pet.stats[act.stat] || 0) + boost.amount);
    pet.growth += growAdd;
    pet.lastCare = Date.now();
    pet.careCount++;
    pet.careToday[actionId] = (pet.careToday[actionId] || 0) + 1;

    /* 经验与升级（照顾不再给可可豆，改为涨经验） */
    const lvlBefore = S.cur.level;
    S.cur.exp += expAdd;
    S.stats.careCount++;
    const after = stageOf(pet);
    const si = D.STAT_INFO[act.stat];
    /* 反馈里点名用了哪件道具——高级道具被用掉时玩家能明确看见 */
    let msg = it.emoji + ' ' + it.name + ' · ' + act.label + '：' + pet.name +
      ' ' + si.label + ' +' + boost.amount + '，经验 +' + expAdd;
    if (after.key !== before.key) {
      const bonus = { baby: 0, teen: 15, adult: 40, elite: 80 }[after.key] || 0;
      S.cur.exp += bonus;
      if (after.key === 'adult') S.stats.adultCount++;
      if (after.key === 'elite') { S.stats.eliteCount++; S.stats.adultCount++; }
      msg += '　✨ ' + pet.name + ' 成长到「' + after.name + '」，额外经验 +' + bonus + '！';
      window.Store.pushLog('🌿 ' + pet.name + ' 成长为「' + after.name + '」。');
    }
    const lvlAfter = levelOf(S.cur.exp);
    if (lvlAfter > lvlBefore) {
      S.cur.level = lvlAfter;
      const rw = levelReward(lvlAfter);
      S.cur.beans += rw.beans;
      S.cur.tickets += rw.tickets;
      msg += '　🎖️ 升级到 Lv.' + lvlAfter + '！+' + rw.beans + ' 豆 +' + rw.tickets + ' 券';
      window.Store.pushLog('🎖️ 照顾等级提升到 Lv.' + lvlAfter + '，解锁了更多高级道具！');
    } else {
      S.cur.level = lvlAfter;
    }
    /* v1.33：记进**它自己的**日志。属性变化带前后值。
       v1.37：护理**不再**给性格印记 —— 你喂它不该把它喂成"嘴馋"，
       性格改由它自己参与的活动与经历驱动（见 TRAIT_RULES 的注释）。
       这里保留 mark = null，让日志结构与别处一致。 */
    const mark = null;
    logPet(pet, {
      kind: 'care',
      text: '你' + act.label + '，用了 1 个' + it.name + '。' + (tr && tr.lines ? tr.lines.care : ''),
      deltas: [statSnap(act.stat, statBefore, pet.stats[act.stat])],
      grow: { before: Math.round(growBefore), after: Math.round(pet.growth), d: growAdd },
      exp: expAdd,
      trait: traitSnap(mark),
      shift: (mark && mark.shifted) ? { from: mark.fromName, to: mark.toName } : null
    });
    if (after.key !== before.key) {
      logPet(pet, {
        kind: 'grow', icon: after.emoji || '🌱',
        text: '长大了，从「' + before.name + '」进入「' + after.name + '」。'
      });
    }
    window.Store.save();
    checkAchievements();
    return {
      ok: true, msg: msg, pet: pet, leveled: lvlAfter > lvlBefore,
      item: item, itemName: it.name, itemEmoji: it.emoji, isAdv: !!it.reqLevel,
      traitLine: tr && tr.lines ? tr.lines.care : '',
      traitShift: (mark && mark.shifted) ? mark : null
    };
  }

  /* ---------------- 一键照顾（v1.33） ----------------
     点一下，把四项状态一次抬到 75 以上。规矩：
       · 目标线 75：已经够高的状态**不碰**，不浪费道具；
       · 道具基础优先，基础不够就用高级的顶（同类里从便宜到贵）；
       · 【原子性】先把四笔账算完，任何一项凑不齐 → **一件道具都不动**，
         直接把缺口摊开告诉你缺什么。半途而废比失败更让人上头；
       · 花掉的每件道具照样给成长与经验（和手动护理同一把尺子），不白花。
     水栖生物的水位恒满，天然跳过（D.isWaterDweller）。
     oneKeyCare(petId, {dry:true}) 只算不执行 —— 界面靠它显示"要花多少"。 */
  const ONKEY_TARGET = 75;
  function oneKeyCare(petId, opts) {
    opts = opts || {};
    const pet = S.pets.filter(function (p) { return p.id === petId })[0];
    if (!pet) return { ok: false, msg: '找不到这只小生物' };
    if (pet.illness) return { ok: false, msg: pet.name + '正在生病，先治好它再照顾吧' };
    if (pet.stored) return { ok: false, msg: pet.name + '在保管室里，先把它取出来' };
    if (pet.dormant) return { ok: false, msg: pet.name + '正在休眠，先治好病它就会醒' };

    const virt = {};
    Object.keys(S.bag || {}).forEach(function (k) { virt[k] = S.bag[k] || 0; });
    const steps = [];    /* 每一项要用的道具 */
    const lack = [];     /* 凑不齐的项 */
    const fine = [];     /* 本来就够 75 的项 */
    careActionsFor(pet).forEach(function (actionId) {
      const act = D.CARE[actionId];
      if (!act) return;
      const stat = act.stat;
      const si = D.STAT_INFO[stat] || { label: stat, emoji: '•' };
      if (stat === 'water' && isAqua(pet)) return;      /* 池水常满，不用管 */
      const cur = pet.stats[stat] || 0;
      const gap = ONKEY_TARGET - cur;
      if (gap <= 0) { fine.push({ stat: stat, label: si.label, value: Math.round(cur) }); return; }
      const opt = careOptionsFor(pet, actionId) || { base: [], adv: [] };
      const order = (opt.base || []).concat(opt.adv || []);
      const used = [];
      let remain = gap;
      for (let i = 0; i < order.length && remain > 0; i++) {
        const it = order[i];
        const own = virt[it.id] || 0;
        const per = (it.boost && it.boost.amount) || 0;
        if (own <= 0 || per <= 0) continue;
        const take = Math.min(own, Math.ceil(remain / per));
        if (take <= 0) continue;
        virt[it.id] = own - take;
        remain -= take * per;
        used.push({ itemId: it.id, name: it.name, emoji: it.emoji, count: take, isAdv: !!it.reqLevel });
      }
      if (remain > 0) {
        lack.push({
          stat: stat, label: si.label, emoji: si.emoji,
          value: Math.round(cur), target: ONKEY_TARGET, short: Math.round(remain)
        });
        return;
      }
      const add = gap - remain;       /* 实际会涨多少（可能超出目标线） */
      steps.push({
        actionId: actionId, stat: stat, label: si.label, emoji: si.emoji,
        before: Math.round(cur), after: Math.round(Math.min(100, cur + add)),
        used: used
      });
    });

    /* 汇总要花什么（界面展示 + 提示语都用它） */
    const needMap = {};
    steps.forEach(function (s) {
      s.used.forEach(function (u) {
        if (!needMap[u.itemId]) needMap[u.itemId] = { itemId: u.itemId, name: u.name, emoji: u.emoji, count: 0, isAdv: u.isAdv };
        needMap[u.itemId].count += u.count;
      });
    });
    const needs = Object.keys(needMap).map(function (k) { return needMap[k]; });

    if (!steps.length) {
      /* 一件都做不了的时候，要分清是哪一种"做不了"：
         全项缺道具 → lack（界面提示"道具不够，补齐再点"）；
         全项都够高了 → full（"不用照顾"）。
         混成同一个 why，界面就会说谎。 */
      if (lack.length) {
        return {
          ok: false, why: 'lack', pet: pet, fine: fine, lack: lack, needs: [],
          msg: '道具不够：' + lack.map(function (x) {
            return x.emoji + x.label + '只有 ' + x.value + '，还差 ' + x.short + ' 点';
          }).join('；') + '。这一次什么都没用掉，放心去补货。'
        };
      }
      return {
        ok: false, why: 'full', pet: pet, fine: fine, lack: [], needs: [],
        msg: pet.name + '的状态都在 ' + ONKEY_TARGET + ' 以上，不用照顾啦'
      };
    }
    if (lack.length) {
      return {
        ok: false, why: 'lack', pet: pet, fine: fine, lack: lack, needs: needs, steps: steps,
        msg: '道具不够：' + lack.map(function (x) {
          return x.emoji + x.label + '只有 ' + x.value + '，还差 ' + x.short + ' 点';
        }).join('；') + '。这一次什么都没用掉，放心去补货。'
      };
    }
    if (opts.dry) {
      return { ok: true, dry: true, pet: pet, steps: steps, needs: needs, fine: fine, lack: [] };
    }

    /* ---- 全部凑齐：一次执行 ---- */
    const tr = (typeof D.traitOf === 'function') ? D.traitOf(pet) : null;
    const snaps = [];
    let growAdd = 0, expAdd = 0;
    steps.forEach(function (s) {
      let add = 0;
      s.used.forEach(function (u) {
        const it = D.ITEM_MAP[u.itemId] || {};
        const b = it.boost || {};
        S.bag[u.itemId] = Math.max(0, (S.bag[u.itemId] || 0) - u.count);
        const g = Math.round((b.grow || 0) * u.count * ((tr && tr.grow) || 1));
        const e = Math.round((b.exp || 0) * u.count * ((tr && tr.exp) || 1));
        pet.growth += g; growAdd += g; expAdd += e;
        add += (b.amount || 0) * u.count;
      });
      const before = pet.stats[s.stat] || 0;
      pet.stats[s.stat] = Math.min(100, before + add);
      snaps.push(statSnap(s.stat, before, pet.stats[s.stat]));
      pet.careToday[s.actionId] = (pet.careToday[s.actionId] || 0) + 1;
    });
    pet.careCount += steps.length;
    pet.lastCare = Date.now();
    S.stats.careCount += steps.length;

    const lvlBefore = S.cur.level;
    S.cur.exp += expAdd;
    const lvlAfter = levelOf(S.cur.exp);
    let lvlTxt = '';
    if (lvlAfter > lvlBefore) {
      S.cur.level = lvlAfter;
      const rw = levelReward(lvlAfter);
      S.cur.beans += rw.beans;
      S.cur.tickets += rw.tickets;
      lvlTxt = '　🎖️ 升级到 Lv.' + lvlAfter + '！+' + rw.beans + ' 豆 +' + rw.tickets + ' 券';
      window.Store.pushLog('🎖️ 照顾等级提升到 Lv.' + lvlAfter + '，解锁了更多高级道具！');
    } else {
      S.cur.level = lvlAfter;
    }

    /* v1.37：一键照顾跟单次护理一个口径 —— **不给**性格印记。
       你把它照顾得再好，也只是它过得好，不等于它变成了什么脾气。 */
    const mark = null;
    const useTxt = needs.map(function (n) { return n.emoji + n.name + '×' + n.count; }).join('、');
    logPet(pet, {
      kind: 'onekey',
      text: '你按下了「一键照顾」：' + useTxt + '，把' +
        snaps.map(function (x) { return x.label; }).join('、') + '一次提了上来。' +
        (tr && tr.lines ? tr.lines.care : ''),
      deltas: snaps,
      grow: growAdd ? { before: Math.round(pet.growth - growAdd), after: Math.round(pet.growth), d: growAdd } : null,
      exp: expAdd,
      trait: traitSnap(mark),
      shift: (mark && mark.shifted) ? { from: mark.fromName, to: mark.toName } : null
    });

    window.Store.save();
    checkAchievements();
    const msg = '✨ 一键照顾：用掉 ' + useTxt + '；' +
      snaps.map(function (x) { return x.icon + x.label + ' ' + x.before + '→' + x.after; }).join('，') +
      '（经验 +' + expAdd + '）' + lvlTxt;
    return {
      ok: true, pet: pet, steps: steps, needs: needs, deltas: snaps,
      grow: growAdd, exp: expAdd, msg: msg,
      traitShift: (mark && mark.shifted) ? mark : null
    };
  }

  /* ---------------- 保管室（保存舱） ----------------
     v1.20 起不限阶段：幼体也能放进去静静待着（状态依旧完全静止）。
     「成年体」的判定单独留在 isAdult()，别和能不能入库混在一起。 */
  function isAdult(pet) {
    const st = stageOf(pet);
    return st.key === 'adult' || st.key === 'elite';
  }
  /* 旧接口：语义已放宽成"任何小生物都能进保管室"，保留名字免得外部调用炸掉 */
  function canStore(pet) { return !!pet; }
  function storePet(petId) {
    const pet = S.pets.filter(function (p) { return p.id === petId })[0];
    if (!pet) return { ok: false, msg: '找不到这只小生物' };
    if (pet.stored) return { ok: false, msg: pet.name + '已经在保管室里了' };
    pet.stored = true;
    /* v1.33：进保管室也是它的经历 —— 记一条，并给它一点「静静待着」的慵懒印记 */
    const markStore = traitMark(pet, 'store');
    logPet(pet, {
      kind: 'store', text: '住进了保管室，安安静静地歇着（状态静止）。',
      trait: traitSnap(markStore),
      shift: (markStore && markStore.shifted) ? { from: markStore.fromName, to: markStore.toName } : null
    });
    window.Store.save(true);
    window.Store.pushLog('📦 ' + pet.name + ' 住进了保管室，状态已静止。');
    return { ok: true, pet: pet, msg: pet.name + ' 住进了保管室（' + stageOf(pet).name + '），状态已静止。' };
  }
  function unstorePet(petId) {
    const pet = S.pets.filter(function (p) { return p.id === petId })[0];
    if (!pet) return { ok: false, msg: '找不到这只小生物' };
    if (!pet.stored) return { ok: false, msg: pet.name + '不在保管室里' };
    pet.stored = false;
    pet.lastCare = Date.now();
    pet.illness = null;
    pet.illnessSince = 0;
    pet.dormant = false;
    logPet(pet, { kind: 'store', icon: '📭', text: '从保管室回到了场地，重新动起来了。' });
    window.Store.save(true);
    window.Store.pushLog('📭 ' + pet.name + ' 从保管室回到了场地。');
    return { ok: true, pet: pet };
  }

  /* ---------------- 送养（把不要的小生物托付出去，换回可可豆） ----------------
     为什么不叫「卖掉」：这些小家伙是玩家一口一口喂大的，明码标价地卖会让人不舒服，
     送养是同一件事，但心里顺得多——「它去了别的乐园，人家回一份谢礼」。
     代价照旧：送走就再也回不来，所以界面必须二次确认。
     谢礼 = 稀有度基数 × 阶段系数 + 成长值，越用心养大的越值钱。
     基数与阶段系数在 D.ECONOMY.adopt / adoptStageMul（v1.24 起集中管理）。 */
  const ADOPT_BASE = { 1: 18, 2: 45, 3: 110 };          /* 兜底：万一 ECONOMY 缺失 */
  const ADOPT_STAGE_MUL = { baby: 0.5, teen: 0.8, adult: 1.2, elite: 1.8 };
  function adoptValue(pet) {
    if (!pet) return 0;
    const eco = D.ECONOMY || {};
    const baseMap = eco.adopt || ADOPT_BASE;
    const mulMap = eco.adoptStageMul || ADOPT_STAGE_MUL;
    const sp = speciesById(pet.speciesId) || {};
    const base = baseMap[sp.rarity] || baseMap[1] || ADOPT_BASE[1];
    const st = stageOf(pet);
    const mul = mulMap[st.key] || 1;
    return Math.max(5, Math.round(base * mul + (pet.growth || 0) * 0.12));
  }
  function adoptPet(petId) {
    const pet = petById(petId);
    if (!pet) return { ok: false, msg: '找不到这只小生物' };
    if (pet.illness) {
      return { ok: false, msg: pet.name + '还在生病，先治好它再送养吧——到了新家也没人管它' };
    }
    const sp = speciesById(pet.speciesId);
    const beans = adoptValue(pet);
    const name = pet.name;
    /* 把它从各处摘干净：先下工，再出货。留在岗位上的幽灵 id 会让建筑面板打不开。 */
    ensureBuild();
    unstaffEverywhere(petId);
    const i = S.pets.indexOf(pet);
    if (i >= 0) S.pets.splice(i, 1);
    S.cur.beans += beans;
    window.Store.pushLog('🤝 ' + name + ' 被送养到了别的乐园，对方回赠 ' + beans + ' 可可豆。');
    window.Store.save(true);
    checkAchievements();
    return {
      ok: true, beans: beans, name: name, species: sp,
      msg: '🤝 ' + name + ' 有了新家，回赠你 ' + beans + ' 可可豆。'
    };
  }

  /* ---------------- 生病与治疗 ---------------- */
  function rollIllness(pet) {
    const sp = speciesById(pet.speciesId);
    let pool = D.ILLNESS.filter(function (il) { return il.kinds.indexOf(sp.kind) >= 0; });
    /* 根系萎蔫是兜底，概率压低 */
    const specific = pool.filter(function (il) { return il.kinds.length === 1; });
    if (specific.length && Math.random() < 0.75) pool = specific;
    const il = pick(pool);
    return { id: il.id, name: il.name, cure: il.cure, emoji: il.emoji };
  }

  function heal(petId, medId) {
    const pet = S.pets.filter(function (p) { return p.id === petId })[0];
    if (!pet || !pet.illness) return { ok: false, msg: '它没有生病' };
    const need = pet.illness.cure;
    const useKit = (medId === 'med_kit');
    if (!useKit && medId !== need) {
      return { ok: false, msg: '药不对症。它需要「' + D.ITEM_MAP[need].name + '」或「百宝药箱」' };
    }
    const chosen = useKit ? 'med_kit' : medId;
    if ((S.bag[chosen] || 0) <= 0) return { ok: false, msg: '没有' + D.ITEM_MAP[chosen].name + '了' };
    S.bag[chosen]--;
    const name = pet.illness.name;
    pet.illness = null;
    pet.illnessSince = 0;
    pet.dormant = false;
    const cleanBefore = pet.stats.clean || 0;
    pet.stats.clean = Math.min(100, pet.stats.clean + 20);
    S.stats.healedCount++;
    /* v1.33：治好了也记一笔（含清洁值的前后变化） */
    logPet(pet, {
      kind: 'heal', icon: D.ITEM_MAP[chosen].emoji || '💉',
      text: '你用' + D.ITEM_MAP[chosen].name + '治好了它的' + name + '。',
      deltas: [statSnap('clean', cleanBefore, pet.stats.clean)]
    });
    S.stats.sickFreeDays = 0;
    window.Store.pushLog('💚 ' + pet.name + ' 的' + name + '治好了。');
    window.Store.save(true);
    checkAchievements();
    return { ok: true, msg: '💚 ' + pet.name + ' 的' + name + '好了，它蹭了蹭你。' };
  }

  /* ---------------- 商店 ---------------- */
  function buy(itemId, qty) {
    qty = qty || 1;
    const it = D.ITEM_MAP[itemId];
    if (!it) return { ok: false, msg: '没有这个商品' };
    /* 等级解锁：不够等级买不了 */
    if (it.reqLevel && S.cur.level < it.reqLevel) {
      return { ok: false, msg: '「' + it.name + '」需要照顾等级 Lv.' + it.reqLevel + ' 才能购买（你现在是 Lv.' + S.cur.level + '）' };
    }
    /* 设施类比较特殊 */
    if (it.kind === 'facility') {
      if (itemId === 'slot_green' || itemId === 'slot_hatch') {
        /* v1.20：温室托位 / 孵化仓托位合并成一个托位池，两种扩展位都加在同一个池上 */
        const cap = podCap();
        if (cap >= 12) return { ok: false, msg: '已经扩到最大 12 个托位了' };
        if (S.cur.beans < it.price) return { ok: false, msg: '可可豆不够（需要 ' + it.price + '）' };
        S.cur.beans -= it.price;
        S.slots.pod = cap + 1;
        window.Store.save(true);
        return { ok: true, msg: '孵化仓托位扩展到 ' + S.slots.pod + ' 个' };
      }
      if (itemId === 'hourglass') {
        if (S.cur.beans < it.price * qty) return { ok: false, msg: '可可豆不够' };
        S.cur.beans -= it.price * qty;
        S.bag.hourglass = (S.bag.hourglass || 0) + qty;
        window.Store.save(true);
        return { ok: true, msg: '加速沙漏 ×' + qty };
      }
    }
    const cost = it.price * qty;
    if (S.cur.beans < cost) return { ok: false, msg: '可可豆不够（需要 ' + cost + '，你有 ' + Math.floor(S.cur.beans) + '）' };
    S.cur.beans -= cost;
    S.bag[itemId] = (S.bag[itemId] || 0) + qty;
    window.Store.save(true);
    return { ok: true, msg: it.emoji + ' ' + it.name + ' ×' + qty + '，花费 ' + cost + ' 可可豆' };
  }

  /* ---------------- 成就 ---------------- */
  function checkAchievements() {
    const got = [];
    D.ACHIEVEMENTS.forEach(function (a) {
      if (S.achievements[a.id]) return;
      let ok = false;
      try { ok = !!a.check(S); } catch (e) { ok = false; }
      if (ok) {
        S.achievements[a.id] = Date.now();
        S.cur.beans += a.reward.beans;
        S.cur.tickets += a.reward.tickets;
        got.push(a);
        window.Store.pushLog('🏆 成就达成：' + a.name + '（+' + a.reward.tickets + ' 券 / +' + a.reward.beans + ' 豆）');
      }
    });
    if (got.length) window.Store.save(true);
    return got;
  }

  function renamePet(petId, name) {
    const pet = S.pets.filter(function (p) { return p.id === petId })[0];
    if (!pet || !name) return null;
    const oldName = pet.name;
    pet.name = name.slice(0, 12);
    if (pet.name !== oldName) {
      logPet(pet, { kind: 'rename', text: '你把它改名叫「' + pet.name + '」（原来叫「' + oldName + '」）。' });
    }
    window.Store.save(true);
    return pet;
  }

  function moodOf(pet) {
    const avg = (pet.stats.water + pet.stats.nutri + pet.stats.clean + pet.stats.fun) / 4;
    if (pet.illness) return { text: '难受', emoji: '😷', color: '#D9534F' };
    if (pet.dormant) return { text: '休眠', emoji: '😴', color: '#8A8A8A' };
    if (avg >= 75) return { text: '开心', emoji: '😊', color: '#3FA96B' };
    if (avg >= 45) return { text: '还行', emoji: '🙂', color: '#7FB069' };
    if (avg >= 20) return { text: '蔫了', emoji: '😐', color: '#E9A13B' };
    return { text: '很虚弱', emoji: '😣', color: '#D9534F' };
  }

  /* =========================================================
   * v1.18 大世界：区域归位 / 修建 / 打工
   * ========================================================= */
  function ensureBuild() {
    if (!S.build || typeof S.build !== 'object') S.build = {};
    const b = S.build;
    if (!Array.isArray(b.built)) b.built = [];
    if (!Array.isArray(b.trips)) b.trips = [];
    if (!Array.isArray(b.collection)) b.collection = [];
    ['story', 'assign', 'staff', 'stock', 'day', 'lv'].forEach(function (k) {
      if (!b[k] || typeof b[k] !== 'object') b[k] = {};
    });
  }

  /* 小生物该待在哪片区域：
     species.water === true 的一律下水（海菜花 / 红瘰疣螈 / 云南闭壳龟 / 藻类），
     其余按 kind：动物→草地，真菌→温室，植物→苗圃。
     判定统一走 D.isWaterDweller（定义在 data 层），store.js 的衰减也用同一个函数 ——
     免得"住在池塘"和"不会缺水"哪天走岔了。 */
  function isAqua(pet) {
    return (typeof D.isWaterDweller === 'function') && D.isWaterDweller(pet.speciesId);
  }

  /* ---------- 出工与休息（v1.32：出工改成「每天一次」） ----------
     旧版是「干完活按孵化时长歇 N 分钟」；现在改成：出过工（打工 / 修建）之后，
     这只小生物当天就不能再出工了，第二天自动恢复——一只一天只出一趟工。
     标记写在 pet.workDay（当天日期字符串），比计时更好懂、也不会因为离线跨天出岔子。
     老存档里遗留的 restUntil（未来时间戳）当作"今天已出工"，由 Store.migrate 折平。 */
  function isWorkedToday(pet) {
    if (!pet) return false;
    if (pet.workDay === todayKey()) return true;
    return (pet.restUntil || 0) > Date.now();     /* 旧存档的计时残留，还认它 */
  }
  function isResting(pet) { return isWorkedToday(pet); }
  /* 到第二天 0 点刷新——离能再出工还有多久 */
  function restLeftMs() {
    const d = new Date();
    d.setHours(24, 0, 0, 0);
    return Math.max(0, d.getTime() - Date.now());
  }
  function restLeftMin() { return Math.max(1, Math.ceil(restLeftMs() / 60000)); }
  /* 让它开始休息（= 记下今天已经出过工了），返回离刷新还有多久 */
  function setRest(pet) {
    if (!pet) return 0;
    pet.workDay = todayKey();
    pet.restUntil = 0;
    return restLeftMs();
  }
  function restText(pet) {
    if (!isResting(pet)) return '';
    return '💤 今天已出过工 · 明天 0 点刷新';
  }
  /* 出工一趟涨多少成长值：基数在 D.ECONOMY.work.grow，乘上这趟活的效益系数 */
  function workGrowOf(boost) {
    const base = (typeof D.workGrowBase === 'function') ? D.workGrowBase() : 8;
    return Math.max(1, Math.round(base * (boost || 1)));
  }
  /* 一趟活的效益系数 = 出工那几只的稀有度系数的平均（1 / 1.3 / 1.7） */
  function workBoostOf(pets) {
    const list = (pets || []).filter(Boolean);
    if (!list.length) return 1;
    let sum = 0;
    list.forEach(function (p) {
      const sp = speciesById(p.speciesId) || {};
      sum += (typeof D.rarityWorkOf === 'function') ? D.rarityWorkOf(sp.rarity) : 1;
    });
    return sum / list.length;
  }
  /* 队里最稀有的那只（提示语点它的名） */
  function bestWorker(pets) {
    let best = null, bestR = 0;
    (pets || []).forEach(function (p) {
      if (!p) return;
      const sp = speciesById(p.speciesId) || {};
      if ((sp.rarity || 0) > bestR) { bestR = sp.rarity || 0; best = p; }
    });
    return best;
  }

  function zoneIdOf(pet) {
    /* 规则只有一份，在 data 层（store.js 也要用同一套，见 D.zoneIdOfSpecies） */
    if (typeof D.zoneIdOfSpecies === 'function') return D.zoneIdOfSpecies(pet.speciesId);
    const sp = speciesById(pet.speciesId);
    if (isAqua(pet)) return 'pond';
    if (sp.kind === 'animal') return 'meadow';
    if (sp.kind === 'fungus') return 'greenhouse';
    return 'nursery';
  }
  function zoneById(id) {
    const zs = D.ZONES || [];
    for (let i = 0; i < zs.length; i++) if (zs[i].id === id) return zs[i];
    return zs[0];
  }
  function petsInZone(id) {
    return S.pets.filter(function (p) { return !p.stored && zoneIdOf(p) === id; });
  }
  /* 这片区域住满了没有（草地这种 roam 区域永远没满） */
  function zoneCap(id) {
    return (typeof D.zoneCapOf === 'function') ? D.zoneCapOf(id) : 0;
  }
  function zoneFree(id) {
    const cap = zoneCap(id);
    if (!cap) return Infinity;
    return Math.max(0, cap - petsInZone(id).length);
  }
  function zoneFull(id) { return zoneFree(id) <= 0; }
  /* 场地住满了，把超出的（最晚出生的）收进保管室。返回被收起来的 pet 数组。
     v1.28：孵化、打开存档、离线结算都会调它 —— 玩家不用手动挪位置。 */
  function autoStoreOverflow() {
    const out = [];
    (D.ZONES || []).forEach(function (z) {
      const cap = zoneCap(z.id);
      if (!cap) return;
      const living = petsInZone(z.id);
      if (living.length <= cap) return;
      living.sort(function (a, b) { return (a.bornAt || 0) - (b.bornAt || 0); });
      living.slice(cap).forEach(function (p) { p.stored = true; out.push(p); });
    });
    return out;
  }

  /* ---------------- 修建 ---------------- */
  function buildingById(id) {
    const list = D.BUILDINGS || [];
    for (let i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }
  function isBuilt(id) { return (S.build.built || []).indexOf(id) >= 0; }
  function buildLv(id) { return (S.build.lv && S.build.lv[id]) || 0; }
  /* 容量：Lv.1 招 2 只，每扩一级 +1 */
  function staffCap(id) { return 1 + Math.max(1, buildLv(id)); }
  /* 还没修的第一栋（按顺序解锁） */
  function nextBuilding() {
    const list = D.BUILDINGS || [];
    for (let i = 0; i < list.length; i++) if (!isBuilt(list[i].id)) return list[i];
    return null;
  }
  /* 开工门槛：照顾等级 Lv.3+，且三类角色都有成年体（动物劳力 / 植物材料 / 真菌胶合料），
     并且成年体总数 ≥3。只有成年个体才能出工 / 打工。 */
  const BUILD_ROLES = [['animal', '劳力', '动物'], ['plant', '材料', '植物'], ['fungus', '胶合料', '真菌']];
  function buildGate() {
    if (S.cur.level < 3) {
      return { ok: false, why: 'level', msg: '照顾等级到 Lv.3 才能开工（现在是 Lv.' + S.cur.level + '）' };
    }
    if (adultCount() < 3) {
      return { ok: false, why: 'adults', msg: '需要至少 3 只成年体才能开工（现在有 ' + adultCount() + ' 只）' };
    }
    const miss = BUILD_ROLES.filter(function (r) { return workersOf(r[0]).length === 0; });
    if (miss.length) {
      return {
        ok: false, why: 'crew',
        msg: '还缺出' + miss.map(function (m) { return m[1]; }).join('、') + '的成年' +
          miss.map(function (m) { return m[2]; }).join('、') +
          '（只有成年个体能参与修建）'
      };
    }
    return { ok: true };
  }
  function adultPets() {
    return S.pets.filter(function (p) { return isAdult(p); });
  }
  function adultCount() { return adultPets().length; }
  /* 最年长的成年体（同伴里说话最有分量的那只）：Lv.3 剧情优先由它开口 */
  function oldestAdult() {
    const arr = adultPets().slice().sort(function (a, b) { return (a.bornAt || 0) - (b.bornAt || 0); });
    return arr[0] || null;
  }
  /* 剧情发起人：优先成年体里最年长的；一只成年体都没有时，退回全体里最年长的
     （否则 Lv.3 剧情会因为没有成年体而永远开不了口） */
  function elderPet() {
    const a = oldestAdult();
    if (a) return a;
    const arr = S.pets.slice().sort(function (x, y) { return (x.bornAt || 0) - (y.bornAt || 0); });
    return arr[0] || null;
  }
  /* 某类 kind 里能干活的小生物：只有成年体才能出工 */
  function workersOf(kind) {
    return S.pets.filter(function (p) {
      if (p.stored) return false;
      if (!isAdult(p)) return false;
      return speciesById(p.speciesId).kind === kind;
    });
  }
  /* 建设/扩建的花费：材料（需求值）与人手，扩建更贵 */
  function buildCost(id) {
    const up = isBuilt(id);
    const lv = buildLv(id) || 1;
    return {
      upgrade: up,
      need: up ? Math.round(D.BUILD_RULE.buildNeed * 1.4) : D.BUILD_RULE.buildNeed,
      beans: up ? 60 * lv : 0
    };
  }

  /* v1.21 建筑建造时长：目标等级越高，耗时越长。
     公式：目标等级 Lv.N 需要 N × 15 分钟（Lv.1 = 15 分钟，Lv.2 = 30 分钟……）
     v1.28：出工那三只越稀有干得越快（按三人平均的稀有度系数缩短，最快六折） */
  function buildDurationMs(id, crew) {
    const targetLv = (buildLv(id) || 0) + 1;
    const base = targetLv * 15 * 60000;
    const boost = crew ? workBoostOf(crew) : 1;
    return Math.max(Math.round(base * 0.6), Math.round(base / boost));
  }
  function underConstruction(id) {
    return !!(S.build.under && S.build.under[id] && S.build.under[id].finishAt > Date.now());
  }
  function buildProgress(id) {
    const u = S.build.under && S.build.under[id];
    if (!u) return { on: false, p: 0, remain: 0 };
    const now = Date.now();
    if (now >= u.finishAt) return { on: false, p: 1, remain: 0 };
    const p = Math.min(1, (now - u.startAt) / (u.finishAt - u.startAt));
    return { on: true, p: p, remain: u.finishAt - now };
  }
  /* 完成所有到期的建造（含离线回来） */
  function finishOfflineBuilds(now) {
    if (!S.build || !S.build.under) return [];
    const finished = [];
    now = now || Date.now();
    Object.keys(S.build.under).forEach(function (id) {
      const u = S.build.under[id];
      if (now >= u.finishAt) {
        if (!isBuilt(id)) S.build.built.push(id);
        S.build.lv[id] = u.lvAfter;
        S.build.assign[id] = u.assign;
        delete S.build.under[id];
        S.cur.exp += D.BUILD_RULE.buildExp;
        const lvlBefore = S.cur.level;
        S.cur.level = levelOf(S.cur.exp);
        const b = buildingById(id);
        let msg = (u.lvAfter > 1
          ? '🔨 ' + (b ? b.name : id) + ' 扩建到 Lv.' + u.lvAfter
          : '🎉 ' + (b ? b.name : id) + ' 建好了！' + (b ? b.emoji : ''));
        if (S.cur.level > lvlBefore) {
          const rw = levelReward(S.cur.level);
          S.cur.beans += rw.beans;
          S.cur.tickets += rw.tickets;
          msg += '　🎖️ 升级到 Lv.' + S.cur.level + '！+' + rw.beans + ' 豆 +' + rw.tickets + ' 券';
        }
        /* v1.32：参与修建的三只也长本事（和打工同一个成长基数 × 各自的效益系数） */
        const crewMembers = ['animal', 'plant', 'fungus'].map(function (k) {
          return petById((u.assign || {})[k]);
        }).filter(Boolean);
        if (crewMembers.length) {
          const g = workGrowOf(workBoostOf(crewMembers));
          crewMembers.forEach(function (p) { p.growth += g; });
          msg += '　🌱 出工的 ' + crewMembers.length + ' 只各涨成长 +' + g;
          /* v1.34：修建落成也进各自日志（谁出了力、涨了多少都留痕） */
          crewMembers.forEach(function (p) {
            logPet(p, {
              kind: 'grow',
              icon: '🏗️',
              text: '在' + (b ? b.name : id) + '出了力，' + (u.lvAfter > 1 ? '扩建到 Lv.' + u.lvAfter : '把它盖好了') + '。',
              grow: { before: Math.round(p.growth - g), after: Math.round(p.growth), d: g }
            });
          });
        }
        window.Store.pushLog('🏗️ ' + msg);
        finished.push({ id: id, name: b ? b.name : id, msg: msg });
      }
    });
    if (finished.length) {
      window.Store.save(true);
      checkAchievements();
    }
    return finished;
  }

  function buildStart(id, assign) {
    ensureBuild();
    const b = buildingById(id);
    if (!b) return { ok: false, msg: '没有这栋建筑' };
    const gate = buildGate();
    if (!gate.ok) return { ok: false, msg: gate.msg };
    /* 顺序解锁：前面没建好，后面盖不了 */
    const list = D.BUILDINGS;
    for (let i = 0; i < list.length; i++) {
      if (list[i].id === id) break;
      if (!isBuilt(list[i].id)) return { ok: false, msg: '按顺序来：先修好「' + list[i].name + '」' };
    }
    if (S.build.under && S.build.under[id]) return { ok: false, msg: b.name + '已经在建造中了' };
    assign = assign || {};
    const roles = BUILD_ROLES;
    const crew = {};
    for (let i = 0; i < roles.length; i++) {
      const kind = roles[i][0], label = roles[i][1];
      const pid = assign[kind];
      const pet = pid ? S.pets.filter(function (p) { return p.id === pid; })[0] : null;
      if (!pet) return { ok: false, msg: '还没选好出' + label + '的小生物' };
      if (speciesById(pet.speciesId).kind !== kind) return { ok: false, msg: '出' + label + '的那只不合适' };
      if (pet.stored || pet.illness) return { ok: false, msg: pet.name + '现在没法出力' };
      if (!isAdult(pet)) return { ok: false, msg: pet.name + '还没成年，不能参与修建' };
      if (isWorkedToday(pet)) return { ok: false, msg: pet.name + '今天已经出过工了，换一只（一只小生物每天只出一趟工，明天刷新）' };
      crew[kind] = pet;
    }
    const cost = buildCost(id);
    if (cost.beans && S.cur.beans < cost.beans) return { ok: false, msg: '可可豆不够（需要 ' + cost.beans + '）' };
    if (cost.beans) S.cur.beans -= cost.beans;
    /* 三位参与者出工：需求值下降（池塘里干活的，缺水的账不算在它头上） */
    Object.keys(crew).forEach(function (k) {
      const p = crew[k];
      const aqua = isAqua(p);
      ['water', 'nutri', 'clean', 'fun'].forEach(function (s) {
        if (s === 'water' && aqua) return;
        p.stats[s] = Math.max(0, p.stats[s] - cost.need);
      });
    });
    const targetLv = (buildLv(id) || 0) + 1;
    const crewList = [crew.animal, crew.plant, crew.fungus];
    const duration = buildDurationMs(id, crewList);
    /* v1.32：出工即算「今天已经出过工了」——修完之后也不能再去打工，第二天自动刷新 */
    let restMin = 0;
    crewList.forEach(function (p) {
      const ms = setRest(p);
      restMin = Math.max(restMin, Math.round(ms / 60000));
    });
    if (!S.build.under) S.build.under = {};
    S.build.under[id] = {
      startAt: Date.now(),
      finishAt: Date.now() + duration,
      lvAfter: targetLv,
      assign: { animal: crew.animal.id, plant: crew.plant.id, fungus: crew.fungus.id }
    };
    const minutes = Math.round(duration / 60000);
    const bw = bestWorker(crewList);
    window.Store.pushLog('🏗️ ' + b.name + ' 开工了！预计 ' + minutes + ' 分钟后建成。' +
      (bw && speciesById(bw.speciesId).rarity > 1 ? '（' + bw.name + '出力，进度更快）' : ''));
    window.Store.save(true);
    return {
      ok: true,
      msg: b.name + ' 开始建造，预计 ' + minutes + ' 分钟后完工（出工的三只今天不能再出工，明天刷新）',
      minutes: minutes, restMin: restMin
    };
  }

  /* ---------------- 剧情 ---------------- */
  function storySeen(k) { return !!(S.build.story && S.build.story[k]); }
  function markStory(k) {
    ensureBuild();
    S.build.story[k] = true;
    window.Store.save(true);
    return true;
  }
  /* 照顾等级到 Lv.3 且成年体 ≥3 时，最年长的成年体发起劳动剧情 */
  function laborReady() {
    return !storySeen('labor') && S.cur.level >= 3 && adultCount() >= 3;
  }
  /* 该看哪段剧情：labor 优先，然后是「已解锁但还没看」的下一栋 */
  function pendingStory() {
    if (laborReady()) return 'labor';
    const nb = nextBuilding();
    if (!nb) return null;
    if (storySeen(nb.story)) return null;
    return nb.story;
  }

  /* ---------------- 安排小生物上班 ---------------- */
  function staffOf(id) {
    const arr = (S.build.staff && S.build.staff[id]) || [];
    return arr.filter(function (pid) {
      return S.pets.some(function (p) { return p.id === pid; });
    });
  }
  /* 它现在在哪个建筑上班？（v1.32：一只小生物同一时间只能占一个岗位） */
  function workplaceOf(petId) {
    const st = S.build && S.build.staff;
    if (!st || !petId) return null;
    const ids = Object.keys(st);
    for (let i = 0; i < ids.length; i++) {
      if ((st[ids[i]] || []).indexOf(petId) >= 0) {
        return buildingById(ids[i]) || { id: ids[i], name: ids[i] };
      }
    }
    return null;
  }
  /* 把某只小生物从所有岗位名单里摘干净（同一只正常只在一处，这里兜底全扫一遍） */
  function unstaffEverywhere(petId) {
    const st = S.build && S.build.staff;
    if (!st || !petId) return [];
    const from = [];
    Object.keys(st).forEach(function (k) {
      const arr = st[k] || [];
      let i = arr.indexOf(petId);
      while (i >= 0) {
        arr.splice(i, 1);
        const b = buildingById(k);
        const nm = b ? b.name : k;
        if (from.indexOf(nm) < 0) from.push(nm);
        i = arr.indexOf(petId);
      }
    });
    return from;
  }
  function addStaff(id, petId) {
    ensureBuild();
    if (!isBuilt(id)) return { ok: false, msg: '这栋还没建好' };
    const pet = petById(petId);
    if (!pet) return { ok: false, msg: '找不到这只小生物' };
    const arr = S.build.staff[id] || (S.build.staff[id] = []);
    if (arr.indexOf(petId) >= 0) return { ok: false, msg: '它已经在这儿上班了' };
    if (pet.stored) return { ok: false, msg: pet.name + '还在保管室里，先取出来' };
    if (pet.illness) return { ok: false, msg: pet.name + '正在生病，先治好' };
    if (!isAdult(pet)) return { ok: false, msg: pet.name + '还没成年，不能来打工' };
    if (isWorkedToday(pet)) return { ok: false, msg: pet.name + '今天已经出过工了，明天再来（一只小生物每天只出一趟工）' };
    /* 容量判在摘旧岗之前：万一这边满了，也不会让它把原来的班上丢 */
    if (arr.length >= staffCap(id)) return { ok: false, msg: '位置满了（' + arr.length + '/' + staffCap(id) + '），扩建能多招几员' };
    /* v1.32：它要是在别的建筑上着班，就从那边撤下来 —— 同一时间只占一个岗位 */
    const fromName = unstaffEverywhere(petId)[0] || '';
    arr.push(petId);
    window.Store.save(true);
    return {
      ok: true,
      msg: '👜 ' + pet.name + (fromName ? '从' + fromName + '转到' + buildingById(id).name : '来' + buildingById(id).name) + '上班了。'
    };
  }
  function removeStaff(id, petId) {
    ensureBuild();
    const arr = S.build.staff[id] || [];
    const i = arr.indexOf(petId);
    if (i < 0) return { ok: false, msg: '它不在这儿' };
    arr.splice(i, 1);
    window.Store.save(true);
    return { ok: true, msg: '已放它回去休息。' };
  }

  function todayKey() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function doneToday(key) { return (S.build.day || {})[key] === todayKey(); }
  function markDone(key) { S.build.day[key] = todayKey(); }
  function petById(id) { return S.pets.filter(function (p) { return p.id === id; })[0] || null; }

  /* ================= 运营建筑：倒计时制（v1.27） =================
     食堂 / 澡堂 / 图书馆不再「点一下当天就没了」，改成一次真正的营业：
       ① 开工   消耗指定物资（按客人数算）+ 在岗小生物的劳力（需求值下降）
       ② 倒计时 这段时间内建筑是「营业中」，开不了第二轮
       ③ 收工   产出照旧，并给**前来光顾**的小生物提供对应服务
                 （食堂管饱、澡堂管干净、图书馆管心情），再留一份小日志
     客人不是随便抓的：性格决定它爱不爱来（D.PERSONALITIES.like），
     缺哪样就更想去哪儿（cfg.want），所以嘴馋的闻着味就来、胆小的十次才来一次。
     日志记着「谁来了 / 干了什么 / 状态变了多少」，小概率还会出意外（负效果）。 */
  function opCfg(id) { return (D.OPS || {})[id] || null; }
  function ensureOps() {
    ensureBuild();
    if (!S.build.ops || typeof S.build.ops !== 'object') S.build.ops = {};
    if (!S.build.logs || typeof S.build.logs !== 'object') S.build.logs = {};
  }
  function opOf(id) { ensureOps(); return S.build.ops[id] || null; }
  /* 面板要的状态：idle / running + 进度 + 还剩几分钟 */
  function opStatus(id) {
    const cfg = opCfg(id);
    if (!cfg) return { on: false, idle: true, cfg: null, guests: 0 };
    const st = opOf(id);
    if (!st) return { on: false, idle: true, cfg: cfg, guests: opGuestCap(id) };
    const now = Date.now();
    const total = Math.max(1, st.finishAt - st.startAt);
    return {
      on: true, idle: false, cfg: cfg, st: st,
      p: Math.max(0, Math.min(1, (now - st.startAt) / total)),
      remain: Math.max(0, st.finishAt - now),
      minutes: Math.max(1, Math.ceil((st.finishAt - now) / 60000)),
      guests: (st.guests || []).length
    };
  }
  function opGuestCap(id) {
    const cfg = opCfg(id);
    if (!cfg) return 0;
    /* 出团没有"客人"概念（是导游带同伴走），guest 恒为 0。
       注意不能用 `cfg.guestsBase || 2` —— 0 是假值会被顶成 2。 */
    if (cfg.kind === 'travel') return 0;
    const base = (typeof cfg.guestsBase === 'number') ? cfg.guestsBase : 2;
    const per = (typeof cfg.guestsPerLv === 'number') ? cfg.guestsPerLv : 1;
    return base + buildLv(id) * per;
  }
  /* 谁来光顾：性格权重 × 有多想要 × 一点随机 */
  function opPickGuests(id, n) {
    const cfg = opCfg(id);
    const staff = staffOf(id);
    const pool = S.pets.filter(function (p) {
      return !p.stored && !p.illness && staff.indexOf(p.id) < 0;
    });
    const scored = pool.map(function (p) {
      const t = D.traitOf(p);
      const like = (t.like && t.like[id]) || 1;
      const lack = cfg.want ? (100 - (p.stats[cfg.want] || 0)) / 100 : 0.5;
      return { p: p, w: (t.visitMul || 1) * like * (0.55 + lack * 0.9) * (0.6 + Math.random() * 0.8) };
    });
    scored.sort(function (a, b) { return b.w - a.w; });
    return scored.slice(0, n).map(function (x) { return x.p; });
  }
  /* 开工 */
  function opStart(id) {
    ensureOps();
    const cfg = opCfg(id);
    if (!cfg) return { ok: false, msg: '这栋不是运营建筑' };
    /* v1.37：旅行社也并进了这套倒计时容器 —— 出团不再是"点一下立刻到账"，
       它有 2 小时倒计时，收工才结算（走 travelFinish）。 */
    if (cfg.kind === 'travel') return travelStart(id);
    if (!isBuilt(id)) return { ok: false, msg: '这栋还没建好' };
    const b = buildingById(id);
    if (opOf(id)) return { ok: false, msg: b.name + '正在营业，等这一轮收工' };
    const lv = buildLv(id);
    const staff = staffOf(id);
    if (staff.length < (cfg.labor || 1)) {
      return { ok: false, msg: b.name + '至少要有 ' + (cfg.labor || 1) + ' 位小生物在岗出力' };
    }
    /* v1.32：今天已经出过工的（含刚收工下班的）不能连着上班，等明天刷新 */
    const ready = staff.filter(function (pid) { const p = petById(pid); return p && !isWorkedToday(p); });
    if (ready.length < (cfg.labor || 1)) {
      const tired = staff.filter(function (pid) { const p = petById(pid); return p && isWorkedToday(p); });
      const tn = tired.map(function (pid) { const p = petById(pid); return p.name; });
      return {
        ok: false,
        msg: b.name + '人手不够：' + (tn.length ? tn.join('、') + '今天已经出过工了。' : '在岗的都不在状态。') +
          '明天刷新、或者再安排一只上岗。'
      };
    }
    const guests = opPickGuests(id, opGuestCap(id));
    if (!guests.length) return { ok: false, msg: '没人来光顾——大家不是在睡觉就是在生病' };
    /* ① 物资：按客人数算 */
    const need = {};
    Object.keys(cfg.costPerGuest || {}).forEach(function (k) {
      need[k] = (cfg.costPerGuest[k] || 0) * guests.length;
    });
    const lack = [];
    Object.keys(need).forEach(function (k) {
      if ((S.bag[k] || 0) < need[k]) {
        lack.push((D.ITEM_MAP[k] ? D.ITEM_MAP[k].name : k) + ' ×' + need[k] + '（现有 ' + (S.bag[k] || 0) + '）');
      }
    });
    if (lack.length) return { ok: false, msg: '物资不够：' + lack.join('、') };
    Object.keys(need).forEach(function (k) { S.bag[k] -= need[k]; });
    /* ② 劳力：在岗的出力，需求值下降（池塘里干活的，缺水账不算在它头上）
       v1.28：出工的这几只进入休息；稀有度决定干得多快（营业倒计时按系数缩短） */
    const crew = ready.slice(0, Math.max(1, cfg.labor || 1));
    const crewPets = crew.map(petById).filter(Boolean);
    crewPets.forEach(function (p) {
      const aqua = isAqua(p);
      ['water', 'nutri', 'clean', 'fun'].forEach(function (s) {
        if (s === 'water' && aqua) return;
        p.stats[s] = Math.max(0, (p.stats[s] || 0) - (cfg.laborNeed || 6));
      });
      setRest(p);
    });
    const boost = workBoostOf(crewPets);
    const now = Date.now();
    const runMs = Math.max(Math.round((cfg.minutes || 30) * 60000 * 0.6), Math.round((cfg.minutes || 30) * 60000 / boost));
    S.build.ops[id] = {
      startAt: now,
      finishAt: now + runMs,
      guests: guests.map(function (p) { return p.id; }),
      crew: crew.slice(),
      cost: need,
      lv: lv,
      boost: boost
    };
    const bw = bestWorker(crewPets);
    window.Store.pushLog('🔔 ' + b.name + '开始' + cfg.label + '：' + guests.length + ' 位客人已经进门。' +
      (bw && speciesById(bw.speciesId).rarity > 1 ? '（' + bw.name + '当班，出活更快）' : ''));
    window.Store.save(true);
    return {
      ok: true,
      msg: cfg.emoji + ' ' + b.name + '开始' + cfg.label + '，约 ' + Math.max(1, Math.round(runMs / 60000)) + ' 分钟后收工' +
        (boost > 1.01 ? '（稀有出工，效率 ×' + boost.toFixed(2) + '）' : ''),
      guestNames: guests.map(function (p) { return p.name; })
    };
  }
  /* 收工：发产出、给客人服务、写日志 */
  function opFinish(id, at) {
    ensureOps();
    const cfg = opCfg(id);
    const st = S.build.ops[id];
    if (!cfg || !st) return null;
    /* v1.37：出团是另一套结算（回来带东西、算收藏品） */
    if (cfg.kind === 'travel') return travelFinish(id, st, at);
    const b = buildingById(id);
    const lv = st.lv || buildLv(id);
    const guests = (st.guests || []).map(petById).filter(Boolean);
    /* v1.28：这趟活的效益系数（在岗那几只是否稀有）。开工时算过一次，存了就用存的 */
    const crewPets = (st.crew || []).map(petById).filter(Boolean);
    const boost = (typeof st.boost === 'number' && st.boost > 0) ? st.boost : workBoostOf(crewPets);
    const entries = [];
    guests.forEach(function (p) {
      const t = D.traitOf(p);
      const aqua = isAqua(p);
      const delta = [];
      const snaps = [];          /* v1.33：日志用的快照（带前后值，不是只有增量） */
      Object.keys(cfg.serve || {}).forEach(function (s) {
        if (s === 'water' && aqua) { p.stats.water = 100; return; }
        const v = cfg.serve[s];
        const before = p.stats[s] || 0;
        p.stats[s] = Math.max(0, Math.min(100, before + v));
        delta.push({ stat: s, v: Math.round(p.stats[s] - before) });
        snaps.push(statSnap(s, before, p.stats[s]));
      });
      let growD = 0;
      if (cfg.grow) {
        const g = Math.round(cfg.grow * (t.grow || 1) * boost);
        p.growth += g;
        delta.push({ stat: 'grow', v: g });
        growD = g;
      }
      /* 小概率意外：好奇的多惹事，胆小的几乎不惹事 */
      let acc = null;
      const chance = (cfg.accident ? cfg.accident.chance : 0) * (t.mischief || 1);
      if (cfg.accident && Math.random() < chance) {
        acc = { name: cfg.accident.name, text: cfg.accident.text };
        Object.keys(cfg.accident.stat || {}).forEach(function (s) {
          const before = p.stats[s] || 0;
          p.stats[s] = Math.max(0, Math.min(100, before + cfg.accident.stat[s]));
          delta.push({ stat: s, v: Math.round(p.stats[s] - before) });
          snaps.push(statSnap(s, before, p.stats[s]));
        });
      }
      p.lastCare = Date.now();
      const actText = (typeof D.traitLine === 'function' ? (D.traitLine(p, id) || cfg.verb) : cfg.verb);
      entries.push({
        id: p.id, name: p.name,
        emoji: (speciesById(p.speciesId) || {}).emoji || '🐾',
        trait: t.id, traitName: t.name, traitEmoji: t.emoji,
        act: actText,
        accident: acc, delta: delta
      });
      /* v1.33：这一趟进它自己的日志。在哪儿上班，脾气就往那个方向偏一点
         （食堂→嘴馋、图书馆→好奇、澡堂→慵懒、旅行社→活泼）。 */
      const tmark = traitMark(p, (D.TRAIT_RULE_BY_BUILD || {})[id]);
      logPet(p, {
        kind: 'work',
        icon: cfg.emoji,
        text: '在' + b.name + actText + (acc ? '　⚠️ ' + acc.name + '：' + acc.text : ''),
        deltas: snaps,
        grow: growD ? { before: Math.round(p.growth - growD), after: Math.round(p.growth), d: growD } : null,
        trait: traitSnap(tmark),
        shift: (tmark && tmark.shifted) ? { from: tmark.fromName, to: tmark.toName } : null
      });
      /* v1.37：光顾这一趟还可能撞上一件小事（随机经历），也写进它自己的日志 */
      traitEventFor(p, id);
    });
    /* 产出（v1.28：稀有出工，产出按效益系数放大）
       v1.37：系数**按建筑各读各的**（D.ECONOMY[id]）。
       改前这里写死读 ECONOMY.canteen、澡堂干脆硬编码 (1+lv) —— 结果图书馆 / 博物馆 /
       澡堂三行系数全是死配置，五栋产出完全一样，"逐栋平衡"根本无从谈起。
       现在每栋有自己的价码：食堂 9/4（要买食材）> 图书馆 3/2 > 博物馆 2/2（不耗物资），
       澡堂 1/0.6（产出营养液）。四栋都是「每轮 = (base + perLv × 等级) × 光顾人数」。 */
    const ECO_FALLBACK = {
      canteen: { base: 9, perLv: 4 }, bath: { base: 1, perLv: 0.6 },
      library: { base: 3, perLv: 2 }, museum: { base: 2, perLv: 2 }
    };
    let outTxt = '', outN = 0;
    if (cfg.gain === 'beans' || cfg.gain === 'fert') {
      const eco = (D.ECONOMY && D.ECONOMY[id]) || ECO_FALLBACK[id] || { base: 2, perLv: 1 };
      outN = Math.round((eco.base + lv * eco.perLv) * guests.length * boost);
      if (cfg.gain === 'beans') {
        S.cur.beans += outN;
        outTxt = '🌰 可可豆 ×' + outN;
      } else {
        S.bag.fert = (S.bag.fert || 0) + outN;
        outTxt = '🧪 营养液 ×' + outN;
      }
    } else {
      outTxt = '📖 大伙儿的心情与见识';
    }
    /* v1.34：收工不撤岗 —— 岗位保留，今天算"已出过工"，明天自动回来上班，
       省得每次营业都得重新点一遍排班。想让它彻底不干就在面板上点它下班。
       撤岗只留给「送养」「没成年」「生病」这类真的不该占着岗位的情况。 */
    let crewGrow = 0;
    if (crewPets.length) {
      crewGrow = workGrowOf(boost);
      crewPets.forEach(function (p) {
        const gBefore = p.growth;
        p.growth += crewGrow;
        /* v1.33：出工也进它自己的日志（出力长本事），同样给性格印记 */
        const cmark = traitMark(p, (D.TRAIT_RULE_BY_BUILD || {})[id]);
        logPet(p, {
          kind: 'work',
          icon: '🛠️',
          text: '在' + b.name + '出了一趟工，收工下班，长了些本事。（岗位留着，明天还能来）',
          grow: { before: Math.round(gBefore), after: Math.round(p.growth), d: crewGrow },
          trait: traitSnap(cmark),
          shift: (cmark && cmark.shifted) ? { from: cmark.fromName, to: cmark.toName } : null
        });
        /* v1.37：出工回来也可能撞上一件小事；顺便记一次"出工次数"（成就用） */
        traitEventFor(p, id);
        if (S.stats) S.stats.worksDone = (S.stats.worksDone || 0) + 1;
      });
    }
    const rec = {
      at: at || Date.now(), op: id, label: cfg.label, emoji: cfg.emoji,
      guests: entries, out: outTxt, outN: outN, lv: lv, boost: boost,
      crewGrow: crewGrow,
      crew: crewPets.map(function (p) { return p.name; })
    };
    if (!S.build.logs[id]) S.build.logs[id] = [];
    S.build.logs[id].unshift(rec);
    if (S.build.logs[id].length > 12) S.build.logs[id] = S.build.logs[id].slice(0, 12);
    delete S.build.ops[id];
    window.Store.pushLog(cfg.emoji + ' ' + b.name + cfg.label + '收工：' + guests.length + ' 位客人，' + outTxt +
      (boost > 1.01 ? '（稀有出工 ×' + boost.toFixed(2) + '）' : '') +
      (crewGrow ? '；出工的 ' + crewPets.length + ' 只下班了，各涨成长 +' + crewGrow +
        '（岗位留着，明天照常上班）' : ''));
    window.Store.save(true);
    return {
      ok: true, id: id, name: b.name, rec: rec, boost: boost,
      msg: cfg.emoji + ' ' + b.name + cfg.label + '收工！' + guests.length + ' 位客人' + cfg.verb + '，' + outTxt +
        (boost > 1.01 ? '　✨ 稀有出工，效益 ×' + boost.toFixed(2) : '') +
        (crewGrow ? '　🌱 出工的 ' + crewPets.length + ' 只今天不能再出工，各涨成长 +' + crewGrow +
          '；岗位给它们留着，明天照常上班' : '')
    };
  }
  /* 离线到点的营业，回来一并结算（advanceOffline 里调） */
  function finishOfflineOps(now) {
    ensureOps();
    const done = [];
    Object.keys(S.build.ops || {}).forEach(function (id) {
      const st = S.build.ops[id];
      if (st && now >= st.finishAt) {
        const r = opFinish(id, now);
        if (r) done.push(r);
      }
    });
    return done;
  }
  function opLogs(id) { ensureOps(); return (S.build.logs && S.build.logs[id]) || []; }

  /* ---- 旅行社：导游带团出游（v1.37 起改成 2 小时倒计时） ----
     以前是"点一下立刻回来"，一天只剩一次点击、也没有可等的东西；
     现在它跟别的运营建筑用**同一套倒计时容器**（S.build.ops）：
       开工 → 地图名牌上挂着"还剩多少分钟" → 到点收工结算（travelFinish）。
     走的这几只当天下班（setRest），但**岗位保留**（v1.34 的规矩），明天照常出团。 */
  function travelStart(id) {
    ensureOps();
    const cfg = opCfg(id);
    if (!cfg) return { ok: false, msg: '旅行社还没配置' };
    if (!isBuilt(id)) return { ok: false, msg: '旅行社还没建好' };
    if (opOf(id)) return { ok: false, msg: '团还在路上，等他们回来' };
    if (doneToday('travel:' + id)) return { ok: false, msg: '今天已经出过团了' };
    const staff = staffOf(id);
    if (staff.length < 2) return { ok: false, msg: '出游至少要有 1 只导游 + 1 只同伴' };
    const guide = petById(staff[0]);
    const party = staff.slice(1).map(petById).filter(Boolean);
    if (!guide) return { ok: false, msg: '导游不见了' };
    const all = [guide].concat(party);
    const tired = all.filter(function (p) { return isWorkedToday(p); });
    if (tired.length) {
      return {
        ok: false,
        msg: '今天已经出过工了：' + tired.map(function (p) { return p.name; }).join('、') +
          '。出团算一趟工，明天再来吧。'
      };
    }
    /* 出团消耗：走这一趟，需求值下降（池塘里泡着的不会渴）。
       消耗在**开工时**扣，收工只发收益 —— 免得中途关页面白赚一趟。
       v1.37：扣多少读 cfg.laborNeed（8 = 2 小时口径的三分之二天）。
       改前这里写死 -14，而 data.js / 建筑面板都写 8，三处对不上。 */
    const tripNeed = cfg.laborNeed || 8;
    all.forEach(function (p) {
      const aqua = isAqua(p);
      ['water', 'nutri', 'clean', 'fun'].forEach(function (s) {
        if (s === 'water' && aqua) return;
        p.stats[s] = Math.max(0, (p.stats[s] || 0) - tripNeed);
      });
      setRest(p);
    });
    const boost = workBoostOf(all);
    const now = Date.now();
    const mins = cfg.minutes || 120;
    const runMs = Math.max(Math.round(mins * 60000 * 0.6), Math.round(mins * 60000 / boost));
    S.build.ops[id] = {
      startAt: now, finishAt: now + runMs,
      kind: 'travel',
      guests: [],
      crew: all.map(function (p) { return p.id; }),
      guide: guide.id,
      party: party.map(function (p) { return p.id; }),
      lv: buildLv(id),
      boost: boost,
      cost: {}
    };
    const outMin = Math.max(1, Math.round(runMs / 60000));
    window.Store.pushLog('🧭 ' + guide.name + ' 带着 ' + party.length + ' 只同伴出发了，约 ' + outMin + ' 分钟后回来。');
    window.Store.save(true);
    return {
      ok: true,
      msg: '🧭 ' + guide.name + ' 当导游，带 ' + party.length + ' 只同伴出发了，约 ' + outMin + ' 分钟后回来' +
        (boost > 1.01 ? '（稀有出工，走得快 ×' + boost.toFixed(2) + '）' : ''),
      guideName: guide.name, minutes: outMin
    };
  }

  /* 出团收工：结算收获（豆 + 捡到的东西 + 收藏品），走的人涨成长并写进各自日志 */
  function travelFinish(id, st, at) {
    ensureOps();
    const cfg = opCfg(id);
    if (!cfg || !st) return null;
    const b = buildingById(id);
    const lv = st.lv || buildLv(id);
    const crew = (st.crew || []).map(petById).filter(Boolean);
    const guide = petById(st.guide) || crew[0];
    if (!guide) { delete S.build.ops[id]; return null; }
    const party = crew.filter(function (p) { return p.id !== guide.id; });
    const boost = (typeof st.boost === 'number' && st.boost > 0) ? st.boost : workBoostOf(crew);
    const got = [];
    /* v1.37：出团是乐园侧最贵的一次行动（搭上 2 小时 + 全员 4 项状态各 -14），
       收益得撑住才有人愿意去 —— 系数在 data.js 的 ECONOMY.travel（唯一调参入口），
       这里的字面量只是兜底。 */
    const eco = (D.ECONOMY && D.ECONOMY.travel) || { base: 30, perLv: 16, rand: 18 };
    const beans = Math.round((eco.base + lv * eco.perLv + Math.floor(Math.random() * eco.rand)) * boost);
    S.cur.beans += beans;
    got.push('🌰 可可豆 ×' + beans);
    /* 物件掉落 */
    if (Math.random() < 0.75) {
      const pool = D.ITEMS.filter(function (it) { return it.kind !== 'facility'; });
      const it = pick(pool);
      S.bag[it.id] = (S.bag[it.id] || 0) + 1;
      got.push(it.emoji + ' ' + it.name + ' ×1');
    }
    /* 收藏品：概率随人数与等级上升 */
    const chance = Math.min(0.7, 0.2 + party.length * 0.08 + (lv - 1) * 0.06);
    let col = null;
    if (Math.random() < chance) {
      const r = Math.random();
      const rarity = r < 0.08 ? 3 : (r < 0.35 ? 2 : 1);
      const pool = D.COLLECTIONS.filter(function (c) { return c.rarity === rarity; });
      col = pick(pool);
      const already = (S.build.collection || []).some(function (c) { return c.id === col.id; });
      S.build.collection.push({ id: col.id, at: Date.now(), by: guide.name, dup: already });
      got.push(col.emoji + ' ' + col.name + (already ? '（重复收集）' : '·新收藏！'));
      window.Store.pushLog('🧭 ' + guide.name + ' 的团带回了「' + col.name + '」。');
    }
    if (!S.build.trips) S.build.trips = [];
    S.build.trips.push({ at: at || Date.now(), guide: guide.id, guideName: guide.name, party: party.map(function (p) { return p.id; }), got: got });
    if (S.build.trips.length > 40) S.build.trips = S.build.trips.slice(-40);
    /* v1.32：出团也是一趟工 —— 走的这几只各自涨成长（见多识广也是长本事）。
       休不休在**开工时**就写好了（travelStart 里 setRest），这里不再动。
       v1.34 的规矩照旧：**不撤岗**，明天照常出团。 */
    const tripGrow = workGrowOf(boost);
    crew.forEach(function (p) {
      const gBefore = p.growth;
      p.growth += tripGrow;
      /* v1.33/v1.37：出游进它自己的日志；带团跑一趟，脾气往「活泼」偏（activity 驱动） */
      const tmark = traitMark(p, 'work_travel');
      logPet(p, {
        kind: 'travel',
        icon: '🧭',
        text: (p.id === guide.id ? '当导游带团出游，' : '跟着团出游，') + '跑了一趟' +
          (p.id === guide.id && col ? '，带回一件「' + col.name + '」' : '') + '。',
        grow: { before: Math.round(gBefore), after: Math.round(p.growth), d: tripGrow },
        trait: traitSnap(tmark),
        shift: (tmark && tmark.shifted) ? { from: tmark.fromName, to: tmark.toName } : null
      });
      /* v1.37：路上撞见的小事（随机经历）+ 出工次数（成就用） */
      traitEventFor(p, 'travel');
      if (S.stats) S.stats.worksDone = (S.stats.worksDone || 0) + 1;
    });
    const rec = {
      at: at || Date.now(), op: id, label: cfg.label, emoji: cfg.emoji,
      guests: [], out: got.join('、'), outN: beans, lv: lv, boost: boost,
      crewGrow: tripGrow, crew: crew.map(function (p) { return p.name; })
    };
    if (!S.build.logs[id]) S.build.logs[id] = [];
    S.build.logs[id].unshift(rec);
    if (S.build.logs[id].length > 12) S.build.logs[id] = S.build.logs[id].slice(0, 12);
    delete S.build.ops[id];
    markDone('travel:' + id);
    window.Store.save(true);
    const tmsg = '🧭 ' + guide.name + ' 带 ' + party.length + ' 只回来了：' + got.join('、') +
      (boost > 1.01 ? '　✨ 稀有出工，效益 ×' + boost.toFixed(2) : '') +
      '　🌱 各涨成长 +' + tripGrow + '（今天不能再出工；岗位留着，明天照常）';
    window.Store.pushLog('🧭 ' + b.name + '的团回来了：' + got.join('、'));
    return { ok: true, id: id, name: b.name, rec: rec, boost: boost, msg: tmsg, collection: col };
  }
  /* 兼容旧名字：语义从「点一下立刻结算」变成「出发（倒计时）」 */
  function travelRun(id) { return travelStart(id); }
  /* 已收集的收藏品（去重，标记件数） */
  function collectionsOwned() {
    const map = {};
    (S.build.collection || []).forEach(function (c) {
      if (!map[c.id]) map[c.id] = { id: c.id, n: 0, first: c.at };
      map[c.id].n++;
    });
    return Object.keys(map).map(function (k) { return map[k]; });
  }

  return {
    init: init,
    ensureBuild: ensureBuild,
    zoneIdOf: zoneIdOf,
    isAqua: isAqua,
    zoneById: zoneById,
    petsInZone: petsInZone,
    zoneCap: zoneCap,
    zoneFree: zoneFree,
    zoneFull: zoneFull,
    autoStoreOverflow: autoStoreOverflow,
    isResting: isResting,
    isWorkedToday: isWorkedToday,
    restLeftMs: restLeftMs,
    restLeftMin: restLeftMin,
    restText: restText,
    setRest: setRest,
    workGrowOf: workGrowOf,
    workplaceOf: workplaceOf,
    unstaffEverywhere: unstaffEverywhere,
    workBoostOf: workBoostOf,
    bestWorker: bestWorker,
    buildingById: buildingById,
    isBuilt: isBuilt,
    buildLv: buildLv,
    staffCap: staffCap,
    nextBuilding: nextBuilding,
    buildGate: buildGate,
    adultPets: adultPets,
    adultCount: adultCount,
    isAdult: isAdult,
    oldestAdult: oldestAdult,
    elderPet: elderPet,
    workersOf: workersOf,
    buildCost: buildCost,
    buildDurationMs: buildDurationMs,
    underConstruction: underConstruction,
    buildProgress: buildProgress,
    finishOfflineBuilds: finishOfflineBuilds,
    buildStart: buildStart,
    storySeen: storySeen,
    markStory: markStory,
    laborReady: laborReady,
    pendingStory: pendingStory,
    staffOf: staffOf,
    addStaff: addStaff,
    removeStaff: removeStaff,
    doneToday: doneToday,
    petById: petById,
    careOptionsFor: careOptionsFor,
    /* v1.37：旅行社走倒计时（travelRun 是旧名字，现在等于"出发"） */
    travelStart: travelStart,
    travelFinish: travelFinish,
    traitEventFor: traitEventFor,
    traitApply: traitApply,
    /* v1.27 运营建筑（倒计时制） */
    opCfg: opCfg,
    opStatus: opStatus,
    opGuestCap: opGuestCap,
    opStart: opStart,
    opFinish: opFinish,
    opLogs: opLogs,
    finishOfflineOps: finishOfflineOps,
    travelRun: travelRun,
    collectionsOwned: collectionsOwned,
    speciesById: speciesById,
    homeOf: homeOf,
    homeName: homeName,
    zoneNameFor: zoneNameFor,
    pull: pull,
    placeCapsule: placeCapsule,
    speedUp: speedUp,
    hatch: hatch,
    quizGate: quizGate,
    quizCfg: quizCfg,
    quizAvailable: quizAvailable,
    markQuizPassed: markQuizPassed,
    usedSlots: usedSlots,
    podCap: podCap,
    stageOf: stageOf,
    careActionsFor: careActionsFor,
    care: care,
    /* v1.33 一键照顾 + 小生物日志 + 性格印记 */
    oneKeyCare: oneKeyCare,
    ONKEY_TARGET: ONKEY_TARGET,
    petLogOf: petLogOf,
    logPet: logPet,
    traitMark: traitMark,
    traitScoreOf: traitScoreOf,
    traitTendency: traitTendency,
    levelOf: levelOf,
    levelReward: levelReward,
    canStore: canStore,
    storePet: storePet,
    unstorePet: unstorePet,
    adoptValue: adoptValue,
    adoptPet: adoptPet,
    chalCfg: chalCfg,
    chalLeft: chalLeft,
    chalStatus: chalStatus,
    chalOpen: chalOpen,
    chalFinish: chalFinish,
    rollIllness: rollIllness,
    heal: heal,
    buy: buy,
    checkAchievements: checkAchievements,
    renamePet: renamePet,
    moodOf: moodOf,
    pick: pick,
    rand: rand
  };
})();
