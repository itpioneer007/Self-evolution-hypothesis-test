/*
 * 判分：四级链路 + 一次判定冻结
 *
 * 为什么不能只有字符串比对：归一化比对（去标点 / 不分大小写 / 压空格）只对
 * 「答案唯一且写法固定」的题成立。选择题、拼写题、听写题都没问题；但开放题
 * ——看图说话、对话补全写成一句话、用英语回答问题——答案不是字符串，是一个
 * 意思。同一个意思有无数种写法，字符串永远比不完。
 *
 * 四段链路，代价从低到高，能停就早停：
 *   1. 归一化比对命中          → 直接判定，不调模型（绝大多数题走到这里）
 *   2. 可接受答案集合命中      → 直接判定，不调模型（同义写法，题目里预置）
 *   3. 仍未命中                → 调模型判一次
 *   4. 模型结果立即落库冻结    → 下游只读这条记录，永远不再重判
 *
 * 冻结的键是 (题目, 归一化后的学生答案)。同一题同一个答案，判过一次就是一条
 * 不可变事件：以后不管哪个下游来读、读几次、隔多久再读，拿到的都是同一份结论。
 * 这和 firstAttemptEvidence 是同一个思路——证据一旦产生就不再重算，否则指标
 * 会随调用次数漂移。
 *
 * 为什么冻结要做到这么硬：模型判定有随机性（同一题跑两次可能一次对一次错）。
 * 如果不冻结，错题本、考点推进、难度统计会各调一次模型、各拿一个答案，同一
 * 份作答在不同面板上显示不同结论，整套指标就没法信任了。
 *
 * 冻结不等于不可纠错。模型会误判，所以留了 override()：人工改判写一条
 * via='human' 的新记录覆盖，并保留原来的模型判定在 modelFirst 里备查。
 * 冻结的是「机器不再自行改口」，不是「人不许改」。
 */
