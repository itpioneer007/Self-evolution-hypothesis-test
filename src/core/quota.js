/**
 * 能力配额：这一轮各类能力各出几题。
 *
 * 为什么单独一个模块：题量不该是一个数字（「出 5 题」），而是一张
 * 「能力 → 条数」的小表。理由是最小测试时一眼能看出偏差——一轮 5 题全
 * 是词汇，和 3 词汇 + 1 语法 + 1 听力，教学意义完全不同，但总数一样。
 *
 * 四类来源，产出的形状完全一样，所以接学生画像时只换来源、不改下游：
 *   profile  学生画像（项目里已有）—— 还没接，形状已经写死，见 fromProfile
 *   brief    错题画像 —— 当前没画像时最接近画像的东西
 *   scope    本轮勾选的考点范围 —— 按范围里的能力分布分
 *   manual   人手工改过 —— 只取整、不重排
 *
 * 分配算法（allocate）是确定性的：同样输入每次算出同样的配额。
 * 这条是硬要求，否则两轮之间没法比较「是模型变了还是配额变了」。
 */
(function (root) {
  'use strict';
  var SHT = root.SHT;

  var SOURCES = ['profile', 'brief', 'scope', 'unit', 'manual'];

  // 没有候选清单、也没有错题时，按这个顺序铺开（先语言基础，再输出）
  var DEFAULT_ORDER = ['vocab', 'spelling', 'sentence', 'listening', 'grammar', 'phonics', 'speaking'];

  function blank() {
    return { source: 'manual', total: 5, byAbility: {}, note: '', updatedAt: '' };
  }

  function orderOf(ability) {
    var i = SHT.SKILL_CATEGORIES.indexOf(ability);
    return i < 0 ? 99 : i;
  }

  function sum(q) {
    var by = (q && q.byAbility) || {};
    var n = 0;
    Object.keys(by).forEach(function (a) { n += Math.max(0, Math.floor(Number(by[a]) || 0)); });
    return n;
  }

  /**
   * 把 total 个名额分给若干能力。
   * 规则：名额够时先每类各 1 个（谁也别饿着），余下按权重比例分；
   * 名额不够分给每类时，只给权重最大的前 n 类。
   *
   * 不用「轮流加」：那样 9:1 和 3:1 都会算成 3:2，权重等于没用。
   * 确定性：同权重按能力枚举顺序，小数部分相同也按枚举顺序，同输入必得同输出。
   */
  function allocate(weights, total) {
    var list = (weights || []).filter(function (x) { return x && x.ability && x.w > 0; });
    var n = Math.max(0, Math.floor(Number(total) || 0));
    if (!list.length || !n) return {};
    list = list.slice().sort(function (a, b) {
      return (b.w - a.w) || (orderOf(a.ability) - orderOf(b.ability));
    });
    var picked = list.slice(0, Math.min(n, list.length));
    var out = {};
    picked.forEach(function (x) { out[x.ability] = 1; });
    var rest = n - picked.length;
    if (rest <= 0) return out;

    var sumW = picked.reduce(function (s, x) { return s + x.w; }, 0);
    var frac = [];
    var given = 0;
    picked.forEach(function (x) {
      var share = rest * x.w / sumW;
      var base = Math.floor(share);
      out[x.ability] += base;
      given += base;
      frac.push({ ability: x.ability, f: share - base });
    });
    // 名额除不尽时，小数部分大的先补一个
    frac.sort(function (a, b) {
      return (b.f - a.f) || (orderOf(a.ability) - orderOf(b.ability));
    });
    for (var i = 0; i < rest - given; i += 1) out[frac[i % frac.length].ability] += 1;
    return out;
  }

  /**
   * 归一化：只接受枚举里的能力，负数与小数为 0，total 不小于各项之和。
   * 手填的自由文本、导进来的旧数据都从这里过一遍。
   */
  function normalize(q) {
    var src = q || {};
    var raw = src.byAbility || {};
    var byAbility = {};
    SHT.SKILL_CATEGORIES.forEach(function (a) {
      var v = Math.max(0, Math.floor(Number(raw[a]) || 0));
      if (v > 0) byAbility[a] = v;
    });
    var s = sum({ byAbility: byAbility });
    var declared = Math.max(0, Math.floor(Number(src.total) || 0));
    return {
      source: SOURCES.indexOf(src.source) >= 0 ? src.source : 'manual',
      // total 是「这一轮最多出几题」，各项之和超过它时以各项之和为准：
      // 配额表是人明确写的，不能被一个概数压掉
      total: Math.max(s, declared) || 5,
      byAbility: byAbility,
      note: String(src.note || ''),
      updatedAt: String(src.updatedAt || '')
    };
  }

  function withNote(q, note) {
    var out = normalize(q);
    out.note = note;
    out.updatedAt = new Date().toISOString().slice(0, 16).replace('T', ' ');
    return out;
  }

  /**
   * 学生画像 → 配额。
   * 画像形状（与项目对接时按这个形状传，不用改这里）：
   *   { layer: 'A'|'B'|'C',
   *     weaknesses: [{ ability, wrongCount, lastWrongDays, kp }],
   *     masteredAbilities: [] }
   * 权重只看两样：错得多、最近错。算出来的绝对值没有意义，只用它排序。
   */
  function fromProfile(profile, opts) {
    var o = opts || {};
    var total = Math.max(1, Math.floor(Number(o.total) || 5));
    var ws = ((profile && profile.weaknesses) || []).filter(function (w) { return w && w.ability; });
    var weights = ws.map(function (w, i) {
      var cnt = Math.max(1, Number(w.wrongCount) || 1);
      var days = typeof w.lastWrongDays === 'number' ? Math.max(0, w.lastWrongDays) : 7;
      var recency = 1 + Math.max(0, 30 - days) / 30;
      return { ability: w.ability, w: cnt * recency, i: i };
    });
    // 同一能力被多条错题提到时合并权重，别让它一个人吃掉全部名额
    var merged = {};
    weights.forEach(function (x) {
      if (!merged[x.ability]) merged[x.ability] = { ability: x.ability, w: 0, i: x.i };
      merged[x.ability].w += x.w;
    });
    var list = Object.keys(merged).map(function (k) { return merged[k]; })
      .sort(function (a, b) { return (b.w - a.w) || (a.i - b.i); });
    var byAbility = allocate(list, total);
    return withNote({
      source: profile && profile.layer ? 'profile' : 'brief',
      total: total,
      byAbility: byAbility
    }, list.length
      ? '画像里最弱的 ' + list.length + ' 类能力'
      : '画像里没有可用的薄弱项');
  }

  /** 错题画像（brief）→ 学生画像形状 → 同一条分配算法 */
  function briefToProfile(brief) {
    var pr = (brief && brief.priority) || [];
    return {
      layer: (brief && brief.layer) || '',
      weaknesses: pr.map(function (p, i) {
        return {
          ability: p.ability || '',
          wrongCount: p.missCount || 1,
          lastWrongDays: i,           // priority 已按紧急度排好，用它当最近错
          kp: p.kp
        };
      })
    };
  }

  function fromBrief(brief, opts) {
    var o = opts || {};
    var total = Math.max(1, Math.floor(Number(o.total) || 5));
    var byAbility = fromProfile(briefToProfile(brief), { total: total }).byAbility;
    var n = Object.keys(byAbility).length;
    return withNote({ source: 'brief', total: total, byAbility: byAbility },
      n ? '按错题画像分给 ' + n + ' 类能力' : '暂无错题画像');
  }

  /** 本轮勾选的考点范围 → 按能力分布分（范围比名额少时最多出这么几题） */
  function fromScope(scope, opts) {
    var o = opts || {};
    var list = (scope || []).filter(function (s) { return s && s.label !== undefined; });
    if (!list.length) return null;
    var tally = {};
    list.forEach(function (s) {
      var a = s.ability || 'vocab';
      tally[a] = (tally[a] || 0) + 1;
    });
    var weights = Object.keys(tally).map(function (a) { return { ability: a, w: tally[a] }; });
    var cap = Math.min(Math.max(1, Math.floor(Number(o.total) || 5)), list.length);
    return withNote({
      source: 'scope',
      total: cap,
      byAbility: allocate(weights, cap)
    }, '按勾选的 ' + list.length + ' 个考点分配');
  }

  /** 都没有时铺开：有候选清单按清单的能力分布，没有就按 DEFAULT_ORDER */
  function fromUnit(kps, opts) {
    var o = opts || {};
    var total = Math.max(1, Math.floor(Number(o.total) || 5));
    var tally = {};
    (kps || []).forEach(function (k) {
      var a = k && k.ability;
      if (a) tally[a] = (tally[a] || 0) + 1;
    });
    var weights = Object.keys(tally).map(function (a) { return { ability: a, w: tally[a] }; });
    if (!weights.length) {
      weights = DEFAULT_ORDER.map(function (a, i) { return { ability: a, w: DEFAULT_ORDER.length - i }; });
    }
    return withNote({
      source: 'unit',
      total: total,
      byAbility: allocate(weights, total)
    }, kps && kps.length ? '按本册候选清单的能力分布' : '按默认顺序铺开');
  }

  /**
   * 不给来源时的自动选择，也是界面上「重算」按钮走的路。
   * 顺序：勾了范围 → 按范围；有错题 → 按错题；都没有 → 按本册铺开。
   */
  function auto(opts) {
    var o = opts || {};
    var total = Math.max(1, Math.floor(Number(o.total) || 5));
    var byScope = fromScope(o.scope, { total: total });
    if (byScope && sum(byScope) > 0) return byScope;
    var byBrief = fromBrief(o.brief, { total: total });
    if (sum(byBrief) > 0) return byBrief;
    return fromUnit(o.kps, { total: total });
  }

  /**
   * 代码闸：规划结果按配额裁一遍。
   * 超额的能力剔掉多余条目（保留靠前的，规划已按优先级排过）。
   *
   * 配额表里没给的能力（cap 0）不当违规：只要总名额还空着就收下，记进 extra。
   * 这条是实跑校准出来的——按本册候选清单自动算配额时，清单里没有 listening
   * 这类能力，一上来就把听力题全剔了。配额要防的是「一轮全考词汇」，
   * 不是禁止考清单外的一类。没排满只记下来，不补假题。
   */
  function apply(plans, quota) {
    var q = normalize(quota);
    var want = q.byAbility;
    var hasTable = Object.keys(want).length > 0;
    var limit = Math.max(sum(q), q.total);
    var got = {};
    var kept = [];
    var over = [];
    var extra = [];
    (plans || []).forEach(function (p) {
      var a = p.ability || 'vocab';
      if (!hasTable) { kept.push(p); got[a] = (got[a] || 0) + 1; return; }
      var cap = want[a] || 0;
      if (cap === 0) {
        if (kept.length >= limit) { over.push({ ability: a, kp: p.kp }); return; }
        got[a] = (got[a] || 0) + 1;
        kept.push(p);
        extra.push({ ability: a, kp: p.kp });
        return;
      }
      if ((got[a] || 0) >= cap) { over.push({ ability: a, kp: p.kp }); return; }
      got[a] = (got[a] || 0) + 1;
      kept.push(p);
    });
    kept.forEach(function (p, i) { p.no = i + 1; });

    var byAbility = {};
    var short = [];
    Object.keys(want).forEach(function (a) {
      byAbility[a] = { want: want[a], got: got[a] || 0 };
      if ((got[a] || 0) < want[a]) short.push({ ability: a, want: want[a], got: got[a] || 0 });
    });
    Object.keys(got).forEach(function (a) {
      if (!byAbility[a]) byAbility[a] = { want: 0, got: got[a] };
    });
    return {
      plans: kept,
      over: over,
      extra: extra,
      filled: kept.length,
      report: { byAbility: byAbility, filled: kept.length, total: q.total, short: short, extra: extra, source: q.source }
    };
  }

  /** 一行摘要，给提示词、状态栏、日志共用 */
  function text(q) {
    var by = (q && q.byAbility) || {};
    var parts = Object.keys(by).map(function (a) { return a + ' ' + by[a]; });
    return parts.length ? parts.join(' / ') : '未分配';
  }

  SHT.quota = {
    blank: blank,
    normalize: normalize,
    sum: sum,
    allocate: allocate,
    fromProfile: fromProfile,
    fromBrief: fromBrief,
    fromScope: fromScope,
    fromUnit: fromUnit,
    auto: auto,
    apply: apply,
    text: text,
    DEFAULT_ORDER: DEFAULT_ORDER
  };
}(typeof window !== 'undefined' ? window : global));
