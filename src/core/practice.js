/*
 * 作答闭环核心逻辑（纯函数，无 DOM 依赖）
 *
 * 这一层补的是出题之后的那半条链，四件事：
 *   1. evaluateAnswer()  判对错。答案按「去空格 / 去标点 / 不分大小写」比对。
 *   2. buildVariant()    答错后换一道同考点的变体，看看是真会还是记住了这道题。
 *   3. judgePoint()      一个考点算不算会：原题 + 变体两枪都独立打中才是「真会」。
 *   4. upsertWrongCase() 还错就写进错题本；同考点只留一条，后续只追加作答。
 *
 * 变体的判据和出题相反，这点必须说清楚：
 *   - 出题要求「落不同格子」（防 diversity collapse，5 道题全长一个样）
 *   - 变体要求「同格子、换表面」（防背题），**并且答案必须换**（防答案惯性）
 * 所以变体不是新题，是探针。它不进去重台账，也不算出题产量。
 *
 * 变体四条铁律（接模型后同样适用，见 SHT.VARIANT_RULES）：
 *   1. 考点与格子不动 —— 换了考点就不是探针，是第 6 道题。
 *   2. 答案必须换个值 —— 答案不换，学生上一枪怎么选这一枪照选就赢，
 *      探的是「记住了上次那个选项」，不是「懂了这个考点」。
 *   3. 原题答案留在选项里当干扰项 —— 否则盲选的人只是「没得选」，
 *      他会退回去重读题，答案惯性就测不出来。
 *   4. 题干、载体、选项一起换 —— 只换选项顺序等于没换。
 */
