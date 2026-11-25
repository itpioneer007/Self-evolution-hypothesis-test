/*
 * 当前单元切片：从教材注册表里「当前这本书」派生。
 * 课程唯一来源是 src/data/textbook.js；本文件只做派生，不改教材数据。
 */
(function (root) {
  const SHT = (root.SHT = root.SHT || {});

  function book() { return SHT.BOOKS.current(); }

  function slice(unit) {
    const b = book();
    return {
      id: unit.id,
      title: unit.title,
      titleZh: unit.titleZh,
      topicDomain: unit.topicDomain,
      functions: unit.functions,
      words: unit.words.map(function (w) { return { en: w.en, zh: w.zh, p: w.p }; }),
      sentencePatterns: unit.sentencePatterns.slice(),
      phonics: unit.phonics,
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

  SHT.setUnit(book().units[0].id);
})(window);
