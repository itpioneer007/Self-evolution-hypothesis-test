/*
 * 当前单元切片：从教材注册表里「当前这本书」派生。
 *
 * 课程唯一来源是 src/data/textbook.js 的 10 个单元；
 * 本文件只做派生，不改教材数据。换单元时词表、句型、课文、语音点、
 * 情境域和功能词白名单一起切换。
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
      words: unit.words.map(function (w) { return { en: w.en, zh: w.zh, p: w.p }; }),
      sentencePatterns: unit.sentencePatterns.slice(),
      passage: unit.passage || '',
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

  // 启动即切到当前唯一课程的第 1 单元。
  SHT.setUnit(book().units[0].id);

  function kpFor(unitId, suffix) {
    return (SHT.kpsOf(unitId) || []).filter(function (k) {
      return k.id === 'course-' + unitId + '-' + suffix;
    })[0] || {};
  }

  /*
   * U1 的最小示例题只使用当前 U1 词表、句型和自然拼读。
   * 这不是固定题库，只是没有模型时的可作答演示。
   */
  function sampleU1() {
    const k1 = kpFor('U1', '01');
    const k2 = kpFor('U1', '02');
    const k3 = kpFor('U1', '03');
    const k4 = kpFor('U1', '04');
    const k5 = kpFor('U1', '05');
    const cell = function (kp, fallback) { return kp.cell || fallback; };
    return [
      {
        no: 1, bookId: 'COURSE-G4A', unitId: 'U1',
        knowledgePoint: k1.label || 'vocab · classroom / playground / library · 词义识别',
        ability: 'vocab', cell: cell(k1, { type: '中英匹配', scene: '学校', level: '认', distractor: '同类不同物' }),
        prompt: '选出「教室」的英文。', audioText: '',
        options: ['classroom', 'playground', 'library'], answer: 'classroom',
        analysis: 'classroom 是教室。',
        nextIfWrong: k1.nextIfWrong || '先做词义匹配'
      },
      {
        no: 2, bookId: 'COURSE-G4A', unitId: 'U1',
        knowledgePoint: k2.label || 'spelling · music room · 拼写',
        ability: 'spelling', cell: cell(k2, { type: '拼写补全', scene: '学校', level: '辨', distractor: '形近' }),
        prompt: '选出「教室」的正确拼写。', audioText: '',
        options: ['classroom', 'classrom', 'clasroom'], answer: 'classroom',
        analysis: 'class + room = classroom。',
        nextIfWrong: k2.nextIfWrong || '先确认词义，再拆开拼写'
      },
      {
        no: 3, bookId: 'COURSE-G4A', unitId: 'U1',
        knowledgePoint: k3.label || 'sentence · This is our … · 句型理解',
        ability: 'sentence', cell: cell(k3, { type: '选词填空', scene: '学校', level: '用', distractor: '母语负迁移' }),
        prompt: 'This is our ___.', audioText: '',
        options: ['classroom', 'library', 'playground'], answer: 'classroom',
        analysis: 'This is our classroom. 介绍教室。',
        nextIfWrong: k3.nextIfWrong || '替换一个校园场所词再读一遍'
      },
      {
        no: 4, bookId: 'COURSE-G4A', unitId: 'U1',
        knowledgePoint: k4.label || 'sentence · There is … · 句型运用',
        ability: 'sentence', cell: cell(k4, { type: '对话补全', scene: '学校', level: '用', distractor: '语法错形' }),
        prompt: 'There is a ___ here.', audioText: '',
        options: ['library', 'classroom', 'playground'], answer: 'library',
        analysis: 'There is a library. 有一个图书馆。',
        nextIfWrong: k4.nextIfWrong || '用 There is / There are 各说一句'
      },
      {
        no: 5, bookId: 'COURSE-G4A', unitId: 'U1',
        knowledgePoint: k5.label || 'phonics · lion / letter / line / light · 发音辨识',
        ability: 'phonics', cell: cell(k5, { type: '字母组合辨音', scene: '学校', level: '辨', distractor: '音近' }),
        prompt: '听录音，选出你听到的单词。', audioText: 'lion',
        options: ['lion', 'letter', 'light'], answer: 'lion',
        analysis: '这一组词都含有字母 l 的发音，注意听开头音。',
        nextIfWrong: k5.nextIfWrong || '先看词形找共同字母，再听音辨词'
      }
    ];
  }

  SHT.sampleQuestions = sampleU1();

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

  // U1 有真实示例；其余单元返回空白题，题目内容由模型或人按本单元内容填写。
  SHT.sampleQuestionsFor = function (unitId) {
    if (unitId === 'U1') return SHT.sampleQuestions.slice();
    return SHT.blankQuestionsFor(unitId);
  };

  SHT.sampleStudent = {
    id: 'S-001',
    label: '示例学生（可改）',
    stage: '正在操练',
    recentErrors: [],
    interestCarriers: ['classroom', 'library', 'playground']
  };
})(window);
