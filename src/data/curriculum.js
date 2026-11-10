/*
 * 当前单元切片：从教材注册表里「当前这本书」派生。
 *
 * 两级切换：setBook(id) 换书，setUnit(id) 换单元。换书时词表、句型表、语音点、
 * 情境域、功能词白名单五样一起换——只换词表会让超纲判定拿错边界。
 *
 * 本文件只做派生，不改教材数据；教材变更请改 src/data/books/ 下对应文件。
 */
(function (root) {
  const SHT = (root.SHT = root.SHT || {});

  function book() { return SHT.BOOKS.current(); }

  function slice(unit) {
    const b = book();
    return {
      id: unit.id,
      no: unit.no,
      hostUnitId: unit.hostUnitId,
      quizUnitId: unit.id,
      title: unit.title,
      titleZh: unit.titleZh,
      pages: unit.pages,
      topicDomain: unit.topicDomain,
      functions: unit.functions,
      bookId: b.meta.id,
      bookName: b.meta.shortName,
      bookUnitCount: b.units.length,
      // 词表：>= 6 词才能凑够 3 个选项加干扰项
      words: unit.words.map(function (w) { return { en: w.en, zh: w.zh, p: w.p }; }),
      // 句型表：出题时句型不得越出此表
      sentencePatterns: unit.sentencePatterns.slice(),
      // 语音点：音近干扰项的真实素材
      phonics: unit.phonics,
      phonicsWords: [].concat(
        (unit.phonics.pairs || []).reduce(function (acc, pair) { return acc.concat(pair); }, []),
        unit.phonics.extras || []
      ),
      allowedFunctionWords: b.meta.allowedFunctionWords.slice()
    };
  }

  SHT.setUnit = function (unitId) {
    const b = book();
    const unit = b.getUnit(unitId) || b.units[0];
    SHT.curriculum = slice(unit);
    return SHT.curriculum;
  };

  SHT.setBook = function (bookId, unitId) {
    const b = SHT.BOOKS.setCurrent(bookId);
    return SHT.setUnit(unitId || b.units[0].id);
  };

  // 启动即切到第一本书的第 1 单元；界面切书/切单元时再调 setBook / setUnit
  SHT.setUnit(book().units[0].id);

  /*
   * 5 道示例题：U1 My classroom 的真实词句，刻意落在 5 个不同格子。
   * 这是「模板」，不是成品答案；正式测试时可整组清空自己出题。
   * 九个字段：position(no) / 知识点 / 题干 / 选项 / 听力文本 / 答案 / 一句解析 / 格子 / 闭环层 L4。
   */
  SHT.sampleQuestions = [
    {
      no: 1,
      bookId: 'PEP-G4A', unitId: 'U1',
      knowledgePoint: 'vocab · 教室物品名词 · 听音选义（音义联结）',
      ability: 'listening / vocab',
      cell: { type: '听音选义', scene: '学校', level: '认', distractor: '同类不同物' },
      prompt: '听录音，选出你听到的单词的中文意思。',
      audioText: 'classroom',
      options: ['教室', '窗户', '黑板'],
      answer: '教室',
      analysis: 'classroom 是教室，window 是窗户。',
      nextIfWrong: '降到词形辨认，做 classroom / class 的形近辨别'
    },
    {
      no: 2,
      knowledgePoint: 'spelling · blackboard · oa + ar 双字母组合',
      ability: 'spelling',
      cell: { type: '拼写补全', scene: '学校', level: '辨', distractor: '形近' },
      prompt: '选出「黑板」的正确拼写。',
      audioText: '',
      options: ['blackboard', 'blackbord', 'blakboard'],
      answer: 'blackboard',
      analysis: 'black+board，oa 和 ar 都不能省。',
      nextIfWrong: '先做中英匹配确认词义，再回拼写'
    },
    {
      no: 3,
      knowledgePoint: 'phonics · a / a-e · cake 与 cat 长短音',
      ability: 'phonics',
      cell: { type: '字母组合辨音', scene: '学校', level: '辨', distractor: '音近' },
      prompt: '听录音，选出你听到的单词。',
      audioText: 'cake',
      options: ['cake', 'cat', 'hat'],
      answer: 'cake',
      analysis: 'a-e 读字母音 /eɪ/，cat 读短音 /æ/。',
      nextIfWrong: '降到「认」层次，先看词形再听，别一上来就纯听辨'
    },
    {
      no: 4,
      knowledgePoint: 'sentence · Where is it? · on / in 介词',
      ability: 'sentence',
      cell: { type: '选词填空', scene: '学校', level: '用', distractor: '语义近' },
      prompt: '— Where is the picture?\n— It\'s ___ the wall.',
      audioText: '',
      options: ['on', 'in', 'under'],
      answer: 'on',
      analysis: '挂在墙上用 on the wall。',
      nextIfWrong: '换 near the window 再考一次，看是不是只会这一个搭配'
    },
    {
      no: 5,
      knowledgePoint: 'sentence · Let me help you. · 应答语',
      ability: 'sentence',
      cell: { type: '对话补全', scene: '学校', level: '用', distractor: '母语负迁移' },
      prompt: '— Let me help you.\n— ___',
      audioText: '',
      options: ['Thank you.', "You're welcome.", 'Yes, I do.'],
      answer: 'Thank you.',
      analysis: '别人主动帮你，回答 Thank you.。',
      nextIfWrong: '换成 Let\'s clean the classroom! 考 OK. 的应答'
    }
  ];

  /*
   * 其他单元没有现成示例题：返回 5 道「只有计划、没有内容」的空题，
   * 知识点与格子从该单元的候选清单里确定性带出，人再往里填题干选项。
   */
  SHT.blankQuestionsFor = function (unitId) {
    const kps = SHT.kpsOf ? SHT.kpsOf(unitId) : [];
    const out = [];
    for (let i = 0; i < 5; i += 1) {
      const kp = kps[i] || null;
      out.push({
        no: i + 1,
        knowledgePoint: kp ? kp.label : '',
        ability: kp ? kp.ability : '',
        cell: kp ? Object.assign({}, kp.cell) : {
          type: '听音选义', scene: SHT.curriculum.topicDomain, level: '认', distractor: '同类不同物'
        },
        prompt: '', audioText: '', options: ['', '', ''], answer: '', analysis: '',
        nextIfWrong: kp ? kp.nextIfWrong : ''
      });
    }
    return out;
  };

  // 示例题只有 PEP 四上 U1 这一组（真实词句、5 个不同格子）。换书或换单元后
  // 一律返回空白题：题目内容由模型或人填，不拿别的单元的词硬凑。
  SHT.sampleQuestionsFor = function (unitId) {
    const isPep = SHT.BOOKS.current().meta.id === 'PEP-G4A';
    return isPep && unitId === 'U1' ? SHT.sampleQuestions : SHT.blankQuestionsFor(unitId);
  };

  // 最小测试用的学生画像（mock，来自「最小测试记录表」第 0 节字段）
  SHT.sampleStudent = {
    id: 'S-001',
    label: '示例学生（可改）',
    stage: '正在操练',
    recentErrors: [
      'blackboard 双字母组合漏写（2 次）',
      'a / a-e 长短音不分（2 次）',
      'on / in 介词混用（3 次）'
    ],
    interestCarriers: ['classroom', 'computer', 'picture', 'fan']
  };
})(window);
