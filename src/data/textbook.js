/*
 * 四上课程数据：唯一课程源为 D:/English/C端产品内容设计.xlsx 的「四上 单元内容」表。
 * 只保留这套课程的 U1–U10；其他教材版本、其他单元和旧示例内容已移除。
 * 每个单元包含：words / sentencePatterns / passage / phonics。
 */
(function (root) {
  const BOOK = (root.SHT_BOOK = root.SHT_BOOK || {});
  const DATA = {
  "meta": {
    "id": "COURSE-G4A",
    "hostPrefix": "G4-上",
    "name": "四上课程大纲与学习内容",
    "shortName": "四上课程",
    "publisher": "C端产品内容设计",
    "grade": "四年级",
    "term": "上册",
    "startLevel": "课程大纲",
    "pages": null,
    "units": 10,
    "fetchedAt": "2026-11-18",
    "source": {
      "workbook": "C端产品内容设计.xlsx",
      "sheet": "四上 单元内容",
      "method": "按单元抽取单词、句型、课文与自然拼读栏"
    },
    "allowedFunctionWords": [
      "a",
      "an",
      "the",
      "is",
      "are",
      "am",
      "be",
      "this",
      "that",
      "these",
      "those",
      "it",
      "its",
      "he",
      "she",
      "him",
      "his",
      "her",
      "we",
      "our",
      "i",
      "you",
      "your",
      "my",
      "me",
      "they",
      "them",
      "their",
      "in",
      "on",
      "at",
      "to",
      "of",
      "and",
      "or",
      "but",
      "with",
      "for",
      "from",
      "under",
      "near",
      "many",
      "some",
      "any",
      "no",
      "not",
      "yes",
      "please",
      "thanks",
      "thank",
      "welcome",
      "sorry",
      "ok",
      "now",
      "look",
      "let",
      "let's",
      "where",
      "what",
      "who",
      "whose",
      "how",
      "here",
      "there",
      "can",
      "can't",
      "cannot",
      "do",
      "does",
      "don't",
      "have",
      "has",
      "like",
      "would",
      "very",
      "too",
      "oh",
      "hi",
      "hello",
      "good",
      "nice",
      "time",
      "school",
      "class",
      "family",
      "job",
      "want",
      "tiger",
      "lion",
      "panda",
      "monkey",
      "animal",
      "book",
      "room",
      "home",
      "card"
    ]
  },
  "units": [
    {
      "id": "U1",
      "no": 1,
      "hostUnitId": "G4-上-U1",
      "title": "This is our school",
      "titleZh": "我的学校",
      "pages": "",
      "topicDomain": "学校",
      "functions": [
        "介绍学校场所",
        "使用 This is / That is",
        "用 There is / There are 描述存在"
      ],
      "words": [
        {
          "en": "classroom",
          "zh": "教室",
          "p": 0
        },
        {
          "en": "playground",
          "zh": "操场",
          "p": 0
        },
        {
          "en": "library",
          "zh": "图书馆",
          "p": 0
        },
        {
          "en": "music room",
          "zh": "音乐教室",
          "p": 0
        },
        {
          "en": "art room",
          "zh": "美术教室",
          "p": 0
        },
        {
          "en": "computer",
          "zh": "电脑；计算机",
          "p": 0
        },
        {
          "en": "office",
          "zh": "办公室",
          "p": 0
        },
        {
          "en": "story",
          "zh": "故事",
          "p": 0
        },
        {
          "en": "a lot of",
          "zh": "许多",
          "p": 0
        },
        {
          "en": "and",
          "zh": "和；又；与",
          "p": 0
        },
        {
          "en": "canteen",
          "zh": "餐厅；食堂",
          "p": 0
        },
        {
          "en": "class",
          "zh": "（一节）课；上课时间",
          "p": 0
        },
        {
          "en": "colour",
          "zh": "给……上色",
          "p": 0
        },
        {
          "en": "desk",
          "zh": "书桌；办公桌",
          "p": 0
        },
        {
          "en": "eat",
          "zh": "吃",
          "p": 0
        },
        {
          "en": "fun",
          "zh": "乐趣",
          "p": 0
        },
        {
          "en": "garden",
          "zh": "花园",
          "p": 0
        },
        {
          "en": "grade",
          "zh": "年级",
          "p": 0
        },
        {
          "en": "lion",
          "zh": "狮子",
          "p": 0
        },
        {
          "en": "lunch",
          "zh": "午餐",
          "p": 0
        },
        {
          "en": "lunchtime",
          "zh": "午餐时间",
          "p": 0
        },
        {
          "en": "of",
          "zh": "……的",
          "p": 0
        },
        {
          "en": "on",
          "zh": "在……上面",
          "p": 0
        },
        {
          "en": "read",
          "zh": "阅读； 读",
          "p": 0
        },
        {
          "en": "together",
          "zh": "一起",
          "p": 0
        }
      ],
      "sentencePatterns": [
        "This is our school/classroom /library /playground/ music room /art room .",
        "This is (the)... That is (the) ...\n(This is the playground.\nThat is the music room.\nThis is the teachers' office.\nThat is the classroom.\nThis is our shcool.\nThat is the art room.)",
        "There is ... There are ...\nThere is a library.There are many books.\nThere is a classroom. There are many desks.\nThere is a playground. There are many students."
      ],
      "passage": "A：Welcome to school!\n     This is our classroom.\n     That is the playground.\n     This is the library.\nB：Shh…\nA：It’s lunchtime. Let’s go and eat.",
      "phonics": {
        "focus": "自然拼读：lion, letter, line, light",
        "note": "来自课程大纲自然拼读栏",
        "pairs": [
          [
            "lion",
            "letter"
          ],
          [
            "line",
            "light"
          ]
        ],
        "extras": [
          "lion",
          "letter",
          "line",
          "light"
        ]
      }
    },
    {
      "id": "U2",
      "no": 2,
      "hostUnitId": "G4-上-U2",
      "title": "What time do you get up?",
      "titleZh": "我的一天",
      "pages": "",
      "topicDomain": "日常生活",
      "functions": [
        "询问时间",
        "描述起床、吃饭、上学等日常安排",
        "使用 It’s time to / for"
      ],
      "words": [
        {
          "en": "up",
          "zh": "向上地",
          "p": 0
        },
        {
          "en": "get up",
          "zh": "起床",
          "p": 0
        },
        {
          "en": "at",
          "zh": "在；向",
          "p": 0
        },
        {
          "en": "early",
          "zh": "早的；早地",
          "p": 0
        },
        {
          "en": "breakfast",
          "zh": "早餐",
          "p": 0
        },
        {
          "en": "hurry",
          "zh": "赶紧",
          "p": 0
        },
        {
          "en": "half",
          "zh": "一半；半",
          "p": 0
        },
        {
          "en": "past",
          "zh": "在……之后",
          "p": 0
        },
        {
          "en": "lunch",
          "zh": "午餐",
          "p": 0
        },
        {
          "en": "dinner",
          "zh": "晚餐；正餐",
          "p": 0
        },
        {
          "en": "go to bed",
          "zh": "上床睡觉",
          "p": 0
        },
        {
          "en": "evening",
          "zh": "晚上；傍晚",
          "p": 0
        },
        {
          "en": "after",
          "zh": "在……之后",
          "p": 0
        },
        {
          "en": "alarm clock",
          "zh": "闹钟",
          "p": 0
        },
        {
          "en": "basketball",
          "zh": "篮球",
          "p": 0
        },
        {
          "en": "first(1st)",
          "zh": "第一；第一的",
          "p": 0
        },
        {
          "en": "from... to...",
          "zh": "从……到……",
          "p": 0
        },
        {
          "en": "guess",
          "zh": "猜",
          "p": 0
        },
        {
          "en": "home",
          "zh": "家；住所；窝",
          "p": 0
        },
        {
          "en": "Hurry up!",
          "zh": "快点！",
          "p": 0
        },
        {
          "en": "late",
          "zh": "迟的",
          "p": 0
        },
        {
          "en": "Monday",
          "zh": "星期一",
          "p": 0
        },
        {
          "en": "monkey",
          "zh": "猴子",
          "p": 0
        },
        {
          "en": "never",
          "zh": "从不",
          "p": 0
        },
        {
          "en": "September",
          "zh": "九月",
          "p": 0
        },
        {
          "en": "still",
          "zh": "还；仍然",
          "p": 0
        },
        {
          "en": "where",
          "zh": "在哪里",
          "p": 0
        }
      ],
      "sentencePatterns": [
        "— What time do you get up / have breakfast / go to school?\n    — I get up at 7:00. / I have breakfast at half past seven.",
        "It’s time to get up / go to school / go to bed.",
        "It’s time for breakfast / lunch / dinner."
      ],
      "passage": "A: What time do you get up?\nB: Hmm… I get up at 7:00. \nA: Look at the alarm clock.\nB:It’s still early.\nMum: It’s 7:30 now. It’s time to have breakfast.\nA:Hurry up!\nA&B: Bye, Mum.\nMum: Bye.",
      "phonics": {
        "focus": "自然拼读：milk, monkey, mango, moon",
        "note": "来自课程大纲自然拼读栏",
        "pairs": [
          [
            "milk",
            "monkey"
          ],
          [
            "mango",
            "moon"
          ]
        ],
        "extras": [
          "milk",
          "monkey",
          "mango",
          "moon"
        ]
      }
    },
    {
      "id": "U3",
      "no": 3,
      "hostUnitId": "G4-上-U3",
      "title": "I like dumplings",
      "titleZh": "食物",
      "pages": "",
      "topicDomain": "食物饮料",
      "functions": [
        "询问喜欢什么食物",
        "表达食物偏好",
        "使用 Do you like …? 问答"
      ],
      "words": [
        {
          "en": "dumpling",
          "zh": "水饺；汤圆",
          "p": 0
        },
        {
          "en": "rice",
          "zh": "米；米饭",
          "p": 0
        },
        {
          "en": "fish",
          "zh": "鱼肉；鱼；",
          "p": 0
        },
        {
          "en": "and",
          "zh": "和；又；与",
          "p": 0
        },
        {
          "en": "vegetable",
          "zh": "蔬菜",
          "p": 0
        },
        {
          "en": "bread",
          "zh": "面包",
          "p": 0
        },
        {
          "en": "chicken",
          "zh": "鸡肉；鸡",
          "p": 0
        },
        {
          "en": "hamburger",
          "zh": "汉堡包",
          "p": 0
        },
        {
          "en": "noodle (pl. noodles)",
          "zh": "面条",
          "p": 0
        },
        {
          "en": "has",
          "zh": "have的第三人称单数形式",
          "p": 0
        },
        {
          "en": "say",
          "zh": "说",
          "p": 0
        },
        {
          "en": "they",
          "zh": "他（她；它）们",
          "p": 0
        },
        {
          "en": "they're=they are",
          "zh": "他（她；它）们",
          "p": 0
        },
        {
          "en": "yummy",
          "zh": "美味的",
          "p": 0
        }
      ],
      "sentencePatterns": [
        "— What do you like?\n    — I like dumplings / rice / fish / vegetables/noodles/chicken.",
        "— Do you like hamburgers/bread?\n    — Yes, I do. / No, I don’t.",
        "I like chicken and potatoes/ I like bread and vegetables/ I like dumplings and noodles."
      ],
      "passage": "A：I’m hungry.\nB：Me too.\nA: I like dumplings.\nC: I like rice, fish and vegetables.\n    What do you like,Peter?\nB: I like bread, chicken and vegetables.\n    I like hamburgers.",
      "phonics": {
        "focus": "自然拼读：nose, night, nine, net",
        "note": "来自课程大纲自然拼读栏",
        "pairs": [
          [
            "nose",
            "night"
          ],
          [
            "nine",
            "net"
          ]
        ],
        "extras": [
          "nose",
          "night",
          "nine",
          "net"
        ]
      }
    },
    {
      "id": "U4",
      "no": 4,
      "hostUnitId": "G4-上-U4",
      "title": "Look at the elephant",
      "titleZh": "动物",
      "pages": "",
      "topicDomain": "动物",
      "functions": [
        "描述动物外形",
        "使用 Look at …",
        "用 Is it …? 猜测动物"
      ],
      "words": [
        {
          "en": "elephant",
          "zh": "大象",
          "p": 0
        },
        {
          "en": "tall",
          "zh": "高的",
          "p": 0
        },
        {
          "en": "lion",
          "zh": "狮子",
          "p": 0
        },
        {
          "en": "strong",
          "zh": "健壮的",
          "p": 0
        },
        {
          "en": "tiger",
          "zh": "老虎",
          "p": 0
        },
        {
          "en": "panda",
          "zh": "大熊猫",
          "p": 0
        },
        {
          "en": "cute",
          "zh": "漂亮的；逗人喜爱的",
          "p": 0
        },
        {
          "en": "monkey",
          "zh": "猴子",
          "p": 0
        },
        {
          "en": "funny",
          "zh": "使人发笑的；；有趣的",
          "p": 0
        },
        {
          "en": "beautiful",
          "zh": "美丽的；；优美的",
          "p": 0
        },
        {
          "en": "bear",
          "zh": "熊",
          "p": 0
        },
        {
          "en": "friend",
          "zh": "朋友",
          "p": 0
        },
        {
          "en": "cry",
          "zh": "哭；哭泣",
          "p": 0
        },
        {
          "en": "animal",
          "zh": "动物",
          "p": 0
        },
        {
          "en": "Australia",
          "zh": "澳大利亚",
          "p": 0
        },
        {
          "en": "China",
          "zh": "中国",
          "p": 0
        },
        {
          "en": "each other",
          "zh": "相互",
          "p": 0
        },
        {
          "en": "kangaroo",
          "zh": "袋鼠",
          "p": 0
        },
        {
          "en": "live",
          "zh": "住；居住",
          "p": 0
        },
        {
          "en": "photo",
          "zh": "照片",
          "p": 0
        },
        {
          "en": "right",
          "zh": "正确的",
          "p": 0
        },
        {
          "en": "tree",
          "zh": "树",
          "p": 0
        }
      ],
      "sentencePatterns": [
        "— Look at the elephant / panda / monkey.\n    — It’s big / small / strong / cute / funny / beautiful.",
        "— Is it a lion?\n    — No, it isn’t. It’s a tiger.",
        "— What's that?\n    — It's a mongkey.\n         It's a panda.     \n         It's a tiger.        \n         It's a bird."
      ],
      "passage": "Guide: Welcome!\nA: Look at the elephant.\nB: It's big and tall.\n    What’s that?\nC: Is it a lion?\nA: No, it isn’t. It’s a strong tiger.\nB: Look at the panda. It’s cute.\nA: I like pandas.\nC: I like monkeys. They’re funny.",
      "phonics": {
        "focus": "自然拼读：cold, rose, photo, phone",
        "note": "来自课程大纲自然拼读栏",
        "pairs": [
          [
            "cold",
            "rose"
          ],
          [
            "photo",
            "phone"
          ]
        ],
        "extras": [
          "cold",
          "rose",
          "photo",
          "phone"
        ]
      }
    },
    {
      "id": "U5",
      "no": 5,
      "hostUnitId": "G4-上-U5",
      "title": "Can you play basketball?",
      "titleZh": "能力与运动",
      "pages": "",
      "topicDomain": "运动与能力",
      "functions": [
        "询问会做什么",
        "使用 can / can’t",
        "描述运动能力"
      ],
      "words": [
        {
          "en": "can",
          "zh": "能；会",
          "p": 0
        },
        {
          "en": "basketball",
          "zh": "篮球",
          "p": 0
        },
        {
          "en": "jump",
          "zh": "跳；跃",
          "p": 0
        },
        {
          "en": "high",
          "zh": "高高地；高的",
          "p": 0
        },
        {
          "en": "well",
          "zh": "熟练地；令人满意地",
          "p": 0
        },
        {
          "en": "can't=cannot",
          "zh": "不能；不会",
          "p": 0
        },
        {
          "en": "swim",
          "zh": "游泳",
          "p": 0
        },
        {
          "en": "run",
          "zh": "跑；奔跑",
          "p": 0
        },
        {
          "en": "football",
          "zh": "足球",
          "p": 0
        },
        {
          "en": "ping-pong",
          "zh": "乒乓球",
          "p": 0
        },
        {
          "en": "fast",
          "zh": "快地；快的",
          "p": 0
        },
        {
          "en": "want",
          "zh": "想要",
          "p": 0
        },
        {
          "en": "far",
          "zh": "远地；远的",
          "p": 0
        },
        {
          "en": "fly",
          "zh": "飞；飞翔",
          "p": 0
        },
        {
          "en": "have a try",
          "zh": "试一试",
          "p": 0
        },
        {
          "en": "join",
          "zh": "加入",
          "p": 0
        },
        {
          "en": "rabbit",
          "zh": "兔子",
          "p": 0
        },
        {
          "en": "shot",
          "zh": "击球；射球",
          "p": 0
        },
        {
          "en": "talk",
          "zh": "交谈；说话",
          "p": 0
        },
        {
          "en": "with",
          "zh": "和……一起；具有；用",
          "p": 0
        },
        {
          "en": "write",
          "zh": "写；写作",
          "p": 0
        }
      ],
      "sentencePatterns": [
        "— Can you play basketball / football / ping-pong?\n    — Yes, I can. / No, I can’t.",
        "— Can you run fast / jump far / fly high?\n    — Yes, I can. / No, I can’t.",
        "— I can play basketball. I can't swim.  \n         I can sing. I can't dance.  \n         I can play ping-pong. I can't play yo-yo."
      ],
      "passage": "A: Look! Benny can jump high.\nB: Yes. He can play basketball well.\nA: Can you play basketball, Mingming?\nB: Yes, I can. \nC:Come and join us.\nA:I can’t play basketball.\nB: Have a try.\nA: OK.",
      "phonics": {
        "focus": "自然拼读：dolly, hot, socks, pot",
        "note": "来自课程大纲自然拼读栏",
        "pairs": [
          [
            "dolly",
            "hot"
          ],
          [
            "socks",
            "pot"
          ]
        ],
        "extras": [
          "dolly",
          "hot",
          "socks",
          "pot"
        ]
      }
    },
    {
      "id": "U6",
      "no": 6,
      "hostUnitId": "G4-上-U6",
      "title": "What are those?",
      "titleZh": "自然与花园",
      "pages": "",
      "topicDomain": "自然",
      "functions": [
        "使用 this/that/these/those",
        "描述近处和远处的动植物",
        "使用 There be 句型"
      ],
      "words": [
        {
          "en": "those",
          "zh": "那些",
          "p": 0
        },
        {
          "en": "these",
          "zh": "这些",
          "p": 0
        },
        {
          "en": "flower",
          "zh": "花",
          "p": 0
        },
        {
          "en": "they",
          "zh": "他（她；它）们",
          "p": 0
        },
        {
          "en": "they're=they are",
          "zh": "他（她；它）们",
          "p": 0
        },
        {
          "en": "tree",
          "zh": "树",
          "p": 0
        },
        {
          "en": "bee",
          "zh": "蜜蜂",
          "p": 0
        },
        {
          "en": "garden",
          "zh": "花园",
          "p": 0
        },
        {
          "en": "hill",
          "zh": "小山",
          "p": 0
        },
        {
          "en": "best",
          "zh": "最好的",
          "p": 0
        },
        {
          "en": "have a look",
          "zh": "看一看",
          "p": 0
        },
        {
          "en": "into",
          "zh": "到……里面；朝；向",
          "p": 0
        },
        {
          "en": "maybe",
          "zh": "也许",
          "p": 0
        },
        {
          "en": "outing",
          "zh": "短途旅游",
          "p": 0
        },
        {
          "en": "river",
          "zh": "河流； 江",
          "p": 0
        },
        {
          "en": "seed",
          "zh": "种子",
          "p": 0
        },
        {
          "en": "wind",
          "zh": "风",
          "p": 0
        }
      ],
      "sentencePatterns": [
        "What’s this? / What’s that?\nIt’s a/an bee/fish/apple/egg.\nWhat are these? / What are those?\nThey’re flowers/birds/fish/trees.",
        "This/That is a(an)...",
        "These/Those're ..."
      ],
      "passage": "A: Look at these flowers. \nB: They’re beautiful.\nBirds: Tweet, tweet!\nA: What are those?\nB: They’re birds. They live in the trees.\nA: Look! Those are kites. \nB: They look like birds.",
      "phonics": {
        "focus": "自然拼读：panda, paper, pear, potato",
        "note": "来自课程大纲自然拼读栏",
        "pairs": [
          [
            "panda",
            "paper"
          ],
          [
            "pear",
            "potato"
          ]
        ],
        "extras": [
          "panda",
          "paper",
          "pear",
          "potato"
        ]
      }
    },
    {
      "id": "U7",
      "no": 7,
      "hostUnitId": "G4-上-U7",
      "title": "Whose watch is this?",
      "titleZh": "我的物品",
      "pages": "",
      "topicDomain": "物品与归属",
      "functions": [
        "询问物品归属",
        "使用 Whose …?",
        "使用物主代词"
      ],
      "words": [
        {
          "en": "whose",
          "zh": "谁的",
          "p": 0
        },
        {
          "en": "know",
          "zh": "知道",
          "p": 0
        },
        {
          "en": "bag",
          "zh": "包",
          "p": 0
        },
        {
          "en": "key",
          "zh": "钥匙",
          "p": 0
        },
        {
          "en": "umbrella",
          "zh": "雨伞",
          "p": 0
        },
        {
          "en": "their",
          "zh": "他（她；它）们的",
          "p": 0
        },
        {
          "en": "wear",
          "zh": "穿；戴",
          "p": 0
        },
        {
          "en": "be",
          "zh": "成为；是",
          "p": 0
        },
        {
          "en": "pet",
          "zh": "宠物",
          "p": 0
        },
        {
          "en": "quiet",
          "zh": "安静的",
          "p": 0
        },
        {
          "en": "strange",
          "zh": "奇怪的",
          "p": 0
        },
        {
          "en": "watch",
          "zh": "手表",
          "p": 0
        },
        {
          "en": "zip",
          "zh": "拉上……拉链",
          "p": 0
        }
      ],
      "sentencePatterns": [
        "Whose watch/key/umbrella is this? It's Tom’s watch/Miss Li’s key/Benny's umbrella.",
        "Is this your watch/key/umbrella? Yes, it is./No, it isn't.",
        "Whose ... are they?\nThey are ..."
      ],
      "passage": "A: Whose watch is this?\nB: I don’t know.\n     That's Jerry‘s.\nA: Hi, Jerry. Is this your watch?\nC: Yes, it is. Thank you.\nB: Zip your bag, please.\nC: OK.Goodbye.\nA&B: Bye.",
      "phonics": {
        "focus": "自然拼读：queen, quiet, quilt, quarter",
        "note": "来自课程大纲自然拼读栏",
        "pairs": [
          [
            "queen",
            "quiet"
          ],
          [
            "quilt",
            "quarter"
          ]
        ],
        "extras": [
          "queen",
          "quiet",
          "quilt",
          "quarter"
        ]
      }
    },
    {
      "id": "U8",
      "no": 8,
      "hostUnitId": "G4-上-U8",
      "title": "Don't talk in the library",
      "titleZh": "规则",
      "pages": "",
      "topicDomain": "学校与公共规则",
      "functions": [
        "使用 Don’t …",
        "表达图书馆和课堂规则",
        "理解祈使句"
      ],
      "words": [
        {
          "en": "talk",
          "zh": "交谈；说话",
          "p": 0
        },
        {
          "en": "take",
          "zh": "带",
          "p": 0
        },
        {
          "en": "write",
          "zh": "写；写作",
          "p": 0
        },
        {
          "en": "eat",
          "zh": "吃",
          "p": 0
        },
        {
          "en": "late",
          "zh": "迟的",
          "p": 0
        },
        {
          "en": "class",
          "zh": "（一节）课；上课时间",
          "p": 0
        },
        {
          "en": "wall",
          "zh": "墙；墙壁",
          "p": 0
        },
        {
          "en": "litter",
          "zh": "乱扔垃圾",
          "p": 0
        },
        {
          "en": "say",
          "zh": "说",
          "p": 0
        },
        {
          "en": "word",
          "zh": "单词；词",
          "p": 0
        },
        {
          "en": "down",
          "zh": "向下；往下",
          "p": 0
        },
        {
          "en": "of",
          "zh": "……的",
          "p": 0
        },
        {
          "en": "always",
          "zh": "总是",
          "p": 0
        },
        {
          "en": "film",
          "zh": "电影",
          "p": 0
        },
        {
          "en": "interesting",
          "zh": "有趣的",
          "p": 0
        },
        {
          "en": "magic",
          "zh": "有魔力的；神奇的",
          "p": 0
        },
        {
          "en": "reading room",
          "zh": "阅览室",
          "p": 0
        },
        {
          "en": "really",
          "zh": "确实；的确",
          "p": 0
        },
        {
          "en": "rule",
          "zh": "规则",
          "p": 0
        },
        {
          "en": "sunshine",
          "zh": "阳光",
          "p": 0
        }
      ],
      "sentencePatterns": [
        "Don’t talk in the library.",
        "Don’t write on the book.",
        "Don’t eat in the library.",
        "Don’t eat in class.",
        "Don’t be late for school.",
        "Don’t litter."
      ],
      "passage": "Liling takes Dongdong to the library.\nThey are in the reading room.\n\nA: Ha-ha, it’s interesting.\nB: Shh! Don’t talk here.\nA: Don’t write on the book.\nB: I’m sorry.\nA: Don’t eat in the library.\nB: OK.",
      "phonics": {
        "focus": "自然拼读：red, robot, run, rope",
        "note": "来自课程大纲自然拼读栏",
        "pairs": [
          [
            "red",
            "robot"
          ],
          [
            "run",
            "rope"
          ]
        ],
        "extras": [
          "red",
          "robot",
          "run",
          "rope"
        ]
      }
    },
    {
      "id": "U9",
      "no": 9,
      "hostUnitId": "G4-上-U9",
      "title": "Welcome to my home!",
      "titleZh": "我的家",
      "pages": "",
      "topicDomain": "家庭与房间",
      "functions": [
        "介绍房间",
        "使用 Is this …?",
        "用 There be 描述家具"
      ],
      "words": [
        {
          "en": "home",
          "zh": "家；住所；窝",
          "p": 0
        },
        {
          "en": "living room",
          "zh": "客厅",
          "p": 0
        },
        {
          "en": "kitchen",
          "zh": "厨房",
          "p": 0
        },
        {
          "en": "bedroom",
          "zh": "卧室",
          "p": 0
        },
        {
          "en": "tidy",
          "zh": "整洁的",
          "p": 0
        },
        {
          "en": "bathroom",
          "zh": "浴室；卫生间",
          "p": 0
        },
        {
          "en": "chair",
          "zh": "椅子",
          "p": 0
        },
        {
          "en": "desk",
          "zh": "书桌；办公桌",
          "p": 0
        },
        {
          "en": "table",
          "zh": "桌子",
          "p": 0
        },
        {
          "en": "cousin",
          "zh": "堂兄弟（姐妹）；表兄弟（姐妹）",
          "p": 0
        },
        {
          "en": "house",
          "zh": "房子",
          "p": 0
        },
        {
          "en": "parent",
          "zh": "父；母",
          "p": 0
        },
        {
          "en": "TV",
          "zh": "电视",
          "p": 0
        }
      ],
      "sentencePatterns": [
        "This is the living room/kitchen/bathroom/bedroom.",
        "Is this the kitchen/ bathroom/bedroom/living room?\n— Yes, it is. / No, it isn’t.",
        "There is a table/bed.\n    There are some desks/chairs."
      ],
      "passage": "A: Welcome to my home! Come in, please.\nB: Thank you.\nA: This is the living room. \nB: It’s big.\nA: This is the kitchen. \nC:It’s clean.\n    Is this your bedroom, Mingming?\nA: Yes, it is.\nD: It’s tidy.",
      "phonics": {
        "focus": "自然拼读：sea, sit, say, sand",
        "note": "来自课程大纲自然拼读栏",
        "pairs": [
          [
            "sea",
            "sit"
          ],
          [
            "say",
            "sand"
          ]
        ],
        "extras": [
          "sea",
          "sit",
          "say",
          "sand"
        ]
      }
    },
    {
      "id": "U10",
      "no": 10,
      "hostUnitId": "G4-上-U10",
      "title": "What's her job?",
      "titleZh": "职业",
      "pages": "",
      "topicDomain": "职业与家庭",
      "functions": [
        "询问职业",
        "使用 What’s his/her job?",
        "表达理想职业"
      ],
      "words": [
        {
          "en": "job",
          "zh": "工作",
          "p": 0
        },
        {
          "en": "photo",
          "zh": "照片",
          "p": 0
        },
        {
          "en": "policeman",
          "zh": "男警察",
          "p": 0
        },
        {
          "en": "player",
          "zh": "运动员；球员",
          "p": 0
        },
        {
          "en": "be",
          "zh": "成为；是",
          "p": 0
        },
        {
          "en": "wonderful",
          "zh": "令人钦佩的；令人高兴的",
          "p": 0
        },
        {
          "en": "scientist",
          "zh": "科学家",
          "p": 0
        },
        {
          "en": "astronaut",
          "zh": "宇航员",
          "p": 0
        },
        {
          "en": "writer",
          "zh": "作家；作者",
          "p": 0
        },
        {
          "en": "fireman",
          "zh": "消防员",
          "p": 0
        },
        {
          "en": "policewoman",
          "zh": "女警察",
          "p": 0
        },
        {
          "en": "fire",
          "zh": "火",
          "p": 0
        },
        {
          "en": "with",
          "zh": "和……一起；具有；用",
          "p": 0
        },
        {
          "en": "keep",
          "zh": "保持",
          "p": 0
        },
        {
          "en": "around",
          "zh": "在……周围",
          "p": 0
        },
        {
          "en": "artist",
          "zh": "画家；艺术家",
          "p": 0
        },
        {
          "en": "dangerous",
          "zh": "危险的",
          "p": 0
        },
        {
          "en": "everything",
          "zh": "每样东西",
          "p": 0
        },
        {
          "en": "on fire",
          "zh": "着火",
          "p": 0
        },
        {
          "en": "village",
          "zh": "村庄",
          "p": 0
        }
      ],
      "sentencePatterns": [
        "-What’s his job?\n   -He’s a policeman. / He’s a doctor. / He’s a fireman.",
        "-What’s her job?\n    -She’s a basketball player. / She’s a scientist. / She’s a teacher.",
        "-Is she your mother?\n   -Yes, she is.\n   -Is he your father?\n   - No, he isn’t. He’s my uncle.",
        "I want to be a basketball player.\n   I want to be a football player. \n   I want to be an astronaut.\n   I want to be an artist."
      ],
      "passage": "A: This is my family photo.\nB: What's your father's job?\nA: He’s a policeman.\nB: Is she your mother?\nA: Yes, she is.\nB: What’s her job?\nA: She’s a basketball player. \nB: I like basketball. I want to be a basketball player too.\nC: Wonderful!",
      "phonics": {
        "focus": "自然拼读：two, toy, tiger, taxi",
        "note": "来自课程大纲自然拼读栏",
        "pairs": [
          [
            "two",
            "toy"
          ],
          [
            "tiger",
            "taxi"
          ]
        ],
        "extras": [
          "two",
          "toy",
          "tiger",
          "taxi"
        ]
      }
    }
  ]
};
  BOOK.meta = DATA.meta;
  BOOK.units = DATA.units;
  SHT.BOOKS.register(BOOK);
})(window);
