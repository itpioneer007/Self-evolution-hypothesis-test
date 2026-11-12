/*
 * 候选知识点：河北教育出版社《英语》四年级上册（三年级起点）
 *
 * 为什么每本书要自己一份：换考点（`pipeline.nearKpFor`）和配额自动分配
 * （`quota.fromUnit`）都要读「这一册能考什么」。借 PEP 的清单等于跨册出题，
 * 出来就是超纲题。PEP 那份在 knowledgePoints.js，本册在这里。
 *
 * 只从三处真实材料取，不凭空编：
 *   1. src/data/books/hebei-g4a.js 该单元的词表 / 句型表（带书上页码）
 *   2. 该单元 Let's Learn / Let's Act / Let's Do It 的板块内容
 *   3. 单元话题域（服装 / 家庭 / 学校与出行 / 购物）
 *
 * 本册没有语音板块（phonics 留空），所以这里一条 `字母组合辨音` 都不排——
 * 排了也考不出来。这是真实边界，不假装完整。
 *
 * 字段与 PEP 那份完全一致：label 三段（类型 · 具体对象 · 错在哪）、
 * ability 取七类、cell 四维落在枚举内、nextIfWrong 是「他再错，下一轮给什么」。
 */
(function (root) {
  const SHT = (root.SHT = root.SHT || {});

  SHT.KPS_BY_BOOK = SHT.KPS_BY_BOOK || {};
  SHT.KPS_BY_BOOK['HEB-G4A'] = [

    /* ================= U1 The Clothes We Wear 我们穿的衣服 ================= */
    {
      id: 'hb-U1-01', unit: 'U1', group: 'unit',
      label: 'grammar · this / these · 单复数的 is 与 are',
      ability: 'grammar', cause: '语法错形',
      why: '「这件」用 this is、「这些」用 these are，中文都不区分，他按中文语序直接接词',
      source: 'U1 句型 This is a red skirt. / These are trousers.（教材 p.1–16）',
      example: 'This ___ my new shoes.　is / are / am',
      cell: { type: '选词填空', scene: '身体与衣物', level: '用', distractor: '语法错形' },
      nextIfWrong: '先只考 this is 一种，加进来 these are 再考一次'
    },
    {
      id: 'hb-U1-02', unit: 'U1', group: 'unit',
      label: 'vocab · trousers / shorts / socks · 只有复数形的衣物词',
      ability: 'vocab', cause: '语法错形',
      why: '裤子、短裤、袜子英语只有复数形，他会说 a trousers，因为他觉得「一条」就是单数',
      source: 'U1 词表 trousers / shorts / socks / shoes',
      example: '选出「裤子」的英文：trousers / trouser / a trousers',
      cell: { type: '中英匹配', scene: '身体与衣物', level: '辨', distractor: '语法错形' },
      nextIfWrong: '先认词义，再单独讲一条「成双成对的东西都用复数」'
    },
    {
      id: 'hb-U1-03', unit: 'U1', group: 'angle',
      label: 'sentence · What is he wearing? · 现在进行时的「穿着」',
      ability: 'sentence', cause: '母语负迁移',
      why: '中文「他穿着绿毛衣」没有 be + doing 这层，他直接答 He wear a green sweater',
      source: 'U1 句型 What is he wearing? — He is wearing a green sweater.',
      example: '— What is she wearing?　— She ___ a yellow dress.　wearing / is wearing / wear',
      cell: { type: '对话补全', scene: '身体与衣物', level: '用', distractor: '母语负迁移' },
      nextIfWrong: '退到「认」：只认 is wearing 这一块，别一次改两处'
    },
    {
      id: 'hb-U1-04', unit: 'U1', group: 'unit',
      label: 'vocab · coat / cap / dress · 同类不同物',
      ability: 'vocab', cause: '近义混淆',
      why: '大衣、帽子、连衣裙都是穿在身上的，他按「衣服」一个概念记，看到图就随便挑',
      source: 'U1 词表 coat / cap / dress / shirt / skirt',
      example: '「大衣」是：coat / cap / dress',
      cell: { type: '中英匹配', scene: '身体与衣物', level: '认', distractor: '同类不同物' },
      nextIfWrong: '把三个词挂到三张图上再认一遍，别再用中文对中文'
    },
    {
      id: 'hb-U1-05', unit: 'U1', group: 'unit',
      label: 'spelling · sweater · ea 与双写 e',
      ability: 'spelling', cause: '形近混淆',
      why: 'sweater 中间是 ea，他按读音写成 sweter 或 sweatr',
      source: 'U1 词表 sweater（p.1–16）',
      example: '选出 sweater 的正确拼写：sweater / sweter / sweeter',
      cell: { type: '拼写补全', scene: '身体与衣物', level: '辨', distractor: '形近' },
      nextIfWrong: '拆成 sw-ea-ter 三段读一遍再拼'
    },
    {
      id: 'hb-U1-06', unit: 'U1', group: 'angle',
      label: 'sentence · favourite · 颜色词放在名词前',
      ability: 'sentence', cause: '母语负迁移',
      why: '中文说「我最喜欢的颜色是黄色」，英语是 Yellow is my favourite colour，主语换了位置',
      source: 'U1 句型 Yellow is my favourite colour.',
      example: '— ___ is your favourite colour?　— Blue.　What / Where / Who',
      cell: { type: '对话补全', scene: '身体与衣物', level: '用', distractor: '语义近' },
      nextIfWrong: '先照着句型换颜色词读三遍，再考'
    },

    /* ================= U2 At Home 在家里 ================= */
    {
      id: 'hb-U2-01', unit: 'U2', group: 'unit',
      label: 'grammar · do / does · 问「你做什么」的助动词',
      ability: 'grammar', cause: '语法错形',
      why: '中文问「你晚上做什么」不需要助动词，他直接写 What you do in the evening',
      source: 'U2 句型 What do you do in the evening?',
      example: 'What ___ you do in the evening?　do / does / are',
      cell: { type: '选词填空', scene: '家庭', level: '用', distractor: '语法错形' },
      nextIfWrong: '先只考 do，does 留到下一轮'
    },
    {
      id: 'hb-U2-02', unit: 'U2', group: 'unit',
      label: 'sentence · listen to / play with · 动词后面跟的介词',
      ability: 'sentence', cause: '母语负迁移',
      why: 'listen 和 play 后面必须带 to / with，中文「听音乐」「玩球」都没有这一层',
      source: 'U2 词表 listen to / play with（教材配套短语）',
      example: 'I listen ___ music in the evening.　to / with / at',
      cell: { type: '选词填空', scene: '家庭', level: '用', distractor: '母语负迁移' },
      nextIfWrong: '把 listen to 与 play with 当成两个整块背，别拆开'
    },
    {
      id: 'hb-U2-03', unit: 'U2', group: 'unit',
      label: 'vocab · homework · 不可数，不加 a',
      ability: 'vocab', cause: '语法错形',
      why: '作业在中文里能数，他写 a homework 或 homeworks',
      source: 'U2 词表 homework / do my homework',
      example: 'I do ___ homework after dinner.　my / a / many',
      cell: { type: '选词填空', scene: '家庭', level: '辨', distractor: '语法错形' },
      nextIfWrong: '先记 do my homework 整句，再说为什么不能加 a'
    },
    {
      id: 'hb-U2-04', unit: 'U2', group: 'angle',
      label: 'sentence · in the morning / on Saturday · 时间介词',
      ability: 'sentence', cause: '母语负迁移',
      why: '早上用 in、具体某天用 on，中文都是「在」，他全靠猜',
      source: 'U2 句型 In the evening, I read a book. / What do you do on Saturday?',
      example: 'I play with my friends ___ Saturday.　on / in / at',
      cell: { type: '选词填空', scene: '家庭', level: '用', distractor: '语义近' },
      nextIfWrong: '只比 in the morning 和 on Saturday 两句，别扩到年份月份'
    },
    {
      id: 'hb-U2-05', unit: 'U2', group: 'unit',
      label: 'spelling · homework · home + work 复合词',
      ability: 'spelling', cause: '形近混淆',
      why: '复合词少写一半，写成 homewok 或 home work',
      source: 'U2 词表 homework',
      example: '选出 homework 的正确拼写：homework / homewok / home work',
      cell: { type: '拼写补全', scene: '家庭', level: '辨', distractor: '形近' },
      nextIfWrong: '拆成 home + work 两个词拼，再合起来'
    },
    {
      id: 'hb-U2-06', unit: 'U2', group: 'unit',
      label: 'sentence · wash my face / make my bed · 动词短语里的物主代词',
      ability: 'sentence', cause: '母语负迁移',
      why: '中文「洗脸」不带「我的」，他写 wash face',
      source: 'U2 句型 I wash my face and make my bed.',
      example: 'I wash ___ face in the morning.　my / me / I',
      cell: { type: '选词填空', scene: '家庭', level: '用', distractor: '母语负迁移' },
      nextIfWrong: '把 wash my face 当整块记，同时区分 me 与 my'
    },

    /* ================= U3 Let's Go 出发吧 ================= */
    {
      id: 'hb-U3-01', unit: 'U3', group: 'unit',
      label: 'sentence · by bus · 交通方式用 by',
      ability: 'sentence', cause: '母语负迁移',
      why: '「坐公交去」中文用动词「坐」，英语用 by + 交通工具，且不加冠词',
      source: 'U3 句型 How do you go to school? — I go to school by bus.',
      example: 'I go to school ___ bus.　by / on / with',
      cell: { type: '选词填空', scene: '交通出行', level: '用', distractor: '母语负迁移' },
      nextIfWrong: '只比 by bus 和 by bike 两个，别一次上五种交通'
    },
    {
      id: 'hb-U3-02', unit: 'U3', group: 'unit',
      label: 'sentence · far from · 距离的固定搭配',
      ability: 'sentence', cause: '母语负迁移',
      why: '「离这儿远」是 far from here，他按中文顺序写 far here 或 from far',
      source: 'U3 句型 Is the library far from here? — No, it is near.',
      example: 'The zoo is far ___ my school.　from / to / of',
      cell: { type: '选词填空', scene: '交通出行', level: '用', distractor: '语义近' },
      nextIfWrong: '把 far from 与 near 对着练，near 后面不接 from'
    },
    {
      id: 'hb-U3-03', unit: 'U3', group: 'angle',
      label: 'sentence · Where is the zoo? · 指路的祈使句',
      ability: 'sentence', cause: '母语负迁移',
      why: '回答路线时中文说「直走然后左转」，英语要 Go straight and turn left，两段用 and 连',
      source: 'U3 句型 Where is the zoo? — Go straight and turn left.',
      example: '— Where is the cinema?　— Go straight and ___ left.　turn / turns / turning',
      cell: { type: '对话补全', scene: '交通出行', level: '用', distractor: '语法错形' },
      nextIfWrong: '先认 turn left 整块，再练两句连起来'
    },
    {
      id: 'hb-U3-04', unit: 'U3', group: 'unit',
      label: 'vocab · thirty / thirteen · -ty 与 -teen',
      ability: 'vocab', cause: '音近混淆',
      why: 'thirty 与 thirteen 只差结尾，读音接近，他听到哪个都写 thirty',
      source: 'U3 词表 thirty / 词表内 thirteen',
      example: '听录音，选出你听到的数字：13 / 30',
      cell: { type: '听音选义', scene: '交通出行', level: '辨', distractor: '音近' },
      nextIfWrong: '把数字写成阿拉伯数字再听，别拼英文'
    },
    {
      id: 'hb-U3-05', unit: 'U3', group: 'unit',
      label: 'vocab · light · 一个词两个意思（灯 / 轻的）',
      ability: 'vocab', cause: '近义混淆',
      why: '本单元 light 是「灯」，他按「轻的」记，看到交通灯就想不到',
      source: 'U3 词表 light（交通灯语境）',
      example: 'The traffic ___ is red.　light / lights / a light',
      cell: { type: '中英匹配', scene: '交通出行', level: '认', distractor: '语义近' },
      nextIfWrong: '只在「交通灯」这一个语境里考，先不碰「轻的」'
    },
    {
      id: 'hb-U3-06', unit: 'U3', group: 'angle',
      label: 'sentence · Is the library far from here? · 一般疑问句的答法',
      ability: 'sentence', cause: '语法错形',
      why: '问句以 Is 开头，答句要用 it is / it isn\'t，他答 Yes, it does',
      source: 'U3 句型 Is the library far from here? — No, it is near.',
      example: '— Is the park near?　— No, ___　it isn\'t. / it doesn\'t. / it is.',
      cell: { type: '对话补全', scene: '交通出行', level: '用', distractor: '语法错形' },
      nextIfWrong: '只练否定答，肯定答下一轮再上'
    },

    /* ================= U4 Shopping in the City 在城市购物 ================= */
    {
      id: 'hb-U4-01', unit: 'U4', group: 'unit',
      label: 'grammar · want to buy · 动词后接 to do',
      ability: 'grammar', cause: '语法错形',
      why: '中文「我想买个包」两个动词直接连，他写 I want buy a bag',
      source: 'U4 句型 I want to buy a cap. / What do you want to buy?',
      example: 'I want ___ a new bag.　to buy / buy / buying',
      cell: { type: '选词填空', scene: '购物', level: '用', distractor: '语法错形' },
      nextIfWrong: '先认 want to 整块，别同时讲 like doing'
    },
    {
      id: 'hb-U4-02', unit: 'U4', group: 'unit',
      label: 'vocab · tomato / potato · 复数加 es',
      ability: 'vocab', cause: '语法错形',
      why: '这两个词复数要加 es，他按一般规则加 s，或干脆不加',
      source: 'U4 词表 tomato / potato',
      example: '选出「西红柿」的复数：tomatoes / tomatos / tomato',
      cell: { type: '拼写补全', scene: '购物', level: '用', distractor: '语法错形' },
      nextIfWrong: '只考这两个词，别把 -es 规则铺到全册'
    },
    {
      id: 'hb-U4-03', unit: 'U4', group: 'angle',
      label: 'sentence · How much is it? · 单数用 is、复数用 are',
      ability: 'sentence', cause: '语法错形',
      why: '问价钱时按「东西」的数量换 is / are，他固定用 is',
      source: 'U4 句型 How much is it?',
      example: 'How much ___ the apples?　are / is / am',
      cell: { type: '选词填空', scene: '购物', level: '用', distractor: '语法错形' },
      nextIfWrong: '先只问单个物品，再问一堆'
    },
    {
      id: 'hb-U4-04', unit: 'U4', group: 'unit',
      label: 'sentence · Let\'s go shopping · Let\'s 后面跟动词原形',
      ability: 'sentence', cause: '语法错形',
      why: 'Let\'s 后面不加 to、不加 s，他写 Let\'s to go 或 Let\'s goes',
      source: 'U4 句型 Let\'s go shopping.',
      example: 'Let\'s ___ shopping.　go / to go / goes',
      cell: { type: '选词填空', scene: '购物', level: '用', distractor: '语法错形' },
      nextIfWrong: '把 Let\'s go 当固定块记，换三个动词都用原形'
    },
    {
      id: 'hb-U4-05', unit: 'U4', group: 'unit',
      label: 'spelling · supermarket · super + market 复合词',
      ability: 'spelling', cause: '形近混淆',
      why: '长词少写字母，写成 supermaket 或 super market',
      source: 'U4 词表 supermarket',
      example: '选出 supermarket 的正确拼写：supermarket / supermaket / super market',
      cell: { type: '拼写补全', scene: '购物', level: '辨', distractor: '形近' },
      nextIfWrong: '拆成 super + market 两段拼'
    },
    {
      id: 'hb-U4-06', unit: 'U4', group: 'angle',
      label: 'vocab · shop / go shopping · 名词与动词短语',
      ability: 'vocab', cause: '近义混淆',
      why: 'shop 可以指商店，go shopping 才是「去购物」，他把两个当成一个',
      source: 'U4 词表 shop / go shopping',
      example: '「去购物」是：go shopping / go to shop / shop go',
      cell: { type: '中英匹配', scene: '购物', level: '用', distractor: '语义近' },
      nextIfWrong: '先把 shop 当名词认，再上 go shopping'
    }
  ];
})(window);
