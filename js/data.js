/* =========================================================
 * 知识喂了猫 · 数据层
 * 所有静态配置：物种池 / 道具 / 疾病 / 任务库 / 成就 / 导游词
 * ========================================================= */
window.GAME_DATA = (function () {

  /* ---------- 考试与计划 ---------- */
  const EXAM_DATE = '2026-11-21';
  const PHASES = [
    {
      id: 1, name: '全刷夯基', days: 35, tag: 'Step 1',
      motto: '每天喂满 6 样：读书 1 + 四科各 30 道 + 导游词 1。',
      detail: '每天的投喂单固定 6 件：精读课本 1 次（哪本你定，一本 8 天）、四科各刷 30 道、导游词通读 1 篇。这 6 件之外还有"加餐"——课后练习、章节框架、合书自测，有精力就做，没有也没人扣你分。',
      focus: '不求全懂，只求全覆盖。先把四科的"地图"画进脑子里。'
    },
    {
      id: 2, name: '单科拔高', days: 21, tag: 'Step 2',
      motto: '用网课磨耳朵，每天深挖一科，每 3 天一次模考。',
      detail: '网课磨耳朵（每天分两段听完）；每天深度研究一科（四科轮换）；每 3 天做一次模考；梳理并背诵导游词。',
      focus: '从"知道有这回事"变成"能讲给人听"。零散的知识点开始连成网。'
    },
    {
      id: 3, name: '冲刺定型', days: 14, tag: 'Step 3',
      motto: '套题 + 全科回照 + 导游词全流程口述。',
      detail: '每天套题/模考；全科回照（把学过的框架串一遍）；12 篇导游词全程口述录音；法规与时政速记。',
      focus: '把状态调到考试那天。稳住节奏，不学新东西，只把会的变熟。'
    }
  ];

  /* 每本课本的计划天数（四本 × 8 天 = 32 天，装得进 35 天的阶段一） */
  const BOOK_DAYS = 8;

  const SUBJECTS = [
    { id: 'law',  name: '政策与法律法规', short: '法规', book: '科目一', emoji: '⚖️', color: '#7FB069' },
    { id: 'ops',  name: '导游业务',       short: '业务', book: '科目二', emoji: '🧭', color: '#4EA8DE' },
    { id: 'nat',  name: '全国导游基础知识', short: '全导', book: '科目三', emoji: '🗺️', color: '#E9A13B' },
    { id: 'loc',  name: '地方导游基础知识', short: '地导', book: '科目四', emoji: '🌿', color: '#C4708E' }
  ];

  /* ---------- 12 篇导游词（2025 云南考区科目五·中文类） ---------- */
  const SCRIPTS = [
    { id: 's01', name: '昆明市石林风景区', group: '研学团', place: '昆明', nodes: ['景区概况', '彝族文化', '石林湖', '石林成因', '大石林', '小石林'], minutes: 8 },
    { id: 's02', name: '丽江市玉龙雪山景区', group: '研学团', place: '丽江', nodes: ['景区概况', '甘海子', '大索道站', '冰川公园', '蓝月谷', '云杉坪'], minutes: 8 },
    { id: 's03', name: '丽江市丽江古城景区', group: '亲子团', place: '丽江', nodes: ['景区概况', '纳西族文化', '古城入口', '古城的水', '古城的桥', '四方街', '科贡坊', '木府'], minutes: 9 },
    { id: 's04', name: '大理州崇圣寺三塔文化旅游区', group: '老年团', place: '大理', nodes: ['大理历史', '白族文化', '景区概况', '三塔布局', '千寻塔', '“永镇山川”照壁', '两座小塔'], minutes: 8 },
    { id: 's05', name: '西双版纳州中科院西双版纳热带植物园', group: '亲子团', place: '西双版纳', nodes: ['景区概况', '傣族文化', '国树国花园', '名人名树园', '树海行石雕群', '热带雨林民族文化博物馆'], minutes: 9 },
    { id: 's06', name: '迪庆州普达措国家公园', group: '研学团', place: '迪庆', nodes: ['景区概况', '景区入口', '属都湖', '洛茸村', '碧塔海'], minutes: 8 },
    { id: 's07', name: '保山市火山热海旅游区', group: '老年团', place: '保山·腾冲', nodes: ['景区概况', '腾冲地质概况', '大空山', '热海概况', '澡塘河峡谷', '香枝坡', '大滚锅'], minutes: 8 },
    { id: 's08', name: '文山州普者黑旅游景区', group: '商务团', place: '文山', nodes: ['景区概况', '仙人湖', '仙人洞村', '荷花', '普者黑村', '普者黑湖', '青龙山'], minutes: 8 },
    { id: 's09', name: '腾冲市和顺古镇景区', group: '老年团', place: '保山·腾冲', nodes: ['景区概况', '侨乡文化', '入口牌坊', '和顺图书馆', '刘氏宗祠', '艾思奇故居'], minutes: 8 },
    { id: 's10', name: '红河哈尼梯田文化景观', group: '商务团', place: '红河', nodes: ['景区概况', '哈尼族文化', '坝达梯田', '多依树梯田', '阿者科村', '老虎嘴梯田'], minutes: 8 },
    { id: 's11', name: '澄江化石地世界自然遗产博物馆', group: '亲子团', place: '玉溪·澄江', nodes: ['博物馆概况', '大厅', '一楼“生命大爆发”展厅', '二楼“生命大演化”展厅', '三楼“生命多样性”展厅'], minutes: 8 },
    { id: 's12', name: '普洱景迈山古茶林文化景观', group: '商务团', place: '普洱·澜沧', nodes: ['景区概况', '民族团结誓词碑', '景迈山古茶林', '普洱茶文化', '翁基古寨', '糯干古寨'], minutes: 8 }
  ];

  /* ---------- 物种池 ----------
   * kind: plant 植物 / fungus 真菌 / algae 藻类 → 温室
   *       animal 动物 → 孵化仓
   * rarity: 1 普通 / 2 稀有 / 3 传说
   * need: 护理动作类型（plantish: water/fert/pest；animal: food/bath/clean）
   */
  const SPECIES = [
    /* ===== 植物 ===== */
    { id: 'p_tea',   name: '云南山茶',   kind: 'plant', rarity: 1, emoji: '🌸', home: '大理·楚雄',  tip: '花大如碗，一树千朵。云南八大名花之首。' },
    { id: 'p_bougain', name: '三角梅',   kind: 'plant', rarity: 1, emoji: '🌺', home: '全省',        tip: '苞片似花，越晒越艳，城市的墙都靠它撑着。' },
    { id: 'p_rhodo', name: '高山杜鹃',   kind: 'plant', rarity: 1, emoji: '💮', home: '迪庆·怒江',  tip: '海拔三千米以上开成花海，当地人叫"山踯躅"。' },
    { id: 'p_clove', name: '滇丁香',     kind: 'plant', rarity: 1, emoji: '🌼', home: '滇中高原',    tip: '雨后香气最浓，云南特有属。' },
    { id: 'p_wangtian', name: '望天树',  kind: 'plant', rarity: 2, emoji: '🌲', home: '西双版纳',    tip: '雨林里的摩天楼，跳伞塔旁抬头看它才知道什么叫高。' },
    { id: 'p_puer',  name: '普洱茶树',   kind: 'plant', rarity: 2, emoji: '🍃', home: '普洱·临沧',  tip: '一片叶子撑起一条古道。越陈越香。' },
    { id: 'p_lotus', name: '地涌金莲',   kind: 'plant', rarity: 2, emoji: '🌻', home: '西双版纳',    tip: '佛家五树六花之一，花开如地上涌出金莲。' },
    { id: 'p_dove',  name: '珙桐·鸽子花', kind: 'plant', rarity: 3, emoji: '🕊️', home: '滇东北',      tip: '第三纪孑遗植物，风一吹满树白鸽。' },

    /* ===== 真菌（云南的浪漫） ===== */
    { id: 'f_bolete', name: '牛肝菌',    kind: 'fungus', rarity: 1, emoji: '🍄', home: '全省松林',   tip: '"菌中之王"的邻居，便宜、好吃、必须炒熟。' },
    { id: 'f_green',  name: '青头菌',    kind: 'fungus', rarity: 1, emoji: '🍄‍🟫', home: '滇中',      tip: '伞面泛青，云南人从小吃到大，最安全的那一口。' },
    { id: 'f_bamboo', name: '竹荪',      kind: 'fungus', rarity: 2, emoji: '🎋', home: '昭通·普洱',  tip: '穿白纱裙的菌子，一朵一朵像小宫女。' },
    { id: 'f_jizong', name: '鸡枞',      kind: 'fungus', rarity: 2, emoji: '🐔', home: '滇南',        tip: '和白蚁共生，挖断蚁巢就再长不出来。' },
    { id: 'f_ganba',  name: '干巴菌',    kind: 'fungus', rarity: 2, emoji: '🥩', home: '昆明·楚雄',  tip: '长得最丑，炒出来最香，价格也最不讲道理。' },
    { id: 'f_ganoderma', name: '灵芝',   kind: 'fungus', rarity: 3, emoji: '🧿', home: '滇西',        tip: '仙草级存在，长在朽木上，一年才增一圈。' },
    { id: 'f_matsutake', name: '松茸',   kind: 'fungus', rarity: 3, emoji: '✨', home: '香格里拉',    tip: '无法人工栽培的傲娇贵族，出土 48 小时香气最好。' },

    /* ===== 藻类 ===== */
    { id: 'a_spirulina', name: '程海螺旋藻', kind: 'algae', rarity: 2, emoji: '🦠', home: '丽江·程海', tip: '高原碱性湖泊里的蓝色奇迹，蛋白质含量极高。' },
    { id: 'a_haicai',    name: '海菜花',     kind: 'algae', rarity: 2, emoji: '🌊', home: '大理洱海',   tip: '只长在清水里，水一脏就绝迹——它是水质的判官。' },
    { id: 'a_water',     name: '水绵',       kind: 'algae', rarity: 1, emoji: '🟢', home: '随处可见',   tip: '水塘里那团绿丝，显微镜下像一串翡翠念珠。' },

    /* ===== 动物 ===== */
    { id: 'n_dog',   name: '土狗·阿黄',  kind: 'animal', rarity: 1, emoji: '🐕', home: '各村落',     tip: '云南乡村的守门神，忠诚又能吃苦。' },
    { id: 'n_pika',  name: '高原鼠兔',   kind: 'animal', rarity: 1, emoji: '🐹', home: '迪庆草原',   tip: '不是老鼠也不是兔子，草原食物链的基石。' },
    { id: 'n_snail', name: '洱海螺',     kind: 'animal', rarity: 1, emoji: '🐌', home: '大理',        tip: '洱海的原住民，慢，但活得比谁都久。' },
    { id: 'n_fish',  name: '大理裂腹鱼', kind: 'animal', rarity: 2, emoji: '🐟', home: '洱海',        tip: '云南特有种，洄游时要在水里"翻山越岭"。' },
    { id: 'n_loris', name: '懒猴·蜂猴',  kind: 'animal', rarity: 2, emoji: '🐒', home: '德宏·普洱',  tip: '唯一的毒猴，也是被宠物贸易伤害最深的猴。' },
    { id: 'n_redpanda', name: '小熊猫',  kind: 'animal', rarity: 2, emoji: '🐾', home: '高黎贡山',   tip: '单独一个科，和大熊猫没多少亲戚关系。' },
    { id: 'n_hornbill', name: '双角犀鸟', kind: 'animal', rarity: 2, emoji: '🦜', home: '盈江·瑞丽',  tip: '繁殖时把妻子封在树洞里养胎，堪称雨林模范丈夫。' },
    { id: 'n_crane', name: '黑颈鹤',     kind: 'animal', rarity: 2, emoji: '🕊️', home: '昭通大山包', tip: '唯一的高原鹤类，冬天在云南的湿地过冬。' },
    { id: 'n_snub',  name: '滇金丝猴',   kind: 'animal', rarity: 3, emoji: '🐒', home: '白马雪山',   tip: '"雪山精灵"，全球仅三千余只，云南独有。' },
    { id: 'n_elephant', name: '亚洲象',  kind: 'animal', rarity: 3, emoji: '🐘', home: '西双版纳',   tip: '2021 年那趟北上旅行，让全世界记住了它们。' },
    { id: 'n_peacock', name: '绿孔雀',   kind: 'animal', rarity: 3, emoji: '🦚', home: '滇中河谷',   tip: '中国唯一的本土孔雀，比蓝孔雀更难得。' }
  ];

  /* ---------- 商店 ---------- */
  const ITEMS = [
    /* 温室用品 */
    { id: 'water',   name: '清水',       kind: 'greenhouse', price: 2,  emoji: '💧', desc: '浇一次水，缓解干渴。' },
    { id: 'fert',    name: '营养液',     kind: 'greenhouse', price: 6,  emoji: '🧪', desc: '施肥一次，明显促进生长。' },
    { id: 'pest',    name: '除虫剂',     kind: 'greenhouse', price: 7,  emoji: '🧴', desc: '喷洒一次，赶走叶片上的小家伙。' },
    /* 孵化仓用品 */
    { id: 'food',    name: '饲料',       kind: 'hatchery',   price: 4,  emoji: '🥣', desc: '喂一次食，填饱肚子。' },
    { id: 'soap',    name: '洗澡泡沫',   kind: 'hatchery',   price: 5,  emoji: '🧼', desc: '洗一次澡，动物精神一整天。' },
    { id: 'shovel',  name: '清洁工具',   kind: 'hatchery',   price: 3,  emoji: '🧹', desc: '清理一次窝，本园最不浪漫但最重要的工作。' },
    /* 药水 */
    { id: 'med_powder', name: '白粉病灵', kind: 'medicine', price: 14, emoji: '🩹', desc: '专治叶面白粉病。' },
    { id: 'med_fungus', name: '菌斑净',   kind: 'medicine', price: 14, emoji: '🩹', desc: '专治菌伞斑点。' },
    { id: 'med_algae',  name: '藻华清',   kind: 'medicine', price: 14, emoji: '🩹', desc: '专治水体富营养化引起的藻华。' },
    { id: 'med_worm',   name: '驱虫滴剂', kind: 'medicine', price: 14, emoji: '💊', desc: '专治体外寄生虫。' },
    { id: 'med_cold',   name: '感冒冲剂', kind: 'medicine', price: 12, emoji: '💊', desc: '专治受凉打喷嚏。' },
    { id: 'med_gut',    name: '肠胃片',   kind: 'medicine', price: 12, emoji: '💊', desc: '专治吃多了闹肚子。' },
    { id: 'med_kit',    name: '百宝药箱', kind: 'medicine', price: 30, emoji: '🧰', desc: '万能药，任何病一箱搞定。' },
    /* 设施与加速 */
    { id: 'slot_green', name: '温室扩展位', kind: 'facility', price: 120, emoji: '🏡', desc: '温室托位 +1（最多 8 个）。' },
    { id: 'slot_hatch', name: '孵化仓扩展位', kind: 'facility', price: 120, emoji: '🏗️', desc: '孵化仓托位 +1（最多 8 个）。' },
    { id: 'hourglass',  name: '加速沙漏',   kind: 'facility', price: 20,  emoji: '⏳', desc: '把一只正在孵化的胶囊进度推进 30 分钟。' }
  ];

  const ITEM_MAP = {};
  ITEMS.forEach(function (i) { ITEM_MAP[i.id] = i; });

  /* ---------- 护理动作 ---------- */
  const CARE = {
    /* 温室 */
    water: { label: '浇水', item: 'water', stat: 'water', amount: 35, grow: 6,  beans: 1, emoji: '💧', verb: '给' },
    fert:  { label: '施肥', item: 'fert',  stat: 'nutri', amount: 42, grow: 14, beans: 2, emoji: '🧪', verb: '给' },
    pest:  { label: '除虫', item: 'pest',  stat: 'clean', amount: 32, grow: 8,  beans: 1, emoji: '🧴', verb: '给' },
    /* 孵化仓 */
    food:  { label: '喂食', item: 'food',   stat: 'nutri', amount: 42, grow: 8,  beans: 1, emoji: '🥣', verb: '喂' },
    bath:  { label: '洗澡', item: 'soap',   stat: 'clean', amount: 38, grow: 6,  beans: 1, emoji: '🧼', verb: '给' },
    clean: { label: '清窝', item: 'shovel', stat: 'clean', amount: 22, grow: 5,  beans: 1, emoji: '🧹', verb: '帮' }
  };

  /* 状态条定义 */
  const STAT_INFO = {
    water: { label: '水分', emoji: '💧', color: '#4EA8DE' },
    nutri: { label: '营养', emoji: '🍯', color: '#E9A13B' },
    clean: { label: '清洁', emoji: '🫧', color: '#7FB069' }
  };

  /* ---------- 疾病 ---------- */
  const ILLNESS = [
    { id: 'il_powder', name: '叶面白粉病', kinds: ['plant'],             cure: 'med_powder', emoji: '🫧' },
    { id: 'il_spot',   name: '菌伞斑点病', kinds: ['fungus'],            cure: 'med_fungus', emoji: '⚫' },
    { id: 'il_bloom',  name: '藻华',       kinds: ['algae'],             cure: 'med_algae',  emoji: '🟩' },
    { id: 'il_worm',   name: '体外寄生虫', kinds: ['animal'],            cure: 'med_worm',   emoji: '🐛' },
    { id: 'il_cold',   name: '着凉',       kinds: ['animal'],            cure: 'med_cold',   emoji: '🤧' },
    { id: 'il_gut',    name: '肠胃不适',   kinds: ['animal'],            cure: 'med_gut',    emoji: '🤢' },
    { id: 'il_wilt',   name: '根系萎蔫',   kinds: ['plant', 'fungus', 'algae'], cure: 'med_kit', emoji: '🥀' }
  ];

  /* ---------- 成长阶段 ---------- */
  const STAGES = [
    { key: 'baby',  name: '幼体', min: 0,   emoji: '🌱' },
    { key: 'teen',  name: '成长', min: 100, emoji: '🌿' },
    { key: 'adult', name: '成熟', min: 300, emoji: '🌳' },
    { key: 'elite', name: '圆满', min: 700, emoji: '🏵️' }
  ];

  /* ---------- 扭蛋 ---------- */
  const GACHA = {
    costPerPull: 1,
    costTenPull: 9,
    rarityRate: { 1: 62, 2: 28, 3: 10 },
    hatchMinutes: { 1: 15, 2: 40, 3: 80 },
    pity: 8 /* 每 8 抽未出稀有及以上，第 9 抽保底稀有 */
  };

  /* ---------- 破壳测验（题库端口） ---------- */
  /* 每次小生物要从温室/孵化仓出来之前，先答一份卷子：
     默认 10 道题、限时 5 分钟、正确率 70% 及以上才准出生。
     题库现在是空的（见下面的 QUESTION_BANK），端口先接好，题什么时候来都行。
     题库为空时，破壳闸门自动放行，按钮上会写明「题库未接入」。 */
  const HATCH_QUIZ = {
    count: 10,        /* 每次抽几道题 */
    minutes: 5,       /* 限时（分钟），到点自动交卷 */
    passRate: 0.7,    /* 及格正确率；10 题 × 70% → 对 7 题及格 */
    minCount: 1       /* 题库不足 10 题时也允许开考，最低题数（按实际题数折算及格线） */
  };
  /* 没过怎么办：可以立刻再答一份全新的卷子（题是新抽的），不限次数、不扣东西。
     这一关的目的是「让你真去练」，不是罚你。想加冷却/扣费的话再说。 */

  /* ---------- 题库（这就是那个「端口」） ----------
     往里加题有两种方式，效果一样：
       A. 直接写在这个数组里（改代码，题会跟着存档走）；
       B. 在「我的」页的「破壳题库」面板里粘贴导入（存本机浏览器，不用改代码）。

     题目对象结构：
     {
       id: 'q_001',            // 可省略，导入时按题干自动生成
       subject: 'law',         // law 法规 | ops 业务 | nat 全导 | loc 地导；可省略
       stem: '题干文字',
       options: ['选项一', '选项二', '选项三', '选项四'],
       answer: 0,              // 正确选项的【下标】，从 0 起：0=第一项
       explain: '解析（可省略）'
     }
     注意 answer 是下标不是序号，第一项是 0。导入时如果写成字符串 'A'/'B'，
     或者文本格式里写「答案:1」，则按人的习惯处理（A=第 1 项，1=第 1 项）。 */
  const QUESTION_BANK = [];

  /* 粘贴导入的文本格式示例（只用于界面上点「填入格式示例」，不会自动入库）。
     每行一题，用竖线 | 分隔：
       题干 | 选项一 | 选项二 | 选项三 | 选项四 | 答案:A | 解析:可省略 | 科目:可省略
     以 # 开头的行是注释，导入时忽略。也支持整段粘贴 JSON 数组。 */
  const QUESTION_TEXT_SAMPLE = [
    '# 一行一题，用竖线 | 分隔；这一行以 # 开头，导入时会被忽略。',
    '# 格式：题干 | 选项1 | 选项2 | 选项3 | 选项4 | 答案:A | 解析:可选 | 科目:可选',
    '【格式示例】下面哪一项是这道题的正确选项？ | 我才是正确的 | 我不是 | 我也不是 | 我更不是 | 答案:A | 解析:答案要写成字母 A/B/C/D，也可以写序号 1/2/3/4。 | 科目:业务',
    '【格式示例】「科目」这一栏可以填什么？ | 只能填法规 | 法规/业务/全导/地导都可以 | 只能填数字 | 不填也行，但不是「只能填法规」 | 答案:B | 解析:科目可以省略；省略的题会算作「未分类」。 | 科目:业务'
  ].join('\n');

  /* 状态衰减：每分钟衰减点数（约 45 分钟掉 1 点） */
  const DECAY_PER_MIN = 1 / 45;
  const NEGLECT_MINUTES_BEFORE_SICK = 120; /* 某项归零持续 2 小时后开始可能生病 */
  const SICK_CHANCE_PER_HOUR = 0.22;

  /* ---------- 任务库 ---------- */
  /* kolb: CE 具体经验 / RO 反思观察 / AC 抽象概念化 / AE 主动实验 */
  /* verify: quiz 刷题登记 | record 录音 | feynman 费曼卡 | reading 精读登记
   *         note 一句话登记（做了就是做了：写一句当场发奖，不攒碎片、不设间隔）
   *   note:   { minChars 这句至少几个字, prompts 引导语（第一条展示在输入框上） }
   *   reading:{ minChars 必答「读了什么」最少几个字, optionalPhoto 是否给一个选填的上传位 }
   * split: 'subject' 这条任务会按四科拆成四条独立任务，各算各的
   * pick:  'book'    结算时由你自己决定这道题属于哪一本课本
   *
   * core: true  = 每日投喂单的固定 6 件之一（进度条只数这 6 件）
   * coreLabel   = 进度条上那个小格子的名字（四科刷题填 '{subject}'，会换成"法规/业务/全导/地导"）
   * 没有 core 的 = 加餐：做不做都行，不计入 6 件，也不影响当天"全清"。
   */
  const TASK_LIBRARY = [
    /* ============ 阶段一 ============ */
    {
      id: 'p1_read', phase: [1], title: '课本精读（读哪本你定）', core: true, coreLabel: '读书',
      kolb: 'CE', icon: '📖',
      desc: '每天登记一次：今天读了哪一本、读到哪里（章节 / 页数）。笔记和感想选填，愿意写就写两句。一本书计划 8 天。别抄书，边读边问自己"如果我要讲给一个外国人听，我会怎么讲"。',
      reward: { tickets: 2, beans: 40 },
      verify: { type: 'reading', minChars: 6, optionalPhoto: true }
    },
    {
      id: 'p1_quiz', phase: [1], title: '刷题 · {subject} 30 道', core: true, coreLabel: '{subject}',
      kolb: 'CE', icon: '✍️',
      split: 'subject',
      desc: '每科单独算一笔，30 道就够。做完回来登记题量和正确率，拍一张准题库的结果页。哪一科留着没做，一眼就看得到。',
      reward: { tickets: 1, beans: 12 },
      verify: { type: 'quiz', minQuestions: 30 },
      need: { photo: true }
    },
    {
      id: 'p1_script_read', phase: [1], title: '导游词通读：{script}', core: true, coreLabel: '导游词',
      kolb: 'CE', icon: '🎧',
      desc: '出声朗读今日导游词，按官方讲解顺序走一遍。可以分两三次录，累计够 3 分钟就行——等电梯、走路上都能念一段。这一阶段只要求"读顺"。',
      reward: { tickets: 1, beans: 30 },
      verify: { type: 'record', minMinutes: 3 }
    },

    /* ===== 加餐：不计入每日 6 件，做不做都行 ===== */
    {
      id: 'p1_exercise', phase: [1], title: '课后练习 · 今日章节配套习题', kolb: 'AE', icon: '📝',
      pick: 'book',
      desc: '课本每章后面那套课后习题，趁热做掉。登记题量和正确率就行，不用截图。做完当场对答案——趁你还记得当时是怎么想的，错了才看得出卡在哪。',
      reward: { tickets: 1, beans: 18 },
      verify: { type: 'quiz', minQuestions: 10 }
    },
    {
      id: 'p1_frame', phase: [1], title: '章节框架图 · 今天这一章', kolb: 'AC', icon: '🕸️',
      desc: '合上书，把今天读的这一章画成一张骨架图（章节 → 考点 → 易错点）。画得丑没关系，重点是"合上书还画得出来"。写完拍一张留档。',
      reward: { tickets: 1, beans: 22 },
      verify: {
        type: 'note', minChars: 24,
        prompts: ['这一章的骨架是……', '最容易考的一点 / 我最容易错的一点是……']
      },
      need: { photo: true }
    },
    {
      id: 'p1_selfcheck', phase: [1, 2], title: '合书自测 10 题', kolb: 'AE', icon: '🎯',
      desc: '合上书，自己给自己出 10 道题再自己答。出题比答题更接近考试——出题的时候你必须先判断"哪里重要"。登记题量和自测正确率。',
      reward: { tickets: 0, beans: 14 },
      verify: { type: 'quiz', minQuestions: 10 }
    },

    {
      id: 'p1_script_recite', phase: [1], title: '合稿默讲：{script}', kolb: 'AE', icon: '🎤',
      repeat: { every: 2 },
      desc: '合上稿子把这篇讲一遍并录音。系统会自动轮换景点，每篇讲够 2 次就算拿下——差不多就是"每 4 天背下一篇"的节奏。卡壳的地方记下来，下一轮重点攻。',
      reward: { tickets: 2, beans: 50 },
      verify: { type: 'record', minMinutes: 2 }
    },
    {
      id: 'p1_reflect', phase: [1, 2, 3], title: '昨日回照 · 两句话', kolb: 'RO', icon: '🔍',
      desc: '翻回昨天学过的一节，写两句话：一句是"我现在能讲清楚的"，一句是"我还是模糊的"。不抄题、不整理，就两句话。模糊的那句，明天你会自然想去补它。',
      reward: { tickets: 1, beans: 25 },
      verify: {
        type: 'note', minChars: 20,
        prompts: ['我现在能讲清楚的一点是……', '我还是有点模糊的一点是……']
      }
    },
    {
      id: 'p1_feynman', phase: [1, 2, 3], title: '费曼工作坊：讲给{pet}听', kolb: 'AC', icon: '🗣️',
      desc: '选一个今天学到的概念，用"小学生都能听懂"的话讲一遍。写不下去的地方，就是你真正的漏洞。',
      reward: { tickets: 1, beans: 30 },
      verify: { type: 'feynman', minCards: 1, minChars: 40 }
    },

    /* ============ 阶段二 ============ */
    {
      id: 'p2_course', phase: [2], title: '网课磨耳朵 · 两段笔记', core: true, coreLabel: '网课',
      kolb: 'CE', icon: '🎬',
      desc: '开准题库网课。听一段回来登记一句"刚才老师讲了什么"，做完登记截图就行。不用一口气听完，磨耳朵本来就该一段一段来。',
      reward: { tickets: 1, beans: 35 },
      verify: {
        type: 'note', minChars: 24,
        prompts: ['这段网课我记住的关键词是……', '老师反复强调的一点是……']
      },
      need: { photo: true }
    },
    {
      id: 'p2_deep', phase: [2], title: '单科深挖：{subject}', kolb: 'AC', icon: '🔬',
      desc: '今天只研究这一科。合上书，自己画一张知识框架（章节—考点—易错点），再写一张费曼卡把它讲出来。框架比背原文值钱。',
      reward: { tickets: 2, beans: 45 },
      verify: {
        type: 'note', minChars: 24,
        prompts: ['这一科我先搭的框架是……', '合上书，我能复述出来的是……']
      },
      need: { feynman: 1 }
    },
    {
      id: 'p2_mock', phase: [2], title: '模考一次（每 3 天）', kolb: 'AE', icon: '📝',
      repeat: { every: 3 },
      desc: '完整做一套模考，对答案、登记分数，然后回看失分集中在哪个知识点。模考的价值在考后那 30 分钟。',
      reward: { tickets: 3, beans: 80 },
      verify: { type: 'quiz', minQuestions: 100, needScore: true },
      need: { photo: true }
    },
    {
      id: 'p2_script', phase: [2], title: '导游词梳理背诵：{script}', core: true, coreLabel: '导游词',
      kolb: 'RO', icon: '🎤',
      desc: '不再照着读。先默讲，再回看稿子补漏，然后录第二遍。两遍之间的差距就是你的进步。可以分次录。',
      reward: { tickets: 1, beans: 40 },
      verify: { type: 'record', minMinutes: 3 }
    },
    {
      id: 'p2_quiz_keep', phase: [2, 3], title: '保持手感 · {subject} 15 道', core: true, coreLabel: '{subject}',
      kolb: 'CE', icon: '✍️',
      split: 'subject',
      desc: '不用多，每科 15 道，但每天不断。重点是别让手感凉掉。',
      reward: { tickets: 0, beans: 9 },
      verify: { type: 'quiz', minQuestions: 15 },
      need: { photo: false }
    },

    /* ============ 阶段三 ============ */
    {
      id: 'p3_mock', phase: [3], title: '冲刺套题 / 模考', core: true, coreLabel: '套题',
      kolb: 'AE', icon: '📝',
      desc: '按考试时间完整刷一套。不查资料、不暂停，逼出真实水平。',
      reward: { tickets: 3, beans: 70 },
      verify: { type: 'quiz', minQuestions: 100, needScore: true },
      need: { photo: true }
    },
    {
      id: 'p3_script_full', phase: [3], title: '导游词全流程口述：{script}', core: true, coreLabel: '导游词',
      kolb: 'AE', icon: '🎙️',
      desc: '从"各位游客大家好"开始，到"谢谢大家"结束，一次讲完不停顿。这就是考场上的样子。',
      reward: { tickets: 2, beans: 50 },
      verify: { type: 'record', minMinutes: 4 }
    },
    {
      id: 'p3_law', phase: [3], title: '法规与时政速记', kolb: 'AC', icon: '⚖️',
      desc: '法规条文用"数字+关键词"记（时限、金额、比例）。今天重点记 3 条，用费曼卡复述一遍。',
      reward: { tickets: 1, beans: 35 },
      verify: {
        type: 'note', minChars: 24,
        prompts: ['今天记住的数字 / 关键词是……', '这一条我用自己的话说是……']
      },
      need: { feynman: 1 }
    }
  ];

  /* ---------- 成就 ---------- */
  const ACHIEVEMENTS = [
    { id: 'ach_first_egg',  name: '第一颗胶囊', desc: '扭到你的第一颗胶囊',       reward: { tickets: 1, beans: 20 }, check: function (s) { return s.stats.totalPulls >= 1; } },
    { id: 'ach_first_pet',  name: '破壳而出',   desc: '孵化出第一只小生物',       reward: { tickets: 1, beans: 30 }, check: function (s) { return s.stats.totalHatched >= 1; } },
    { id: 'ach_hatch_10',   name: '乐园初成',   desc: '累计孵化 10 只',           reward: { tickets: 2, beans: 60 }, check: function (s) { return s.stats.totalHatched >= 10; } },
    { id: 'ach_hatch_30',   name: '云雾缭绕',   desc: '累计孵化 30 只',           reward: { tickets: 4, beans: 120 }, check: function (s) { return s.stats.totalHatched >= 30; } },
    { id: 'ach_species_6',  name: '多样性样本', desc: '收集 6 个不同物种',         reward: { tickets: 2, beans: 50 }, check: function (s) { return s.stats.uniqueSpecies >= 6; } },
    { id: 'ach_species_12', name: '基因库',     desc: '收集 12 个不同物种',       reward: { tickets: 4, beans: 120 }, check: function (s) { return s.stats.uniqueSpecies >= 12; } },
    { id: 'ach_legend',     name: '传说降临',   desc: '获得一只传说级生物',       reward: { tickets: 3, beans: 80 }, check: function (s) { return s.stats.legendOwned >= 1; } },
    { id: 'ach_care_50',    name: '勤劳园丁',   desc: '累计护理 50 次',           reward: { tickets: 1, beans: 40 }, check: function (s) { return s.stats.careCount >= 50; } },
    { id: 'ach_care_300',   name: '乐园守护者', desc: '累计护理 300 次',          reward: { tickets: 4, beans: 150 }, check: function (s) { return s.stats.careCount >= 300; } },
    { id: 'ach_heal_5',     name: '妙手回春',   desc: '治好 5 次生病',            reward: { tickets: 2, beans: 50 }, check: function (s) { return s.stats.healedCount >= 5; } },
    { id: 'ach_adult_3',    name: '养到成熟',   desc: '3 只生物成长到"成熟"',     reward: { tickets: 2, beans: 60 }, check: function (s) { return s.stats.adultCount >= 3; } },
    { id: 'ach_elite_1',    name: '圆满之证',   desc: '1 只生物成长到"圆满"',     reward: { tickets: 5, beans: 200 }, check: function (s) { return s.stats.eliteCount >= 1; } },

    /* 学习向成就 */
    { id: 'ach_streak_3',   name: '三天之约',   desc: '连续打卡 3 天',            reward: { tickets: 1, beans: 30 }, check: function (s) { return s.stats.bestStreak >= 3; } },
    { id: 'ach_streak_7',   name: '一周不辍',   desc: '连续打卡 7 天',            reward: { tickets: 2, beans: 60 }, check: function (s) { return s.stats.bestStreak >= 7; } },
    { id: 'ach_streak_21',  name: '习惯成型',   desc: '连续打卡 21 天',           reward: { tickets: 5, beans: 150 }, check: function (s) { return s.stats.bestStreak >= 21; } },
    { id: 'ach_streak_45',  name: '铁人',       desc: '连续打卡 45 天',           reward: { tickets: 8, beans: 300 }, check: function (s) { return s.stats.bestStreak >= 45; } },
    { id: 'ach_note_10',   name: '随手笔记',   desc: '累计写下 10 条学习笔记',   reward: { tickets: 1, beans: 40 }, check: function (s) { return (s.stats.notes || 0) >= 10; } },
    { id: 'ach_note_50',   name: '笔记成习',   desc: '累计写下 50 条学习笔记',   reward: { tickets: 3, beans: 120 }, check: function (s) { return (s.stats.notes || 0) >= 50; } },
    { id: 'ach_note_200',  name: '笔记等身',   desc: '累计写下 200 条学习笔记',  reward: { tickets: 8, beans: 300 }, check: function (s) { return (s.stats.notes || 0) >= 200; } },
    { id: 'ach_q_1000',     name: '千题斩',     desc: '累计刷题 1000 道',         reward: { tickets: 2, beans: 80 }, check: function (s) { return s.stats.questions >= 1000; } },
    { id: 'ach_q_5000',     name: '五千题',     desc: '累计刷题 5000 道',         reward: { tickets: 5, beans: 200 }, check: function (s) { return s.stats.questions >= 5000; } },
    { id: 'ach_q_10000',    name: '题海归来',   desc: '累计刷题 10000 道',        reward: { tickets: 10, beans: 400 }, check: function (s) { return s.stats.questions >= 10000; } },
    { id: 'ach_book_1',     name: '第一本书',   desc: '完成 1 本书的精读计划',     reward: { tickets: 2, beans: 60 }, check: function (s) { return s.stats.booksDone >= 1; } },
    { id: 'ach_book_4',     name: '四书通关',   desc: '四本课本全部读完一遍',     reward: { tickets: 6, beans: 250 }, check: function (s) { return s.stats.booksDone >= 4; } },
    { id: 'ach_script_6',   name: '口若悬河',   desc: '背下 6 篇导游词',           reward: { tickets: 3, beans: 100 }, check: function (s) { return s.stats.scriptsMastered >= 6; } },
    { id: 'ach_script_12',  name: '十二景在心', desc: '12 篇导游词全部背下',       reward: { tickets: 8, beans: 300 }, check: function (s) { return s.stats.scriptsMastered >= 12; } },
    { id: 'ach_feynman_20', name: '费曼学徒',   desc: '产出 20 张费曼卡',          reward: { tickets: 2, beans: 70 }, check: function (s) { return s.stats.feynmanCards >= 20; } },
    { id: 'ach_feynman_60', name: '费曼讲师',   desc: '产出 60 张费曼卡',          reward: { tickets: 5, beans: 200 }, check: function (s) { return s.stats.feynmanCards >= 60; } },
    { id: 'ach_mock_10',    name: '十次模考',   desc: '完成 10 次模考',            reward: { tickets: 3, beans: 120 }, check: function (s) { return s.stats.mockCount >= 10; } },
    { id: 'ach_species_20', name: '物种图谱',   desc: '收集 20 个不同物种',        reward: { tickets: 5, beans: 200 }, check: function (s) { return s.stats.uniqueSpecies >= 20; } },
    { id: 'ach_kolb_7',     name: '完整学习圈', desc: '7 天集齐库伯四象限',        reward: { tickets: 5, beans: 180 }, check: function (s) { return s.stats.kolbFullDays >= 7; } },
    { id: 'ach_feed_7',     name: '七日喂饱',   desc: '7 天把投喂单的 6 件全喂满', reward: { tickets: 3, beans: 100 }, check: function (s) { return (s.stats.fullFeedDays || 0) >= 7; } },
    { id: 'ach_feed_30',    name: '喂猫成瘾',   desc: '30 天把投喂单的 6 件全喂满', reward: { tickets: 8, beans: 300 }, check: function (s) { return (s.stats.fullFeedDays || 0) >= 30; } },
    { id: 'ach_phase1_clear', name: '全刷完成', desc: '走完 35 天全刷阶段',        reward: { tickets: 6, beans: 250 }, check: function (s) { return s.stats.daysPassed >= 35; } },
    { id: 'ach_no_sick_7',  name: '零生病周',   desc: '连续 7 天没有生物生病',     reward: { tickets: 2, beans: 80 }, check: function (s) { return s.stats.noSickStreak >= 7; } }
  ];

  /* ---------- 库伯学习圈说明 ---------- */
  const KOLB = [
    { key: 'CE', name: '具体经验', sub: 'Concrete Experience', emoji: '🌱', color: '#7FB069', desc: '先下水。读、听、刷，先积累真实体验。' },
    { key: 'RO', name: '反思观察', sub: 'Reflective Observation', emoji: '🔍', color: '#4EA8DE', desc: '回头看。把今天学的和昨天学的对一下，问"哪里还没通"。' },
    { key: 'AC', name: '抽象概念化', sub: 'Abstract Conceptualization', emoji: '🧩', color: '#E9A13B', desc: '提炼规律。画框架、造口诀，把零散知识连成网。' },
    { key: 'AE', name: '主动实验', sub: 'Active Experimentation', emoji: '🚀', color: '#C4708E', desc: '用出去。模考、默讲、讲给别人听，检验是否真的会了。' }
  ];

  return {
    EXAM_DATE: EXAM_DATE,
    PHASES: PHASES,
    BOOK_DAYS: BOOK_DAYS,
    SUBJECTS: SUBJECTS,
    SCRIPTS: SCRIPTS,
    SPECIES: SPECIES,
    ITEMS: ITEMS,
    ITEM_MAP: ITEM_MAP,
    CARE: CARE,
    STAT_INFO: STAT_INFO,
    ILLNESS: ILLNESS,
    STAGES: STAGES,
    GACHA: GACHA,
    HATCH_QUIZ: HATCH_QUIZ,
    QUESTION_BANK: QUESTION_BANK,
    QUESTION_TEXT_SAMPLE: QUESTION_TEXT_SAMPLE,
    DECAY_PER_MIN: DECAY_PER_MIN,
    NEGLECT_MINUTES_BEFORE_SICK: NEGLECT_MINUTES_BEFORE_SICK,
    SICK_CHANCE_PER_HOUR: SICK_CHANCE_PER_HOUR,
    TASK_LIBRARY: TASK_LIBRARY,
    ACHIEVEMENTS: ACHIEVEMENTS,
    KOLB: KOLB
  };
})();
