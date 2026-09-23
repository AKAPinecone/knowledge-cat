/* =========================================================
 * 知识喂了猫 · 学习登记链路
 * 做了就是做了：每条任务做完当场登记 / 传凭证，奖励马上发。
 * ---------------------------------------------------------
 * 设计前提：使用者只能利用工作间隙的碎片时间学习。
 * 所以这里没有任何倒计时、没有"你必须坐够 60 分钟"，
 * 也不攒什么碎片——做完、登记、拿奖励，就这么直接。
 * ========================================================= */
window.Study = (function () {
  const D = window.GAME_DATA;
  let S = null;

  /* 读书进度统一走 data 层（store 在 study 下层，不能反调，所以规则放在 data 层） */
  function bookProgressOf(bookId) {
    if (typeof D.bookProgressOf === 'function') return D.bookProgressOf(bookId);
    const days = (S.bookProgress[bookId] | 0);                 /* 兜底：老逻辑的退化版 */
    const plan = Math.max(D.BOOK_DAYS_MIN || 6, days);
    return { days: days, plan: plan, pct: Math.min(1, days / plan), done: days >= plan };
  }

  /* 任务库版本：升级后强制重算当天任务，避免老存档里的旧任务结构残留 */
  const TASK_VER = 11;  /* v11：投喂单新增「错题整理」（凭证必须是图片或文件，录音不算）；v10：读书进度改为按「章/节/页码」推进 + 刷题超额奖励（每科每日 30 道达标）；v9：读书进度改为「实际读了几天 / 计划几天」；v8：面试问答训练 → 综合问答训练（标题/标签改名）；v7：面试问答与导游词改为「练习台」模式；导游词不再限定每日具体篇目；面试问答不再登记题量，而是在练习台练够 10 道即完成 */

  /* 前端回调，由 app.js 挂载 */
  const hooks = {
    onNotice: null       /* function(text, kind) */
  };

  function init() { S = window.Store.state; }

  function notice(text, kind) {
    if (hooks.onNotice) hooks.onNotice(text, kind || 'info');
  }

  /* ================= 任务生成 ================= */
  function subst(str, ctx) {
    return String(str)
      .replace('{book}', ctx.book || '')
      .replace('{script}', ctx.script || '')
      .replace('{scriptMode}', ctx.scriptMode || '')
      .replace('{subject}', ctx.subject || '')
      .replace('{pet}', ctx.pet || '小生物');
  }

  /* 进度条上那个小格子的名字。四科刷题的标签是 '{subject}'，换成"法规/业务/全导/地导" */
  function coreLabelOf(lib, sub, sb) {
    const tpl = lib.coreLabel || '目标';
    return tpl.replace('{subject}', (sub && sub.short) || (sb && sb.short) || '');
  }

  function nextScript() {
    /* 优先挑还没背下来的、并且最久没读的那篇 */
    let best = null, bestScore = -1;
    D.SCRIPTS.forEach(function (sc) {
      const st = S.scripts[sc.id] || { read: 0, recite: 0, mastered: false, lastAt: 0, notes: '' };
      let score = (st.mastered ? 0 : 100) + st.read * -6 + (st.lastAt ? (Date.now() - st.lastAt) / 86400000 * -1 : 0);
      if (score > bestScore) { bestScore = score; best = sc; }
    });
    return best || D.SCRIPTS[0];
  }

  /* 「今天读哪本」的推荐（v1.26 改）
     旧算法直接跳过已完成的书，于是"读完了"就等于"这本再也读不了"——想二刷只能手动点。
     现在改成按完成度挑最落后的那本推荐：已完成的书完成度 100%，天然排在最后，
     等于"还有没读完的先推没读完的，都读完了就轮着二刷"。 */
  function nextBook() {
    let best = null, bestPct = 2;
    D.SUBJECTS.forEach(function (sub) {
      const p = bookProgressOf(sub.id);
      if (p.pct < bestPct) { bestPct = p.pct; best = sub; }
    });
    return best || D.SUBJECTS[0];
  }

  function nextSubject() {
    /* 四科轮换，按已深挖次数最少优先 */
    let best = null, bestDay = 999;
    D.SUBJECTS.forEach(function (sub) {
      const cnt = S.bookProgress['deep_' + sub.id] || 0;
      if (cnt < bestDay) { bestDay = cnt; best = sub; }
    });
    return best || D.SUBJECTS[0];
  }

  /* 用户自建加餐任务：从既有任务模型（reading/quiz/opinion/feynman/note/online/writescript）里选一种，跨天保留 */
  function buildUserTask(tpl, day) {
    const uid = 'user_' + tpl.id + '#' + day;
    const type = tpl.type;
    const verify = { type: type };
    if (type === 'quiz') verify.minQuestions = tpl.target || 20;
    else if (type === 'record') verify.minMinutes = tpl.target || 3;
    else if (type === 'opinion') { verify.minChars = tpl.target || 8; }
    else if (type === 'feynman') verify.minCards = tpl.target || 1;
    else if (type === 'note') verify.minChars = tpl.target || 20;
    else if (type === 'online') verify.minChars = tpl.target || 20;
    else if (type === 'writescript') verify.minChars = tpl.target || 120;
    else if (type === 'reading') verify.minChars = 6;
    const ICON = { reading: '📖', quiz: '✍️', record: '🎙️', opinion: '🎧', feynman: '🗣️', note: '📝', online: '🖥️', writescript: '✍️' };
    return {
      uid: uid,
      libId: 'user_' + tpl.id,
      tplId: tpl.id,
      title: tpl.title || (ICON[type] + ' 我的任务'),
      desc: tpl.desc || '你自己建的任务，做完登记一下就有奖励。',
      kolb: 'CE', icon: ICON[type] || '🧩',
      /* 自建加餐的默认奖励（v1.24：15 → 22 豆，跟投喂单的涨幅对齐） */
      reward: { tickets: tpl.tickets != null ? tpl.tickets : 1, beans: tpl.beans != null ? tpl.beans : 22 },
      core: false, coreLabel: '',
      split: '', pick: type === 'reading' ? 'book' : '',
      verify: verify, need: type === 'opinion' ? { photo: true } : {},
      /* writescript 不用另交凭证 —— 写出来的那段正文本身就是凭证 */
      writing: type === 'writescript' ? { scriptId: '' } : null,
      ctx: { scriptId: '', scriptName: '', bookId: '', bookName: '', subjectId: '', subjectName: '' },
      quizCount: 0,
      state: S.study.done[uid] ? 'done' : 'pending',
      at: S.study.done[uid] ? S.study.done[uid].at : 0
    };
  }

  /* 这些任务才和「导游词」有关——只有它们才带景点节点气泡。
     现在只有 p_script 一个通用导游词任务，不再绑定具体篇目。 */
  const SCRIPT_LIBS = { p_script: 1 };

  function scriptModeForDay(day) {
    return day < D.PRACTICE.RECITE_START_DAY ? '导游词通读 1 篇' : '导游词默讲 1 篇';
  }

  function ensureTodayTasks() {
    const t = window.Store.today();
    if (S.study.tasksDate === t && S.study.tasks.length && S.study.taskVer === TASK_VER) return S.study.tasks;

    const info = window.Store.currentPhase();
    const pid = info.phase.id;
    const day = info.day;
    const list = [];

    D.TASK_LIBRARY.filter(function (x) { return x.phase.indexOf(pid) >= 0; }).forEach(function (lib) {
      /* 按间隔重复的任务 */
      if (lib.repeat && lib.repeat.every) {
        if (day % lib.repeat.every !== 0) return;
      }
      /* split: 'subject' → 按四科拆成四条互不相干的任务 */
      const subs = lib.split === 'subject' ? D.SUBJECTS : [null];
      subs.forEach(function (sub) {
        const pet = S.pets.length ? Game.pick(S.pets).name : '小生物';
        const bk = nextBook();
        const sb = sub || nextSubject();
        const uid = lib.id + (sub ? '@' + sub.id : '') + '#' + day;
        const isScript = !!SCRIPT_LIBS[lib.id];
        const sc = isScript ? null : null; /* 通用导游词任务不再绑定具体篇目 */
        const mode = isScript ? scriptModeForDay(day) : '';
        list.push({
          uid: uid,
          libId: lib.id,
          title: subst(lib.title, { book: bk.name, script: sc ? sc.name : '', scriptMode: mode, subject: sb.name, pet: pet }),
          desc: lib.desc,
          kolb: lib.kolb,
          icon: lib.icon,
          reward: lib.reward,
          core: !!lib.core,
          coreLabel: lib.core ? coreLabelOf(lib, sub, sb) : '',
          split: lib.split || '',
          pick: lib.pick || '',
          verify: JSON.parse(JSON.stringify(lib.verify)),
          need: lib.need || {},
          ctx: {
            scriptId: sc ? sc.id : '', scriptName: sc ? sc.name : '', scriptMode: mode,
            bookId: bk.id, bookName: bk.name,
            subjectId: sb.id, subjectName: sb.name
          },
          state: S.study.done[uid] ? 'done' : 'pending',
          at: S.study.done[uid] ? S.study.done[uid].at : 0
        });
      });
    });

    /* 用户自建的加餐任务：从既有任务模型里选，跨天保留 */
    (S.study.userTasks || []).forEach(function (tpl) {
      list.push(buildUserTask(tpl, day));
    });

    S.study.tasks = list;
    S.study.tasksDate = t;
    S.study.taskVer = TASK_VER;
    window.Store.save(true);
    return list;
  }

  function taskByUid(uid) {
    return S.study.tasks.filter(function (x) { return x.uid === uid; })[0];
  }

  function coreTaskByLib(libId) {
    const t = window.Store.today();
    if (S.study.tasksDate !== t) ensureTodayTasks();
    return S.study.tasks.filter(function (x) { return x.libId === libId && x.core; })[0];
  }

  /* ================= 练习台：今日进度 ================= */
  /* 导游词：记录今日已读 / 已背的篇目（用于「今天读了/背了」按钮防重复点击） */
  function scriptPracticeToday(date) {
    if (!S.study.scriptPractice) S.study.scriptPractice = {};
    const k = date || window.Store.today();
    if (!S.study.scriptPractice[k]) S.study.scriptPractice[k] = { read: [], recite: [] };
    return S.study.scriptPractice[k];
  }
  function scriptDidToday(scriptId, type, date) {
    const p = scriptPracticeToday(date);
    const arr = type === 'read' ? p.read : p.recite;
    return arr.indexOf(scriptId) >= 0;
  }
  /* 面试问答：不再逐题点选、不再累计——每日任务改为「交一个凭证即完成」
     （凭证在投喂单的验证弹窗里提交，走 Study.finish）。此处不再维护逐题练习记录。 */

  /* 在练习台里标记今天读了/背了某篇导游词，并完成当日导游词核心任务 */
  function finishScriptCore(scriptId, type) {
    if (!scriptId || (type !== 'read' && type !== 'recite')) return { ok: false, msg: '参数错误' };
    /* 同一天同一篇同类型只记一次，避免误触重复累计 */
    if (!scriptDidToday(scriptId, type)) {
      const p = scriptPracticeToday();
      if (type === 'read') p.read.push(scriptId); else p.recite.push(scriptId);
      window.Store.save(true);
    }

    const info = window.Store.currentPhase();
    const expected = info.day < D.PRACTICE.RECITE_START_DAY ? 'read' : 'recite';
    const task = coreTaskByLib('p_script');
    if (!task || task.state === 'done') return { ok: true, taskDone: false, task: task };
    /* 第13天起要求背；之前读就算完成。做了相反类型也认可（读顺了顺便会背）。 */
    if (type === expected || type === 'recite') {
      const r = finish(task.uid, {
        practice: true,
        scriptId: scriptId,
        practiceType: type,
        summary: '练习台导游词：' + (type === 'read' ? '通读' : '默讲') + '《' + ((D.SCRIPTS.filter(function (s) { return s.id === scriptId; })[0] || {}).name || scriptId) + '》'
      });
      return { ok: r.ok, taskDone: r.ok, task: task, errs: r.errs };
    }
    return { ok: true, taskDone: false, task: task };
  }

  /* ================= 截图压缩 ================= */
  function compressImage(file, maxSide, quality) {
    return new Promise(function (resolve, reject) {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = function () {
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const cv = document.createElement('canvas');
        cv.width = w; cv.height = h;
        cv.getContext('2d').drawImage(img, 0, 0, w, h);
        cv.toBlob(function (blob) {
          URL.revokeObjectURL(url);
          if (!blob) return reject(new Error('压缩失败'));
          resolve({ blob: blob, thumb: cv.toDataURL('image/jpeg', 0.5), w: w, h: h });
        }, 'image/jpeg', quality || 0.72);
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('图片读取失败')); };
      img.src = url;
    });
  }

  function attachPhoto(uid, file) {
    return compressImage(file, 1400, 0.72).then(function (res) {
      return window.Store.addEvidence({
        type: 'photo', taskId: uid, label: '学习凭证', blob: res.blob, thumb: res.thumb
      });
    });
  }

  /* ================= 录音（导游词，可分次录） ================= */
  let recorder = null;
  function startRecord() {
    return new Promise(function (resolve) {
      if (!window.MediaRecorder) {
        return resolve({ ok: false, msg: '当前浏览器不支持录音。' });
      }
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        return resolve({ ok: false, msg: '当前环境拿不到麦克风（用 file:// 打开时常见）。用本地服务器打开，或部署到 https 后即可录音。' });
      }
      navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
        let mime = '';
        ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].forEach(function (m) {
          if (!mime && MediaRecorder.isTypeSupported(m)) mime = m;
        });
        const rec = mime ? new MediaRecorder(stream, { mimeType: mime, audioBitsPerSecond: 16000 })
                         : new MediaRecorder(stream);
        const chunks = [];
        recorder = { rec: rec, stream: stream, chunks: chunks, startedAt: Date.now(), resolveStop: null };
        rec.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
        rec.onstop = function () {
          const duration = (Date.now() - recorder.startedAt) / 1000;
          const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
          stream.getTracks().forEach(function (t) { t.stop(); });
          const done = recorder.resolveStop;
          recorder = null;
          if (done) done({ ok: true, blob: blob, duration: duration });
        };
        rec.start(1000);
        resolve({ ok: true, started: true, startedAt: recorder.startedAt });
      }).catch(function (e) {
        resolve({ ok: false, msg: '拿不到麦克风权限：' + (e && e.message ? e.message : e) });
      });
    });
  }

  function stopRecord() {
    return new Promise(function (resolve) {
      if (!recorder) return resolve({ ok: false, msg: '没有正在进行的录音' });
      recorder.resolveStop = resolve;
      try {
        recorder.rec.stop();
      } catch (e) {
        resolve({ ok: false, msg: '停止录音失败' });
      }
      /* 兜底：3 秒内没回调就返回失败，避免界面卡住 */
      setTimeout(function () {
        if (recorder && recorder.resolveStop === resolve) {
          recorder.resolveStop = null;
          resolve({ ok: false, msg: '录音收尾超时，请重试' });
        }
      }, 3000);
    });
  }

  function getRecorder() { return recorder; }

  function attachAudio(uid, blob, duration, label) {
    return window.Store.addEvidence({
      type: 'audio', taskId: uid, label: label || '朗读录音', blob: blob, duration: Math.round(duration)
    });
  }

  /* ================= 费曼卡 ================= */
  function addFeynman(card) {
    const c = {
      id: 'fm_' + Date.now() + '_' + Game.rand(999),
      concept: card.concept || '',
      plain: card.plain || '',
      gap: card.gap || '',
      analogy: card.analogy || '',
      subject: card.subject || '',
      pasteCount: card.pasteCount || 0,
      pastedChars: card.pastedChars || 0,
      at: Date.now(),
      day: window.Store.today()
    };
    S.feynman.unshift(c);
    S.stats.feynmanCards++;
    window.Store.save(true);
    Game.checkAchievements();
    return c;
  }

  /* ================= 导游词进度 ================= */
  /* 每篇讲够 2 次算"背下"，配合每 2 天一次的默讲任务，正好 4 天拿下一篇 */
  const RECITE_TO_MASTER = 2;

  function markScript(scriptId, type) {
    if (!scriptId) return null;
    if (!S.scripts[scriptId]) S.scripts[scriptId] = { read: 0, recite: 0, mastered: false, lastAt: 0, notes: '' };
    const st = S.scripts[scriptId];
    if (type === 'read') st.read++;
    if (type === 'recite') {
      st.recite++;
      if (st.recite >= RECITE_TO_MASTER && !st.mastered) {
        st.mastered = true;
        const n = D.SCRIPTS.filter(function (s) { return (S.scripts[s.id] || {}).mastered; }).length;
        S.stats.scriptsMastered = n;
        const nm = (D.SCRIPTS.filter(function (s) { return s.id === scriptId })[0] || {}).name;
        window.Store.pushLog('🎤 导游词背下了：《' + nm + '》（累计 ' + n + '/12）');
      }
    }
    st.lastAt = Date.now();
    window.Store.save(true);
    Game.checkAchievements();
    return st;
  }

  /* ================= 我的导游词（v1.34：自己写 / 修改） =================
     内置 12 篇（D.SCRIPTS）只读，是参考资料；这里放的是玩家自己动笔写的稿子。
     一篇稿子从写下到考前都在改，所以「继续修改」不是重新写，而是在同一篇上追加/覆盖。 */
  function myScripts() {
    if (!Array.isArray(S.myScripts)) S.myScripts = [];
    return S.myScripts;
  }
  function myScriptById(id) {
    if (!id) return null;
    return myScripts().filter(function (x) { return x.id === id; })[0] || null;
  }
  /* 新建或更新一篇自己的导游词。传 id 且能找到 = 修改；否则新建。
     返回 {script, created} —— created=true 表示这是一篇新稿。 */
  function upsertMyScript(draft) {
    draft = draft || {};
    const name = String(draft.name || '').trim();
    const text = String(draft.text || '').trim();
    if (!name) return { ok: false, msg: '这篇导游词得有个名字' };
    if (!text) return { ok: false, msg: '正文还是空的' };

    let sc = myScriptById(draft.id);
    const created = !sc;
    if (!sc) {
      sc = {
        id: 'my_' + Date.now().toString(36) + Math.floor(Math.random() * 1000).toString(36),
        createdAt: Date.now()
      };
      myScripts().unshift(sc);
    }
    sc.name = name;
    sc.place = String(draft.place || '').trim();
    sc.group = String(draft.group || '').trim();
    sc.text = text;
    sc.updatedAt = Date.now();
    sc.chars = text.length;
    sc.writes = (sc.writes || 0) + 1;   /* 改了几次 —— 用来显示「改了 N 稿」 */
    window.Store.save(true);
    return { ok: true, script: sc, created: created };
  }
  function removeMyScript(id) {
    if (!id) return 0;
    const before = myScripts().length;
    S.myScripts = myScripts().filter(function (x) { return x.id !== id; });
    if (S.myScripts.length !== before) { window.Store.save(true); return 1; }
    return 0;
  }
  /* 自己写的稿子也当一天的学习痕迹 —— 同步进证据库，回顾时看得到正文 */
  function logMyScriptEvidence(uid, script, isNew) {
    if (!script) return;
    window.Store.addEvidence({
      type: 'note', taskId: uid || '',
      label: (isNew ? '✍️ 新写导游词 · ' : '✍️ 改导游词 · ') + script.name,
      text: script.text
    });
    window.Store.pushLog((isNew ? '✍️ 写了一篇自己的导游词：《' : '✍️ 改了改《') + script.name + '》（' + script.text.length + ' 字）');
  }

  /* =========================================================
   * 结算：验证并发奖
   * proof 结构由 UI 收集：
   * { photo, feynmanCount, quiz:{questions,correct,score}, record:{duration,segments}, bookId }
   * ========================================================= */
  /* 刷题进度：同一任务（uid 含日期，天然按天）多次提交累加。
     松果的习惯是碎片时间刷几道就交几道，攒够目标题数才算这件任务完成。 */
  function quizAccumOf(uid) {
    if (!S.study.quizAccum || typeof S.study.quizAccum !== 'object') S.study.quizAccum = {};
    if (!S.study.quizAccum[uid]) S.study.quizAccum[uid] = { q: 0, correct: 0 };
    return S.study.quizAccum[uid];
  }
  function quizProgress(uid) {
    const t = taskByUid(uid);
    const acc = (S.study.quizAccum && S.study.quizAccum[uid]) || { q: 0, correct: 0 };
    return { count: acc.q, correct: acc.correct, target: t ? (t.verify.minQuestions || 0) : 0 };
  }

  function validate(task, proof) {
    const errs = [];
    const v = task.verify;
    const need = task.need || {};

    /* 练习台任务：由练习行为直接驱动，验证直接通过 */
    if (v.type === 'practice') return errs;

    /* 文字登记（做了就是做了：写完当场结算，不再攒碎片） */
    if (v.type === 'note') {
      const t = String(proof.note || '').trim();
      if (t.length < (v.minChars || 10)) {
        errs.push('还没写完这一段（至少 ' + (v.minChars || 10) + ' 个字）');
      }
    }
    if (v.type === 'quiz') {
      const q = proof.quiz || {};
      /* 每次可以只交几道，累计到目标题数才算完成（模考例外，一次一整套） */
      if (!q.questions || q.questions < 1) errs.push('至少要登记 1 道题');
      if (q.correct && q.questions && q.correct > q.questions) errs.push('答对题数不能多于本次题量');
      if (v.needScore && (q.score === undefined || q.score === null || q.score === '')) errs.push('模考需要填写分数');
    }
    if (v.type === 'record') {
      const r = proof.record;
      if (!r || !r.duration || r.duration < v.minMinutes * 60) {
        errs.push('录音时长不足 ' + v.minMinutes + ' 分钟（录音是背导游词的凭证，可以分几次录、累计够就行）');
      }
    }
    if (v.type === 'feynman') {
      if ((proof.feynmanCount || 0) < (v.minCards || 1)) errs.push('费曼卡不足：至少要产出 ' + (v.minCards || 1) + ' 张');
    }
    /* 精读登记（v1.28）：必答「读哪本」+「读到哪儿」（第几章 / 第几页 任一）；
       文字说明和笔记选填 —— 位置填了，进度条就能自己往前走了。 */
    if (v.type === 'reading') {
      const rd = proof.reading || {};
      if (!rd.bookId) errs.push('还没选今天读的是哪一本课本');
      const hasPos = (Number(rd.page) > 0) || (Number(rd.chapter) > 0);
      const txt = String(rd.read || '').trim();
      if (!hasPos && txt.length < (v.minChars || 4)) {
        errs.push('填一下「读到哪儿」——第几章、第几节、第几页都行；懒得填就写一句今天读了什么');
      }
      const pages = (typeof D.bookPagesOf === 'function') ? D.bookPagesOf(rd.bookId) : 0;
      if (pages > 0 && Number(rd.page) > pages) {
        errs.push('页码超过这本书的总页数了（书里登记的总页数是 ' + pages + '）');
      }
      const chN = (typeof D.bookChapterCount === 'function') ? D.bookChapterCount(rd.bookId) : 0;
      if (chN > 0 && Number(rd.chapter) > chN) {
        errs.push('章数超过这本书的章数了（共 ' + chN + ' 章）');
      }
    }
    if (task.pick === 'book' && v.type !== 'reading' && !proof.bookId) {
      errs.push('还没选这套习题是哪一科的');
    }
    /* 看法（截图 + 看法：看法可打字，也可录一段音代替） */
    if (v.type === 'opinion') {
      const op = proof.opinion || {};
      const txt = String(op.text || '').trim();
      const hasAudio = !!(op.audios && op.audios.length);
      if (!txt && !hasAudio) {
        errs.push('还没留下「看法」：在另一个 App 练完导游词，截一张图带过来，再写一句（或录一段）今天顺不顺、哪里还卡。');
      } else if (txt && txt.length < (v.minChars || 4)) {
        errs.push('「看法」太短了（至少 ' + (v.minChars || 4) + ' 个字，或改录一段语音代替）。');
      }
    }
    /* v1.34 自己写导游词：正文本身就是凭证，不看别的。
       字数按「去掉空白后的字符数」算 —— 用空格和换行凑字数没意义。 */
    if (v.type === 'writescript') {
      const w = proof.writing || {};
      const name = String(w.name || '').trim();
      const text = String(w.text || '').trim();
      const bare = text.replace(/\s/g, '');
      if (!name) errs.push('先给这篇导游词起个名字（景点名就行）');
      if (!bare) errs.push('正文还是空的，写点什么吧');
      else if (bare.length < (v.minChars || 120)) {
        errs.push('正文太短了：去掉空格才 ' + bare.length + ' 字，这件任务要求至少 ' + (v.minChars || 120) + ' 字（写不完可以存下来，明天接着改）');
      }
    }
    /* v1.36 错题整理：凭证必须是「图片或文件」—— 笔记是要留下来回头看的，录音代替不了。
       这里和 app.js submitVerify 两处都拦：万一绕过弹窗直接调 Study.finish 也过不去。 */
    if (v.type === 'wrongnote') {
      if (!proof.photo && !proof.file) {
        errs.push('错题整理要交一份笔记：拍一张手写笔记的照片，或传一个文档（PDF / Word / 图片都行）。录音代替不了它。');
      }
    }
    if (need.photo && !proof.photo) errs.push('缺少凭证截图（在另一个 App 练完导游词，截一张图带过来）');
    if (need.feynman && (proof.feynmanCount || 0) < need.feynman) {
      errs.push('本任务需要 ' + need.feynman + ' 张费曼卡，当前 ' + (proof.feynmanCount || 0) + ' 张');
    }
    return errs;
  }

  function finish(uid, proof) {
    const task = taskByUid(uid);
    if (!task) return { ok: false, errs: ['任务不存在'] };
    if (task.state === 'done') return { ok: false, errs: ['这个任务今天已经结算过了'] };
    proof = proof || {};
    const errs = validate(task, proof);
    if (errs.length) return { ok: false, errs: errs };

    const v0 = task.verify;
    /* v1.28：刷题超额奖励 —— 每科达标之后再刷的部分，做得越多给得越多（封顶） */
    let quizBonus = 0, quizOver = 0;

    /* 练习台任务：不收集额外凭证，由面板行为驱动；但如果是导游词任务，把练习的篇目标记进脚本进度 */
    if (v0.type === 'practice') {
      if (task.libId === 'p_script' && proof.scriptId && proof.practiceType) {
        markScript(proof.scriptId, proof.practiceType);
      }
    }

    /* ── 累计型刷题（不含模考）：每次任意题数，多次相加，累计 ≥ 目标才结算 ──
       今天交 8 道、明天再交 12 道都行；没攒够就只记进度、不发奖、不标记完成。 */
    if (v0.type === 'quiz' && !v0.needScore) {
      const acc = quizAccumOf(uid);
      const add = proof.quiz.questions || 0;
      acc.q += add;
      acc.correct += (proof.quiz.correct || 0);
      S.stats.questions += add;
      S.stats.correct += (proof.quiz.correct || 0);
      window.Store.save(true);
      if (acc.q < v0.minQuestions) {
        return { ok: true, progress: true, count: acc.q, target: v0.minQuestions, title: task.title };
      }
      /* v1.28：达标之后，每多刷 step 道再追加一份豆（封顶 cap）。
         不封顶的话"刷题"就会变成最优解，把别的玩法全饿死 —— 所以有个天花板。 */
      const qe = (D.ECONOMY && D.ECONOMY.quizExtra) || { step: 10, beans: 6, cap: 90 };
      quizOver = Math.max(0, acc.q - v0.minQuestions);
      if (qe.step > 0 && quizOver >= qe.step) {
        quizBonus = Math.min(qe.cap, Math.floor(quizOver / qe.step) * qe.beans);
      }
      /* 达标：把累计数写进凭证，回顾时显示的是整段进度而不是最后一小截 */
      proof.quiz.questions = acc.q;
      proof.quiz.correct = Math.min(acc.correct, acc.q);
    } else if (v0.type === 'quiz') {
      S.stats.questions += (proof.quiz.questions || 0);
      S.stats.correct += (proof.quiz.correct || 0);
    }

    /* 发奖：做了就是做了，奖励足额发，不打折 */
    const tickets = task.reward.tickets;
    const beans = task.reward.beans + quizBonus;
    const extra = [];
    if (quizBonus > 0) {
      const qec = (D.ECONOMY && D.ECONOMY.quizExtra) || { step: 10, beans: 6, cap: 90 };
      extra.push('📈 超额 ' + quizOver + ' 道：每多 ' + qec.step + ' 道 +' + qec.beans + ' 豆，这次多给 ' + quizBonus +
        (quizBonus >= qec.cap ? '（已到上限 ' + qec.cap + ' 豆/科/天）' : ''));
    }

    /* v1.37：早鸟奖励 —— 12:00 之前做完的任务，豆 ×1.5（券不动）。
       松果是上班族，早上那一段是他一天里最不被打断的时间，值得多给一点；
       反过来，晚上补完也不算"没做完"，只是没有这份加成。
       时钟只在 data.js 里算（D.earlyBirdOf），顶栏也读同一个函数，保证两边一致。 */
    const eb = (typeof D.earlyBirdOf === 'function') ? D.earlyBirdOf(new Date()) : null;
    const earlyOn = !!(eb && eb.on);
    const earlyBonus = earlyOn ? Math.round(beans * (eb.mul - 1)) : 0;
    const beansFinal = beans + earlyBonus;
    if (earlyOn) {
      S.stats.earlyFinishes = (S.stats.earlyFinishes || 0) + 1;
      extra.push('🌅 早鸟时段（' + (eb.label || '12:00 前') + '）：豆 ×' + eb.mul + '，这次多给 ' + earlyBonus + ' 豆');
    }

    /* 选书的任务：把今天的选择写回任务上下文
       精读走的是 reading 类型（书是必答的第一栏），课后练习走 pick:'book'。 */
    const choseBook = (task.verify.type === 'reading')
      ? ((proof.reading && proof.reading.bookId) || '')
      : (task.pick === 'book' ? proof.bookId : '');
    if (choseBook) {
      const bk = D.SUBJECTS.filter(function (x) { return x.id === choseBook })[0];
      if (bk) { task.ctx.bookId = bk.id; task.ctx.bookName = bk.name; }
    }

    /* 精读登记：把「读了哪本 / 读了什么 / 笔记」也留一份进证据库 */
    if (task.verify.type === 'reading' && proof.reading) {
      const lines = ['读了：《' + (task.ctx.bookName || '课本') + '》' + String(proof.reading.read || '').trim()];
      if (Number(proof.reading.page) > 0 || Number(proof.reading.chapter) > 0) {
        lines.push('读到：' +
          (Number(proof.reading.chapter) > 0 ? '第 ' + proof.reading.chapter + ' 章' : '') +
          (Number(proof.reading.section) > 0 ? ' 第 ' + proof.reading.section + ' 节' : '') +
          (Number(proof.reading.page) > 0 ? '（第 ' + proof.reading.page + ' 页）' : ''));
      }
      if (proof.reading.finish) lines.push('（这本读完了）');
      if (proof.reading.whole) lines.push('（今天一整天都在读这本）');
      if (proof.reading.note) lines.push('笔记：' + String(proof.reading.note).trim());
      window.Store.addEvidence({
        type: 'note', taskId: uid,
        label: '精读 · ' + (task.ctx.bookName || '课本'),
        text: lines.join('\n')
      });
    }

    /* 看法登记：把文字「看法」留一份进证据库（录音段已在下方统一存为 audio 证据） */
    if (task.verify.type === 'opinion' && proof.opinion && String(proof.opinion.text || '').trim()) {
      window.Store.addEvidence({
        type: 'note', taskId: uid,
        label: '看法 · ' + task.title,
        text: String(proof.opinion.text).trim()
      });
    }

    /* 文字登记：把写的内容留一份进证据库 */
    if (task.verify.type === 'note' && String(proof.note || '').trim()) {
      window.Store.addEvidence({
        type: 'note', taskId: uid,
        label: task.title,
        text: String(proof.note).trim()
      });
      S.stats.notes = (S.stats.notes || 0) + 1;
    }

    /* v1.34 自己写 / 修改导游词：先把稿子存进「我的导游词」，
       再留一份正文进证据库（这样"今天写了什么"以后翻得到）。 */
    if (task.verify.type === 'writescript' && proof.writing) {
      const up = upsertMyScript(proof.writing);
      if (up.ok) {
        /* 稿子名字回填到任务上下文，卡面上就能看到今天写的是哪一篇 */
        task.ctx.scriptId = up.script.id;
        task.ctx.scriptName = up.script.name;
        logMyScriptEvidence(uid, up.script, up.created);
        proof.summary = (proof.summary ? proof.summary + '；' : '') +
          (up.created ? '新写《' : '修改《') + up.script.name + '》' + up.script.text.length + ' 字';
      }
    }

    S.cur.tickets += tickets;
    S.cur.beans += beansFinal;
    S.study.done[uid] = { at: Date.now(), detail: proof.summary || '', tickets: tickets, beans: beansFinal, kolb: task.kolb };
    task.state = 'done';
    task.at = Date.now();
    S.study.kolbToday[task.kolb] = (S.study.kolbToday[task.kolb] || 0) + 1;

    /* 课本精读进度（v1.28：按「读到第几章 / 第几节 / 第几页」推进）
       进度 = 已读页 / 总页数（目录见 data.js 的 BOOKS）。
       没填位置、只写了文字的话，也算今天读了 —— 至少把"今天"记上，位置沿用上次。 */
    if (task.libId === 'p1_read') {
      const bid = task.ctx.bookId;
      const rd = proof.reading || {};
      const hasPos = (Number(rd.page) > 0) || (Number(rd.chapter) > 0);
      const prev = S.bookProgress[bid];
      if (hasPos) {
        D.bookSetPos(bid, {
          chapter: rd.chapter, section: rd.section, page: rd.page,
          done: !!rd.finish
        });
      } else if (typeof prev === 'number' || prev === undefined) {
        /* 还是旧口径（数字天数），就先按天数记 —— 等你哪天填了页码，自动切页码制 */
        S.bookProgress[bid] = (prev || 0) + 1;
      } else {
        D.bookSetPos(bid, { chapter: prev.chapter, section: prev.section, page: prev.page });
      }
      const bp = bookProgressOf(bid);
      if (bp.done && !S.bookProgress['done_' + bid]) {
        S.bookProgress['done_' + bid] = 1;
        const n = D.SUBJECTS.filter(function (x) { return S.bookProgress['done_' + x.id]; }).length;
        S.stats.booksDone = n;
        window.Store.pushLog('📚 《' + task.ctx.bookName + '》读完了（' +
          D.bookPosText(bp) + '，累计 ' + n + '/4 本）');
      }
    }
    /* 导游词核心任务通过练习台完成，进度已在 finish 上方 practice 块中标记 */
    if (task.verify.type === 'quiz' && task.verify.needScore) S.stats.mockCount++;
    if (task.libId === 'p2_deep') {
      const sid = 'deep_' + task.ctx.subjectId;
      S.bookProgress[sid] = (S.bookProgress[sid] || 0) + 1;
    }

    /* 库伯四象限全齐加成（系数在 D.ECONOMY.kolb，v1.24 起集中管理） */
    const eco = D.ECONOMY || {};
    const k = S.study.kolbToday;
    if (k.CE && k.RO && k.AC && k.AE && !S.study.kolbBonusDate) {
      S.study.kolbBonusDate = window.Store.today();
      S.stats.kolbFullDays++;
      const kb = (eco.kolb && eco.kolb.bonus) != null ? eco.kolb.bonus : 30;
      S.cur.tickets += 1; S.cur.beans += kb;
      extra.push('🎯 今日库伯学习圈四象限集齐：+1 券 / +' + kb + ' 豆');
      window.Store.pushLog('🎯 学习圈闭合：具体经验→反思观察→抽象概念化→主动实验，今天你走完了一整圈。');
    }

    /* 投喂单全满：每天只发一次的额外奖励 */
    let feedBonusGiven = false;
    const coreTasks = S.study.tasks.filter(function (x) { return x.core; });
    const coreDone = coreTasks.filter(function (x) { return x.state === 'done'; }).length;
    if (coreTasks.length && coreDone >= coreTasks.length && S.study.feedBonusDate !== window.Store.today()) {
      S.study.feedBonusDate = window.Store.today();
      S.stats.fullFeedDays = (S.stats.fullFeedDays || 0) + 1;
      const fb = (eco.feed && eco.feed.fullBonus) != null ? eco.feed.fullBonus : 50;
      S.cur.tickets += 2; S.cur.beans += fb;
      feedBonusGiven = true;
      extra.push('🍽️ 今天的投喂单喂满了（' + coreTasks.length + ' 件）：+2 券 / +' + fb + ' 豆');
      window.Store.pushLog('🍽️ 投喂单清空：今天 ' + coreTasks.length + ' 件全喂满了。');
    }

    window.Store.markCheckin();
    window.Store.save(true);
    const got = Game.checkAchievements();
    got.forEach(function (a) { extra.push('🏆 成就「' + a.name + '」+' + a.reward.tickets + ' 券 / +' + a.reward.beans + ' 豆'); });

    return {
      ok: true,
      gain: { tickets: tickets, beans: beansFinal },
      earlyBird: earlyOn ? { mul: eb.mul, bonus: earlyBonus, label: eb.label } : null,
      extra: extra,
      kolb: task.kolb,
      feedBonus: feedBonusGiven
    };
  }

  function kolbProgress() {
    const k = S.study.kolbToday || {};
    const out = {};
    D.KOLB.forEach(function (x) { out[x.key] = k[x.key] || 0; });
    return out;
  }

  /* 今日进度：核心「投喂单」+ 加餐。
     进度条只数核心那几件（当前 8 件：读书 1 + 四科刷题 4 + 导游词 1 + 面试 1 + 错题整理 1）——
     加餐做不做都行，不该让人多出一份"今天还差两件"的负罪感。 */
  function todayTaskStats() {
    const tasks = ensureTodayTasks();
    const core = tasks.filter(function (t) { return t.core; });
    const extra = tasks.filter(function (t) { return !t.core; });
    const cDone = core.filter(function (t) { return t.state === 'done'; }).length;
    const eDone = extra.filter(function (t) { return t.state === 'done'; }).length;
    return {
      core: core, extra: extra,
      done: cDone, total: core.length,
      pct: core.length ? Math.round(cDone / core.length * 100) : 0,
      extraDone: eDone, extraTotal: extra.length,
      full: core.length > 0 && cDone >= core.length,
      slots: core.map(function (t) {
        return { uid: t.uid, label: t.coreLabel || '目标', icon: t.icon, done: t.state === 'done' };
      })
    };
  }

  /* ── 自建加餐任务：从既有任务模型里挑一种，填个标题就能加 ── */
  function addUserTask(tpl) {
    if (!Array.isArray(S.study.userTasks)) S.study.userTasks = [];
    const t = {
      id: 'u' + Date.now().toString(36) + Math.floor(Math.random() * 1000).toString(36),
      type: tpl.type || 'note',
      title: String(tpl.title || '').trim() || '我的任务',
      desc: String(tpl.desc || '').trim(),
      target: parseInt(tpl.target, 10) || 0,
      /* 自建任务奖励统一：1 个券配 22 个可可豆（不再让玩家填；v1.24：15 → 22） */
      tickets: 1,
      beans: 22,
      createdAt: Date.now()
    };
    S.study.userTasks.push(t);
    S.study.taskVer = 0;              /* 置 0 逼 ensureTodayTasks 重建，新任务立刻出现 */
    window.Store.save(true);
    return t;
  }
  function removeUserTask(id) {
    if (!Array.isArray(S.study.userTasks)) return 0;
    const before = S.study.userTasks.length;
    S.study.userTasks = S.study.userTasks.filter(function (x) { return x.id !== id; });
    if (S.study.userTasks.length !== before) { S.study.taskVer = 0; window.Store.save(true); }
    return before - S.study.userTasks.length;
  }

  /* 按条目查当天所有学习记录（供任务回顾用） */
  function evidenceFor(uid) {
    return S.evidence.filter(function (e) { return e.taskId === uid; });
  }

  return {
    init: init, hooks: hooks, TASK_VER: TASK_VER,
    ensureTodayTasks: ensureTodayTasks, taskByUid: taskByUid, coreTaskByLib: coreTaskByLib,
    compressImage: compressImage, attachPhoto: attachPhoto,
    startRecord: startRecord, stopRecord: stopRecord, getRecorder: getRecorder, attachAudio: attachAudio,
    addFeynman: addFeynman,
    markScript: markScript, finish: finish, validate: validate,
    kolbProgress: kolbProgress, todayTaskStats: todayTaskStats,
    quizProgress: quizProgress, addUserTask: addUserTask, removeUserTask: removeUserTask,
    evidenceFor: evidenceFor,
    finishScriptCore: finishScriptCore,
    scriptPracticeToday: scriptPracticeToday,
    myScripts: myScripts, myScriptById: myScriptById,
    upsertMyScript: upsertMyScript, removeMyScript: removeMyScript,
    bookProgressOf: bookProgressOf
  };
})();
