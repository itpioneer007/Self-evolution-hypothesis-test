/*
 * 学生评价单与用户画像的数据计算。
 *
 * 纯函数：只读 questions / attempts / events / learnerModel，
 * 不读 DOM、不调用模型。提示后答对只算“看提示才会”，不覆盖首答错误。
 */
(function (root) {
  const SHT = (root.SHT = root.SHT || {});

  function r4(v) { return Math.round((Number(v) || 0) * 10000) / 10000; }
  function ratio(a, b) { return b ? r4(a / b) : null; }
  function safeLabel(value, fallback) { return String(value == null || value === '' ? fallback : value); }

  function finalAttemptsOf(round) {
    return (((round && round.practice && round.practice.attempts) || []).filter(function (a) {
      return a && a.final !== false;
    }));
  }

  function allQuestions(round) {
    return ((round && round.questions) || []).filter(function (q) { return !!q && !!q.knowledgePoint; });
  }

  function questionAttempts(round, q) {
    return (((round && round.practice && round.practice.attempts) || []).filter(function (a) {
      return a && a.no === q.no;
    }));
  }

  function stateFor(final) {
    if (!final) return { state: 'unseen', label: '未测', tone: '' };
    if (final.retried) {
      if (!final.correct) return { state: 'wrong', label: '不会', tone: 'is-bad' };
      return { state: 'assisted', label: '看提示才会', tone: 'is-warn' };
    }
    if (!final.correct) return { state: 'wrong', label: '不会', tone: 'is-bad' };
    if ((final.hintCount || 0) > 0) return { state: 'assisted', label: '看提示才会', tone: 'is-warn' };
    return { state: 'passed', label: '会用', tone: 'is-good' };
  }

  function evidenceOf(final, first) {
    if (!final) return ['还没有完成作答'];
    const bits = [];
    if (first && first.picked) bits.push('首答：' + first.picked);
    if (final.retried) bits.push('提示后重选：' + (final.picked || ''));
    else if (final.picked) bits.push('作答：' + final.picked);
    if (final.retried || (final.hintCount || 0) > 0) bits.push('使用提示');
    if (final.correct && (final.retried || (final.hintCount || 0) > 0)) bits.push('提示后答对');
    else if (final.correct) bits.push('独立答对');
    else bits.push('最终未答对');
    if (final.retryDurationMs || final.durationMs) {
      const ms = final.retryDurationMs || final.durationMs;
      bits.push('用时 ' + (Math.round(ms / 100) / 10) + ' 秒');
    }
    return bits;
  }

  function nextActionFor(state) {
    if (state === 'wrong') return { action: '换场景或换题型再练', code: 'retry_new_context' };
    if (state === 'assisted') return { action: '去掉提示，用同构题再验证', code: 'verify_without_hint' };
    if (state === 'passed') return { action: '换一道同构题验证', code: 'verify_isomorphic' };
    if (state === 'mastered') return { action: '隔一段时间做保持题', code: 'spaced_review' };
    return { action: '下一轮补测', code: 'expose' };
  }

  function dimensionsOf(round) {
    const questions = allQuestions(round);
    const final = finalAttemptsOf(round);
    const total = questions.length;
    const completed = final.length;
    let independent = 0;
    let assisted = 0;
    let wrong = 0;
    let firstCorrect = 0;
    let totalMs = 0;
    final.forEach(function (a) {
      const firstOk = a.firstCorrect !== false;
      if (firstOk) firstCorrect += 1;
      if (a.correct && !a.retried && !(a.hintCount || 0)) independent += 1;
      else if (a.correct && (a.retried || (a.hintCount || 0))) assisted += 1;
      else if (!a.correct) wrong += 1;
      totalMs += a.retryDurationMs || a.durationMs || 0;
    });
    return {
      total: total,
      completed: completed,
      unseen: Math.max(0, total - completed),
      independent: independent,
      assisted: assisted,
      wrong: wrong,
      firstCorrect: firstCorrect,
      independentRate: ratio(independent, completed),
      assistedRate: ratio(assisted, completed),
      wrongRate: ratio(wrong, completed),
      firstPassRate: ratio(firstCorrect, completed),
      coverage: ratio(completed, total),
      averageMs: completed ? Math.round(totalMs / completed) : 0,
      fluency: null,
      retention: null,
      transfer: null
    };
  }

  function buildRoundReport(opts) {
    const o = opts || {};
    const round = o.round || {};
    const dims = dimensionsOf(round);
    const learnerModel = o.learnerModel || (SHT.learner && SHT.learner.build ? SHT.learner.build(o.events || []) : {});
    const questions = allQuestions(round);
    const points = questions.map(function (q) {
      const list = questionAttempts(round, q);
      const final = list.filter(function (a) { return a.final !== false; }).slice(-1)[0] || null;
      const first = list.filter(function (a) { return a.attemptIndex === 1; })[0] || final;
      const state = stateFor(final);
      const knowledge = learnerModel.byKp && learnerModel.byKp[q.knowledgePoint];
      const kpMeta = SHT.kpByLabel ? SHT.kpByLabel(q.knowledgePoint) : null;
      const action = nextActionFor(state.state);
      return {
        no: q.no,
        qid: q.qid || '',
        kp: q.knowledgePoint,
        state: state.state,
        stateLabel: state.label,
        tone: state.tone,
        mastery: knowledge ? knowledge.pKnown : null,
        durationMs: final ? (final.retryDurationMs || final.durationMs || 0) : 0,
        pathStage: kpMeta ? kpMeta.pathStage : null,
        pathLabel: kpMeta ? kpMeta.pathLabel : '',
        evidence: evidenceOf(final, first),
        diagnosis: (final && final.diag && (final.diag.causeLabel || final.diag.headline)) || '',
        nextAction: action
      };
    });
    const performanceScore = dims.completed
      ? Math.round(100 * ((dims.independent + 0.5 * dims.assisted) / dims.completed))
      : null;
    const evidenceLevel = dims.completed >= 5 ? 'high' : (dims.completed >= 3 ? 'medium' : 'low');
    return {
      version: 'student-report-v1',
      generatedAt: new Date().toISOString(),
      scoreVersion: 'score-v0.1',
      dimensions: dims,
      performanceScore: performanceScore,
      scoreFormula: '独立答对 1 分，提示后答对 0.5 分，答错 0 分，除以已完成题数',
      evidenceLevel: evidenceLevel,
      knowledgePoints: points,
      caveats: [
        '表现分只代表本轮练习，不等同于英语综合水平。',
        '保持度和迁移度需要隔天或换模态验证，当前标为待验证。',
        '熟练度先展示作答时间，接入题目预计时长后再做标准化评分。'
      ]
    };
  }

  function categoryOf(question, meta) {
    const type = (meta && meta.targetType) || (meta && meta.ability) || question.ability || '';
    if (type === 'phonics') return 'phonics';
    if (type === 'sentence' || type === 'grammar') return 'sentence';
    const label = String(question.knowledgePoint || '');
    if (/^phonics/i.test(label)) return 'phonics';
    if (/^sentence|^grammar/i.test(label)) return 'sentence';
    return 'vocab';
  }

  const CATEGORY_LABELS = { vocab: '单词', sentence: '句型', phonics: '自然拼读' };

  function buildUserProfile(opts) {
    const o = opts || {};
    const rounds = o.rounds || {};
    const all = [];
    Object.keys(rounds).sort().forEach(function (key) {
      const round = rounds[key];
      (allQuestions(round) || []).forEach(function (q) {
        all.push({ roundNo: Number(key), q: q, round: round });
      });
    });
    const learnerModel = o.learnerModel || (SHT.learner && SHT.learner.build ? SHT.learner.build(o.events || []) : {});
    const rows = all.map(function (item) {
      const list = questionAttempts(item.round, item.q);
      const final = list.filter(function (a) { return a.final !== false; }).slice(-1)[0] || null;
      const first = list.filter(function (a) { return a.attemptIndex === 1; })[0] || final;
      const state = stateFor(final);
      const knowledge = learnerModel.byKp && learnerModel.byKp[item.q.knowledgePoint];
      const kpMeta = SHT.kpByLabel ? SHT.kpByLabel(item.q.knowledgePoint) : null;
      const category = categoryOf(item.q, kpMeta);
      return {
        round: item.roundNo,
        kp: item.q.knowledgePoint,
        category: category,
        categoryLabel: CATEGORY_LABELS[category],
        state: state.state,
        stateLabel: state.label,
        tone: state.tone,
        mastery: knowledge ? knowledge.pKnown : null,
        durationMs: final ? (final.retryDurationMs || final.durationMs || 0) : 0,
        pathStage: kpMeta ? kpMeta.pathStage : null,
        pathLabel: kpMeta ? kpMeta.pathLabel : '',
        evidence: evidenceOf(final, first),
        nextAction: nextActionFor(state.state)
      };
    });
    const dims = { total: rows.length, completed: rows.filter(function (r) { return r.state !== 'unseen'; }).length };
    const finalRows = rows.filter(function (r) { return r.state !== 'unseen'; });
    dims.independent = finalRows.filter(function (r) { return r.state === 'passed'; }).length;
    dims.assisted = finalRows.filter(function (r) { return r.state === 'assisted'; }).length;
    dims.wrong = finalRows.filter(function (r) { return r.state === 'wrong'; }).length;
    dims.unseen = rows.length - finalRows.length;
    dims.independentRate = ratio(dims.independent, dims.completed);
    dims.assistedRate = ratio(dims.assisted, dims.completed);
    dims.wrongRate = ratio(dims.wrong, dims.completed);
    dims.coverage = ratio(dims.completed, dims.total);
    const unitKps = (SHT.kpsOf && SHT.curriculum && SHT.kpsOf(SHT.curriculum.id)) || [];
    const targetTotal = { vocab: 0, sentence: 0, phonics: 0 };
    unitKps.forEach(function (k) {
      const key = k.targetType === 'word' ? 'vocab' : k.targetType;
      if (targetTotal[key] != null) targetTotal[key] += 1;
    });
    const byCategory = {};
    rows.forEach(function (r) {
      if (!byCategory[r.category]) {
        byCategory[r.category] = { key: r.category, name: r.categoryLabel || CATEGORY_LABELS[r.category], rows: [] };
      }
      byCategory[r.category].rows.push(r);
    });
    const categories = Object.keys(CATEGORY_LABELS).filter(function (key) {
      return byCategory[key] || targetTotal[key] > 0;
    }).map(function (key) {
      const group = byCategory[key] || { key: key, name: CATEGORY_LABELS[key], rows: [] };
      const latestByTarget = {};
      group.rows.forEach(function (r) { latestByTarget[r.kp] = r; });
      const uniqueRows = Object.keys(latestByTarget).map(function (k) { return latestByTarget[k]; });
      const completedRows = group.rows.filter(function (r) { return r.state !== 'unseen'; });
      const latestCompleted = uniqueRows.filter(function (r) { return r.state !== 'unseen'; });
      const independent = completedRows.filter(function (r) { return r.state === 'passed'; }).length;
      const assisted = completedRows.filter(function (r) { return r.state === 'assisted'; }).length;
      const wrong = completedRows.filter(function (r) { return r.state === 'wrong'; }).length;
      const completed = completedRows.length;
      const covered = latestCompleted.length;
      const total = targetTotal[key] || uniqueRows.length || 0;
      const masteryVals = latestCompleted.map(function (r) { return r.mastery; }).filter(function (x) { return x != null; });
      const durationVals = completedRows.map(function (r) { return r.durationMs; }).filter(function (x) { return x > 0; });
      const pending = Math.max(0, total - covered);
      const masteryMean = masteryVals.length ? r4(masteryVals.reduce(function (a, b) { return a + b; }, 0) / masteryVals.length) : null;
      const observedMastery = completed ? r4((independent + 0.5 * assisted) / completed) : null;
      const coverageRate = total ? ratio(covered, total) : null;
      const masteryScore = observedMastery == null ? null : r4(observedMastery * (coverageRate == null ? 1 : coverageRate));
      let state = 'unseen';
      let stateLabel = '待覆盖';
      if (pending === 0 && wrong > 0) { state = 'wrong'; stateLabel = '需巩固'; }
      else if (pending === 0 && assisted > 0) { state = 'assisted'; stateLabel = '待独立'; }
      else if (pending === 0 && completed > 0) { state = 'passed'; stateLabel = '基本掌握'; }
      const action = pending > 0
        ? { action: '继续覆盖剩余目标', code: 'cover_pending' }
        : (wrong > 0 ? { action: '回到错误目标重新练', code: 'retry_wrong' } :
          (assisted > 0 ? { action: '去掉提示，用同构题验证', code: 'verify_without_hint' } :
            { action: '换题面做保持验证', code: 'verify_isomorphic' }));
      return {
        kp: CATEGORY_LABELS[key],
        key: key,
        state: state,
        stateLabel: stateLabel,
        tone: wrong > 0 ? 'is-bad' : (assisted > 0 ? 'is-warn' : (pending > 0 ? 'is-muted' : 'is-good')),
        mastery: masteryScore,
        masteryMean: masteryMean,
        masteryScore: masteryScore,
        independenceRate: ratio(independent, completed),
        accuracyRate: ratio(independent + assisted, completed),
        firstPassRate: ratio(independent, completed),
        completed: completed,
        covered: covered,
        targetCount: total,
        pending: pending,
        independent: independent,
        assisted: assisted,
        wrong: wrong,
        averageMs: durationVals.length ? Math.round(durationVals.reduce(function (x, y) { return x + y; }, 0) / durationVals.length) : 0,
        fluency: null,
        retention: null,
        transfer: null,
        pathStage: null,
        pathLabel: '单元整体 · ' + CATEGORY_LABELS[key],
        evidence: [
          '覆盖 ' + covered + ' / ' + total + ' 个目标',
          '独立答对 ' + independent + ' 次',
          '提示后答对 ' + assisted + ' 次',
          '答错 ' + wrong + ' 次'
        ],
        nextAction: action,
        rounds: group.rows.map(function (r) { return r.round; }).filter(function (v, i, a) { return a.indexOf(v) === i; })
      };
    });
    return {
      version: 'student-profile-v2',
      generatedAt: new Date().toISOString(),
      unit: SHT.curriculum ? SHT.curriculum.id : '',
      unitTitle: SHT.curriculum ? SHT.curriculum.title : '',
      dimensions: dims,
      knowledgePoints: categories,
      rows: rows,
      caveats: [
        '画像按当前单元的单词、句型、自然拼读聚合，不把单个词当成整体能力。',
        '熟练度、保持度和迁移度需要后续反馈任务，当前不伪造分数。'
      ]
    };
  }

  SHT.assessment = {
    buildRoundReport: buildRoundReport,
    buildUserProfile: buildUserProfile,
    finalAttemptsOf: finalAttemptsOf,
    stateFor: stateFor
  };
})(window);
