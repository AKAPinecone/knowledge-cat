/* =========================================================
 * 知识喂了猫 · 破壳题库（题库端口）
 * ---------------------------------------------------------
 * 这里完全不关心题目从哪来、考什么知识点，只做四件事：
 *   1) 汇总题库（data.js 里写的 + 自己粘贴导入的）
 *   2) 抽一份卷子（按科目配平 + 选项乱序）
 *   3) 判卷（按 HATCH_QUIZ.passRate 算及格线）
 *   4) 把粘贴来的文本 / JSON 解析成题目对象
 * 题库为空时一切「安全地不生效」，破壳闸门自动放行。
 * ========================================================= */
window.QBank = (function () {
  const D = window.GAME_DATA;

  function cfg() { return D.HATCH_QUIZ || { count: 10, minutes: 5, passRate: 0.7, minCount: 1 }; }
  function st() { return window.Store.state; }

  /* ---------------- 小工具 ---------------- */
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function hash(s) {
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
    return h.toString(36);
  }
  function sig(q) { return hash(q.stem + '|' + q.options.join('|')); }

  /* 科目：id / 简称 / 全称 / 科目号都能认 */
  function normSubject(v) {
    if (!v) return '';
    const s = String(v).trim().toLowerCase();
    if (!s) return '';
    const SUB = D.SUBJECTS || [];
    for (let i = 0; i < SUB.length; i++) {
      const x = SUB[i];
      const names = [x.id, x.name, x.short, x.book, x.emoji].filter(Boolean).map(function (n) { return String(n).toLowerCase(); });
      if (names.indexOf(s) >= 0) return x.id;
      if (s.indexOf(String(x.short)) >= 0 || s.indexOf(String(x.name)) >= 0) return x.id;
    }
    return '';
  }
  function subjectName(id) {
    const x = (D.SUBJECTS || []).filter(function (s) { return s.id === id; })[0];
    return x ? x.short : '未分类';
  }

  /* 答案 token → 下标。字母 A 起算；纯数字按人的习惯 1 起算。 */
  function answerIndex(token, optCount) {
    if (token === null || token === undefined) return -1;
    const t = String(token).trim();
    if (!t) return -1;
    const m = t.match(/[A-Ha-h]/);
    if (/^[A-Ha-h]$/.test(t)) return m[0].toUpperCase().charCodeAt(0) - 65;
    const d = t.match(/^\d+$/);
    if (d) {
      const n = parseInt(t, 10);
      if (n === 0) return 0;         /* 0 当成下标 0，容错 */
      return n - 1;                  /* 1 起算 */
    }
    return -1;
  }

  /* 去掉选项前面的 "A." "B、" "(C)" "选项D：" 之类的序号 */
  function stripLabel(s) {
    const raw = String(s === undefined || s === null ? '' : s).trim();
    const out = raw.replace(/^\s*[（(【\[]?\s*[A-Ha-h]\s*[)）】\]]?\s*[.、．,:：，)]\s*/, '').trim();
    return out || raw;
  }

  /* ---------------- 规范化一道题 ---------------- */
  /* 接受两种 answer 写法：
     - 数字 → 当下标（JSON 里写 0 就是第一项）
     - 字符串 → 按人的习惯（'A' = 第一项，'1' = 第一项） */
  function normalize(q) {
    if (!q || typeof q !== 'object') return null;
    const stem = String(q.stem || q.q || q.title || q.question || '').trim();
    let options = q.options || q.opts || q.choices || [];
    if (!Array.isArray(options)) options = [options];
    options = options.map(function (o) { return String(o === undefined || o === null ? '' : o).trim(); })
      .filter(function (o) { return o !== ''; });

    let ans;
    if (typeof q.answer === 'number') ans = q.answer;
    else if (typeof q.answer === 'string') ans = answerIndex(q.answer, options.length);
    else if (typeof q.correct === 'number') ans = q.correct;
    else ans = -1;
    ans = parseInt(ans, 10);

    if (!stem || options.length < 2) return null;
    if (!(ans >= 0 && ans < options.length)) return null;

    return {
      id: String(q.id || ('q_' + hash(stem + '|' + options.join('|')))),
      subject: normSubject(q.subject || q.subjectId || q.kemu),
      stem: stem,
      options: options,
      answer: ans,
      explain: String(q.explain || q.exp || q.analysis || '').trim()
    };
  }

  /* ---------------- 题库汇总 ---------------- */
  function builtin() {
    return (D.QUESTION_BANK || []).map(normalize).filter(Boolean);
  }
  function custom() {
    const arr = (st() && st().qbank) || [];
    return arr.map(normalize).filter(Boolean);
  }
  function all() {
    const seen = {}, out = [];
    builtin().concat(custom()).forEach(function (q) {
      const k = sig(q);
      if (seen[k]) return;
      seen[k] = 1;
      out.push(q);
    });
    return out;
  }
  function count() { return all().length; }
  function isReady() { return count() >= cfg().count; }

  function summary() {
    const list = all();
    const by = {};
    list.forEach(function (q) { const k = q.subject || 'other'; by[k] = (by[k] || 0) + 1; });
    const need = cfg().count;
    return {
      total: list.length,
      builtin: builtin().length,
      custom: custom().length,
      need: need,
      ready: list.length >= need,
      shortage: Math.max(0, need - list.length),
      bySubject: by,
      passLine: passLine(Math.min(need, list.length) || need),
      minutes: cfg().minutes,
      passRate: cfg().passRate
    };
  }

  /* ---------------- 抽卷 ---------------- */
  /* 按科目轮流取，让一张卷子尽量四科都沾到；没有科目标记的算「未分类」 */
  function pickPool(n) {
    const pool = all();
    if (!pool.length) return [];
    if (n >= pool.length) return shuffle(pool);
    const groups = {};
    shuffle(pool).forEach(function (q) {
      const k = q.subject || 'other';
      (groups[k] = groups[k] || []).push(q);
    });
    const keys = shuffle(Object.keys(groups));
    const out = [];
    let guard = 0;
    while (out.length < n && guard++ < 1000) {
      let moved = false;
      for (let i = 0; i < keys.length && out.length < n; i++) {
        const g = groups[keys[i]];
        if (g.length) { out.push(g.shift()); moved = true; }
      }
      if (!moved) break;
    }
    return shuffle(out);
  }

  /* 生成一份卷子：选项顺序也会打乱（否则答案位置固定，记字母就能蒙） */
  function makePaper(n) {
    const want = Math.max(1, Math.min(n || cfg().count, count()));
    return pickPool(want).map(function (q) {
      const order = shuffle(q.options.map(function (_, i) { return i; }));
      return {
        qid: q.id,
        subject: q.subject,
        stem: q.stem,
        options: order.map(function (i) { return q.options[i]; }),
        answer: order.indexOf(q.answer),   /* 正确项在新顺序里的位置 */
        explain: q.explain
      };
    });
  }

  /* ---------------- 判卷 ---------------- */
  function passLine(total) {
    return Math.max(1, Math.ceil((total || 0) * cfg().passRate));
  }
  function grade(paper, answers) {
    let correct = 0;
    const detail = (paper || []).map(function (p, i) {
      const a = (answers && answers[i] !== undefined && answers[i] !== null) ? answers[i] : -1;
      const ok = a === p.answer;
      if (ok) correct++;
      return { i: i, picked: a, answer: p.answer, ok: ok };
    });
    const total = detail.length;
    const line = passLine(total);
    return {
      total: total,
      correct: correct,
      line: line,
      rate: total ? correct / total : 0,
      passed: total > 0 && correct >= line,
      detail: detail
    };
  }

  /* ---------------- 粘贴导入 ---------------- */
  function parseText(text) {
    const res = { list: [], errors: [] };
    const raw = String(text === undefined || text === null ? '' : text);
    if (!raw.trim()) { res.errors.push('内容是空的'); return res; }

    const trimmed = raw.trim();

    /* 整段 JSON 也认 */
    if (trimmed.charAt(0) === '[' || trimmed.charAt(0) === '{') {
      let obj;
      try { obj = JSON.parse(trimmed); }
      catch (e) { res.errors.push('看起来是 JSON，但解析失败：' + e.message); return res; }
      const arr = Array.isArray(obj) ? obj : (obj.questions || obj.list || []);
      if (!Array.isArray(arr)) { res.errors.push('JSON 里没找到题目数组'); return res; }
      arr.forEach(function (q, i) {
        const n = normalize(q);
        if (!n) res.errors.push('JSON 第 ' + (i + 1) + ' 题字段不全，已跳过');
        else res.list.push(n);
      });
      return res;
    }

    /* 一行一题的竖线文本 */
    const lines = raw.split(/\r?\n/);
    const seen = {};
    lines.forEach(function (line, idx) {
      const ln = line.trim();
      if (!ln || ln.charAt(0) === '#' || ln.indexOf('//') === 0) return;
      const no = '第 ' + (idx + 1) + ' 行';
      const parts = ln.split(/\s*[|｜\t]\s*/).map(function (p) { return p.trim(); });
      if (parts.length < 4) { res.errors.push(no + '字段太少（至少：题干 | 选项 | 选项 | 答案:）'); return; }

      const stem = stripLabel(parts.shift());
      const options = [];
      let answer = null, explain = '', subject = '';

      parts.forEach(function (p) {
        /* 答案栏要求「整格就是 关键词 + 单个答案记号」，否则 "正确选项 A" 这种
           选项文本会被误当成答案栏吃掉（踩过这个坑）。 */
        const mA = p.match(/^\s*(?:答案|answer|正确答案|correct)\s*[:：]?\s*([A-Ha-h]|[1-9])\s*$/i);
        const mE = p.match(/^\s*(?:解析|explain|说明|分析)\s*[:：]?\s*([\s\S]*)$/i);
        const mS = p.match(/^\s*(?:科目|subject|kemu)\s*[:：]?\s*(.+)$/i);
        if (mA) { answer = answerIndex(mA[1], 0); return; }
        if (mE) { explain = mE[1].trim(); return; }
        if (mS) { subject = normSubject(mS[1]); return; }
        options.push(stripLabel(p));
      });

      if (!stem) { res.errors.push(no + '没读到题干'); return; }
      if (options.length < 2) { res.errors.push(no + '选项少于 2 个'); return; }
      if (answer === null) { res.errors.push(no + '没找到「答案:」（写成 答案:A 或 答案:1）'); return; }
      if (!(answer >= 0 && answer < options.length)) {
        res.errors.push(no + '答案超出选项范围（只有 ' + options.length + ' 个选项）');
        return;
      }
      const q = normalize({ stem: stem, options: options, answer: answer, explain: explain, subject: subject });
      if (!q) { res.errors.push(no + '字段不完整'); return; }
      if (seen[sig(q)]) { res.errors.push(no + '和前面某题重复，已跳过'); return; }
      seen[sig(q)] = 1;
      res.list.push(q);
    });
    return res;
  }

  /* 导进入库（自动去重，重复的不再加） */
  function addBatch(list) {
    const s = st();
    if (!s) return { added: 0, skipped: (list || []).length, total: 0 };
    s.qbank = s.qbank || [];
    const bySig = {}, byId = {};
    s.qbank.forEach(function (q) { byId[q.id] = 1; bySig[sig(normalize(q) || { stem: '', options: [] })] = 1; });
    let added = 0, skipped = 0;
    (list || []).forEach(function (raw) {
      const q = normalize(raw);
      if (!q) { skipped++; return; }
      const k = sig(q);
      if (bySig[k] || byId[q.id]) { skipped++; return; }
      bySig[k] = 1; byId[q.id] = 1;
      s.qbank.push(q);
      added++;
    });
    window.Store.save(true);
    return { added: added, skipped: skipped, total: s.qbank.length };
  }

  function clearCustom() {
    const s = st();
    if (!s) return 0;
    const n = (s.qbank || []).length;
    s.qbank = [];
    window.Store.save(true);
    return n;
  }

  function removeOne(id) {
    const s = st();
    if (!s) return;
    const before = (s.qbank || []).length;
    s.qbank = (s.qbank || []).filter(function (q) { return q.id !== id; });
    window.Store.save(true);
    return before - s.qbank.length;
  }

  /* 本次测验成绩记账 + 存档一份凭证 */
  function recordResult(res, capId, speciesName) {
    const s = st();
    if (s) {
      s.stats.quizAttempts = (s.stats.quizAttempts || 0) + 1;
      s.stats.quizAnswered = (s.stats.quizAnswered || 0) + res.total;
      s.stats.quizCorrect = (s.stats.quizCorrect || 0) + res.correct;
      if (res.passed) s.stats.quizPassed = (s.stats.quizPassed || 0) + 1;
      window.Store.pushLog((res.passed ? '✅ ' : '❌ ') + '破壳测验 ' + res.correct + '/' + res.total +
        '（及格 ' + res.line + ' 题）' + (res.passed ? '，小生物可以出来了。' : '，还差一点。'));
      window.Store.save(true);
    }
    /* 分数也丢进证据库，日后再看得到「为了这只小生物我答过几份卷子」 */
    return window.Store.addEvidence({
      type: 'quiz',
      taskId: 'hatch:' + capId,
      label: '破壳测验 · ' + (speciesName || '小生物'),
      text: '成绩 ' + res.correct + '/' + res.total + '（正确率 ' + Math.round(res.rate * 100) + '%，及格线 ' + res.line + ' 题）' +
        (res.passed ? ' —— 通过，小生物顺利出生。' : ' —— 未通过，需要再来一份。')
    });
  }

  return {
    count: count,
    isReady: isReady,
    summary: summary,
    all: all,
    makePaper: makePaper,
    grade: grade,
    passLine: passLine,
    parseText: parseText,
    addBatch: addBatch,
    clearCustom: clearCustom,
    removeOne: removeOne,
    recordResult: recordResult,
    normalize: normalize,
    normSubject: normSubject,
    subjectName: subjectName,
    shuffle: shuffle
  };
})();
