/*
 * 候选知识点：湖南少年儿童出版社《英语》四年级上册（三年级起点）
 *
 * 12 个单元，比另两本细（形状、方向、归属各占一个单元），所以每单元只排 3 条：
 * 清单的作用是「换考点」和「自动配额」，不是把每单元的每个点都穷举一遍。
 * 排满 12×3 已经能让换考点有替代项，再多会让配额配比失真（详见 docs/SOURCE-MAP.md 十二节）。
 *
 * 来源只取 src/data/books/xiangshao-g4a.js 的词表与 Structures 句型，
 * 不写假页码：该书 Word List 是图片、无文本层，词表由 Let's Learn 正文拼出，
 * 这个限制写在书本身的 meta.notes 里，这里不掩盖。
 *
 * 本册没有语音板块 → 一条 phonics 都不排。
 */
(function (root) {
  const SHT = (root.SHT = root.SHT || {});

  SHT.KPS_BY_BOOK = SHT.KPS_BY_BOOK || {};
  SHT.KPS_BY_BOOK['XS-G4A'] = [

    /* ================= U1 很高兴见到你 ================= */
    {
      id: 'xs-U1-01', unit: 'U1', group: 'unit',
      label: 'sentence · Nice to meet you! · 固定应答',
      ability: 'sentence', cause: '近义混淆',
      why: '见面的三句寒暄长得很像，他分不清哪句该答哪句',
      source: 'U1 Structures：Nice to meet you! — Nice to meet you, too! / Glad to see you!',
      example: '— Nice to meet you!　— ___　Nice to meet you, too! / I am fine. / Thank you.',
      cell: { type: '对话补全', scene: '学校', level: '认', distractor: '语义近' },
      nextIfWrong: '先只练这一组问答，别把 How are you 混进来'
    },
    {
      id: 'xs-U1-02', unit: 'U1', group: 'unit',
      label: 'grammar · This is Chen Dong. · 介绍别人用 This is',
      ability: 'grammar', cause: '母语负迁移',
      why: '中文「这是陈东」直译成 He is Chen Dong，介绍场景该用 This is',
      source: 'U1 Structures：This is Chen Dong. He is my brother.',
      example: '___ is Chen Dong. He is my brother.　This / He / It',
      cell: { type: '选词填空', scene: '学校', level: '用', distractor: '母语负迁移' },
      nextIfWrong: '先认 This is 的「介绍」用法，再区分 He is 是用来补充说明的'
    },
    {
      id: 'xs-U1-03', unit: 'U1', group: 'angle',
      label: 'vocab · class / grade · 班级与年级的顺序',
      ability: 'vocab', cause: '母语负迁移',
      why: '中文说「四年级一班」，英语顺序是 Class 1, Grade 4，他把两个词整个搞反',
      source: 'U1 词表 class / grade / number',
      example: '「四年级一班」是：Class 1, Grade 4 / Grade 1, Class 4',
      cell: { type: '中英匹配', scene: '学校', level: '辨', distractor: '母语负迁移' },
      nextIfWrong: '先只问「几班」，不问年级，两个别一起上'
    },

    /* ================= U2 它是一个圆 ================= */
    {
      id: 'xs-U2-01', unit: 'U2', group: 'unit',
      label: 'vocab · circle / square / triangle / rectangle · 形状词形混淆',
      ability: 'vocab', cause: '形近混淆',
      why: '四个形状词都是长词，开头几个字母不同，他看首字母就猜',
      source: 'U2 词表 circle / square / line / dot / triangle / rectangle',
      example: '「三角形」是：triangle / rectangle / circle',
      cell: { type: '中英匹配', scene: '颜色形状', level: '辨', distractor: '形近' },
      nextIfWrong: '把四个形状画出来挂上词，一次只认两个'
    },
    {
      id: 'xs-U2-02', unit: 'U2', group: 'unit',
      label: 'sentence · What\'s this? / What\'s that? · 远近的区别',
      ability: 'sentence', cause: '近义混淆',
      why: 'this 指近的、that 指远的，中文「这是什么」两种情况都能说',
      source: 'U2 Structures：What\'s this? — It\'s a circle. / What\'s that? — It\'s a square.',
      example: '（指着远处）___ is that?　What / Where / How',
      cell: { type: '对话补全', scene: '颜色形状', level: '认', distractor: '语义近' },
      nextIfWrong: '用两张图（近/远）对照着问'
    },
    {
      id: 'xs-U2-03', unit: 'U2', group: 'angle',
      label: 'grammar · How many circles are there? · 复数与 there be',
      ability: 'grammar', cause: '语法错形',
      why: '问「有几个」名词要复数、动词用 are，他只改一处',
      source: 'U2 Structures：How many circles are there?',
      example: 'How many ___ are there?　circles / circle / a circle',
      cell: { type: '选词填空', scene: '颜色形状', level: '用', distractor: '语法错形' },
      nextIfWrong: '先只改名词复数，动词下一轮再说'
    },

    /* ================= U3 看这头大象 ================= */
    {
      id: 'xs-U3-01', unit: 'U3', group: 'unit',
      label: 'sentence · It is big. · 形容词直接作表语',
      ability: 'sentence', cause: '母语负迁移',
      why: '中文「它是大的」带「的」，他写 It is a big 或 It is big animal',
      source: 'U3 Structures：Look at this elephant. — It is big.',
      example: 'Look at that tiger. It is ___.　strong / a strong / strongs',
      cell: { type: '选词填空', scene: '动物', level: '用', distractor: '母语负迁移' },
      nextIfWrong: '先认 It is + 形容词 这一种，不加名词'
    },
    {
      id: 'xs-U3-02', unit: 'U3', group: 'unit',
      label: 'vocab · big / small · 反义对着记',
      ability: 'vocab', cause: '近义混淆',
      why: '两个词都是长度相近的形容词，图片一扫就选反',
      source: 'U3 词表 big / small / strong / funny / beautiful',
      example: 'I am a mouse. I am ___.　small / big / strong',
      cell: { type: '中英匹配', scene: '动物', level: '认', distractor: '语义近' },
      nextIfWrong: '拿两张一大一小的图对照认'
    },
    {
      id: 'xs-U3-03', unit: 'U3', group: 'angle',
      label: 'sentence · Look at this elephant. · look 后面要跟 at',
      ability: 'sentence', cause: '母语负迁移',
      why: '中文「看这头大象」一个动词就够，英语 look 后面必须带 at',
      source: 'U3 Structures：Look at this elephant.',
      example: 'Look ___ that monkey.　at / to / in',
      cell: { type: '选词填空', scene: '动物', level: '用', distractor: '母语负迁移' },
      nextIfWrong: '把 look at 当整块记，别和 see 一起讲'
    },

    /* ================= U4 这些是花 ================= */
    {
      id: 'xs-U4-01', unit: 'U4', group: 'unit',
      label: 'grammar · These are flowers. · these / those 配 are',
      ability: 'grammar', cause: '语法错形',
      why: 'these / those 已经是复数，后面必须 are，他写 These is',
      source: 'U4 Structures：These are flowers. / Those are trees.',
      example: 'These ___ flowers.　are / is / am',
      cell: { type: '选词填空', scene: '自然', level: '用', distractor: '语法错形' },
      nextIfWrong: '只考 these are，those 下一轮'
    },
    {
      id: 'xs-U4-02', unit: 'U4', group: 'unit',
      label: 'vocab · flower / tree · 同类不同物',
      ability: 'vocab', cause: '近义混淆',
      why: '两个都是自然界的东西，图上都有绿色，他按「植物」一个概念记',
      source: 'U4 词表 tree / flower / egg',
      example: '「树」是：tree / flower / egg',
      cell: { type: '中英匹配', scene: '自然', level: '认', distractor: '同类不同物' },
      nextIfWrong: '用实物图对照认，一次两个词'
    },
    {
      id: 'xs-U4-03', unit: 'U4', group: 'angle',
      label: 'sentence · What are those? · 复数问答',
      ability: 'sentence', cause: '语法错形',
      why: '问复数要用 What are，答句用 They are，他混用 it',
      source: 'U4 Structures：What are those? — They are eggs.',
      example: '— What are those?　— ___ eggs.　They are / It is / This is',
      cell: { type: '对话补全', scene: '自然', level: '用', distractor: '语法错形' },
      nextIfWrong: '先只练答句 They are'
    },

    /* ================= U5 我喜欢面条 ================= */
    {
      id: 'xs-U5-01', unit: 'U5', group: 'unit',
      label: 'grammar · I do not like rice. · 否定要加助动词',
      ability: 'grammar', cause: '语法错形',
      why: '中文「我不喜欢米饭」只加「不」，他写 I not like rice',
      source: 'U5 Structures：I like noodles. / I do not like rice.',
      example: 'I ___ like rice.　do not / not / no',
      cell: { type: '选词填空', scene: '食物饮料', level: '用', distractor: '语法错形' },
      nextIfWrong: '先认 do not 整块，再换主语说一遍'
    },
    {
      id: 'xs-U5-02', unit: 'U5', group: 'unit',
      label: 'vocab · noodles / dumplings / biscuits · 常用复数',
      ability: 'vocab', cause: '语法错形',
      why: '面条、饺子、饼干英语习惯用复数，他说 a noodle',
      source: 'U5 词表 noodles / dumplings / biscuits',
      example: 'I like ___.　noodles / noodle / a noodle',
      cell: { type: '中英匹配', scene: '食物饮料', level: '辨', distractor: '语法错形' },
      nextIfWrong: '先认词义，再讲「这些食物默认复数」'
    },
    {
      id: 'xs-U5-03', unit: 'U5', group: 'angle',
      label: 'sentence · Do you like noodles? · 一般疑问句答法',
      ability: 'sentence', cause: '语法错形',
      why: 'Do 开头的问句要用 do / don\'t 回答，他答 Yes, I like',
      source: 'U5 Structures：Do you like noodles?',
      example: '— Do you like milk?　— ___　Yes, I do. / Yes, I like. / Yes, I am.',
      cell: { type: '对话补全', scene: '食物饮料', level: '用', distractor: '语法错形' },
      nextIfWrong: '先只练肯定答，否定答下一轮'
    },

    /* ================= U6 向右转 ================= */
    {
      id: 'xs-U6-01', unit: 'U6', group: 'unit',
      label: 'vocab · left / right · 左右混',
      ability: 'vocab', cause: '近义混淆',
      why: '中文「左右」常连说，两个词单独出现时他按顺序猜',
      source: 'U6 词表 turn / left / right / up / down',
      example: '「向左转」是：Turn left / Turn right / Turn up',
      cell: { type: '中英匹配', scene: '交通出行', level: '认', distractor: '语义近' },
      nextIfWrong: '配手势做两遍再认，别只读音'
    },
    {
      id: 'xs-U6-02', unit: 'U6', group: 'unit',
      label: 'sentence · Turn left! · 祈使句不加主语',
      ability: 'sentence', cause: '母语负迁移',
      why: '中文下指令不带主语，英语祈使句也不带，但他会补一个 You',
      source: 'U6 Structures：Turn left! / Turn right!',
      example: '___ left at the corner.　Turn / You turn / Turns',
      cell: { type: '选词填空', scene: '交通出行', level: '用', distractor: '语法错形' },
      nextIfWrong: '先认 Turn 开头这一种，别讲 Don\'t 否定式'
    },
    {
      id: 'xs-U6-03', unit: 'U6', group: 'angle',
      label: 'vocab · up / down · 与 turn 搭配的方向词',
      ability: 'vocab', cause: '近义混淆',
      why: 'turn up / turn down 是固定搭配，他按「上/下」单独理解',
      source: 'U6 Structures：Turn up. Turn down.',
      example: 'Turn ___. （把声音调小）　down / up / left',
      cell: { type: '中英匹配', scene: '交通出行', level: '辨', distractor: '语义近' },
      nextIfWrong: '先只考 turn down，别四个方向一起上'
    },

    /* ================= U7 这是谁的 ================= */
    {
      id: 'xs-U7-01', unit: 'U7', group: 'unit',
      label: 'grammar · Benny\'s wallet · 名词所有格',
      ability: 'grammar', cause: '母语负迁移',
      why: '中文「Benny 的钱包」靠语序，英语要在人名后加 \'s，他漏掉',
      source: 'U7 Structures：It is Benny\'s wallet.',
      example: 'It is ___.　Benny\'s wallet / Benny wallet / wallet Benny',
      cell: { type: '选词填空', scene: '玩具游戏', level: '用', distractor: '语法错形' },
      nextIfWrong: '先只考人名加 \'s，别同时讲 my / his'
    },
    {
      id: 'xs-U7-02', unit: 'U7', group: 'unit',
      label: 'vocab · wallet / bag · 同类不同物',
      ability: 'vocab', cause: '近义混淆',
      why: '钱包和包都能装东西，中文都叫「包」，他按一个概念记',
      source: 'U7 词表 bag / scarf / key / wallet / hat / mobile phone',
      example: '「钱包」是：wallet / bag / box',
      cell: { type: '中英匹配', scene: '玩具游戏', level: '认', distractor: '同类不同物' },
      nextIfWrong: '用两张实物图对照认'
    },
    {
      id: 'xs-U7-03', unit: 'U7', group: 'angle',
      label: 'sentence · Whose is this? · 归属提问',
      ability: 'sentence', cause: '语法错形',
      why: '问归属用 Whose，他混成 Who 或 Where',
      source: 'U7 Structures：Whose is this? — It is my wallet.',
      example: '___ is this? — It is my wallet.　Whose / Who / Where',
      cell: { type: '对话补全', scene: '玩具游戏', level: '用', distractor: '语义近' },
      nextIfWrong: '把 Whose 和 Who 各问一句，让他听差别'
    },

    /* ================= U8 她穿着黑白相间的毛衣 ================= */
    {
      id: 'xs-U8-01', unit: 'U8', group: 'unit',
      label: 'grammar · She wears ... · 第三人称单数加 s',
      ability: 'grammar', cause: '语法错形',
      why: '主语是 she，动词要加 s，他按 I wear 的写法直接用',
      source: 'U8 Structures：She wears a white and black sweater.',
      example: 'She ___ a brown sweater.　wears / wear / wearing',
      cell: { type: '选词填空', scene: '身体与衣物', level: '用', distractor: '语法错形' },
      nextIfWrong: '先只改动词加 s，别同时改时态'
    },
    {
      id: 'xs-U8-02', unit: 'U8', group: 'unit',
      label: 'vocab · shoes / socks · 成双的用复数',
      ability: 'vocab', cause: '语法错形',
      why: '鞋袜成双成对，英语只记复数形，他说 a shoe 指一双',
      source: 'U8 词表 shoes / socks',
      example: 'My ___ are white.　shoes / shoe / a shoe',
      cell: { type: '中英匹配', scene: '身体与衣物', level: '辨', distractor: '语法错形' },
      nextIfWrong: '先认词义，再讲成双语用复数'
    },
    {
      id: 'xs-U8-03', unit: 'U8', group: 'angle',
      label: 'sentence · white and black · 两个颜色并列的顺序',
      ability: 'sentence', cause: '母语负迁移',
      why: '中文「黑白相间」，英语习惯 white and black，他照中文顺序翻成 black and white 也说得通，但本课固定前者',
      source: 'U8 Structures：She wears a white and black sweater.',
      example: 'a ___ sweater（本课原句）　white and black / black and white',
      cell: { type: '对话补全', scene: '身体与衣物', level: '用', distractor: '语义近' },
      nextIfWrong: '只记住本课这一个搭配，别扩大到所有颜色'
    },

    /* ================= U9 是一百 ================= */
    {
      id: 'xs-U9-01', unit: 'U9', group: 'unit',
      label: 'vocab · forty-six / fifty-four · 十位与个位之间的连字符',
      ability: 'vocab', cause: '形近混淆',
      why: '几十几中间要连字符，他写成 forty six 或 fortysix，还常把 forty 拼成 fourty',
      source: 'U9 词表 twenty-one … ninety-eight',
      example: '46 是：forty-six / fourty-six / forty six',
      cell: { type: '拼写补全', scene: '数字时间', level: '辨', distractor: '形近' },
      nextIfWrong: '先把 forty 与 four 分开记，再写组合'
    },
    {
      id: 'xs-U9-02', unit: 'U9', group: 'unit',
      label: 'grammar · Thirty and seventy is one hundred. · 加法算总数用 is',
      ability: 'grammar', cause: '语法错形',
      why: '两个数相加看成一个总数，动词用 is；他按两个数用 are',
      source: 'U9 Structures：Thirty and seventy is one hundred.',
      example: 'Forty and sixty ___ one hundred.　is / are / am',
      cell: { type: '选词填空', scene: '数字时间', level: '用', distractor: '语法错形' },
      nextIfWrong: '先只练这一种算式，别混减法'
    },
    {
      id: 'xs-U9-03', unit: 'U9', group: 'angle',
      label: 'vocab · hundred · 前面有数字时不加 s',
      ability: 'vocab', cause: '语法错形',
      why: 'one hundred 不加 s，hundreds 是「成百」的意思，他统一加 s',
      source: 'U9 词表 hundred',
      example: 'one ___　hundred / hundreds / a hundreds',
      cell: { type: '拼写补全', scene: '数字时间', level: '辨', distractor: '语法错形' },
      nextIfWrong: '只考 one hundred 这一种'
    },

    /* ================= U10 欢迎来我家 ================= */
    {
      id: 'xs-U10-01', unit: 'U10', group: 'unit',
      label: 'vocab · bedroom / bathroom · 复合词前缀混淆',
      ability: 'vocab', cause: '形近混淆',
      why: '两个词都以 room 结尾，区别只在前半段，他扫一眼就选',
      source: 'U10 词表 bedroom / bathroom / kitchen / living room',
      example: '「卧室」是：bedroom / bathroom / kitchen',
      cell: { type: '中英匹配', scene: '家庭', level: '辨', distractor: '形近' },
      nextIfWrong: '先把 bed / bath 两个词单独认一遍'
    },
    {
      id: 'xs-U10-02', unit: 'U10', group: 'unit',
      label: 'sentence · This is my bedroom. · 介绍房间',
      ability: 'sentence', cause: '近义混淆',
      why: '介绍用 This is，他说成 Here is 或 It is my bedroom 也能懂，但本课固定前一种',
      source: 'U10 Structures：This is my bedroom. — It is small.',
      example: '___ is the living room.　This / Here / Where',
      cell: { type: '对话补全', scene: '家庭', level: '认', distractor: '语义近' },
      nextIfWrong: '先认 This is，别讲 Here is'
    },
    {
      id: 'xs-U10-03', unit: 'U10', group: 'angle',
      label: 'sentence · Welcome to our home! · to 不能丢',
      ability: 'sentence', cause: '母语负迁移',
      why: '中文「欢迎来我家」没有介词，英语 welcome 后面要 to',
      source: 'U10 Structures：Welcome to our home!',
      example: 'Welcome ___ our home!　to / in / at',
      cell: { type: '选词填空', scene: '家庭', level: '用', distractor: '母语负迁移' },
      nextIfWrong: '把 Welcome to 当整块背'
    },

    /* ================= U11 猫在哪儿 ================= */
    {
      id: 'xs-U11-01', unit: 'U11', group: 'unit',
      label: 'grammar · It is under the desk. · in / on / under',
      ability: 'grammar', cause: '母语负迁移',
      why: '中文「在桌子下面」用「在」，三个介词都对应「在」，他靠猜',
      source: 'U11 Structures：Where\'s the pencil? — It is under the desk.',
      example: 'The cat is ___ the chair.　under / in / on',
      cell: { type: '选词填空', scene: '家庭', level: '用', distractor: '语义近' },
      nextIfWrong: '先只比 under 与 on，两个都看得见差别'
    },
    {
      id: 'xs-U11-02', unit: 'U11', group: 'unit',
      label: 'sentence · Where\'s the cat? · 缩写形式',
      ability: 'sentence', cause: '形近混淆',
      why: 'Where\'s 是 Where is 的缩写，他读成 Wheree 或写成 Where is 后接错语序',
      source: 'U11 Structures：Where\'s the cat?',
      example: '___ the cat?　Where\'s / Where / Wheres',
      cell: { type: '选词填空', scene: '家庭', level: '辨', distractor: '形近' },
      nextIfWrong: '先把 Where\'s 还原成 Where is 再缩写'
    },
    {
      id: 'xs-U11-03', unit: 'U11', group: 'angle',
      label: 'grammar · Is it under your desk? · 用 it 指代前文的物',
      ability: 'grammar', cause: '语法错形',
      why: '前一句提到 the pencil，下一句要用 it 指代，他重复名词或用 this',
      source: 'U11 Structures：Is it under your desk? — Yes, it is.',
      example: '— Where\'s the pencil? — Is ___ under your desk?　it / this / that',
      cell: { type: '对话补全', scene: '家庭', level: '用', distractor: '语法错形' },
      nextIfWrong: '先只在两句连起来时练指代'
    },

    /* ================= U12 彼得能跳得高 ================= */
    {
      id: 'xs-U12-01', unit: 'U12', group: 'unit',
      label: 'grammar · Peter can jump high. · can 后面跟动词原形',
      ability: 'grammar', cause: '语法错形',
      why: 'can 后面不加 to、不加 s，他写 can jumps 或 can to jump',
      source: 'U12 Structures：Peter can jump high.',
      example: 'Peter can ___ high.　jump / jumps / to jump',
      cell: { type: '选词填空', scene: '运动', level: '用', distractor: '语法错形' },
      nextIfWrong: '先只记 can + 原形这一条，别同时改主语'
    },
    {
      id: 'xs-U12-02', unit: 'U12', group: 'unit',
      label: 'vocab · high / fast / far · 副词修饰动作',
      ability: 'vocab', cause: '近义混淆',
      why: '三个都是「怎么样地」，中文都是形容词，他分不清该配哪个动作',
      source: 'U12 词表 jump / run / swim / fly / high / fast / far',
      example: 'It can run ___.　fast / high / far',
      cell: { type: '中英匹配', scene: '运动', level: '辨', distractor: '语义近' },
      nextIfWrong: '先把 run fast 这一组配对记住'
    },
    {
      id: 'xs-U12-03', unit: 'U12', group: 'angle',
      label: 'sentence · Can you swim? — Yes, I can. · 情态动词问答',
      ability: 'sentence', cause: '语法错形',
      why: 'Can 开头的问句要用 can / can\'t 回答，他答 Yes, I do',
      source: 'U12 Structures：Can you swim? — Yes, I can.',
      example: '— Can you swim?　— ___　Yes, I can. / Yes, I do. / Yes, I am.',
      cell: { type: '对话补全', scene: '运动', level: '用', distractor: '语法错形' },
      nextIfWrong: '先只练肯定答'
    }
  ];
})(window);
