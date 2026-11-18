/*
 * 四上课程候选学习目标。
 *
 * 来源：C端产品内容设计.xlsx 的「四上 单元内容」；
 * 顺序来源：「（新）路径分层」「湘少4上 单元学习路径」。
 *
 * 路径阶段不是单个知识点，而是一个容器；容器内每个单词、句型、自然拼读词
 * 都是独立 target，必须分别获得作答证据。这样才不会有单词被“词义组”掩盖。
 */
(function (root) {
  const SHT = (root.SHT = root.SHT || {});
  SHT.KP_GROUPS = [
    { id: 'path1', name: '单元自学1', note: '核心词 + 第一个句型' },
    { id: 'path2', name: '单元自学2', note: '第二组词 + 第二个句型' },
    { id: 'path3', name: '单元自学3', note: '剩余词 + 第三个句型 + 自然拼读' }
  ];

  function clean(value) { return String(value == null ? '' : value).replace(/\s+/g, ' ').trim(); }
  function short(value, n) { const s = clean(value); return s.length > n ? s.slice(0, n - 1) + '…' : s; }
  function wordAt(unit, i) { return (unit.words || [])[i] || { en: '', zh: '' }; }
  function addTarget(list, unit, target) {
    list.push(Object.assign({
      unit: unit.id,
      pathLabel: '单元自学' + target.pathStage,
      targetId: target.targetId,
      taskForms: target.taskForms || ['认']
    }, target));
  }
  function wordTarget(unit, word, stage, step, group, suffix) {
    return {
      id: 'course-' + unit.id + '-' + suffix,
      targetId: unit.id + ':word:' + word.en,
      targetType: 'word', pathStage: stage, pathStep: step, group: group,
      taskForms: ['认', '听', '拼写'],
      label: 'vocab · ' + word.en + ' · ' + unit.id + ' 词义识别',
      ability: 'vocab', cause: '同类不同物',
      why: '这是单元自学' + stage + '的一个独立词汇目标，必须单独获得作答证据。',
      source: unit.id + ' 课程大纲 · 单词',
      example: '「' + (word.zh || word.en) + '」的英文是？',
      cell: { type: '中英匹配', scene: unit.topicDomain || '学校', level: '认', distractor: '同类不同物' },
      nextIfWrong: '回到本单元的单词卡和句型，再认一次这个具体单词'
    };
  }
  function sentenceTarget(unit, pattern, stage, step, group, suffix) {
    return {
      id: 'course-' + unit.id + '-' + suffix,
      targetId: unit.id + ':sentence:' + suffix,
      targetType: 'sentence', pathStage: stage, pathStep: step, group: group,
      taskForms: ['认', '用', '表达'],
      label: 'sentence · ' + short(pattern, 42) + ' · ' + unit.id + ' 句型',
      ability: 'sentence', cause: '母语负迁移',
      why: '这是单元自学' + stage + '的一个独立句型目标，要单独用到完整语境中。',
      source: unit.id + ' 课程大纲 · 句型',
      example: '用本单元句型完成：' + short(pattern, 60),
      cell: { type: '选词填空', scene: unit.topicDomain || '学校', level: '用', distractor: '母语负迁移' },
      nextIfWrong: '保留句型骨架，先替换一个词，再回到完整句子'
    };
  }
  function phonicsTarget(unit, word, stage, step, group, suffix) {
    return {
      id: 'course-' + unit.id + '-' + suffix,
      targetId: unit.id + ':phonics:' + word,
      targetType: 'phonics', pathStage: stage, pathStep: step, group: group,
      taskForms: ['辨', '读'],
      label: 'phonics · ' + word + ' · ' + unit.id + ' 自然拼读',
      ability: 'phonics', cause: '音近混淆',
      why: '这是单元自学3的一个独立自然拼读目标，要单独听辨和认读。',
      source: unit.id + ' 课程大纲 · 自然拼读',
      example: '听音，认出 ' + word + ' 的自然拼读',
      cell: { type: '字母组合辨音', scene: unit.topicDomain || '学校', level: '辨', distractor: '音近' },
      nextIfWrong: '先看词形找共同字母，再回到音形对应'
    };
  }

  function buildUnitKps(unit) {
    const words = unit.words || [];
    const patterns = unit.sentencePatterns || [];
    const phonics = (unit.phonics && unit.phonics.extras) || [];
    const out = [];
    let n = 0;
    function nextSuffix() { return String(++n).padStart(2, '0'); }
    function addWords(from, to, stage, group) {
      words.slice(from, to).forEach(function (word, i) {
        addTarget(out, unit, wordTarget(unit, word, stage, i + 1, group, nextSuffix()));
      });
    }
    addWords(0, 6, 1, 'path1');
    addTarget(out, unit, sentenceTarget(unit, patterns[0] || '本单元核心句型', 1, 7, 'path1', nextSuffix()));
    addWords(6, 9, 2, 'path2');
    addTarget(out, unit, sentenceTarget(unit, patterns[1] || patterns[0] || '本单元核心句型', 2, 4, 'path2', nextSuffix()));
    addWords(9, words.length, 3, 'path3');
    addTarget(out, unit, sentenceTarget(unit, patterns[2] || patterns[1] || patterns[0] || '本单元核心句型', 3, (words.length - 9) + 1, 'path3', nextSuffix()));
    phonics.forEach(function (word, i) {
      addTarget(out, unit, phonicsTarget(unit, word, 3, (words.length - 9) + 2 + i, 'path3', nextSuffix()));
    });
    return out;
  }

  const book = (SHT.BOOKS && SHT.BOOKS.current) ? SHT.BOOKS.current() : null;
  const units = (book && book.units) || [];
  const all = [];
  units.forEach(function (unit) { Array.prototype.push.apply(all, buildUnitKps(unit)); });
  all.sort(function (a, b) {
    return a.unit === b.unit ? (a.pathStage - b.pathStage || a.pathStep - b.pathStep) : (a.unit < b.unit ? -1 : 1);
  });

  SHT.KNOWLEDGE_POINTS = all;
  SHT.KPS_BY_BOOK = {};
  if (book) SHT.KPS_BY_BOOK[book.meta.id] = all;
  SHT.ALL_KPS = function () { return SHT.KNOWLEDGE_POINTS.slice(); };
  SHT.kpsOf = function (unitId) {
    return SHT.ALL_KPS().filter(function (k) { return k.unit === unitId; })
      .sort(function (a, b) { return a.pathStage - b.pathStage || a.pathStep - b.pathStep; });
  };
  SHT.kpById = function (id) { return SHT.ALL_KPS().filter(function (k) { return k.id === id; })[0] || null; };
  SHT.kpByLabel = function (label) {
    const key = clean(label);
    if (!key) return null;
    return SHT.ALL_KPS().filter(function (k) { return k.label === key; })[0] || null;
  };
})(window);
