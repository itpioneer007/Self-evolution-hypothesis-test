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
          changes: 0, hintUsed: 0, totalMs: 0, qids: [], sequence: []
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

  SHT.learner = { TYPES: TYPES, CAP_EVENTS: CAP_EVENTS, build: build, digest: digest };
})(window);
