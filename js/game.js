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
    window.Store.save(true);
    window.Store.pushLog('📭 ' + pet.name + ' 从保管室回到了场地。');
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
     其余按 kind：动物→草地，真菌→温室，植物→苗圃。 */
  function zoneIdOf(pet) {
    const sp = speciesById(pet.speciesId);
    if (sp.water === true || sp.kind === 'algae') return 'pond';
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
     公式：目标等级 Lv.N 需要 N × 15 分钟（Lv.1 = 15 分钟，Lv.2 = 30 分钟……） */
  function buildDurationMs(id) {
    const targetLv = (buildLv(id) || 0) + 1;
    return targetLv * 15 * 60000;
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
      crew[kind] = pet;
    }
    const cost = buildCost(id);
    if (cost.beans && S.cur.beans < cost.beans) return { ok: false, msg: '可可豆不够（需要 ' + cost.beans + '）' };
    if (cost.beans) S.cur.beans -= cost.beans;
    /* 三位参与者出工：需求值下降 */
    Object.keys(crew).forEach(function (k) {
      const p = crew[k];
      ['water', 'nutri', 'clean', 'fun'].forEach(function (s) {
        p.stats[s] = Math.max(0, p.stats[s] - cost.need);
      });
    });
    const targetLv = (buildLv(id) || 0) + 1;
    const duration = buildDurationMs(id);
    if (!S.build.under) S.build.under = {};
    S.build.under[id] = {
      startAt: Date.now(),
      finishAt: Date.now() + duration,
      lvAfter: targetLv,
      assign: { animal: crew.animal.id, plant: crew.plant.id, fungus: crew.fungus.id }
    };
    const minutes = Math.round(duration / 60000);
    window.Store.pushLog('🏗️ ' + b.name + ' 开工了！预计 ' + minutes + ' 分钟后建成。');
    window.Store.save(true);
    return { ok: true, msg: b.name + ' 开始建造，预计 ' + minutes + ' 分钟后完工', minutes: minutes };
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
  function addStaff(id, petId) {
    ensureBuild();
    if (!isBuilt(id)) return { ok: false, msg: '这栋还没建好' };
    const arr = S.build.staff[id] || (S.build.staff[id] = []);
    if (arr.indexOf(petId) >= 0) return { ok: false, msg: '它已经在这儿上班了' };
    if (arr.length >= staffCap(id)) return { ok: false, msg: '位置满了（' + arr.length + '/' + staffCap(id) + '），扩建能多招几员' };
    const pet = S.pets.filter(function (p) { return p.id === petId; })[0];
    if (!pet) return { ok: false, msg: '找不到这只小生物' };
    if (pet.stored) return { ok: false, msg: pet.name + '还在保管室里，先取出来' };
    if (pet.illness) return { ok: false, msg: pet.name + '正在生病，先治好' };
    if (!isAdult(pet)) return { ok: false, msg: pet.name + '还没成年，不能来打工' };
    arr.push(petId);
    window.Store.save(true);
    return { ok: true, msg: '👜 ' + pet.name + ' 来' + buildingById(id).name + '上班了。' };
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

  /* ---- 食堂：投清水 + 饲料 → 开饭，产可可豆 ---- */
  function canteenStock(id, item) {
    ensureBuild();
    const label = item === 'water' ? '清水' : '饲料';
    if ((S.bag[item] || 0) <= 0) return { ok: false, msg: label + '用完了，去商店补' };
    S.bag[item]--;
    const st = S.build.stock[id] || (S.build.stock[id] = {});
    st[item] = (st[item] || 0) + 1;
    window.Store.save(true);
    return { ok: true, msg: '往食堂投了 1 份' + label + '（现有 ' + st[item] + ' 份）。' };
  }
  function canteenRun(id) {
    ensureBuild();
    const staff = staffOf(id);
    if (!staff.length) return { ok: false, msg: '食堂还没安排小生物' };
    if (doneToday('canteen:' + id)) return { ok: false, msg: '今天已经开过饭了，明天再来' };
    const st = S.build.stock[id] || {};
    const meals = Math.min(staff.length, st.water || 0, st.food || 0);
    if (meals <= 0) return { ok: false, msg: '清水和饲料得各投几份才开得了饭' };
    st.water -= meals;
    st.food -= meals;
    let beans = 0;
    staff.slice(0, meals).forEach(function (pid) {
      const p = petById(pid);
      if (!p) return;
      p.stats.nutri = Math.min(100, p.stats.nutri + 26);
      p.stats.water = Math.min(100, p.stats.water + 22);
      p.stats.fun = Math.min(100, p.stats.fun + 8);
      beans += 5 + buildLv(id) * 3;
    });
    S.cur.beans += beans;
    markDone('canteen:' + id);
    window.Store.pushLog('🍲 食堂开饭：' + meals + ' 只吃饱了，上交 ' + beans + ' 可可豆。');
    window.Store.save(true);
    return { ok: true, msg: '🍲 ' + meals + ' 只小生物吃饱了，食堂上交 ' + beans + ' 可可豆。' };
  }

  /* ---- 澡堂：洗掉脏污 → 产营养液 ---- */
  function bathRun(id) {
    ensureBuild();
    const staff = staffOf(id);
    if (!staff.length) return { ok: false, msg: '澡堂还没安排小生物' };
    if (doneToday('bath:' + id)) return { ok: false, msg: '今天的热水已经烧过了' };
    let fert = 0, n = 0;
    staff.forEach(function (pid) {
      const p = petById(pid);
      if (!p) return;
      p.stats.clean = Math.min(100, p.stats.clean + 28);
      p.stats.fun = Math.min(100, p.stats.fun + 6);
      fert += 1 + buildLv(id);
      n++;
    });
    S.bag.fert = (S.bag.fert || 0) + fert;
    markDone('bath:' + id);
    window.Store.pushLog('🛁 澡堂营业：' + n + ' 只洗得干干净净，收集到 ' + fert + ' 份营养液。');
    window.Store.save(true);
    return { ok: true, msg: '🛁 ' + n + ' 只洗得干干净净，收到 ' + fert + ' 份营养液。' };
  }

  /* ---- 图书馆：静一静 → 涨娱乐 ---- */
  function libraryRun(id) {
    ensureBuild();
    const staff = staffOf(id);
    if (!staff.length) return { ok: false, msg: '图书馆还没安排小生物' };
    if (doneToday('library:' + id)) return { ok: false, msg: '今天已经安静看过了' };
    let n = 0;
    staff.forEach(function (pid) {
      const p = petById(pid);
      if (!p) return;
      p.stats.fun = Math.min(100, p.stats.fun + 30 + buildLv(id) * 6);
      n++;
    });
    markDone('library:' + id);
    window.Store.pushLog('📚 图书馆时光：' + n + ' 只安静地待了一下午，娱乐值回升。');
    window.Store.save(true);
    return { ok: true, msg: '📚 ' + n + ' 只在图书馆泡了一下午，娱乐值涨了不少。' };
  }

  /* ---- 旅行社：导游带团出游 → 随机带回物品与收藏品 ---- */
  function travelRun(id) {
    ensureBuild();
    const staff = staffOf(id);
    if (staff.length < 2) return { ok: false, msg: '出游至少要有 1 只导游 + 1 只同伴' };
    if (doneToday('travel:' + id)) return { ok: false, msg: '今天已经出过团了' };
    const guide = petById(staff[0]);
    const party = staff.slice(1).map(petById).filter(Boolean);
    if (!guide) return { ok: false, msg: '导游不见了' };
    const lv = buildLv(id);
    /* 出团消耗：走一天，需求值下降 */
    [guide].concat(party).forEach(function (p) {
      ['water', 'nutri', 'clean', 'fun'].forEach(function (s) {
        p.stats[s] = Math.max(0, p.stats[s] - 14);
      });
    });
    const got = [];
    const beans = 12 + lv * 8 + Math.floor(Math.random() * 10);
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
    S.build.trips.push({ at: Date.now(), guide: guide.id, guideName: guide.name, party: party.map(function (p) { return p.id; }), got: got });
    if (S.build.trips.length > 40) S.build.trips = S.build.trips.slice(-40);
    markDone('travel:' + id);
    window.Store.save(true);
    return { ok: true, msg: '🧭 ' + guide.name + ' 带 ' + party.length + ' 只出游回来了：' + got.join('、'), collection: col };
  }
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
    zoneById: zoneById,
    petsInZone: petsInZone,
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
    canteenStock: canteenStock,
    canteenRun: canteenRun,
    bathRun: bathRun,
    libraryRun: libraryRun,
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
