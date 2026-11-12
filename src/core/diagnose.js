/*
 * 诊断：他为什么选了这个，而不是别的
 *
 * 判对错不归这里管（那是 grade.js）。这里回答的是判完之后那个更难的问题：
 * 正确答案是 A，他排掉了 C 和 D 却选了 B —— 为什么偏偏是 B？
 *
 * 这件事必须由代码做，理由是它可复算：
 *   - 同一道题、同一个错选，跑两次必须给同一个结论，否则错题本、考点推进、
 *     下一轮规划各拿一份说法，整个闭环就散了。
 *   - 要让模型做，它每次会给一个听起来都对、但没法验证的说法（「学生对词形
 *     变化掌握不牢」），既不能证伪，也不能指导下一步出什么题。
 *
 * 所以这里的做法是先把「可测的差」量出来，再从差里归因：
 *
 *   选项题：把每个错项与正确答案逐项比 —— 字母差几个（编辑距离）、音形键是否
 *   相同（拼写不同读音相同）、是不是只差一个屈折后缀（near / nears）、中文义
 *   是否接近、长度差几倍。被选中的那一项哪一维最近，就是哪一类错因；没被选
 *   的那两项，也要说出「为什么他一眼就排掉了」——这部分才是「不只是错了」。
 *
 *   开放题：把学生写的句子与标准答案做词元对齐（LCS），看增删改了哪些词。
 *   漏 be 动词、漏三单 s、漏冠词、语序颠倒、换成近义词，都能从对齐结果里读出来。
 *
 * 代码给不出结论时（字母全不一样、对齐不上、选项都不在词表里）才允许问模型一次，
 * 而且模型只能在固定的错因编号里挑一个，不能自己发明说法。见 app.js 的补诊按钮。
 *
 * 冻结口径与判分台账一致：键是「题目 id + 归一化后的学生作答」。换个答案重答是
 * 另一个事件，各诊断各的；同一个答案重看一百次，结论不变。
 */
