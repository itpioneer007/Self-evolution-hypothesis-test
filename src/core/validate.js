/*
 * 代码闸：模型出的题先过这里，过不去不进退回。
 *
 * 这是整套方案里唯一有「通过权」的东西。模型质检（agents.verify）只能说挂，
 * 不能说通过——否则就是生成方给自己判卷（self-confirming loop）。
 *
 * 八条判据都实现成纯函数、可复算：
 *   V1 超纲     题干/选项/解析里每个英文词都在「本单元词表 ∪ 全册功能词」
 *   V2 答案     答案必须与某个选项完全一致
 *   V3 选项     三项互不相同、都不为空
 *   V4 泄题     题干里不许出现答案原词
 *   V5 解析     不超过 30 字，且不是「本题考查……」这类空话
 *   V6 听力     听力类题型必须有 audioText，且朗读的正是答案
 *   V7 归属     知识点非空，格子四维都在枚举里
 *   V8 去重     与同轮其他题不同格
 *
 * V1 是命门：模型的默认行为是往「更地道」的方向写，一写就超纲。
 * 提示词里写多少遍都不如逐词查表。
 */
(function (root) {
  const SHT = (root.SHT = root.SHT || {});

  const LISTENING_TYPES = ['听音选义', '字母组合辨音', '听写'];

  function esc(text) {
    return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function lower(s) { return String(s == null ? '' : s).toLowerCase().trim(); }

  // 本单元里带空格的多词项（mobile phone / living room / listen to）先整体保护起来，
  // 否则会被拆成两个词分别判超纲
  function protectPhrases(text, unit) {
    let s = String(text || '');
    const phrases = unit.words.map(function (w) { return w.en; })
      .filter(function (e) { return / /.test(e); })
      .sort(function (a, b) { return b.length - a.length; });
    phrases.forEach(function (p) {
      s = s.replace(new RegExp(esc(p), 'gi'), ' [[PHRASE]] ');
    });
    return s;
  }

  function tokensOf(text) {
    return String(text || '').match(/[A-Za-z][A-Za-z'’-]*/g) || [];
  }

  function knownSet(unit) {
    const set = Object.create(null);
    unit.words.forEach(function (w) { set[lower(w.en)] = 'word'; });
    (unit.allowedFunctionWords || []).forEach(function (w) { set[lower(w)] = 'fn'; });
    return set;
  }

  // It's / don't / isn't / T-shirt 这几类写法要能落到词表上
  function resolveToken(tok, set) {
    const t = lower(tok);
    if (set[t]) return true;
    if (t.indexOf('-') > 0) {
      const parts = t.split('-');
      if (parts.every(function (p) { return set[p]; })) return true;
    }
    const abbr = t.match(/^([a-z]+)'(s|t|re|ll|ve|m|d)$/);
    if (abbr) {
      if (set[abbr[1]]) return true;
      if (abbr[1] === 'it' && abbr[2] === 's' && set['is']) return true;
      if (set[abbr[1] + abbr[2]]) return true;
    }
    return false;
  }

  function unknownWords(text, unit, set) {
    const guarded = protectPhrases(text, unit);
    const tokens = tokensOf(guarded);
    const out = [];
    tokens.forEach(function (tk) {
      if (!resolveToken(tk, set) && out.indexOf(tk) < 0) out.push(tk);
    });
    return out;
  }

  /**
   * 逐条判一道题。
   * @param {object} q 题目（含 cell / prompt / options / answer / analysis / audioText / knowledgePoint）
   * @param {object} unit 当前单元切片（含 words / allowedFunctionWords）
   * @param {object} [opt] { others: [已通过的题], plan: 计划行 }
   * @returns {{pass:boolean, fails:Array, warns:Array}}
   */
  SHT.validateQuestion = function (q, unit, opt) {
    const o = opt || {};
    const fails = [];
    const warns = [];
    const push = function (id, detail) { fails.push({ id: id, detail: detail }); };
    const warn = function (id, detail) { warns.push({ id: id, detail: detail }); };

    if (!q || !unit) return { pass: false, fails: [{ id: 'V0', detail: '题目或单元为空' }], warns: [] };

    const set = knownSet(unit);
    const type = q.cell ? q.cell.type : '';
    const isSpelling = type === '拼写补全' || type === '听写';
    const isListening = LISTENING_TYPES.indexOf(type) >= 0;

    // V1 超纲（拼写题的干扰项是故意写错的词，跳过词表检查，改查 V3b 形近）
    const scanFields = [{ name: '题干', text: q.prompt }];
    if (!isSpelling) {
      (q.options || []).forEach(function (op, i) {
        scanFields.push({ name: '选项 ' + (i + 1), text: op });
      });
    }
    scanFields.forEach(function (f) {
      const unknown = unknownWords(f.text, unit, set);
      if (unknown.length) push('V1', f.name + '里有本单元没教过的词：' + unknown.join('、'));
    });

    // 解析放宽：它天然会引用答案、对比错项、写字母组合（ir / oa / a-e），
    // 这些不是「考题内容」，逐词查表会大量误判。只抓 4 字母以上、且不是答案本身的生词。
    const analysisUnknown = unknownWords(q.analysis, unit, set).filter(function (w) {
      return w.length >= 4 && lower(w) !== lower(q.answer) && lower(w) !== lower(q.audioText);
    });
    if (analysisUnknown.length) {
      push('V1', '解析里出现了本单元没教过的词：' + analysisUnknown.join('、'));
    }

    // V2 答案必须落在选项里
    const opts = (q.options || []).map(function (x) { return String(x == null ? '' : x); });
    const inside = opts.filter(function (op) {
      return SHT.normAnswer(op) === SHT.normAnswer(q.answer);
    });
    if (!inside.length) push('V2', '答案「' + q.answer + '」不在选项里');
    if (inside.length > 1) push('V3', '选项里有 ' + inside.length + ' 项与答案相同');

    // V3 选项完整且互不相同
    const filled = opts.filter(function (op) { return op.trim(); });
    if (filled.length !== 3) push('V3', '选项应为 3 个非空项，实际 ' + filled.length + ' 个');
    const uniq = {};
    opts.forEach(function (op) {
      const k = SHT.normAnswer(op);
      if (!k) return;
      if (uniq[k]) push('V3', '选项重复：「' + op + '」');
      uniq[k] = true;
    });
    if (isSpelling) {
      const target = String(q.answer || '');
      const bad = opts.filter(function (op) {
        if (!op.trim() || SHT.normAnswer(op) === SHT.normAnswer(target)) return false;
        const a = lower(op), b = lower(target);
        const lenDiff = Math.abs(a.length - b.length);
        let diff = 0;
        const n = Math.min(a.length, b.length);
        for (let i = 0; i < n; i += 1) if (a[i] !== b[i]) diff += 1;
        diff += lenDiff;
        return diff > Math.max(3, Math.ceil(b.length / 2));
      });
      if (bad.length) warn('V3b', '有几个干扰拼写与原词差得太远，学生一眼能排掉：' + bad.join('、'));
    }

    // V4 题干泄答案（只查英文答案，中文答案不可能出现在英文题干里）
    const ans = String(q.answer == null ? '' : q.answer);
    if (/[A-Za-z]/.test(ans) && ans.trim().length >= 2) {
      const inPrompt = new RegExp('\\b' + esc(ans.trim()) + '\\b', 'i').test(String(q.prompt || ''));
      if (inPrompt) push('V4', '题干里直接出现了答案「' + ans + '」');
    }

    // V5 解析
    const analysis = String(q.analysis || '').trim();
    if (!analysis) {
      push('V5', '没有解析');
    } else {
      const len = analysis.replace(/\s/g, '').length;
      if (len > 30) push('V5', '解析 ' + len + ' 字，超过 30 字（模型爱写长，人会跳过）');
      else if (len > 25) warn('V5', '解析 ' + len + ' 字，规范建议 ≤25 字');
      if (/本题考查|考察学生|旨在|旨在考查/.test(analysis)) {
        push('V5', '解析写的是「' + analysis.slice(0, 12) + '…」这类空话，没说错在哪');
      }
    }

    // V6 听力题音文一致
    if (isListening) {
      const audio = String(q.audioText || '').trim();
      if (!audio) {
        push('V6', '听力题没有听力原文');
      } else if (SHT.normAnswer(audio) !== SHT.normAnswer(q.answer) && lower(audio).indexOf(lower(q.answer)) < 0) {
        push('V6', '朗读的「' + audio + '」和答案「' + q.answer + '」对不上');
      }
    }

    // V7 归属与格子
    if (!String(q.knowledgePoint || '').trim()) push('V7', '知识点为空');
    const cell = q.cell || {};
    if (SHT.QUESTION_TYPES.map(function (t) { return t.id; }).indexOf(cell.type) < 0) {
      push('V7', '题型不在枚举内：' + cell.type);
    }
    if (SHT.SCENES.indexOf(cell.scene) < 0) push('V7', '场景不在枚举内：' + cell.scene);
    if (SHT.LEVELS.indexOf(cell.level) < 0) push('V7', '层次不在枚举内：' + cell.level);
    if (SHT.DISTRACTORS.indexOf(cell.distractor) < 0) push('V7', '干扰项类型不在枚举内：' + cell.distractor);

    // V8 同轮不同格
    (o.others || []).forEach(function (other, i) {
      if (other && other.cell && SHT.cellKey(other.cell) === SHT.cellKey(cell)) {
        push('V8', '与第 ' + (i + 1) + ' 题落在同一个格子');
      }
    });

    return { pass: fails.length === 0, fails: fails, warns: warns };
  };

  // 给界面用的一句话摘要
  SHT.failsText = function (result) {
    if (!result) return '';
    if (result.pass) return '八条全过';
    return result.fails.map(function (f) { return f.id + ' ' + f.detail; }).join('；');
  };
})(window);
