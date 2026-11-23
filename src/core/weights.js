/*
 * 能力权重与难度系数
 *
 * 目的：把「做题痕迹」变成一组可以逐次更新的数值，直接决定下一轮出多难。
 * 之前的 learner.js 算的是掌握概率与倾向（粗心 / 未掌握 / 蒙对），
 * 但它是「每轮重算一遍」的摘要，没有跨轮累积的权重，也没法回答
 * 「这一次答对，整体难度该升多少」。
 *
 * 模型：每个能力（vocab / spelling / phonics / ...）和每个考点各有一个权重 w∈[0,1]，
 * 含义是「预计他做这类题的正确率」。w 越高，出题难度档越高。
 *
 * 更新规则用对数损失的梯度，也就是最朴素的在线学习：
 *     L = -[ r·ln p + (1-r)·ln(1-p) ]       p = w
 *     ∂L/∂w = (p - r)
 *     w ← w - η·(p - r) = w + η·(r - p)
 * 答对（r=1）权重升、答错（r=0）权重降，幅度正比于「意外程度」|r-p|：
 * 预计不会却答对，升得多；预计会却答错，降得多。
 *
 * 四条证据修正（这是「痕迹」真正参与计算的地方）：
 *   1 靠提示或重试答对 → r 打折到 0.6。这是「半会」，不该和独立答对同幅升权。
 *   2 秒错（<4 秒、无改选）→ η 减半。手滑不该把权重砸到底，下一轮还要再验。
 *      改选次数由答题页真实记下来（app.js 的 p.changes）：先选 A、犹豫、改 B、又秒错，
 *      changes 就不是 0，于是不会被当成手滑。
 *   3 想很久才答对（>20 秒）→ r 打 0.9 折。会，但不熟，升权慢一点。
 *   4 提示之后还是错 → 不折算，按满额降。这一枪不是第一印象，不能算手滑。
 *
 * 纯函数：不读时钟、不读全局、不改入参。同一串作答重放，权重逐字段相等。
 */
