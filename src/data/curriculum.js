/*
 * 教材切片：湘少版四年级上册 U1 "Our School"
 * 来源：D:/vscode/Solingo-main/public/quiz/data.js (U1 节点，原样抄录)
 * 说明：只取 U1，用于最小测试「1 个学生 / 1 个单元 / 5 道题 / 2 轮」。
 * 不要手改本文件；教材变更请回主仓改 data.js 后重新抽取。
 */
(function (root) {
  const SHT = (root.SHT = root.SHT || {});

  SHT.curriculum = {
    hostUnitId: 'G4-上-U1',
    quizUnitId: 'U1',
    title: 'Our School',
    topicDomain: '学校',
    // 主仓 quizAssessment.ts 要求单元词表 >= 8 词才能凑够 4 个选项
    words: [
      { en: 'classroom', zh: '教室' },
      { en: 'playground', zh: '操场' },
      { en: 'library', zh: '图书馆' },
      { en: 'music room', zh: '音乐教室' },
      { en: 'art room', zh: '美术教室' },
      { en: 'computer', zh: '电脑；计算机' },
      { en: 'office', zh: '办公室' },
      { en: 'story', zh: '故事' },
      { en: 'a lot of', zh: '许多' },
      { en: 'and', zh: '和；又；与' },
      { en: 'canteen', zh: '餐厅；食堂' },
      { en: 'class', zh: '（一节）课；上课时间' },
      { en: 'colour', zh: '给……上色' },
      { en: 'desk', zh: '书桌；办公桌' },
      { en: 'eat', zh: '吃' },
      { en: 'fun', zh: '乐趣' },
      { en: 'garden', zh: '花园' },
      { en: 'grade', zh: '年级' },
      { en: 'lion', zh: '狮子' },
      { en: 'lunch', zh: '午餐' },
      { en: 'lunchtime', zh: '午餐时间' },
      { en: 'of', zh: '……的' },
      { en: 'on', zh: '在……上面' },
      { en: 'read', zh: '阅读；读' },
      { en: 'together', zh: '一起' }
    ],
    // U1 两个 lesson 的句型表；出题时句型不得越出此表
    sentencePatterns: [
      'This is our school / classroom / library / playground',
      'This is (the) ...',
      'That is (the) ...',
      'There is ...',
      'There are ...',
      'There are many desks.',
      'Is this the art room? — Yes, it is.',
      "It's lunchtime. Let's go and eat."
    ],
    // U1 phonics 词表，是音近干扰项的真实素材
    phonics: ['lion', 'letter', 'line', 'light'],
    // 全册通用允许词表：这些功能词字面上不在 U1 词表，但不应判超纲
    // 依据：出题手册第 6 节第 7 条
    allowedFunctionWords: [
      'a', 'an', 'the', 'is', 'are', 'am', 'be', 'this', 'that', 'these', 'those',
      'it', 'its', 'our', 'we', 'i', 'you', 'my', 'your', 'in', 'on', 'at', 'to',
      'of', 'and', 'many', 'some', 'do', 'does', 'don\'t', 'yes', 'no', 'please',
      'now', 'look', 'let\'s', 'where', 'what', 'here', 'there', 'big', 'clean'
    ]
  };

  /*
   * 5 道示例题：全部用 U1 真实词句，且刻意落在 5 个不同格子。
   * 这是「模板」，不是成品答案；正式测试时可整组清空自己出题。
   * 字段与出题手册 3.1 的九个字段一一对应（no=位置，ability 并入知识点，cell=格子标记，nextIfWrong=闭环层 L4）。
   */
  SHT.sampleQuestions = [
    {
      no: 1,
      knowledgePoint: 'vocab · 校园场所名词 · 音义联结',
      ability: 'listening / vocab',
      cell: { type: '听音选义', scene: '学校', level: '认', distractor: '同类不同物' },
      prompt: '听录音，选出你听到的单词的中文意思。',
      audioText: 'classroom',
      options: ['教室', '操场', '图书馆'],
      answer: '教室',
      analysis: 'classroom 是教室，playground 是操场。',
      nextIfWrong: '换到「辨」层次，用 class / classroom 做形近辨别'
    },
    {
      no: 2,
      knowledgePoint: 'spelling · library · rar 字母组合',
      ability: 'spelling',
      cell: { type: '拼写补全', scene: '学校', level: '辨', distractor: '形近' },
      prompt: '选出 library 的正确拼写。',
      audioText: '',
      options: ['library', 'libary', 'librery'],
      answer: 'library',
      analysis: 'library 中间是 rar，不是 ra。',
      nextIfWrong: '降到「认」层次，先做中英匹配再回拼写'
    },
    {
      no: 3,
      knowledgePoint: 'grammar · There is / are · 单复数一致',
      ability: 'grammar / sentence',
      cell: { type: '选词填空', scene: '学校', level: '用', distractor: '语法错形' },
      prompt: 'There ___ many desks in the classroom.',
      audioText: '',
      options: ['are', 'is', 'am'],
      answer: 'are',
      analysis: 'many desks 是复数，要用 are。',
      nextIfWrong: '同格换情境，出 There is a library.'
    },
    {
      no: 4,
      knowledgePoint: 'sentence · Is this ...? · 简答一致',
      ability: 'sentence',
      cell: { type: '对话补全', scene: '学校', level: '用', distractor: '母语负迁移' },
      prompt: '— Is this the art room?\n— ___',
      audioText: '',
      options: ['Yes, it is.', 'Yes, I am.', 'Yes, this is.'],
      answer: 'Yes, it is.',
      analysis: 'Is this ...? 要用 Yes, it is. 回答。',
      nextIfWrong: '换成 That is ... 的一般疑问句，练同句型迁移'
    },
    {
      no: 5,
      knowledgePoint: 'phonics · line / lion · 音节数辨听',
      ability: 'listening / phonics',
      cell: { type: '字母组合辨音', scene: '学校', level: '辨', distractor: '音近' },
      prompt: '听录音，选出你听到的单词。',
      audioText: 'line',
      options: ['line', 'lion', 'light'],
      answer: 'line',
      analysis: 'line 是一个音节，lion 是两个。',
      nextIfWrong: '降到「认」层次，先看词形再听'
    }
  ];

  // 最小测试用的学生画像（mock，来自「最小测试记录表」第 0 节字段）
  SHT.sampleStudent = {
    id: 'S-001',
    label: '示例学生（可改）',
    stage: '正在操练',
    recentErrors: [
      'class / classroom 形近混淆（2 次）',
      'There is / are 单复数不一致（3 次）',
      'line / lion 听辨混淆（2 次）'
    ],
    interestCarriers: ['classroom', 'library', 'playground', 'art room']
  };
})(window);
