/*
 * 教材注册表：一本教材一个文件，统一契约，按版本 → 单元两级切换。
 *
 * 为什么要多本：出题必须受「这本书教过什么」约束。不同版本的单元数、词表、
 * 句型进度都不一样（PEP 四上 6 单元、冀教版 4 单元、湘少版 12 单元），
 * 换版本时词表 / 句型 / 语音点 / 情境域 / 功能词白名单五样必须一起换，
 * 只换词表会让超纲判定拿错边界。
 *
 * 入库门槛（register 时逐条检查，不满足记 warn，不抛错）：
 *   - 每个单元 ≥ 6 个词（3 个选项 + 至少 3 个干扰项来源）
 *   - 每个单元 ≥ 3 条句型（出题不得越出此表）
 *   - 词条带书上页码 p，句子可回溯到页
 *
 * 数据来源一律是公开教材镜像，抽取方式与校对情况写在每本书的 meta.source。
 * 没有文本层的扫描版不入库（沪教版、外研社陈琳版四上已试，PDF 文本层为 0 字符）。
 */
(function (root) {
  const SHT = (root.SHT = root.SHT || {});
  const books = [];
  const listeners = [];

  function warn(book, msg) {
    book.meta.warnings = book.meta.warnings || [];
    book.meta.warnings.push(msg);
  }

  function seal(book) {
    if (!book.meta || !book.meta.id) throw new Error('教材缺 meta.id');
    if (!Array.isArray(book.units) || !book.units.length) throw new Error(book.meta.id + ' 没有单元');
    book.meta.warnings = book.meta.warnings || [];
    book.units.forEach(function (u, i) {
      if (!u.id) throw new Error(book.meta.id + ' 第 ' + (i + 1) + ' 个单元缺 id');
      u.no = u.no || i + 1;
      u.words = u.words || [];
      u.sentencePatterns = u.sentencePatterns || [];
      u.phonics = u.phonics || { focus: '', pairs: [], extras: [] };
      u.phonics.pairs = u.phonics.pairs || [];
      u.phonics.extras = u.phonics.extras || [];
      if (u.words.length < 6) {
        warn(book, u.id + ' 只有 ' + u.words.length + ' 个词，干扰项可能凑不齐');
      }
      if (u.sentencePatterns.length < 3) {
        warn(book, u.id + ' 只有 ' + u.sentencePatterns.length + ' 条句型');
      }
      const seen = {};
      u.words.forEach(function (w) {
        if (!w.en || !w.zh) warn(book, u.id + ' 有词条缺 en/zh：' + JSON.stringify(w));
        if (seen[w.en]) warn(book, u.id + ' 重复词：' + w.en);
        seen[w.en] = true;
      });
    });
    book.getUnit = function (id) {
      return book.units.filter(function (u) { return u.id === id; })[0] || null;
    };
    book.unitList = function () {
      return book.units.map(function (u) {
        return { id: u.id, no: u.no, title: u.title, titleZh: u.titleZh };
      });
    };
    return book;
  }

  let current = null;

  SHT.BOOKS = {
    register: function (book) {
      if (books.some(function (b) { return b.meta && b.meta.id === book.meta.id; })) {
        throw new Error('教材 id 重复：' + book.meta.id);
      }
      seal(book);
      books.push(book);
      return book;
    },
    list: function () {
      return books.map(function (b) {
        return {
          id: b.meta.id,
          shortName: b.meta.shortName,
          name: b.meta.name,
          publisher: b.meta.publisher,
          grade: b.meta.grade,
          term: b.meta.term,
          unitCount: b.units.length,
          warnings: b.meta.warnings.slice()
        };
      });
    },
    all: function () { return books.slice(); },
    get: function (id) {
      return books.filter(function (b) { return b.meta.id === id; })[0] || null;
    },
    current: function () { return current || books[0]; },
    setCurrent: function (id) {
      const b = SHT.BOOKS.get(id);
      if (!b) return current;
      current = b;
      listeners.forEach(function (fn) { fn(b); });
      return current;
    },
    onChange: function (fn) { listeners.push(fn); }
  };
})(window);
