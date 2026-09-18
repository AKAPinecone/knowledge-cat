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
      careCount: 0
    };
    S.pets.push(pet);
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
      bank: (window.QBank ? window.QBank.count() : 0)
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

    /* 答错的题「取消掌握」：之前蒙对过、这次又错了，就该让它回到卷子里 */
    if (window.QBank && window.QBank.unmarkMastered && Array.isArray(paper)) {
      res.detail.forEach(function (d) {
        if (!d.ok && paper[d.i]) window.QBank.unmarkMastered(paper[d.i].qid);
      });
    }
    window.Store.pushLog('🏆 挑战赛 ' + res.correct + '/' + res.total +
      '（' + Math.round(res.rate * 100) + '%）' +
      (passed ? '，赢下 ' + beans + ' 可可豆。' : '，没到 ' + Math.round(cfg.passRate * 100) + '%，这次没有奖励。'));
    window.Store.save(true);
    checkAchievements();
    return {
      passed: passed, perfect: perfect, beans: beans,
      left: chalLeft(), best: Math.round(c.best * 100)
    };
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
    window.Store.save();
    checkAchievements();
    return {
      ok: true, msg: msg, pet: pet, leveled: lvlAfter > lvlBefore,
      item: item, itemName: it.name, itemEmoji: it.emoji, isAdv: !!it.reqLevel,
      traitLine: tr && tr.lines ? tr.lines.care : ''
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
    Object.keys(S.build.staff || {}).forEach(function (k) {
      const arr = S.build.staff[k] || [];
      const j = arr.indexOf(petId);
      if (j >= 0) arr.splice(j, 1);
    });
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
     其余按 kind：动物→草地，真菌→温室，植物→苗圃。
     判定统一走 D.isWaterDweller（定义在 data 层），store.js 的衰减也用同一个函数 ——
     免得"住在池塘"和"不会缺水"哪天走岔了。 */
  function isAqua(pet) {
    return (typeof D.isWaterDweller === 'function') && D.isWaterDweller(pet.speciesId);
  }

  /* ---------------- 打工休息（v1.28） ----------------
     干完一趟活（修建出工 / 运营开工）就得歇一歇：休息时长 = 该物种的孵化时间 × 3
     （普通 15 分→45 分、稀有 40→120 分、传说 80→240 分）。休息期间不能被派活。
     稀有的底子好：同样一趟活，产出更高、也更省时间（系数在 D.RARITY_WORK）。 */
  function restMsFor(pet) {
    const sp = speciesById(pet.speciesId);
    if (typeof D.restMsOfSpecies === 'function') return D.restMsOfSpecies(sp);
    return 15 * 3 * 60000;
  }
  function isResting(pet) { return !!pet && (pet.restUntil || 0) > Date.now(); }
  function restLeftMs(pet) { return Math.max(0, (pet.restUntil || 0) - Date.now()); }
  function restLeftMin(pet) { return Math.ceil(restLeftMs(pet) / 60000); }
  /* 让它开始休息，返回歇多久（毫秒） */
  function setRest(pet) {
    if (!pet) return 0;
    const ms = restMsFor(pet);
    pet.restUntil = Date.now() + ms;
    return ms;
  }
  function restText(pet) {
    if (!isResting(pet)) return '';
    return '💤 休息中 · 还剩 ' + restLeftMin(pet) + ' 分钟';
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
      if (isResting(pet)) return { ok: false, msg: pet.name + '刚干完活还在休息（还剩 ' + restLeftMin(pet) + ' 分钟），换一只或者等等' };
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
    /* v1.28：出工即开始休息（休息时长 = 各自孵化时间 ×3），修完也得歇够 */
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
      msg: b.name + ' 开始建造，预计 ' + minutes + ' 分钟后完工（出工的三只先休息，最长 ' + restMin + ' 分钟）',
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
    if (isResting(pet)) return { ok: false, msg: pet.name + '刚干完活还在休息（还剩 ' + restLeftMin(pet) + ' 分钟），歇好了再来' };
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
    return (cfg.guestsBase || 2) + buildLv(id) * (cfg.guestsPerLv || 1);
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
    if (!isBuilt(id)) return { ok: false, msg: '这栋还没建好' };
    const b = buildingById(id);
    if (opOf(id)) return { ok: false, msg: b.name + '正在营业，等这一轮收工' };
    const lv = buildLv(id);
    const staff = staffOf(id);
    if (staff.length < (cfg.labor || 1)) {
      return { ok: false, msg: b.name + '至少要有 ' + (cfg.labor || 1) + ' 位小生物在岗出力' };
    }
    /* v1.28：刚干完活的还在休息，不能连着上班 */
    const ready = staff.filter(function (pid) { const p = petById(pid); return p && !isResting(p); });
    if (ready.length < (cfg.labor || 1)) {
      const tired = staff.filter(function (pid) { const p = petById(pid); return p && isResting(p); });
      const tn = tired.map(function (pid) { const p = petById(pid); return p.name + '（还剩 ' + restLeftMin(p) + ' 分钟）'; });
      return {
        ok: false,
        msg: b.name + '人手不够：' + (tn.length ? tn.join('、') + '还在休息。' : '在岗的都不在状态。') +
          '歇够、或者再安排一只上岗。'
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
      Object.keys(cfg.serve || {}).forEach(function (s) {
        if (s === 'water' && aqua) { p.stats.water = 100; return; }
        const v = cfg.serve[s];
        const before = p.stats[s] || 0;
        p.stats[s] = Math.max(0, Math.min(100, before + v));
        delta.push({ stat: s, v: Math.round(p.stats[s] - before) });
      });
      if (cfg.grow) {
        const g = Math.round(cfg.grow * (t.grow || 1) * boost);
        p.growth += g;
        delta.push({ stat: 'grow', v: g });
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
        });
      }
      p.lastCare = Date.now();
      entries.push({
        id: p.id, name: p.name,
        emoji: (speciesById(p.speciesId) || {}).emoji || '🐾',
        trait: t.id, traitName: t.name, traitEmoji: t.emoji,
        act: (typeof D.traitLine === 'function' ? (D.traitLine(p, id) || cfg.verb) : cfg.verb),
        accident: acc, delta: delta
      });
    });
    /* 产出（v1.28：稀有出工，产出按效益系数放大） */
    let outTxt = '', outN = 0;
    if (cfg.gain === 'beans') {
      const eco = (D.ECONOMY && D.ECONOMY.canteen) || { base: 9, perLv: 4 };
      outN = Math.round((eco.base + lv * eco.perLv) * guests.length * boost);
      S.cur.beans += outN;
      outTxt = '🌰 可可豆 ×' + outN;
    } else if (cfg.gain === 'fert') {
      outN = Math.round((1 + lv) * guests.length * boost);
      S.bag.fert = (S.bag.fert || 0) + outN;
      outTxt = '🧪 营养液 ×' + outN;
    } else {
      outTxt = '📖 大伙儿的心情与见识';
    }
    const rec = {
      at: at || Date.now(), op: id, label: cfg.label, emoji: cfg.emoji,
      guests: entries, out: outTxt, outN: outN, lv: lv, boost: boost,
      crew: crewPets.map(function (p) { return p.name; })
    };
    if (!S.build.logs[id]) S.build.logs[id] = [];
    S.build.logs[id].unshift(rec);
    if (S.build.logs[id].length > 12) S.build.logs[id] = S.build.logs[id].slice(0, 12);
    delete S.build.ops[id];
    window.Store.pushLog(cfg.emoji + ' ' + b.name + cfg.label + '收工：' + guests.length + ' 位客人，' + outTxt +
      (boost > 1.01 ? '（稀有出工 ×' + boost.toFixed(2) + '）' : ''));
    window.Store.save(true);
    return {
      ok: true, id: id, name: b.name, rec: rec, boost: boost,
      msg: cfg.emoji + ' ' + b.name + cfg.label + '收工！' + guests.length + ' 位客人' + cfg.verb + '，' + outTxt +
        (boost > 1.01 ? '　✨ 稀有出工，效益 ×' + boost.toFixed(2) : '')
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
    /* 出团消耗：走一天，需求值下降（池塘里泡着的不会渴） */
    [guide].concat(party).forEach(function (p) {
      const aqua = isAqua(p);
      ['water', 'nutri', 'clean', 'fun'].forEach(function (s) {
        if (s === 'water' && aqua) return;
        p.stats[s] = Math.max(0, p.stats[s] - 14);
      });
    });
    const got = [];
    /* v1.24：出团收益从 12+8×等级 提到 20+12×等级（随机跨度也放大到 14）。
       出团要搭上一整天 4 项状态的 14 点衰减，是乐园侧最贵的一次行动，
       收益太低就没人愿意去；系数在 D.ECONOMY.travel。 */
    const eco = (D.ECONOMY && D.ECONOMY.travel) || { base: 12, perLv: 8, rand: 10 };
    const beans = eco.base + lv * eco.perLv + Math.floor(Math.random() * eco.rand);
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
    isAqua: isAqua,
    zoneById: zoneById,
    petsInZone: petsInZone,
    zoneCap: zoneCap,
    zoneFree: zoneFree,
    zoneFull: zoneFull,
    autoStoreOverflow: autoStoreOverflow,
    isResting: isResting,
    restLeftMs: restLeftMs,
    restLeftMin: restLeftMin,
    restMsFor: restMsFor,
    restText: restText,
    setRest: setRest,
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
