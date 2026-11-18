/*
 * 四上课程候选知识点。
 *
 * 唯一来源：src/data/textbook.js 的 10 个单元，数据来自
 * D:/English/C端产品内容设计.xlsx 的「四上 单元内容」表。
 * 不再保存 PEP / 冀教 / 湘少的旧考点，也不把外单元的词混进来。
 *
 * 每个单元生成 6 个可出题起点：核心词义、拼写、两个核心句型、自然拼读、
 * 同类词辨识。它们是出题起点，不是固定答案库；具体题干仍由模型按当前单元生成。
 */
(function (root) {
  const SHT = (root.SHT = root.SHT || {});

  SHT.KP_GROUPS = [
    { id: 'unit', name: '本单元课程考点', note: '只来自当前四上课程大纲' }
  ];

  function clean(value) {
    return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
  }

  function short(value, n) {
    const s = clean(value);
    return s.length > n ? s.slice(0, n - 1) + '…' : s;
  }

  function wordsOf(unit, from, to) {
    return (unit.words || []).slice(from, to)
      .map(function (w) { return w.en; })
      .filter(Boolean)
      .join(' / ');
  }

  function wordAt(unit, index) {
    return (unit.words || [])[index] || { en: '', zh: '' };
  }

  function buildUnitKps(unit) {
    const first = wordAt(unit, 0);
    const second = wordAt(unit, 1);
    const third = wordAt(unit, 2);
    const fourth = wordAt(unit, 3);
    const fifth = wordAt(unit, 4);
    const patterns = unit.sentencePatterns || [];
    const p0 = patterns[0] || '本单元核心句型';
    const p1 = patterns[1] || p0;
    const phonics = (unit.phonics && unit.phonics.extras) || [];
    const phWords = phonics.slice(0, 4).join(' / ');
    const sourceWords = unit.id + ' 课程大纲 · 单词';
    const sourcePatterns = unit.id + ' 课程大纲 · 句型';
    const sourcePhonics = unit.id + ' 课程大纲 · 自然拼读';
    const scene = unit.topicDomain || '学校';

    return [
      {
        id: 'course-' + unit.id + '-01', unit: unit.id, group: 'unit',
        label: 'vocab · ' + wordsOf(unit, 0, 3) + ' · 词义识别',
        ability: 'vocab', cause: '同类不同物',
        why: '这些是本单元最先需要认读的核心词，先把中文意思和英文词形对应起来。',
        source: sourceWords,
        example: '「' + (first.zh || first.en) + '」的英文是？　' +
          [first.en, second.en, third.en].filter(Boolean).join(' / '),
        cell: { type: '中英匹配', scene: scene, level: '认', distractor: '同类不同物' },
        nextIfWrong: '先做词义匹配，再把三个词放进本单元句型里读一遍'
      },
      {
        id: 'course-' + unit.id + '-02', unit: unit.id, group: 'unit',
        label: 'spelling · ' + (fourth.en || '本单元核心词') + ' · 拼写',
        ability: 'spelling', cause: '形近混淆',
        why: '本单元核心词要能脱离选项写出来，先检查首尾字母和容易漏掉的字母。',
        source: sourceWords,
        example: '选出 ' + (fourth.en || '本单元核心词') + ' 的正确拼写',
        cell: { type: '拼写补全', scene: scene, level: '辨', distractor: '形近' },
        nextIfWrong: '回到中英匹配确认词义，再拆音节拼写'
      },
      {
        id: 'course-' + unit.id + '-03', unit: unit.id, group: 'unit',
        label: 'sentence · ' + short(p0, 38) + ' · 句型理解',
        ability: 'sentence', cause: '母语负迁移',
        why: '先理解本单元第一个核心句型的语序和固定搭配，再替换单词说。',
        source: sourcePatterns,
        example: '用本单元句型完成：' + short(p0, 55),
        cell: { type: '选词填空', scene: scene, level: '用', distractor: '母语负迁移' },
        nextIfWrong: '只保留句型骨架，先替换一个词，不一次改多处'
      },
      {
        id: 'course-' + unit.id + '-04', unit: unit.id, group: 'unit',
        label: 'sentence · ' + short(p1, 38) + ' · 句型运用',
        ability: 'sentence', cause: '语法错形',
        why: '第二个句型用来检查是否能从理解走到运用，尤其注意 be 动词、助动词和复数。',
        source: sourcePatterns,
        example: '换一个本单元的词，完成：' + short(p1, 55),
        cell: { type: '对话补全', scene: scene, level: '用', distractor: '语法错形' },
        nextIfWrong: '对照第一个句型，先保留结构，再换主语或宾语'
      },
      {
        id: 'course-' + unit.id + '-05', unit: unit.id, group: 'unit',
        label: 'phonics · ' + phWords + ' · 发音辨识',
        ability: 'phonics', cause: '音近混淆',
        why: '本单元自然拼读词要能听出共同音，并区分同一组里的不同词。',
        source: sourcePhonics,
        example: '听一个词，选出属于本组自然拼读的单词：' + phWords,
        cell: { type: '字母组合辨音', scene: scene, level: '辨', distractor: '音近' },
        nextIfWrong: '先看词形找共同字母，再听音辨词'
      },
      {
        id: 'course-' + unit.id + '-06', unit: unit.id, group: 'unit',
        label: 'vocab · ' + wordsOf(unit, 4, 8) + ' · 同类词辨识',
        ability: 'vocab', cause: '近义混淆',
        why: '这些词都属于本单元同一个主题，容易只记住“同类”而分不清具体对象。',
        source: sourceWords,
        example: '从本单元词表中选出与「' + (fifth.zh || fifth.en) + '」对应的英文',
        cell: { type: '中英匹配', scene: scene, level: '辨', distractor: '语义近' },
        nextIfWrong: '用图片或本单元课文语境重新确认每个词的具体所指'
      }
    ];
  }

  const book = (SHT.BOOKS && SHT.BOOKS.current) ? SHT.BOOKS.current() : null;
  const units = (book && book.units) || [];
  const all = [];
  units.forEach(function (unit) {
    Array.prototype.push.apply(all, buildUnitKps(unit));
  });

  SHT.KNOWLEDGE_POINTS = all;
  SHT.KPS_BY_BOOK = {};
  if (book) SHT.KPS_BY_BOOK[book.meta.id] = all;
  SHT.ALL_KPS = function () { return SHT.KNOWLEDGE_POINTS.slice(); };
  SHT.kpsOf = function (unitId) {
    return SHT.ALL_KPS().filter(function (k) { return k.unit === unitId; });
  };
  SHT.kpById = function (id) {
    return SHT.ALL_KPS().filter(function (k) { return k.id === id; })[0] || null;
  };
  SHT.kpByLabel = function (label) {
    const key = clean(label);
    if (!key) return null;
    return SHT.ALL_KPS().filter(function (k) { return k.label === key; })[0] || null;
  };
})(window);
