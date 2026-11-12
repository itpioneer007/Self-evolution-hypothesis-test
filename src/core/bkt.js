/*
 * 掌握概率（BKT）：把「错过几次」换成「现在大概会到什么程度」
 *
 * 记错次数不够用，原因是次数不带顺序、也不带信息量：
 * 一个考点错过 3 次、后面连对 2 次，和连错 3 次，次数看起来差不多，
 * 状态完全不同。规划环节要的是后者那种「现在多半会了 / 现在还不会」的判断，
 * 所以用贝叶斯知识追踪把作答序列压成一个概率。
 *
 * 四个参数沿用标准 BKT：
 *   pInit  初始会做的概率（新考点）
 *   pLearn 做完一题之后学会的概率（一次练习能把概率推多高）
 *   pSlip  会了却做错的概率（粗心）
 *   pGuess 不会却蒙对的概率（三选一，理论值 1/3，取 0.25 留余量）
 *
 * 这是纯代码、可复算的：同一串作答永远得到同一个概率。模型给的「他应该会了」
 * 不进这个数——那是判断，不是证据。
 *
 * 有一条刻意的处理：用了提示的答对，按「蒙对概率升高」算。
 * 不这么算的话，靠提示刷过的题会把概率推到 0.8 以上，下一轮就不再出这个考点了。
 */
(function (root) {
  const SHT = (root.SHT = root.SHT || {});

  const P = { init: 0.25, learn: 0.18, slip: 0.12, guess: 0.25 };

  function clamp(p) {
    if (!isFinite(p)) return P.init;
    return Math.max(0.01, Math.min(0.99, p));
  }

  /**
   * 更新一次。correct 为真按「答对」更新，否则按「答错」。
   * @param {number} prior 这次作答之前的掌握概率
   * @param {boolean} correct
   * @param {object} opts { hint: 用了提示则为真 }
   */
  function update(prior, correct, opts) {
    const o = opts || {};
    const p = clamp(prior == null ? P.init : prior);
    // 用了提示还答对：不能当成「他自己会」，把蒙对概率抬高，后验就上不去
    const guess = o.hint ? 0.55 : P.guess;
    const slip = P.slip;
    let post;
    if (correct) {
      post = (p * (1 - slip)) / (p * (1 - slip) + (1 - p) * guess);
    } else {
      post = (p * slip) / (p * slip + (1 - p) * (1 - guess));
    }
    // 学习迁移：做完一题总会学到一点，但答错时学得少
    const learn = correct ? P.learn : P.learn * 0.45;
    return clamp(post + (1 - post) * learn);
  }

  /**
   * 一串作答 → 当前概率。attempts 里每项要带 correct；按 at 排序后再算，
   * 不依赖调用方给的顺序（错题本的追加顺序和作答顺序不一定一致）。
   */
  function project(attempts, start) {
    const list = (attempts || []).slice().sort(function (a, b) {
      return String(a.at || a.completedAt || '') < String(b.at || b.completedAt || '') ? -1 : 1;
    });
    let p = clamp(start == null ? P.init : start);
    const series = [];
    list.forEach(function (a) {
      p = update(p, !!a.correct, { hint: (a.hintCount || 0) > 0 });
      series.push(Math.round(p * 100) / 100);
    });
    return { p: Math.round(p * 100) / 100, series: series, count: list.length };
  }

  function band(p) {
    if (p == null) return { key: 'unknown', label: '没测过', tone: '' };
    if (p >= 0.75) return { key: 'high', label: '高', tone: 'is-good' };
    if (p >= 0.45) return { key: 'mid', label: '中', tone: 'is-warn' };
    return { key: 'low', label: '低', tone: 'is-bad' };
  }

  // 给提示词看的一行：概率 + 档位，模型不需要知道公式，只需要知道「他大概会不会」
  function text(p) {
    if (p == null) return '没测过';
    const b = band(p);
    return Math.round(p * 100) / 100 + '（' + b.label + '）';
  }

  SHT.bkt = {
    P: P,
    update: update,
    project: project,
    band: band,
    text: text
  };
})(window);
