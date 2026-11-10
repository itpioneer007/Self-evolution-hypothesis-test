/*
 * 教材知识库：河北教育出版社《英语》四年级上册（三年级起点）
 *
 * 来源（2026-11-10 抓取）：
 *   索引  https://media.englishanchor.online/ChinaTextbook-hf/search.json
 *   文件  Hugging Face 数据集 RainPPR/china-textbook-2021-hf
 *         小学/英语/冀教版（三年级起点）/义务教育教科书·英语（三年级起点）四年级上册.pdf（84 页）
 *   抓取  hf-mirror.com（huggingface.co 直连不稳定，media CDN 不代理 PDF）
 *
 * 抽取方式：PyMuPDF 取文本层 → 书后 Words in Each Unit（p.65–66）全角字符
 * NFKC 归一化 → 按页码切单元 → 逐条校对。中文释义来自原书，未改写。
 * 词表带书上印刷页码 p。
 *
 * 与 PEP 四上的差异（这正是「按版本出题」要的东西）：
 *   - 只有 4 个单元（每单元 6 课），PEP 是 6 个单元
 *   - 单元是主题式（衣物 / 在家 / 出行 / 购物），不是场景式
 *   - 没有 Let's spell 板块，语音点为空 → 辨音题在本册出不了，变体会退回错题
 */
