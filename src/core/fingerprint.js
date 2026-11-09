/*
 * 格子指纹：判断两道题是否「同一格」，以及同一考点同类题累计次数
 * 改编自：D:/vscode/Solingo-main/src/services/remediation/questionIdentity.ts
 *   - 原实现是 FNV-1a 32 位哈希 → base36，语义串含题干/选项（排序后）/答案
 *   - 这里改成「变化轴四维」为语义，因为我们要防的是 diversity collapse，
 *     不是防题干重复。换措辞、换选项顺序、换数字都不改变格子。
 *   - 内容指纹仍保留 FNV-1a，用于「同一考点同类题最多两次」的辅助判定。
 */
(function (root) {
  const SHT = (root.SHT = root.SHT || {});

  function fnv1a(value) {
    let result = 2166136261;
    for (let i = 0; i < value.length; i += 1) {
      result ^= value.charCodeAt(i);
      result = Math.imul(result, 16777619);
    }
    return (result >>> 0).toString(36);
  }

  function normalize(value) {
    return String(value || '')
      .normalize('NFKC')
      .toLowerCase()
      .replace(/[\s\p{P}\p{S}]/gu, '');
  }

  // 内容指纹：选项排序无关，换顺序不算新题
  SHT.contentFingerprint = function (question) {
    const choices = (question.options || []).map(normalize).sort().join('|');
    const semantic = [
      normalize(question.prompt),
      normalize(question.audioText),
      choices,
      normalize(question.answer)
    ].join('::');
    return 'qf-' + fnv1a(semantic);
  };

  // 格子指纹：变化轴四维，用于跨轮排除
  SHT.cellFingerprint = function (cell) {
    return 'cell-' + fnv1a(SHT.cellKey(cell));
  };

  // 同一考点同类题累计：按 知识点 + 题型 计数
  SHT.samePointTypeKey = function (question) {
    return [normalize(question.knowledgePoint), question.cell.type].join('::');
  };

  // 下一轮规划前调用：返回被禁止的格子、以及已触顶的考点
  SHT.buildExclusionList = function (rounds) {
    const usedCells = new Set();
    const pointTypeCount = new Map();
    rounds.forEach(function (round) {
      (round.questions || []).forEach(function (q) {
        if (!q.cell) return;
        usedCells.add(SHT.cellFingerprint(q.cell));
        const key = SHT.samePointTypeKey(q);
        pointTypeCount.set(key, (pointTypeCount.get(key) || 0) + 1);
      });
    });
    return {
      usedCells: usedCells,
      pointTypeCount: pointTypeCount,
      // 文章 A 的硬规则：同一考点同类题最多两次
      isCellBlocked: function (cell) { return usedCells.has(SHT.cellFingerprint(cell)); },
      isPointTypeFull: function (q) {
        return (pointTypeCount.get(SHT.samePointTypeKey(q)) || 0) >= 2;
      }
    };
  };
})(window);