(function (root) {
  const SHT = (root.SHT = root.SHT || {});

  /* ---------- 文本工具 ---------- */

  function low(s) { return String(s == null ? '' : s).toLowerCase().trim(); }
  function lettersOf(s) { return low(s).replace(/[^a-z]/g, ''); }
  function tokensOf(s) {
    return low(s).replace(/[^a-z' ]/g, ' ').split(/\s+/).filter(Boolean);
  }

  // 编辑距离：两个词差几个字母。这是「形近」最直接的度量。
  function editDistance(a, b) {
    const x = lettersOf(a);
    const y = lettersOf(b);
    if (!x.length) return y.length;
    if (!y.length) return x.length;
    let prev = [];
    for (let j = 0; j <= y.length; j += 1) prev[j] = j;
    for (let i = 1; i <= x.length; i += 1) {
      const cur = [i];
      for (let j = 1; j <= y.length; j += 1) {
        const cost = x[i - 1] === y[j - 1] ? 0 : 1;
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      }
      prev = cur;
    }
    return prev[y.length];
  }

  /*
   * 粗粒度音形键。把常见的不发音 / 同音拼法归一，让拼写不同但读音接近的词撞到
   * 同一个键上。这不是音标转写，只求「够用且稳定」，宁可漏判也不要乱判：
   * 漏判只是退回「形近」这一档，乱判会把音近说成形近，误导下一轮出题。
   */
  function soundKey(s) {
    let x = lettersOf(s);
    if (!x) return '';
    x = x
      .replace(/^kn/, 'n')
      .replace(/^wr/, 'r')
      .replace(/^wh/, 'w')
      .replace(/ph/g, 'f')
      .replace(/ck/g, 'k')
      .replace(/qu/g, 'kw')
      .replace(/c(?=[eiy])/g, 's')
      .replace(/c/g, 'k')
      .replace(/x/g, 'ks')
      .replace(/z/g, 's')
      .replace(/[aeiouy]+/g, 'a')
      .replace(/(.)\1+/g, '$1');
    if (x.length > 3 && x.slice(-1) === 'e') x = x.slice(0, -1);
    return x;
  }

  // 只差一个屈折后缀时，返回后缀类型；否则返回空串。
  // near / nears 是这一档；plays / played 也在这一档。两者的区别留给上下文判。
  function suffixKind(a, b) {
    const pairs = [[lettersOf(a), lettersOf(b)], [lettersOf(b), lettersOf(a)]];
    for (let i = 0; i < pairs.length; i += 1) {
      const base = pairs[i][0];
      const form = pairs[i][1];
      if (!base || !form || form.length <= base.length) continue;
      if (form.indexOf(base) !== 0) {
        // 去 e 再加 ing（use → using）、双写辅音（run → running）也算屈折
        const stem = base.replace(/e$/, '');
        if (stem && form.indexOf(stem) === 0) {
          const suf0 = form.slice(stem.length);
          if (/^(ing|ed|er|est)$/.test(suf0)) return 'verb';
        }
        continue;
      }
      const suf = form.slice(base.length);
      if (/^(s|es|ies)$/.test(suf)) return 'number';
      if (/^(ed|d|ing|er|est)$/.test(suf)) return 'verb';
    }
    return '';
  }

  function zhOf(unit, word) {
    const w = lettersOf(word);
    if (!w) return '';
    const hit = ((unit && unit.words) || []).filter(function (x) {
      return lettersOf(x.en) === w;
    })[0];
    return hit ? String(hit.zh || '') : '';
  }

  function inUnit(unit, word) {
    return !!zhOf(unit, word);
  }

  // 功能词（is / are / the / on …）。它们不在词表里，但学生学过——
  // 说「不在词表里所以他不会选」就错了，虚词的问题不在认不认识，在放得对不对。
  function isFunctionWord(unit, word) {
    const w = lettersOf(word);
    if (!w) return false;
    return ((unit && unit.allowedFunctionWords) || []).some(function (x) {
      return lettersOf(x) === w;
    });
  }

  /*
   * 不规则屈折。规则后缀（near → nears）能算出来，have → has 算不出来：
   * 差两个字母，按编辑距离会被判成「形近」，其实是同一个词的不同形式。
   * 这一小张表就是补这个漏，宁可少判也不要判错——判成「形近」会让他去背拼写，
   * 而他真正缺的是「第三人称单数要变形」。
   */
  const IRREGULAR = {
    'have': 'has', 'has': 'have',
    'do': 'does', 'does': 'do',
    'go': 'goes', 'goes': 'go',
    'be': 'is', 'is': 'be', 'am': 'be', 'are': 'be',
    'this': 'these', 'these': 'this',
    'that': 'those', 'those': 'that',
    'is': 'are', 'are': 'is',
    'was': 'were', 'were': 'was'
  };
  const NUMBER_WORDS = { 'is': 1, 'are': 1, 'was': 1, 'were': 1, 'this': 1, 'these': 1, 'that': 1, 'those': 1 };

  function irregularKind(a, b) {
    const x = lettersOf(a);
    const y = lettersOf(b);
    if (!x || !y || x === y) return '';
    if (IRREGULAR[x] !== y) return '';
    return NUMBER_WORDS[x] ? 'number' : 'verb';
  }

  // 两个词共同的前缀占较长那个词的比例。class / classroom 是 5/9，
  // 编辑距离看是 5 个字母「差很远」，实际是一眼分不开的形近词。
  function prefixRatio(a, b) {
    const x = lettersOf(a);
    const y = lettersOf(b);
    const n = Math.min(x.length, y.length);
    let i = 0;
    while (i < n && x[i] === y[i]) i += 1;
    return i / Math.max(x.length, y.length, 1);
  }

  /* ---------- 题干语境 ---------- */

  /*
   * 从题干里读两类语境。这是为了区分「near / nears 该不该加 s」这类问题：
   * 同样是差一个 s，题干里有 are / many / two 就是单复数，没有就是三单或拼写。
   * 只看题目本身，不看知识点标签——标签是出题者写的，不是证据。
   */
  function contextOf(question) {
    const text = low(question && question.prompt);
    return {
      plural: /\b(are|were|these|those|many|two|three|four|five|six|seven|eight|nine|ten|some|they)\b/.test(text),
      be: /\b(is|am|are|was|were)\b/.test(text),
      thirdPerson: /\b(he|she|it|his|her)\b/.test(text),
      blank: /___+|___|（\s*）|\(\s*\)/.test(text)
    };
  }

  /* ---------- 选项级归因 ---------- */

  function optionFeatures(question, unit, index) {
    const opts = (question.options || []).map(function (o) { return String(o == null ? '' : o).trim(); });
    const ansIndex = answerIndex(question);
    const ans = opts[ansIndex] == null ? String(question.answer || '') : opts[ansIndex];
    const opt = opts[index] || '';
    const dist = editDistance(opt, ans);
    const longest = Math.max(lettersOf(opt).length, lettersOf(ans).length, 1);
    const zhOpt = zhOf(unit, opt);
    const zhAns = zhOf(unit, ans);
    const sameSound = soundKey(opt).length > 1 && soundKey(opt) === soundKey(ans);
    return {
      index: index,
      option: opt,
      answer: ans,
      dist: dist,
      // 差几个字母 / 较长那个的长度。0 是完全一样，1 是完全不同。
      gap: dist / longest,
      letters: lettersOf(opt).length,
      soundSame: sameSound,
      suffix: suffixKind(ans, opt),
      irregular: irregularKind(ans, opt),
      prefix: prefixRatio(opt, ans),
      zh: zhOpt,
      zhAnswer: zhAns,
      zhClose: !!(zhOpt && zhAns && (zhOpt === zhAns || zhOpt.indexOf(zhAns) >= 0 || zhAns.indexOf(zhOpt) >= 0)),
      inUnit: !!zhOpt,
      isFunc: isFunctionWord(unit, opt),
      lenRatio: lettersOf(ans).length ? lettersOf(opt).length / lettersOf(ans).length : 1
    };
  }

  function answerIndex(question) {
    const opts = (question && question.options) || [];
    const target = SHT.normAnswer ? SHT.normAnswer(question && question.answer) : low(question && question.answer);
    return opts.reduce(function (acc, o, i) {
      if (acc >= 0) return acc;
      const n = SHT.normAnswer ? SHT.normAnswer(o) : low(o);
      return n && n === target ? i : acc;
    }, -1);
  }

  /*
   * 被选中的那一项，为什么比别的选项更有吸引力。按「证据强度」从高到低判：
   * 同一词的不同形式 > 只差屈折 > 音同形不同 > 形近（含共同前缀）> 中文义近 > 认不出。
   * 顺序不能换：near / nears 既形近又只差屈折，它首先是个词形问题；
   * 而 have / has 编辑距离 2，按形近判会让他去背拼写，实际缺的是三单变形。
   */
  function causeOfPicked(f, ctx) {
    if (!f.option) return { id: '未掌握', why: '这一项是空的，等于没选', strong: 0.2 };
    if (f.dist === 0) return { id: '未掌握', why: '选项与答案写法相同，判分口径需要复核', strong: 0.2 };
    if (f.irregular === 'number') {
      return {
        id: ctx.plural ? '单复数' : '语法错形',
        why: '「' + f.option + '」和「' + f.answer + '」是同一个词的单复数形式（不规则变化），他用错了',
        strong: 0.74
      };
    }
    if (f.irregular === 'verb') {
      return {
        id: '语法错形',
        why: '「' + f.option + '」和「' + f.answer + '」是同一个词的不同形式，第三人称单数或时态用错了',
        strong: 0.74
      };
    }
    if (f.suffix === 'number') {
      return {
        id: ctx.plural ? '单复数' : '语法错形',
        why: '「' + f.option + '」是「' + f.answer + '」加 -s/-es 的形式，他把词形变化当成了另一个词',
        strong: 0.75
      };
    }
    if (f.suffix === 'verb') {
      return {
        id: '语法错形',
        why: '「' + f.option + '」是「' + f.answer + '」的屈折形式（-ed/-ing），时态或形式用错了',
        strong: 0.72
      };
    }
    if (f.soundSame && f.letters >= 3 && f.gap <= 0.5) {
      return {
        id: '音近混淆',
        why: '「' + f.option + '」和「' + f.answer + '」读音接近（拼写不同），他是按声音认的词',
        strong: 0.7
      };
    }
    if (f.gap <= 0.34 || f.prefix >= 0.5) {
      return {
        id: '形近混淆',
        why: '「' + f.option + '」和「' + f.answer + '」只差 ' + f.dist + ' 个字母' +
          (f.prefix >= 0.5 ? '，前半截一样' : '') + '，看形状分不开',
        strong: 0.72
      };
    }
    if (f.zhClose) {
      return {
        id: '近义混淆',
        why: '「' + f.option + '」（' + f.zh + '）和「' + f.answer + '」（' + f.zhAnswer + '）意思接近，他把词义边界弄混了',
        strong: 0.6
      };
    }
    // 两三个字母的短词（in / on、is / at）：既谈不上形近也谈不上音近，
    // 常见情形是两个虚词在该用哪个上分不清，按近义处理比按「没掌握」有用。
    if (f.letters <= 3 && f.dist <= 1) {
      return {
        id: '近义混淆',
        why: '「' + f.option + '」和「' + f.answer + '」都是短词，这类词靠用法区分，他把两个词的用法弄混了',
        strong: 0.55
      };
    }
    if (f.lenRatio > 2.2 || f.lenRatio < 0.45) {
      return {
        id: '未掌握',
        why: '「' + f.option + '」和答案长短差太多，看着就不像，更像没认出正确答案',
        strong: 0.45
      };
    }
    return {
      id: '未掌握',
      why: '「' + f.option + '」和「' + f.answer + '」看不出直接关系，更像是没认出这个词',
      strong: 0.35
    };
  }

  /*
   * 没被选的那两项：他为什么一眼排掉了。这是「不只是错了」的另一半——
   * 排掉 C、D 说明他会分辨，问题只出在 B 这一处，下一轮就该继续在 B 这一维上出题，
   * 而不是把整个考点推倒重来。
   */
  function whyEliminated(f) {
    if (!f.option) return '这一项是空的，不用排';
    if (f.isFunc) return '是虚词，放到这个句子里读不通，他靠语感就排掉了';
    if (!f.inUnit && f.gap >= 0.6) return '不在本单元词表里，也不像正确答案的写法，他不认识';
    if (f.gap >= 0.7 && !f.zhClose) {
      return '和正确答案差 ' + f.dist + ' 个字母，形状上没关系，一眼能分开';
    }
    if (!f.inUnit) return '不在本单元词表里，他没学过，不会去选';
    if (f.zh && f.zhAnswer && !f.zhClose) {
      return '中文意思差得远（' + f.zh + ' / ' + f.zhAnswer + '），语境对不上';
    }
    if (f.lenRatio > 2.2) return '比正确答案长得多，看长度就能排掉';
    if (f.suffix || f.irregular) return '是词形变化，但他没往这个方向想';
    return '和正确答案有距离，但不算远，这一项其实有干扰力';
  }

  /* ---------- 词元对齐（开放题） ---------- */

  // LCS 对齐：返回一串 {op:'same'|'add'|'drop'|'swap'}，从「答案 → 学生写的」看变化。
  function align(answer, student) {
    const a = tokensOf(answer);
    const b = tokensOf(student);
    const n = a.length;
    const m = b.length;
    const dp = [];
    for (let i = 0; i <= n; i += 1) {
      dp[i] = [];
      for (let j = 0; j <= m; j += 1) dp[i][j] = 0;
    }
    for (let i = 1; i <= n; i += 1) {
      for (let j = 1; j <= m; j += 1) {
        dp[i][j] = a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1] + 1
          : Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
    const ops = [];
    let i = n;
    let j = m;
    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
        ops.push({ op: 'same', a: a[i - 1], b: b[j - 1] });
        i -= 1; j -= 1;
      } else if (i > 0 && j > 0 && dp[i][j - 1] === dp[i][j] && dp[i - 1][j] === dp[i][j]) {
        // 既可能是加词也可能是替词：记成替换，后面按词形再判
        ops.push({ op: 'swap', a: a[i - 1], b: b[j - 1] });
        i -= 1; j -= 1;
      } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
        ops.push({ op: 'add', a: '', b: b[j - 1] });
        j -= 1;
      } else {
        ops.push({ op: 'drop', a: a[i - 1], b: '' });
        i -= 1;
      }
    }
    return ops.reverse();
  }

  const BE = ['is', 'am', 'are', 'was', 'were', 'be', 'been'];
  const ART = ['a', 'an', 'the'];

  /*
   * 从对齐结果里归因。判据都是「哪一类词动了」：
   *   漏 be 动词 / 漏冠词 / 漏三单 s → 语法错形
   *   漏复数 s → 单复数
   *   同样的词换了个顺序 → 母语负迁移（按中文语序排英文）
   *   换成另一个学过的词、中文义接近 → 近义混淆
   */
  function classifyAlignment(ops, unit, ctx) {
    const notes = [];
    let cause = '';
    let strong = 0;

    ops.forEach(function (o) {
      if (o.op === 'same') return;
      const a = low(o.a);
      const b = low(o.b);

      if (o.op === 'drop' && BE.indexOf(a) >= 0) {
        notes.push('漏了 be 动词「' + a + '」，句子没有谓语');
        cause = cause || '语法错形'; strong = Math.max(strong, 0.8);
        return;
      }
      if (o.op === 'add' && BE.indexOf(b) >= 0) {
        notes.push('多加了 be 动词「' + b + '」，这里不该有');
        cause = cause || '语法错形'; strong = Math.max(strong, 0.7);
        return;
      }
      if (o.op === 'drop' && ART.indexOf(a) >= 0) {
        notes.push('漏了冠词「' + a + '」');
        cause = cause || '语法错形'; strong = Math.max(strong, 0.65);
        return;
      }
      if (o.op === 'drop' && /s$/.test(a) && inUnit(unit, a.replace(/s$/, ''))) {
        notes.push('「' + a + '」的 -s 漏了，' + (ctx.plural ? '这里该用复数' : '这里是三单'));
        cause = cause || (ctx.plural ? '单复数' : '语法错形'); strong = Math.max(strong, 0.72);
        return;
      }
      if (o.op === 'swap' || o.op === 'add') {
        const kind = suffixKind(b || '', a || '');
        if (kind === 'number') {
          notes.push('「' + (b || o.b) + '」和「' + (a || o.a) + '」只差单复数');
          cause = cause || (ctx.plural ? '单复数' : '语法错形'); strong = Math.max(strong, 0.68);
          return;
        }
        if (kind === 'verb') {
          notes.push('「' + (b || o.b) + '」把「' + (a || o.a) + '」的时态/形式改了');
          cause = cause || '语法错形'; strong = Math.max(strong, 0.66);
          return;
        }
      }
      if (o.op === 'swap') {
        const dist = editDistance(a, b);
        const longest = Math.max(a.length, b.length, 1);
        if (dist / longest <= 0.4) {
          notes.push('「' + o.a + '」写成了「' + o.b + '」，差 ' + dist + ' 个字母');
          cause = cause || '形近混淆'; strong = Math.max(strong, 0.6);
          return;
        }
        const zhA = zhOf(unit, o.a);
        const zhB = zhOf(unit, o.b);
        if (zhA && zhB && !(zhA === zhB || zhA.indexOf(zhB) >= 0 || zhB.indexOf(zhA) >= 0)) {
          notes.push('把「' + o.a + '」（' + zhA + '）换成了「' + o.b + '」（' + zhB + '）');
          cause = cause || '近义混淆'; strong = Math.max(strong, 0.55);
          return;
        }
      }
      if (o.op === 'drop' || o.op === 'add') {
        notes.push((o.op === 'drop' ? '少了「' + o.a + '」' : '多了「' + o.b + '」'));
        cause = cause || '语法错形'; strong = Math.max(strong, 0.5);
      }
    });

    // 词序颠倒：词都用了，顺序不一样。中文里「我书」没问题，英文里不行。
    const sameSet = function () {
      const fromAnswer = tokensOf(ops.map(function (o) { return o.a; }).filter(Boolean).join(' '));
      const fromStudent = tokensOf(ops.map(function (o) { return o.b; }).filter(Boolean).join(' '));
      if (fromAnswer.length !== fromStudent.length) return false;
      const sortedA = fromAnswer.slice().sort();
      const sortedB = fromStudent.slice().sort();
      return sortedA.join(' ') === sortedB.join(' ') && sortedA.join(' ') !== fromAnswer.join(' ');
    };
    if (sameSet()) {
      notes.push('词都用了，但顺序按中文排的');
      cause = '母语负迁移';
      strong = Math.max(strong, 0.78);
    }

    if (!cause) {
      cause = '未掌握';
      strong = 0.35;
      notes.push('写的句子和标准答案对不上，看不出属于哪一类错法');
    }
    return { id: cause, why: notes.join('；'), strong: strong };
  }

  /* ---------- 作答节奏 ---------- */

  /*
   * 耗时不是错因，是错因的可信度校正：
   *   秒选 → 可能根本没读题，任何「他分不清 X 和 Y」的判断都要打折
   *   想了很久还错 → 是真的在辨，辨析类错因更可信
   *   用了提示还错 → 不是辨析问题，是没掌握
   */
  function timingOf(attempt) {
    const ms = Number((attempt && attempt.durationMs) || 0);
    const hint = Number((attempt && attempt.hintCount) || 0);
    let band = 'unknown';
    let note = '';
    if (hint > 0) {
      band = 'hinted';
      note = '用了提示还答错，说明不是没看清，是没掌握';
    } else if (ms > 0 && ms < 3000) {
      band = 'quick';
      note = '3 秒内作答，像没读完题就选了';
    } else if (ms >= 20000) {
      band = 'slow';
      note = '想了 20 秒以上，是真的在辨';
    } else if (ms > 0) {
      band = 'normal';
      note = '';
    }
    return { ms: ms, band: band, note: note, hint: hint };
  }

  /* ---------- 下一步 ---------- */

  function nextStepOf(causeId) {
    const map = {
      '形近混淆': '下一轮出同一组词形对比，先让他把两个词的字母指出来再选',
      '音近混淆': '下一轮改听音辨词，先分元音再选，别给拼写',
      '语法错形': '下一轮把正确形式填回句子里读一遍，先问「句子里有没有 be 动词」',
      '单复数': '下一轮先问 be 动词是 is 还是 are，再定名词单复数',
      '近义混淆': '下一轮用中文场景区分两个词：什么场合用哪个',
      '母语负迁移': '下一轮先排英文语序再翻中文，别让他逐词译',
      '未掌握': '下一轮降一层，先做「认」：给中文选英文'
    };
    return map[causeId] || map['未掌握'];
  }

  /* ---------- 主入口 ---------- */

  function blank() {
    return {
      ok: false, correct: false, causeId: '', causeLabel: '', confidence: 0,
      headline: '', whyPicked: '', eliminated: [], signals: [],
      timing: { ms: 0, band: 'unknown', note: '', hint: 0 },
      nextStep: '', source: 'code', at: ''
    };
  }

  /**
   * 诊断一次作答。纯函数，不读全局、不改入参。
   * @param {object} opts { question, attempt, unit }
   * attempt: { picked, correct, durationMs, hintCount }
   */
  function judge(opts) {
    const o = opts || {};
    const q = o.question || {};
    const attempt = o.attempt || {};
    const unit = o.unit || (SHT.curriculum || {});
    const timing = timingOf(attempt);
    const ctx = contextOf(q);
    const out = blank();
    out.timing = timing;
    out.at = new Date().toISOString();
    out.source = 'code';

    if (attempt.correct) {
      out.ok = true;
      out.correct = true;
      // 答对也有话说：快答、想出来、靠提示，三种「对」的可信度完全不同。
      // 这条直接接到「连对两次才算真会」上，第一次对得越快，越可能是记住了那道题。
      if (timing.band === 'hinted') {
        out.causeId = '看提示才会';
        out.headline = '是答对了，但用了提示，不算独立答对';
        out.confidence = 0.8;
        out.nextStep = '下一轮同考点换题面再考一次，别再给提示';
      } else if (timing.band === 'quick') {
        out.causeId = '秒答';
        out.headline = '3 秒内答对，像记住了答案而不是想出来的';
        out.confidence = 0.6;
        out.nextStep = '下一轮同考点换场景再考，验证是不是真会';
      } else if (timing.band === 'slow') {
        out.causeId = '想出来的';
        out.headline = '想了很久才对，是真在想，但还不熟';
        out.confidence = 0.55;
        out.nextStep = '下一轮同考点再练一次，把反应速度压下来';
      } else {
        out.causeId = '答对';
        out.headline = '正常作答答对';
        out.confidence = 0.5;
        out.nextStep = '下一轮换题面再验一次';
      }
      out.causeLabel = out.causeId;
      return out;
    }

    const isChoice = (SHT.grade && SHT.grade.mode) ? SHT.grade.mode(q) === 'choice' : (q.options || []).length >= 2;
    let picked = null;
    let cause = null;

    if (isChoice) {
      const ai = answerIndex(q);
      const pickedText = String(attempt.picked == null ? '' : attempt.picked).trim();
      const pickedIndex = (q.options || []).reduce(function (acc, opt, i) {
        if (acc >= 0) return acc;
        return String(opt == null ? '' : opt).trim() === pickedText ? i : acc;
      }, -1);
      picked = pickedIndex >= 0 ? optionFeatures(q, unit, pickedIndex) : null;
      if (!picked) {
        // 选的东西不在选项里（人工补记的错题常见）：没有可比对象，只能给弱结论
        out.ok = true;
        out.causeId = '未掌握';
        out.causeLabel = '尚未掌握';
        out.confidence = 0.2;
        out.headline = '他选的「' + pickedText + '」不在这道题的选项里，对不上';
        out.nextStep = nextStepOf('未掌握');
        return out;
      }
      cause = causeOfPicked(picked, ctx);
      out.whyPicked = cause.why;

      // 另外两个错项为什么被排掉。留一条就够，两条都在「一眼能分开」时是废话。
      (q.options || []).forEach(function (opt, i) {
        if (i === pickedIndex || i === ai) return;
        const f = optionFeatures(q, unit, i);
        if (!f.option) return;
        out.eliminated.push({ index: i, letter: String.fromCharCode(65 + i), option: f.option, why: whyEliminated(f) });
      });

      if (picked.dist <= 4) {
        out.signals.push({ kind: 'spell', text: '与正确答案差 ' + picked.dist + ' 个字母（' + picked.option + ' / ' + picked.answer + '）' });
      }
      if (picked.soundSame) {
        out.signals.push({ kind: 'sound', text: '两个词读音接近（音形键都是 ' + soundKey(picked.option) + '）' });
      }
      if (picked.zhClose) {
        out.signals.push({ kind: 'meaning', text: '中文义接近：' + picked.zh + ' / ' + picked.zhAnswer });
      }
      // 排除理由放在 eliminated 里单独一块展示，不再往 signals 里复制一遍——
      // 界面上同一句话出现两次，读的人会以为是两个不同的依据。
    } else {
      const ops = align(String(q.answer || ''), String(attempt.picked || ''));
      cause = classifyAlignment(ops, unit, ctx);
      out.whyPicked = cause.why;
      ops.filter(function (o2) { return o2.op !== 'same'; }).forEach(function (o2) {
        out.signals.push({
          kind: o2.op,
          text: (o2.op === 'drop' ? '少了「' + o2.a + '」' : o2.op === 'add' ? '多了「' + o2.b + '」' : '「' + o2.a + '」写成了「' + o2.b + '」')
        });
      });
    }

    out.ok = true;
    out.correct = false;
    out.causeId = cause.id;
    out.causeLabel = (SHT.causeById ? SHT.causeById(cause.id).label : cause.id);
    out.headline = headOf(cause.id, picked);
    out.nextStep = nextStepOf(cause.id);

    // 置信度：证据越硬越高，节奏越可疑越低。上下都留了边界，
    // 不许出现 0 或 1——诊断永远是假设，不是判决。
    let conf = 0.3 + cause.strong * 0.45;
    if (out.eliminated.length) conf += 0.06;
    if (timing.band === 'normal') conf += 0.08;
    if (timing.band === 'slow') conf += 0.05;
    if (timing.band === 'quick') conf -= 0.15;
    if (timing.band === 'hinted') conf -= 0.08;
    out.confidence = Math.round(Math.max(0.15, Math.min(0.95, conf)) * 100) / 100;
    return out;
  }

  function headOf(causeId, picked) {
    const map = {
      '形近混淆': '形近混淆',
      '音近混淆': '音近混淆',
      '语法错形': '语法错形',
      '单复数': '单复数没对上',
      '近义混淆': '近义混淆',
      '母语负迁移': '按中文语序直译',
      '未掌握': '没认出正确答案'
    };
    const base = map[causeId] || causeId;
    if (!picked) return base;
    return base + ' · 选了「' + picked.option + '」没选「' + picked.answer + '」';
  }

  /* ---------- 冻结 ---------- */

  function keyOf(question, attempt, roundNo) {
    const answer = String((attempt && attempt.picked) == null ? '' : attempt.picked).trim();
    if (SHT.grade && SHT.grade.ledgerKey) return SHT.grade.ledgerKey(question, roundNo, answer);
    return String((question && question.qid) || (question && question.no) || '') + '|' + answer;
  }

  function read(store, question, attempt, roundNo) {
    const key = keyOf(question, attempt, roundNo);
    const hit = (store || {})[key];
    return hit ? Object.assign({}, hit) : null;
  }

  // 不可变写入：已有记录不覆盖。模型补诊走 appendModel()，是追加不是改写。
  function remember(store, question, attempt, roundNo, result) {
    const key = keyOf(question, attempt, roundNo);
    const next = Object.assign({}, store || {});
    if (next[key]) return store;
    next[key] = Object.assign({}, result, {
      key: key,
      raw: String((attempt && attempt.picked) == null ? '' : attempt.picked).trim(),
      at: result.at || new Date().toISOString()
    });
    return next;
  }

  /*
   * 模型补诊：只在代码给不出硬证据时用。它不能改写早已冻结的结论，
   * 只能把「我是这么看的」追加到同一个条目上，供人对照。
   */
  function appendModel(store, question, attempt, roundNo, view) {
    const key = keyOf(question, attempt, roundNo);
    const next = Object.assign({}, store || {});
    const prev = next[key] || {};
    next[key] = Object.assign({}, prev, {
      key: key,
      modelView: {
        causeId: view && view.causeId ? view.causeId : '',
        why: String((view && view.why) || '').slice(0, 120),
        confidence: Number((view && view.confidence) || 0),
        at: new Date().toISOString()
      },
      causeSource: 'model'
    });
    // 代码没有结论（或很弱）时，才让模型的那一份当主结论
    if (!prev.causeId || Number(prev.confidence || 0) < 0.4) {
      if (next[key].modelView.causeId) {
        next[key].causeId = next[key].modelView.causeId;
        next[key].causeLabel = SHT.causeById ? SHT.causeById(next[key].causeId).label : next[key].causeId;
        next[key].headline = next[key].modelView.why || prev.headline || '';
        next[key].confidence = next[key].modelView.confidence || prev.confidence || 0.3;
      }
    }
    return next;
  }

  /* ---------- 给界面和日志的一行摘要 ---------- */

  function summary(res) {
    if (!res || !res.ok) return '';
    const pct = Math.round((res.confidence || 0) * 100);
    if (res.correct) return res.headline + '（' + pct + '%）';
    const label = res.causeLabel || res.causeId || '未定';
    // headline 自己就带着错因前缀（给错题卡单独看用的），拼进一行时去掉，
    // 免得日志上出现「形近混淆 · 形近混淆 · 选了……」这种重复。
    const head = String(res.headline || '').replace(new RegExp('^' + label + ' · '), '');
    return label + (head ? ' · ' + head : '') + '（' + pct + '%）';
  }

  SHT.diagnose = {
    judge: judge,
    read: read,
    remember: remember,
    appendModel: appendModel,
    keyOf: keyOf,
    summary: summary,
    nextStepOf: nextStepOf,
    // 下面几个只给测试用：判据要能被单独验证，否则归因对不对没法查
    _editDistance: editDistance,
    _soundKey: soundKey,
    _suffixKind: suffixKind,
    _align: align,
    _optionFeatures: optionFeatures,
    _contextOf: contextOf,
    _timingOf: timingOf
  };
})(window);
