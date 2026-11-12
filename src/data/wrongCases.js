/*
 * 示例错题案：数据形状借鉴主仓
 *   D:/vscode/Solingo-main/src/types/index.ts:310-351 (WrongQuestion)
 *   D:/vscode/Solingo-main/src/entities/attempt/types.ts:9-60 (ExerciseAttempt)
 *
 * 保留主仓三条关键约定：
 *   1. 一条错题案只存一次，id 用业务键 wq:{student}:{unit}:{originalQuestionId}；
 *      后续作答只追加到 variantAttempts，不新建错题案。
 *   2. 首次错误证据冻结在 firstAttemptEvidence（用时 / 提示 / 重试 / 时间）。
 *   3. masteryState 与 status 同步；普通重做答对只到 corrected，不算 mastered。
 *
 * 精简掉：媒体资源、语音证据、AI 讲解、内容版本、replayDescriptor。
 * 补充：category（结构化错因分类）与 errorCause（自由文本错因）。
 *
 * 本文件不再手写错题，而是从 knowledgePoints.js 里带 missedCase 的候选确定性生成，
 * 单元一换，错题跟着换，不会出现「词表是 U5、错题还是 U1」的错位。
 *
 * 重要：这里是**示例数据**，不是学生的真实作答记录。
 * 以前 app 启动时直接拿它填 state.wrongCases，结果学生一题没答，03 页就已经有 3 条错题，
 * 卡片上还写着「作答 X / 正确 Y」——那是编出来的，不是他答的。
 * 现在只有显式点「导入示例错题」才会用到这里，且每条都带 demo:true，
 * 既不参与排题（planningWrongCases 会滤掉），卡片上也会标「示例」。
 */
(function (root) {
  const SHT = (root.SHT = root.SHT || {});

  function pad(n) { return n < 10 ? '0' + n : String(n); }

  function buildCase(kp, idx, unit) {
    const m = kp.missedCase;
    const created = '2026-11-0' + (4 + (idx % 3)) + 'T09:' + pad(10 + idx * 7) + ':00';
    const variant = (m.variant || []).map(function (ok, i) {
      return {
        attemptId: 'a-' + unit.id + '-' + (idx + 1) + '-' + (i + 1),
        correct: ok,
        hintCount: ok ? 0 : 1,
        retryCount: 0,
        purpose: 'remediation-training',
        completedAt: '2026-11-0' + (5 + i) + 'T10:' + pad(10 + idx * 5) + ':00'
      };
    });
    const allRight = variant.length > 0 && variant.every(function (v) { return v.correct; });

    return {
      // 示例标记：真实的错题由作答直接写入，没有这个字段
      demo: true,
      id: 'wq:S-001:' + unit.hostUnitId + ':' + kp.id,
      studentId: 'S-001',
      unitId: unit.hostUnitId,
      originalQuestionId: kp.id,
      kpId: kp.id,
      knowledgePoint: kp.label,
      ability: kp.ability,
      category: kp.cause,
      errorCause: kp.why,
      questionSnapshot: m.snapshot,
      studentAnswer: m.studentAnswer,
      correctAnswer: m.correctAnswer,
      firstAttemptEvidence: {
        durationMs: m.durationMs,
        hintCount: m.hintCount,
        retryCount: m.retryCount,
        completedAt: created
      },
      variantAttempts: variant,
      masteryState: allRight ? 'corrected' : 'wrong',
      remediationLoopCount: variant.length,
      certificationScore: null,
      createdAt: created
    };
  }

  SHT.buildWrongCases = function (unitId) {
    const unit = root.SHT_BOOK.getUnit(unitId);
    if (!unit) return [];
    const missed = SHT.kpsOf(unitId).filter(function (k) { return k.missedCase; });
    return missed.map(function (kp, i) { return buildCase(kp, i, unit); });
  };

  // 兼容旧引用：默认 U1
  SHT.sampleWrongCases = SHT.buildWrongCases('U1');
})(window);
