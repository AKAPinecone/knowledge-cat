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
  function usedSlots(kind) {
    const inUse = S.capsules.filter(function (c) {
      return c.place === kind;
    }).length;
    return { used: inUse, cap: S.slots[kind] };
  }

  function placeCapsule(capId, kind) {
    const c = S.capsules.filter(function (x) { return x.id === capId; })[0];
    if (!c) return { ok: false, msg: '找不到这颗胶囊' };
    const sp = speciesById(c.speciesId);
    if (homeOf(sp) !== kind) {
      return { ok: false, msg: '这颗胶囊里的生命需要「' + homeName(homeOf(sp)) + '」，放错地方不会孵化哦' };
    }
    const u = usedSlots(kind);
    if (u.used >= u.cap) return { ok: false, msg: homeName(homeOf(sp)) + '的托位满了（' + u.used + '/' + u.cap + '），先扩展或腾位置' };
    c.place = kind;
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
   * 小生物要从温室 / 孵化仓出来，先过 1 道题（限时 5 分钟 / 70%）。
   * 题库是空的（端口已接、题还没来）→ 闸门自动放行，不挡路。 */
  function quizCfg() {
    return window.GAME_DATA.HATCH_QUIZ || { count: 1, minutes: 5, passRate: 0.7, minCount: 1, maxAttempts: 2 };
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
        msg: '破壳前要先过一份 ' + gate.count + ' 题的小卷（限时 ' + gate.minutes +
          ' 分钟，至少答对 ' + gate.passLine + ' 题）'
      };
    }
    const sp = speciesById(c.speciesId);
    const name = pick(PET_NAME_A) + pick(PET_NAME_B);
    const pet = {
      id: 'pet_' + Date.now() + '_' + rand(9999),
      speciesId: sp.id,
      name: name,
      bornAt: Date.now(),
      growth: 0,
      stats: { water: 72, nutri: 72, clean: 72 },
      illness: null,
      illnessSince: 0,
      dormant: false,
      neglect: { water: 0, nutri: 0, clean: 0 },
      lastCare: Date.now(),
      careToday: {},
      careCount: 0
    };
    S.pets.push(pet);
    S.capsules = S.capsules.filter(function (x) { return x.id !== capId; });
    S.stats.totalHatched++;
    const uniq = {};
    S.pets.forEach(function (x) { uniq[x.speciesId] = 1; });
    S.stats.uniqueSpecies = Object.keys(uniq).length;
    if (sp.rarity === 3) S.stats.legendOwned = (S.stats.legendOwned || 0) + 1;
    window.Store.pushLog('🎉 ' + name + '（' + sp.name + '）破壳啦！' + (sp.rarity === 3 ? ' 这是传说级的生命！' : ''));
    window.Store.save(true);
    checkAchievements();
    return { ok: true, pet: pet, species: sp };
  }

  /* 注意：这里曾经有个 autoHatchReady() 会自动破壳。
     加了破壳测验之后它就是个「绕过闸门」的后门，已经删掉了。
     到点的胶囊只会被标记为 c.ready = true，破壳必须玩家自己来点。 */

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
  /* 升级里程碑奖励：少量可可比 + 券，维持商店经济（照顾本身不再掉豆） */
  function levelReward(lv) {
    return { beans: 15 + lv * 5, tickets: 1 + Math.floor(lv / 3) };
  }

  function care(petId, actionId) {
    const pet = S.pets.filter(function (p) { return p.id === petId })[0];
    if (!pet) return { ok: false, msg: '找不到这只小生物' };
    if (pet.illness) return { ok: false, msg: pet.name + '正在生病，先治病再护理吧' };
    const act = D.CARE[actionId];
    if (!act) return { ok: false, msg: '未知操作' };
    const allowed = careActionsFor(pet);
    if (allowed.indexOf(actionId) < 0) return { ok: false, msg: '它需要的不是这个' };
    /* 选"玩家已拥有的最高 tier"道具（高级道具优先） */
    const tiers = D.CARE_TIERS[act.stat] || [act.item];
    let item = null;
    for (let i = tiers.length - 1; i >= 0; i--) {
      if ((S.bag[tiers[i]] || 0) > 0) { item = tiers[i]; break; }
    }
    if (!item) {
      return { ok: false, msg: D.STAT_INFO[act.stat].label + '道具用完了，去商店补货' };
    }
    const boost = D.ITEM_MAP[item].boost;
    const before = stageOf(pet);
    S.bag[item]--;
    pet.stats[act.stat] = Math.min(100, pet.stats[act.stat] + boost.amount);
    pet.growth += boost.grow;
    pet.lastCare = Date.now();
    pet.careCount++;
    pet.careToday[actionId] = (pet.careToday[actionId] || 0) + 1;

    /* 经验与升级（照顾不再给可可豆，改为涨经验） */
    const lvlBefore = S.cur.level;
    S.cur.exp += boost.exp;
    S.stats.careCount++;
    const after = stageOf(pet);
    const si = D.STAT_INFO[act.stat];
    let msg = act.emoji + ' ' + act.label + pet.name + '完成，' + si.label + ' +' + boost.amount + '，经验 +' + boost.exp;
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
    window.Store.save();
    checkAchievements();
    return { ok: true, msg: msg, pet: pet, leveled: lvlAfter > lvlBefore };
  }

  /* ---------------- 保存舱 ----------------
     成年体（成熟 / 圆满）才能进保存舱；舱内所有状态静止（不衰减、不生病）。 */
  function canStore(pet) {
    const st = stageOf(pet);
    return st.key === 'adult' || st.key === 'elite';
  }
  function storePet(petId) {
    const pet = S.pets.filter(function (p) { return p.id === petId })[0];
    if (!pet) return { ok: false, msg: '找不到这只小生物' };
    if (pet.stored) return { ok: false, msg: pet.name + '已经在保存舱里了' };
    if (!canStore(pet)) {
      return { ok: false, msg: '只有「成熟 / 圆满」的成年体才能进保存舱（' + pet.name + '现在还是' + stageOf(pet).name + '）' };
    }
    pet.stored = true;
    window.Store.save(true);
    window.Store.pushLog('📦 ' + pet.name + ' 住进了保存舱，状态已静止。');
    return { ok: true, pet: pet };
  }
  function unstorePet(petId) {
    const pet = S.pets.filter(function (p) { return p.id === petId })[0];
    if (!pet) return { ok: false, msg: '找不到这只小生物' };
    if (!pet.stored) return { ok: false, msg: pet.name + '不在保存舱里' };
    pet.stored = false;
    pet.lastCare = Date.now();
    pet.illness = null;
    pet.illnessSince = 0;
    pet.dormant = false;
    window.Store.save(true);
    window.Store.pushLog('📭 ' + pet.name + ' 从保存舱回到了场地。');
    return { ok: true, pet: pet };
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
    pet.stats.clean = Math.min(100, pet.stats.clean + 20);
    S.stats.healedCount++;
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
        const key = itemId === 'slot_green' ? 'greenhouse' : 'hatchery';
        if (S.slots[key] >= 8) return { ok: false, msg: '已经扩到最大 8 个托位了' };
        if (S.cur.beans < it.price) return { ok: false, msg: '可可豆不够（需要 ' + it.price + '）' };
        S.cur.beans -= it.price;
        S.slots[key]++;
        window.Store.save(true);
        return { ok: true, msg: (key === 'greenhouse' ? '温室' : '孵化仓') + '托位扩展到 ' + S.slots[key] + ' 个' };
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
    pet.name = name.slice(0, 12);
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

  return {
    init: init,
    speciesById: speciesById,
    homeOf: homeOf,
    homeName: homeName,
    pull: pull,
    placeCapsule: placeCapsule,
    speedUp: speedUp,
    hatch: hatch,
    quizGate: quizGate,
    quizCfg: quizCfg,
    quizAvailable: quizAvailable,
    markQuizPassed: markQuizPassed,
    usedSlots: usedSlots,
    stageOf: stageOf,
    careActionsFor: careActionsFor,
    care: care,
    levelOf: levelOf,
    levelReward: levelReward,
    canStore: canStore,
    storePet: storePet,
    unstorePet: unstorePet,
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
