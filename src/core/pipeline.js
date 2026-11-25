/*
 * 出题流水线：指定方案 → 执行 → 反馈，按「整轮」迭代。
 *
 * 一轮 = 一整套题 + 这一套的分。反馈不通过就把建议交给方案角色，
 * 由它修订整套方案后再出下一轮；每一轮的题目原文都完整留存，供界面按轮回看。
 * 前端不参与这个过程，它只拿到 rounds 数组。
 */
(function (root) {
  const SHT = (root.SHT = root.SHT || {});

  const MAX_ROUNDS = 4;
  const PASS_LINE = 85;

  function call(role, ctx) {
    const r = SHT.ROLES[role];
    return SHT.llm.call({
      role: role,
      system: r.system(),
      user: r.user(ctx),
      temperature: 0.6,
      maxTokens: role === 'generate' ? 1200 : 1600
    });
  }

  function normalizePlan(p) {
    return {
      kp: String((p && p.kp) || ''),
      ability: String((p && p.ability) || 'vocab'),
      level: String((p && p.level) || '认'),
      angle: String((p && p.angle) || '')
    };
  }

  /* 方案少给时从本单元词表补，保证「说几道就出几道」。 */
  function fillPlans(plans, count, unit) {
    const out = plans.slice(0, count).map(normalizePlan);
    const used = out.map(function (p) { return p.kp; }).join(' ');
    (unit.words || []).forEach(function (w) {
      if (out.length >= count) return;
      if (used.indexOf(w.en) >= 0) return;
      out.push({ kp: w.en + '（' + w.zh + '）的词义', ability: 'vocab', level: '认', angle: '中英匹配' });
    });
    while (out.length < count) {
      out.push({ kp: '本单元句型运用 ' + (out.length + 1), ability: 'sentence', level: '用', angle: '选词填空' });
    }
    return out;
  }

  function snapshot(raw, plan, no) {
    const q = raw || {};
    const opts = Array.isArray(q.options) ? q.options.filter(function (x) { return x != null && String(x).trim(); }) : [];
    const notes = Array.isArray(q.optionNotes) ? q.optionNotes.map(function (x) { return String(x || ''); }) : [];
    return {
      no: no,
      plan: plan,
      prompt: String(q.prompt || ''),
      options: opts.map(function (x) { return String(x); }),
      answer: String(q.answer || ''),
      analysis: String(q.analysis || ''),
      optionNotes: notes,
      score: null,
      passed: null,
      scoresDetail: null,
      feedback: ''
    };
  }

  function avgScore(questions) {
    const vals = questions.map(function (q) { return q.score; })
      .filter(function (s) { return typeof s === 'number' && isFinite(s); });
    if (!vals.length) return null;
    return Math.round(vals.reduce(function (a, b) { return a + b; }, 0) / vals.length);
  }

  /**
   * 跑完整的多轮出题。
   * @param {object} o { unit, bookName, count, onEvent }
   * @returns {Promise<{rounds:Array, errors:Array}>}
   *          rounds[].questions 是这一轮的完整题目，界面直接按轮展示。
   */
  async function runRound(o) {
    const unit = o.unit;
    const bookName = o.bookName || '';
    const count = Math.max(1, Math.floor(Number(o.count) || 5));
    const onEvent = typeof o.onEvent === 'function' ? o.onEvent : function () {};
    const rounds = [];
    const errors = [];
    const bookMeta = (root.SHT && root.SHT.BOOKS && SHT.BOOKS.current().meta) || {};
    let planFeedback = [];

    for (let roundNo = 1; roundNo <= MAX_ROUNDS; roundNo += 1) {
      onEvent({ role: 'plan', text: '第 ' + roundNo + ' 轮：正在指定方案', round: roundNo });

      const planRes = await call('plan', {
        unit: unit, bookName: bookName, count: count, feedback: planFeedback.slice()
      });
      if (!planRes.ok) {
        errors.push({ round: roundNo, role: 'plan', message: planRes.error ? planRes.error.message : '方案没返回' });
        break;
      }
      const rawPlans = Array.isArray(planRes.json && planRes.json.plans) ? planRes.json.plans : [];
      const plans = fillPlans(rawPlans, count, unit);
      const questions = [];
      const feedbacks = [];
      onEvent({ role: 'plan', text: '第 ' + roundNo + ' 轮：定了 ' + plans.length + ' 个考点', round: roundNo });

      for (let i = 0; i < plans.length; i += 1) {
        const plan = plans[i];
        const no = i + 1;
        onEvent({ role: 'generate', text: '第 ' + roundNo + ' 轮 · 第 ' + no + ' 题：正在写', round: roundNo, no: no });
        const gen = await call('generate', { unit: unit, bookName: bookName, plan: plan });
        if (!gen.ok) {
          errors.push({ round: roundNo, no: no, role: 'generate',
            message: gen.error ? gen.error.message : '没出题' });
          continue;
        }
        const q = snapshot(gen.json, plan, no);
        if (!q.prompt || q.options.length < 2) {
          q.passed = false;
          q.feedback = '题目字段不全';
          questions.push(q);
          continue;
        }

        onEvent({ role: 'verify', text: '第 ' + roundNo + ' 轮 · 第 ' + no + ' 题：正在打分', round: roundNo, no: no });
        const ver = await call('verify', {
          unit: unit, bookName: bookName, bookMeta: bookMeta, plan: plan, question: q
        });
        if (!ver.ok) {
          q.passed = null;
          q.feedback = '没收到打分';
          errors.push({ round: roundNo, no: no, role: 'verify',
            message: ver.error ? ver.error.message : '没给分数' });
        } else {
          const v = ver.json || {};
          const score = Number(v.total_score);
          q.score = isFinite(score) ? score : null;
          q.passed = v.passed === true;
          q.scoresDetail = v.scores_detail || null;
          q.feedback = String(v.feedback_to_thinker || '');
          if (!q.passed && q.feedback) feedbacks.push(q.feedback);
        }
        questions.push(q);
        onEvent({ role: 'verify', text: '第 ' + roundNo + ' 轮 · 第 ' + no + ' 题：' +
          (q.passed ? '通过' : '未通过'), round: roundNo, no: no, question: q });
      }

      const total = avgScore(questions);
      const passed = questions.length > 0 && questions.every(function (q) { return q.passed === true; }) &&
        total != null && total >= PASS_LINE;
      const round = {
        no: roundNo,
        score: total,
        passed: passed,
        feedback: feedbacks.slice(0, 6),
        questions: questions
      };
      rounds.push(round);
      onEvent({ role: 'round', text: '第 ' + roundNo + ' 轮完成：' +
        (total == null ? '没有分数' : total + ' 分') + (passed ? '，通过' : '，继续下一轮'),
        round: roundNo, roundData: round });

      if (passed) break;
      planFeedback = feedbacks.length ? feedbacks.slice(0, 6) :
        ['上一轮题目质量不足，请写清目标词汇、情境和切入点后重做方案'];
    }

    return { rounds: rounds, errors: errors };
  }

  SHT.pipeline = {
    runRound: runRound,
    fillPlans: fillPlans,
    MAX_ROUNDS: MAX_ROUNDS,
    PASS_LINE: PASS_LINE
  };
})(window);
