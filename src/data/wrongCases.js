/*
 * 示例错题案：数据形状借鉴主仓
 *   D:/vscode/Solingo-main/src/types/index.ts:310-351 (WrongQuestion)
 *   D:/vscode/Solingo-main/src/entities/attempt/types.ts:9-60 (ExerciseAttempt)
 *
 * 保留主仓的三条关键约定：
 *   1. 一条错题案只存一次，id 用业务键 wq:{student}:{unit}:{originalQuestionId}；
 *      后续作答只追加到 variantAttempts，不新建错题案。
 *   2. 首次错误证据冻结在 firstAttemptEvidence（用时 / 提示 / 重试 / 时间）。
 *   3. masteryState 与 status 同步；普通重做答对只到 corrected，不算 mastered。
 *
 * 精简掉：媒体资源、语音证据、AI 讲解、内容版本、replayDescriptor。
 * 补充：category（结构化错因分类）与 errorCause（自由文本错因）。
 *
 * 主仓的错因是 AI 产出的自由文本，没有枚举；这里补一层可选枚举，
 * 目的是让「错因 → 建议格子」可计算，错题能直接变成下一轮配额。
 */
(function (root) {
  const SHT = (root.SHT = root.SHT || {});

  SHT.sampleWrongCases = [
    {
      id: 'wq:S-001:G4-上-U1:q-class-classroom',
      studentId: 'S-001',
      unitId: 'G4-上-U1',
      originalQuestionId: 'q-class-classroom',
      knowledgePoint: 'vocab · 校园场所名词 · class / classroom 形近',
      ability: 'vocab',
      category: '形近混淆',
      errorCause: '把 class（课）看成 classroom（教室），词形相近导致音义错配',
      questionSnapshot: '听录音，选出你听到的单词的中文意思。（classroom）',
      studentAnswer: '上课',
      correctAnswer: '教室',
      firstAttemptEvidence: { durationMs: 12400, hintCount: 0, retryCount: 1, completedAt: '2026-11-06T09:12:00' },
      variantAttempts: [
        { attemptId: 'a-101', correct: false, hintCount: 1, retryCount: 0, purpose: 'remediation-training', completedAt: '2026-11-06T09:20:00' }
      ],
      masteryState: 'wrong',
      remediationLoopCount: 1,
      certificationScore: null,
      createdAt: '2026-11-06T09:12:00'
    },
    {
      id: 'wq:S-001:G4-上-U1:q-there-is-are',
      studentId: 'S-001',
      unitId: 'G4-上-U1',
      originalQuestionId: 'q-there-is-are',
      knowledgePoint: 'grammar · There is / are · 单复数一致',
      ability: 'grammar',
      category: '单复数',
      errorCause: '看到 many desks 仍选 is，没有把复数名词与 are 对应起来',
      questionSnapshot: 'There ___ many desks in the classroom.',
      studentAnswer: 'is',
      correctAnswer: 'are',
      firstAttemptEvidence: { durationMs: 18600, hintCount: 1, retryCount: 0, completedAt: '2026-11-07T10:04:00' },
      variantAttempts: [
        { attemptId: 'a-102', correct: false, hintCount: 0, retryCount: 1, purpose: 'remediation-training', completedAt: '2026-11-07T10:15:00' },
        { attemptId: 'a-103', correct: true, hintCount: 0, retryCount: 0, purpose: 'remediation-training', completedAt: '2026-11-08T10:02:00' }
      ],
      masteryState: 'corrected',
      remediationLoopCount: 1,
      certificationScore: null,
      createdAt: '2026-11-07T10:04:00'
    },
    {
      id: 'wq:S-001:G4-上-U1:q-line-lion',
      studentId: 'S-001',
      unitId: 'G4-上-U1',
      originalQuestionId: 'q-line-lion',
      knowledgePoint: 'phonics · line / lion · 音节数辨听',
      ability: 'listening',
      category: '音近混淆',
      errorCause: 'line 与 lion 首音相近，听成一个词，未用音节数区分',
      questionSnapshot: '听录音，选出你听到的单词。（line）',
      studentAnswer: 'lion',
      correctAnswer: 'line',
      firstAttemptEvidence: { durationMs: 9800, hintCount: 0, retryCount: 0, completedAt: '2026-11-08T11:30:00' },
      variantAttempts: [],
      masteryState: 'wrong',
      remediationLoopCount: 0,
      certificationScore: null,
      createdAt: '2026-11-08T11:30:00'
    }
  ];

  // 学生当前学习层。主仓 completeRemediationCertification.ts 的分层分数线：A 90 / B 80 / C 70
  SHT.sampleLearningLayer = 'B';
})(window);
