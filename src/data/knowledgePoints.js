/*
 * U1 候选知识点：给「不知道填什么」的人一个能直接照做的起点。
 *
 * 只从两处真实材料取，不凭空编：
 *   1. src/data/curriculum.js 的 U1 词表 / 句型表 / phonics（原样抄自主仓 public/quiz/data.js）
 *   2. src/data/wrongCases.js 的 3 条示例错题（这个学生的真实错因）
 *
 * 每条都必须满足《单题出题检查表.md》的口径：
 *   - 知识点细到错因，不能只写「词汇」「语法」
 *   - 只出现 U1 学过的词句，情境锁在「学校」
 *   - 带建议格子（变化轴四维）与闭环层 L4（他错了，下一轮出什么）
 *   - 12 条格子互不相同，第 2 轮才有得换，不会一开局就撞车
 *
 * 这是「以后自动生成器的输出规格」，不是答案库：
 * 界面只做静态选择与确定性带出，不接模型、不自动生成题目内容。
 */
(function (root) {
  const SHT = (root.SHT = root.SHT || {});

  SHT.KP_GROUPS = [
    { id: 'missed', name: '他错过的，优先练', note: '来自示例错题案的三条错因' },
    { id: 'angle', name: '同一个点，换个角度考', note: '第 2 轮用，这就是「题不一样」' },
    { id: 'unit', name: '本单元其他易错点', note: '从 U1 词表与句型表推出来的' }
  ];

  SHT.KNOWLEDGE_POINTS = [
    {
      id: 'kp-01',
      group: 'missed',
      label: 'vocab · 校园场所名词 · class / classroom 形近',
      ability: 'vocab',
      cause: '形近混淆',
      why: '两次把 class（课）看成 classroom（教室），词形相近导致音义错配',
      source: 'U1 词表 class / classroom',
      example: '选出 classroom 的中文意思：教室 / 上课 / 图书馆',
      cell: { type: '中英匹配', scene: '学校', level: '辨', distractor: '形近' },
      nextIfWrong: '降到「认」层次，先听音选义确认音义，再回来做形近辨别'
    },
    {
      id: 'kp-02',
      group: 'missed',
      label: 'grammar · There is / are · many desks 复数一致',
      ability: 'grammar',
      cause: '单复数',
      why: '看到 many desks 仍然选 is，错了 3 次，没把复数名词和 are 对上',
      source: 'U1 句型 There are many desks.',
      example: 'There ___ many desks in the classroom.　are / is / am',
      cell: { type: '选词填空', scene: '学校', level: '用', distractor: '语法错形' },
      nextIfWrong: '换成单数句 There is a library.，用句子判断题看是不是真会了'
    },
    {
      id: 'kp-03',
      group: 'missed',
      label: 'phonics · line / lion · 音节数辨听',
      ability: 'phonics',
      cause: '音近混淆',
      why: 'line 与 lion 首音相近，听成一个词，没用音节数区分',
      source: 'U1 phonics 词表 lion / letter / line / light',
      example: '听录音，选出你听到的单词。（line）　line / lion / light',
      cell: { type: '字母组合辨音', scene: '学校', level: '辨', distractor: '音近' },
      nextIfWrong: '降到「认」层次，先看词形再听，别一上来就纯听辨'
    },
    {
      id: 'kp-04',
      group: 'angle',
      label: 'vocab · 校园场所名词 · 听词选义（音义联结）',
      ability: 'listening',
      cause: '未掌握',
      why: '还是这批场所名词，但从「认」层次重来，不靠词形靠耳朵',
      source: 'U1 词表 classroom / playground / library',
      example: '听录音，选出你听到的单词的中文意思。（library）',
      cell: { type: '听音选义', scene: '学校', level: '认', distractor: '同类不同物' },
      nextIfWrong: '留在「认」层次换一批词，先做中英匹配再回听力'
    },
    {
      id: 'kp-05',
      group: 'angle',
      label: 'vocab · class / classroom · 中文释义边界',
      ability: 'vocab',
      cause: '近义混淆',
      why: '同一对易混词，这次不看词形，只考意思分得清不清',
      source: 'U1 词表 class / classroom',
      example: '把 class 和中文意思连起来：一节课 / 教室',
      cell: { type: '中英匹配', scene: '学校', level: '用', distractor: '语义近' },
      nextIfWrong: '回到形近辨别，用拼写补全逼他把词形看完整'
    },
    {
      id: 'kp-06',
      group: 'angle',
      label: 'grammar · There is / are · 单数句迁移',
      ability: 'sentence',
      cause: '单复数',
      why: '复数考过了，换单数、换题型，看他是不是背住了「many desks 用 are」',
      source: 'U1 句型 There is ... / This is our library',
      example: '选出正确的句子：There is a library. / There are a library.',
      cell: { type: '句子判断', scene: '学校', level: '用', distractor: '语法错形' },
      nextIfWrong: '退回选词填空，把 is / are 单独挖空再练一次'
    },
    {
      id: 'kp-07',
      group: 'angle',
      label: 'phonics · line / lion / light · 听音选词',
      ability: 'listening',
      cause: '音近混淆',
      why: '同一个音近错因，从「辨词形」换成「纯听选词」，考查通道变了',
      source: 'U1 phonics 词表 line / lion / light',
      example: '听录音，选出你听到的单词。（light）',
      cell: { type: '听音选义', scene: '学校', level: '辨', distractor: '音近' },
      nextIfWrong: '降到「认」层次，先看三个词的词形，再听'
    },
    {
      id: 'kp-08',
      group: 'angle',
      label: 'vocab · 校园场所名词 · 看图说词（表达）',
      ability: 'speaking',
      cause: '未掌握',
      why: '从选择题走到「表达」层次，检验会不会主动说出来，不只是会选',
      source: 'U1 词表 playground / canteen / music room',
      example: '看图，说出这是学校里的哪个地方（playground）',
      cell: { type: '看图说词', scene: '学校', level: '表达', distractor: '同类不同物' },
      nextIfWrong: '退回「认」层次，先听音选义，再逐级往表达走'
    },
    {
      id: 'kp-09',
      group: 'unit',
      label: 'spelling · library · rar 字母组合',
      ability: 'spelling',
      cause: '形近混淆',
      why: 'library 中间是 rar，小学生最常漏成一个 r，教材里真实的高频错',
      source: 'U1 词表 library',
      example: '选出 library 的正确拼写：library / libary / librery',
      cell: { type: '拼写补全', scene: '学校', level: '辨', distractor: '形近' },
      nextIfWrong: '降到「认」层次，先做中英匹配，再回拼写'
    },
    {
      id: 'kp-10',
      group: 'unit',
      label: 'spelling · music room / art room · 词组分写',
      ability: 'spelling',
      cause: '形近混淆',
      why: '两个词中间要空格，容易写成一个词或加连字符',
      source: 'U1 词表 music room / art room',
      example: '选出「美术教室」的英文：art room / artroom / art-room',
      cell: { type: '中英匹配', scene: '学校', level: '认', distractor: '同类不同物' },
      nextIfWrong: '给两个词组各出一道听音选义，先确认听得出是两个词'
    },
    {
      id: 'kp-11',
      group: 'unit',
      label: 'sentence · Is this the art room? · 简答一致',
      ability: 'sentence',
      cause: '母语负迁移',
      why: '中文习惯答「是的，这是」，容易说成 Yes, this is. 而不是 Yes, it is.',
      source: 'U1 句型 Is this the art room? — Yes, it is.',
      example: '— Is this the art room?　— ___　Yes, it is. / Yes, I am. / Yes, this is.',
      cell: { type: '对话补全', scene: '学校', level: '用', distractor: '母语负迁移' },
      nextIfWrong: '换成 That is ... 的陈述句先练语序，再回简答'
    },
    {
      id: 'kp-12',
      group: 'unit',
      label: 'vocab · lunch / lunchtime · 形近与词义边界',
      ability: 'vocab',
      cause: '形近混淆',
      why: 'lunch（午餐）和 lunchtime（午餐时间）只差后缀，句型里又挨在一起',
      source: 'U1 词表 lunch / lunchtime；句型 It\'s lunchtime. Let\'s go and eat.',
      example: 'It\'s ___. Let\'s go and eat.　lunch / lunchtime',
      cell: { type: '选词填空', scene: '学校', level: '辨', distractor: '语义近' },
      nextIfWrong: '降到「认」层次，先做两个词的中英匹配再回填空'
    }
  ];
})(window);
