/*
 * 候选知识点：按单元分组的出题起点，替代「自己想知识点」。
 *
 * 只从三处真实材料取，不凭空编：
 *   1. src/data/textbook.js 里该单元的词表 / 句型表 / 语音点（人教版 PEP 四上）
 *   2. 该单元的 Let's spell 与 Let's learn 页
 *   3. 示例学生的错因（missedCase 字段，供 02 错题页展示）
 *
 * 每条满足《单题出题检查表.md》：
 *   - 知识点细到错因，不能只写「词汇」「语法」
 *   - 只出现本单元学过的词句，情境落在该单元的场景域
 *   - 带建议格子（变化轴四维）与闭环层 L4（他错了，下一轮出什么）
 *   - 同一单元内格子互不重复，第 2 轮才换得动
 *
 * 这是「以后自动生成器的输出规格」，不是答案库：
 * 界面只做静态选择与确定性带出，不接模型、不自动生成题目内容。
 */
(function (root) {
  const SHT = (root.SHT = root.SHT || {});

  SHT.KP_GROUPS = [
    { id: 'missed', name: '他错过的，优先练', note: '来自示例错题案，带真实作答' },
    { id: 'angle', name: '同一个点，换个角度考', note: '第 2 轮用，这就是「题不一样」' },
    { id: 'unit', name: '本单元其他易错点', note: '从本单元词表与句型表推出来的' }
  ];

  SHT.KNOWLEDGE_POINTS = [
    /* ================= U1 My classroom ================= */
    {
      id: 'kp-U1-01', unit: 'U1', group: 'missed',
      label: 'spelling · blackboard · oa + ar 双字母组合',
      ability: 'spelling', cause: '形近混淆',
      why: 'black+board 两个组合都容易漏字母，抽词时第一次就写成了 blakboard',
      source: 'U1 词表 blackboard（p.5）',
      example: '选出 blackboard 的正确拼写：blackboard / blackbord / blakboard',
      cell: { type: '拼写补全', scene: '学校', level: '辨', distractor: '形近' },
      nextIfWrong: '先做中英匹配确认词义，再回拼写，别在拼写层死磕',
      missedCase: { studentAnswer: 'blakboard', correctAnswer: 'blackboard', snapshot: '选出 blackboard 的正确拼写。', durationMs: 15200, hintCount: 1, retryCount: 1, variant: [false, true] }
    },
    {
      id: 'kp-U1-02', unit: 'U1', group: 'missed',
      label: 'phonics · a / a-e · cake 与 cat 长短音',
      ability: 'phonics', cause: '音近混淆',
      why: 'a-e 读字母音 /eɪ/，闭音节 a 读 /æ/，两个都听成了短音',
      source: 'U1 Let\'s spell（p.6）：cat/cake、dad/date、hat/hate',
      example: '听录音，选出你听到的单词。（cake）　cake / cat / hat',
      cell: { type: '字母组合辨音', scene: '学校', level: '辨', distractor: '音近' },
      nextIfWrong: '降到「认」层次，先看 cat 与 cake 的词形差别，再听',
      missedCase: { studentAnswer: 'cat', correctAnswer: 'cake', snapshot: '听录音，选出你听到的单词。（cake）', durationMs: 9800, hintCount: 0, retryCount: 1, variant: [false] }
    },
    {
      id: 'kp-U1-03', unit: 'U1', group: 'missed',
      label: 'sentence · Where is it? · on / in 介词',
      ability: 'sentence', cause: '母语负迁移',
      why: '中文说「在墙上」和「在桌子里」都用「在」，选介词时靠猜',
      source: 'U1 句型 It\'s near the window.（p.4）+ Story time It\'s on the wall.',
      example: '— Where is the picture?　— It\'s ___ the wall.　on / in / under',
      cell: { type: '选词填空', scene: '学校', level: '用', distractor: '语义近' },
      nextIfWrong: '换 near the window 再考一次，看是不是只会这一个搭配',
      missedCase: { studentAnswer: 'in', correctAnswer: 'on', snapshot: '— Where is the picture? — It\'s ___ the wall.', durationMs: 13100, hintCount: 0, retryCount: 0, variant: [false, false] }
    },
    {
      id: 'kp-U1-04', unit: 'U1', group: 'angle',
      label: 'vocab · 教室物品名词 · 听音选义（音义联结）',
      ability: 'listening', cause: '未掌握',
      why: '同一批物品词，但从「认」层次重来，不靠词形靠耳朵',
      source: 'U1 词表 classroom / window / blackboard（p.5）',
      example: '听录音，选出你听到的单词的中文意思。（window）',
      cell: { type: '听音选义', scene: '学校', level: '认', distractor: '同类不同物' },
      nextIfWrong: '留在「认」层次换一批词，先做中英匹配再回听力'
    },
    {
      id: 'kp-U1-05', unit: 'U1', group: 'angle',
      label: "spelling · teacher's desk · 所有格 's",
      ability: 'spelling', cause: '形近混淆',
      why: "讲台是 teacher's desk，不是 teachers desk，撇号常被吃掉",
      source: "U1 词表 teacher's desk（p.8）",
      example: "选出「讲台」的英文：teacher's desk / teachers desk / teacher desk",
      cell: { type: '中英匹配', scene: '学校', level: '辨', distractor: '形近' },
      nextIfWrong: "换 Let me clean the teacher's desk. 做句子判断"
    },
    {
      id: 'kp-U1-06', unit: 'U1', group: 'angle',
      label: 'sentence · Let me / Let\'s · 主语省略',
      ability: 'sentence', cause: '未掌握',
      why: 'Let me 是「我来」，Let\'s 是「我们一起」，主语不同，答语也不同',
      source: 'U1 句型 Let\'s clean the classroom! / Let me clean the teacher\'s desk.（p.7）',
      example: '选正确的句子：Let me clean the blackboard. / Let me cleans the blackboard.',
      cell: { type: '句子判断', scene: '学校', level: '用', distractor: '语法错形' },
      nextIfWrong: '退回选词填空，把 me / us 单独挖空再练一次'
    },
    {
      id: 'kp-U1-07', unit: 'U1', group: 'unit',
      label: 'vocab · light / fan · 词义边界',
      ability: 'vocab', cause: '近义混淆',
      why: '两个都是教室里的电器，中文都叫「灯」「扇」，容易张冠李戴',
      source: 'U1 词表 light / fan（p.5、p.8）',
      example: 'Turn on the ___.（灯）　light / fan / wall',
      cell: { type: '中英匹配', scene: '学校', level: '认', distractor: '语义近' },
      nextIfWrong: '用 Turn on the light. 做听音选义，先确认听得出'
    },
    {
      id: 'kp-U1-08', unit: 'U1', group: 'unit',
      label: 'sentence · Let me help you. · 应答语',
      ability: 'sentence', cause: '母语负迁移',
      why: '中文习惯答「不客气」，实际这里要答 Thank you.',
      source: 'U1 句型 Let me help you. — Thank you.（p.7）',
      example: '— Let me help you.　— ___　Thank you. / You\'re welcome. / Yes, I do.',
      cell: { type: '对话补全', scene: '学校', level: '用', distractor: '母语负迁移' },
      nextIfWrong: "换成 Let's clean the classroom! 考 OK. 的应答"
    },

    /* ================= U2 My schoolbag ================= */
    {
      id: 'kp-U2-01', unit: 'U2', group: 'missed',
      label: 'vocab · 学科书名称 · Chinese book 词序',
      ability: 'vocab', cause: '母语负迁移',
      why: '中文是「语文书」，直译成 book Chinese，英语要学科在前',
      source: 'U2 词表 maths book / English book / Chinese book（p.15）',
      example: '选出「语文书」的英文：Chinese book / book Chinese / Chinese-book',
      cell: { type: '中英匹配', scene: '学校', level: '辨', distractor: '形近' },
      nextIfWrong: '用三本书做听音选义，先确认听得清再加词序',
      missedCase: { studentAnswer: 'book Chinese', correctAnswer: 'Chinese book', snapshot: '选出「语文书」的英文。', durationMs: 11200, hintCount: 0, retryCount: 1, variant: [false] },
    },
    {
      id: 'kp-U2-02', unit: 'U2', group: 'missed',
      label: 'spelling · schoolbag · oo 与 sh',
      ability: 'spelling', cause: '形近混淆',
      why: 'school 里的 oo 和 ch 都容易漏，sch + oo + l 三段常缺一段',
      source: 'U2 词表 schoolbag（p.13）',
      example: '选出 schoolbag 的正确拼写：schoolbag / scolbag / shoolbag',
      cell: { type: '拼写补全', scene: '学校', level: '辨', distractor: '形近' },
      nextIfWrong: '降到中英匹配，先认住词形再看拼写',
      missedCase: { studentAnswer: 'scolbag', correctAnswer: 'schoolbag', snapshot: '选出 schoolbag 的正确拼写。', durationMs: 16800, hintCount: 1, retryCount: 0, variant: [false, true] },
    },
    {
      id: 'kp-U2-03', unit: 'U2', group: 'missed',
      label: 'phonics · i / i-e · six 与 nice',
      ability: 'phonics', cause: '音近混淆',
      why: 'i-e 读字母音 /aɪ/，闭音节 i 读 /ɪ/，听成了同一个',
      source: 'U2 Let\'s spell（p.16）：big/fine、six/nice、pig/ice',
      example: '听录音，选出你听到的单词。（nice）　nice / six / pig',
      cell: { type: '字母组合辨音', scene: '学校', level: '辨', distractor: '音近' },
      nextIfWrong: '降到「认」层次，先看词尾 e 的有无，再听',
      missedCase: { studentAnswer: 'six', correctAnswer: 'nice', snapshot: '听录音，选出你听到的单词。（nice）', durationMs: 9400, hintCount: 0, retryCount: 1, variant: [false] },
    },
    {
      id: 'kp-U2-04', unit: 'U2', group: 'angle',
      label: 'sentence · What colour is it? · 颜色问答',
      ability: 'sentence', cause: '未掌握',
      why: '问颜色用 What colour，回答要带颜色词，中文问法里没有这个结构',
      source: 'U2 句型 What colour is it? — It\'s blue and white.（p.17）',
      example: '— What colour is your schoolbag?　— ___　It\'s black. / It\'s a panda. / Yes, it is.',
      cell: { type: '对话补全', scene: '学校', level: '用', distractor: '母语负迁移' },
      nextIfWrong: '换成 What\'s in your schoolbag? 对比两种问法'
    },
    {
      id: 'kp-U2-05', unit: 'U2', group: 'unit',
      label: 'grammar · 名词复数 · storybook → storybooks',
      ability: 'grammar', cause: '单复数',
      why: 'three storybooks 要加 s，an English book 不加，两个同时出现最容易错',
      source: 'U2 句型 An English book, a maths book and three storybooks.（p.15）',
      example: 'I have three ___.　storybook / storybooks / a storybook',
      cell: { type: '选词填空', scene: '学校', level: '用', distractor: '语法错形' },
      nextIfWrong: '换成单数 an English book 做句子判断'
    },

    /* ================= U3 My friends ================= */
    {
      id: 'kp-U3-01', unit: 'U3', group: 'missed',
      label: 'grammar · has / is · He has glasses 与 He is tall',
      ability: 'grammar', cause: '语法错形',
      why: '「有」用 has，「是」用 is，描述朋友时两个句型连着出现，混着用',
      source: 'U3 句型 He has glasses and his shoes are blue.（p.27）',
      example: 'He ___ glasses.　has / is / have',
      cell: { type: '选词填空', scene: '学校', level: '用', distractor: '语法错形' },
      nextIfWrong: '用 He is tall. 做句子判断，先分清「是」和「有」',
      missedCase: { studentAnswer: 'is', correctAnswer: 'has', snapshot: 'He ___ glasses.', durationMs: 14100, hintCount: 0, retryCount: 0, variant: [false, false] },
    },
    {
      id: 'kp-U3-02', unit: 'U3', group: 'missed',
      label: 'vocab · his / her · 性别指代',
      ability: 'vocab', cause: '近义混淆',
      why: 'his 指男生、her 指女生，猜人时线索一换就错',
      source: 'U3 词表 his（p.24）/ her（p.29）',
      example: 'She has long hair. ___ shoes are orange.　Her / His / She',
      cell: { type: '中英匹配', scene: '学校', level: '用', distractor: '语义近' },
      nextIfWrong: '换成 Who is he? / Who is she? 做对话补全',
      missedCase: { studentAnswer: 'His', correctAnswer: 'Her', snapshot: 'She has long hair. ___ shoes are orange.', durationMs: 12700, hintCount: 1, retryCount: 0, variant: [false, true] },
    },
    {
      id: 'kp-U3-03', unit: 'U3', group: 'missed',
      label: 'phonics · o / o-e · not 与 note',
      ability: 'phonics', cause: '音近混淆',
      why: 'o-e 读字母音 /əʊ/，闭音节 o 读 /ɒ/，两个混成一个',
      source: 'U3 Let\'s spell（p.26）：not/note、hot/hope、rose/lost',
      example: '听录音，选出你听到的单词。（note）　note / not / box',
      cell: { type: '字母组合辨音', scene: '学校', level: '辨', distractor: '音近' },
      nextIfWrong: '降到「认」层次，先看词尾 e 的有无，再听',
      missedCase: { studentAnswer: 'not', correctAnswer: 'note', snapshot: '听录音，选出你听到的单词。（note）', durationMs: 10100, hintCount: 0, retryCount: 0, variant: [false] },
    },
    {
      id: 'kp-U3-04', unit: 'U3', group: 'angle',
      label: 'sentence · Who is he? · 猜人问答',
      ability: 'sentence', cause: '未掌握',
      why: '问是谁用 Who is，回答用 His name is，中文习惯直接说名字',
      source: 'U3 句型 Who is he? — His name is ...（p.23）',
      example: '— Who is he?　— ___　His name is Mike. / He is Mike name. / Yes, he is.',
      cell: { type: '对话补全', scene: '学校', level: '用', distractor: '母语负迁移' },
      nextIfWrong: '换成 Is he Wu Binbin? 考 Yes. You\'re right.'
    },
    {
      id: 'kp-U3-05', unit: 'U3', group: 'unit',
      label: 'vocab · long hair / short hair · 反义与不可数',
      ability: 'vocab', cause: '单复数',
      why: 'hair 不加 s，且 long / short 修饰时要成对记，容易说成 long hairs',
      source: 'U3 词表 long hair / short hair（p.28）',
      example: 'She has long ___.　hair / hairs / a hair',
      cell: { type: '中英匹配', scene: '学校', level: '辨', distractor: '形近' },
      nextIfWrong: '用 He has short hair. 做句子判断'
    },

    /* ================= U4 My home ================= */
    {
      id: 'kp-U4-01', unit: 'U4', group: 'missed',
      label: 'grammar · Where are the keys? · 复数提问与简答',
      ability: 'grammar', cause: '单复数',
      why: 'keys 是复数，问句要用 are、答语要用 they are，仍按单数处理',
      source: 'U4 句型 Where are the keys? — Are they on the table?（p.41）',
      example: '— Where ___ the keys?　— They\'re on the table.　is / are / am',
      cell: { type: '选词填空', scene: '家庭', level: '用', distractor: '语法错形' },
      nextIfWrong: '换成 Where is the cat? 对比单复数',
      missedCase: { studentAnswer: 'is', correctAnswer: 'are', snapshot: '— Where ___ the keys? — They are on the table.', durationMs: 15600, hintCount: 0, retryCount: 1, variant: [false, false] },
    },
    {
      id: 'kp-U4-02', unit: 'U4', group: 'missed',
      label: 'vocab · study / living room · 房间名混',
      ability: 'vocab', cause: '近义混淆',
      why: 'study 既是「学习」也是「书房」，和 living room 一并记混',
      source: 'U4 词表 study / living room（p.39）',
      example: 'Read a book in the ___.（书房）　study / living room / bathroom',
      cell: { type: '中英匹配', scene: '家庭', level: '辨', distractor: '语义近' },
      nextIfWrong: '用 Go to the study. 做听音选义，先确认听得出',
      missedCase: { studentAnswer: 'living room', correctAnswer: 'study', snapshot: 'Read a book in the ___.（书房）', durationMs: 11800, hintCount: 0, retryCount: 0, variant: [false] },
    },
    {
      id: 'kp-U4-03', unit: 'U4', group: 'missed',
      label: 'phonics · u / u-e · us 与 use',
      ability: 'phonics', cause: '音近混淆',
      why: 'u-e 读字母音 /juː/，闭音节 u 读 /ʌ/，两个混成一个',
      source: 'U4 Let\'s spell（p.40）：use、cute、excuse',
      example: '听录音，选出你听到的单词。（use）　use / us / cute',
      cell: { type: '字母组合辨音', scene: '家庭', level: '辨', distractor: '音近' },
      nextIfWrong: '降到「认」层次，先看词尾 e 的有无，再听',
      missedCase: { studentAnswer: 'us', correctAnswer: 'use', snapshot: '听录音，选出你听到的单词。（use）', durationMs: 8900, hintCount: 1, retryCount: 0, variant: [false, true] },
    },
    {
      id: 'kp-U4-04', unit: 'U4', group: 'angle',
      label: 'sentence · Is she in the study? · 否定简答',
      ability: 'sentence', cause: '母语负迁移',
      why: '否定答语要用 No, she isn\'t.，中文习惯答「不在」或 No.',
      source: 'U4 句型 Is she in the study? — No, she isn\'t.（p.38）',
      example: '— Is she in the kitchen?　— ___　No, she isn\'t. / No, she is. / No, it isn\'t.',
      cell: { type: '对话补全', scene: '家庭', level: '用', distractor: '母语负迁移' },
      nextIfWrong: '换成 Are they on the desk? 考复数否定答语'
    },
    {
      id: 'kp-U4-05', unit: 'U4', group: 'unit',
      label: 'spelling · bathroom · th 与 room 拼接',
      ability: 'spelling', cause: '形近混淆',
      why: 'bath + room 拼起来，th 容易写成 t，两个词根常漏一个',
      source: 'U4 词表 bathroom（p.39）',
      example: '选出 bathroom 的正确拼写：bathroom / batroom / bathrom',
      cell: { type: '拼写补全', scene: '家庭', level: '辨', distractor: '形近' },
      nextIfWrong: '降回中英匹配，先认出「浴室」再拼'
    },

    /* ================= U5 Dinner's ready ================= */
    {
      id: 'kp-U5-01', unit: 'U5', group: 'missed',
      label: 'sentence · I\'d like some ... · some 后接不可数',
      ability: 'sentence', cause: '语法错形',
      why: 'beef / soup 不可数，不能加 a，也不能加 s，套用可数名词规则就错',
      source: 'U5 句型 What would you like? — I\'d like some beef.（p.48）',
      example: 'I\'d like some ___.　beef / a beef / beefs',
      cell: { type: '选词填空', scene: '食物饮料', level: '用', distractor: '语法错形' },
      nextIfWrong: '换成可数 some vegetables 做句子判断，对比两种',
      missedCase: { studentAnswer: 'a beef', correctAnswer: 'beef', snapshot: 'I would like some ___.', durationMs: 13300, hintCount: 0, retryCount: 1, variant: [false] },
    },
    {
      id: 'kp-U5-02', unit: 'U5', group: 'missed',
      label: 'vocab · chopsticks / fork / knife · 餐具名',
      ability: 'vocab', cause: '近义混淆',
      why: '三个餐具词同属一类，chopsticks 还是复数，容易整体混',
      source: 'U5 词表 chopsticks / fork / knife（p.52）',
      example: 'I can use ___.（筷子）　chopsticks / fork / knife',
      cell: { type: '中英匹配', scene: '食物饮料', level: '辨', distractor: '语义近' },
      nextIfWrong: '用 Pass me the fork. 做听音选义',
      missedCase: { studentAnswer: 'fork', correctAnswer: 'chopsticks', snapshot: 'I can use ___.（筷子）', durationMs: 10500, hintCount: 0, retryCount: 0, variant: [false, false] },
    },
    {
      id: 'kp-U5-03', unit: 'U5', group: 'missed',
      label: 'phonics · e / -e- · bed 与 be',
      ability: 'phonics', cause: '音近混淆',
      why: '词尾不发音的 e 让前面的元音变字母音，bed 与 be 差一个 e 读音全变',
      source: 'U5 Let\'s spell（p.50）：me、he、she、we；bed/be、red/we',
      example: '听录音，选出你听到的单词。（be）　be / bed / red',
      cell: { type: '字母组合辨音', scene: '食物饮料', level: '辨', distractor: '音近' },
      nextIfWrong: '降到「认」层次，先看词尾 e 的位置，再听',
      missedCase: { studentAnswer: 'bed', correctAnswer: 'be', snapshot: '听录音，选出你听到的单词。（be）', durationMs: 9700, hintCount: 1, retryCount: 0, variant: [false, true] },
    },
    {
      id: 'kp-U5-04', unit: 'U5', group: 'angle',
      label: 'sentence · Would you like ...? · Yes, please / No, thanks',
      ability: 'sentence', cause: '母语负迁移',
      why: '中文答「好」「不用」，英语要分 Yes, please. 和 No, thanks.',
      source: 'U5 句型 Would you like a knife and fork? — No, thanks.（p.51）',
      example: '— Would you like some soup?　— ___　Yes, please. / Yes, I like. / No, I don\'t.',
      cell: { type: '对话补全', scene: '食物饮料', level: '用', distractor: '母语负迁移' },
      nextIfWrong: '换成 What would you like? 考 I\'d like ... 的回答'
    },
    {
      id: 'kp-U5-05', unit: 'U5', group: 'unit',
      label: 'spelling · vegetable · 多音节拼写',
      ability: 'spelling', cause: '形近混淆',
      why: '四个音节，中间 ge 与 ta 易漏，是本单元最长的词',
      source: 'U5 词表 vegetable（p.49）',
      example: '选出 vegetable 的正确拼写：vegetable / vegtable / vegatable',
      cell: { type: '拼写补全', scene: '食物饮料', level: '辨', distractor: '形近' },
      nextIfWrong: '降回中英匹配，先认出「蔬菜」再拼'
    },

    /* ================= U6 Meet my family! ================= */
    {
      id: 'kp-U6-01', unit: 'U6', group: 'missed',
      label: 'sentence · What\'s your father\'s job? · 所有格 + 职业',
      ability: 'sentence', cause: '语法错形',
      why: 'father\'s 的撇号常被省掉，且答语要用 He\'s a doctor 的冠词',
      source: 'U6 句型 What\'s your father\'s job? — He\'s a doctor.（p.62）',
      example: '— What\'s your father\'s job?　— ___　He\'s a doctor. / He\'s doctor. / He doctor.',
      cell: { type: '句子判断', scene: '家庭', level: '用', distractor: '语法错形' },
      nextIfWrong: '退回选词填空，把 a 单独挖空再练',
      missedCase: { studentAnswer: 'He is doctor.', correctAnswer: 'He is a doctor.', snapshot: '— What is your father job? — ___', durationMs: 14900, hintCount: 0, retryCount: 1, variant: [false] },
    },
    {
      id: 'kp-U6-02', unit: 'U6', group: 'missed',
      label: 'grammar · How many people · people 本身是复数',
      ability: 'grammar', cause: '单复数',
      why: 'people 已经是复数，不能再加 s，谓语要用 are',
      source: 'U6 句型 How many people are there in your family?（p.58）',
      example: 'How many people ___ there in your family?　are / is / am',
      cell: { type: '选词填空', scene: '家庭', level: '用', distractor: '语法错形' },
      nextIfWrong: '换成 My family has six people. 做句子判断',
      missedCase: { studentAnswer: 'is', correctAnswer: 'are', snapshot: 'How many people ___ there in your family?', durationMs: 12200, hintCount: 0, retryCount: 0, variant: [false, false] },
    },
    {
      id: 'kp-U6-03', unit: 'U6', group: 'missed',
      label: 'vocab · uncle / aunt / cousin · 亲属称谓',
      ability: 'vocab', cause: '近义混淆',
      why: '中文的舅舅叔叔伯伯姑父在英语里都是 uncle，边界完全不同',
      source: 'U6 词表 uncle / aunt / cousin（p.59）',
      example: 'My father\'s brother is my ___.　uncle / aunt / cousin',
      cell: { type: '中英匹配', scene: '家庭', level: '辨', distractor: '语义近' },
      nextIfWrong: '用 This is my aunt. 做听音选义',
      missedCase: { studentAnswer: 'aunt', correctAnswer: 'uncle', snapshot: 'My father brother is my ___.', durationMs: 11600, hintCount: 0, retryCount: 1, variant: [false, true] },
    },
    {
      id: 'kp-U6-04', unit: 'U6', group: 'angle',
      label: 'sentence · Is this your mother? · Yes, it is',
      ability: 'sentence', cause: '母语负迁移',
      why: '指照片里的人，英语用 it 指代，不用 he / she',
      source: 'U6 句型 Is this your mother? — Yes, it is.（p.61）',
      example: '— Is this your mother?　— ___　Yes, it is. / Yes, she is. / Yes, this is.',
      cell: { type: '对话补全', scene: '家庭', level: '用', distractor: '母语负迁移' },
      nextIfWrong: '换成 Is this your baby brother? 再考同一应答'
    },
    {
      id: 'kp-U6-05', unit: 'U6', group: 'unit',
      label: 'phonics · 五元音长短音复习 · face / rice',
      ability: 'phonics', cause: '音近混淆',
      why: '本册最后一次 Let\'s spell 把 a/e/i/o/u 的长短音放在一起比，最容易塌',
      source: 'U6 Let\'s spell（p.60）：face/rice、me/he、six/leg、use/us',
      example: '听录音，选出你听到的单词。（rice）　rice / face / six',
      cell: { type: '字母组合辨音', scene: '家庭', level: '辨', distractor: '音近' },
      nextIfWrong: '降到「认」层次，先按元音字母分组看词形'
    }
  ];

  SHT.kpsOf = function (unitId) {
    return SHT.KNOWLEDGE_POINTS.filter(function (k) { return k.unit === unitId; });
  };

  SHT.kpById = function (id) {
    return SHT.KNOWLEDGE_POINTS.filter(function (k) { return k.id === id; })[0] || null;
  };

  // 作答侧只拿得到题上写的知识点中文，靠它倒查回候选条目（错因 / 教材依据 / 建议角度）
  SHT.kpByLabel = function (label) {
    const key = String(label == null ? '' : label).trim();
    if (!key) return null;
    return SHT.KNOWLEDGE_POINTS.filter(function (k) { return k.label === key; })[0] || null;
  };
})(window);
