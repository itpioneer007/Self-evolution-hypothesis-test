/*
 * 审计：把「这套东西到底达没达标」变成可算的东西（纯函数，无 DOM）
 *
 * 四条达标线是用户定的，不是我们编的：
 *   一 变体质量：答案必换、考点必同、伪变体率 ≤20%、验证角色拦得住混进来的坏题
 *   二 信息隔离：验证角色的上下文里不许出现学情（防同情偏差）
 *   三 进化机制：第二轮的题要挂得上第一轮的错题、要集中打同一个错因、难度要跟着对错走
 *   四 工程可复现：同一题同一答案重判结论必须一致，四角色各自输出了什么要拆得开
 *
 * 为什么单独一个模块而不是写进界面里：这四条要能被测试断言，也要能被导出成 JSON 复核。
 * 写进渲染函数就只能在界面上看，评审时没法复算。所以这里全部是纯函数：
 * 输入 state（或它的片段），输出结论 + 证据。界面只负责画。
 *
 * 一条原则：算不出就写「没有数据」，不猜。空数据必须显示成「没跑过」，不能显示成达标。
 */
(function (root) {
  const SHT = (root.SHT = root.SHT || {});

  /*
   * 学情词表：验证角色的上下文里出现任何一个，就说明它看到了不该看的东西。
   * 只列「一定属于学情」的词。像「学生」这种，检查项条文里本来就有
   * （「适合小学生」），列进来会天天误报，所以不列。
   */
  const STUDENT_WORDS = [
    '掌握概率', 'pKnown', '错题', '错因', '诊断', '画像', '上次他选',
    '他选的是', '错误次数', 'missCount', 'priority', '基础差', '偏弱',
    '学得慢', '他做不出来', '对他太难', '难度对他', '错了几次', '回练'
  ];

  // 验证角色的上下文里「应该出现」的段落。一个都没有，说明它拿到的不是一道题。
  const VERIFY_FIELDS = ['题型', '题干', '选项', '答案', '解析', '词表'];

  /*
   * 存档里的 rounds 是 { 1: {...}, 2: {...} }（按轮号存），不是数组。
   * 审计这边一律按 [第一轮, 第二轮] 用，所以先归一化——
   * 这个错在界面上一查就露：整页渲染直接抛 "rounds.forEach is not a function"，
   * 结果是一片空白的深色底。纯函数层不许假设调用方传什么形状。
   */
  function roundList(rounds) {
    if (Array.isArray(rounds)) return rounds;
    if (rounds && typeof rounds === 'object') {
      return [rounds[1] || rounds['1'] || null, rounds[2] || rounds['2'] || null];
    }
    return [];
  }

  function normText(s) {
    return String(s == null ? '' : s).toLowerCase().replace(/\s+/g, ' ').trim();
  }

  /** 扫描一段文本里有没有学情词。返回命中清单（空 = 干净）。 */
  function scanLeak(text) {
    const raw = String(text == null ? '' : text);
    const hits = [];
    STUDENT_WORDS.forEach(function (w) {
      if (raw.indexOf(w) >= 0) {
        // 位置也记下来：界面上要能在原文里指出「第几个字开始」
        hits.push({ word: w, at: raw.indexOf(w) });
      }
    });
    return { ok: hits.length === 0, hits: hits };
  }

  /** 验证角色的上下文里带了哪些字段（用来证明「它只看得到题目本身」）。 */
  function verifyFields(text) {
    const raw = String(text == null ? '' : text);
    return VERIFY_FIELDS.filter(function (f) { return raw.indexOf(f) >= 0; });
  }

  /*
   * 伪变体判定：题干骨架完全相同 → 只换了个人名/地名，句子结构一动不动。
   *
   * 骨架怎么算：把答案和三个选项里的词全部挖成占位符（这些本来就必须换），
   * 再去掉标点空白。剩下的部分如果一模一样，那就是同一句话换了指名对象。
   * 不用编辑距离：同考点的题本来就长得很像，距离算出来都是「高相似」，
   * 分不出「换了场景」和「只换了人名」。
   */
  function skeleton(prompt, dropWords) {
    let s = normText(prompt);
    (dropWords || []).forEach(function (w) {
      const t = normText(w);
      if (!t || t.length < 2) return;
      s = s.split(t).join('＿');
    });
    // 引号里的内容通常就是被替换的那个人名/地名
    s = s.replace(/[「"'][^」"']*[」"']/g, '＿');
    s = s.replace(/[\s，。、？！：；,.?!:;—–\-\/\\()（）"'’]+/g, '');
    return s;
  }

  function answerOf(item) {
    return String((item && item.answer) == null ? '' : item.answer);
  }

  /**
   * 变体对照表：第二轮每一道「挂了 parentQid」的题，和它上一轮那道原题比。
   * @returns {rows:[], orphan:[], stats:{}}
   *   orphan = 第二轮里没挂 parentQid 的题（不是变体，算广度探索，不判伪变体）
   */
  function variantRows(rounds) {
    const pair = roundList(rounds);
    const r1 = pair[0] || {};
    const r2 = pair[1] || {};
    const q1 = (r1.questions || []).filter(function (q) { return q && q.qid; });
    const q2 = (r2.questions || []).filter(function (q) { return q && q.qid; });
    const rows = [];
    const orphan = [];
    q2.forEach(function (child) {
      if (!child.parentQid) { orphan.push(child); return; }
      const parent = q1.filter(function (q) { return q.qid === child.parentQid; })[0];
      if (!parent) {
        // 挂了个不存在的 parent：比没挂更糟，单独记下来
        rows.push({
          childQid: child.qid, parentQid: child.parentQid, missingParent: true,
          kp: child.knowledgePoint || '', parentKp: '', parentAnswer: '', childAnswer: answerOf(child),
          answerChanged: false, sameKp: false, fake: false, bad: true,
          reason: '指向的上一轮题目不存在'
        });
        return;
      }
      const pa = answerOf(parent);
      const ca = answerOf(child);
      const drop = [pa, ca].concat(parent.options || [], child.options || []).filter(Boolean);
      const sk1 = skeleton(parent.prompt, drop);
      const sk2 = skeleton(child.prompt, drop);
      rows.push({
        childQid: child.qid,
        parentQid: parent.qid,
        kp: child.knowledgePoint || '',
        parentKp: parent.knowledgePoint || '',
        parentPrompt: parent.prompt || '',
        childPrompt: child.prompt || '',
        parentAnswer: pa,
        childAnswer: ca,
        answerChanged: normText(pa) !== normText(ca) && !!ca,
        sameKp: !!child.knowledgePoint && child.knowledgePoint === parent.knowledgePoint,
        fake: !!sk1 && sk1 === sk2,
        bad: false
      });
    });

    const n = rows.length;
    const changed = rows.filter(function (r) { return r.answerChanged; }).length;
    const sameKp = rows.filter(function (r) { return r.sameKp; }).length;
    const fake = rows.filter(function (r) { return r.fake; }).length;
    return {
      rows: rows,
      orphan: orphan,
      stats: {
        total: n,
        answerChanged: changed,
        sameKp: sameKp,
        fake: fake,
        fakeRate: n ? fake / n : null,
        answerRate: n ? changed / n : null,
        kpRate: n ? sameKp / n : null
      }
    };
  }

  /** 四角色时间线：把一次调用压成一行，够看又不糊。 */
  const ROLE_NAME = { plan: '课程', generate: '生成', verify: '验证', diagnose: '诊断' };

  function codesOfJson(json) {
    if (!json) return [];
    if (Array.isArray(json.fails)) {
      return json.fails.filter(function (f) { return f && f.id; }).map(function (f) { return f.id; });
    }
    return [];
  }

  function summarizeCall(entry) {
    const e = entry || {};
    const role = e.role || '';
    const j = e.json || null;
    let line = '';
    let codes = codesOfJson(j);
    if (role === 'verify') {
      const verdict = j && j.verdict ? j.verdict : (e.ok ? '?' : '没跑成');
      line = verdict === 'pass' ? '通过' : (verdict === 'fail' ? '否决 ' + codes.join('、') : verdict);
    } else if (role === 'generate') {
      line = j && j.answer ? '出题：答案「' + j.answer + '」' : (e.ok ? '出题（没解析出答案）' : '没跑成');
    } else if (role === 'plan') {
      const n = j && Array.isArray(j.plans) ? j.plans.length : 0;
      line = '排 ' + n + ' 条考点';
    } else if (role === 'diagnose') {
      line = j && j.cause ? '错因：' + j.cause + (j.confidence != null ? '（' + Math.round(j.confidence * 100) + '%）' : '') : '没给出错因';
    } else if (role === 'selfcheck') {
      line = '连通性自检';
    } else {
      line = e.ok ? '返回' : '没跑成';
    }
    const text = String(e.user || '') + '\n' + String(e.system || '');
    const leak = scanLeak(text);
    return {
      at: e.at || '',
      role: role,
      roleName: ROLE_NAME[role] || role || '未知',
      ok: !!e.ok,
      ms: e.ms || 0,
      tokens: e.tokens || 0,
      line: line,
      codes: codes,
      errorType: e.errorType || '',
      // 输入只留「多大、带了哪些段落」，不留原文：原文可能有学生作答内容，
      // 落进 localStorage 就等于把学情也存了一份，反而成了新的泄漏面。
      inChars: String(e.user || '').length,
      fields: role === 'verify' ? verifyFields(text) : [],
      guard: role === 'verify' ? leak : null,
      out: j ? JSON.stringify(j).slice(0, 400) : (e.text ? String(e.text).slice(0, 200) : '')
    };
  }

  /** 难度档：层次均值为主，英文词数为辅（同一层里词多说明句子更复杂）。 */
  function levelOf(round) {
    const qs = ((round && round.questions) || []).filter(function (q) { return q && q.prompt; });
    const order = SHT.LEVELS || ['认', '辨', '用', '表达'];
    let sum = 0;
    let words = 0;
    let n = 0;
    qs.forEach(function (q) {
      const lv = q.cell && q.cell.level;
      const i = order.indexOf(lv);
      const en = String(q.prompt || '').match(/[A-Za-z']+/g) || [];
      if (i >= 0) { sum += i; n += 1; }
      words += en.length;
    });
    return {
      count: qs.length,
      avgLevel: n ? sum / n : null,
      avgWords: qs.length ? words / qs.length : null,
      label: n ? order[Math.round(sum / n)] || '' : ''
    };
  }

  /** 第一轮全对 → 第二轮该升；全错 → 该降。返回「应然」与「实然」。 */
  function levelExpect(rounds) {
    const a1 = (((rounds || [])[0] || {}).practice || {}).attempts || [];
    if (!a1.length) return { expected: 'unknown', reason: '第一轮还没作答' };
    const correct = a1.filter(function (a) { return a.correct; }).length;
    if (correct === a1.length) return { expected: 'up', reason: '第一轮全对（' + correct + '/' + a1.length + '），第二轮该升一档' };
    if (correct === 0) return { expected: 'down', reason: '第一轮全错（0/' + a1.length + '），第二轮该降一档' };
    return { expected: 'flat', reason: '第一轮对 ' + correct + '/' + a1.length + '，难度该持平' };
  }

  /** 判分台账复算：能离线复算的条目逐条重判一次，看结论是否仍一致。 */
  function freezeAudit(state) {
    const ledger = (state && state.gradeLedger) || {};
    const rounds = roundList((state && state.rounds) || []);
    const questions = [];
    rounds.forEach(function (r) { (r.questions || []).forEach(function (q) { if (q && q.qid) questions.push(q); }); });
    const rows = [];
    Object.keys(ledger).forEach(function (key) {
      const e = ledger[key] || {};
      const q = questions.filter(function (x) { return x.qid === e.qid; })[0] || null;
      if (!q) {
        rows.push({ key: key, qid: e.qid, state: 'missing-question', frozen: !!e.correct, agree: null });
        return;
      }
      // 键自证：用这个答案重算一次 key，和台账里那条的 key 比
      const keyAgain = SHT.grade && SHT.grade.ledgerKey ? SHT.grade.ledgerKey(q, undefined, e.raw) : '';
      const local = SHT.grade && SHT.grade.local ? SHT.grade.local(q, e.raw) : null;
      if (local && local.decided) {
        rows.push({
          key: key, qid: e.qid, state: 'recomputed',
          frozen: !!e.correct, again: !!local.correct, agree: !!e.correct === !!local.correct,
          keyOk: keyAgain === key
        });
      } else {
        rows.push({ key: key, qid: e.qid, state: 'needs-model', frozen: !!e.correct, agree: null });
      }
    });
    const recomputed = rows.filter(function (r) { return r.state === 'recomputed'; });
    const conflicts = recomputed.filter(function (r) { return !r.agree || r.keyOk === false; });
    return {
      total: rows.length,
      recomputed: recomputed.length,
      modelOnly: rows.filter(function (r) { return r.state === 'needs-model'; }).length,
      missing: rows.filter(function (r) { return r.state === 'missing-question'; }).length,
      conflicts: conflicts,
      ok: rows.length > 0 && conflicts.length === 0,
      rows: rows
    };
  }

  /** 精准打击：第二轮有几道题考的是第一轮错得最多的那个考点。 */
  function focusHit(rounds, topKp) {
    const r2 = ((rounds || [])[1] || {}).questions || [];
    if (!topKp) return { hit: 0, total: r2.length, kp: '' };
    const key = normText(topKp);
    const hit = r2.filter(function (q) {
      const k = normText(q.knowledgePoint);
      return k && (k === key || k.indexOf(key) >= 0 || key.indexOf(k) >= 0);
    }).length;
    return { hit: hit, total: r2.length, kp: topKp };
  }

  /** 四项汇总。每一项都给「结论 + 证据 + 达标与否」，没数据时 ok=null。 */
  function metrics(state) {
    const s = state || {};
    const rounds = roundList(s.rounds || []);
    const traces = s.traces || [];
    const drills = s.auditDrills || [];

    // ---- 一 变体质量 ----
    const vr = variantRows(rounds);
    const drillCaught = drills.filter(function (d) { return d.caught; }).length;
    const variant = {
      ...vr.stats,
      orphan: vr.orphan.length,
      drills: drills.length,
      drilled: drillCaught,
      // 达标三条：答案全换、考点全同、伪变体率 ≤20%；拦截演练如果做过，必须全拦住
      ok: vr.stats.total > 0
        ? (vr.stats.answerChanged === vr.stats.total &&
           vr.stats.sameKp === vr.stats.total &&
           vr.stats.fakeRate <= 0.2 &&
           (drills.length === 0 || drillCaught === drills.length))
        : null,
      rows: vr.rows
    };

    // ---- 二 信息隔离 ----
    const vcalls = traces.filter(function (t) { return t.role === 'verify'; });
    const leaks = vcalls.filter(function (t) { return t.guard && !t.guard.ok; });
    const isolation = {
      calls: vcalls.length,
      leaks: leaks.length,
      hitWords: leaks.reduce(function (acc, t) {
        (t.guard.hits || []).forEach(function (h) { if (acc.indexOf(h.word) < 0) acc.push(h.word); });
        return acc;
      }, []),
      fields: vcalls.length ? vcalls[vcalls.length - 1].fields : [],
      ok: vcalls.length ? leaks.length === 0 : null,
      rows: vcalls
    };

    // ---- 三 进化机制 ----
    // 示例错题不算数：审计台统计的是这个学生真实错在哪
    const topKp = (s.wrongCases || [])
      .filter(function (c) { return !c.demo; })
      .map(function (c) { return { kp: c.knowledgePoint, n: 1 }; })
      .reduce(function (acc, x) {
        const hit = acc.filter(function (a) { return normText(a.kp) === normText(x.kp); })[0];
        if (hit) hit.n += 1; else acc.push({ kp: x.kp, n: 1 });
        return acc;
      }, [])
      .sort(function (a, b) { return b.n - a.n; })[0];
    const focus = focusHit(rounds, topKp && topKp.kp);
    const l1 = levelOf(rounds[0]);
    const l2 = levelOf(rounds[1]);
    const expect = levelExpect(rounds);
    let actual = 'flat';
    if (l1.avgLevel != null && l2.avgLevel != null) {
      if (l2.avgLevel > l1.avgLevel + 0.01) actual = 'up';
      else if (l2.avgLevel < l1.avgLevel - 0.01) actual = 'down';
    }
    const evolve = {
      children: vr.rows.length,
      withParent: vr.rows.filter(function (r) { return !r.missingParent; }).length,
      focusKp: focus.kp,
      focusHit: focus.hit,
      focusNeed: 3,
      levelFrom: l1,
      levelTo: l2,
      levelExpected: expect.expected,
      levelActual: actual,
      levelReason: expect.reason,
      ok: vr.rows.length
        ? (vr.rows.every(function (r) { return !r.missingParent; }) &&
           focus.hit >= Math.min(3, l2.count) &&
           (expect.expected === 'unknown' || expect.expected === actual))
        : null
    };

    // ---- 四 工程可复现 ----
    const freeze = freezeAudit(s);
    const roles = ['plan', 'generate', 'verify', 'diagnose'].map(function (id) {
      return { id: id, name: ROLE_NAME[id], calls: traces.filter(function (t) { return t.role === id; }).length };
    });
    /*
     * 复现的达标要两件事：台账复算一致 + 四类角色都有留痕。
     * 但「还没有台账」不等于「没达标」——那是还没判过分，判成 null（待验）。
     * 反过来「有调用但缺角色留痕」是真问题：说明有一类角色这一轮根本没上场，
     * 或者上场的记录没落下来，这两种都不能报达标。
     */
    const rolesAll = roles.every(function (r) { return r.calls > 0; });
    let reproduceOk = null;
    if (!traces.length) reproduceOk = null;
    else if (!rolesAll) reproduceOk = false;
    else if (freeze.total === 0) reproduceOk = null;
    else reproduceOk = freeze.ok;
    const reproduce = {
      freeze: freeze,
      roles: roles,
      traceCount: traces.length,
      ok: reproduceOk
    };

    const list = [variant, isolation, evolve, reproduce];
    const scored = list.filter(function (x) { return x.ok !== null && x.ok !== undefined; });
    const failed = scored.filter(function (x) { return x.ok === false; });
    /*
     * 总判四态，按「能不能下结论」排：
     *   有任何一项算出来没过 → 未达标（下结论了，不再等）
     *   一项都没算出来       → 还没跑够 0/4
     *   算了一部分且都过     → 还没跑够 n/4（不能因为跑得少就报达标）
     *   四项都算出来且都过   → 达标
     */
    let verdict = 'nodata';
    if (failed.length) verdict = 'fail';
    else if (scored.length >= list.length) verdict = 'pass';
    else if (scored.length > 0) verdict = 'wait';
    return {
      variant: variant,
      isolation: isolation,
      evolve: evolve,
      reproduce: reproduce,
      verdict: verdict,
      passedCount: scored.filter(function (x) { return x.ok; }).length,
      scoredCount: scored.length
    };
  }

  SHT.audit = {
    STUDENT_WORDS: STUDENT_WORDS,
    VERIFY_FIELDS: VERIFY_FIELDS,
    scanLeak: scanLeak,
    verifyFields: verifyFields,
    skeleton: skeleton,
    variantRows: variantRows,
    summarizeCall: summarizeCall,
    levelOf: levelOf,
    levelExpect: levelExpect,
    freezeAudit: freezeAudit,
    focusHit: focusHit,
    metrics: metrics,
    roundList: roundList
  };
})(window);
