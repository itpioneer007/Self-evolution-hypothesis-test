/*
 * 错题本核心逻辑（纯函数，无 DOM 依赖）
 *
 * 借鉴主仓：
 *   projectWeaknesses()          src/entities/weakness-projection/projectWeaknesses.ts:194-295
 *   状态机 / status 镜像          src/entities/wrong-question/updateWrongQuestions.ts:3-20
 *   isQualifiedEvidence()        src/entities/attempt/evidencePolicy.ts:3-8
 *   认证达标                     src/entities/remediation-certification/completeRemediationCertification.ts:5-68
 *   停止阈值 A90/B80/C70         同上 :5-7
 *
 * 本模板的补充（主仓没有的）：
 *   - ERROR_CAUSES：结构化错因分类。主仓错因是 AI 自由文本，不可计算。
 *   - suggestCell()：错因 → 建议格子，把错题直接接到「变化轴」上，
 *     对应 出题手册 5.2 第 6 步「重新规划前先查记忆库」与 单题出题检查表 第七节。
 *   - 教师介入阈值沿用 remediationLoopCount >= 2（projectWeaknesses.ts:148）。
 */
(function (root) {
  const SHT = (root.SHT = root.SHT || {});

  SHT.MASTERY_LABELS = {
    wrong: '待订正',
    corrected: '已订正',
    'awaiting-certification': '等待认证',
    mastered: '已掌握',
    'teacher-help': '需教师介入'
  };

  SHT.ERROR_CAUSES = [
    { id: '形近混淆', label: '形近混淆', hint: '如 class / classroom', level: '辨', distractor: '形近', types: ['拼写补全', '中英匹配'] },
    { id: '音近混淆', label: '音近混淆', hint: '如 line / lion', level: '辨', distractor: '音近', types: ['听音选义', '字母组合辨音'] },
    { id: '语法错形', label: '语法错形', hint: '三单漏 s、be 动词误用', level: '用', distractor: '语法错形', types: ['选词填空', '句子判断'] },
    { id: '单复数', label: '单复数一致', hint: 'There is / are', level: '用', distractor: '语法错形', types: ['选词填空', '句子判断'] },
    { id: '近义混淆', label: '近义混淆', hint: '词义边界不清', level: '用', distractor: '语义近', types: ['选词填空', '对话补全'] },
    { id: '母语负迁移', label: '母语负迁移', hint: '按中文语序直译', level: '用', distractor: '母语负迁移', types: ['对话补全', '句子判断'] },
    { id: '未掌握', label: '尚未掌握', hint: '认不出、说不出', level: '认', distractor: '同类不同物', types: ['听音选义', '中英匹配'] }
  ];

  SHT.causeById = function (id) {
    return SHT.ERROR_CAUSES.filter(function (c) { return c.id === id; })[0] || SHT.ERROR_CAUSES[6];
  };

  // 错因 → 建议格子。情境固定为本单元话题域，换情境会引入单元外词汇（超纲）。
  SHT.suggestCell = function (causeId, topicDomain) {
    const cause = SHT.causeById(causeId);
    return {
      type: cause.types[0],
      scene: topicDomain || '学校',
      level: cause.level,
      distractor: cause.distractor
    };
  };

  // 业务键去重：借鉴 sameWrongItem() / isSameWrongCase()
  SHT.makeWrongCaseId = function (studentId, unitId, originalQuestionId) {
    return 'wq:' + studentId + ':' + unitId + ':' + originalQuestionId;
  };

  // 证据合格性：借鉴 evidencePolicy.ts
  SHT.isQualifiedEvidence = function (attempt) {
    const method = attempt.scoringMethod || 'exact';
    if (method === 'simulated' || method === 'self-check' || method === 'not-observed') return false;
    return !(attempt.ability === 'speaking' && method !== 'ise-pronunciation');
  };

  function isSupportOnly(attempt) {
    return (attempt.hintCount || 0) > 0 || (attempt.retryCount || 0) > 0;
  }

  /*
   * 薄弱点投影：把错题案折叠成可被规划直接消费的只读视图。
   * 主仓按 knowledgePointId / wrongQuestion.id 分组；这里按知识点的中文粒度分组。
   */
  SHT.projectWeaknesses = function (cases, topicDomain) {
    const groups = new Map();
    (cases || []).forEach(function (c) {
      const key = c.knowledgePoint || c.id;
      if (!groups.has(key)) {
        groups.set(key, { key: key, label: key, ability: c.ability, cases: [], errorCount: 0, supportCount: 0, masteredCount: 0, loopCount: 0 });
      }
      const g = groups.get(key);
      g.cases.push(c);
      g.errorCount += 1; // 首次错误
      if (isSupportOnly(c.firstAttemptEvidence || {})) g.supportCount += 1;
      (c.variantAttempts || []).forEach(function (a) {
        if (!a.correct) g.errorCount += 1;
        if (isSupportOnly(a)) g.supportCount += 1;
      });
      if (c.masteryState === 'mastered') g.masteredCount += 1;
      g.loopCount = Math.max(g.loopCount, c.remediationLoopCount || 0);
    });

    const items = Array.from(groups.values()).map(function (g) {
      const allMastered = g.masteredCount === g.cases.length;
      let status = 'needs-remediation';
      if (allMastered) status = 'mastered';
      else if (g.loopCount >= 2) status = 'teacher-help';
      else if (g.cases.some(function (c) { return c.masteryState === 'corrected'; })) status = 'in-progress';

      let score = g.errorCount >= 3 ? 80 : g.errorCount === 2 ? 65 : 50;
      if (status === 'teacher-help') score = 100;
      if (status === 'mastered') score = -1;
      score += g.supportCount * 3;

      const causes = {};
      g.cases.forEach(function (c) { causes[c.category] = (causes[c.category] || 0) + 1; });
      const topCause = Object.keys(causes).sort(function (a, b) { return causes[b] - causes[a]; })[0] || '未掌握';

      /*
       * 掌握概率：把这一组的作答序列（首错 + 每次回练）过一遍 BKT。
       * 为什么不用「错过几次」：次数不带顺序，也分不出「错 3 次后连对 2 次」和
       * 「连错 3 次」。规划环节要的是「现在多半会不会」，这个数才给得出。
       */
      const seq = [];
      g.cases.forEach(function (c) {
        seq.push({
          correct: false,
          hintCount: (c.firstAttemptEvidence || {}).hintCount || 0,
          at: c.createdAt || c.firstAttemptEvidence && c.firstAttemptEvidence.completedAt || ''
        });
        (c.variantAttempts || []).forEach(function (a) {
          seq.push({ correct: !!a.correct, hintCount: a.hintCount || 0, at: a.completedAt || '' });
        });
      });
      const bkt = (SHT.bkt && SHT.bkt.project) ? SHT.bkt.project(seq) : { p: null };
      // 最近一次诊断：诊断记录跟着错题走，规划要读它才知道「他上次错在哪一维」
      const lastCase = g.cases[g.cases.length - 1] || {};

      return {
        key: g.key, label: g.label, ability: g.ability,
        // 下一轮要按这条重新出题，得知道「哪一条错题」和「上一轮那道题长什么样」：
        // kpId 用来回写结果，snapshot 交给模型当「别再写这一版」的反例
        kpId: (g.cases[0] || {}).kpId || '',
        snapshot: (g.cases[0] || {}).questionSnapshot || '',
        status: status, priorityScore: score, errorCount: g.errorCount,
        supportCount: g.supportCount, caseCount: g.cases.length,
        topCause: topCause,
        // 诊断与掌握概率：课程角色排题时读这两个，前者说「错在哪一维」，后者说「还剩多少」
        diag: lastCase.diagnosis || null,
        pKnown: bkt.p,
        lastPicked: lastCase.studentAnswer || '',
        lastAnswer: lastCase.correctAnswer || '',
        lastMs: (lastCase.firstAttemptEvidence || {}).durationMs || 0,
        lastHint: (lastCase.firstAttemptEvidence || {}).hintCount || 0,
        suggestedCell: SHT.suggestCell(topCause, topicDomain)
      };
    }).sort(function (a, b) { return b.priorityScore - a.priorityScore; });

    const queue = items.filter(function (i) { return i.status !== 'mastered'; });
    return {
      items: items,
      queue: queue,
      remainingCount: queue.length,
      masteredCount: items.filter(function (i) { return i.status === 'mastered'; }).length,
      teacherHelpCount: items.filter(function (i) { return i.status === 'teacher-help'; }).length
    };
  };

  /*
   * 追加一次作答并推进状态机。
   * 主仓规则：普通重做答对只置 corrected；已 mastered 不回退。
   * 模板简化：连续答错累加 remediationLoopCount，>= 2 转 teacher-help（与主仓「两轮补救未过」对齐）。
   * 用了提示或重试的「答对」算 support-only，不推进状态 —— 防止靠提示刷过。
   */
  SHT.appendVariantAttempt = function (wrongCase, attempt) {
    const next = Object.assign({}, wrongCase, {
      variantAttempts: (wrongCase.variantAttempts || []).slice()
    });
    const record = {
      attemptId: attempt.attemptId || ('a-' + Date.now()),
      correct: !!attempt.correct,
      hintCount: attempt.hintCount || 0,
      retryCount: attempt.retryCount || 0,
      purpose: attempt.purpose || 'remediation-training',
      completedAt: attempt.completedAt || new Date().toISOString()
    };
    next.variantAttempts.push(record);

    if (next.masteryState === 'mastered') return next;

    const clean = SHT.isQualifiedEvidence(record) && !isSupportOnly(record) && record.correct;
    if (!record.correct) {
      next.masteryState = 'wrong';
      next.consecutiveClean = 0;
      next.remediationLoopCount = (next.remediationLoopCount || 0) + 1;
      if (next.remediationLoopCount >= 2) next.masteryState = 'teacher-help';
    } else if (clean) {
      // 一次答对只能算「已订正」。错过的考点要连对两次才升「已掌握」：
      // 一次可能是蒙对，或只是记住了上一轮那道题。这条规则让「真会」有成本，
      // 也是下一轮还会不会再出这道题的依据（mastered 不再出，corrected 还要再验一次）。
      next.consecutiveClean = (next.consecutiveClean || 0) + 1;
      next.masteryState = next.consecutiveClean >= 2 ? 'mastered' : 'corrected';
    }
    return next;
  };

  // 分层分数线：主仓 completeRemediationCertification.ts:5-7
  SHT.thresholdForLayer = function (layer) {
    return layer === 'A' ? 90 : layer === 'B' ? 80 : 70;
  };

  /*
   * 独立认证：5 题、无提示、无重试、证据合格，达到分层分数线才算 mastered。
   * 主仓原话：「已订正不等于已掌握」。
   */
  SHT.certify = function (wrongCase, attempts, layer) {
    const threshold = SHT.thresholdForLayer(layer || 'B');
    if (!attempts || attempts.length !== 5) {
      return { ok: false, reason: '认证必须恰好 5 题', threshold: threshold };
    }
    const invalid = attempts.filter(function (a) {
      return (a.hintCount || 0) > 0 || (a.retryCount || 0) > 0 || !SHT.isQualifiedEvidence(a);
    });
    if (invalid.length) {
      return { ok: false, reason: '有 ' + invalid.length + ' 题用了提示/重试或证据不合格', threshold: threshold };
    }
    const correct = attempts.filter(function (a) { return a.correct; }).length;
    const score = Math.round((correct / 5) * 100);
    return {
      ok: true, score: score, threshold: threshold,
      passed: score >= threshold,
      reason: score >= threshold ? '达到分层分数线' : '未达分数线，等待下一轮认证'
    };
  };
})(window);
