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
 *   - 变体要求「同格子、换表面」（防背题：换个词、换个空、换个应答，考点一模一样）
 * 所以变体不是新题，是探针。它不进去重台账，也不算出题产量。
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
      v.basis = '换词：' + target.en + '（原题考 ' + (question.audioText || question.answer) + '）';
    } else if (type === '中英匹配') {
      v.prompt = '选出「' + target.zh + '」的英文。';
      v.options = rotate([target.en, others[0].en, others[1].en], seed);
      v.answer = target.en;
      v.analysis = '「' + target.zh + '」是 ' + target.en + '。';
      v.basis = '换词：' + target.zh + '（原题考 ' + question.answer + '）';
    } else {
      const bad = misspell(target.en);
      if (bad.length < 2) return null;
      v.prompt = '选出 ' + target.en + ' 的正确拼写。';
      v.options = rotate([target.en, bad[0], bad[1]], seed);
      v.answer = target.en;
      v.analysis = target.en + ' 是' + target.zh + '，中间字母别漏。';
      v.basis = '换词：' + target.en + '（原题考 ' + question.answer + '）';
    }
    return v;
  }

  function phonicsVariant(question, seed) {
    const ph = (SHT.curriculum && SHT.curriculum.phonics) || {};
    const pairs = (ph.pairs || []).filter(function (p) { return p && p.length === 2; });
    if (!pairs.length) return null;
    const pair = pairs[seed % pairs.length];
    const extras = ph.extras || [];
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
    const others = SWAP_WORDS.filter(function (w) { return w !== hit.word; }).slice(0, 2);
    const parts = hit.line.split('—');

    const v = baseVariant(question);
    v.prompt = parts.length === 2
      ? '— ' + parts[0].trim() + '\n— ' + parts[1].trim().replace(new RegExp('\\b' + hit.word + '\\b', 'i'), '___')
      : hit.line.replace(new RegExp('\\b' + hit.word + '\\b', 'i'), '___');
    v.options = rotate([hit.word, others[0], others[1]], seed);
    v.answer = hit.word;
    v.analysis = '原句是 ' + hit.line + '，这里的 ' + hit.word + ' 不能换成别的介词。';
    v.basis = '换空：把句型表里的 ' + hit.word + ' 挖空（原题考 ' + question.answer + '）';
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
    // 变体的答案必须落在自己的选项里，否则这题不能答
    const inside = v.options.some(function (o) {
      return SHT.normAnswer(o) === SHT.normAnswer(v.answer);
    });
    if (!inside) return null;
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
   * 判据只有一条：换掉表面还答对，才算会。
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
