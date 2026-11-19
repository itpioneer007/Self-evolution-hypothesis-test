/*
 * 练了几天以后，题目是不是朝这个学生的方向走
 *
 * 这里回答的不是「这一轮出了什么题」，而是跨会话的三件事：
 *   1 方向：答得是不是越来越稳（前几轮 vs 后几轮的正确率）
 *   2 广度：这个单元有多少考点被覆盖到
 *   3 深度：有多少考点是练过两次以上、而不是只露过一次脸
 *
 * 不把「正确率上升」说成「自适应有效」——正确率上升也可能是学生自己学会了。
 * 这里只陈述观测到的数字，结论留给人判断；样本不够就直说看不出方向。
 *
 * 纯函数，只读入参，不读时钟、不读全局状态。学生端不显示，进导出给开发复盘。
 */
(function (root) {
  const SHT = (root.SHT = root.SHT || {});

  const ORDER = ['认', '辨', '用', '表达'];

  function num(v, d) {
    const n = Number(v);
    return isFinite(n) ? n : (d || 0);
  }
  function r4(v) { return Math.round(num(v, 0) * 10000) / 10000; }
  function pct(v) { return v == null ? '—' : Math.round(num(v, 0) * 100) + '%'; }

  /**
   * @param {object} opts {
   *   sessions,      练习会话（含每轮的 right / wrong）
   *   levelTrace,    难度变化台账
   *   learnerModel,  learner.build(events) 的输出
   *   totalKps,      本单元考点总数（算广度用）
   * }
   */
  function build(opts) {
    const o = opts || {};
    const sessions = Array.isArray(o.sessions) ? o.sessions : [];
    const trace = Array.isArray(o.levelTrace) ? o.levelTrace : [];
    const model = o.learnerModel || {};
    const totalKps = Math.max(0, num(o.totalKps, 0));

    // 每一轮一条正确率。只取真正作过答的（right + wrong > 0），
    // 出题没答的轮次不算证据。
    const rounds = [];
    sessions.forEach(function (s) {
      (s && s.rounds ? s.rounds : []).forEach(function (r) {
        const right = num(r.right, 0);
        const wrong = num(r.wrong, 0);
        const n = right + wrong;
        if (!n) return;
        rounds.push({
          group: num(r.group, 1), no: num(r.no, 1),
          right: right, wrong: wrong, rate: r4(right / n)
        });
      });
    });

    const accuracy = { rounds: rounds.length, first: null, last: null, delta: null };
    if (rounds.length >= 2) {
      const h = Math.max(1, Math.floor(rounds.length / 3));
      const avg = function (arr) {
        return r4(arr.reduce(function (a, b) { return a + b.rate; }, 0) / arr.length);
      };
      accuracy.first = avg(rounds.slice(0, h));
      accuracy.last = avg(rounds.slice(-h));
      accuracy.delta = r4(accuracy.last - accuracy.first);
    }

    // 广度：覆盖了几个考点；深度：有几个是练过两次以上的。
    const byKp = model.byKp && typeof model.byKp === 'object' ? model.byKp : {};
    const labels = Object.keys(byKp);
    const deep = labels.filter(function (k) { return num(byKp[k].attempts, 0) >= 2; }).length;
    const totalAttempts = labels.reduce(function (a, k) { return a + num(byKp[k].attempts, 0); }, 0);
    const coverage = {
      known: labels.length,
      total: totalKps,
      ratio: totalKps ? r4(labels.length / totalKps) : null,
      deep: deep,
      avgAttempts: labels.length ? r4(totalAttempts / labels.length) : 0
    };
    const weakLeft = labels.filter(function (k) {
      const b = byKp[k];
      return num(b.wrong, 0) > 0 && b.tendency !== 'solid';
    }).length;

    const difficulty = {
      steps: trace.length,
      from: trace.length ? (trace[0].from || '') : '',
      to: trace.length ? (trace[trace.length - 1].to || '') : '',
      ups: trace.filter(function (t) {
        return ORDER.indexOf(t.to) > ORDER.indexOf(t.from);
      }).length
    };

    // 两句话：一句讲方向，一句讲广度与深度。
    let direction;
    if (accuracy.delta == null) {
      direction = '只练了 ' + rounds.length + ' 轮，样本不够，看不出方向';
    } else if (accuracy.delta > 0.05) {
      direction = '答得越来越稳：正确率从 ' + pct(accuracy.first) + ' 到 ' + pct(accuracy.last);
    } else if (accuracy.delta < -0.05) {
      direction = '答得反而吃力：正确率从 ' + pct(accuracy.first) + ' 到 ' + pct(accuracy.last) +
        '，可能是难度上得太快';
    } else {
      direction = '正确率稳定在 ' + pct(accuracy.last) + '，难度和现在的水平基本匹配';
    }
    const breadth = totalKps
      ? '广度：覆盖 ' + coverage.known + '/' + totalKps + ' 个考点；深度：' + deep + ' 个练过两次以上'
      : '广度：覆盖 ' + coverage.known + ' 个考点；深度：' + deep + ' 个练过两次以上';

    return {
      rounds: rounds,
      accuracy: accuracy,
      coverage: coverage,
      weakLeft: weakLeft,
      difficulty: difficulty,
      summary: direction + '；' + breadth + '；还有 ' + weakLeft + ' 处没掌握'
    };
  }

  SHT.trend = { build: build };
})(typeof window !== 'undefined' ? window : globalThis);
