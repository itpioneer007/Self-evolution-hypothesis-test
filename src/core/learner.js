/*
 * 学习者模型：把「答题轨迹」压成可复算的状态
 *
 * 和 wrongBook.js 的区别，也是这个文件存在的理由：
 *   - 错题本只记「答错的那一瞬」：选了什么、对不对、花了几秒。
 *     它答不了「他是粗心还是不会」「这次答对是不是蒙的」。
 *   - 这里读的是整串过程事件（曝光 / 选 / 改选 / 提示 / 提交 / 反馈 / 离开）。
 *     同样是一次答错，3 秒直接选错和犹豫 20 秒、改选两次后选错，算出来是两个状态。
 *
 * 三条硬约束（对应最小测试判据 B）：
 *   1 纯函数。不读时钟、不读 SHT.curriculum、不读 localStorage，不修改入参。
 *      同一串事件无论跑几次、在什么视图下跑，结果逐字段相等。
 *   2 只认事件里的字段。采集端写什么就读什么，不猜、不补、不 fallback 到全局状态。
 *   3 输出是结构化的数字 + 一句人话理由。模型不参与这步计算，
 *      「为什么判定他粗心」要能在导出里被人复算，不能是一段模型写的散文。
 *
 * 算法只需 BKT 这一档：贝叶斯知识追踪把作答序列压成掌握概率，
 * 过程证据（耗时、改选、提示）用来修正倾向判断与弱点排序权重。
 * 协同过滤、深度学习都需要多学生数据，现阶段没有，不假装做。
 */
