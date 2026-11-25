/*
 * 出题流水线：指定方案 → 执行 → 反馈。
 *
 * 一条计划出一题；反馈说不行就把原因退回执行重出，最多两次。
 * 三处判断都在模型侧（agents.js 的三份提示词），这里只做编排与留痕。
 * 输出的 questions 就是要展示的题目列表；dialogue 记录三个角色每一步说了什么。
 */
(function (root) {
  const SHT = (root.SHT = root.SHT || {});

  const MAX_RETRY = 2;

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

  /*
   * 方案角色若少给，从本单元词表里挑没被提到的词补一条。
   * 说几道就出几道，不靠“模型应该会给够”这种假设。
   */
  function normalizePlan(p) {
    return {
      kp: String((p && p.kp) || ''),
      ability: String((p && p.ability) || 'vocab'),
      level: String((p && p.level) || '认'),
      angle: String((p && p.angle) || '')
    };
  }

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

  function normalizeQuestion(raw, plan, no) {
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
      passed: null,
      reviews: []
    };
  }

  /**
   * 跑一轮出题。
   * @param {object} o { unit, bookName, count, onEvent }
   * @returns {Promise<{questions:Array, plans:Array, dialogue:Array, errors:Array}>}
   */
  async function runRound(o) {
    const unit = o.unit;
    const bookName = o.bookName || '';
    const count = Math.max(1, Math.floor(Number(o.count) || 5));
    const onEvent = typeof o.onEvent === 'function' ? o.onEvent : function () {};
    const dialogue = [];
    const questions = [];
    const errors = [];

    // 第一个角色：指定方案
    onEvent({ role: 'plan', text: '正在指定这轮考哪几个点' });
    const planRes = await call('plan', { unit: unit, bookName: bookName, count: count });
    if (!planRes.ok) {
      errors.push({ role: 'plan', message: planRes.error ? planRes.error.message : '方案没返回' });
      return { questions: questions, plans: [], dialogue: dialogue, errors: errors };
    }
    const rawPlans = Array.isArray(planRes.json && planRes.json.plans) ? planRes.json.plans : [];
    const plans = fillPlans(rawPlans, count, unit);
    dialogue.push({
      role: 'plan', title: '指定方案',
      text: '这轮考 ' + plans.length + ' 个点：' + plans.map(function (p) { return p.kp; }).join('、'),
      plans: plans
    });
    onEvent({ role: 'plan', text: '定好 ' + plans.length + ' 个考点，开始出题', plans: plans });

    const bookMeta = (root.SHT && root.SHT.BOOKS && SHT.BOOKS.current().meta) || {};
    // 一条计划出一题。反馈打分不通过时，先让方案角色按建议修订这一条，再由执行重出。
    for (let i = 0; i < plans.length; i += 1) {
      let plan = plans[i];
      const no = i + 1;
      const planFeedback = [];
      let question = null;
      let attempts = 0;

      while (attempts <= MAX_RETRY) {
        // 反馈角色给的是「给方案的建议」，所以先回给方案，不直接让执行改题。
        if (planFeedback.length) {
          onEvent({ role: 'plan', text: '第 ' + no + ' 题：按反馈修订方案', no: no });
          const fix = await call('plan', { unit: unit, bookName: bookName, count: 1, feedback: planFeedback.slice() });
          if (fix.ok && fix.json && Array.isArray(fix.json.plans) && fix.json.plans[0]) {
            plan = normalizePlan(fix.json.plans[0]);
            plans[i] = plan;
            dialogue.push({
              role: 'plan', title: '指定方案', no: no,
              text: '第 ' + no + ' 题按反馈修订方案：' + plan.kp
            });
            onEvent({ role: 'plan', no: no, text: '第 ' + no + ' 题方案已修订：' + plan.kp });
          }
        }

        onEvent({
          role: 'generate', text: '第 ' + no + ' 题：' + (attempts ? '按新方案重出' : '正在写题'),
          no: no, attempt: attempts + 1
        });
        const gen = await call('generate', { unit: unit, bookName: bookName, plan: plan });
        if (!gen.ok) {
          errors.push({ role: 'generate', no: no, message: gen.error ? gen.error.message : '没出题' });
          break;
        }
        // 重出是另写一版题，但前面几版的打分记录要留下，不能随新对象一起丢。
        const priorReviews = question ? question.reviews : [];
        question = normalizeQuestion(gen.json, plan, no);
        question.reviews = priorReviews;
        if (!question.prompt || question.options.length < 2) {
          question.reviews.push({ attempt: attempts + 1, passed: false, score: 0,
            feedback: '题目字段不全，执行直接重出' });
          attempts += 1;
          continue;
        }

        onEvent({ role: 'verify', text: '第 ' + no + ' 题：正在按十个维度打分', no: no, attempt: attempts + 1 });
        const ver = await call('verify', {
          unit: unit, bookName: bookName, bookMeta: bookMeta, plan: plan, question: question
        });
        if (!ver.ok) {
          errors.push({ role: 'verify', no: no, message: ver.error ? ver.error.message : '没给分数' });
          question.passed = null;
          question.reviews.push({ attempt: attempts + 1, passed: null, score: null,
            feedback: '没收到打分' });
          dialogue.push({ role: 'verify', title: '反馈', text: '第 ' + no + ' 题没收到打分', no: no });
          break;
        }
        const v = ver.json || {};
        const pass = v.passed === true;
        const score = Number(v.total_score);
        const reason = String(v.feedback_to_thinker || '');
        question.passed = pass;
        question.score = isFinite(score) ? score : null;
        question.reviews.push({
          attempt: attempts + 1, passed: pass,
          score: isFinite(score) ? score : null,
          feedback: reason,
          scoresDetail: v.scores_detail || null
        });
        dialogue.push({
          role: 'verify', title: '反馈', no: no,
          text: '第 ' + no + ' 题：' + (pass ? '通过 ' : '未通过 ') +
            (isFinite(score) ? score + ' 分' : '无分数') + (pass ? '' : '——' + (reason || '没写建议'))
        });

        if (pass) break;
        planFeedback.push(reason || '方案不够具体，请写清目标词汇、情境和切入点');
        attempts += 1;
      }

      if (question) {
        question.reviews.forEach(function (r) {
          dialogue.push({
            role: 'generate', title: '执行', no: no,
            text: '第 ' + no + ' 题第 ' + r.attempt + ' 版' +
              (r.passed === false ? '，未通过 ' + (r.score == null ? '' : r.score + ' 分') : '')
          });
        });
        questions.push(question);
        onEvent({
          role: 'verify', no: no,
          text: '第 ' + no + ' 题：' + (question.passed
            ? '通过（' + (question.score == null ? '?' : question.score) + ' 分）'
            : '未通过，已留在这份列表里'),
          question: question
        });
      }
    }

    return { questions: questions, plans: plans, dialogue: dialogue, errors: errors };
  }

  SHT.pipeline = { runRound: runRound, fillPlans: fillPlans, MAX_RETRY: MAX_RETRY };
})(window);
