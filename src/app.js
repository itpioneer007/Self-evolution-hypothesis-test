/*
 * 最小出题测试工作台 · 界面逻辑
 *
 * 定位：给人手工出题用的模板，不是自动出题器，后面才「注入灵魂」。
 * 界面只自动做五件事：排不重复的出题角度、从静态候选清单确定性带出 4 项、记录检查结果、
 * 判学生的答案、把错题写进错题本；算指标也在这里。
 * 题目内容由人按格子填写 —— 对应出题手册「最小测试全手工」的口径。
 *
 * 四个 tab 按流程切分：
 *   01 出题 = 岗位 1/2/3（课程排考点 / 生成写题 / 验证判题），一次只显示一个角色；
 *           岗位 4（诊断）在作答之后跑，解释他为什么这么答
 *   02 答题 = 学生侧：作答 → 判对错 → 对就换考点 / 错就当场写进错题（下一轮由模型重出回练题）
 *   03 错题 = 出题侧回边：错因 → 出题要点 → 写入计划 → 回 01 出下一轮
 *   04 日志 = 环节 4/5，含跨轮事前排除、作答记录与停止决策
 *
 * 数据只写 localStorage（实验数据，不涉及真实学生信息）。
 */
(function (root) {
  const SHT = root.SHT;
  const STORAGE_KEY = 'sht-minimal-test-v2';
  const LEGACY_KEY = 'sht-minimal-test-v1';
  const $ = function (id) { return document.getElementById(id); };

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function blankQuestionShape(no) {
    return {
      no: no, knowledgePoint: '', ability: '',
      cell: { type: '听音选义', scene: SHT.curriculum.topicDomain, level: '认', distractor: '同类不同物' },
      prompt: '', audioText: '', options: ['', '', ''], answer: '', analysis: '', nextIfWrong: '', checks: {}
    };
  }

  function cloneSample(unitId, count) {
    const base = SHT.sampleQuestionsFor(unitId || SHT.curriculum.id).map(function (q) {
      return Object.assign({}, q, {
        cell: Object.assign({}, q.cell),
        options: (q.options || []).slice(),
        checks: {}
      });
    });
    const n = clampCount(count || base.length);
    while (base.length < n) base.push(blankQuestionShape(base.length + 1));
    return base.slice(0, n);
  }

  function cloneWrongCases(unitId) {
    return SHT.buildWrongCases(unitId || SHT.curriculum.id).map(function (c) {
      return Object.assign({}, c, {
        firstAttemptEvidence: Object.assign({}, c.firstAttemptEvidence),
        variantAttempts: c.variantAttempts.map(function (a) { return Object.assign({}, a); })
      });
    });
  }

  function blankPractice() {
    return {
      cursor: 0,
      picked: null,
      // 开放题的作答原文。选择题不用它，提交时从选项取。
      draft: '',
      // 正在等模型判定（第 3 段）。界面上要显示「判定中」，不能让人以为没反应。
      grading: false,
      // 模型判定失败时的原话。失败不判对错，也不能静默吞掉。
      gradeError: '',
      hintUsed: false,
      hintGone: -1,
      revealed: null,
      // 这一题是什么时候出现在屏幕上的。作答耗时要靠它算——耗时是诊断的一条证据：
      // 3 秒内选错和想了 20 秒选错，不是同一回事。
      shownAt: 0,
      attempts: []
    };
  }

  function blankRound() {
    return { questions: [], stopSignals: [], endReason: '', closed: false, practice: blankPractice(), progressCommitted: false };
  }

  function defaultState() {
    return {
      version: 2,
      bookId: SHT.BOOKS.current().meta.id,
      unitId: SHT.curriculum.id,
      tab: 'agents',
      agent: 'course',
      checkLayer: 0,
      round: 1,
      activeNo: 1,
      learningLayer: SHT.sampleLearningLayer || 'B',
      rounds: { 1: blankRound(), 2: blankRound() },
      questionCounts: { 1: 5, 2: 5 },
      wrongCases: cloneWrongCases(),
      failures: [],
      llmBusy: false,
      // 本轮要考察的知识点范围（候选清单里的 id）。空数组 = 不限制，交规划环节现场提
      kpScope: [],
      agentMemory: SHT.agentMemory.blank(),
      // 每个考点考到哪一层、哪些已经退役，跨轮累积
      progress: SHT.progress.blank(),
      // 能力配额：这一轮各类能力各出几题。来源见 core/quota.js，接画像后只换来源
      quota: SHT.quota.blank(),
      // 判分台账：(题目, 归一化后的答案) → 判定结论。一次判定、落库冻结，
      // 下游只读不重判。见 core/grade.js 顶部说明。
      gradeLedger: {},
      // 诊断台账：键与判分台账相同（题目 + 归一化答案）。一次诊断、落库冻结，
      // 错题本、课程角色、日志都只读这一份，不各自重算。见 core/diagnose.js。
      diagnoses: {},
      /*
       * 审计留痕：每次模型调用压成一行，四角色各留各的。
       * 只存「谁、什么时候、说了什么结论、多久」，不存提示词原文——
       * 原文里有学生作答，落进 localStorage 等于又存了一份学情。
       * 界面展示与导出 JSON 都读这一份，不只是读内存日志。
       */
      // 日志按天分组后，哪些天是展开的（键是 YYYY-MM-DD，缺省只展开最近一天）
      logOpenDays: {},
      traces: [],
      traceLastId: 0,
      // 拦截演练记录：人为混入超纲题/错答案题，看验证角色拦不拦得住
      auditDrills: []
    };
  }

  function normalizeState(parsed) {
    if (!parsed.bookId) parsed.bookId = 'PEP-G4A';
    if (!Array.isArray(parsed.failures)) parsed.failures = [];
    if (!Array.isArray(parsed.kpScope)) parsed.kpScope = [];
    if (!parsed.agentMemory || !parsed.agentMemory.plan) parsed.agentMemory = SHT.agentMemory.blank();
    if (!parsed.progress || !parsed.progress.points) parsed.progress = SHT.progress.blank();
    // 老数据没有判分台账：给个空表，已有作答记录不受影响（它们自带 correct）
    if (!parsed.gradeLedger || typeof parsed.gradeLedger !== 'object') parsed.gradeLedger = {};
    if (!parsed.diagnoses || typeof parsed.diagnoses !== 'object') parsed.diagnoses = {};
    // 审计数据：老存档没有这两个数组，补空；游标补 0 表示「从头开始收」
    if (!Array.isArray(parsed.traces)) parsed.traces = [];
    if (!Array.isArray(parsed.auditDrills)) parsed.auditDrills = [];
    if (typeof parsed.traceLastId !== 'number') parsed.traceLastId = 0;
    if (!parsed.logOpenDays || typeof parsed.logOpenDays !== 'object') parsed.logOpenDays = {};
    parsed.quota = SHT.quota.normalize(parsed.quota);
    if (!parsed.unitId) parsed.unitId = SHT.curriculum.id;
    if (!parsed.questionCounts || typeof parsed.questionCounts !== 'object') parsed.questionCounts = { 1: 5, 2: 5 };
    parsed.questionCounts[1] = clampCount(parsed.questionCounts[1]);
    parsed.questionCounts[2] = clampCount(parsed.questionCounts[2]);
    if (!parsed.wrongCases) parsed.wrongCases = cloneWrongCases(parsed.unitId);
    if (!parsed.rounds[2]) parsed.rounds[2] = blankRound();
    ['1', '2'].forEach(function (k) {
      const r = parsed.rounds[k] = Object.assign(blankRound(), parsed.rounds[k] || {});
      if (!Array.isArray(r.stopSignals)) r.stopSignals = [];
      // v1 用单个 endedEarly 布尔，迁移成停止信号 + 依据
      if (r.endedEarly && !r.stopSignals.length) r.stopSignals.push('SATURATED');
      delete r.endedEarly;
      // 早期版本没有作答记录，补一份空的，作答从第 1 题开始
      r.practice = Object.assign(blankPractice(), r.practice || {});
      if (!Array.isArray(r.practice.attempts)) r.practice.attempts = [];
      if (!r.practice.shownAt) r.practice.shownAt = 0;
      if (r.progressCommitted == null) r.progressCommitted = false;
    });
    if (!parsed.learningLayer) parsed.learningLayer = SHT.sampleLearningLayer || 'B';
    if (!parsed.tab) parsed.tab = 'agents';
    if (!parsed.agent) parsed.agent = 'course';
    return parsed;
  }

  function loadState() {
    let raw = null;
    try { raw = localStorage.getItem(STORAGE_KEY); } catch (err) { /* ignore */ }
    if (!raw) {
      // 从 v1 结构迁移：只保留两轮题目，其余补默认值
      try {
        const legacy = localStorage.getItem(LEGACY_KEY);
        if (legacy) {
          const old = JSON.parse(legacy);
          const s = defaultState();
          if (old && old.rounds) s.rounds = old.rounds;
          if (old && old.round) s.round = old.round;
          return normalizeState(s);
        }
      } catch (err) { /* ignore */ }
      return defaultState();
    }
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || !parsed.rounds || !parsed.rounds[1]) return defaultState();
      return normalizeState(parsed);
    } catch (err) {
      return defaultState();
    }
  }

  let state = loadState();
  // 先按存过的书切，再切单元；只切单元会拿错词表边界
  SHT.setBook(state.bookId, state.unitId);
  if (!state.rounds[1].questions.length) state.rounds[1].questions = cloneSample(state.unitId, countFor(1));

  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (err) { /* 隐私模式下忽略 */ }
  }

  function currentRound() { return state.rounds[state.round]; }
  function currentQuestion() { return currentRound().questions[state.activeNo - 1] || null; }
  function clampCount(v) {
    const n = Math.round(Number(v));
    if (!isFinite(n)) return 5;
    return Math.max(1, Math.min(15, n));
  }
  function countFor(roundNo) {
    return clampCount((state.questionCounts && state.questionCounts[roundNo]) || 5);
  }

  // 题量变化时立即增删题目：多了补空题，少了截断，并重排题号
  function resizeQuestions(round, count) {
    const n = clampCount(count);
    const list = round.questions;
    while (list.length < n) list.push(blankQuestionShape(list.length + 1));
    if (list.length > n) list.length = n;
    list.forEach(function (q, i) { q.no = i + 1; });
  }

  function verdictOf(q) {
    if (!q) return '待检';
    // 模型质检过的题以模型结论为准；人工勾的 checks 优先级更高（人能否决模型）
    const checks = q.checks || {};
    const human = Object.keys(checks).filter(function (k) { return k.charAt(0) !== '_'; }).map(function (k) { return checks[k]; });
    if (human.indexOf('fail') >= 0) return '退回';
    if (q.modelVerdict === 'fail') return '退回';
    if (q.modelVerdict === 'pass') return '通过';
    if (q.modelVerdict === 'unverified') return '待复核';
    const values = human;
    if (values.indexOf('fail') >= 0) return '退回';
    const total = SHT.ALL_CHECKS.length;
    if (values.length === total && values.every(function (v) { return v === 'pass'; })) return '通过';
    return '待检';
  }

  /* ---------- 变化轴：确定性分配不重复格子 ---------- */
  function generateCells(count, exclusion) {
    const types = ['听音选义', '中英匹配', '拼写补全', '字母组合辨音', '选词填空', '对话补全', '句子判断', '看图说词', '听写'];
    const out = [];
    const seen = new Set();
    for (let i = 0; i < 120 && out.length < count; i += 1) {
      const cell = {
        type: types[i % types.length],
        scene: SHT.curriculum.topicDomain,
        level: SHT.LEVELS[Math.floor(i / 2) % SHT.LEVELS.length],
        distractor: SHT.DISTRACTORS[(i * 5 + Math.floor(i / 7)) % SHT.DISTRACTORS.length]
      };
      const fp = SHT.cellFingerprint(cell);
      if (seen.has(fp)) continue;
      if (exclusion && exclusion.isCellBlocked(cell)) continue;
      seen.add(fp);
      out.push(cell);
    }
    return out;
  }

  function historicalRounds() {
    const list = [];
    if (state.round === 2 && state.rounds[1].questions.length) list.push(state.rounds[1]);
    return list;
  }

  function exclusionForCurrentRound() { return SHT.buildExclusionList(historicalRounds()); }
  function weaknessProjection() {
    return SHT.projectWeaknesses(state.wrongCases, SHT.curriculum.topicDomain);
  }

  /* ---------- 角色定义：同一个模型，四套提示词 / 上下文 ----------
   * 这里说「角色」不说「角色」：模型不会自己去做事，没有工具、没有跨调用记忆，
   * 每次都是代码拼好上下文、调一次、拿回一段 JSON。它只是同一个底模的四个岗位。
   */
  const ROLES = [
    {
      id: 'course', no: '岗位 1', name: '课程角色', stage: '排考点',
      prompt: '命题规划 · 按题量配额',
      memory: '上轮角度 · 诊断结论 · 掌握概率',
      skill: '变化轴 · 配额约束'
    },
    {
      id: 'execute', no: '岗位 2', name: '生成角色', stage: '写题',
      prompt: '单题生成 · 九字段',
      memory: '仅本单元词表',
      skill: '词表取材 · 干扰项设计'
    },
    {
      id: 'verify', no: '岗位 3', name: '验证角色', stage: '判题',
      prompt: '独立验证 · 只判题目本身',
      memory: '词表 · 15 条可判条款',
      skill: '四层判据 · 条款号'
    },
    {
      id: 'diagnose', no: '岗位 4', name: '诊断角色', stage: '作答后',
      prompt: '作答归因 · 选项级对照',
      memory: '代码证据 · 固定错因编号',
      skill: '形近 / 音近 / 词形 · 排除理由'
    }
  ];

  // 卡片上的记忆摘要：课程/生成/验证/诊断 对应 agents.js 里的 plan/generate/verify/diagnose
  const AGENT_OF_ROLE = { course: 'plan', execute: 'generate', verify: 'verify', diagnose: 'diagnose' };
  function agentMemLine(roleId) {
    const id = AGENT_OF_ROLE[roleId];
    if (!id || !state.agentMemory) return '';
    return SHT.agentMemory.summary(state.agentMemory, id);
  }

  function renderAgentRail() {
    $('agentRail').innerHTML = ROLES.map(function (r) {
      return '<button type="button" class="agent-card' + (state.agent === r.id ? ' is-active' : '') + '" data-role="' + r.id + '">' +
        '<div class="agent-top"><span class="agent-name">' + esc(r.name) + '</span><span class="agent-stage">' + esc(r.no) + ' · ' + esc(r.stage) + '</span></div>' +
        '<div class="agent-meta">' +
          '<div class="agent-meta-row"><span>提示词</span><span>' + esc(r.prompt) + '</span></div>' +
          '<div class="agent-meta-row"><span>记忆</span><span>' + esc(r.memory) +
            (agentMemLine(r.id) ? '<em class="agent-mem">' + esc(agentMemLine(r.id)) + '</em>' : '') + '</span></div>' +
          '<div class="agent-meta-row"><span>技能</span><span>' + esc(r.skill) + '</span></div>' +
        '</div></button>';
    }).join('');
  }

  /* ---------- 01 课程角色：配额表 ---------- */
  function selectHtml(values, selected) {
    return values.map(function (v) {
      return '<option value="' + esc(v) + '"' + (v === selected ? ' selected' : '') + '>' + esc(v) + '</option>';
    }).join('');
  }

  function kpById(id) {
    return SHT.KNOWLEDGE_POINTS.filter(function (k) { return k.id === id; })[0] || null;
  }

  // 候选知识点只给当前单元，换单元时下拉跟着换
  function unitKps() { return SHT.kpsOf(SHT.curriculum.id); }

  function kpSelectHtml() {
    const list = unitKps();
    return '<option value="">从候选中挑一个…</option>' +
      SHT.KP_GROUPS.map(function (g) {
        const items = list.filter(function (k) { return k.group === g.id; });
        if (!items.length) return '';
        return '<optgroup label="' + esc(g.name) + '">' +
          items.map(function (k) {
            return '<option value="' + esc(k.id) + '">' + esc(k.label) + '</option>';
          }).join('') + '</optgroup>';
      }).join('');
  }

  function kpFoldHtml() {
    const list = unitKps();
    // 只有 PEP 四上入库了候选清单；冀教、湘少版的考点由模型现场提，不给假候选
    if (!list.length) {
      return '<div class="kp-empty">这本教材没有预先整理的考点清单，考点由模型现场提</div>';
    }
    const scope = state.kpScope || [];
    const doneCount = (state.progress && state.progress.points)
      ? Object.keys(state.progress.points).filter(function (k) { return state.progress.points[k].retired; }).length : 0;
    const layer = state.learningLayer || 'B';
    const scopeBar = '<div class="kp-scope">这一轮挑了 <strong>' + scope.length + '</strong> 个考点，本书共 ' + list.length + ' 个' +
      '<span class="kp-scope-note">他当前是 ' + layer + ' 层，最多考到「' + SHT.progress.CAP_OF_LAYER[layer] + '」' + (doneCount ? '，已掌握 ' + doneCount + ' 个考点' : '') + '</span>' +
      (scope.length
        ? '<span class="kp-scope-note">最多出 ' + scope.length + ' 题</span><button type="button" class="btn btn-mini" data-action="clear-scope">清空</button>'
        : '<span class="kp-scope-note">不限范围 · 规划环节现场提</span>') +
      '</div>';
    return '<details class="kp-fold"' + (scope.length ? ' open' : '') + '><summary>候选知识点 · ' + SHT.curriculum.id + ' · ' + list.length + '</summary>' +
      scopeBar +
      '<div class="kp-current"><b>纳入</b>＝加进这一轮要考的范围；<b>写进第 N 题</b>＝直接把这条考点填到那道题上</div>' +
      SHT.KP_GROUPS.map(function (g) {
        const items = list.filter(function (k) { return k.group === g.id; });
        if (!items.length) return '';
        return '<div class="kp-group"><div class="kp-group-head"><strong>' + esc(g.name) + '</strong>' +
          '<span>' + esc(g.note) + '</span></div>' +
          items.map(function (k) {
            const inScope = scope.indexOf(k.id) >= 0;
            return '<div class="kp-item' + (inScope ? ' is-scope' : '') + '">' +
              '<div class="kp-main"><span class="kp-label">' + esc(k.label) + '</span>' +
                '<button type="button" class="btn btn-mini' + (inScope ? ' is-on' : '') + '" data-action="toggle-scope" data-id="' + esc(k.id) + '">' +
                  (inScope ? '移出' : '纳入') + '</button>' +
                '<button type="button" class="btn btn-mini" data-action="pick-kp" data-id="' + esc(k.id) + '">写进第 ' + state.activeNo + ' 题</button></div>' +
              '<div class="kp-why">' + esc(k.why) + '　<span>依据：' + esc(k.source) + '</span></div>' +
              '<div class="kp-meta">建议出题角度：' + esc(k.cell.type) + ' / ' + esc(k.cell.level) + ' / ' + esc(k.cell.distractor) +
                '　·　可以这样问：' + esc(k.example) + '</div>' +
            '</div>';
          }).join('') + '</div>';
      }).join('') + '</details>';
  }

  // 勾选的候选知识点 → 交给规划角色的范围（带 label / ability / 建议角度）
  function kpScopePayload() {
    return (state.kpScope || []).map(function (id) {
      const kp = kpById(id);
      if (!kp) return null;
      return { id: kp.id, label: kp.label, ability: kp.ability, cell: kp.cell };
    }).filter(Boolean);
  }

  function toggleScope(id) {
    const kp = kpById(id);
    if (!kp) return;
    state.kpScope = state.kpScope || [];
    const at = state.kpScope.indexOf(id);
    if (at >= 0) state.kpScope.splice(at, 1);
    else state.kpScope.push(id);
    // 范围变了配额跟着重算：勾 3 个考点就该按这 3 个的能力分布分名额，
    // 否则会出现「范围里没有听力，却给听力留一个名额」。人手动改过的不动。
    if (state.quota && state.quota.source !== 'manual') {
      state.quota = SHT.quota.auto({
        scope: kpScopePayload(),
        kps: unitKps(),
        total: quotaLimit()
      });
    }
    save(); renderAll();
    toast(at >= 0 ? '已移出范围：' + kp.label : '已纳入范围：' + kp.label);
  }

  function applyKnowledgePoint(id, no, withCell) {
    const kp = kpById(id);
    const q = currentRound().questions[no - 1];
    if (!kp || !q) return;
    q.knowledgePoint = kp.label;
    q.ability = kp.ability;
    q.nextIfWrong = kp.nextIfWrong;
    if (withCell) q.cell = Object.assign({}, kp.cell);
    save(); renderAll();
    toast(withCell
      ? '第 ' + no + ' 题带出了知识点 / 能力 / 出题角度 / 错了下轮出什么，都能改'
      : '已填入候选知识点；出题角度请回第 1 个角色改');
  }

  /* ---------- 没出成的题：按考点分组 ---------- */
  // 术语表：界面上不出现 V1 / C3 / QUOTA_OVER 这类只有写代码的人看得懂的编号。
  // 条款号仍然保留在 title 里，排查时能对上代码。
  const STAGE_TEXT = { plan: '排考点', generate: '写题', validate: '自动检查', verify: '验证', giveup: '放弃' };
  const CODE_TEXT = {
    V1: '用了没教过的词', V2: '答案在选项里露了', V3: '选项不合规', V3b: '干扰项太好排除',
    V3c: '干扰拼写不像错拼', V4: '题干泄露答案', V5: '解析没说到点上', V6: '听力原文对不上',
    V7: '题型和考点对不上', V8: '和同轮别的题撞角度', V9: '解析自己说另一个选项也成立',
    C1: '考点不够具体', C2: '不属于本单元', C3: '答案不唯一', C4: '题干有两种读法',
    C5: '语言不规范', C6: '听力原文对不上', C7: '这句读出来会歧义', C8: '配图和题不符',
    F1: '没冲着错因出', F2: '阶段不匹配', F3: '引入了没学过的词', F4: '一题压了两个难点',
    F5: '提到了他上次做错', F6: '难到他做不出来',
    P1: '和同轮别的题同格', P2: '相邻两题难度跳档', P3: '同题型连着太多', P4: '做题时间超出范围',
    P5: '放在这个位置不合适',
    L1: '解析没讲清楚', L2: '归不到具体知识点', L3: '缺出题角度标记', L4: '说不出下一轮该出什么',
    PLAN_SCOPE: '超出本轮范围', PLAN_DUP: '考点重复', PLAN_RETIRED: '考点已掌握',
    PLAN_SWITCH_KP: '诱饵造不出，换了相近考点', BENCH_UP: '替补顶上',
    PLAN_LEVEL_CAP: '层次超过上限', PLAN_EMPTY: '没提到可用考点',
    QUOTA_OVER: '超出能力配额', QUOTA_SHORT: '配额没排满', QUOTA_OFF: '不在配额内',
    GIVE_UP: '三次都没过', VERIFY_NO_CODE: '验证没说清理由', EXCEPTION: '程序出错'
  };

  /*
   * 时间显示。记录统一存 ISO（带 Z，UTC），但人看的是本地时间。
   * 以前这里直接从字符串里截 T 后面的时分，等于把 UTC 当本地时间印出来——
   * 东八区所有时间戳都差 8 小时，下午 4 点跑的一轮日志上写着早上 8 点，
   * 审查的人会以为数据是别的时段采的。必须走 Date 转本地。
   */
  function timeOf(iso) {
    const d = new Date(iso);
    if (!isNaN(d.getTime())) {
      const pad = function (n) { return (n < 10 ? '0' : '') + n; };
      return pad(d.getHours()) + ':' + pad(d.getMinutes());
    }
    // 兜底：老数据里可能有非 ISO 的时间写法，能截出时分就截
    const m = String(iso || '').match(/T(\d{2}:\d{2})/);
    return m ? m[1] : '';
  }
  // 导出给冒烟测试用：时区换算这种错，只有测了才不会回来
  SHT.timeOf = timeOf;
  // 这两个也导出：逐项说明与「这一轮失败」都是纯字符串/数组处理，
  // 单独断言比在整页 HTML 里 grep 稳
  SHT.optionNotesHtml = optionNotesHtml;
  SHT.failuresOfRound = failuresOfRound;

  function codeText(code) {
    return CODE_TEXT[code] || code;
  }

  /*
   * 这一轮的失败记录。
   * 老存档里的失败条目没有 round 字段（那时候还没记），只能用本轮的 startedAt 兜底；
   * 两个都没有就不算——宁可少报，也不把上一轮的账记到这一轮头上。
   */
  function failuresOfRound(roundNo, failures, startedAt) {
    const since = startedAt ? new Date(startedAt).getTime() : 0;
    return (failures || []).filter(function (f) {
      if (typeof f.round === 'number' && f.round > 0) return f.round === roundNo;
      if (!since) return false;
      const t = f.at ? new Date(f.at).getTime() : 0;
      return t >= since;
    });
  }

  /* ---------- 日志按天分组 ---------- */
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function dayKey(iso) {
    const d = iso ? new Date(iso) : null;
    if (!d || isNaN(d.getTime())) return '';
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }
  // 能一眼找到「哪一天」：今天 / 昨天 / 11月10日 周一
  const WEEK = ['日', '一', '二', '三', '四', '五', '六'];
  function dayLabel(key) {
    if (!key) return '没有时间记录';
    const now = new Date();
    const today = dayKey(now.toISOString());
    const yest = dayKey(new Date(now.getTime() - 86400000).toISOString());
    const d = new Date(key + 'T00:00:00');
    const md = (d.getMonth() + 1) + '月' + d.getDate() + '日 周' + WEEK[d.getDay()];
    if (key === today) return '今天 · ' + md;
    if (key === yest) return '昨天 · ' + md;
    return d.getFullYear() + '年 · ' + md;
  }
  // 展开状态存在 state 里，重渲染不丢；默认只展开最近一天，其余收起
  function isDayOpen(key, firstKey) {
    const open = state.logOpenDays || {};
    if (Object.prototype.hasOwnProperty.call(open, key)) return !!open[key];
    return key === firstKey;
  }

  /*
   * 没出成的题：按「轮次 → 考点 + 同一条款组合」聚合。
   *
   * 以前是一条失败记录一行，同一个考点被退 6 次就列 6 行几乎一样的字，
   * 78 条铺满整页，看的人只能一行一行读，读不出「这个考点到底卡在哪」。
   * 现在先聚合：同一考点、同一组条款号合成一行，右侧写 ×次数 与时间跨度，
   * 想看每一次的具体原因再点开。默认全部收起。
   */
  function failGroupsHtml() {
    const all = state.failures || [];
    if (!all.length) return '<div class="chart-empty">还没有没出成的记录</div>';

    const byRound = {};
    all.forEach(function (f) {
      const rn = typeof f.round === 'number' ? f.round : 0;
      (byRound[rn] = byRound[rn] || []).push(f);
    });
    const roundKeys = Object.keys(byRound).map(Number).sort(function (a, b) { return b - a; });

    return roundKeys.map(function (rn) {
      const items = byRound[rn];
      const seen = {};
      const groups = [];
      items.forEach(function (f) {
        const codes = (f.codes || []).filter(function (c, i, arr) { return arr.indexOf(c) === i; }).sort();
        const kp = f.planKp || '（整轮）';
        const key = kp + '|' + codes.join(',');
        if (!seen[key]) { seen[key] = { kp: kp, codes: codes, items: [] }; groups.push(seen[key]); }
        seen[key].items.push(f);
      });
      groups.sort(function (a, b) { return b.items.length - a.items.length; });

      let lastKp = '';
      const rows = groups.map(function (g) {
        const sameKp = g.kp === lastKp;
        lastKp = g.kp;
        const label = g.codes.map(codeText).join(' / ') || '未说明';
        const times = g.items.map(function (f) { return f.at; }).filter(Boolean).sort();
        const span = times.length
          ? timeOf(times[0]) + (times.length > 1 ? '–' + timeOf(times[times.length - 1]) : '')
          : '';
        const detail = g.items.slice().sort(function (a, b) {
          return String(a.at || '').localeCompare(String(b.at || ''));
        }).map(function (f) {
          // reason 里常夹着「V1: 」这类编号，翻过一遍就别再露出来
          const why = String(f.reason || '')
            .replace(/\b(?:V\d+[a-z]?|C\d|F\d|P\d|L\d|GIVE_UP|QUOTA_[A-Z]+|PLAN_[A-Z_]+)\s*[:：]\s*/g, '')
            .trim();
          return '<div class="fail-detail-row"><span class="fail-at">' + esc(timeOf(f.at)) + '</span>' +
            '<span class="fail-detail-why">' + esc(why || label) + '</span></div>';
        }).join('');
        return '<details class="fail-group">' +
          '<summary class="fail-sum">' +
            '<span class="fail-stage is-' + esc(g.items[0].stage) + '">' + esc(STAGE_TEXT[g.items[0].stage] || '') + '</span>' +
            // 同一考点连着好几行时只写一次，其余留空——重复的长考点名会把「条款」挤出去
            '<span class="fail-kp' + (sameKp ? ' is-same' : '') + '" title="' + esc(g.kp) + '">' +
              esc(sameKp ? '' : g.kp) + '</span>' +
            '<span class="fail-codes">' + esc(label) + '</span>' +
            '<span class="fail-count">×' + g.items.length + '</span>' +
            '<span class="fail-span">' + esc(span) + '</span>' +
          '</summary>' +
          '<div class="fail-body">' + detail + '</div>' +
        '</details>';
      }).join('');

      return '<div class="fail-round">' +
        '<div class="fail-round-head">第 ' + rn + ' 轮<em>' + items.length + ' 条</em></div>' +
        rows + '</div>';
    }).join('');
  }

  function modelStateHtml() {
    const cfg = SHT.llm.config();
    if (!cfg.key) return '<span class="model-pill is-off">模型未配置</span>';
    return '<span class="model-pill is-on">' + esc(cfg.model) + '</span>';
  }

  // 这一轮最多出几题。重算配额时用它当上限，不能用「当前配额之和」，
  // 否则勾第一个考点算出 1 条，勾第二个时又拿 1 当上限，永远长不回去。
  // 上限跟着计划表上那个「题量」输入框走：设成 8 题，配额就得按 8 分。
  const QUOTA_FALLBACK = 5;
  function quotaLimit() {
    return countFor(state.round) || QUOTA_FALLBACK;
  }

  // 配额条：一行放下七类能力的「已排 / 配额」。
  // 不在计划表里加列——七列已经满了，加两列会挤掉知识点输入框；
  // 而且配额是「这一轮各类能力各几条」的判断，本来就该横着看。
  function quotaBarHtml() {
    let q = SHT.quota.normalize(state.quota);
    if (SHT.quota.sum(q) === 0) {
      // 还没分配过：按当前状态算一份，同时落进状态，
      // 否则显示的是一份、点「＋」时按空表从 0 起算，数字会跳
      q = SHT.quota.auto({ scope: kpScopePayload(), kps: unitKps(), total: quotaLimit() });
      state.quota = q;
    }
    const list = currentRound().questions;
    const got = {};
    list.forEach(function (x) { const a = x.ability || ''; if (a) got[a] = (got[a] || 0) + 1; });
    const filled = Object.keys(got).reduce(function (n, a) { return n + got[a]; }, 0);
    const total = SHT.quota.sum(q);
    // 还没跑过模型时「已排」没有意义（计划表里是预置示例题），只显示配额数字
    const hasReport = !!(state.quotaReport && state.quotaReport.byAbility);
    let shortN = 0;
    const chips = SHT.SKILL_CATEGORIES.map(function (a) {
      const want = q.byAbility[a] || 0;
      const have = got[a] || 0;
      if (hasReport && want > have) shortN += 1;
      const cls = want === 0 ? ' is-zero' : (!hasReport ? '' : (have >= want ? ' is-ok' : ' is-short'));
      return '<span class="quota-chip' + cls + '">' +
        '<b>' + esc(SHT.ABILITY_LABEL[a] || a) + '</b>' +
        '<span class="q">' + (hasReport ? have + '/' + want : String(want)) + '</span>' +
        '<i data-action="quota-dec" data-ability="' + a + '" title="减一条">−</i>' +
        '<i data-action="quota-inc" data-ability="' + a + '" title="加一条">＋</i>' +
      '</span>';
    }).join('');
    return '<div class="quota-bar">' +
      '<span class="quota-label">本轮配额' + (q.note ? ' · ' + esc(q.note) : '') + '</span>' +
      chips +
      '<span class="quota-sum' + (shortN ? ' is-short' : '') + '">' +
        (hasReport ? filled + '/' + total : '共 ' + total + ' 条') + '</span>' +
      '<button type="button" class="btn btn-mini" data-action="quota-recalc">重算</button>' +
    '</div>';
  }

  function renderPlanPanel() {
    const list = currentRound().questions;
    const exclusion = exclusionForCurrentRound();
    const projection = weaknessProjection();
    let body;
    if (!list.length) {
      body = '<div class="hint-box">这一轮还没排题。点「模型出 ' + countFor(state.round) + ' 题」让它自己排；也可以点「自己配 ' + countFor(state.round) + ' 个题型」按题型铺开。</div>';
    } else {
      body = '<div class="plan-head"><span>题号</span><span>这道题考什么</span><span>题型</span><span>场景</span><span>考到哪一层</span><span>错项怎么设</span><span>检查结果</span></div>' +
        '<div class="plan-table">' + list.map(function (q, i) {
          const no = i + 1;
          const blocked = exclusion.isCellBlocked(q.cell);
          return '<div class="plan-row' + (no === state.activeNo ? ' is-active' : '') + (blocked ? ' is-blocked' : '') + '" data-no="' + no + '">' +
            '<span class="no" title="' + esc(SHT.ABILITY_LABEL[q.ability] || q.ability || '未定') + '">' + no +
              (q.ability ? '<em>' + esc((SHT.ABILITY_LABEL[q.ability] || q.ability || '').slice(0, 2)) + '</em>' : '') + '</span>' +
            '<input data-no="' + no + '" data-field="knowledgePoint" value="' + esc(q.knowledgePoint) + '" placeholder="如 class / classroom 形近，别只写「词汇」">' +
            '<select data-no="' + no + '" data-field="type">' + selectHtml(SHT.QUESTION_TYPES.map(function (t) { return t.id; }), q.cell.type) + '</select>' +
            '<select data-no="' + no + '" data-field="scene">' + selectHtml(SHT.SCENES, q.cell.scene) + '</select>' +
            '<select data-no="' + no + '" data-field="level">' + selectHtml(SHT.LEVELS, q.cell.level) + '</select>' +
            '<select data-no="' + no + '" data-field="distractor">' + selectHtml(SHT.DISTRACTORS, q.cell.distractor) + '</select>' +
            '<span class="verdict">' + esc(verdictOf(q)) + '</span>' +
            (blocked ? '<div class="blocked-note">这个出题角度上轮用过了，换一个</div>' : '') +
          '</div>';
        }).join('') + '</div>';
    }
    const blockedCount = list.filter(function (q) { return exclusion.isCellBlocked(q.cell); }).length;
    const note = state.round === 1
      ? (projection.remainingCount ? '错题待练 ' + projection.remainingCount + ' 个考点' : '暂无错题记录')
      : '上一轮用过 ' + exclusion.usedCells.size + ' 种题型搭配' + (blockedCount ? '，这一轮有 ' + blockedCount + ' 道和它重复了' : '，这一轮没有重复');

    // 检查标准的明细不进这一页：课程角色的面板只放「这一轮考什么」，
    // 为什么被退回是日志页的事。这里只留一行入口，出完题知道有没有全成。
    const failN = failuresOfRound(state.round, state.failures, (state.rounds[state.round] || {}).startedAt).length;
    const failBrief = failN
      ? '<div class="fail-brief">这一轮有 <strong>' + failN + '</strong> 条没出成 · ' +
        '<button type="button" class="link-btn" data-action="goto-log">到 04 日志看原因</button></div>'
      : '';

    $('agentPanel').innerHTML = '' +
      '<div class="panel-toolbar">' +
        '<span class="hint">' + esc(note) + '</span>' +
        '<div class="toolbar-actions">' +
          '<label class="count-pill" title="第 ' + state.round + ' 轮题量">题量<input type="number" min="1" max="15" data-field="questionCount" data-round="' + state.round + '" value="' + countFor(state.round) + '"></label>' +
          modelStateHtml() +
          (state.llmBusy
            ? '<span class="model-step">' + esc(state.llmStep || '跑着…') + '</span>' +
              '<button type="button" class="btn" data-action="stop-model">停</button>'
            : '<button type="button" class="btn btn-primary" data-action="model-round">模型出 ' + countFor(state.round) + ' 题</button>' +
              '<button type="button" class="btn" data-action="auto-quota">自己配 ' + countFor(state.round) + ' 个题型</button>' +
              '<button type="button" class="btn" data-action="fill-weakness">用错题填</button>') +
        '</div>' +
      '</div>' +
      kpFoldHtml() + quotaBarHtml() + body + failBrief;
  }

  /* ---------- 01 生成角色：单题九字段 ---------- */
  function renderExecutePanel() {
    const q = currentQuestion();
    const list = currentRound().questions;
    if (!q) {
      $('agentPanel').innerHTML = '<div class="hint-box">这一轮还没有题。先去第 1 个角色「课程角色」写计划。</div>';
      return;
    }
    const c = q.cell;
    $('agentPanel').innerHTML = '' +
      '<div class="panel-toolbar">' +
        '<div class="q-nav">' + list.map(function (_, i) {
          const no = i + 1;
          const cls = (no === state.activeNo ? ' is-active' : '') + (verdictOf(list[i]) === '退回' ? ' is-failed' : '');
          return '<button type="button" data-action="q-nav" data-no="' + no + '" class="' + cls.trim() + '">' + no + '</button>';
        }).join('') + '</div>' +
        '<div class="toolbar-actions">' +
          '<span class="hint">第 ' + state.activeNo + ' / ' + list.length + ' 题 · ' + esc(c.type) + ' / ' + esc(c.level) + ' / ' + esc(c.distractor) + '</span>' +
          '<button type="button" class="btn btn-primary" data-action="save-changes">保存修改</button>' +
        '</div>' +
      '</div>' +
      '<div class="field-grid">' +
        '<div class="field-row is-wide"><label>出题角度</label><span class="cell-badge">' +
          esc(c.type) + ' / ' + esc(c.scene) + ' / ' + esc(c.level) + ' / ' + esc(c.distractor) + '</span></div>' +
        '<div class="field-row is-wide"><label>知识点</label><span class="cell-badge">' +
          esc(q.knowledgePoint || '（未填知识点）') + '</span></div>' +
        '<div class="field-row"><label>能力</label><input data-field="ability" value="' + esc(q.ability) + '"></div>' +
        '<div class="field-row"><label>作答方式</label><select data-field="answerMode">' +
          '<option value="choice"' + (SHT.grade.mode(q) === 'choice' ? ' selected' : '') + '>从选项里选</option>' +
          '<option value="open"' + (SHT.grade.mode(q) === 'open' ? ' selected' : '') + '>自己写</option>' +
        '</select></div>' +
        '<div class="field-row is-wide"><label>题目</label><textarea data-field="prompt" placeholder="只用本单元词表与句型">' + esc(q.prompt) + '</textarea></div>' +
        '<div class="field-row is-wide"><label>听力原文</label><input data-field="audioText" value="' + esc(q.audioText) + '" placeholder="非听力题留空"></div>' +
        '<div class="field-row is-wide"><label>选项</label><div class="opt-row">' +
          [0, 1, 2].map(function (i) {
            return '<input data-field="option" data-index="' + i + '" value="' + esc(q.options[i] || '') + '" placeholder="' + String.fromCharCode(65 + i) + '">';
          }).join('') + '</div></div>' +
        '<div class="field-row"><label>答案</label><input data-field="answer" value="' + esc(q.answer) + '"></div>' +
        '<div class="field-row"><label>验证结论</label><input value="' + esc(verdictOf(q)) + '" disabled></div>' +
        '<div class="field-row is-wide"><label>解析 · ≤25 字</label><textarea data-field="analysis" placeholder="错在哪 + 为什么 + 正确是什么">' + esc(q.analysis) + '</textarea></div>' +
        '<div class="field-row is-wide"><label>若再错 · 下一轮出什么</label><textarea data-field="nextIfWrong" placeholder="答不上来就不要出这道题">' + esc(q.nextIfWrong) + '</textarea></div>' +
      '</div>' +
      '<details class="vocab-fold"><summary>本单元词表 · ' + SHT.curriculum.words.length + '</summary>' +
        '<div class="vocab-strip">' + SHT.curriculum.words.map(function (w) {
          return '<button type="button" class="vocab-chip" data-action="copy-word" data-word="' + esc(w.en) + '" title="' + esc(w.zh) + '">' + esc(w.en) + '</button>';
        }).join('') + '</div></details>' +
      '<details class="vocab-fold"><summary>句型表 · ' + SHT.curriculum.sentencePatterns.length +
        ' · 语音 ' + esc(SHT.curriculum.phonics.focus) + '</summary>' +
        '<div class="pattern-list">' +
          SHT.curriculum.sentencePatterns.map(function (p) { return '<div>' + esc(p) + '</div>'; }).join('') +
          '<div class="pattern-note">' + esc(SHT.curriculum.phonics.note) + '　' +
            (SHT.curriculum.phonics.pairs || []).map(function (pair) { return esc(pair[0] + ' / ' + pair[1]); }).join('　·　') +
          '</div>' +
        '</div></details>';
  }

  /* ---------- 01 验证角色：四层，一次一层 ---------- */
  // 这 8 条验证角色拿不到判定所需的信息（同轮其它题 / 学生画像 / 课程声明的意图）。
  // 页面上直接标出来：不标的话，人点「挂」像是在补模型该判的事，其实是两套口径。
  const NEED_TEXT = {
    label: '要看知识点标签（课程写的，不归验证判）',
    plan: '要看课程声明的层次与干扰项类型（那是出题意图）',
    round: '要看同轮其它题（单题调用里没有）',
    student: '要看学生画像与历史（刻意不给，防同情）'
  };
  function renderVerifyPanel() {
    const q = currentQuestion();
    const checks = (q && q.checks) || {};
    const done = Object.keys(checks).length;
    const failed = Object.keys(checks).filter(function (k) { return checks[k] === 'fail'; });
    const layer = SHT.CHECK_LAYERS[state.checkLayer] || SHT.CHECK_LAYERS[0];

    $('agentPanel').innerHTML = '' +
      '<div class="layer-switch">' + SHT.CHECK_LAYERS.map(function (l, i) {
        const bad = l.items.filter(function (it) { return checks[it.id] === 'fail'; }).length;
        return '<button type="button" data-action="layer" data-index="' + i + '" class="' + (i === state.checkLayer ? 'is-active' : '') + '">' +
          esc(l.name) + '<span class="cnt">' + l.items.length + ' 条' + (bad ? ' / 不合格 ' + bad : '') + '</span></button>';
      }).join('') + '</div>' +
      '<div class="check-summary">' +
        '<span class="stat-pill">第 ' + state.activeNo + ' 题 · 已查 ' + done + ' / ' + SHT.ALL_CHECKS.length + ' 条</span>' +
        '<span class="stat-pill ' + (failed.length ? 'is-bad' : (verdictOf(q) === '通过' ? 'is-good' : '')) + '">' +
          (failed.length ? '要重出，挂在这几条：' + esc(failed.join(' / ')) : (verdictOf(q) === '通过' ? '通过' : '暂时没有不合格')) + '</span>' +
        '<span class="stat-pill">模型只能判 ' + SHT.JUDGEABLE_CHECKS.length + ' 条</span>' +
      '</div>' +
      '<div class="hint-box" style="margin-bottom:8px">' + esc(layer.note) + '</div>' +
      layer.items.map(function (item) {
        const v = checks[item.id];
        return '<div class="check-row' + (item.needs ? ' is-out' : '') + '">' +
          '<span class="check-id">' + esc(item.id) + '</span>' +
          '<span class="check-text">' + esc(item.text) +
            (item.needs ? '<em class="check-need">' + esc(NEED_TEXT[item.needs] || '模型判不了') + '</em>' : '') +
          '</span>' +
          '<span class="check-btns">' +
            '<button type="button" data-action="check" data-check="' + esc(item.id) + '" data-verdict="pass" class="' + (v === 'pass' ? 'is-pass' : '') + '">过</button>' +
            '<button type="button" data-action="check" data-check="' + esc(item.id) + '" data-verdict="fail" class="' + (v === 'fail' ? 'is-fail' : '') + '">挂</button>' +
          '</span></div>';
      }).join('');
  }

  /* ---------- 01 诊断角色：他为什么选了这个 ----------
   * 这一页只回答一个问题：答完之后，能不能说清「他为什么偏选 B、为什么排掉 C 和 D」。
   * 数据全部来自 core/diagnose.js 的冻结结果，这里只负责摆出来，不重算。
   */
  function attemptOfQuestion(q) {
    if (!q) return null;
    const list = (practiceOf().attempts || []);
    for (let i = list.length - 1; i >= 0; i -= 1) {
      if (list[i].no === q.no) return list[i];
    }
    return null;
  }

  function renderDiagnosePanel() {
    const list = currentRound().questions;
    const q = currentQuestion();
    if (!q) {
      $('agentPanel').innerHTML = '<div class="hint-box">这一轮还没有题。诊断要等他答完，先去 01 出题、02 作答。</div>';
      return;
    }
    const at = attemptOfQuestion(q);
    const d = at && at.diag;
    const nav = '<div class="panel-toolbar"><div class="q-nav">' + list.map(function (item, i) {
      const no = i + 1;
      const done = !!(attemptOfQuestion(item) || {}).diag;
      return '<button type="button" data-action="q-nav" data-no="' + no + '" class="' +
        (no === state.activeNo ? 'is-active' : '') + (done ? ' is-answered' : '') + '">' + no + '</button>';
    }).join('') + '</div>' +
      '<div class="toolbar-actions"><span class="hint">第 ' + state.activeNo + ' 题 · ' + esc(q.knowledgePoint || '未填知识点') + '</span></div></div>';

    if (!at || !d) {
      $('agentPanel').innerHTML = nav +
        '<div class="hint-box">这一题还没作答。诊断在作答之后才跑：它要读的是他选了什么、' +
        '排掉了什么、花了多少秒——没有这些就没有证据，先编一个原因不如不说。</div>';
      return;
    }

    /*
     * 答对：只报事实，不做归因。
     *
     * 以前的写法是给每个答对也编一个「为什么对」（3 秒内=记住了、想了很久=不熟），
     * 这是拿时间当证据——而时间分不开「本来就会」和「这种题太简单」。
     * 学生答对了还被盖一个「像背的」章，既不严谨也会误导后面的出题判断。
     * 现在答对只记三件事：对了、几秒、有没有用提示；要不要再验交给「连对两次」。
     */
    if (at.correct) {
      $('agentPanel').innerHTML = nav +
        '<div class="diag-card is-good">' +
          '<div class="diag-top">' +
            '<span class="diag-badge">答对</span>' +
            '<span class="diag-headline">' + esc(d.headline || '答对') + '</span>' +
            '<span class="diag-conf is-muted">不作归因</span>' +
          '</div>' +
          '<div class="diag-ans">他答 <b>' + esc(at.picked) + '</b>　正确 <b>' + esc(at.expected) + '</b>' +
            ((d.timing && d.timing.ms) ? '　' + Math.round(d.timing.ms / 1000) + ' 秒' : '') +
            (at.hintCount ? '　用了提示' : '') + '</div>' +
          '<div class="diag-note">答对没有可归因的证据：算得快可能是本来就会，也可能这道题本来就简单，' +
            '单看秒数分不开。所以这里只记「这次对了」，不猜他为什么对。</div>' +
          (d.nextStep ? '<div class="diag-next"><span>下一轮怎么验</span>' + esc(d.nextStep) + '</div>' : '') +
          '<div class="diag-actions"><span class="diag-src">来源：作答结果与耗时（不做错因归因）</span></div>' +
        '</div>' +
        '<div class="hint-box" style="margin-top:10px">错因分析只在答错时出现：错选、排除了哪些项、差几个字母，' +
          '那些才是能拿来说话的证据。</div>';
      return;
    }

    const pct = Math.round((d.confidence || 0) * 100);
    const weak = !d.causeId || (d.confidence || 0) < 0.4;
    // 徽章已经写了错因，横标题里再重复一遍是废话，读的人还以为是两件事
    const headline = String(d.headline || '').replace(new RegExp('^' + (d.causeLabel || d.causeId || '') + ' · '), '');

    $('agentPanel').innerHTML = nav +
      '<div class="diag-card ' + (at.correct ? 'is-good' : 'is-bad') + '">' +
        '<div class="diag-top">' +
          '<span class="diag-badge">' + esc(at.correct ? '答对' : (d.causeLabel || '待诊断')) + '</span>' +
          '<span class="diag-headline">' + esc(headline || d.headline || '') + '</span>' +
          '<span class="diag-conf">置信 ' + pct + '%</span>' +
        '</div>' +
        '<div class="diag-ans">他答 <b>' + esc(at.picked) + '</b>　正确 <b>' + esc(at.expected) + '</b>' +
          ((d.timing && d.timing.ms) ? '　' + Math.round(d.timing.ms / 1000) + ' 秒' : '') +
          (at.hintCount ? '　用了提示' : '') + '</div>' +
        (d.whyPicked ? '<div class="diag-why">' + esc(d.whyPicked) + '</div>' : '') +
        ((d.eliminated || []).length
          ? '<div class="diag-block"><div class="diag-block-title">为什么没选其它项（说明他不是乱选）</div>' +
            d.eliminated.map(function (e) {
              return '<div class="diag-elim"><span class="diag-letter">' + esc(e.letter) + '</span>' +
                '<span class="diag-opt">' + esc(e.option) + '</span>' +
                '<span class="diag-reason">' + esc(e.why) + '</span></div>';
            }).join('') + '</div>'
          : '') +
        ((d.signals || []).length
          ? '<div class="diag-block"><div class="diag-block-title">依据</div>' +
            d.signals.map(function (s) {
              return '<div class="diag-sig">' + esc(s.text) + '</div>';
            }).join('') + '</div>'
          : '') +
        (d.timing && d.timing.note ? '<div class="diag-note">' + esc(d.timing.note) + '</div>' : '') +
        (d.nextStep ? '<div class="diag-next"><span>下一轮怎么出</span>' + esc(d.nextStep) + '</div>' : '') +
        (d.modelView
          ? '<div class="diag-model"><span>诊断角色补的</span>' + esc(d.modelView.causeId || '') +
            (d.modelView.why ? '：' + esc(d.modelView.why) : '') +
            (d.modelView.confidence ? '（' + Math.round(d.modelView.confidence * 100) + '%）' : '') + '</div>'
          : '') +
        '<div class="diag-actions">' +
          (weak ? '<button type="button" class="btn" data-action="diagnose-model">证据不足，请诊断角色再看一眼</button>' : '') +
          '<span class="diag-src">来源：' + esc(d.source === 'model' ? '模型补诊' : '代码归因') +
            (d.key ? '　·　冻结键 ' + esc(String(d.key).slice(-14)) : '') + '</span>' +
        '</div>' +
      '</div>' +
      '<div class="hint-box" style="margin-top:10px">诊断只解释原因，不改判定结果、不改题。' +
        '结论按「题目 + 答案」冻结：同一个答案重看一百次都一样；换个答案重答是另一条记录。</div>';
  }

  function renderAgentPanel() {
    if (state.agent === 'course') renderPlanPanel();
    else if (state.agent === 'execute') renderExecutePanel();
    else if (state.agent === 'diagnose') renderDiagnosePanel();
    else renderVerifyPanel();
  }

  /* ---------- 02 答题：学生侧，从出题结果接到错题回边 ---------- */
  function practiceOf(round) {
    const r = round || currentRound();
    if (!r.practice) r.practice = blankPractice();
    return r.practice;
  }

  // 能作答的题。
  //   选择题：有题干、有答案、至少两个选项，且答案在选项里。
  //   开放题：有题干、有答案（或可接受答案集合）就够，选项本来就不该有。
  function practiceable(q) {
    if (!String(q.prompt || '').trim()) return false;
    const hasAnswer = !!String(q.answer || '').trim() || ((q.acceptable || q.acceptableAnswers || []).length > 0);
    if (!hasAnswer) return false;
    if (SHT.grade.mode(q) === 'open') return true;
    const filled = (q.options || []).filter(function (o) { return String(o || '').trim(); });
    const answerInside = (q.options || []).some(function (o) {
      return SHT.normAnswer(o) === SHT.normAnswer(q.answer);
    }) || SHT.grade.acceptable(q).some(function (want) {
      return (q.options || []).some(function (o) { return SHT.normAnswer(o) === want; });
    });
    return filled.length >= 2 && answerInside;
  }

  function practiceQuestions(round) {
    return (round || currentRound()).questions.filter(practiceable);
  }

  function activePracticeQuestion() {
    return practiceQuestions()[practiceOf().cursor] || null;
  }

  function attemptsOf(no, round) {
    const p = (round && round.practice) || practiceOf();
    return p.attempts.filter(function (a) { return a.no === no; });
  }

  function wrongCaseOf(q) {
    if (!q || !q.probe) return null;
    const key = q.probe.kpId;
    return (state.wrongCases || []).filter(function (c) {
      return key ? c.kpId === key : c.knowledgePoint === q.knowledgePoint;
    })[0] || null;
  }

  // 一个考点现在算什么状态。
  // 普通题：看这一轮的首答（judgePoint 需要 first 一枪，没有就是未测）。
  // 回练题：这一轮只有「第二枪」，first 在上一轮，所以状态要读错题本里那条。
  function pointStateOf(q, round) {
    const list = attemptsOf(q.no, round);
    if (!q || !q.probe) return SHT.judgePoint(list);
    const c = wrongCaseOf(q);
    if (!c) return SHT.judgePoint(list);
    const last = list[list.length - 1];
    const state = c.masteryState === 'mastered' ? 'mastered' : (last && last.correct ? 'passed' : 'wrong');
    return {
      state: state,
      label: SHT.MASTERY_LABELS[c.masteryState] || SHT.POINT_STATES[state].label,
      tone: SHT.POINT_STATES[state].tone
    };
  }

  function roundPracticeSummary(round) {
    const p = (round && round.practice) || blankPractice();
    const out = { total: 0, tested: 0, mastered: 0, passed: 0, assisted: 0, fragile: 0, wrong: 0, unseen: 0, attempts: (p.attempts || []).length };
    practiceQuestions(round).forEach(function (q) {
      const st = pointStateOf(q, round);
      out[st.state] = (out[st.state] || 0) + 1;
      if (st.state !== 'unseen') out.tested += 1;
      out.total += 1;
    });
    return out;
  }

  function practiceStats() { return roundPracticeSummary(currentRound()); }

  function practiceHeadHtml(q, p) {
    const list = practiceQuestions();
    const idx = Math.min(p.cursor + 1, list.length);
    return '<div class="practice-head">' +
      '<span class="practice-progress">第 ' + idx + ' 个考点 / 共 ' + list.length + ' 个' +
        (q.probe
          ? '<span class="chip-variant" title="' + esc(q.probe.prevPrompt || '') + '">错题回练 · 上一轮没过</span>'
          : '') + '</span>' +
      '<span class="hint">' + esc(q.cell ? q.cell.type + ' / ' + q.cell.level : '') + '</span>' +
    '</div>';
  }

  // 作答区。选择题给选项按钮，开放题给输入框——开放题的答案不是一个字符串，
  // 光靠选项装不下（看图说话、用英语回答、对话补全成句）。
  function answerAreaHtml(q, p) {
    if (SHT.grade.mode(q) !== 'open') return optionButtons(q, p);
    const r = p.revealed;
    if (r) {
      return '<div class="open-answer is-locked">' +
        '<div class="open-label">你的作答</div>' +
        '<div class="open-text">' + (String(r.picked || '').trim() ? esc(r.picked) : '（没写）') + '</div>' +
      '</div>';
    }
    return '<div class="open-answer">' +
      '<label class="open-label" for="openInput">写下你的答案</label>' +
      '<textarea id="openInput" class="open-input" rows="2" data-role="open-input"' +
        (p.grading ? ' disabled' : '') +
        ' placeholder="用英语写，写完点提交">' + esc(p.draft || '') + '</textarea>' +
      '<div class="open-hint">判断题、拼写题写词就行；回答题写成一句话。大小写和句末标点不算错。</div>' +
    '</div>';
  }

  function optionButtons(q, p) {
    const r = p.revealed;
    return '<div class="opt-list">' + (q.options || []).map(function (o, i) {
      if (!String(o || '').trim()) return '';
      let cls = 'opt-btn';
      if (r) {
        if (i === r.expectedIndex) cls += ' is-right';
        else if (SHT.normAnswer(o) === SHT.normAnswer(r.picked)) cls += ' is-wrong';
      } else if (p.picked === i) {
        cls += ' is-picked';
      } else if (p.hintGone === i) {
        cls += ' is-gone';
      }
      return '<button type="button" class="' + cls + '" data-action="pick-option" data-index="' + i + '"' +
        (r ? ' disabled' : '') + '>' +
        '<span class="opt-key">' + String.fromCharCode(65 + i) + '</span><span>' + esc(o) + '</span></button>';
    }).join('') + '</div>';
  }

  // 这次判定是谁下的。冻结台账里 via 就是这个值。
  // 写清楚的意义：看到「模型判定」就知道这条可以人改，看到「与答案一致」就知道
  // 是死判断，不用怀疑。
  const VIA_TEXT = {
    exact: '与标准答案一致',
    acceptable: '与可接受答案一致',
    model: '模型判定',
    human: '人工改判'
  };

  /*
   * 逐项说明：答错时把「他选的这一项为什么错 / 正确答案为什么对 / 另一项为什么错」摆出来。
   *
   * 以前整题只有一句 analysis，只讲最主要那个错因，另一个错项一个字都没有——
   * 学生看到的是「你把讲台听成计算机」，可他选的是 A，A 为什么不对没人说。
   * 现在按项来：每项一句，指向具体词与规则；缺说明的项宁可不显示，也不硬编。
   */
  function optionNotesHtml(q, r) {
    const opts = (q.options || []).map(function (o) { return String(o == null ? '' : o).trim(); });
    const notes = q.optionNotes || [];
    if (!opts.length) return '';
    const idxOf = function (text) {
      const t = SHT.normAnswer(text);
      for (let i = 0; i < opts.length; i += 1) {
        if (SHT.normAnswer(opts[i]) === t) return i;
      }
      return -1;
    };
    const picked = idxOf(r.picked);
    const ans = idxOf(r.expected);
    const rows = [];
    const push = function (i, tag, cls) {
      if (i < 0) return;
      const why = String(notes[i] || '').trim();
      if (!why) return;
      rows.push('<div class="vn-row ' + cls + '">' +
        '<span class="vn-tag">' + esc(tag) + '</span>' +
        '<span class="vn-opt">' + esc(opts[i]) + '</span>' +
        '<span class="vn-why">' + esc(why) + '</span>' +
      '</div>');
    };
    push(picked, '你选 ' + String.fromCharCode(65 + picked), 'is-picked');
    push(ans, '正确 ' + String.fromCharCode(65 + ans), 'is-answer');
    opts.forEach(function (_, i) {
      if (i === picked || i === ans) return;
      push(i, String.fromCharCode(65 + i), 'is-other');
    });
    return rows.length ? '<div class="verdict-notes">' + rows.join('') + '</div>' : '';
  }

  function verdictHtml(q, p) {
    const r = p.revealed;
    // 这一题是上一轮错题的重出题（q.probe）时，结果直接决定那条错题的状态
    const isProbe = !!q.probe;
    const isOpen = SHT.grade.mode(q) === 'open';
    let next = '';
    if (r.correct) {
      next = '<button type="button" class="btn btn-primary" data-action="next-step">换下一个考点</button>' +
        '<span class="verdict-note">' +
          (isProbe ? '回练答对，记一次；下一轮再对一次才算真会'
                   : '答对了；下一轮换道题再对一次，才算真会') +
        '</span>';
    } else if (isProbe) {
      next = '<button type="button" class="btn btn-primary" data-action="next-step">记下，换下一个考点</button>' +
        '<span class="verdict-note">回练还是错，下一轮再出一次这个考点</span>';
    } else {
      /*
       * 答错当场就把闭环交代清楚：这一条已经写进错题、诊断怎么说、下一轮准备怎么出。
       * 以前只有一句「下一轮会按这个考点重新出题」，学生/审查员看不到「错题→诊断→下一轮」
       * 这条链到底接上了没有。
       */
      const at = attemptOfQuestion(q);
      const d = at && at.diag;
      const plan = (d && d.nextStep) ? d.nextStep : '按这个考点换题面重出';
      next = '<button type="button" class="btn btn-primary" data-action="next-step">写进错题，换下一个考点</button>' +
        '<span class="verdict-note">已记进 03 错题' + (d && d.causeLabel ? '（' + esc(d.causeLabel) + '）' : '') +
          '；下一轮：' + esc(plan) + '</span>';
    }
    // 模型判的才给改判入口。规则判的（与答案一致）错不了，不需要这个按钮。
    const canFlip = r.via === 'model'
      ? '<button type="button" class="btn btn-quiet" data-action="flip-grade">判错了，改成' +
        (r.correct ? '错' : '对') + '</button>'
      : '';
    return '<div class="verdict ' + (r.correct ? 'is-good' : 'is-bad') + '">' +
      '<div class="verdict-top">' +
        '<span class="verdict-badge">' + (r.correct ? '对了' : '错了') + '</span>' +
        '<span class="verdict-ans">你' + (isOpen ? '写' : '选') + ' <b>' + esc(r.picked) + '</b>' +
          (r.correct ? '' : '　正确 <b>' + esc(r.expected) + '</b>') +
          (r.hintCount ? '　用了提示' : '') + '</span>' +
      '</div>' +
      '<div class="verdict-via">' + esc(VIA_TEXT[r.via] || '已判定') +
        (r.gradeReason ? '　·　' + esc(r.gradeReason) : '') +
        (r.via === 'model' ? '　·　这条已冻结，下次不再重判' : '') + '</div>' +
      // 答对不给解析：题面解析讲的是「错项为什么错」，人答对了再把这段话塞回去是自相矛盾的
      (!r.correct ? (optionNotesHtml(q, r) ||
        (q.analysis ? '<div class="verdict-analysis">' + esc(q.analysis) + '</div>' : '')) : '') +
      '<div class="verdict-next">' + next + canFlip + '</div>' +
    '</div>';
  }

  function renderPracticeCard() {
    const p = practiceOf();
    const list = practiceQuestions();
    if (!list.length) {
      $('practiceCard').innerHTML = '<div class="hint-box">这一轮还没有能作答的题。去 01 把题干、选项、答案填上，这里会自动出现。</div>';
      return;
    }
    const q = activePracticeQuestion();
    if (!q) { renderPracticeDone(); return; }
    const r = p.revealed;
    // 计时起点：一题刚出现、还没作答时打点。只存在内存里，提交时随作答一起落盘。
    if (!r && !p.shownAt) p.shownAt = Date.now();
    const st = pointStateOf(list[p.cursor] || q);

    $('practiceCard').innerHTML = '' +
      practiceHeadHtml(q, p) +
      '<div class="q-card">' +
        '<div class="q-kp">' + esc(q.knowledgePoint || '（未填知识点）') +
          (r ? '　·　这个考点：' + esc(pointStateOf(q).label) : '') + '</div>' +
        '<div class="q-prompt">' + esc(q.prompt) + '</div>' +
        (q.audioText
          ? '<div class="q-audio">' + (r ? '听力原文　' + esc(q.audioText) : '听力题 · 由测试者朗读，提交后显示原文') + '</div>'
          : '') +
        answerAreaHtml(q, p) +
        (r ? verdictHtml(q, p) :
          '<div class="verdict-next">' +
            '<button type="button" class="btn btn-primary" data-action="submit-answer"' +
              (p.grading ? ' disabled' : '') + '>' + (p.grading ? '判定中…' : '提交') + '</button>' +
            (SHT.grade.mode(q) === 'choice'
              ? '<button type="button" class="btn" data-action="use-hint"' + (p.hintUsed || p.grading ? ' disabled' : '') + '>提示：划掉一个错的</button>'
              : '') +
            (st.state === 'unseen' ? '' : '<span class="verdict-note">当前判断：' + st.label + '</span>') +
          '</div>') +
        (p.gradeError ? '<div class="grade-error">' + esc(p.gradeError) + '</div>' : '') +
      '</div>';
  }

  function renderPracticeDone() {
    const s = practiceStats();
    const cell = function (label, value, tone) {
      return '<div class="done-cell"><div class="k">' + esc(label) + '</div>' +
        '<div class="v ' + (tone || '') + '">' + value + '</div></div>';
    };
    const title = s.unseen
      ? '这一轮走到最后了，还有 ' + s.unseen + ' 个考点没测'
      : '这一轮 ' + s.total + ' 个考点都测完了';
    $('practiceCard').innerHTML = '<div class="done-card">' +
      '<div class="done-title">' + esc(title) + '</div>' +
      '<div class="done-grid">' +
        cell('真会（连对两次）', s.mastered, 'is-good') +
        cell('会用 / 看提示才会', s.passed + s.assisted, '') +
        cell('不会（已写进错题）', s.wrong, s.wrong ? 'is-bad' : '') +
        cell('没测到', s.unseen, '') +
      '</div>' +
      '<div class="done-actions">' +
        (s.wrong ? '<button type="button" class="btn" data-action="goto-wrongbook">去 03 看错题的出题要点</button>' : '') +
        '<button type="button" class="btn btn-primary" data-action="goto-round2">按这些结果开第 2 轮</button>' +
        '<button type="button" class="btn" data-action="restart-practice">重测一遍</button>' +
      '</div>' +
    '</div>';
  }

  function renderPracticeRail() {
    const list = practiceQuestions();
    const p = practiceOf();
    const current = activePracticeQuestion();
    if (!list.length) { $('practiceRail').innerHTML = '<div class="rail-title">本轮考点</div><div class="chart-empty">暂无</div>'; return; }
    const s = practiceStats();
    const rows = list.map(function (q, i) {
      const st = pointStateOf(q);
      return '<div class="point-row' + (current && current.no === q.no ? ' is-current' : '') + '">' +
        '<span class="no">' + (i + 1) + '</span>' +
        '<span class="label">' + esc(q.knowledgePoint || '（未填知识点）') + '</span>' +
        '<span class="point-state ' + st.tone + '">' + esc(st.label) + '</span></div>';
    }).join('');
    $('practiceRail').innerHTML = '<div class="rail-title">本轮考点 · ' + s.total + '</div>' +
      '<div class="point-list">' + rows + '</div>' +
      '<div class="rail-sum">' +
        '<span>真会 <b>' + s.mastered + '</b>　会用 <b>' + s.passed + '</b>　看提示 <b>' + s.assisted + '</b></span>' +
        '<span>只记住这道题 <b>' + s.fragile + '</b>　不会 <b>' + s.wrong + '</b>　未测 <b>' + s.unseen + '</b></span>' +
        '<span>已作答 <b>' + p.attempts.length + '</b> 次</span>' +
      '</div>';
  }

  function renderPractice() {
    renderPracticeCard();
    renderPracticeRail();
  }

  /* ---------- 02 答题：动作 ---------- */
  function pickOption(index) {
    const p = practiceOf();
    if (p.revealed) return;
    p.picked = p.picked === index ? null : index;
    save(); renderPractice();
  }

  function useHint() {
    const p = practiceOf();
    const q = activePracticeQuestion();
    if (!q || p.revealed) return;
    const expectedIndex = (q.options || []).reduce(function (acc, o, i) {
      return acc < 0 && SHT.normAnswer(o) === SHT.normAnswer(q.answer) ? i : acc;
    }, -1);
    const gone = (q.options || []).reduce(function (acc, o, i) {
      return acc < 0 && i !== expectedIndex && String(o || '').trim() ? i : acc;
    }, -1);
    if (gone < 0) { toast('这道题没有可划掉的错项'); return; }
    p.hintGone = gone;
    p.hintUsed = true;
    save(); renderPractice();
    toast('划掉一个错的。用了提示，这题答对也不算独立答对');
  }

  /*
   * 判分四段（顺序不能换，前一段能定就不往下走）：
   *   ① 冻结台账里有没有这条 (题目, 答案) —— 有就直接用，永不再判
   *   ② 归一化比对 / 可接受答案集合 —— 本地能定就落库
   *   ③ 都定不了才调模型，调完立刻落库冻结
   *   ④ 下游（错题本、考点推进、统计）只读落库的这条，不重新调模型
   *
   * 第 ③ 步失败时不能默认判错：模型挂了不是学生的错。留着让他重试。
   */
  async function submitAnswer() {
    const p = practiceOf();
    const q = activePracticeQuestion();
    if (!q || p.revealed || p.grading) return;

    const isOpen = SHT.grade.mode(q) === 'open';
    const raw = isOpen ? String(p.draft || '').trim() : String(q.options[p.picked] == null ? '' : q.options[p.picked]).trim();
    if (!raw) {
      toast(isOpen ? '先写下你的答案' : '先选一个答案');
      return;
    }

    const roundNo = state.round;
    p.gradeError = '';
    let res = null;

    // ① 冻结优先。判过一次的，不管这次是谁来问，答案都一样。
    const frozen = SHT.grade.read(state.gradeLedger, q, raw, roundNo);
    if (frozen) {
      res = { correct: frozen.correct, via: frozen.via, reason: frozen.reason };
    } else {
      // ② 本地判定
      const local = SHT.grade.local(q, raw, roundNo);
      if (local.decided) {
        res = { correct: local.correct, via: local.via, reason: local.reason };
        state.gradeLedger = SHT.grade.remember(state.gradeLedger, q, raw, res, roundNo);
      } else {
        // ③ 模型兜底
        p.grading = true;
        save(); renderPractice();
        const asked = await SHT.grade.ask(q, raw);
        p.grading = false;
        if (!asked.ok) {
          p.gradeError = '这次判分没跑成：' + (asked.error || '未知原因') +
            '。既不算对也不算错，可以再点一次提交。';
          save(); renderPractice();
          return;
        }
        res = { correct: asked.correct, via: 'model', reason: asked.reason, confidence: asked.confidence };
        state.gradeLedger = SHT.grade.remember(state.gradeLedger, q, raw, res, roundNo);
      }
    }

    // 这一题是「上一轮错过、这一轮由模型重出的回练题」时记成 variant，
    // 它和上一轮的首答配成一对，才算得出「会不会」。一轮之内不再补第二枪。
    const stage = q.probe ? 'variant' : 'first';
    const kp = SHT.kpByLabel(q.knowledgePoint);
    const expected = String(q.answer == null ? '' : q.answer).trim();
    const expectedIndex = isOpen ? -1 : (q.options || []).reduce(function (acc, o, i) {
      return acc < 0 && SHT.normAnswer(o) === SHT.normAnswer(expected) ? i : acc;
    }, -1);

    p.attempts.push({
      no: q.no,
      stage: stage,
      probeOf: q.probe ? q.probe.kpId : '',
      kpId: kp ? kp.id : '',
      kpLabel: q.knowledgePoint || '',
      picked: raw,
      expected: expected,
      expectedIndex: expectedIndex,
      correct: !!res.correct,
      // 判定来源与依据。冻结台账的键也存进来：以后要查「这条为什么算对」，
      // 顺着 gradeKey 就能翻到原始判定，不用重跑。
      via: res.via || '',
      gradeReason: res.reason || '',
      gradeKey: SHT.grade.ledgerKey(q, roundNo, raw),
      answerMode: isOpen ? 'open' : 'choice',
      hintCount: p.hintUsed ? 1 : 0,
      // 耗时是诊断的一条证据：3 秒内选错和想了 20 秒选错，不是同一回事。
      // 上限 5 分钟：中间去干别的了就别假装是在想，超过就按「没测到」算。
      durationMs: p.shownAt ? Math.min(300000, Math.max(0, Date.now() - p.shownAt)) : 0,
      at: new Date().toISOString()
    });
    const attempt = p.attempts[p.attempts.length - 1];

    /*
     * 诊断：答完立刻算一次，落库冻结。键与判分台账同一个（题目 + 归一化答案），
     * 所以同一个答案只诊断一次；改答案重答是另一个事件，各诊断各的。
     * 这里只跑代码；代码证据不足时（confidence < 0.4）界面会给出「请诊断角色再看一眼」，
     * 模型补的那一份是追加，不改写已经冻结的结论。
     */
    const frozenDiag = SHT.diagnose.read(state.diagnoses, q, attempt, roundNo);
    if (frozenDiag) {
      attempt.diag = frozenDiag;
    } else {
      const d = SHT.diagnose.judge({ question: q, attempt: attempt, unit: SHT.curriculum });
      state.diagnoses = SHT.diagnose.remember(state.diagnoses, q, attempt, roundNo, d);
      attempt.diag = d;
    }

    p.revealed = attempt;
    p.gradeError = '';
    save(); renderAll();
  }

  /*
   * 人工改判。只对模型判的那条开放——规则判的（与答案一致）不会错。
   * 改判写进台账（via='human'，原模型判定存在 modelFirst 里），
   * 同时改掉这一枪的 correct。此时还没点「下一个」，错题本尚未写入，所以安全。
   */
  function flipGrade() {
    const p = practiceOf();
    const q = activePracticeQuestion();
    const r = p.revealed;
    if (!q || !r || r.via !== 'model') return;
    const next = !r.correct;
    state.gradeLedger = SHT.grade.override(state.gradeLedger, q, r.picked, next,
      '人工改判：' + (next ? '算对' : '算错'), state.round);
    r.correct = next;
    r.via = 'human';
    r.gradeReason = '人工改判';
    const list = p.attempts;
    if (list.length) {
      list[list.length - 1].correct = next;
      list[list.length - 1].via = 'human';
      list[list.length - 1].gradeReason = '人工改判';
    }
    save(); renderAll();
    toast(next ? '已改成答对' : '已改成答错');
  }

  // 首答就错 → 当场写进 03 错题；这一轮不再塞一道代码拼出来的变体。
  // 回练题（上一轮错、这一轮模型重出）的结果不新建卡，只给原有那条追加一次证据。
  /*
   * 写进错题本。这里最容易出错的一处是「错因从哪来」：
   * 以前直接抄知识点表里的 cause —— 那是课程当初打算用哪种错法做干扰项，是出题意图。
   * 拿意图当诊断，等于出题者给自己判分：学生再错，错题本还是同一句，下一轮照着同一句出，
   * 系统就永远看不到「他其实是没认出这个词」。所以现在 category 只来自诊断角色。
   */
  function writeWrongFromPractice(q, ev) {
    const kp = SHT.kpByLabel(q.knowledgePoint);
    const diag = ev.diag || null;
    const whyText = diag
      ? // 「选了 X，正确的是 Y」上面那行已经写了，这里只补「为什么」，
        // 同一句话在这一张卡上出现两次，读的人会以为是两条不同的证据
        [diag.whyPicked || diag.headline].filter(Boolean).join('') +
        ((diag.eliminated || []).length
          ? '。排掉了 ' + diag.eliminated.map(function (e) { return e.letter + '「' + e.option + '」'; }).join('、')
          : '')
      : '第一次选了「' + ev.picked + '」，答案是「' + ev.expected + '」，诊断证据不足';
    const res = SHT.upsertWrongCase(state.wrongCases, {
      studentId: SHT.sampleStudent.id,
      unitId: SHT.curriculum.hostUnitId,
      originalQuestionId: q.qid || ('q' + q.no),
      kpId: kp ? kp.id : '',
      knowledgePoint: q.knowledgePoint || (kp ? kp.label : '未填写知识点'),
      ability: q.ability || (kp ? kp.ability : 'vocab'),
      category: diag ? diag.causeId : '未掌握',
      causeSource: diag ? (diag.causeSource || 'code') : 'code',
      causeConfidence: diag ? diag.confidence : 0,
      // 出题意图单独留档，与诊断并排显示。两者一致说明这个干扰项设对了；
      // 不一致本身就是信号：学生错的不是我们以为的那一维。
      intentCause: kp ? kp.cause : '',
      diagnosis: diag,
      errorCause: whyText,
      questionSnapshot: q.prompt,
      studentAnswer: ev.picked,
      correctAnswer: ev.expected,
      hintCount: ev.hintCount,
      durationMs: ev.durationMs || 0,
      at: ev.at
    });
    state.wrongCases = res.list;
    toast(res.created ? '已写进 03 错题，下一轮会按这条重新出题' : '这个考点又错一次，错题状态已更新');
  }

  /*
   * 代码证据不足时，请诊断角色补一次。
   * 补的那一份是追加，不改写已经冻结的结论：只有当代码原本没给出结论（或置信低于 0.4）
   * 时才顶上来当主结论。这样「一次判定、落库冻结」的口径不会被模型随手推翻。
   */
  async function diagnoseByModel() {
    const q = currentQuestion();
    const at = attemptOfQuestion(q);
    if (!q || !at || !at.diag) { toast('这一题还没作答，没有可诊断的东西'); return; }
    if (!SHT.llm.isReady()) { openModel(); toast('先填 API Key'); return; }
    if (state.llmBusy) return;
    const roundNo = state.round;
    const base = SHT.diagnose.read(state.diagnoses, q, at, roundNo) || at.diag;
    state.llmBusy = true;
    state.llmStep = '诊断角色在看第 ' + q.no + ' 题';
    renderAll();
    try {
      const role = SHT.ROLES.diagnose;
      const recall = SHT.agentMemory.recallText(state.agentMemory, 'diagnose');
      const res = await SHT.llm.call({
        role: 'diagnose',
        system: role.system(),
        user: role.user({ question: q, diagnosis: base, picked: at.picked }) + (recall ? '\n\n' + recall : ''),
        maxTokens: 260,
        temperature: 0.2
      });
      if (!res.ok) { toast('诊断角色没跑成：' + (res.message || '未知原因')); return; }
      const j = res.json || {};
      const known = (SHT.ERROR_CAUSES || []).some(function (c) { return c.id === j.cause; });
      const view = {
        causeId: known ? j.cause : '',
        why: String(j.why || '').trim(),
        confidence: Math.max(0, Math.min(1, Number(j.confidence) || 0))
      };
      state.diagnoses = SHT.diagnose.appendModel(state.diagnoses, q, at, roundNo, view);
      at.diag = SHT.diagnose.read(state.diagnoses, q, at, roundNo);
      syncDiagToWrong(at);
      collectTraces();
      save();
      toast(known ? '诊断角色补了一条：' + view.causeId : '诊断角色也说证据不足，保持原结论');
    } catch (err) {
      toast('诊断出错了：' + (err && err.message ? err.message : err));
    } finally {
      state.llmBusy = false;
      state.llmStep = '';
      save(); renderAll();
    }
  }

  // 模型补诊之后，把 03 错题本里那条的错因一起更新，别让两个面板说两套话
  function syncDiagToWrong(at) {
    const idx = (state.wrongCases || []).findIndex(function (c) {
      return c.knowledgePoint === at.kpLabel && c.studentAnswer === at.picked;
    });
    if (idx < 0) return;
    const prev = state.wrongCases[idx];
    const next = Object.assign({}, prev, {
      diagnosis: at.diag,
      category: (at.diag && at.diag.causeId) || prev.category,
      causeConfidence: (at.diag && at.diag.confidence) || 0,
      causeSource: 'model'
    });
    state.wrongCases = state.wrongCases.slice();
    state.wrongCases[idx] = next;
  }

  // 回练结果记到错题本那条上：连对两次才算真会，答错就退回待订正，
  // 下一轮还会再出一次同考点的题——升不升难度由模型的规划决定，不由代码写死。
  function recordProbeResult(q, ev) {
    const key = q.probe && q.probe.kpId;
    const at = (state.wrongCases || []).findIndex(function (c) {
      return key ? c.kpId === key : c.knowledgePoint === q.knowledgePoint;
    });
    if (at < 0) return null;
    const next = SHT.appendVariantAttempt(state.wrongCases[at], {
      correct: ev.correct,
      hintCount: ev.hintCount,
      retryCount: 0,
      purpose: 'next-round-probe',
      completedAt: ev.at
    });
    state.wrongCases = state.wrongCases.slice();
    state.wrongCases[at] = next;
    return next;
  }

  function practiceNext() {
    const p = practiceOf();
    const r = p.revealed;
    if (!r) return;
    const q = activePracticeQuestion();
    if (q.probe) {
      const after = recordProbeResult(q, r);
      if (r.correct) {
        toast(after && after.masteryState === 'mastered'
          ? '连对两次，这个考点算真会，下一轮不再出'
          : '回练答对，记一次；下一轮再对一次才算真会');
      } else {
        toast('回练还是错，已记为待订正，下一轮再出一次');
      }
    } else if (r.correct) {
      toast('答对了，换下一个考点');
    } else {
      writeWrongFromPractice(q, r);
    }
    p.cursor += 1;
    p.revealed = null;
    p.picked = null;
    p.draft = '';
    p.grading = false;
    p.gradeError = '';
    p.hintUsed = false;
    p.hintGone = -1;
    // 下一题的计时从它出现的这一刻开始
    p.shownAt = 0;
    save(); renderAll();
  }

  function restartPractice() {
    const round = currentRound();
    round.practice = blankPractice();
    save(); renderAll();
    toast('作答记录已清空，从第 1 个考点重测');
  }

  /* ---------- 02 错题 ---------- */
  function kpForWrong(c) {
    if (c.kpId) {
      const byId = kpById(c.kpId);
      if (byId) return byId;
    }
    return SHT.KNOWLEDGE_POINTS.filter(function (k) { return k.label === c.knowledgePoint; })[0] || null;
  }

  /* ---------- 02 错题案 ---------- */
  const NEXT_ACTIONS = [
    { value: 'wrong', label: '又做错了（没看提示）' },
    { value: 'support', label: '做对了，但看了提示或重做过（不算真会）' },
    { value: 'clean', label: '独立做对了（算订正）' },
    { value: 'cert-5', label: '换 5 道新题考：全对' },
    { value: 'cert-4', label: '换 5 道新题考：对 4 道' },
    { value: 'cert-3', label: '换 5 道新题考：对 3 道及以下' }
  ];

  function renderWrongList() {
    const list = state.wrongCases || [];
    const pending = list.filter(function (c) { return c.masteryState !== 'mastered'; }).length;
    $('wrongSummary').textContent = list.length
      ? '共 ' + list.length + ' 条 · 待掌握 ' + pending + ' 条'
      : '';
    if (!list.length) {
      $('wrongList').innerHTML = '<div class="hint-box">暂无错题</div>';
      return;
    }
    $('wrongList').innerHTML = list.map(function (c, idx) {
      const kp = kpForWrong(c);
      const cell = kp ? kp.cell : SHT.suggestCell(c.category, SHT.curriculum.topicDomain);
      const attempts = c.variantAttempts || [];
      const corrected = attempts.filter(function (a) { return a.correct; }).length;
      const statusLabel = SHT.MASTERY_LABELS[c.masteryState] || c.masteryState;
      const statusCls = c.masteryState === 'mastered' ? ' is-mastered' : (c.masteryState === 'teacher-help' ? ' is-alert' : '');
      const ev = c.firstAttemptEvidence || {};
      return '<article class="wrong-card" data-index="' + idx + '">' +
        '<div class="wrong-main">' +
          '<div class="wrong-kp">' + esc(c.knowledgePoint) + '</div>' +
          '<div class="wrong-tags">' +
            '<span class="chip">' + esc(c.ability) + '</span>' +
            '<span class="chip">' + esc(c.category) +
              (c.causeConfidence ? ' · ' + Math.round(c.causeConfidence * 100) + '%' : '') + '</span>' +
            '<span class="chip is-status' + statusCls + '">' + esc(statusLabel) + '</span>' +
          '</div>' +
          '<div class="wrong-q">' + esc(c.questionSnapshot) + '</div>' +
          '<div class="wrong-ans">' +
            '<span>作答 <b>' + esc(c.studentAnswer) + '</b></span>' +
            '<span>正确 <b class="ok">' + esc(c.correctAnswer) + '</b></span>' +
            '<span>' + Math.round((ev.durationMs || 0) / 1000) + 's · 提示 ' + (ev.hintCount || 0) + ' · 重做 ' + (ev.retryCount || 0) + '</span>' +
            (attempts.length ? '<span>后续 ' + attempts.length + ' 次 · 对 ' + corrected + '</span>' : '') +
            (c.certificationScore != null ? '<span>认证 ' + c.certificationScore + '</span>' : '') +
          '</div>' +
          '<div class="wrong-cause"><em>诊断</em>　' + esc(c.errorCause) + '</div>' +
          (c.intentCause
            ? '<div class="wrong-cause is-intent"><em>出题意图</em>　当初想考的是「' + esc(c.intentCause) + '」' +
              (c.intentCause === c.category ? '，和诊断一致：这个干扰项设对了' : '，和诊断不一致：学生错的不是我们以为的那一维，下一轮按诊断来') +
              '</div>'
            : '') +
        '</div>' +
        '<div class="brief">' +
          '<div class="brief-title">出题要点</div>' +
          '<div class="brief-row"><span>知识点</span><span>' + esc(c.knowledgePoint) + '</span></div>' +
          '<div class="brief-row"><span>能力</span><span>' + esc(c.ability) + '</span></div>' +
          '<div class="brief-row"><span>诊断错因</span><span>' + esc(c.category) + '</span></div>' +
          // 意图与诊断一致时只留左边那句「设对了」，右边不再重复一行一样的字
          (c.intentCause && c.intentCause !== c.category
            ? '<div class="brief-row"><span>出题意图</span><span>' + esc(c.intentCause) + '</span></div>'
            : '') +
          '<div class="brief-row"><span>建议角度</span><span><strong>' + esc(cell.type) + ' / ' + esc(cell.level) + ' / ' + esc(cell.distractor) + '</strong></span></div>' +
          '<div class="brief-row"><span>再错则</span><span>' + esc(kp ? kp.nextIfWrong : '换角度重出') + '</span></div>' +
          '<div class="brief-row"><span>教材依据</span><span>' + esc(kp ? kp.source : c.unitId) + '</span></div>' +
          '<div class="brief-actions">' +
            '<button type="button" class="btn btn-mini" data-action="apply-weak" data-key="' + esc(c.knowledgePoint) + '" data-index="' + idx + '">写入计划</button>' +
            '<select data-attempt-field="next" data-index="' + idx + '">' + NEXT_ACTIONS.map(function (a) {
              return '<option value="' + a.value + '">' + esc(a.label) + '</option>';
            }).join('') + '</select>' +
            '<button type="button" class="btn btn-mini" data-action="record-attempt" data-index="' + idx + '">记录</button>' +
          '</div>' +
        '</div>' +
      '</article>';
    }).join('');
  }

  function renderAddWrongForm() {
    const form = $('addWrongForm');
    if (form.dataset.ready === '1') return;
    form.dataset.ready = '1';
    form.innerHTML = '' +
      '<div><label>他哪儿不会（写到具体错法）</label><input data-new="knowledgePoint" placeholder="如 vocab · class / classroom 形近"></div>' +
      '<div><label>属于哪类能力</label><select data-new="ability">' + selectHtml(SHT.SKILL_CATEGORIES, 'vocab') + '</select></div>' +
      '<div><label>他第一次选了什么</label><input data-new="studentAnswer" placeholder="学生选了什么"></div>' +
      '<div><label>正确答案</label><input data-new="correctAnswer" placeholder="只能有一个"></div>' +
      '<div><label>错在哪一类（用来建议下轮怎么出题）</label><select data-new="category">' + selectHtml(SHT.ERROR_CAUSES.map(function (c) { return c.id; }), '未掌握') + '</select></div>' +
      '<div><label>看了几次提示 / 重做几次（用逗号分开）</label><input data-new="support" placeholder="0,0"></div>' +
      '<div class="is-wide"><label>当时那道题（题干）</label><input data-new="questionSnapshot" placeholder="题干"></div>' +
      '<div class="is-wide"><label>他为什么错（用你自己的话写）</label><input data-new="errorCause" placeholder="如把 class 和 classroom 看混了"></div>' +
      '<div class="form-actions"><button type="button" class="btn btn-primary" data-action="add-wrong">保存这条错题</button>' +
        '<span class="form-note">同一个知识点只记一条；后面他重做，用上面每张卡的「记下这次」补记录。</span></div>';
  }

  /* ---------- 03 指标 ---------- */
  function countFailed(round) {
    if (!round || !round.questions.length) return null;
    return round.questions.filter(function (q) { return verdictOf(q) === '退回'; }).length;
  }

  function overlapCount() {
    const r1 = state.rounds[1], r2 = state.rounds[2];
    if (!r1.questions.length || !r2.questions.length) return null;
    const used = new Set(r1.questions.map(function (q) { return SHT.cellFingerprint(q.cell); }));
    return r2.questions.filter(function (q) { return used.has(SHT.cellFingerprint(q.cell)); }).length;
  }

  function endedEarly(round) {
    return !!(round && round.stopSignals && round.stopSignals.length && (round.endReason || '').trim());
  }

  function renderMetrics() {
    const round = currentRound();
    const total = round.questions.length;
    const passed = round.questions.filter(function (q) { return verdictOf(q) === '通过'; }).length;
    const failedCount = countFailed(round);
    const overlap = overlapCount();
    const stats = practiceStats();

    function kpi(label, value, note, cls) {
      return '<div class="kpi"><div class="kpi-label">' + esc(label) + '</div>' +
        '<div class="kpi-value' + (cls ? ' ' + cls : '') + '">' + esc(value) + '</div>' +
        '<div class="kpi-note">' + esc(note) + '</div></div>';
    }

    $('metrics').innerHTML =
      kpi('本轮题数', total + ' / ' + countFor(state.round), '计划题量', '') +
      kpi('通过', passed, '四层 23 条全过', passed ? 'is-good' : '') +
      kpi('退回', failedCount === null ? 0 : failedCount, '条款见右栏', failedCount ? 'is-bad' : '') +
      kpi('角度重复', overlap === null ? '—' : overlap + '/' + countFor(2), '合格线 ≤ 1/' + countFor(2), overlap !== null && overlap > 1 ? 'is-bad' : '') +
      kpi('真会 / 已测', stats.mastered + ' / ' + stats.tested, '共 ' + stats.total + ' 个考点', stats.wrong ? 'is-bad' : (stats.mastered ? 'is-good' : ''));
  }

  /* ---------- 03 出题日志 ---------- */
  function checkText(id) {
    const item = SHT.ALL_CHECKS.filter(function (c) { return c.id === id; })[0];
    return item ? item.text : '';
  }

  function renderLog() {
    const entries = [];
    [1, 2].forEach(function (rn) {
      const r = state.rounds[rn];
      if (!r.questions.length) return;
      const cells = new Set(r.questions.map(function (q) { return SHT.cellFingerprint(q.cell); })).size;
      entries.push({ round: rn, kind: 'plan', at: r.startedAt || '', title: '排了 ' + r.questions.length + ' 道题', detail: cells + ' 个角度各不相同' });
      r.questions.forEach(function (q, i) {
        const v = verdictOf(q);
        const fails = Object.keys(q.checks || {}).filter(function (k) { return q.checks[k] === 'fail'; });
        if (v === '待检') {
          entries.push({ round: rn, kind: 'wait', at: q.createdAt || '', title: '第 ' + (i + 1) + ' 题 还没检查', detail: esc(q.knowledgePoint || '未填写知识点') });
        } else if (v === '通过') {
          entries.push({ round: rn, kind: 'pass', at: q.createdAt || '', title: '第 ' + (i + 1) + ' 题 检查通过', detail: esc(q.knowledgePoint || '') });
        } else {
          entries.push({
            round: rn, kind: 'reject', at: q.createdAt || '', title: '第 ' + (i + 1) + ' 题 被退回',
            detail: esc(fails.map(codeText).join('、')) + (fails[0] ? '　' + esc(checkText(fails[0])) : '')
          });
        }
        // 这道题学生的作答紧跟在它后面，出题与作答在同一条线上，看得出因果
        (r.practice ? r.practice.attempts : []).filter(function (a) { return a.no === i + 1; })
          .forEach(function (a) {
            // 结构化：不再用全角空格把七八件事拼成一句话，改成一个个小标签
            const tags = [];
            if (!a.correct) {
              tags.push({ k: a.answerMode === 'open' ? '写了' : '选了', v: a.picked });
              tags.push({ k: '正确', v: a.expected });
            }
            if (a.durationMs) tags.push({ k: '耗时', v: Math.round(a.durationMs / 1000) + 's' });
            if (a.hintCount) tags.push({ k: '提示', v: '用了 ' + a.hintCount + ' 次' });
            if (a.via === 'model') tags.push({ k: '判定', v: '模型' });
            else if (a.via === 'human') tags.push({ k: '判定', v: '人工改判' });
            if (a.diag) tags.push({ k: '诊断', v: SHT.diagnose.summary(a.diag) });
            entries.push({
              round: rn, kind: a.correct ? 'pass' : 'reject', at: a.at || '',
              title: '第 ' + a.no + ' 题' + (a.stage === 'variant' ? ' 换个问法再考' : '') + (a.correct ? ' 答对' : ' 答错'),
              tags: tags
            });
          });
      });
      if (r.closed) entries.push({ round: rn, kind: 'close', at: r.endedAt || '', title: '第 ' + rn + ' 轮结束', detail: '' });
    });
    /*
     * 按天分组 + 组内倒序。
     * 以前是两轮的记录平铺成一条长列表，只显示时分，没有日期——
     * 过两天再看，根本不知道哪条是今天的、哪条是上周的。
     * 现在一天一组，组头写「今天 / 昨天 / 11月10日 周三」+ 条数，
     * 默认只展开最近一天，其余收起（展开状态记在 state.logOpenDays 里）。
     */
    entries.sort(function (a, b) { return String(b.at || '').localeCompare(String(a.at || '')); });
    const days = [];
    const byDay = {};
    entries.forEach(function (e) {
      const k = dayKey(e.at);
      if (!byDay[k]) { byDay[k] = { key: k, items: [] }; days.push(byDay[k]); }
      byDay[k].items.push(e);
    });
    const firstKey = days.length ? days[0].key : '';
    $('logCount').textContent = entries.length ? entries.length + ' 条 · ' + days.length + ' 天' : '';
    $('logFeed').innerHTML = entries.length ? days.map(function (d) {
      const open = isDayOpen(d.key, firstKey);
      return '<div class="log-day">' +
        '<button type="button" class="log-day-head" data-day="' + esc(d.key) + '" data-action="toggle-day" aria-expanded="' + (open ? 'true' : 'false') + '">' +
          '<span class="log-day-caret">' + (open ? '−' : '+') + '</span>' +
          '<span class="log-day-title">' + esc(dayLabel(d.key)) + '</span>' +
          '<span class="log-day-meta">' + d.items.length + ' 条</span>' +
        '</button>' +
        '<div class="log-day-body"' + (open ? '' : ' hidden') + '>' +
          d.items.map(function (e) {
            const tags = (e.tags || []).filter(function (t) { return t && t.v; }).map(function (t) {
              return '<span class="log-tag"><em>' + esc(t.k) + '</em>' + esc(t.v) + '</span>';
            }).join('');
            return '<div class="log-item is-' + e.kind + '">' +
              '<span class="log-at">' + esc(e.at ? timeOf(e.at) : '') + '</span>' +
              '<span class="log-round">第' + e.round + '轮</span>' +
              '<span class="log-dot' + (e.kind ? ' is-' + e.kind : '') + '"></span>' +
              '<div class="log-main">' +
                '<div class="log-title">' + esc(e.title) + '</div>' +
                (tags ? '<div class="log-detail">' + tags + '</div>'
                      : (e.detail ? '<div class="log-detail">' + e.detail + '</div>' : '')) +
              '</div>' +
            '</div>';
          }).join('') +
        '</div>' +
      '</div>';
    }).join('') : '<div class="chart-empty">暂无记录</div>';

    // 没出成的题单独一块，按考点分组：哪一格、第几次、卡在哪一步、一句话原因
    const failBox = $('failDetail');
    if (failBox) failBox.innerHTML = failGroupsHtml();

    const ledgerBox = $('gradeLedger');
    if (ledgerBox) ledgerBox.innerHTML = gradeLedgerHtml();
  }

  /*
   * 判分台账。只有「模型判过」和「人工改判」的条目会出现在这里——规则判的
   * （与答案一致）没什么可看的，也不会变。列出来的意义是让人能看见：
   * 哪些作答动了模型、判成什么、依据是什么、什么时候判的。
   * 冻结的体现在于：同一条不会出现两次，也没有「重新判定」按钮。
   */
  function gradeLedgerHtml() {
    const list = SHT.grade.modelEntries(state.gradeLedger);
    if (!list.length) {
      return '<div class="chart-empty">还没有需要模型判的作答。选择题与拼写题的答案能直接比对，不会走到模型。</div>';
    }
    return '<div class="ledger-list">' + list.map(function (e) {
      const via = e.via === 'human' ? '人工改判' : '模型判定';
      const first = e.modelFirst
        ? '　原判：' + (e.modelFirst.correct ? '对' : '错') + (e.modelFirst.reason ? '（' + esc(e.modelFirst.reason) + '）' : '')
        : '';
      return '<div class="ledger-row">' +
        '<span class="ledger-at">' + esc(timeOf(e.at)) + '</span>' +
        '<span class="ledger-verdict ' + (e.correct ? 'is-good' : 'is-bad') + '">' +
          (e.correct ? '算对' : '算错') + '</span>' +
        '<span class="ledger-body">' +
          '<span class="ledger-ans">' + esc(e.raw) + '</span>' +
          '<span class="ledger-meta">' + esc(via) +
            (e.confidence ? ' · 把握' + esc({ high: '高', medium: '中', low: '低' }[e.confidence] || e.confidence) : '') +
            (e.reason ? '　' + esc(e.reason) : '') + first +
          '</span>' +
        '</span>' +
      '</div>';
    }).join('') + '</div>';
  }

  function renderRejectChart() {
    const counts = {};
    [1, 2].forEach(function (rn) {
      state.rounds[rn].questions.forEach(function (q) {
        Object.keys(q.checks || {}).forEach(function (id) {
          if (q.checks[id] === 'fail') counts[id] = (counts[id] || 0) + 1;
        });
      });
    });
    const ids = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; });
    const max = ids.length ? counts[ids[0]] : 1;
    $('rejectChart').innerHTML = ids.length ? ids.map(function (id) {
      return '<div class="chart-row" title="' + esc(checkText(id)) + '">' +
        '<span class="chart-label">' + esc(id) + '</span>' +
        '<div class="chart-track"><div class="chart-bar is-bad" style="width:' + Math.round(counts[id] / max * 100) + '%"></div></div>' +
        '<span class="chart-count">' + counts[id] + '</span></div>';
    }).join('') : '<div class="chart-empty">暂无退回</div>';
  }

  function renderUsedCells() {
    // 原来这里显示的是指纹的末六位 hash（srwrtc / py4mqx），只有写代码的人知道那是什么。
    // 换成「题型 · 层次」，人一眼能看出这个角度已经出过题了；完整四维放 title。
    const seen = {};
    const order = [];
    [1, 2].forEach(function (rn) {
      state.rounds[rn].questions.forEach(function (q) {
        if (!q || !q.cell) return;
        const key = SHT.cellFingerprint(q.cell);
        if (!seen[key]) { seen[key] = q.cell; order.push(key); }
      });
    });
    $('usedCount').textContent = order.length ? order.length + ' 个' : '';
    $('usedCells').innerHTML = order.length
      ? order.map(function (k) {
        const c = seen[k];
        const full = [c.type, c.scene, c.level, c.distractor].join(' · ');
        return '<span class="used-cell" title="' + esc(full) + '">' + esc(c.type + ' · ' + c.level) + '</span>';
      }).join('')
      : '<span class="chart-empty">这一轮还没出过题</span>';
  }

  /* ---------- 03 停止决策 ---------- */
  const STOP_SIGNALS = [
    { id: 'SATURATED', label: '会了，不用再练', note: '同一知识点连续三次全对' },
    { id: 'STALLED', label: '一直卡住，换办法', note: '连续两轮挂在同一问题' }
  ];

  function renderStop() {
    const round = currentRound();
    $('stopPanel').innerHTML = '' +
      STOP_SIGNALS.map(function (s) {
        return '<label class="stop-rule">' +
          '<input type="checkbox" data-stop="' + s.id + '"' + (round.stopSignals.indexOf(s.id) >= 0 ? ' checked' : '') + '>' +
          '<span><strong>' + esc(s.label) + '</strong><small>' + esc(s.note) + '</small></span></label>';
      }).join('') +
      '<div class="stop-field"><label>依据</label>' +
        '<input data-stop-reason value="' + esc(round.endReason || '') + '" placeholder="如 classroom 连续三次全对"></div>' +
      '<div class="stop-actions">' +
        '<button type="button" class="btn btn-primary" data-action="next-round">' +
          (state.round === 1 ? '进入第 2 轮' : '查看结论') + '</button>' +
      '</div>';
  }

  /* ---------- 总渲染 ---------- */
  function renderBookSelect() {
    const sel = $('bookSelect');
    if (!sel) return;
    sel.innerHTML = SHT.BOOKS.list().map(function (b) {
      return '<option value="' + esc(b.id) + '"' + (b.id === SHT.curriculum.bookId ? ' selected' : '') + '>' +
        esc(b.shortName + '（' + b.unitCount + ' 单元）') + '</option>';
    }).join('');
  }

  function renderUnitSelect() {
    const sel = $('unitSelect');
    if (!sel) return;
    sel.innerHTML = SHT.BOOKS.current().units.map(function (u) {
      return '<option value="' + esc(u.id) + '"' + (u.id === SHT.curriculum.id ? ' selected' : '') + '>' +
        esc(u.id + ' ' + u.title) + '</option>';
    }).join('');
  }

  /*
   * 把新增的模型调用收进审计留痕。
   * 为什么不能直接读 llm.log：那份日志在内存里、最多 200 条，刷新就没了；
   * 而审计要回答的是「这一轮四个角色各自干了什么」，得跟存档一起留下来。
   * 每条只留结论与耗时，不留提示词原文（原文里有学生作答，不该再存一份）。
   */
  function collectTraces() {
    const all = (SHT.llm && SHT.llm.trace) ? SHT.llm.trace() : [];
    let n = 0;
    all.forEach(function (e) {
      if ((e.id || 0) <= state.traceLastId) return;
      state.traces.push(SHT.audit.summarizeCall(e));
      state.traceLastId = Math.max(state.traceLastId, e.id || 0);
      n += 1;
    });
    if (state.traces.length > 300) state.traces = state.traces.slice(-300);
    return n;
  }

  function renderAll() {
    document.querySelectorAll('#tabbar .tab').forEach(function (b) {
      b.classList.toggle('is-active', b.dataset.tab === state.tab);
    });
    document.querySelectorAll('.stage-page').forEach(function (p) {
      p.classList.toggle('is-active', p.id === 'page-' + state.tab);
    });
    document.querySelectorAll('#roundSwitch button').forEach(function (b) {
      b.classList.toggle('is-active', Number(b.dataset.round) === state.round);
    });
    renderBookSelect();
    renderUnitSelect();
    renderAgentRail();
    renderAgentPanel();
    renderPractice();
    renderWrongList();
    renderAddWrongForm();
    renderMetrics();
    renderLog();
    renderRejectChart();
    renderUsedCells();
    renderStop();
    // 审计台只在选中时才重绘：它要算台账复算与变体对照，代价比别的页签高
    if (state.tab === 'audit' && SHT.devAudit) SHT.devAudit.render();
    $('brandSub').textContent = SHT.sampleStudent.id + ' · ' + SHT.curriculum.bookName + ' · ' +
      SHT.curriculum.id + ' ' + SHT.curriculum.title + ' · 第 ' + state.round + ' 轮';
    $('footStatus').textContent = 'R' + state.round + ' · ' + SHT.curriculum.hostUnitId +
      ' · 词 ' + SHT.curriculum.words.length + ' / 句 ' + SHT.curriculum.sentencePatterns.length +
      ' / 候选 ' + unitKps().length;
    if ($('footHint')) {
      const cfg = SHT.llm.config();
      $('footHint').textContent = cfg.key ? ('模型 ' + cfg.model + ' · 本地保存') : '本地保存 · 模型未配置';
    }
  }

  /* ---------- 动作 ---------- */
  function startRound2() {
    const exclusion = SHT.buildExclusionList([state.rounds[1]]);
    const cells = generateCells(countFor(2), exclusion);
    const base = state.rounds[1].questions;
    state.rounds[2] = {
      questions: cells.map(function (cell, i) {
        return {
          no: i + 1,
          knowledgePoint: base[i] ? base[i].knowledgePoint : '',
          ability: '', cell: cell,
          prompt: '', audioText: '', options: ['', '', ''],
          answer: '', analysis: '', nextIfWrong: '', checks: {}
        };
      }),
      stopSignals: [], endReason: '', closed: false, practice: blankPractice()
    };
    state.round = 2;
    state.activeNo = 1;
    state.tab = 'agents';
    state.agent = 'course';
    save();
    renderAll();
  }

  function autoQuota() {
    const exclusion = exclusionForCurrentRound();
    const cells = generateCells(countFor(state.round), exclusion);
    const list = currentRound().questions;
    if (!list.length) {
      currentRound().questions = cells.map(function (cell, i) {
        return {
          no: i + 1, knowledgePoint: '', ability: '', cell: cell,
          prompt: '', audioText: '', options: ['', '', ''], answer: '', analysis: '', nextIfWrong: '', checks: {}
        };
      });
    } else {
      list.forEach(function (q, i) { if (cells[i]) q.cell = cells[i]; });
    }
    save(); renderAll();
    toast('已排好 ' + countFor(state.round) + ' 个角度');
  }

  // 手工改配额：一按就记成 manual，来源不再被自动覆盖
  function bumpQuota(ability, delta) {
    if (SHT.SKILL_CATEGORIES.indexOf(ability) < 0) return;
    const q = SHT.quota.normalize(state.quota);
    const next = {};
    SHT.SKILL_CATEGORIES.forEach(function (x) {
      const v = (q.byAbility[x] || 0) + (x === ability ? delta : 0);
      if (v > 0) next[x] = v;
    });
    const sum = SHT.quota.sum({ byAbility: next });
    const limit = Math.max(quotaLimit(), sum);
    state.quota = SHT.quota.normalize({ source: 'manual', total: limit, byAbility: next, note: '人工调整' });
    save(); renderAll();
  }

  // 重算：有勾选范围按范围分，没有按错题画像分，都没有按本册铺开
  function recalcQuota() {
    const rounds = state.round === 2 ? [state.rounds[1], state.rounds[2]] : [state.rounds[1]];
    const brief = SHT.pipeline.buildBrief({ unitId: state.unitId, rounds: rounds, wrongCases: state.wrongCases });
    state.quota = SHT.quota.auto({ scope: kpScopePayload(), brief: brief, kps: unitKps(), total: quotaLimit() });
    save(); renderAll();
    toast('配额已重算：' + (state.quota.note || '') + '　' + SHT.quota.text(state.quota));
  }

  function fillWeakness() {
    const queue = weaknessProjection().queue.slice(0, 3);
    if (!queue.length) { toast('没有待练知识点，先去 02 加一条错题'); return; }
    const list = currentRound().questions;
    if (!list.length) { toast('先在 01 排好出题角度'); return; }
    queue.forEach(function (item, i) {
      if (!list[i]) return;
      list[i].knowledgePoint = item.label;
      list[i].cell = SHT.suggestCell(item.topCause, SHT.curriculum.topicDomain);
    });
    save(); renderAll();
    toast('已把最该练的 ' + Math.min(queue.length, list.length) + ' 个知识点和建议的出题角度写进计划');
  }

  function applyWeak(key, idx) {
    const c = typeof idx === 'number' ? state.wrongCases[idx] : null;
    const kp = c ? kpForWrong(c) : null;
    const item = weaknessProjection().items.filter(function (i) { return i.key === key; })[0];
    const cell = kp ? kp.cell : (item ? item.suggestedCell : null);
    if (!cell) { toast('这条没有可用的出题角度'); return; }
    const list = currentRound().questions;
    if (!list.length) { toast('先在 01 排好出题角度'); return; }
    const slot = list.filter(function (q) { return !q.knowledgePoint; })[0] || list[0];
    slot.knowledgePoint = key;
    slot.cell = Object.assign({}, cell);
    if (kp) slot.ability = kp.ability;
    state.tab = 'agents';
    state.agent = 'course';
    save(); renderAll();
    toast('已写入第 ' + (list.indexOf(slot) + 1) + ' 题：' + key);
  }

  function recordAttempt(index, action) {
    const c = state.wrongCases[index];
    if (!c) return;
    const now = new Date().toISOString();
    if (action.indexOf('cert-') === 0) {
      const n = action === 'cert-5' ? 5 : action === 'cert-4' ? 4 : 3;
      const attempts = [];
      for (let i = 0; i < 5; i += 1) {
        attempts.push({ correct: i < n, hintCount: 0, retryCount: 0, scoringMethod: 'exact', purpose: 'certification' });
      }
      const result = SHT.certify(c, attempts, state.learningLayer);
      if (!result.ok) { toast(result.reason); return; }
      state.wrongCases[index] = Object.assign({}, c, {
        masteryState: result.passed ? 'mastered' : 'awaiting-certification',
        certificationScore: result.score
      });
      toast('独立验证 ' + result.score + ' 分（达标 ' + result.threshold + ' 分）：' + result.reason);
    } else {
      const attempt = {
        correct: action !== 'wrong',
        hintCount: action === 'support' ? 1 : 0,
        retryCount: 0,
        purpose: 'remediation-training',
        scoringMethod: 'exact',
        completedAt: now
      };
      state.wrongCases[index] = SHT.appendVariantAttempt(c, attempt);
      const label = SHT.MASTERY_LABELS[state.wrongCases[index].masteryState] || state.wrongCases[index].masteryState;
      toast('记下了，现在状态：' + label + (action === 'support' ? '（看了提示，不算真会）' : ''));
    }
    save(); renderAll();
  }

  function addWrongCase() {
    const get = function (name) {
      const el = document.querySelector('[data-new="' + name + '"]');
      return el ? el.value.trim() : '';
    };
    const kp = get('knowledgePoint');
    if (!kp) { toast('先写「他哪儿不会」'); return; }
    const support = get('support').split(/[,，]/).map(function (x) { return Number(x.trim()) || 0; });
    const originalQuestionId = 'q-' + Date.now().toString(36);
    const c = {
      id: SHT.makeWrongCaseId(SHT.sampleStudent.id, SHT.curriculum.hostUnitId, originalQuestionId),
      studentId: SHT.sampleStudent.id,
      unitId: SHT.curriculum.hostUnitId,
      originalQuestionId: originalQuestionId,
      knowledgePoint: kp,
      ability: get('ability') || 'vocab',
      category: get('category') || '未掌握',
      errorCause: get('errorCause') || '未填写错因说明',
      questionSnapshot: get('questionSnapshot') || '（未记录原题）',
      studentAnswer: get('studentAnswer') || '（未记录）',
      correctAnswer: get('correctAnswer') || '（未记录）',
      firstAttemptEvidence: {
        durationMs: 0, hintCount: support[0] || 0, retryCount: support[1] || 0,
        completedAt: new Date().toISOString()
      },
      variantAttempts: [],
      masteryState: 'wrong', remediationLoopCount: 0, certificationScore: null,
      createdAt: new Date().toISOString()
    };
    state.wrongCases.push(c);
    save(); renderAll();
    toast('已记下这条错题，该练什么也重新排过了');
  }

  function exportJSON() {
    const p = weaknessProjection();
    const b = SHT.BOOKS.current();
    const stats = SHT.llm.stats();
    const payload = {
      exportedAt: new Date().toISOString(),
      book: {
        id: SHT.curriculum.bookId,
        name: b.meta.name,
        shortName: b.meta.shortName,
        publisher: b.meta.publisher,
        grade: b.meta.grade,
        term: b.meta.term,
        unitCount: b.units.length,
        source: b.meta.source,
        warnings: b.meta.warnings
      },
      unit: SHT.curriculum.hostUnitId,
      unitTitle: SHT.curriculum.title,
      student: SHT.sampleStudent.id,
      learningLayer: state.learningLayer,
      indicators: {
        overlap: overlapCount(),
        round1Failed: countFailed(state.rounds[1]),
        round2Failed: countFailed(state.rounds[2]),
        round1EndedEarly: endedEarly(state.rounds[1]),
        round2EndedEarly: endedEarly(state.rounds[2])
      },
      practice: {
        round1: roundPracticeSummary(state.rounds[1]),
        round2: roundPracticeSummary(state.rounds[2])
      },
      // 生成失败的全量记录：哪一步、哪条判据、什么原因、第几次
      failures: state.failures || [],
      // 本轮考察范围与三个角色各自的记忆，导出时一并留档（不含 key）
      kpScope: state.kpScope || [],
      // 这一轮的能力配额与达成情况，导出后能复盘「是不是又全考了词汇」
      quota: state.quota || null,
      quotaReport: state.quotaReport || null,
      agentMemory: state.agentMemory || null,
      llm: {
        model: SHT.llm.config().model,
        calls: stats.calls,
        ok: stats.ok,
        fail: stats.fail,
        tokens: stats.tokens,
        totalMs: stats.ms
      },
      weaknessProjection: p,
      wrongCases: state.wrongCases,
      rounds: state.rounds
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'sht-minimal-test-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast('记录已导出，可对照《最小测试记录表》填写');
  }

  let toastTimer = null;
  function toast(text) {
    let node = document.querySelector('.toast');
    if (!node) {
      node = document.createElement('div');
      node.className = 'toast';
      document.body.appendChild(node);
    }
    node.textContent = text;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { node.remove(); }, 3400);
  }

  /* ---------- 教材版本 / 单元切换 ---------- */
  function resetFor(bookId, unitId, msg) {
    if (!window.confirm(msg)) { renderAll(); return; }
    SHT.setBook(bookId, unitId);
    state.bookId = bookId;
    state.unitId = SHT.curriculum.id;
    state.round = 1;
    state.activeNo = 1;
    state.checkLayer = 0;
    state.agent = 'course';
    state.rounds = { 1: blankRound(), 2: blankRound() };
    state.rounds[1].questions = cloneSample(state.unitId, countFor(1));
    state.wrongCases = cloneWrongCases(state.unitId);
    state.failures = [];
    // 候选清单是跟着单元走的，换书换单元后旧的 id 全部失效，范围必须清空
    state.kpScope = [];
    state.agentMemory = SHT.agentMemory.blank();
    state.progress = SHT.progress.blank();
    state.quota = SHT.quota.blank();
    save();
    renderAll();
    toast('已切到 ' + SHT.curriculum.bookName + ' · ' + state.unitId + ' ' + SHT.curriculum.title);
  }

  function switchBook(bookId) {
    if (!bookId || bookId === SHT.curriculum.bookId) { renderAll(); return; }
    const b = SHT.BOOKS.get(bookId);
    if (!b) { renderAll(); return; }
    resetFor(bookId, b.units[0].id,
      '切到「' + b.meta.shortName + '」？两轮题目、出题计划与错题记录会按新教材重建。');
  }

  function switchUnit(unitId) {
    if (!unitId || unitId === SHT.curriculum.id) { renderAll(); return; }
    const unit = SHT.BOOKS.current().getUnit(unitId);
    if (!unit) { renderAll(); return; }
    resetFor(SHT.curriculum.bookId, unitId,
      '切到 ' + unitId + ' ' + unit.title + '？两轮题目、出题计划与错题记录会按新单元重建。');
  }

  /* ---------- 模型设置 ---------- */
  function renderModelForm() {
    const cfg = SHT.llm.config();
    const stats = SHT.llm.stats();
    const last = SHT.llm.lastError();
    $('modelForm').innerHTML = '' +
      '<div class="model-field"><label>接口地址</label><input data-model="baseUrl" value="' + esc(cfg.baseUrl) + '"></div>' +
      '<div class="model-field"><label>模型</label><input data-model="model" value="' + esc(cfg.model) + '"></div>' +
      '<div class="model-field"><label>API Key</label><input data-model="key" type="password" value="' + esc(cfg.key) + '" placeholder="sk-…"></div>' +
      '<div class="model-actions">' +
        '<button type="button" class="btn btn-primary" data-action="save-model">保存</button>' +
        '<button type="button" class="btn" data-action="test-model">测试连通性</button>' +
      '</div>' +
      '<div class="model-status" id="modelStatus">' +
        (stats.calls ? '本次会话 ' + stats.calls + ' 次调用 · 成功 ' + stats.ok + ' · 失败 ' + stats.fail + ' · ' + stats.tokens + ' tokens' : '还没有调用记录') +
        (last ? '<br>最近一次失败：' + esc(last.errorType + ' · ' + last.message) : '') +
      '</div>' +
      '<div class="model-note">Key 只存在本机浏览器，不进仓库、不进导出文件。这个页面是零依赖静态页，key 在本机 URL 下可被同源脚本读到，别发布到公网。</div>';
  }

  function openModel() {
    const modal = $('modelModal');
    if (!modal) return;
    modal.hidden = false;
    renderModelForm();
  }

  function closeModel() {
    const modal = $('modelModal');
    if (modal) modal.hidden = true;
  }

  function saveModelFromForm() {
    const get = function (k) {
      const el = document.querySelector('[data-model="' + k + '"]');
      return el ? el.value.trim() : '';
    };
    SHT.llm.save({
      baseUrl: get('baseUrl') || SHT.llm.defaults.baseUrl,
      model: get('model') || SHT.llm.defaults.model,
      key: get('key')
    });
    renderModelForm();
    renderAll();
    toast('模型配置已保存');
  }

  async function testModel() {
    const box = $('modelStatus');
    const get = function (k) {
      const el = document.querySelector('[data-model="' + k + '"]');
      return el ? el.value.trim() : '';
    };
    // 测试用的就是输入框里现在这份值：填完直接点测试，不必先点保存。
    // 以前只读已保存的配置，填了没保存会走「还没填 API Key」那条，
    // 表现就是点了按钮什么都没发生——这条也是「一直不出结果」的常见来源。
    const typedKey = get('key');
    if (typedKey) {
      SHT.llm.save({
        baseUrl: get('baseUrl') || SHT.llm.defaults.baseUrl,
        model: get('model') || SHT.llm.defaults.model,
        key: typedKey
      });
    }

    const cfg = SHT.llm.config();
    const wait = Math.round((cfg.timeoutMs || 90000) / 1000);
    if (box) {
      box.textContent = '正在用 ' + SHT.llm.maskedKey() + ' 测试…（最长等 ' + wait + ' 秒）';
    }
    let res;
    try {
      res = await SHT.pipeline.selfCheck();
    } catch (err) {
      // 兜底：任何没预料到的异常都要落到状态栏，不能让这里静默停在「正在测试…」
      res = { ok: false, type: 'exception', message: String(err && err.message || err) };
    }
    if (box) {
      box.innerHTML = res.ok
        ? '连通正常 · ' + esc(res.model) + ' · ' + res.ms + ' ms · ' + (res.tokens || 0) + ' tokens'
        : '失败：<code>' + esc(res.type) + '</code> ' + esc(res.message);
    }
  }

  /* ---------- 模型出题 ---------- */
  let runToken = 0;

  function setStep(text) {
    state.llmStep = text;
    const el = document.querySelector('.model-step');
    if (el) el.textContent = text;
    else renderAll();
  }

  async function runModelRound(planOnly) {
    if (!SHT.llm.isReady()) {
      openModel();
      toast('先填 API Key');
      return;
    }
    if (state.llmBusy) return;
    const token = (runToken += 1);
    state.llmBusy = true;
    state.llmStep = '准备';
    // 这一轮什么时候开始的：日志按时间排，人要知道这批题是什么时候出的
    currentRound().startedAt = new Date().toISOString();
    save();
    renderAll();

    const round = currentRound();
    const rounds = state.round === 2 ? [state.rounds[1], state.rounds[2]] : [state.rounds[1]];

    /*
     * 上一轮答完的题，在这一轮开头结算一次：该升层的升、该退役的退役。
     * 不结算的话规划永远看到「一轮都没考过」，层次阶梯就是死的——
     * 而且这个结算只能做一次，所以打个标记，重出题不会重复升层。
     */
    const prior = state.round === 2 ? state.rounds[1] : null;
    if (prior && !prior.progressCommitted && (prior.practice && prior.practice.attempts.length)) {
      state.progress = SHT.progress.commit(state.progress, {
        questions: prior.questions,
        attempts: prior.practice.attempts
      });
      prior.progressCommitted = true;
    }
    // 上一轮的作答也要进角色记忆：生成下一轮时这一轮还没开始答，
    // 只传本轮的 attempts 等于永远传空，诊断角色的错因分布就永远记不住。
    const priorAttempts = rounds.reduce(function (acc, r) {
      return acc.concat((r.practice && r.practice.attempts) || []);
    }, []);

    const brief = SHT.pipeline.buildBrief({
      unitId: state.unitId,
      rounds: rounds,
      wrongCases: state.wrongCases,
      // 验证角色上一轮判了哪些不过：课程角色要读这个才知道「为什么没出成」
      failures: state.failures
    });
    brief.levelHint = brief.levelHint || '持平';

    // 勾选范围内已经全考过 → 自动扩池：把没考过的候选补进来，一次只考一点
    let scopeNow = kpScopePayload();
    const retired = (state.progress && state.progress.points) || {};
    if (scopeNow.length && scopeNow.every(function (s) { return (retired[s.label] || {}).retired; })) {
      const rest = unitKps().filter(function (k) { return !(retired[k.label] || {}).retired; })
        .slice(0, 5).map(function (k) { return { id: k.id, label: k.label, ability: k.ability, cell: k.cell }; });
      if (rest.length) {
        state.kpScope = rest.map(function (s) { return s.id; });
        scopeNow = rest;
        toast('勾选范围已考完，自动换下一批 ' + rest.length + ' 个考点');
      }
    }

    try {
      const res = await SHT.pipeline.runRound({
        unit: SHT.curriculum,
        count: countFor(state.round),
        brief: brief,
        scope: scopeNow,
        memory: state.agentMemory,
        progress: state.progress,
        quota: state.quota,
        stage: { layer: state.learningLayer },
        attempts: (round.practice && round.practice.attempts) || [],
        priorAttempts: priorAttempts,
        existing: round.questions.filter(function (q) { return q.prompt; }),
        // 失败记录要带轮次，否则界面拿「全部失败」当「这一轮」
        round: state.round,
        planOnly: !!planOnly,
        onEvent: function (ev) {
          if (token !== runToken) return;
          setStep(ev.text || '');
        }
      });
      if (token !== runToken) return;

      state.failures = (res.failures || []).concat(state.failures || []).slice(0, 200);
      // 记忆按角色分开存：下一轮各自读回自己那份
      if (res.memoryNext) state.agentMemory = res.memoryNext;
      if (res.progressNext) state.progress = res.progressNext;
      // 配额回写：自动算出来的那份要落回界面，否则下一轮又按旧的算
      if (res.quota) state.quota = SHT.quota.normalize(res.quota);
      if (res.quotaReport) state.quotaReport = res.quotaReport;
      // 自动停止：代码判出来的信号直接写进停止条，依据一并写上，人还可以改
      if (res.stop && res.stop.signals.length && !round.stopSignals.length) {
        round.stopSignals = res.stop.signals.slice();
        round.endReason = '（自动判定）' + (res.stop.reason || '');
      }

      if (res.ok && res.questions.length) {
        round.questions = res.questions.map(function (q, i) {
          return Object.assign({}, q, { no: i + 1 });
        });
        // 题目换了，作答进度作废，避免拿旧记录判新题
        round.practice = blankPractice();
        state.activeNo = 1;
        state.agent = 'execute';
        const left = res.plans.length - res.questions.length;
        toast('出了 ' + res.questions.length + ' 题' +
          (res.benchUsed ? '（替补顶上 ' + res.benchUsed + ' 次）' : '') +
          (left ? '，' + left + ' 个格子没成，原因在失败记录里' : ''));
      } else if (res.ok && planOnly) {
        toast('规划好了 ' + res.plans.length + ' 条，格子已分配' +
          (res.bench && res.bench.length ? '，另备 ' + res.bench.length + ' 条替补' : ''));
      } else {
        toast('这一轮没出成，看失败记录里的原因');
        state.agent = 'course';
      }
    } catch (err) {
      state.failures = [{
        at: new Date().toISOString(), stage: 'generate', attempt: 1,
        codes: ['EXCEPTION'], reason: String(err && err.message || err), detail: ''
      }].concat(state.failures || []).slice(0, 200);
      toast('出错了：' + (err && err.message ? err.message : err));
    } finally {
      if (token === runToken) {
        state.llmBusy = false;
        collectTraces();
        save();
        renderAll();
      }
    }
  }

  /* ---------- 事件（全部委托，重渲染不会重复绑定） ---------- */
  function bind() {
    const bookSel = $('bookSelect');
    if (bookSel) {
      bookSel.addEventListener('change', function (e) { switchBook(e.target.value); });
    }
    const unitSel = $('unitSelect');
    if (unitSel) {
      unitSel.addEventListener('change', function (e) { switchUnit(e.target.value); });
    }
    const modelBtn = $('modelBtn');
    if (modelBtn) modelBtn.addEventListener('click', openModel);
    const modal = $('modelModal');
    if (modal) {
      modal.addEventListener('click', function (e) {
        if (e.target === modal) closeModel();
        const act = e.target.closest('[data-action]');
        if (!act) return;
        if (act.dataset.action === 'close-model') closeModel();
        else if (act.dataset.action === 'save-model') saveModelFromForm();
        else if (act.dataset.action === 'test-model') testModel();
      });
    }

    $('tabbar').addEventListener('click', function (e) {
      const b = e.target.closest('button[data-tab]');
      if (!b) return;
      state.tab = b.dataset.tab; save(); renderAll();
    });

    $('roundSwitch').addEventListener('click', function (e) {
      const b = e.target.closest('button[data-round]');
      if (!b) return;
      const target = Number(b.dataset.round);
      if (target === 2 && !state.rounds[2].questions.length) { startRound2(); return; }
      state.round = target; state.activeNo = 1; save(); renderAll();
    });

    $('agentRail').addEventListener('click', function (e) {
      const b = e.target.closest('button[data-role]');
      if (!b) return;
      state.agent = b.dataset.role; save(); renderAll();
    });

    $('agentPanel').addEventListener('click', function (e) {
      const b = e.target.closest('[data-action]');
      if (b) {
        const action = b.dataset.action;
        if (action === 'model-round') { runModelRound(false); return; }
        if (action === 'stop-model') { runToken += 1; state.llmBusy = false; save(); renderAll(); toast('已停止后续步骤，已经发出去的请求不会收回'); return; }
        if (action === 'goto-log') { state.tab = 'loop'; save(); renderAll(); return; }
        if (action === 'toggle-day') {
          // 一天一组：点组头只切这一天，别的天不动
          const key = b.dataset.day || '';
          state.logOpenDays = state.logOpenDays || {};
          const firstKey = (function () {
            const any = [1, 2].map(function (rn) { return (state.rounds[rn] || {}).startedAt; }).filter(Boolean).sort().pop() || '';
            return dayKey(any);
          })();
          const nowOpen = isDayOpen(key, firstKey);
          state.logOpenDays[key] = !nowOpen;
          save();
          renderLog();
          return;
        }
        if (action === 'auto-quota') { autoQuota(); return; }
        if (action === 'quota-inc') { bumpQuota(b.dataset.ability, 1); return; }
        if (action === 'quota-dec') { bumpQuota(b.dataset.ability, -1); return; }
        if (action === 'quota-recalc') { recalcQuota(); return; }
        if (action === 'fill-weakness') { fillWeakness(); return; }
        if (action === 'pick-kp') { applyKnowledgePoint(b.dataset.id, state.activeNo, true); return; }
        if (action === 'toggle-scope') { toggleScope(b.dataset.id); return; }
        if (action === 'clear-scope') { state.kpScope = []; save(); renderAll(); toast('本轮不限知识点范围'); return; }
        if (action === 'q-nav') { state.activeNo = Number(b.dataset.no); save(); renderAll(); return; }
        if (action === 'diagnose-model') { diagnoseByModel(); return; }
        if (action === 'save-changes') { save(); renderAll(); toast('已保存本页修改'); return; }
        if (action === 'layer') { state.checkLayer = Number(b.dataset.index); save(); renderAll(); return; }
        if (action === 'check') {
          const q = currentQuestion();
          if (!q) return;
          const id = b.dataset.check, v = b.dataset.verdict;
          if (q.checks[id] === v) delete q.checks[id]; else q.checks[id] = v;
          save(); renderAll(); return;
        }
        if (action === 'copy-word') {
          const word = b.dataset.word;
          try { navigator.clipboard.writeText(word); toast('已复制：' + word); }
          catch (err) { toast(word); }
          return;
        }
      }
      const row = e.target.closest('.plan-row');
      if (row && !e.target.matches('input,select')) {
        state.activeNo = Number(row.dataset.no); save(); renderAll();
      }
    });

    $('agentPanel').addEventListener('change', function (e) {
      const el = e.target;
      const field = el.dataset.field;
      if (!field) return;
      if (field === 'questionCount') {
        const rn = el.dataset.round;
        if (!rn) return;
        state.questionCounts[rn] = clampCount(el.value);
        el.value = state.questionCounts[rn];
        resizeQuestions(state.rounds[rn], state.questionCounts[rn]);
        if (state.activeNo > state.rounds[rn].questions.length) state.activeNo = state.rounds[rn].questions.length || 1;
        // 题量变了，配额要跟着重新分；人手工调过的配额不动
        if (Number(rn) === state.round && state.quota && state.quota.source !== 'manual') {
          state.quota = SHT.quota.auto({
            scope: kpScopePayload(), kps: unitKps(), total: quotaLimit()
          });
        }
        save(); renderAll();
        return;
      }
      // 课程角色计划表（带 data-no）：即时保存
      if (el.dataset.no) {
        const q = currentRound().questions[Number(el.dataset.no) - 1];
        if (!q) return;
        if (field === 'knowledgePoint') q[field] = el.value;
        else if (q.cell) q.cell[field] = el.value;
        save(); renderAll();
        return;
      }
      // 生成角色九字段（不带 data-no）：只写内存，等「保存修改」按钮
      const q = currentQuestion();
      if (!q) return;
      if (field === 'answerMode') {
        // 作答方式决定判分走哪条链路：选一个答案走选项，自己写走输入框。
        // 这一项改了要立刻生效，不能等「保存修改」——否则 02 页还是旧形态。
        q.open = el.value === 'open';
        save(); renderAll(); return;
      }
      if (field === 'option') q.options[Number(el.dataset.index)] = el.value;
      else q[field] = el.value;
    });

    $('agentPanel').addEventListener('input', function (e) {
      const el = e.target;
      const field = el.dataset.field;
      if (!field || el.dataset.no || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') return;
      const q = currentQuestion();
      if (!q) return;
      if (field === 'option') q.options[Number(el.dataset.index)] = el.value;
      else q[field] = el.value;
    });

    $('wrongList').addEventListener('click', function (e) {
      const applyBtn = e.target.closest('[data-action="apply-weak"]');
      if (applyBtn) { applyWeak(applyBtn.dataset.key, Number(applyBtn.dataset.index)); return; }
      const b = e.target.closest('[data-action="record-attempt"]');
      if (!b) return;
      const idx = Number(b.dataset.index);
      const sel = document.querySelector('[data-attempt-field="next"][data-index="' + idx + '"]');
      recordAttempt(idx, sel ? sel.value : 'wrong');
    });

    $('practiceCard').addEventListener('click', function (e) {
      const b = e.target.closest('[data-action]');
      if (!b) return;
      const action = b.dataset.action;
      if (action === 'pick-option') { pickOption(Number(b.dataset.index)); return; }
      if (action === 'use-hint') { useHint(); return; }
      if (action === 'submit-answer') { submitAnswer(); return; }
      if (action === 'flip-grade') { flipGrade(); return; }
      if (action === 'next-step') { practiceNext(); return; }
      if (action === 'restart-practice') { restartPractice(); return; }
      if (action === 'goto-wrongbook') { state.tab = 'wrongbook'; save(); renderAll(); return; }
      if (action === 'goto-round2') { startRound2(); return; }
    });

    // 开放题的输入。只存草稿、不重渲染——重渲染会把光标顶到末尾，写到一半的人会疯。
    $('practiceCard').addEventListener('input', function (e) {
      const el = e.target;
      if (!el || el.dataset.role !== 'open-input') return;
      practiceOf().draft = el.value;
      save();
    });

    $('addWrongForm').addEventListener('click', function (e) {
      const b = e.target.closest('[data-action="add-wrong"]');
      if (b) addWrongCase();
    });

    $('stopPanel').addEventListener('change', function (e) {
      const el = e.target;
      if (!el.dataset.stop) return;
      const list = currentRound().stopSignals;
      const at = list.indexOf(el.dataset.stop);
      if (el.checked && at < 0) list.push(el.dataset.stop);
      if (!el.checked && at >= 0) list.splice(at, 1);
      save(); renderMetrics();
    });

    $('stopPanel').addEventListener('input', function (e) {
      if (!e.target.dataset.stopReason && e.target.dataset.stopReason !== '') return;
      currentRound().endReason = e.target.value;
      save(); renderMetrics();
    });

    $('stopPanel').addEventListener('click', function (e) {
      const b = e.target.closest('[data-action="next-round"]');
      if (!b) return;
      if (state.round === 1) {
        if (!window.confirm('第 1 轮做完了吗？开始第 2 轮会先避开第 1 轮用过的出题角度。')) return;
        state.rounds[1].closed = true;
        startRound2();
        toast('第 2 轮已避开上轮的出题角度；知识点保留，题目要按新角度重写');
      } else {
        const overlap = overlapCount();
        const r1 = countFailed(state.rounds[1]);
        const r2 = countFailed(state.rounds[2]);
        toast('两轮结果：出题角度重复 ' + (overlap === null ? '—' : overlap + '/' + countFor(2)) +
          '，被退回的题 ' + (r1 === null ? '—' : r1) + ' → ' + (r2 === null ? '—' : r2) +
          '。样本小，只够看方向。');
      }
    });

    $('exportBtn').addEventListener('click', exportJSON);

    $('resetBtn').addEventListener('click', function () {
      if (!window.confirm('清空两轮题目、错题和停止记录？不能撤销。')) return;
      try { localStorage.removeItem(STORAGE_KEY); } catch (err) { /* ignore */ }
      const keepUnit = state.unitId;
      SHT.setUnit(keepUnit);
      state = defaultState();
      state.rounds[1].questions = cloneSample(keepUnit);
      save(); renderAll();
      toast('已恢复成 ' + keepUnit + ' 的初始示例');
    });
  }

  // 配额先定下来再渲染：首屏就该看到「词汇 2 / 语法 1」这样的分配，
  // 而不是一片 0/0 等着人去点
  if (SHT.quota.sum(state.quota) === 0) {
    state.quota = SHT.quota.auto({ scope: kpScopePayload(), kps: unitKps(), total: quotaLimit() });
  }

  // 审计台需要读存档、写存档、弹提示、收留痕：四个回调一次性交给它，
  // 免得它反过来依赖 app.js 的内部函数（那样换界面就得改两处）。
  if (SHT.devAudit) {
    SHT.devAudit.state = function () { return state; };
    SHT.devAudit.save = save;
    SHT.devAudit.toast = toast;
    SHT.devAudit.collectTraces = collectTraces;
  }

  bind();
  renderAll();
  save();
})(window);
