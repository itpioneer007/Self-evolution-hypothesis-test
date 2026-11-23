/*
 * 难度变化记录的人话翻译
 *
 * 台账里存的是课程侧的分层名「认 / 辨 / 用 / 表达」。这四个字对内部是准确的，
 * 但直接印成「辨 → 用」，看的人不知道发生了什么——既不知道升了几级，
 * 也不知道凭什么升。这里统一翻成两样东西：
 *   「第 2 级（能分清，不容易混）→ 第 3 级（能自己用对）」+「升 1 级」
 *   「凭什么」写成一条能核对的话：用了多少题、预计正确率多少、越过哪条阈值线；
 *   或者「后半段慢了 210%、最后连错 2 题」这类状态证据。
 *
 * 处理旧数据的原则：字段不全就说「这条记录的依据不全」，不补、不猜。
 * 纯函数，只读入参，不读时钟、不读全局状态。
 */
(function (root) {
  const SHT = (root.SHT = root.SHT || {});

  // 顺序就是深度：认（见过）→ 辨（分得清）→ 用（用得对）→ 表达（说得出）
  const ORDER = ['认', '辨', '用', '表达'];
  const MEANING = {
    认: '能认出，但还不会用',
    辨: '能分清，不容易混',
    用: '能自己用对',
    表达: '能自己说出来、写出来'
  };
  const SOURCE_LABEL = {
    weights: '累计正确率',
    learner: '本轮掌握概率',
    fatigue: '作答状态'
  };

  function pct(v) {
    const n = Number(v);
    return isFinite(n) ? Math.round(n * 100) + '%' : '—';
  }

  function levelText(name) {
    const key = String(name || '');
    const i = ORDER.indexOf(key);
    if (i < 0) return key || '未定';
    return '第 ' + (i + 1) + ' 级「' + key + '」（' + MEANING[key] + '）';
  }

  /** 只报级别与能力，不重复「第 N 级」——用在句子里当定语。 */
  function levelShort(name) {
    const key = String(name || '');
    const i = ORDER.indexOf(key);
    if (i < 0) return key || '未定';
    return '第 ' + (i + 1) + ' 级（' + MEANING[key] + '）';
  }

  function stepText(from, to) {
    const a = ORDER.indexOf(String(from || ''));
    const b = ORDER.indexOf(String(to || ''));
    if (a < 0 || b < 0) return '方向不明';
    if (b > a) return '升高 ' + (b - a) + ' 级';
    if (b < a) return '降低 ' + (a - b) + ' 级';
    return '不变';
  }

  /**
   * 台账一行。主句说「难度升高/降低几级」，括号里说明这两级分别意味着什么：
   *   「第 1 组 · 第 1 轮：难度升高 1 级（第 2 级（能分清，不容易混）→ 第 3 级（能自己用对））」
   * 内部名「辨 / 用」只出现在括号前的编号里，不单独当正文，免得看的人去猜。
   */
  function headOf(t) {
    const from = t.from;
    const to = t.to;
    const step = stepText(from, to);
    const prefix = '第 ' + (t.group || 1) + ' 组 · 第 ' + (t.round || 1) + ' 轮：';
    if (step === '不变') {
      return prefix + '难度不变，停在第 ' + (ORDER.indexOf(String(to)) + 1) + ' 级（' +
        (MEANING[to] || '') + '）';
    }
    return prefix + '难度' + step + '，从' + levelText(from) + '到' + levelText(to);
  }

  /** 阈值说明：现在这个数越过了哪条线。线是出题当时记下来的，不是今天现算的。 */
  function thresholdText(value, up, down) {
    const n = Number(value);
    if (!isFinite(n)) return '数值缺失';
    if (isFinite(up) && n >= up) return '超过 ' + pct(up) + ' 的升档线';
    if (isFinite(down) && n <= down) return '低于 ' + pct(down) + ' 的降档线';
    if (isFinite(up) && isFinite(down)) return '在 ' + pct(down) + '–' + pct(up) + ' 之间，不该调档';
    return '阈值缺失';
  }

  function basisText(t) {
    const b = t.basis || null;
    const dir = stepText(t.from, t.to);
    if (!b) {
      return '这条记录来自旧版本导出，只留了一句内部理由（' + (t.why || '没有') +
        '），凑不出完整依据。要看完整过程请用新版本重新导出。';
    }
    if (b.kind === 'fatigue') {
      const bits = [];
      if (isFinite(b.drift) && b.drift > 0) {
        bits.push('最近 8 题里，后半段平均耗时是前半段的 ' +
          (Math.round(Number(b.drift) * 100) / 100) + ' 倍（慢了 ' +
          Math.round((Number(b.drift) - 1) * 100) + '%）');
      }
      if (isFinite(b.slowRate) && Number(b.slowRate) > 0) {
        const n = b.sample ? '这 ' + b.sample + ' 题里有 ' +
          Math.round(Number(b.slowRate) * Number(b.sample)) + ' 题超过 20 秒'
          : Math.round(Number(b.slowRate) * 100) + '% 的题超过 20 秒';
        bits.push(n);
      }
      if (isFinite(b.streak) && Number(b.streak) > 0) {
        bits.push('最后连错 ' + b.streak + ' 题');
      }
      return (bits.length ? bits.join('；') + ' → ' : '') +
        '判定为累了或卡住了，所以' + dir + '来照顾状态' +
        (b.capByPerf ? '；只看正确率本该停在第 ' + (ORDER.indexOf(String(b.capByPerf)) + 1) + ' 级' : '');
    }
    if (b.kind === 'weights') {
      return '累计 ' + (b.answered || 0) + ' 题作答后，预计这类题能答对 ' + pct(b.weight) + '；' +
        thresholdText(b.weight, b.up, b.down) + ' → ' + dir;
    }
    if (b.kind === 'learner') {
      return '这一轮平均掌握概率 ' + pct(b.avgPKnown) + '（攒够 ' + (b.basedOn || 0) +
        ' 次作答才调档）；' + thresholdText(b.avgPKnown, b.up, b.down) + ' → ' + dir;
    }
    return '依据类型未知（' + (b.kind || '空') + '），这条记录无法核对。';
  }

  /**
   * 一条台账 → 三句话。
   * @returns {{head: string, why: string, source: string}}
   */
  function explain(entry) {
    const t = entry || {};
    return {
      head: headOf(t),
      why: '凭什么：' + basisText(t),
      source: SOURCE_LABEL[t.source] || t.source || '未知'
    };
  }

  SHT.levelTrace = {
    ORDER: ORDER,
    MEANING: MEANING,
    levelText: levelText,
    levelShort: levelShort,
    stepText: stepText,
    explain: explain
  };
})(typeof window !== 'undefined' ? window : globalThis);
