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

  function cfg() { return D.HATCH_QUIZ || { count: 1, minutes: 0, passRate: 0.7, minCount: 1 }; }
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
  /* 多选题答案：逗号/顿号/中文逗号分隔的字母或数字，返回去重后排序的下标数组 */
  function answerIndices(token, optCount) {
    if (token === null || token === undefined) return [];
    const t = String(token).trim();
    if (!t) return [];
    const parts = t.split(/[,，、\s]+/).filter(function (x) { return x !== ''; });
    const idxs = [];
    parts.forEach(function (p) {
      const i = answerIndex(p, optCount);
      if (i >= 0 && i < optCount && idxs.indexOf(i) < 0) idxs.push(i);
    });
    return idxs.sort(function (a, b) { return a - b; });
  }

  /* 去掉选项前面的 "A." "B、" "(C)" "选项D：" 之类的序号 */
  function stripLabel(s) {
    const raw = String(s === undefined || s === null ? '' : s).trim();
    const out = raw.replace(/^\s*[（(【\[]?\s*[A-Ha-h]\s*[)）】\]]?\s*[.、．,:：，)]\s*/, '').trim();
    return out || raw;
  }

  /* ---------------- 规范化一道题 ---------------- */
  /* 接受 answer 写法：
     - 单选：数字 / 单字母 / 单数字字符串
     - 多选：数字数组，或逗号分隔的字母/数字字符串（如 "A,C,D"）
     内部统一存成“下标数组”，multi 标记 true/false。 */
  function normalize(q) {
    if (!q || typeof q !== 'object') return null;
    const stem = String(q.stem || q.q || q.title || q.question || '').trim();
    let options = q.options || q.opts || q.choices || [];
    if (!Array.isArray(options)) options = [options];
    options = options.map(function (o) { return String(o === undefined || o === null ? '' : o).trim(); })
      .filter(function (o) { return o !== ''; });

    const forceMulti = q.type === 'multi' || q.multi === true || String(q.type).toLowerCase() === 'multiple';

    let ansArr = [];
    if (Array.isArray(q.answer)) {
      q.answer.forEach(function (x) {
        const i = (typeof x === 'number') ? Math.floor(x) : answerIndex(x, options.length);
        if (i >= 0 && i < options.length && ansArr.indexOf(i) < 0) ansArr.push(i);
      });
      ansArr.sort(function (a, b) { return a - b; });
    } else if (typeof q.answer === 'string' && /[,，、]/.test(q.answer)) {
      ansArr = answerIndices(q.answer, options.length);
    } else if (typeof q.answer === 'string') {
      const i = answerIndex(q.answer, options.length);
      if (i >= 0) ansArr = [i];
    } else if (typeof q.answer === 'number') {
      const i = Math.floor(q.answer);
      if (i >= 0 && i < options.length) ansArr = [i];
    } else if (typeof q.correct === 'number') {
      const i = Math.floor(q.correct);
      if (i >= 0 && i < options.length) ansArr = [i];
    }

    if (!stem || options.length < 2) return null;
    if (!ansArr.length) return null;
    if (ansArr.some(function (i) { return i < 0 || i >= options.length; })) return null;

    const isMulti = forceMulti || ansArr.length > 1;

    return {
      id: String(q.id || ('q_' + hash(stem + '|' + options.join('|')))),
      subject: normSubject(q.subject || q.subjectId || q.kemu),
      stem: stem,
      options: options,
      answer: ansArr,
      multi: isMulti,
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
  function pickPool(n, pool) {
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

  /* 生成一份卷子：
     - 选项顺序打乱
     - opts.mastered 为 true 时排除已掌握题（默认 true）
     - opts.excludeIds 为数组/Set 时排除这些题（用于“重做不能一样”） */
  function makePaper(n, opts) {
    opts = opts || {};
    const mastered = (opts.mastered !== false) ? (st() && st().masteredQuestions) || {} : {};
    const excludeIds = new Set();
    if (opts.excludeIds) {
      (Array.isArray(opts.excludeIds) ? opts.excludeIds : []).forEach(function (id) { excludeIds.add(id); });
      if (opts.excludeIds instanceof Set) opts.excludeIds.forEach(function (id) { excludeIds.add(id); });
    }

    let pool = all().filter(function (q) { return !mastered[q.id]; });
    let filtered = pool.filter(function (q) { return !excludeIds.has(q.id); });
    /* 如果排除后不够组卷，则回退到仅排除已掌握题，避免卡死 */
    if (filtered.length < Math.min(n || cfg().count, pool.length)) filtered = pool;
    pool = filtered;

    const want = Math.max(1, Math.min(n || cfg().count, pool.length || 1));
    return pickPool(want, pool).map(function (q) {
      const order = shuffle(q.options.map(function (_, i) { return i; }));
      return {
        qid: q.id,
        subject: q.subject,
        stem: q.stem,
        options: order.map(function (i) { return q.options[i]; }),
        answer: q.answer.map(function (i) { return order.indexOf(i); }).sort(function (a, b) { return a - b; }),
        multi: q.multi,
        explain: q.explain
      };
    });
  }

  /* ---------------- 判卷 ---------------- */
  function sameArray(a, b) {
    if (!Array.isArray(a) || !Array.isArray(b)) return false;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }
  function asArray(v) {
    if (Array.isArray(v)) return v.slice().sort(function (a, b) { return a - b; });
    if (typeof v === 'number' && v >= 0) return [v];
    return [];
  }
  function passLine(total) {
    return Math.max(1, Math.ceil((total || 0) * cfg().passRate));
  }
  function grade(paper, answers) {
    let correct = 0;
    const detail = (paper || []).map(function (p, i) {
      const picked = asArray(answers && answers[i]);
      const ans = asArray(p.answer);
      const ok = sameArray(picked, ans);
      if (ok) correct++;
      return { i: i, picked: picked, answer: ans, ok: ok };
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

      let forceMulti = false;
      parts.forEach(function (p) {
        /* 答案栏：支持单选 A/1，也支持多选 A,C,D / 1,2,3。必须整格匹配，防止选项文本被误吃。 */
        const mA = p.match(/^\s*(?:答案|answer|正确答案|correct)\s*[:：]?\s*([A-Ha-h,，、\d\s]+)\s*$/i);
        const mE = p.match(/^\s*(?:解析|explain|说明|分析)\s*[:：]?\s*([\s\S]*)$/i);
        const mS = p.match(/^\s*(?:科目|subject|kemu)\s*[:：]?\s*(.+)$/i);
        const mType = p.match(/^\s*(?:题型|type)\s*[:：]?\s*(multi|single|tf|判断|多选|单选)\s*$/i);
        if (mA) {
          const raw = mA[1].trim();
          if (/[,，、]/.test(raw) || (raw.length > 1 && /^[A-Ha-h]+$/.test(raw))) {
            answer = answerIndices(raw, 0);
            forceMulti = true;
          } else {
            answer = answerIndex(raw, 0);
          }
          return;
        }
        if (mE) { explain = mE[1].trim(); return; }
        if (mS) { subject = normSubject(mS[1]); return; }
        if (mType) {
          const t = mType[1].toLowerCase();
          if (t === 'multi' || t === '多选') forceMulti = true;
          return;
        }
        options.push(stripLabel(p));
      });

      if (!stem) { res.errors.push(no + '没读到题干'); return; }
      if (options.length < 2) { res.errors.push(no + '选项少于 2 个'); return; }

      let q;
      if (Array.isArray(answer) && answer.length) {
        q = normalize({ stem: stem, options: options, answer: answer, explain: explain, subject: subject, multi: forceMulti || answer.length > 1 });
      } else if (typeof answer === 'number' && answer >= 0) {
        q = normalize({ stem: stem, options: options, answer: answer, explain: explain, subject: subject, multi: forceMulti });
      } else {
        res.errors.push(no + '没找到「答案:」（写成 答案:A 或 答案:ABD 或 答案:1,2,3）');
        return;
      }
      if (!q) { res.errors.push(no + '字段不完整或答案超出选项范围（只有 ' + options.length + ' 个选项）'); return; }
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

  /* 已掌握题目：答对后就不再出现在破壳测验里 */
  function markMastered(ids) {
    const s = st();
    if (!s) return 0;
    s.masteredQuestions = s.masteredQuestions || {};
    let n = 0;
    (ids || []).forEach(function (id) {
      if (id && !s.masteredQuestions[id]) { s.masteredQuestions[id] = Date.now(); n++; }
    });
    if (n) window.Store.save(true);
    return n;
  }
  function unmarkMastered(id) {
    const s = st();
    if (!s || !id || !s.masteredQuestions) return false;
    if (s.masteredQuestions[id]) { delete s.masteredQuestions[id]; window.Store.save(true); return true; }
    return false;
  }
  function masteredCount() {
    const s = st();
    return s && s.masteredQuestions ? Object.keys(s.masteredQuestions).length : 0;
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
    markMastered: markMastered,
    unmarkMastered: unmarkMastered,
    masteredCount: masteredCount,
    normalize: normalize,
    normSubject: normSubject,
    subjectName: subjectName,
    shuffle: shuffle
  };
})();