(function (root) {
  const SHT = (root.SHT = root.SHT || {});

  const BOOK = {
    meta: {
      id: 'HEB-G4A',
      kind: 'primary-english',
      hostPrefix: 'HEB4-上',
      name: '义务教育教科书·英语（三年级起点）四年级上册',
      shortName: '冀教版 四上',
      publisher: '河北教育出版社',
      grade: '四年级',
      term: '上册',
      startLevel: '三年级起点',
      pages: 84,
      units: 4,
      fetchedAt: '2026-11-10',
      source: {
        site: 'https://englishanchor.online/downloads/textbooks/',
        dataset: 'RainPPR/china-textbook-2021-hf',
        file: '小学/英语/冀教版（三年级起点）/义务教育教科书·英语（三年级起点）四年级上册.pdf',
        method: 'PyMuPDF 文本层 + Words in Each Unit 全角归一化解析'
      },
      notes: '本册无语音板块，phonics 留空；出「字母组合辨音」时会因无可取材而退回错题，这是真实边界。',
      allowedFunctionWords: [
        'a', 'an', 'the', 'is', 'are', 'am', 'be', 'this', 'that', 'these', 'those',
        'it', 'its', 'he', 'she', 'him', 'his', 'her', 'we', 'our', 'i', 'you', 'your',
        'my', 'me', 'they', 'them', 'their', 'in', 'on', 'at', 'to', 'of', 'and', 'or',
        'but', 'with', 'for', 'from', 'under', 'near', 'by', 'many', 'some', 'any', 'no',
        'not', 'yes', 'please', 'thanks', 'thank', 'now', 'look', 'let', "let's",
        'where', 'what', 'who', 'whose', 'how', 'here', 'there', 'can', 'do', 'does', 'have',
        'has', 'like', 'would', 'very', 'too', 'oh', 'hi', 'hello', 'good', 'nice',
        'go', 'straight', 'turn', 'left', 'right', 'far', 'much', 'want', 'buy'
      ]
    },
    units: [
    {
      id: "U1", no: 1, hostUnitId: "HEB4-上-U1",
      title: "The Clothes We Wear", titleZh: "我们穿的衣服", pages: "1–16",
      topicDomain: "服装",
      functions: ["说出衣物名称", "描述衣物颜色", "说明谁穿着什么"],
      words: [
        { en: "shirt", zh: "（尤指男式的）衬衫", p: 1 },
        { en: "skirt", zh: "裙子", p: 1 },
        { en: "trousers", zh: "裤子", p: 1 },
        { en: "sweater", zh: "毛衣，线衣", p: 1 },
        { en: "this", zh: "这，这个", p: 1 },
        { en: "these", zh: "这些", p: 1 },
        { en: "is", zh: "是（用于he，she，it及单数可数名词和不可数名词后）", p: 2 },
        { en: "are", zh: "是（用于we，you，they及复数名词后）", p: 2 },
        { en: "new", zh: "新的", p: 2 },
        { en: "old", zh: "旧的；年老的；…岁的", p: 2 },
        { en: "it", zh: "它", p: 2 },
        { en: "they", zh: "他们；她们；它们", p: 2 },
        { en: "coat", zh: "大衣；外套", p: 3 },
        { en: "cap", zh: "（有帽舌的）帽子", p: 3 },
        { en: "Miss", zh: "小姐，女士（用于未婚女子姓氏或姓名前，以示礼貌）", p: 3 },
        { en: "dress", zh: "连衣裙", p: 4 },
        { en: "shoe", zh: "鞋", p: 4 },
        { en: "sock", zh: "短袜", p: 4 },
        { en: "shorts", zh: "短裤（复数）", p: 4 },
        { en: "not", zh: "不是；不，没", p: 4 },
        { en: "day", zh: "一天；一日", p: 5 },
        { en: "today", zh: "今天", p: 5 },
        { en: "week", zh: "星期", p: 5 },
      ],
      sentencePatterns: [
        "This is a red skirt.",
        "These are trousers.",
        "They're black.",
        "Yellow is my favourite colour.",
        "What is he wearing? — He is wearing a green sweater.",
        "She is wearing a yellow T-shirt.",
        "Is this your cap? — Yes, it is.",
      ],
      phonics: { focus: '', pairs: [], extras: [] },
      note: "词表取自书后 Words in Each Unit（p.65–66），带书上页码；本册无 Let's spell 板块，语音点未收。"
    },
    {
      id: "U2", no: 2, hostUnitId: "HEB4-上-U2",
      title: "At Home", titleZh: "在家里", pages: "17–32",
      topicDomain: "家庭",
      functions: ["说在家里做什么", "说早晚的日常活动", "说周末做什么"],
      words: [
        { en: "do", zh: "做，干，办（某事）；无词义（用于第一、二人称主语，构成否定句、疑问句等的助动词）", p: 7 },
        { en: "my", zh: "我的", p: 7 },
        { en: "homework", zh: "家庭作业", p: 7 },
        { en: "read", zh: "读；阅读", p: 7 },
        { en: "book", zh: "书", p: 7 },
        { en: "watch", zh: "看；注视", p: 8 },
        { en: "TV", zh: "电视；电视机", p: 8 },
        { en: "bed", zh: "床", p: 9 },
        { en: "clean", zh: "打扫；干净的", p: 9 },
        { en: "listen", zh: "（注意地）听", p: 9 },
        { en: "listen to", zh: "（注意地）听；倾听", p: 9 },
        { en: "wash", zh: "洗；洗涤", p: 10 },
        { en: "face", zh: "脸；面", p: 10 },
        { en: "toy", zh: "玩具", p: 11 },
        { en: "ball", zh: "球", p: 11 },
        { en: "kite", zh: "风筝", p: 11 },
        { en: "fly", zh: "放飞；飞", p: 11 },
        { en: "play", zh: "玩；做游戏", p: 11 },
        { en: "with", zh: "和…在一起；同，跟", p: 11 },
        { en: "play with", zh: "拿…玩；和…一起玩", p: 11 },
      ],
      sentencePatterns: [
        "What do you do in the evening? — I do my homework.",
        "In the evening, I read a book.",
        "I draw a picture for my story.",
        "What do you do in the morning? — I brush my teeth.",
        "I wash my face and make my bed.",
        "I help my mum and dad.",
        "What do you do on Saturday? — I play with my friends.",
      ],
      phonics: { focus: '', pairs: [], extras: [] },
      note: "词表取自书后 Words in Each Unit（p.65–66），带书上页码；本册无 Let's spell 板块，语音点未收。"
    },
    {
      id: "U3", no: 3, hostUnitId: "HEB4-上-U3",
      title: "Let's Go!", titleZh: "出发吧", pages: "33–48",
      topicDomain: "学校与出行",
      functions: ["说学校场所位置", "问路与指路", "说怎么去上学"],
      words: [
        { en: "school", zh: "学校；上课（或上学）时间", p: 13 },
        { en: "classroom", zh: "教室", p: 13 },
        { en: "library", zh: "图书馆", p: 13 },
        { en: "playground", zh: "操场；游乐场", p: 13 },
        { en: "where", zh: "在哪里；到哪里", p: 13 },
        { en: "near", zh: "在…附近", p: 14 },
        { en: "far", zh: "远的；遥远的", p: 14 },
        { en: "from", zh: "从…来；离…", p: 14 },
        { en: "far from", zh: "离…远", p: 14 },
        { en: "the", zh: "这（那）个；这（那）些", p: 14 },
        { en: "street", zh: "街道", p: 15 },
        { en: "bike", zh: "自行车", p: 16 },
        { en: "taxi", zh: "出租汽车", p: 16 },
        { en: "car", zh: "小汽车；轿车", p: 16 },
        { en: "bus", zh: "公共汽车", p: 16 },
        { en: "thirty", zh: "三十", p: 16 },
        { en: "light", zh: "灯", p: 17 },
        { en: "red", zh: "红色；红色的", p: 17 },
        { en: "yellow", zh: "黄色；黄色的", p: 17 },
        { en: "green", zh: "绿色；绿色的", p: 17 },
      ],
      sentencePatterns: [
        "This is my school.",
        "Where's the computer room? — I can show you. Here it is.",
        "Is the library far from here? — No, it is near.",
        "Where is the zoo? — Go straight and turn left.",
        "How do you go to school? — I go to school by bus.",
      ],
      phonics: { focus: '', pairs: [], extras: [] },
      note: "词表取自书后 Words in Each Unit（p.65–66），带书上页码；本册无 Let's spell 板块，语音点未收。"
    },
    {
      id: "U4", no: 4, hostUnitId: "HEB4-上-U4",
      title: "Shopping in the City", titleZh: "在城市购物", pages: "49–64",
      topicDomain: "购物",
      functions: ["提出购物建议", "说想买什么", "问路去商店"],
      words: [
        { en: "shop", zh: "商店；购物", p: 19 },
        { en: "go", zh: "出发，离去；行走；去；开始", p: 19 },
        { en: "go shopping", zh: "购物", p: 19 },
        { en: "want", zh: "想要", p: 20 },
        { en: "to", zh: "朝…，向…；无词义（与动词原形一起构成不定式）", p: 20 },
        { en: "buy", zh: "买", p: 20 },
        { en: "way", zh: "方向；方式；方法；道路", p: 20 },
        { en: "cinema", zh: "电影院", p: 21 },
        { en: "park", zh: "公园", p: 21 },
        { en: "supermarket", zh: "超市", p: 21 },
        { en: "tomato", zh: "西红柿", p: 22 },
        { en: "potato", zh: "马铃薯，土豆", p: 22 },
        { en: "bag", zh: "包；袋", p: 22 },
        { en: "let's", zh: "让我们……（提出建议时用）", p: 19 },
      ],
      sentencePatterns: [
        "Let's go shopping.",
        "I want to buy a cap.",
        "What do you want to buy? — I want to buy a bag.",
        "How much is it?",
        "Where is the cinema? — It's near the park.",
      ],
      phonics: { focus: '', pairs: [], extras: [] },
      note: "词表取自书后 Words in Each Unit（p.65–66），带书上页码；本册无 Let's spell 板块，语音点未收。"
    }
    ]
  };

  SHT.BOOKS.register(BOOK);
})(window);
