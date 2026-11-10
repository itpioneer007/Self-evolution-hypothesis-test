/*
 * 考点推进：每轮只考一部分，会了就往上走一层，整池考完再换池
 *
 * 三条判据（都是可复算的，不看模型怎么说）：
 *   1 层次阶梯：认 → 辨 → 用 → 表达。同一考点真会一次升一层，到表达层真会就退役。
 *   2 学生分层设上限：A 层可到表达，B 层到用，C 层到辨。上限由 learningLayer 决定，
 *     不由模型临时决定——否则同一个 C 层学生会被出到表达题。
 *   3 池子：勾选的候选是一轮的范围，考完（全部退役）就扩池；扩不出新考点说明本单元考尽。
 *
 * 为什么不用模型记这个：模型没有跨轮状态，记不住「这个考点他已经会了两次」。
 * 记在代码里，下一轮才能拿它去排题、去卡层次。
 */
(function (root) {
  const SHT = (root.SHT = root.SHT || {});

  const LADDER = ['认', '辨', '用', '表达'];
  const CAP_OF_LAYER = { A: '表达', B: '用', C: '辨' };

  function idx(level) {
    const i = LADDER.indexOf(level);
    return i < 0 ? 0 : i;
  }
  function up(level) { return LADDER[Math.min(LADDER.length - 1, idx(level) + 1)]; }
  function down(level) { return LADDER[Math.max(0, idx(level) - 1)]; }

  function blank() { return { points: {} }; }

  function entryOf(state, kp) {
    state.points[kp] = state.points[kp] || { level: '认', mastered: 0, wrong: 0, retired: false };
    return state.points[kp];
  }

  /**
   * 把一轮作答写进推进状态。纯函数，返回新对象。
   * @param {object} prev 上一份推进状态
   * @param {object} round { questions, attempts } attempts 里的 no 对应 questions 的 no
   */
  function commit(prev, round) {
    const next = JSON.parse(JSON.stringify(prev && prev.points ? prev : blank()));
    const questions = (round && round.questions) || [];
    const attempts = (round && round.attempts) || [];
    if (!questions.length) return next;

    const byNo = {};
    attempts.forEach(function (a) {
      (byNo[a.no] = byNo[a.no] || []).push(a);
    });

    questions.forEach(function (q) {
      if (!q || !q.knowledgePoint) return;
      const list = byNo[q.no] || [];
      if (!list.length) return;
      const judged = SHT.judgePoint(list);
      const e = entryOf(next, q.knowledgePoint);
      if (judged.state === 'mastered') {
        e.mastered += 1;
        e.level = up(e.level);
        // 到了表达层还答得出来，这个考点没必要再考
        if (idx(e.level) >= LADDER.length - 1 && e.mastered >= 2) e.retired = true;
      } else if (judged.state === 'wrong' || judged.state === 'fragile') {
        e.wrong += 1;
        e.level = down(e.level);
      }
      // passed（只对原题）不动层次：还没证明他会，别急着升级
    });
    return next;
  }

  /**
   * 给规划环节的提示：哪些别考了、哪些要升层、层次上限是多少。
   * @param {object} progress commit 之后的推进状态
   * @param {object} opts { layer, scope }
   */
  function planHint(progress, opts) {
    const o = opts || {};
    const state = progress && progress.points ? progress : blank();
    const cap = CAP_OF_LAYER[o.layer] || '用';
    const retired = [];
    const advancing = [];
    Object.keys(state.points).forEach(function (kp) {
      const e = state.points[kp];
      if (e.retired) { retired.push(kp); return; }
      if (e.mastered > 0) advancing.push({ kp: kp, level: e.level });
    });
    const scope = o.scope || [];
    const scopeKps = scope.map(function (s) { return s.label; });
    const retiredInScope = scopeKps.filter(function (kp) { return retired.indexOf(kp) >= 0; });
    const aliveInScope = scopeKps.filter(function (kp) { return retired.indexOf(kp) < 0; });
    return {
      layer: o.layer || 'B',
      cap: cap,
      ladder: LADDER.slice(),
      retired: retired,
      advancing: advancing,
      retiredInScope: retiredInScope,
      aliveInScope: aliveInScope,
      // 范围考完了：整个勾选池都退役
      scopeExhausted: scopeKps.length > 0 && aliveInScope.length === 0
    };
  }

  /**
   * 自动停止建议。这是「建议 + 依据」，界面仍然把它填进停止条让人看见并可改。
   * SATURATED：本轮排的考点全部真会，且至少 3 个（一两个不足以说饱和）
   * STALLED  ：同一考点连续两轮被退回 / 放弃
   */
  function stopJudge(opts) {
    const o = opts || {};
    const questions = o.questions || [];
    const attempts = o.attempts || [];
    const failures = o.failures || [];
    const signals = [];
    const notes = [];

    const kps = {};
    questions.forEach(function (q) { if (q.knowledgePoint) kps[q.knowledgePoint] = true; });
    const pointList = Object.keys(kps);
    let mastered = 0;
    pointList.forEach(function (kp) {
      const list = attempts.filter(function (a) {
        const q = questions.filter(function (x) { return x.no === a.no; })[0];
        return q && q.knowledgePoint === kp;
      });
      if (list.length && SHT.judgePoint(list).state === 'mastered') mastered += 1;
    });
    if (pointList.length >= 3 && mastered === pointList.length) {
      signals.push('SATURATED');
      notes.push('本轮 ' + pointList.length + ' 个考点全部真会');
    }

    const giveups = {};
    failures.forEach(function (f) {
      if (f.stage === 'giveup' && f.planKp) giveups[f.planKp] = (giveups[f.planKp] || 0) + 1;
    });
    const stuck = Object.keys(giveups).filter(function (k) { return giveups[k] >= 1; });
    if (stuck.length >= 2) {
      signals.push('STALLED');
      notes.push(stuck.length + ' 个考点连续过不了闸');
    }

    return {
      signals: signals,
      reason: notes.join('；'),
      saturated: signals.indexOf('SATURATED') >= 0,
      stalled: signals.indexOf('STALLED') >= 0
    };
  }

  SHT.progress = {
    LADDER: LADDER,
    CAP_OF_LAYER: CAP_OF_LAYER,
    blank: blank,
    commit: commit,
    planHint: planHint,
    stopJudge: stopJudge
  };
})(window);
