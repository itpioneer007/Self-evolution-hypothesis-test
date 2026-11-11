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
 *       V3c     拼写题的干扰项必须是原词的近似错拼（编辑距离 ≤ 词长/4），
 *               否则它其实是个真词，学生按「差太多」就能排掉，测不出拼写
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

  // 多词项（teacher's desk / turn on / put up）要整体保护，否则会被拆成两个词分别判超纲。
  // 占位符必须用分词器认不出来的字符：早先写成 [[PHRASE]]，tokensOf 把 PHRASE
  // 也当成一个英文单词，于是每道含多词项的题都被判「PHRASE 没教过」——
  // 这不是题目的问题，是占位符自己变成了一个查不到的词。
  const PHRASE_MARK = '\u0001';

  function protectPhrases(text, unit) {
    let s = String(text || '');
    const phrases = unit.words.map(function (w) { return w.en; })
      .filter(function (e) { return / /.test(e); })
      .sort(function (a, b) { return b.length - a.length; });
    phrases.forEach(function (p) {
      s = s.replace(new RegExp(esc(p), 'gi'), ' ' + PHRASE_MARK + ' ');
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
    // 语音板块的对比词对也算「教过的」：a / a-e 这一课就是拿 cat / cake、dad / date
    // 这些词来讲的，它们不在词表里，但学生确实学过。不并进来，phonics 题会被 V1 全部误杀。
    const ph = unit.phonics || {};
    (ph.pairs || []).forEach(function (pair) {
      (pair || []).forEach(function (w) { if (w) set[lower(w)] = 'phonics'; });
    });
    (ph.extras || []).forEach(function (w) { if (w) set[lower(w)] = 'phonics'; });
    // 教材句型表里出现的词也算学过：句型原文就写着 One blackboard, one TV, many desks
    // and chairs，TV / many 不在词表里但在书上。引用课文句子却被判超纲，是最冤的误杀。
    (unit.sentencePatterns || []).forEach(function (p) {
      tokensOf(p).forEach(function (tk) {
        if (resolveToken(tk, set)) return;
        set[lower(tk)] = 'pattern';
      });
    });
    return set;
  }

  // 词形变化：题面里会出现 nears / desks / classes / playing / liked / taller 这类派生形。
  // 词表只收原形，只按原形查表会把它们全判成超纲——near 明明在本册词表里，
  // 它加个 s 就不认识，那不是学生超纲，是查表太死。
  // 只认六类最常见后缀，且要求词干本身在表里、长度 ≥ 3：
  // 这样 is → i、us → u 这种误配不会发生；teacher 也不会因为 teach 在表里被放过，
  // 因为「原形命中」这一步先做，命中就返回，走不到这里。
  const DERIVE = [
    function (w) { return w.endsWith('ies') ? w.slice(0, -3) + 'y' : ''; },  // studies → study
    function (w) { return w.endsWith('es') ? w.slice(0, -2) : ''; },         // classes → class
    function (w) { return w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : ''; }, // nears → near
    function (w) { return w.endsWith('ing') ? w.slice(0, -3) : ''; },        // playing → play
    function (w) { return w.endsWith('ed') ? w.slice(0, -2) : ''; },         // played → play
    function (w) { return w.endsWith('er') ? w.slice(0, -2) : ''; },         // taller → tall
    function (w) { return w.endsWith('est') ? w.slice(0, -3) : ''; }         // tallest → tall
  ];

  function stemInTable(stem, set) {
    if (stem.length < 3) return false;
    if (set[stem]) return true;
    // making → mak → make；liked → lik → like：去掉后缀时把结尾的 e 补回来
    if (set[stem + 'e']) return true;
    // running → runn → run：双写辅音
    const n = stem.length;
    if (n > 3 && stem[n - 1] === stem[n - 2] && set[stem.slice(0, -1)]) return true;
    return false;
  }

  function derivedFrom(t, set) {
    for (let i = 0; i < DERIVE.length; i += 1) {
      const stem = DERIVE[i](t);
      if (stem && stemInTable(stem, set)) return true;
    }
    return false;
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
    if (derivedFrom(t, set)) return true;
    return false;
  }

  // 编辑距离（Damerau 变体：相邻两个字母颠倒算一次错）。
  // 拼写题的干扰项判定用它。为什么不用纯 Levenshtein：sheo / shoe 这种「字母顺序
  // 颠倒」是小学生最常见的拼写错误，纯 Levenshtein 会算成两次替换，把合法干扰项
  // 误判成「差太远」。词长都在 20 以内，朴素二维实现足够。
  function editDistance(a, b) {
    const m = a.length, n = b.length;
    if (!m) return n;
    if (!n) return m;
    const d = [];
    for (let i = 0; i <= m; i += 1) { d[i] = [i]; }
    for (let j = 0; j <= n; j += 1) { d[0][j] = j; }
    for (let i = 1; i <= m; i += 1) {
      for (let j = 1; j <= n; j += 1) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
          d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
        }
      }
    }
    return d[m][n];
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
    // 同一个词可能在题干、选项、解析里各出现一次。按「字段逐个报」会得到
    // 「选项 1 里有…；解析里出现了…」这种又长又重复的句子，人读着累还看不出重点。
    // 改成按词归并：一个词只报一次，后面跟它出现的位置。
    const unknownAt = Object.create(null);
    scanFields.forEach(function (f) {
      unknownWords(f.text, unit, set).forEach(function (w) {
        (unknownAt[w] = unknownAt[w] || []).push(f.name);
      });
    });

    // 解析放宽：它天然会引用答案、对比错项、写字母组合（ir / oa / a-e），
    // 这些不是「考题内容」，逐词查表会大量误判。只抓 4 字母以上、且不是答案本身、
    // 也不属于本题任何选项的生词——解析引用选项里的错拼（blakboard）是正常写法。
    const optionSet = Object.create(null);
    (q.options || []).forEach(function (op) { optionSet[SHT.normAnswer(op)] = true; });
    const analysisUnknown = unknownWords(q.analysis, unit, set).filter(function (w) {
      if (w.length < 4) return false;
      if (lower(w) === lower(q.answer) || lower(w) === lower(q.audioText)) return false;
      if (optionSet[SHT.normAnswer(w)]) return false;
      // 解析拆解词形时会引用词根：blackboard 讲成 black + board。
      // 词根本身不是「考题内容」，是答案的一部分，不能算超纲。
      if (lower(q.answer).indexOf(lower(w)) >= 0) return false;
      return true;
    });
    if (analysisUnknown.length) {
      analysisUnknown.forEach(function (w) { (unknownAt[w] = unknownAt[w] || []).push('解析'); });
    }
    const unknownWordsList = Object.keys(unknownAt);
    if (unknownWordsList.length) {
      push('V1', unknownWordsList.map(function (w) {
        return w + '（' + unknownAt[w].join('、') + '）';
      }).join('；') + ' 没学过');
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
      // V3c 拼写题的干扰项必须是「原词的近似错拼」。
      // V1 对拼写题跳过选项检查（干扰项本来就是故意写错的词），这里必须补上：
      // 差得太远说明它不是错拼，而是一个学生没学过的真词，按「差太多」就能排掉，
      // 测不出拼写。判定用编辑距离，不用逐位比——黑板上少一个 c 会把后面全部错位，
      // 逐位比会把它误判成「差得远」。
      const target = String(q.answer || '');
      const pureEn = function (s) { return /^[A-Za-z'’-]+$/.test(s); };
      // 豁免项：变体探针会把原题答案留在选项里当诱饵（那是铁律三，不是违规），
      // 诱饵离新答案远是必然的，不能按「差太远」判。
      const exempt = Object.create(null);
      ((o.exempt || [])).forEach(function (x) { exempt[SHT.normAnswer(x)] = true; });
      if (pureEn(target)) {
        const limit = Math.max(1, Math.ceil(target.length / 4));
        const bad = opts.filter(function (op) {
          const o2 = String(op || '').trim();
          if (!o2 || !pureEn(o2)) return false;
          if (SHT.normAnswer(o2) === SHT.normAnswer(target)) return false;
          if (exempt[SHT.normAnswer(o2)]) return false;
          return editDistance(lower(o2), lower(target)) > limit;
        });
        if (bad.length) push('V3c', '干扰拼写和原词差太远，不像错拼：' + bad.join('、'));
      }
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
      // 只有「题干真要求学生听」的题才查音文一致。书面辨音题（选出与 cake 中 a
      // 同音的词）本身不需要朗读，模型顺手给的 audioText 只是素材，不能按不一致判死。
      const needAudio = /听|录音/.test(String(q.prompt || '')) || type === '听音选义' || type === '听写';
      if (needAudio && !audio) {
        push('V6', '听力题没有听力原文');
      } else if (needAudio && /[A-Za-z]/.test(ans)) {
        // 答案是英文时，朗读的必须就是它（听写 / 辨音 / 选词）
        if (SHT.normAnswer(audio) !== SHT.normAnswer(ans) && lower(audio).indexOf(lower(ans)) < 0) {
          push('V6', '朗读的「' + audio + '」和答案「' + ans + '」对不上');
        }
      }
      // 答案是中文（听音选义）时，朗读的英文本来就不会等于中文答案，只要求原文非空。
      // 但这时题干里绝不能把要听的词写出来：写了就是看词选义，听的部分等于没考。
      if (needAudio && audio && new RegExp('\\b' + esc(audio) + '\\b', 'i').test(String(q.prompt || ''))) {
        push('V6', '题干把要听的词「' + audio + '」写出来了，这就不是听力题了');
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