(function (root) {
  const SHT = (root.SHT = root.SHT || {});

  /* ---------- 比对 ---------- */
  SHT.normAnswer = function (value) {
    return String(value == null ? '' : value)
      .toLowerCase()
      .replace(/[\u3000\s]+/g, ' ')
      .replace(/[.,!?;:'"’‘“”。，、！？；：]/g, '')
      .trim();
  };

  SHT.evaluateAnswer = function (question, pickedIndex) {
    const options = (question && question.options) || [];
    const expected = String((question && question.answer) || '').trim();
    const filled = options.filter(function (o) { return String(o || '').trim(); });
    if (!expected || filled.length < 2) {
      return { ok: false, reason: '这道题缺选项或答案，作答没有意义' };
    }
    if (pickedIndex == null || pickedIndex < 0 || pickedIndex >= options.length) {
      return { ok: false, reason: '先选一个答案' };
    }
    const picked = options[pickedIndex];
    const expectedIndex = options.reduce(function (acc, o, i) {
      return acc < 0 && SHT.normAnswer(o) === SHT.normAnswer(expected) ? i : acc;
    }, -1);
    return {
      ok: true,
      correct: SHT.normAnswer(picked) === SHT.normAnswer(expected),
      picked: picked,
      expected: expected,
      expectedIndex: expectedIndex
    };
  };

  /* ---------- 确定性取材 ---------- */
  function words() { return (SHT.curriculum && SHT.curriculum.words) || []; }

  /*
   * 变体的验收规格：以后接模型出变体，提示词里必须原样带上这四条，
   * 生成结果也要过 auditVariant() 这一关，不能靠模型自己声明合规。
   */
  SHT.VARIANT_RULES = [
    '考点与格子不动：知识点、变化轴四维与原题完全一致，换掉就不是探针',
    '答案必须换：新答案不能等于原题答案，否则答案惯性就能过关',
    '原题答案留在选项里当干扰项：盲选上一次答案的学生要被判错',
    '题干、载体、选项一起换：只调整选项顺序或措辞不算变体'
  ];

  function plain(w) {
    return w && w.en && w.en.indexOf(' ') < 0 && w.en.indexOf("'") < 0;
  }

  // 从词表里按 seed 往后找第一个满足条件的词：同 seed 永远同一个词，便于复现
  function pickWord(seed, accept) {
    const list = words();
    const n = list.length;
    if (!n) return null;
    const start = ((seed * 5) + 3) % n;
    for (let k = 0; k < n; k += 1) {
      const w = list[(start + k) % n];
      if (!accept || accept(w)) return w;
    }
    return null;
  }

  function distractorsOf(target, seed, field) {
    const list = words();
    const n = list.length;
    const out = [];
    for (let k = 1; k <= n && out.length < 2; k += 1) {
      const w = list[(seed + k * 3) % n];
      if (!plain(w) || w.en === target.en) continue;
      if (out.some(function (x) { return x[field] === w[field]; })) continue;
      if (w[field] === target[field]) continue;
      out.push(w);
    }
    return out;
  }

  function rotate(list, seed) {
    const n = list.length;
    if (!n) return list;
    const k = ((seed % n) + n) % n;
    return list.slice(k).concat(list.slice(0, k));
  }

  function escapeReg(text) {
    return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // 错拼：漏元音 / 交换相邻字母 / 双写字母减一。三种都确定性生成，取前两个。
  function misspell(word) {
    const w = String(word);
    const out = [];
    for (let i = w.length - 2; i > 0; i -= 1) {
      if ('aeiou'.indexOf(w[i].toLowerCase()) >= 0 && w[i - 1].toLowerCase() !== w[i].toLowerCase()) {
        out.push(w.slice(0, i) + w.slice(i + 1));
        break;
      }
    }
    if (w.length > 3) {
      const mid = Math.max(1, Math.floor(w.length / 2) - 1);
      out.push(w.slice(0, mid) + w[mid + 1] + w[mid] + w.slice(mid + 2));
    }
    const dup = w.match(/([bcdfghklmnprstvz])\1/i);
    if (dup) out.push(w.replace(/([bcdfghklmnprstvz])\1/i, '$1'));
    else if (w.length > 5) out.push(w.slice(0, 2) + w[1] + w.slice(2));
    const seen = new Set([w]);
    return out.filter(function (x) {
      if (!x || seen.has(x)) return false;
      seen.add(x);
      return true;
    });
  }

  /* ---------- 变体：同考点、同格子、换表面 ---------- */
  function baseVariant(question) {
    return {
      no: question.no,
      variantOf: question.no,
      stage: 'variant',
      knowledgePoint: question.knowledgePoint,
      ability: question.ability,
      cell: Object.assign({}, question.cell || {}),
      nextIfWrong: question.nextIfWrong,
      audioText: '',
      analysis: '',
      basis: ''
    };
  }

  function wordVariant(question, seed, type) {
    const spelling = type === '拼写补全' || type === '听写';
    const target = pickWord(seed, function (w) {
      if (!plain(w)) return false;
      if (spelling && w.en.length < 4) return false; // 太短的词编不出两个错拼
      return SHT.normAnswer(w.en) !== SHT.normAnswer(question.answer) &&
        SHT.normAnswer(w.zh) !== SHT.normAnswer(question.answer);
    });
    if (!target) return null;
    const others = distractorsOf(target, seed, 'zh');
    if (others.length < 2) return null;
    const v = baseVariant(question);

    if (type === '听音选义') {
      v.prompt = '听录音，选出你听到的单词的中文意思。';
      v.audioText = target.en;
      v.options = rotate([target.zh, others[0].zh, others[1].zh], seed);
      v.answer = target.zh;
      v.analysis = target.en + ' 是' + target.zh + '。';
      v.basis = '换词：' + target.en;
    } else if (type === '中英匹配') {
      v.prompt = '选出「' + target.zh + '」的英文。';
      v.options = rotate([target.en, others[0].en, others[1].en], seed);
      v.answer = target.en;
      v.analysis = '「' + target.zh + '」是 ' + target.en + '。';
      v.basis = '换词：' + target.zh;
    } else {
      const bad = misspell(target.en);
      if (bad.length < 2) return null;
      // 题干只给中文，不给英文原词 —— 否则答案是「照抄题干」
      v.prompt = '选出「' + target.zh + '」的正确拼写。';
      v.options = rotate([target.en, bad[0], bad[1]], seed);
      v.answer = target.en;
      v.analysis = '「' + target.zh + '」拼作 ' + target.en + '，中间字母别漏。';
      v.basis = '换词：' + target.en;
    }
    return v;
  }

  function phonicsVariant(question, seed) {
    const ph = (SHT.curriculum && SHT.curriculum.phonics) || {};
    const oldAns = SHT.normAnswer(question.answer);
    // 原答案所在的词对整组排除：换个 seed 就撞回同一个答案，等于没换
    const pairs = (ph.pairs || []).filter(function (p) {
      return p && p.length === 2 &&
        SHT.normAnswer(p[0]) !== oldAns && SHT.normAnswer(p[1]) !== oldAns;
    });
    if (!pairs.length) return null;
    const pair = pairs[seed % pairs.length];
    const extras = (ph.extras || []).filter(function (x) {
      return SHT.normAnswer(x) !== oldAns && SHT.normAnswer(x) !== SHT.normAnswer(pair[0]);
    });
    const third = extras.length ? extras[seed % extras.length] : pairs[(seed + 1) % pairs.length][0];
    const opts = [pair[0], pair[1], third].filter(function (x, i, arr) {
      return x && arr.indexOf(x) === i;
    });
    if (opts.length < 3) return null;
    const v = baseVariant(question);
    v.prompt = '听录音，选出你听到的单词。';
    v.audioText = pair[0];
    v.options = rotate(opts, seed);
    v.answer = pair[0];
    v.analysis = pair[0] + ' 读短音，' + pair[1] + ' 读字母音。';
    v.basis = '换字母组：' + pair[0] + ' / ' + pair[1];
    return v;
  }

  /*
   * 选词填空 / 句子判断：只用句型表里的整句，把另一个「位置介词」挖空。
   * 不替换句中的名词 —— 词表没有词性标注，换错词性会造出 "Where is the clean?" 这种病句。
   * 挖介词则永远同考点：原题考 on / in，变体考 near / on / in，还是位置介词。
   */
  const SWAP_WORDS = ['in', 'on', 'under', 'near', 'at', 'to', 'with', 'for'];

  function patternBlankVariant(question, seed) {
    const patterns = (SHT.curriculum && SHT.curriculum.sentencePatterns) || [];
    if (!patterns.length) return null;
    const answer = SHT.normAnswer(question.answer);
    const pool = [];
    patterns.forEach(function (line) {
      SWAP_WORDS.forEach(function (w) {
        if (w === answer) return;
        if (!new RegExp('\\b' + w + '\\b', 'i').test(line)) return;
        pool.push({ line: line, word: w });
      });
    });
    if (!pool.length) return null;
    const hit = pool[seed % pool.length];
    // 干扰项优先取同族介词；原题答案由 withBait() 统一补进来当诱饵
    const others = SWAP_WORDS.filter(function (w) { return w !== hit.word; }).slice(0, 2);
    // 先在整句上挖空，再拆成问答两行。
    // 只对后半句 replace 是个真 bug：介词在前半句时挖不到，题干里还留着答案，变体被判废。
    const blanked = hit.line.replace(new RegExp('\\b' + hit.word + '\\b', 'i'), '___');
    const parts = blanked.split('—');

    const v = baseVariant(question);
    v.prompt = parts.length === 2
      ? '— ' + parts[0].trim() + '\n— ' + parts[1].trim()
      : blanked;
    v.options = rotate([hit.word, others[0], others[1]], seed);
    v.answer = hit.word;
    // 解析要压到 25 字内：变体也过同一道闸（V5），把整句原句抄进来必然超长
    v.analysis = '这里用 ' + hit.word + '，换成别的介词就不对了。';
    v.basis = '换空：' + hit.line;
    return v;
  }

  // 对话补全：句型表里换一组问答，考的还是「怎么应答」
  function dialogueVariant(question, seed) {
    const patterns = (SHT.curriculum && SHT.curriculum.sentencePatterns) || [];
    const pairs = patterns.map(function (p) {
      // 三句连问的句型（A — B — C）取后两句：B 是那一问，C 是那一答
      const parts = String(p).split('—').map(function (s) { return s.trim(); }).filter(Boolean);
      if (parts.length < 2) return null;
      return { q: parts[parts.length - 2], r: parts[parts.length - 1] };
    }).filter(function (d) {
      return d && d.q && d.r && SHT.normAnswer(d.r) !== SHT.normAnswer(question.answer);
    });
    if (!pairs.length) return null;
    const d = pairs[seed % pairs.length];
    const rests = (question.options || []).filter(function (o) {
      return SHT.normAnswer(o) !== SHT.normAnswer(d.r);
    }).slice(0, 2);
    if (rests.length < 2) return null;

    const v = baseVariant(question);
    v.prompt = '— ' + d.q + '\n— ___';
    v.options = rotate([d.r].concat(rests), seed);
    v.answer = d.r;
    v.analysis = '顺着上一句的问法答，选 ' + d.r;
    v.basis = '换问答：' + d.q;
    return v;
  }

  /*
   * 原题答案降级为干扰项。这一步决定探针有没有牙：
   * 选项里没有旧答案，盲选的学生只是「找不到」，他会退回去重读题，
   * 答案惯性就测不出来。旧答案留在选项里，他才可能一头撞上去。
   */
  function withBait(question, v) {
    const oldRaw = String(question.answer || '').trim();
    const oldAns = SHT.normAnswer(oldRaw);
    const newAns = SHT.normAnswer(v.answer);
    if (!oldAns || !newAns || oldAns === newAns) return v;
    const opts = (v.options || []).slice();
    if (opts.some(function (o) { return SHT.normAnswer(o) === oldAns; })) return v;
    for (let i = opts.length - 1; i >= 0; i -= 1) {
      if (!String(opts[i] || '').trim()) continue;
      if (SHT.normAnswer(opts[i]) === newAns) continue;
      opts[i] = oldRaw;
      v.options = opts;
      return v;
    }
    return v;
  }

  /*
   * 硬校验：任何分支出的变体都要过这一关，过不了就当「接不出变体」，不硬编。
   * 这一层不能由生成方自己声明合规 —— 自查只能当线索。
   */
  function auditVariant(question, v) {
    if (!v) return null;
    const oldAns = SHT.normAnswer(question.answer);
    const newAns = SHT.normAnswer(v.answer);
    if (!newAns) return null;
    if (oldAns && newAns === oldAns) return null;   // 铁律 2：答案没换，等于复读
    const opts = (v.options || []).map(SHT.normAnswer).filter(Boolean);
    if (opts.length < 2) return null;
    if (opts.indexOf(newAns) < 0) return null;      // 答案必须落在自己的选项里
    // 题干里不许出现答案原词：拼写题最容易把答案当题干给出来
    const prompt = String(v.prompt || '');
    if (/^[a-z]+$/i.test(String(v.answer)) &&
        new RegExp('(^|[^a-z])' + escapeReg(v.answer) + '([^a-z]|$)', 'i').test(prompt)) {
      return null;
    }
    return v;
  }

  SHT.buildVariant = function (question, seedNo) {
    if (!question) return null;
    const type = question.cell ? question.cell.type : '';
    const seed = Math.abs(seedNo || question.no || 1);
    let v = null;
    if (type === '听音选义' || type === '中英匹配' || type === '拼写补全' || type === '听写') {
      v = wordVariant(question, seed, type);
    } else if (type === '字母组合辨音') {
      v = phonicsVariant(question, seed);
    } else if (type === '选词填空' || type === '句子判断') {
      v = patternBlankVariant(question, seed);
    } else if (type === '对话补全') {
      v = dialogueVariant(question, seed);
    }
    if (!v) return null;
    v = withBait(question, v);
    if (!auditVariant(question, v)) return null;
    // 变体是代码派生的，但它照样要过同一道闸：实测派生出来的题干会引用句型原文里
    // 没进词表的词（TV / many），不过闸的变体发给学生，等于把超纲词当成学生的错。
    // 过不了就当接不出变体——这比发一道坏题诚实。
    if (SHT.validateQuestion) {
      const gate = SHT.validateQuestion(
        Object.assign({}, v, { knowledgePoint: question.knowledgePoint || '变体探针' }),
        SHT.curriculum,
        { exempt: [question.answer] }
      );
      if (!gate.pass) return null;
    }
    // 答案变化单独成字段，不塞进 basis 的长句里：界面把它当标签显示
    v.answerShift = String(question.answer || '').trim() + ' → ' + v.answer;
    return v;
  };

  /* ---------- 这个考点到底会不会 ---------- */
  SHT.POINT_STATES = {
    unseen: { label: '未测', tone: '' },
    mastered: { label: '真会', tone: 'is-good' },
    passed: { label: '会用', tone: 'is-good' },
    assisted: { label: '看提示才会', tone: 'is-warn' },
    fragile: { label: '只记住这道题', tone: 'is-warn' },
    wrong: { label: '不会', tone: 'is-bad' }
  };

  /*
   * 判据只有一条：换掉题面、换掉答案还答对，才算会。
   *   原题对 + 变体对            → mastered（真会）
   *   原题对 + 变体错            → fragile（只记住这道题）
   *   原题错 + 变体对            → passed（换个角度才会，还没稳）
   *   原题对 + 做不出变体        → passed（未验证，别写成真会）
   *   原题错 + 变体错 / 无变体   → wrong（写错题）
   * 任一枪用了提示，最高只到 assisted，不许算 mastered。
   */
  SHT.judgePoint = function (attempts) {
    const list = attempts || [];
    const first = list.filter(function (a) { return a.stage === 'first'; })[0] || null;
    const variant = list.filter(function (a) { return a.stage === 'variant'; })[0] || null;
    if (!first) return { state: 'unseen', label: '未测', tone: '' };
    const hinted = function (a) { return a && (a.hintCount || 0) > 0; };
    let state;
    if (!first.correct) {
      state = variant && variant.correct ? 'passed' : 'wrong';
    } else if (!variant) {
      state = 'passed';
    } else if (variant.correct) {
      state = 'mastered';
    } else {
      state = 'fragile';
    }
    if (state === 'mastered' && (hinted(first) || hinted(variant))) state = 'assisted';
    const meta = SHT.POINT_STATES[state];
    return { state: state, label: meta.label, tone: meta.tone };
  };

  /* ---------- 错题回写：同考点只留一条 ---------- */
  SHT.upsertWrongCase = function (cases, draft) {
    const list = (cases || []).slice();
    const key = draft.kpId || draft.knowledgePoint;
    const at = list.reduce(function (acc, c, i) {
      if (acc >= 0) return acc;
      return (c.kpId || c.knowledgePoint) === key ? i : acc;
    }, -1);

    if (at >= 0) {
      list[at] = SHT.appendVariantAttempt(list[at], {
        correct: false,
        hintCount: draft.hintCount || 0,
        retryCount: 0,
        purpose: 'remediation-training',
        completedAt: draft.at
      });
      return { list: list, index: at, created: false };
    }

    const originalQuestionId = draft.originalQuestionId || ('q-' + Date.now().toString(36));
    const created = {
      id: SHT.makeWrongCaseId(draft.studentId || 'S-001', draft.unitId || '', originalQuestionId),
      studentId: draft.studentId || 'S-001',
      unitId: draft.unitId || '',
      originalQuestionId: originalQuestionId,
      kpId: draft.kpId || '',
      knowledgePoint: draft.knowledgePoint,
      ability: draft.ability || 'vocab',
      category: draft.category || '未掌握',
      errorCause: draft.errorCause || '未填写错因说明',
      questionSnapshot: draft.questionSnapshot || '（未记录原题）',
      studentAnswer: draft.studentAnswer || '（未记录）',
      correctAnswer: draft.correctAnswer || '（未记录）',
      firstAttemptEvidence: {
        durationMs: 0,
        hintCount: draft.hintCount || 0,
        retryCount: 0,
        completedAt: draft.at || new Date().toISOString()
      },
      variantAttempts: [],
      masteryState: 'wrong',
      remediationLoopCount: 0,
      certificationScore: null,
      createdAt: draft.at || new Date().toISOString()
    };
    list.push(created);
    return { list: list, index: list.length - 1, created: true };
  };
})(window);