(function (root) {
  const SHT = (root.SHT = root.SHT || {});

  const ETA = 0.25;          // 基础学习率
  const START = 0.5;         // 未知时的先验权重
  const FAST_MS = 4000;      // 秒错阈值
  const SLOW_MS = 20000;     // 慢答阈值
  const CAP = { low: 0.35, high: 0.6 };

  function num(v, d) {
    const n = Number(v);
    return isFinite(n) ? n : (d || 0);
  }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function r4(v) { return Math.round(num(v, 0) * 10000) / 10000; }

  function blank() {
    return { version: 1, ability: {}, kp: {}, answered: 0, updatedAt: '' };
  }

  function ensure(state) {
    const s = state && typeof state === 'object' ? JSON.parse(JSON.stringify(state)) : blank();
    if (!s.ability) s.ability = {};
    if (!s.kp) s.kp = {};
    if (!Number.isFinite(s.answered)) s.answered = 0;
    return s;
  }

  /** 预测正确率：考点权重优先，没有就用能力权重，再没有给先验。 */
  function predict(state, kp, ability) {
    const s = ensure(state);
    if (kp && s.kp[kp] && Number.isFinite(s.kp[kp].w)) return s.kp[kp].w;
    if (ability && s.ability[ability] && Number.isFinite(s.ability[ability].w)) return s.ability[ability].w;
    return START;
  }

  /**
   * 一次作答 → 新权重。attempt 需要的字段：
   *   kp / ability / correct / hintCount / retried / durationMs / changes / at
   * 缺字段按「没有这条证据」处理，不猜。
   */
  function update(state, attempt) {
    const s = ensure(state);
    const a = attempt || {};
    const correct = !!a.correct;
    const kp = String(a.kp || '');
    const ability = String(a.ability || '');
    const hint = num(a.hintCount, 0);
    const retried = !!a.retried;
    const ms = num(a.durationMs, 0);
    const changes = num(a.changes, 0);

    // 目标值 r：靠提示/重试才对 = 半会；其余按对错
    let r = correct ? 1 : 0;
    let eta = ETA;
    if (correct) {
      if (retried || hint > 0) r = 0.6;
      else if (ms > SLOW_MS) r = 0.9;
      // 提示之后还是错：这一枪已经不是「第一印象」了，不能按手滑折算。
      // 以前重试那枪的耗时通常只有一两秒、又没改选，被当成「秒错」只降半格，
      // 于是「提示了还是不会」在权重里和「手滑点错」一样重。
    } else if (!retried && ms > 0 && ms < FAST_MS && changes === 0) {
      eta = ETA / 2;   // 秒错多半是手滑，别把权重砸穿
    }

    const bump = function (bucket, key) {
      if (!key) return;
      const cell = bucket[key] || { w: START, n: 0, correct: 0, lastAt: '' };
      const p = Number.isFinite(cell.w) ? cell.w : START;
      const w = clamp(p + eta * (r - p), 0.02, 0.98);
      bucket[key] = {
        w: r4(w),
        n: cell.n + 1,
        correct: cell.correct + (correct ? 1 : 0),
        // 记下这次是谁推动了权重：给审计与调参用
        lastAt: String(a.at || ''),
        lastDelta: r4(w - p)
      };
    };
    bump(s.ability, ability);
    bump(s.kp, kp);
    s.answered += 1;
    return s;
  }

  /** 一串作答 → 权重状态。重放与乱序无关：按给定的数组顺序累加即确定。 */
  function build(attempts) {
    let s = blank();
    (attempts || []).forEach(function (a) { s = update(s, a); });
    return s;
  }

  function avgOf(bucket, field) {
    const keys = Object.keys(bucket || {});
    if (!keys.length) return null;
    let sum = 0;
    keys.forEach(function (k) { sum += num(bucket[k][field || 'w'], 0); });
    return r4(sum / keys.length);
  }

  /**
   * 难度上限：把权重映射到层次阶梯。
   * 与 learner.levelCapOf 的阈值保持同一语义（0.35 / 0.6），但这里用的是
   * 「跨轮累积的权重」，不是「单轮重算的掌握概率」。
   */
  function difficultyOf(state) {
    const s = ensure(state);
    const abilityW = avgOf(s.ability);
    const kpW = avgOf(s.kp);
    const w = kpW == null ? (abilityW == null ? START : abilityW) : kpW;
    const cap = w >= CAP.high ? '表达' : (w >= CAP.low ? '用' : '辨');
    return {
      weight: w,
      abilityWeight: abilityW,
      kpWeight: kpW,
      cap: cap,
      /*
       * 一句判断依据，出现在导出与开发视图里。
       * 不写「累积权重 68%，已稳定过线」——看的人不知道「权重」是什么、
       * 「过线」是哪条线。直接说：做了几题、预计能答对多少、越过了哪条线。
       */
      reason: '累计 ' + s.answered + ' 题作答后，预计这类题能答对 ' + Math.round(w * 100) + '%；' +
        (w >= CAP.high
          ? '超过 ' + Math.round(CAP.high * 100) + '% 的升档线，难度可以再往上走一级'
          : w >= CAP.low
            ? '在 ' + Math.round(CAP.low * 100) + '%–' + Math.round(CAP.high * 100) + '% 之间，难度维持不动'
            : '低于 ' + Math.round(CAP.low * 100) + '% 的降档线，先保正确率，不急往上加'),
      answered: s.answered
    };
  }

  /** 导出用：只带可核对的数字，不塞整份内部结构。 */
  function digest(state) {
    const s = ensure(state);
    const d = difficultyOf(s);
    const topKp = Object.keys(s.kp).map(function (k) {
      return { kp: k, w: s.kp[k].w, n: s.kp[k].n, correct: s.kp[k].correct };
    }).sort(function (a, b) { return b.n - a.n || a.w - b.w; }).slice(0, 8);
    return {
      answered: s.answered,
      abilityWeight: d.abilityWeight,
      kpWeight: d.kpWeight,
      cap: d.cap,
      reason: d.reason,
      topKp: topKp
    };
  }

  SHT.weights = {
    ETA: ETA,
    START: START,
    // 调档阈值：≥60% 升一档、≤35% 降一档。导出让台账能写清「越过了哪条线」
    CAP: CAP,
    blank: blank,
    predict: predict,
    update: update,
    build: build,
    difficultyOf: difficultyOf,
    digest: digest
  };
})(typeof window !== 'undefined' ? window : globalThis);
