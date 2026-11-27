/*
 * 出题流水线：指定方案 → 执行 → 反馈，按「整轮」迭代。
 *
 * 一轮 = 一整套题 + 这一套的分。反馈不通过时先判断是谁的问题：
 * 方案问题 → 重新指定方案；题目内容问题 → 复用方案。无论哪种，已通过的题
 * 都跨轮保留、不再重新生成，只重出没通过的那道题。每一轮题目原文完整留存。
 * 前端不参与这个过程，它只拿到 rounds 数组。
 */
(function (root) {
  const SHT = (root.SHT = root.SHT || {});

  const MAX_ROUNDS = 4;
  const PASS_LINE = 85;

  /* 查重指纹：题干+选项+答案 归一化后拼串，只拦「整套照搬」，不碰正常同考点不同题。 */
  function normalize(s) {
    return String(s == null ? '' : s).toLowerCase()
      .replace(/[\s\u3000]/g, '')
      .replace(/[，。！？、；：""''（）()《》\[\]{}.,!?;:'"\/\\-]/g, '');
  }
  function fingerprint(q) {
    const opts = (Array.isArray(q.options) ? q.options : []).map(normalize).sort().join('|');
    return normalize(q.prompt) + '###' + opts + '###' + normalize(q.answer);
  }
  function isRepeat(q, seen) {
    const fp = fingerprint(q);
    return (seen || []).some(function (s) { return fingerprint(s) === fp; });
  }
  function seenLine(q) {
    return '题干：' + (q.prompt || '') + '；选项：' + (q.options || []).join(' / ') +
      '；答案：' + (q.answer || '');
  }
  /* 查重记录只收已达标的题：未达标的不进 seen，重出时不会拿它当「别重复」的依据。 */

  function call(role, ctx) {
    const r = SHT.ROLES[role];
    return SHT.llm.call({
      role: role,
      system: r.system(),
      user: r.user(ctx),
      seen: ctx.seen || [],
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
      feedback: '',
      issueType: null,
      feedbackToExecutor: ''
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
    let plans = null;            // 本轮要用的方案；null = 本轮重新指定
    let genFeedback = [];        // 长度 count：每道题执行层退回的原因，跨轮带下去
    let prevQuestions = null;    // 上一轮题目快照，已通过的题跨轮保留、不重新生成
    let planFeedback = [];       // 方案层退回的原因，跨轮带下去
    const seen = [];             // 查重记录：只收已达标（passed）的题，未达标的不记

    for (let roundNo = 1; roundNo <= MAX_ROUNDS; roundNo += 1) {
      const reuse = !!plans;

      if (!reuse) {
        onEvent({ role: 'plan', text: '第 ' + roundNo + ' 轮：正在指定方案', round: roundNo });
        const prevPlans = prevQuestions ? prevQuestions.map(function (q) {
          const pl = q.plan || {};
          return {
            kp: String(pl.kp || ''),
            ability: String(pl.ability || 'vocab'),
            level: String(pl.level || '认'),
            angle: String(pl.angle || ''),
            passed: q.passed === true
          };
        }) : null;
        const planRes = await call('plan', {
          unit: unit, bookName: bookName, count: count,
          feedback: planFeedback.slice(),
          prevPlans: prevPlans
        });
        if (!planRes.ok) {
          errors.push({ round: roundNo, role: 'plan', message: planRes.error ? planRes.error.message : '方案没返回' });
          break;
        }
        const rawPlans = Array.isArray(planRes.json && planRes.json.plans) ? planRes.json.plans : [];
        plans = fillPlans(rawPlans, count, unit);
        genFeedback = [];
      } else {
        onEvent({ role: 'plan', text: '第 ' + roundNo + ' 轮：复用上轮方案，只重出未通过的题', round: roundNo });
      }

      const questions = [];
      const feedbacks = [];
      const roundFeedbacks = [];
      onEvent({ role: 'plan', text: '第 ' + roundNo + ' 轮：定了 ' + plans.length + ' 个考点', round: roundNo });

      for (let i = 0; i < plans.length; i += 1) {
        const plan = plans[i];
        const no = i + 1;

        // 已通过的题直接沿用上一轮快照，不再重出、不再重打分（无论方案是否重做）
        if (prevQuestions && prevQuestions[i] && prevQuestions[i].passed === true) {
          const kept = Object.assign({}, prevQuestions[i]);
          kept.no = no;
          questions.push(kept);
          onEvent({ role: 'verify', text: '第 ' + roundNo + ' 轮 · 第 ' + no + ' 题：沿用上轮已通过', round: roundNo, no: no, question: kept });
          continue;
        }

        onEvent({ role: 'generate', text: '第 ' + roundNo + ' 轮 · 第 ' + no + ' 题：正在写', round: roundNo, no: no });
        const fb = genFeedback[i] ? [genFeedback[i]] : [];
        const gen = await call('generate', {
          unit: unit, bookName: bookName, plan: plan, feedback: fb,
          seen: seen.map(seenLine)
        });
        if (!gen.ok) {
          errors.push({ round: roundNo, no: no, role: 'generate',
            message: gen.error ? gen.error.message : '没出题' });
          continue;
        }
        const q = snapshot(gen.json, plan, no);
        if (!q.prompt || q.options.length < 4) {
          q.passed = false;
          q.feedback = '题目字段不全';
          q.issueType = 'generate';
          questions.push(q);
          continue;
        }

        onEvent({ role: 'verify', text: '第 ' + roundNo + ' 轮 · 第 ' + no + ' 题：正在打分', round: roundNo, no: no });
        const ver = await call('verify', {
          unit: unit, bookName: bookName, bookMeta: bookMeta, plan: plan,
          question: q
        });
        if (!ver.ok) {
          q.passed = null;
          q.feedback = '没收到打分';
          q.issueType = 'plan';
          errors.push({ round: roundNo, no: no, role: 'verify',
            message: ver.error ? ver.error.message : '没给分数' });
        } else {
          const v = ver.json || {};
          const score = Number(v.total_score);
          q.score = isFinite(score) ? score : null;
          q.passed = v.passed === true;
          q.scoresDetail = v.scores_detail || null;
          q.feedback = String(v.feedback_to_thinker || '');
          q.feedbackToExecutor = String(v.feedback_to_executor || '');
          const rawIssue = String(v.issue_type || '');
          q.issueType = (rawIssue === 'plan' || rawIssue === 'generate' || rawIssue === 'both') ? rawIssue : 'plan';
        }
        if (q.passed) {
          seen.push(q);
        } else {
          if (q.feedback) feedbacks.push(q.feedback);
          roundFeedbacks.push(q.feedback || q.feedbackToExecutor || '');
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
        feedback: roundFeedbacks.slice(0, 6),
        questions: questions
      };
      rounds.push(round);
      onEvent({ role: 'round', text: '第 ' + roundNo + ' 轮完成：' +
        (total == null ? '没有分数' : total + ' 分') + (passed ? '，通过' : '，继续下一轮'),
        round: roundNo, roundData: round });

      if (passed) break;

      // 已通过的题跨轮保留，不重新生成
      prevQuestions = questions;

      // 这一轮没通过是谁的问题：方案问题 → 重新指定方案；题目内容问题 → 复用方案
      const hasPlanIssue = questions.some(function (q) {
        return q.passed !== true && (q.issueType === 'plan' || q.issueType === 'both');
      });
      if (hasPlanIssue) {
        plans = null;
        planFeedback = feedbacks.length ? feedbacks.slice(0, 6) :
          ['上一轮题目质量不足，请写清目标词汇、情境和切入点后重做方案'];
      } else {
        genFeedback = questions.map(function (q) {
          return q.passed === true ? '' : (q.feedbackToExecutor || '');
        });
        planFeedback = [];
      }
    }

    return { rounds: rounds, errors: errors, seen: seen };
  }

  SHT.pipeline = {
    runRound: runRound,
    fillPlans: fillPlans,
    isRepeat: isRepeat,
    MAX_ROUNDS: MAX_ROUNDS,
    PASS_LINE: PASS_LINE
  };
})(window);
