/*
 * 教材知识库：人教版（PEP）三年级起点 四年级上册
 *
 * 来源（2026-11-09 抓取，只取词表 / 句型 / 语音点，未收录课文原文与图片）：
 *   站点  https://englishanchor.online/downloads/textbooks/
 *   索引  https://media.englishanchor.online/ChinaTextbook-hf/search.json
 *   文件  Hugging Face 数据集 RainPPR/china-textbook-2021-hf
 *         小学/英语/人教版（PEP）（三年级起点）（主编：吴欣）/
 *         义务教育教科书·英语（PEP）（三年级起点）四年级上册.pdf（82 页）
 *
 * 抽取方式：PyMuPDF 逐页取文本层，人工按附录 1「Words in each unit」与各页
 * Let's learn / Let's talk / Let's spell 校对。p 为书上印刷页码（非 PDF 页序）。
 * 音标在 PDF 里是嵌入字体，抽出来是乱码，因此不收；只收词形、词义、页码。
 *
 * 为什么整本入库：最小测试只跑 1 个单元，但出题必须受「这一册教过什么」约束。
 * 换单元时超纲判定、句型表、语音点、情境域都要跟着换，不能只换词表。
 */
(function (root) {
  const BOOK = (root.SHT_BOOK = root.SHT_BOOK || {});

  BOOK.meta = {
    id: 'PEP-G4A',
    hostPrefix: 'G4-上',
    name: '义务教育教科书·英语（PEP）（三年级起点）四年级上册',
    shortName: '人教PEP 四上',
    publisher: '人民教育出版社',
    grade: '四年级',
    term: '上册',
    startLevel: '三年级起点',
    pages: 82,
    units: 6,
    fetchedAt: '2026-11-09',
    source: {
      site: 'https://englishanchor.online/downloads/textbooks/',
      dataset: 'RainPPR/china-textbook-2021-hf',
      file: '小学/英语/人教版（PEP）（三年级起点）（主编：吴欣）/义务教育教科书·英语（PEP）（三年级起点）四年级上册.pdf',
      method: 'PyMuPDF 文本层抽取 + 附录词表人工校对'
    },
    // 全册通用允许词表：字面不在某单元词表，但不应判超纲（出题手册 6.7）
    allowedFunctionWords: [
      'a', 'an', 'the', 'is', 'are', 'am', 'be', 'this', 'that', 'these', 'those',
      'it', 'its', 'he', 'she', 'him', 'his', 'her', 'we', 'our', 'i', 'you', 'your',
      'my', 'me', 'they', 'them', 'their', 'in', 'on', 'at', 'to', 'of', 'and', 'or',
      'but', 'with', 'for', 'from', 'under', 'near', 'many', 'some', 'any', 'no',
      'not', 'yes', 'please', 'thanks', 'thank', 'now', 'look', 'let', 'let\'s',
      'where', 'what', 'who', 'how', 'here', 'there', 'can', 'do', 'does', 'have',
      'has', 'like', 'would', 'very', 'too', 'oh', 'hi', 'hello', 'good', 'nice'
    ]
  };

  BOOK.units = [
    {
      id: 'U1',
      no: 1,
      hostUnitId: 'G4-上-U1',
      title: 'My classroom',
      titleZh: '我的教室',
      pages: '2–11',
      topicDomain: '学校',
      functions: ['询问物品位置', '教室物品名称', '提出打扫建议'],
      words: [
        { en: 'classroom', zh: '教室', p: 5 },
        { en: 'window', zh: '窗户', p: 5 },
        { en: 'door', zh: '门', p: 5 },
        { en: 'picture', zh: '图画', p: 5 },
        { en: 'light', zh: '电灯', p: 5 },
        { en: 'blackboard', zh: '黑板', p: 5 },
        { en: 'computer', zh: '计算机', p: 8 },
        { en: 'fan', zh: '风扇', p: 8 },
        { en: 'wall', zh: '墙', p: 8 },
        { en: 'floor', zh: '地板', p: 8 },
        { en: "teacher's desk", zh: '讲台', p: 8 },
        { en: 'clean', zh: '打扫', p: 7 },
        { en: 'help', zh: '帮助', p: 7 },
        { en: 'near', zh: '在…附近', p: 4 },
        { en: 'open', zh: '打开', p: 5 },
        { en: 'close', zh: '关闭', p: 5 },
        { en: 'turn on', zh: '打开（电器）', p: 5 },
        { en: 'put up', zh: '挂起', p: 5 }
      ],
      sentencePatterns: [
        "Where is it? — It's near the window.",
        "What's in the classroom? — One blackboard, one TV, many desks and chairs.",
        "Let's clean the classroom! — OK.",
        "Let me clean the teacher's desk.",
        'Let me help you. — Thank you.',
        'Open the door. / Close the window. / Turn on the light. / Put up the picture.'
      ],
      phonics: {
        focus: 'a 与 a-e',
        note: '同一个字母 a，开音节读字母音，闭音节读短音',
        pairs: [['cat', 'cake'], ['dad', 'date'], ['hat', 'hate'], ['fat', 'face']],
        extras: ['name', 'make']
      }
    },
    {
      id: 'U2',
      no: 2,
      hostUnitId: 'G4-上-U2',
      title: 'My schoolbag',
      titleZh: '我的书包',
      pages: '12–21',
      topicDomain: '学校',
      functions: ['询问书包里有什么', '询问并描述颜色', '遗失与寻找物品'],
      words: [
        { en: 'schoolbag', zh: '书包', p: 13 },
        { en: 'maths book', zh: '数学书', p: 15 },
        { en: 'English book', zh: '英语书', p: 15 },
        { en: 'Chinese book', zh: '语文书', p: 15 },
        { en: 'storybook', zh: '故事书', p: 15 },
        { en: 'pencil box', zh: '铅笔盒', p: 15 },
        { en: 'eraser', zh: '橡皮', p: 15 },
        { en: 'notebook', zh: '笔记本', p: 18 },
        { en: 'candy', zh: '糖果', p: 18 },
        { en: 'toy', zh: '玩具', p: 18 },
        { en: 'key', zh: '钥匙', p: 18 },
        { en: 'lost', zh: '丢失', p: 17 },
        { en: 'heavy', zh: '重的', p: 13 },
        { en: 'colour', zh: '颜色', p: 17 },
        { en: 'cute', zh: '可爱的', p: 19 },
        { en: 'put', zh: '放', p: 15 }
      ],
      sentencePatterns: [
        "What's in your schoolbag? — An English book, a maths book and three storybooks.",
        'What colour is it? — It\'s blue and white.',
        'I lost my schoolbag. — Excuse me.',
        'May I see it? — Here it is!',
        'Put your pencil box on your English book.'
      ],
      phonics: {
        focus: 'i 与 i-e',
        note: 'i 的短音与字母音，靠词尾 e 区分',
        pairs: [['big', 'fine'], ['six', 'nice'], ['pig', 'ice'], ['kit', 'kite']],
        extras: ['like', 'nine', 'five', 'rice']
      }
    },
    {
      id: 'U3',
      no: 3,
      hostUnitId: 'G4-上-U3',
      title: 'My friends',
      titleZh: '我的朋友',
      pages: '22–31',
      topicDomain: '学校',
      functions: ['描述外貌与性格', '用 has 描述特征', '猜人'],
      words: [
        { en: 'friend', zh: '朋友', p: 23 },
        { en: 'tall', zh: '高的', p: 25 },
        { en: 'short', zh: '矮的；短的', p: 25 },
        { en: 'thin', zh: '瘦的', p: 25 },
        { en: 'strong', zh: '强壮的', p: 25 },
        { en: 'quiet', zh: '安静的', p: 25 },
        { en: 'friendly', zh: '友好的', p: 25 },
        { en: 'long hair', zh: '长头发', p: 28 },
        { en: 'short hair', zh: '短头发', p: 28 },
        { en: 'glasses', zh: '眼镜', p: 28 },
        { en: 'shoes', zh: '鞋', p: 28 },
        { en: 'hat', zh: '（带檐的）帽子', p: 29 },
        { en: 'his', zh: '他的', p: 24 },
        { en: 'her', zh: '她的', p: 29 },
        { en: 'name', zh: '名字', p: 23 },
        { en: 'right', zh: '正确的', p: 27 }
      ],
      sentencePatterns: [
        "Who is he? — He's tall and strong.",
        'He has glasses and his shoes are blue.',
        "What's his name? — His name is ...",
        "Is he Wu Binbin? — Yes. You're right.",
        'My friend has blue glasses.'
      ],
      phonics: {
        focus: 'o 与 o-e',
        note: 'o 的短音与字母音，靠词尾 e 区分',
        pairs: [['not', 'note'], ['hot', 'hope'], ['home', 'box'], ['nose', 'rose']],
        extras: ['Coke', 'Jones', 'lost']
      }
    },
    {
      id: 'U4',
      no: 4,
      hostUnitId: 'G4-上-U4',
      title: 'My home',
      titleZh: '我的家',
      pages: '36–45',
      topicDomain: '家庭',
      functions: ['询问人或物在哪里', '房间名称', '单复数提问与回答'],
      words: [
        { en: 'home', zh: '家', p: 37 },
        { en: 'room', zh: '房间', p: 42 },
        { en: 'bedroom', zh: '卧室', p: 39 },
        { en: 'living room', zh: '客厅；起居室', p: 39 },
        { en: 'study', zh: '书房', p: 39 },
        { en: 'kitchen', zh: '厨房', p: 39 },
        { en: 'bathroom', zh: '浴室；洗手间', p: 39 },
        { en: 'bed', zh: '床', p: 42 },
        { en: 'phone', zh: '电话', p: 42 },
        { en: 'table', zh: '桌子', p: 42 },
        { en: 'sofa', zh: '长沙发', p: 42 },
        { en: 'fridge', zh: '冰箱', p: 42 },
        { en: 'find', zh: '找到', p: 43 },
        { en: 'them', zh: '他（她、它）们', p: 43 }
      ],
      sentencePatterns: [
        "Where is she? — Is she in the study? — No, she isn't.",
        'Where are the keys? — Are they on the table? — Yes, they are.',
        "They're in the door.",
        'Open the door, please.',
        'Go to the living room. Watch TV.'
      ],
      phonics: {
        focus: 'u 与 u-e',
        note: 'u 的短音与字母音',
        pairs: [['us', 'use'], ['cut', 'cute'], ['excuse', 'us']],
        extras: ['cute', 'excuse', 'use']
      }
    },
    {
      id: 'U5',
      no: 5,
      hostUnitId: 'G4-上-U5',
      title: "Dinner's ready",
      titleZh: '晚餐准备好了',
      pages: '46–55',
      topicDomain: '食物饮料',
      functions: ['表达想吃的东西', '礼貌请求与应答', '餐具名称'],
      words: [
        { en: 'beef', zh: '牛肉', p: 49 },
        { en: 'chicken', zh: '鸡肉', p: 49 },
        { en: 'noodles', zh: '面条', p: 49 },
        { en: 'soup', zh: '汤', p: 49 },
        { en: 'vegetable', zh: '蔬菜', p: 49 },
        { en: 'bread', zh: '面包', p: 48 },
        { en: 'rice', zh: '米饭', p: 48 },
        { en: 'fish', zh: '鱼', p: 48 },
        { en: 'juice', zh: '果汁', p: 49 },
        { en: 'milk', zh: '牛奶', p: 49 },
        { en: 'bowl', zh: '碗', p: 52 },
        { en: 'fork', zh: '餐叉', p: 52 },
        { en: 'knife', zh: '刀', p: 52 },
        { en: 'spoon', zh: '勺', p: 52 },
        { en: 'chopsticks', zh: '筷子', p: 52 },
        { en: 'dinner', zh: '（中午或晚上吃的）正餐', p: 48 },
        { en: 'ready', zh: '准备好', p: 48 },
        { en: 'hungry', zh: '饥饿的', p: 48 },
        { en: 'help yourself', zh: '为（自己）取用', p: 51 },
        { en: 'pass', zh: '给；递', p: 52 },
        { en: 'try', zh: '试；尝试', p: 53 },
        { en: 'yuan', zh: '元（人民币）', p: 49 }
      ],
      sentencePatterns: [
        "What would you like? — I'd like some beef.",
        "What's for dinner? — Some fish and vegetables, please.",
        'Would you like a knife and fork? — No, thanks. I can use chopsticks.',
        'Help yourself.',
        'Pass me the bowl.'
      ],
      phonics: {
        focus: 'e 与 -e-',
        note: '词尾不发音的 e 与中间的 e 读音不同',
        pairs: [['bed', 'be'], ['red', 'we'], ['pencil', 'me'], ['get', 'she']],
        extras: ['he', 'me', 'she', 'we']
      }
    },
    {
      id: 'U6',
      no: 6,
      hostUnitId: 'G4-上-U6',
      title: 'Meet my family!',
      titleZh: '见见我的家人',
      pages: '56–65',
      topicDomain: '家庭',
      functions: ['家庭成员称呼', '询问职业', '询问家庭人数'],
      words: [
        { en: 'family', zh: '家庭', p: 57 },
        { en: 'parents', zh: '父母', p: 59 },
        { en: 'uncle', zh: '舅父；叔父；伯父', p: 59 },
        { en: 'aunt', zh: '姑母；姨母', p: 59 },
        { en: 'cousin', zh: '同辈表亲（或堂亲）', p: 59 },
        { en: 'baby brother', zh: '婴儿小弟弟', p: 59 },
        { en: 'puppy', zh: '小狗', p: 58 },
        { en: 'people', zh: '人们', p: 58 },
        { en: 'little', zh: '小的', p: 58 },
        { en: 'job', zh: '工作', p: 62 },
        { en: 'doctor', zh: '医生', p: 62 },
        { en: 'cook', zh: '厨师', p: 62 },
        { en: 'driver', zh: '司机', p: 62 },
        { en: 'farmer', zh: '农民', p: 62 },
        { en: 'nurse', zh: '护士', p: 62 },
        { en: 'football player', zh: '足球运动员', p: 61 },
        { en: 'basketball', zh: '篮球', p: 63 },
        { en: 'photo', zh: '照片', p: 65 }
      ],
      sentencePatterns: [
        'How many people are there in your family? — Three.',
        'My family has six people.',
        "What's your father's job? — He's a doctor.",
        'Is this your mother? — Yes, it is.',
        "This is my uncle. He's tall and strong."
      ],
      phonics: {
        focus: 'a / e / i / o / u 长短音复习',
        note: '本册最后一个 Let\'s spell：五个元音字母的开闭音节对比',
        pairs: [['face', 'rice'], ['me', 'he'], ['six', 'leg'], ['use', 'us'], ['hot', 'nose']],
        extras: ['had', 'hid', 'make', 'Mike', 'case', 'cat', 'man', 'mum']
      }
    }
  ];

  // 复习单元不单独建词表：内容为 U1–U3 / U4–U6 的复现，出题时按教学单元取词
  BOOK.reviews = [
    { id: 'R1', title: 'Recycle 1', pages: '32–35', covers: ['U1', 'U2', 'U3'] },
    { id: 'R2', title: 'Recycle 2', pages: '66–69', covers: ['U4', 'U5', 'U6'] }
  ];

  BOOK.getUnit = function (unitId) {
    return BOOK.units.filter(function (u) { return u.id === unitId; })[0] || null;
  };

  BOOK.unitIds = function () {
    return BOOK.units.map(function (u) { return u.id; });
  };

  // 全册词汇（跨单元查重用；同一词可能在两单元复现）
  BOOK.allWords = function () {
    const seen = {};
    BOOK.units.forEach(function (u) {
      u.words.forEach(function (w) {
        const k = w.en.toLowerCase();
        if (!seen[k]) seen[k] = { en: w.en, zh: w.zh, units: [] };
        seen[k].units.push(u.id);
      });
    });
    return Object.keys(seen).map(function (k) { return seen[k]; });
  };

  // 超纲判定：词形是否在本单元词表内（功能词白名单由调用方另行放行）
  BOOK.isInUnit = function (word, unitId) {
    const u = BOOK.getUnit(unitId);
    if (!u) return false;
    const k = String(word || '').toLowerCase().trim();
    if (BOOK.meta.allowedFunctionWords.indexOf(k) >= 0) return true;
    return u.words.some(function (w) { return w.en.toLowerCase() === k; });
  };

  BOOK.meta.kind = 'primary-english';
  BOOK.meta.notes = '词表取自书后附录 Words in each unit，逐条校对过页码；音标未收录（PDF 嵌入字体抽取为乱码）。';

  root.SHT_BOOK = BOOK;
  root.SHT.BOOKS.register(BOOK);
})(window);
