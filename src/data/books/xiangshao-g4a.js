/*
 * 教材知识库：湖南少年儿童出版社《英语》四年级上册（三年级起点）
 *
 * 来源（2026-11-10 抓取）：
 *   索引  https://media.englishanchor.online/ChinaTextbook-hf/search.json
 *   文件  Hugging Face 数据集 RainPPR/china-textbook-2021-hf
 *         小学/英语/湘少版/义务教育教科书·英语（三年级起点）四年级上册.pdf（89 页）
 *
 * 抽取方式：PyMuPDF 取文本层。本书的 Word List（p.67–73）是图片，无文本层，
 * 因此词表不从附录取，而是从每个单元的 Let's Learn / Let's Act 板块正文取词，
 * 再用书后 Structures（p.74–79）的替换词补齐。**词表是「可考词」而非「全册词表」**，
 * 覆盖率低于 PEP 与冀教版，这一点在 meta.notes 里写明，不假装完整。
 *
 * 与另两本的差异：
 *   - 12 个单元，是另两本的 2–3 倍，单元更细（形状、方向、归属各占一个单元）
 *   - 附 Assessment I–IV 与 Let's Know More，但没有语音板块 → phonics 留空
 *   - 数字单元到 100，是另两本没有的考点
 */
(function (root) {
  const SHT = (root.SHT = root.SHT || {});

  const BOOK = {
    meta: {
      id: 'XS-G4A',
      kind: 'primary-english',
      hostPrefix: 'XS4-上',
      name: '义务教育教科书·英语（三年级起点）四年级上册',
      shortName: '湘少版 四上',
      publisher: '湖南少年儿童出版社',
      grade: '四年级',
      term: '上册',
      startLevel: '三年级起点',
      pages: 89,
      units: 12,
      fetchedAt: '2026-11-10',
      source: {
        site: 'https://englishanchor.online/downloads/textbooks/',
        dataset: 'RainPPR/china-textbook-2021-hf',
        file: '小学/英语/湘少版/义务教育教科书·英语（三年级起点）四年级上册.pdf',
        method: 'PyMuPDF 文本层 + Let\'s Learn / Structures 正文取词'
      },
      notes: '书后 Word List 为图片无文本层，词表由 Let\'s Learn 与 Structures 拼出，非全册词表；超纲判定的边界比另两本窄，属已知限制。',
      allowedFunctionWords: [
        'a', 'an', 'the', 'is', 'are', 'am', 'be', 'this', 'that', 'these', 'those',
        'it', 'its', 'he', 'she', 'him', 'his', 'her', 'we', 'our', 'i', 'you', 'your',
        'my', 'me', 'they', 'them', 'their', 'in', 'on', 'at', 'to', 'of', 'and', 'or',
        'but', 'with', 'for', 'from', 'under', 'near', 'many', 'some', 'any', 'no',
        'not', 'yes', 'please', 'thanks', 'thank', 'now', 'look', 'let', "let's",
        'where', 'what', 'who', 'whose', 'how', 'here', 'there', 'can', 'do', 'does', 'have',
        'has', 'like', 'would', 'very', 'too', 'oh', 'hi', 'hello', 'good', 'nice',
        'glad', 'see', 'meet', 'fine', 'dear', 'right', 'wrong', 'turn', 'up', 'down',
        'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'
      ]
    },
    units: [
      {
        id: 'U1', no: 1, hostUnitId: 'XS4-上-U1',
        title: 'Nice to meet you!', titleZh: '很高兴见到你', pages: '1–4',
        topicDomain: '问候',
        functions: ['打招呼与问候', '介绍他人', '说自己所在的学校班级'],
        words: [
          { en: 'nice', zh: '好的；令人愉快的', p: 2 },
          { en: 'meet', zh: '遇见；见面', p: 2 },
          { en: 'see', zh: '看见', p: 3 },
          { en: 'glad', zh: '高兴的', p: 3 },
          { en: 'brother', zh: '哥哥；弟弟', p: 1 },
          { en: 'name', zh: '名字', p: 3 },
          { en: 'fine', zh: '好的；健康的', p: 1 },
          { en: 'school', zh: '学校', p: 3 },
          { en: 'class', zh: '班级', p: 3 },
          { en: 'grade', zh: '年级', p: 3 },
          { en: 'number', zh: '号码；数字', p: 3 }
        ],
        sentencePatterns: [
          'Good morning, Amy. — Good morning, Lingling.',
          'How are you? — I am fine. Thank you.',
          'This is Chen Dong. He is my brother.',
          'Nice to meet you! — Nice to meet you, too!',
          'Glad to see you! — Glad to see you, too!',
          "What's your name? — My name is Lily."
        ],
        phonics: { focus: '', pairs: [], extras: [] }
      },
      {
        id: 'U2', no: 2, hostUnitId: 'XS4-上-U2',
        title: "It's a circle.", titleZh: '它是一个圆', pages: '5–8',
        topicDomain: '形状',
        functions: ['说形状名称', '问这是什么', '数图形个数'],
        words: [
          { en: 'circle', zh: '圆', p: 6 },
          { en: 'square', zh: '正方形', p: 6 },
          { en: 'line', zh: '线；直线', p: 6 },
          { en: 'dot', zh: '点', p: 6 },
          { en: 'triangle', zh: '三角形', p: 8 },
          { en: 'rectangle', zh: '长方形', p: 8 },
          { en: 'house', zh: '房子', p: 8 }
        ],
        sentencePatterns: [
          "What's this? — It's a circle.",
          "What's that? — It's a square.",
          'How many circles are there?',
          'This is a red triangle.',
          'This door is a blue rectangle.'
        ],
        phonics: { focus: '', pairs: [], extras: [] }
      },
      {
        id: 'U3', no: 3, hostUnitId: 'XS4-上-U3',
        title: 'Look at this elephant.', titleZh: '看这头大象', pages: '9–12',
        topicDomain: '动物',
        functions: ['说动物名称', '描述动物特征', '用形容词评价'],
        words: [
          { en: 'elephant', zh: '大象', p: 10 },
          { en: 'tiger', zh: '老虎', p: 10 },
          { en: 'monkey', zh: '猴子', p: 10 },
          { en: 'bird', zh: '鸟', p: 10 },
          { en: 'mouse', zh: '老鼠', p: 10 },
          { en: 'big', zh: '大的', p: 9 },
          { en: 'small', zh: '小的', p: 10 },
          { en: 'strong', zh: '强壮的', p: 9 },
          { en: 'funny', zh: '滑稽的；有趣的', p: 9 },
          { en: 'beautiful', zh: '美丽的', p: 9 }
        ],
        sentencePatterns: [
          'Look at this elephant. — It is big.',
          'Look at that tiger. — It is strong.',
          'Look at that monkey. — It is funny.',
          'Look at this bird. — It is beautiful.',
          'I am a mouse. I am small.'
        ],
        phonics: { focus: '', pairs: [], extras: [] }
      },
      {
        id: 'U4', no: 4, hostUnitId: 'XS4-上-U4',
        title: 'These are flowers.', titleZh: '这些是花', pages: '17–20',
        topicDomain: '自然',
        functions: ['说复数名词', '用 these / those 指认', '问那些是什么'],
        words: [
          { en: 'tree', zh: '树', p: 18 },
          { en: 'flower', zh: '花', p: 18 },
          { en: 'egg', zh: '蛋', p: 18 },
          { en: 'these', zh: '这些', p: 17 },
          { en: 'those', zh: '那些', p: 17 }
        ],
        sentencePatterns: [
          'These are flowers. — Yes. They are beautiful!',
          'What are those? — They are eggs.',
          'Those are trees.'
        ],
        phonics: { focus: '', pairs: [], extras: [] }
      },
      {
        id: 'U5', no: 5, hostUnitId: 'XS4-上-U5',
        title: 'I like noodles.', titleZh: '我喜欢面条', pages: '21–24',
        topicDomain: '食物',
        functions: ['说食物名称', '表达喜欢与不喜欢', '问别人喜不喜欢'],
        words: [
          { en: 'noodles', zh: '面条', p: 22 },
          { en: 'rice', zh: '米饭', p: 22 },
          { en: 'milk', zh: '牛奶', p: 22 },
          { en: 'dumplings', zh: '饺子', p: 22 },
          { en: 'biscuits', zh: '饼干', p: 22 },
          { en: 'bread', zh: '面包', p: 22 }
        ],
        sentencePatterns: [
          'I like noodles.',
          'I do not like rice.',
          'I like bread. — I like milk.',
          'Do you like noodles?'
        ],
        phonics: { focus: '', pairs: [], extras: [] }
      },
      {
        id: 'U6', no: 6, hostUnitId: 'XS4-上-U6',
        title: 'Turn right!', titleZh: '向右转', pages: '25–28',
        topicDomain: '方向',
        functions: ['说方向指令', '用 turn left / turn right', '说上下'],
        words: [
          { en: 'turn', zh: '转；转弯', p: 26 },
          { en: 'left', zh: '左边；向左', p: 26 },
          { en: 'right', zh: '右边；向右', p: 26 },
          { en: 'up', zh: '向上', p: 26 },
          { en: 'down', zh: '向下', p: 26 }
        ],
        sentencePatterns: [
          'Turn left!',
          'Turn right!',
          'Turn up. Turn down.'
        ],
        phonics: { focus: '', pairs: [], extras: [] }
      },
      {
        id: 'U7', no: 7, hostUnitId: 'XS4-上-U7',
        title: 'Whose is this?', titleZh: '这是谁的', pages: '33–36',
        topicDomain: '物品',
        functions: ['说随身物品名称', '问东西是谁的', '说这是我的'],
        words: [
          { en: 'bag', zh: '包', p: 34 },
          { en: 'scarf', zh: '围巾', p: 34 },
          { en: 'key', zh: '钥匙', p: 34 },
          { en: 'wallet', zh: '钱包', p: 34 },
          { en: 'hat', zh: '帽子', p: 34 },
          { en: 'mobile phone', zh: '手机', p: 34 }
        ],
        sentencePatterns: [
          'Whose is this? — It is my wallet.',
          'Whose is this, Linda? — It is Benny\'s wallet.',
          'Put your things in this box.'
        ],
        phonics: { focus: '', pairs: [], extras: [] }
      },
      {
        id: 'U8', no: 8, hostUnitId: 'XS4-上-U8',
        title: 'She wears a white and black sweater.', titleZh: '她穿着黑白相间的毛衣', pages: '37–40',
        topicDomain: '服装',
        functions: ['说衣物名称', '说颜色搭配', '描述谁穿着什么'],
        words: [
          { en: 'white', zh: '白色；白色的', p: 38 },
          { en: 'black', zh: '黑色；黑色的', p: 38 },
          { en: 'brown', zh: '棕色；棕色的', p: 38 },
          { en: 'grey', zh: '灰色；灰色的', p: 38 },
          { en: 'shoes', zh: '鞋（复数）', p: 38 },
          { en: 'socks', zh: '短袜（复数）', p: 38 },
          { en: 'sweater', zh: '毛衣', p: 37 },
          { en: 'skirt', zh: '裙子', p: 37 },
          { en: 'wear', zh: '穿；戴', p: 37 }
        ],
        sentencePatterns: [
          'She wears a white and black sweater.',
          'He wears a brown and yellow sweater.',
          'Look at the dancer.'
        ],
        phonics: { focus: '', pairs: [], extras: [] }
      },
      {
        id: 'U9', no: 9, hostUnitId: 'XS4-上-U9',
        title: "It's one hundred.", titleZh: '是一百', pages: '41–48',
        topicDomain: '数字',
        functions: ['说 100 以内的数', '做两位数加法', '说作业对错'],
        words: [
          { en: 'twenty-one', zh: '二十一', p: 42 },
          { en: 'thirty-two', zh: '三十二', p: 42 },
          { en: 'forty-three', zh: '四十三', p: 42 },
          { en: 'fifty-four', zh: '五十四', p: 42 },
          { en: 'seventy-six', zh: '七十六', p: 42 },
          { en: 'eighty-seven', zh: '八十七', p: 42 },
          { en: 'ninety-eight', zh: '九十八', p: 42 },
          { en: 'hundred', zh: '一百', p: 41 },
          { en: 'homework', zh: '家庭作业', p: 42 }
        ],
        sentencePatterns: [
          "It's one hundred.",
          'Forty-six and fifty-four is one hundred.',
          'Thirty and seventy is one hundred.',
          'Please think again.'
        ],
        phonics: { focus: '', pairs: [], extras: [] }
      },
      {
        id: 'U10', no: 10, hostUnitId: 'XS4-上-U10',
        title: 'Welcome to our home!', titleZh: '欢迎来我家', pages: '49–52',
        topicDomain: '家庭',
        functions: ['说房间名称', '介绍自己的家', '形容房间大小'],
        words: [
          { en: 'bedroom', zh: '卧室', p: 50 },
          { en: 'bathroom', zh: '浴室', p: 50 },
          { en: 'kitchen', zh: '厨房', p: 50 },
          { en: 'living room', zh: '客厅', p: 50 },
          { en: 'home', zh: '家', p: 49 },
          { en: 'small', zh: '小的', p: 50 }
        ],
        sentencePatterns: [
          'Welcome to our home!',
          'This is my bedroom. — It is small.',
          'This is the living room.'
        ],
        phonics: { focus: '', pairs: [], extras: [] }
      },
      {
        id: 'U11', no: 11, hostUnitId: 'XS4-上-U11',
        title: "Where's the cat?", titleZh: '猫在哪儿', pages: '53–56',
        topicDomain: '方位',
        functions: ['问东西在哪里', '用 in / on / under 说方位', '回答是或不是'],
        words: [
          { en: 'where', zh: '在哪里', p: 54 },
          { en: 'under', zh: '在……下面', p: 54 },
          { en: 'chair', zh: '椅子', p: 54 },
          { en: 'desk', zh: '书桌', p: 54 },
          { en: 'pencil', zh: '铅笔', p: 54 },
          { en: 'cat', zh: '猫', p: 53 },
          { en: 'box', zh: '盒子', p: 54 }
        ],
        sentencePatterns: [
          "Where's the cat? — She is in the kitchen.",
          "Where's the pencil? — It is under the desk.",
          'Is it under your desk? — Yes, it is.',
          'Is it under Anne\'s chair? — No, it isn\'t.'
        ],
        phonics: { focus: '', pairs: [], extras: [] }
      },
      {
        id: 'U12', no: 12, hostUnitId: 'XS4-上-U12',
        title: 'Peter can jump high.', titleZh: '彼得能跳得高', pages: '57–60',
        topicDomain: '运动',
        functions: ['说能力', '问别人会不会', '用副词说程度'],
        words: [
          { en: 'jump', zh: '跳', p: 58 },
          { en: 'run', zh: '跑', p: 58 },
          { en: 'swim', zh: '游泳', p: 58 },
          { en: 'fly', zh: '飞', p: 58 },
          { en: 'high', zh: '高地', p: 58 },
          { en: 'fast', zh: '快地', p: 58 },
          { en: 'far', zh: '远地', p: 58 },
          { en: 'can', zh: '能；会', p: 57 }
        ],
        sentencePatterns: [
          'Peter can jump high.',
          'Can you swim? — Yes, I can.',
          'It can run fast.',
          'Anne can jump far.'
        ],
        phonics: { focus: '', pairs: [], extras: [] }
      }
    ]
  };

  SHT.BOOKS.register(BOOK);
})(window);