(function (root) {
  const SHT = (root.SHT = root.SHT || {});

  // 最小事件集。draft 只记长度不记原文：输入里可能有学生随手写的东西，
  // 和 traces 不存提示词原文是同一条隐私约定。
  const TYPES = ['shown', 'pick', 'change', 'hint', 'draft', 'submit', 'reveal', 'leave'];

  // 事件约定：{ seq, studentId, qid, kp, round, ts, type, payload }
  // seq 是采集端的严格递增序号，排序以它为准；ts 只用来算耗时，不参与排序。
  const CAP_EVENTS = 4000;

  function num(v, d) {
    const n = Number(v);
    return isFinite(n) ? n : (d || 0);
  }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function r4(v) { return Math.round(num(v, 0) * 10000) / 10000; }

  function sorted(events) {
    return (events || []).filter(Boolean).slice().sort(function (a, b) {
      const sa = num(a.seq, 0);
      const sb = num(b.seq, 0);
      if (sa !== sb) return sa - sb;
      return num(a.ts, 0) - num(b.ts, 0);
    }).slice(-CAP_EVENTS);
  }

  /** 按题分组。Map 保留插入顺序，不依赖对象键的枚举顺序。 */
  function groupByQuestion(events) {
    const map = new Map();
    events.forEach(function (e) {
      const qid = String(e.qid || (e.payload && e.payload.qid) || '');
      if (!qid) return;
      if (!map.has(qid)) {
        map.set(qid, { qid: qid, kp: '', studentId: '', seq: num(e.seq, 0), events: [] });
      }
      const g = map.get(qid);
      g.events.push(e);
      if (!g.kp) g.kp = String(e.kp || (e.payload && e.payload.kp) || '');
      if (!g.studentId) g.studentId = String(e.studentId || '');
    });
    // 题内事件也按 seq 定序：输入数组被打乱时，改选次数、最后一次提交、耗时
    // 都不能跟着变。可复算要求的是「事件集合 + 序号」决定结果，不是数组顺序决定结果。
    return Array.from(map.values()).map(function (g) {
      g.events.sort(function (a, b) { return num(a.seq, 0) - num(b.seq, 0); });
      return g;
    });
  }

  /**
   * 一道题的一串事件 → 一条作答证据。
   * 没有 submit 的是「看了没答」，留在轨迹里但不进掌握度计算。
   */
  function evidenceOf(g) {
    const evs = g.events;
    const picks = evs.filter(function (e) { return e.type === 'pick' || e.type === 'change'; });
    const submits = evs.filter(function (e) { return e.type === 'submit'; });
    const last = submits.length ? submits[submits.length - 1] : null;
    const pay = (last && last.payload) || {};

    // 改选次数：采集端发 change 是首选；若只发了 pick，也按相邻 index 变化兜底计一次。
    let changes = 0;
    let prevIdx = null;
    let seenPick = false;
    picks.forEach(function (e) {
      const idx = e.payload && e.payload.index;
      if (e.type === 'change') changes += 1;
      else if (seenPick && idx != null && prevIdx != null && idx !== prevIdx) changes += 1;
      if (e.type === 'pick' && idx != null) { seenPick = true; prevIdx = idx; }
    });

    const hintUsed = evs.some(function (e) { return e.type === 'hint'; }) || !!pay.hintUsed;
    const shownAt = (evs.filter(function (e) { return e.type === 'shown'; })[0] || {}).ts;
    const endEv = last || evs[evs.length - 1];
    const fallbackMs = shownAt != null && endEv ? num(endEv.ts, 0) - num(shownAt, 0) : 0;
    const durationMs = clamp(last ? num(pay.durationMs, fallbackMs) : fallbackMs, 0, 300000);

    return {
      qid: g.qid,
      kp: g.kp,
      studentId: g.studentId,
      seq: g.seq,
      answered: !!last,
      correct: last ? !!pay.correct : null,
      picked: String(pay.picked || ''),
      expected: String(pay.expected || ''),
      via: String(pay.via || ''),
      durationMs: durationMs,
      changes: changes,
      hintUsed: hintUsed,
      revealed: evs.some(function (e) { return e.type === 'reveal'; }),
      left: evs.some(function (e) { return e.type === 'leave'; }),
      // 这一题由哪些事件构成。决策要把它带出去，验收时才能顺着 seq 回查原始轨迹，
      // 而不是听一句「模型觉得他可能不会」。
      eventSeqs: evs.map(function (e) { return num(e.seq, 0); }),
      eventCount: evs.length
    };
  }

  function bktOf(seq) {
    let p = null;
    seq.forEach(function (s) {
      p = (SHT.bkt && SHT.bkt.update)
        ? SHT.bkt.update(p, s.correct, { hint: s.hint })
        : clamp((p == null ? 0.25 : p) + (s.correct ? 0.15 : -0.1), 0.01, 0.99);
    });
    return p == null ? 0.25 : r4(p);
  }

  /** 过程证据 → 倾向。这是「蛛丝马迹」真正被用上的地方。 */
  function tendencyOf(b) {
    if (!b.attempts) return 'unseen';
    if (b.guessRight > 0 && b.wrong === 0) return 'unstable';  // 靠提示或改选才对，不能算会
    if (b.slowWrong >= 1 || b.wrong >= 3) return 'unknown';    // 想很久还错 / 反复错 = 没掌握
    // 每次错都是「几秒内、没改选」→ 更像手滑，不是不会。
    // 判据是「全部错误都是秒错」，只错一次也成立；混进一次久想就退回 unknown。
    if (b.fastWrong > 0 && b.fastWrong === b.wrong) return 'slip';
    if (b.correct >= 2 && b.pKnown >= 0.6) return 'solid';
    return 'emerging';
  }

  const TENDENCY_TEXT = {
    unseen: '还没测过',
    unstable: '靠提示或改选才答对，掌握不稳',
    unknown: '反复错或想很久仍错，判断为未掌握',
    slip: '快速答错且没有改选，倾向粗心',
    solid: '连续答对，基本掌握',
    emerging: '有起色但证据不足'
  };

  function scoreOf(b) {
    // 现在 wrongBook.js 的 priorityScore 只数 errorCount。
    // 这里让掌握概率和过程证据进排序：粗心权重大幅低于真不会，蒙对要再验一次。
    return r4(
      (1 - b.pKnown) * 60 +
      b.wrong * 8 +
      b.slowWrong * 6 +
      b.guessRight * 5 +
      b.hintUsed * 3 +
      b.changes * 2 +
      b.fastWrong * 1
    );
  }

  function reasonOf(b) {
    const bits = [];
    bits.push('答 ' + b.attempts + ' 次 / 对 ' + b.correct + ' 次');
    if (b.fastWrong) bits.push('快速错 ' + b.fastWrong + ' 次');
    if (b.slowWrong) bits.push('久想仍错 ' + b.slowWrong + ' 次');
    if (b.changes) bits.push('改选 ' + b.changes + ' 次');
    if (b.hintUsed) bits.push('用提示 ' + b.hintUsed + ' 次');
    bits.push('掌握概率 ' + Math.round(b.pKnown * 100) + '%');
    bits.push(TENDENCY_TEXT[b.tendency]);
    if (b.tendency === 'slip') bits.push('换干扰项再验一次，不重复练');
    else if (b.tendency === 'unstable') bits.push('下一轮换个角度再考一次');
    else if (b.tendency === 'unknown') bits.push('先降一档重出');
    return bits.join('；');
  }

  /**
   * 事件流 → 学习者状态。纯函数、可复算。
   * @param {Array} events 采集端写下的事件
   * @param {object} opts  { studentId } 只做筛选，不改变计算结果
   */
  function build(events, opts) {
    const o = opts || {};
    const list = sorted(events);
    const only = o.studentId ? list.filter(function (e) { return String(e.studentId || '') === String(o.studentId); }) : list;
    const groups = groupByQuestion(only);
    const evidences = groups.map(evidenceOf);
    const answered = evidences.filter(function (e) { return e.answered; });

    const byKp = {};
    const order = [];
    // 按题出现的先后累积，保证同一串事件每次得到同样的插入顺序
    evidences.slice().sort(function (a, b) { return a.seq - b.seq; }).forEach(function (e) {
      if (!e.answered) return;
      const kp = e.kp || '（未标考点）';
      if (!byKp[kp]) {
        byKp[kp] = {
          kp: kp, attempts: 0, correct: 0, wrong: 0,
          fastWrong: 0, slowWrong: 0, guessRight: 0,
          changes: 0, hintUsed: 0, totalMs: 0, qids: [], eventSeqs: [], sequence: []
        };
        order.push(kp);
      }
      const b = byKp[kp];
      b.attempts += 1;
      if (e.correct) b.correct += 1; else b.wrong += 1;
      if (!e.correct && e.durationMs > 0 && e.durationMs < 4000 && e.changes === 0) b.fastWrong += 1;
      if (!e.correct && e.durationMs >= 12000) b.slowWrong += 1;
      if (e.correct && (e.hintUsed || e.changes > 0)) b.guessRight += 1;
      b.changes += e.changes;
      if (e.hintUsed) b.hintUsed += 1;
      b.totalMs += e.durationMs;
      b.qids.push(e.qid);
      b.eventSeqs = b.eventSeqs.concat(e.eventSeqs).slice(-60);
      // 原地重选题保留两枪：第一枪错误先更新一次，提示后的第二枪再更新一次。
      if (e.retried) {
        b.sequence.push({ qid: e.qid, seq: e.seq, correct: e.firstCorrect, hint: e.firstHintUsed });
      }
      b.sequence.push({ qid: e.qid, seq: e.seq, correct: e.correct, hint: e.hintUsed });
    });

    order.forEach(function (kp) {
      const b = byKp[kp];
      b.sequence.sort(function (x, y) { return x.seq - y.seq; });
      b.pKnown = bktOf(b.sequence);
      b.avgMs = Math.round(b.totalMs / Math.max(1, b.attempts));
      b.tendency = tendencyOf(b);
      b.score = scoreOf(b);
      b.reason = reasonOf(b);
      delete b.sequence;
      delete b.totalMs;
    });

    const queue = order.map(function (kp) {
      const b = byKp[kp];
      return { kp: kp, score: b.score, pKnown: b.pKnown, tendency: b.tendency, reason: b.reason };
    }).sort(function (a, b) {
      if (b.score !== a.score) return b.score - a.score;
      return a.kp < b.kp ? -1 : (a.kp > b.kp ? 1 : 0);
    });

    // 节奏漂移：一轮后半段是否明显变慢。前半/后半按序切，不用时间，保证可复算。
    const seqEv = answered.slice().sort(function (a, b) { return a.seq - b.seq; });
    const half = Math.floor(seqEv.length / 2);
    const avgOf = function (arr) {
      if (!arr.length) return 0;
      return Math.round(arr.reduce(function (n, e) { return n + e.durationMs; }, 0) / arr.length);
    };
    const firstHalf = avgOf(seqEv.slice(0, half));
    const lastHalf = avgOf(seqEv.slice(half));
    const pace = {
      avgMs: avgOf(seqEv), firstHalfMs: firstHalf, lastHalfMs: lastHalf,
      drift: lastHalf && firstHalf ? r4(lastHalf / firstHalf) : 1
    };

    const studentId = o.studentId || (evidences[0] && evidences[0].studentId) || '';
    const topTendency = queue.length ? queue[0].tendency : 'unseen';
    const reason = queue.length
      ? '共 ' + answered.length + ' 次作答 / ' + queue.length + ' 个考点；最该再练的是「' + queue[0].kp + '」：' + queue[0].reason
      : '还没有作答轨迹，学习者模型是空的';

    return {
      studentId: studentId,
      eventCount: only.length,
      questionCount: groups.length,
      answeredCount: answered.length,
      byKp: byKp,
      queue: queue,
      pace: pace,
      topTendency: topTendency,
      reason: reason
    };
  }

  /* ---------- 决策：从证据到选题单 ----------
   *
   * 这里回答的是「凭什么给他出这道题」。每条决策自带三样东西：
   *   rule      命中的规则编号（不是模型写的一段理由）
   *   evidence  参与这次计算的数值 + 原始事件 seq（能顺着回查轨迹）
   *   reason    由上面这些数值拼出来的人话，含具体数字
   * 决策本身是代码算的，模型只负责按这张选题单把题写出来。
   */
  const RULES = {
    COLD_START: { id: 'R-COLD-START', text: '没有作答轨迹，按起始水平从「认」层铺开' },
    UNKNOWN_DOWN: { id: 'R-UNKNOWN-DOWN', text: '反复错或久想仍错 → 降回「认」层重出' },
    SLIP_RETRY: { id: 'R-SLIP-RETRY', text: '秒错且无改选 → 判为粗心，同考点换干扰项再验一次，不重复练' },
    UNSTABLE_VERIFY: { id: 'R-UNSTABLE-VERIFY', text: '靠提示或改选才答对 → 掌握不稳，换角度再考一次' },
    SOLID_ADVANCE: { id: 'R-SOLID-ADVANCE', text: '连续答对且掌握概率高 → 升到当前水平上限' },
    EMERGING: { id: 'R-EMERGING', text: '有起色但证据不足 → 保持「辨」层再验一次' },
    EXPLORE: { id: 'R-EXPLORE', text: '没有待补的弱点，这一轮换一个没测过的考点' }
  };

  const CAP_BY_LAYER = { A: '表达', B: '用', C: '辨' };
  const LEVEL_BY_TENDENCY = {
    unknown: '认', slip: '辨', unstable: '辨', solid: '用', emerging: '辨', unseen: '认'
  };
  const DISTRACTOR_BY_TENDENCY = {
    unknown: '同类不同物', slip: '形近', unstable: '语义近',
    solid: '音近', emerging: '语义近', unseen: '同类不同物'
  };

  function levels() { return (SHT.LEVELS || ['认', '辨', '用', '表达']).slice(); }

  /**
   * 水平上限不是画像页选完就锁死：作答足够多、整体掌握概率明显偏高/偏低时调一档。
   * 至少 3 次作答才调，避免一两次碰巧全对就把学生顶到表达层。
   */
  function levelCapOf(model, startLayer) {
    const L = levels();
    const layer = startLayer || 'B';
    const base = CAP_BY_LAYER[layer] || '用';
    const byKp = (model && model.byKp) || {};
    const ps = Object.keys(byKp).map(function (k) { return byKp[k].pKnown; });
    const n = (model && model.answeredCount) || 0;
    const avg = ps.length ? ps.reduce(function (a, b) { return a + b; }, 0) / ps.length : null;
    let delta = 0;
    if (n >= 3 && avg != null && avg >= 0.65) delta = 1;
    else if (n >= 3 && avg != null && avg <= 0.35) delta = -1;
    const idx = Math.max(0, Math.min(L.length - 1, L.indexOf(base) + delta));
    return {
      layer: layer, cap: L[idx], startCap: base, delta: delta,
      avgPKnown: avg == null ? null : r4(avg), basedOn: n
    };
  }

  function ruleOf(t) {
    if (t === 'unknown') return RULES.UNKNOWN_DOWN;
    if (t === 'slip') return RULES.SLIP_RETRY;
    if (t === 'unstable') return RULES.UNSTABLE_VERIFY;
    if (t === 'solid') return RULES.SOLID_ADVANCE;
    if (t === 'emerging') return RULES.EMERGING;
    return RULES.COLD_START;
  }

  function actionOf(t) {
    if (t === 'solid') return 'advance';
    if (t === 'unknown' || t === 'slip') return 'remediate';
    if (t === 'unstable' || t === 'emerging') return 'verify';
    return 'explore';
  }

  function levelFor(b, cap) {
    const L = levels();
    const capIdx = Math.max(0, L.indexOf(cap));
    if (b.tendency === 'solid') return L[capIdx];  // 真会了就往上走，进阶看得见
    const want = LEVEL_BY_TENDENCY[b.tendency] || '认';
    return L[Math.max(0, Math.min(capIdx, L.indexOf(want)))];
  }

  function evidenceOfDecision(b) {
    return {
      eventSeqs: (b.eventSeqs || []).slice(-40),
      qids: (b.qids || []).slice(-10),
      pKnown: b.pKnown, attempts: b.attempts, correct: b.correct, wrong: b.wrong,
      fastWrong: b.fastWrong, slowWrong: b.slowWrong, guessRight: b.guessRight,
      changes: b.changes, hintUsed: b.hintUsed, avgMs: b.avgMs,
      tendency: b.tendency, score: b.score, note: ''
    };
  }

  function reasonFor(b, rule, level, distractor) {
    const nums = '掌握概率 ' + Math.round(b.pKnown * 100) + '%｜作答 ' + b.attempts +
      ' 次（对 ' + b.correct + ' / 错 ' + b.wrong + '）｜秒错 ' + b.fastWrong +
      ' 次、久想仍错 ' + b.slowWrong + ' 次、改选 ' + b.changes + ' 次、提示 ' +
      b.hintUsed + ' 次｜平均 ' + b.avgMs + 'ms';
    const seqs = (b.eventSeqs || []).slice(-8).join(',');
    return nums + ' → ' + rule.text + '；本条出「' + level + '」层 / 干扰项「' + distractor + '」' +
      (seqs ? '；依据事件 seq ' + seqs : '');
  }

  /**
   * 学习者状态 → 这一轮的选题单。纯函数、可复算。
   * @param {object} model build() 的输出
   * @param {object} opts { unit, layer, kps, count, retired }
   */
  function decide(model, opts) {
    const o = opts || {};
    const L = levels();
    const count = Math.max(1, Math.floor(num(o.count, 5)));
    const capInfo = levelCapOf(model, o.layer);
    const kps = (o.kps || []).slice().sort(function (a, b) {
      return (a.pathStage || 9) - (b.pathStage || 9) || (a.pathStep || 0) - (b.pathStep || 0);
    });
    const retired = o.retired || [];
    const items = [];
    const usedKp = Object.create(null);
    const stageList = [];
    kps.forEach(function (k) {
      const st = k.pathStage || 1;
      if (stageList.indexOf(st) < 0) stageList.push(st);
    });
    stageList.sort(function (a, b) { return a - b; });

    function addItem(k, b) {
      const label = k.label || '';
      if (!label || usedKp[label] || retired.indexOf(label) >= 0) return false;
      usedKp[label] = true;
      if (!b) {
        const cold = items.length === 0 && !(model && model.eventCount);
        const rule = cold ? RULES.COLD_START : RULES.EXPLORE;
        items.push({
          kp: label, kpId: k.id || '', ability: k.ability || 'vocab',
          targetType: k.targetType || '', targetId: k.targetId || '',
          pathStage: k.pathStage || null, pathLabel: k.pathLabel || '',
          action: 'explore', level: L[0], distractor: '同类不同物',
          rule: rule.id, ruleText: rule.text,
          evidence: {
            eventSeqs: [], qids: [], pKnown: null, attempts: 0, correct: 0, wrong: 0,
            fastWrong: 0, slowWrong: 0, guessRight: 0, changes: 0, hintUsed: 0,
            avgMs: 0, tendency: 'unseen', score: 0,
            note: '这个路径目标还没有作答记录'
          },
          reason: '按学习路径进入「' + (k.pathLabel || '当前阶段') + '」；这个目标还没有作答记录'
        });
        return true;
      }
      const rule = ruleOf(b.tendency);
      const level = levelFor(b, capInfo.cap);
      const distractor = DISTRACTOR_BY_TENDENCY[b.tendency] || '同类不同物';
      items.push({
        kp: label, kpId: k.id || '', ability: k.ability || 'vocab',
        targetType: k.targetType || '', targetId: k.targetId || '',
        pathStage: k.pathStage || null, pathLabel: k.pathLabel || '',
        action: actionOf(b.tendency), level: level, distractor: distractor,
        rule: rule.id, ruleText: rule.text,
        evidence: evidenceOfDecision(b),
        reason: reasonFor(b, rule, level, distractor) + '；路径：' + (k.pathLabel || '')
      });
      return true;
    }

    // 第一遍只补未测目标：先把当前阶段的每个具体单词/句型/拼读目标露出一次，
    // 再进入下一阶段。这样 5 题一轮也不会把某个单词永久漏掉。
    for (let si = 0; si < stageList.length && items.length < count; si += 1) {
      const stage = stageList[si];
      const stageKps = kps.filter(function (k) { return (k.pathStage || 1) === stage; });
      const unseen = stageKps.filter(function (k) {
        return !(model && model.byKp && model.byKp[k.label]);
      });
      unseen.forEach(function (k) {
        if (items.length >= count) return;
        addItem(k, model && model.byKp && model.byKp[k.label]);
      });
    }

    // 第二遍才处理已经露过一次但还不稳的目标。
    if (items.length < count) {
      for (let si = 0; si < stageList.length && items.length < count; si += 1) {
        const stage = stageList[si];
        kps.filter(function (k) { return (k.pathStage || 1) === stage; }).forEach(function (k) {
          if (items.length >= count || usedKp[k.label]) return;
          const b = model && model.byKp && model.byKp[k.label];
          if (b && b.tendency !== 'solid') addItem(k, b);
        });
      }
    }

    // 所有目标都覆盖过且没有待补弱项后，才回到已掌握目标做保持或进阶。
    if (items.length < count) {
      kps.forEach(function (k) {
        if (items.length >= count) return;
        const b = model && model.byKp && model.byKp[k.label];
        if (!b || b.tendency === 'solid') addItem(k, b || null);
      });
    }

    const capText = capInfo.delta > 0 ? '按表现升 1 档' :
      (capInfo.delta < 0 ? '按表现降 1 档' : '按表现持平');
    return {
      items: items,
      levelCap: capInfo,
      reason: '本轮 ' + items.length + ' 条选题，依据 ' + ((model && model.eventCount) || 0) +
        ' 条轨迹事件；按学习路径先处理未覆盖目标；水平上限「' + capInfo.cap + '」（起始 ' + capInfo.startCap + '，' + capText +
        '，基于 ' + capInfo.basedOn + ' 次作答' +
        (capInfo.avgPKnown == null ? '' : '、平均掌握概率 ' + Math.round(capInfo.avgPKnown * 100) + '%') + '）' +
        (items.length ? '；首条依据：' + items[0].reason : '')
    };
  }

  /** 导出用：只带能被人核对的摘要，不把整串事件塞进摘要里。 */
  function digest(model, n) {
    const m = model || {};
    return {
      studentId: m.studentId || '',
      eventCount: m.eventCount || 0,
      answeredCount: m.answeredCount || 0,
      topTendency: m.topTendency || 'unseen',
      pace: m.pace || null,
      queue: (m.queue || []).slice(0, n || 5),
      reason: m.reason || ''
    };
  }

  SHT.learner = {
    TYPES: TYPES, CAP_EVENTS: CAP_EVENTS, RULES: RULES,
    build: build, decide: decide, levelCapOf: levelCapOf, digest: digest
  };
})(window);