(function (root) {
  const SHT = (root.SHT = root.SHT || {});

  // 台账上限。localStorage 只有几 MB，而这个表只增不改，得有个顶。
  const LEDGER_LIMIT = 800;

  function norm(value) { return SHT.normAnswer(value); }

  // 答案里的并列写法： "He is tall. / He's tall." 或 "A；B"
  // 只认带空格的斜杠与分号，避免把 a.m./p.m.、and/or 拆坏。
  function splitAcceptable(raw) {
    return String(raw == null ? '' : raw)
      .split(/\s+\/\s+|\s*[；;]\s*/)
      .map(function (s) { return s.trim(); })
      .filter(Boolean);
  }

  /**
   * 题目 id。生成的题带 qid；老题与手工题没有，用「单元#轮次#题号」兜底。
   * 这三段合起来在同一份数据里是唯一的，且可复算——冻结台账需要一个稳定的键。
   */
  function qidOf(question, roundNo) {
    const q = question || {};
    if (q.qid) return String(q.qid);
    const unit = (SHT.curriculum && SHT.curriculum.id) || 'unit';
    return unit + '#' + (roundNo || 0) + '#' + (q.no || 0);
  }

  function ledgerKey(question, roundNo, answer) {
    return qidOf(question, roundNo) + '|' + norm(answer);
  }

  /**
   * 作答方式。显式 open 或有不到两个选项 → 开放题（要人工输入）。
   * 选项本来就填不全的题，不该被当成「选择题缺选项」而没法作答。
   */
  function mode(question) {
    const q = question || {};
    if (q.open === true) return 'open';
    const filled = (q.options || []).filter(function (o) { return String(o || '').trim(); });
    return filled.length >= 2 ? 'choice' : 'open';
  }

  /**
   * 这道题全部可接受的答案，全部归一化。
   * 来源三处：answer 本身、answer 里用 / 或 ； 分隔的并列项、acceptable 数组。
   */
  function acceptable(question) {
    const q = question || {};
    const out = [];
    const push = function (v) {
      const n = norm(v);
      if (n && out.indexOf(n) < 0) out.push(n);
    };
    splitAcceptable(q.answer).forEach(push);
    (q.acceptable || q.acceptableAnswers || []).forEach(push);
    return out;
  }

  /**
   * 本地判定（第 1、2 段）。不调模型，纯函数，可复算。
   * @returns {{decided:boolean, correct?:boolean, via?:string, norm?:string, key?:string, reason?:string}}
   *   decided=false 表示走到了「必须问模型」这一步，调用方去调 ask()。
   */
  function local(question, answer, roundNo) {
    const raw = String(answer == null ? '' : answer).trim();
    const n = norm(raw);
    const key = ledgerKey(question, roundNo, raw);
    if (!n) {
      return { decided: false, key: key, norm: n, reason: '还没有作答内容' };
    }
    const set = acceptable(question);
    if (!set.length) {
      return { decided: false, key: key, norm: n, reason: '这道题没有标准答案，判不了' };
    }
    // 第 1 段：归一化后与标准答案完全相同。
    // 只跟 answer 本体比，不跟别名比——「与标准答案一致」和「命中了别的写法」
    // 是两件事，日志上必须能分清，否则看不出判分到底走到哪一段。
    const primary = splitAcceptable(question.answer).map(norm).filter(Boolean);
    if (primary.indexOf(n) >= 0) {
      return { decided: true, correct: true, via: 'exact', norm: n, key: key, reason: '与标准答案一致' };
    }
    // 第 2 段：可接受答案集合。除了归一化全等，再放宽一层——
    // 去掉全部空格与连字符后相同（ice cream / ice-cream / icecream）。
    // 这一层只用于「写法差异」，不猜意思；猜意思交给模型。
    const squash = function (s) { return s.replace(/[\s\-']/g, ''); };
    const sq = squash(n);
    for (let i = 0; i < set.length; i += 1) {
      if (squash(set[i]) === sq) {
        return { decided: true, correct: true, via: 'acceptable', norm: n, key: key, reason: '写法与可接受答案等价' };
      }
    }
    // 第 3 段之前先分岔：选择题的选项是封闭集合，标准答案就在其中。
    // 选了别的项，就是错——这是死判断，不需要也不应该问模型。
    // 只有开放题（答案是一句话，写法无限）才有「本地判不了」这回事。
    if (mode(question) === 'choice') {
      return { decided: true, correct: false, via: 'exact', norm: n, key: key, reason: '与标准答案不一致' };
    }
    return { decided: false, key: key, norm: n, reason: '本地比对没命中，需要判一次' };
  }

  /**
   * 台账读取。返回冻结记录或 null。
   * 命中即不再计算——这是「一次判定、落库冻结」唯一被允许的读法。
   */
  function read(ledger, question, answer, roundNo) {
    const key = ledgerKey(question, roundNo, answer);
    const hit = (ledger || {})[key];
    return hit ? Object.assign({}, hit) : null;
  }

  /**
   * 写入台账（不可变：返回新对象）。已有记录不覆盖——冻结是默认行为。
   * 要改只能走 override()，并且留下改判痕迹。
   */
  function remember(ledger, question, answer, result, roundNo) {
    const raw = String(answer == null ? '' : answer).trim();
    const key = ledgerKey(question, roundNo, raw);
    const prev = (ledger || {})[key];
    if (prev) return ledger;
    const entry = {
      key: key,
      qid: qidOf(question, roundNo),
      raw: raw,
      norm: norm(raw),
      correct: !!result.correct,
      via: result.via || 'model',
      reason: String(result.reason || '').slice(0, 120),
      confidence: result.confidence || '',
      at: new Date().toISOString()
    };
    const next = Object.assign({}, ledger || {});
    next[key] = entry;
    // 超上限时砍最旧的：这个表是审计用的，不是核心数据，按时间淘汰够用
    const keys = Object.keys(next);
    if (keys.length > LEDGER_LIMIT) {
      keys.sort(function (a, b) {
        return String(next[a].at).localeCompare(String(next[b].at));
      }).slice(0, keys.length - LEDGER_LIMIT).forEach(function (k) { delete next[k]; });
    }
    return next;
  }

  /**
   * 人工改判。冻结挡的是「机器自己改口」，不是人。
   * 原模型判定留在 modelFirst 里，以后查「为什么这条判错了」还看得到。
   */
  function override(ledger, question, answer, correct, why, roundNo) {
    const raw = String(answer == null ? '' : answer).trim();
    const key = ledgerKey(question, roundNo, raw);
    const prev = (ledger || {})[key] || {};
    const next = Object.assign({}, ledger || {});
    next[key] = Object.assign({}, prev, {
      key: key,
      qid: qidOf(question, roundNo),
      raw: raw,
      norm: norm(raw),
      correct: !!correct,
      via: 'human',
      reason: String(why || '人工改判').slice(0, 120),
      modelFirst: prev.via && prev.via !== 'human'
        ? { correct: prev.correct, via: prev.via, reason: prev.reason }
        : prev.modelFirst || null,
      at: new Date().toISOString()
    });
    return next;
  }

  /* ---------- 第 3 段：模型兜底判定 ---------- */

  function promptText(question, answer) {
    const q = question || {};
    const set = acceptable(q);
    const cell = q.cell || {};
    return {
      system: [
        '你是判分者。你只判一件事：学生的作答与标准答案是不是同一个意思。',
        '你不写解析，不评价题目，不猜学生的水平。',
        '',
        '输出必须是 JSON：{"correct":true,"reason":"","confidence":"high"}',
        'correct 只能是 true 或 false；confidence 只能是 high / medium / low。',
        '',
        '判定口径：',
        '1. 只看这一次作答，不看历史，不猜他是谁。',
        '2. 大小写、句末标点、多余空格不算错。',
        '3. 题干要求拼写或听写时，拼错一个字母就算错——不要因为「看得出他想写什么」而放过。',
        '4. 句子里同义表达算对：He is tall. 与 He\'s tall. 都对；',
        '   但换了主体、时态、单复数、肯定否定就算错，那不是写法差异，是答案变了。',
        '5. 标准答案可能给了多个可接受写法，任意一个对上就算对。',
        '6. 拿不准时判 false，confidence 写 low，reason 以「拿不准：」开头。',
        '7. reason 不超过 20 个字，只写判定依据，不要复述答案。',
        '8. 只输出 JSON。'
      ].join('\n'),
      user: [
        '题目：' + String(q.prompt || '').trim(),
        '题型：' + (cell.type || '未知') + '；考到层次：' + (cell.level || '未知'),
        '标准答案：' + String(q.answer == null ? '' : q.answer).trim(),
        set.length > 1 ? '可接受答案：' + set.join(' / ') : '',
        '学生的作答：' + String(answer == null ? '' : answer).trim()
      ].filter(Boolean).join('\n')
    };
  }

  /**
   * 调模型判一次。失败不默认判错——模型挂了不能算学生错。
   * @returns {{ok:boolean, decided:boolean, correct?:boolean, via?:string, reason?:string, confidence?:string, ms?:number, error?:string}}
   */
  async function ask(question, answer) {
    const p = promptText(question, answer);
    const res = await SHT.llm.call({
      role: 'grade',
      system: p.system,
      user: p.user,
      maxTokens: 300,
      temperature: 0.1
    });
    if (!res.ok) {
      return {
        ok: false, decided: false, via: 'model',
        error: (res.message || '判定服务不可用') + (res.errorType ? '（' + res.errorType + '）' : '')
      };
    }
    const j = res.json || {};
    if (typeof j.correct !== 'boolean') {
      return { ok: false, decided: false, via: 'model', error: '模型没有给出 true / false，这次判定作废' };
    }
    return {
      ok: true, decided: true,
      correct: j.correct,
      via: 'model',
      reason: String(j.reason || '').slice(0, 60),
      confidence: j.confidence || '',
      ms: res.ms
    };
  }

  SHT.grade = {
    LEDGER_LIMIT: LEDGER_LIMIT,
    mode: mode,
    qidOf: qidOf,
    ledgerKey: ledgerKey,
    acceptable: acceptable,
    splitAcceptable: splitAcceptable,
    local: local,
    read: read,
    remember: remember,
    override: override,
    promptText: promptText,
    ask: ask,
    // 台账里有多少条，界面拿来显示「这次判分有没有动过模型」
    size: function (ledger) { return Object.keys(ledger || {}).length; },
    // 只看模型判过的那几条，04 日志用
    modelEntries: function (ledger) {
      return Object.keys(ledger || {}).map(function (k) { return ledger[k]; })
        .filter(function (e) { return e && (e.via === 'model' || e.via === 'human'); })
        .sort(function (a, b) { return String(b.at).localeCompare(String(a.at)); });
    }
  };
})(window);
