/*
 * 最小出题测试工作台 · 界面逻辑
 *
 * 定位：给人手工出题用的模板，不是自动出题器，后面才「注入灵魂」。
 * 界面只自动做五件事：排不重复的出题角度、从静态候选清单确定性带出 4 项、记录检查结果、
 * 判学生的答案、按变化轴接一道同考点的变体；算指标也在这里。
 * 题目内容由人按格子填写 —— 对应出题手册「最小测试全手工」的口径。
 *
 * 四个 tab 按流程切分：
 *   01 出题 = 环节 1/2/3（课程规划 / 执行生成 / 验证质检），一次只显示一个角色
 *   02 答题 = 学生侧：作答 → 判对错 → 对就换考点 / 错就换一道同考点的变体 → 还错写错题
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
      hintUsed: false,
      hintGone: -1,
      pending: null,
      nextVariant: null,
      revealed: null,
      attempts: []
    };
  }

  function blankRound() {
    return { questions: [], stopSignals: [], endReason: '', closed: false, practice: blankPractice() };
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
      progress: SHT.progress.blank()
    };
  }

  function normalizeState(parsed) {
    if (!parsed.bookId) parsed.bookId = 'PEP-G4A';
    if (!Array.isArray(parsed.failures)) parsed.failures = [];
    if (!Array.isArray(parsed.kpScope)) parsed.kpScope = [];
    if (!parsed.agentMemory || !parsed.agentMemory.plan) parsed.agentMemory = SHT.agentMemory.blank();
    if (!parsed.progress || !parsed.progress.points) parsed.progress = SHT.progress.blank();
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

  /* ---------- 角色定义：同一模型，三套提示词 / 记忆 / 技能 ---------- */
  const ROLES = [
    {
      id: 'course', no: '环节 1', name: '课程智能体', stage: '规划',
      prompt: '命题规划 · 按题量配额',
      memory: '上轮角度 · 薄弱画像',
      skill: '变化轴 · 配额约束'
    },
    {
      id: 'execute', no: '环节 2', name: '执行智能体', stage: '生成',
      prompt: '单题生成 · 九字段',
      memory: '仅本单元词表',
      skill: '词表取材 · 干扰项设计'
    },
    {
      id: 'verify', no: '环节 3', name: '验证智能体', stage: '质检',
      prompt: '独立质检 · 23 条二元',
      memory: '教材词表 · 四层判据',
      skill: '四层判据 · 条款号'
    }
  ];

  // 卡片上的记忆摘要：课程/执行/验证 对应 agents.js 里的 plan/generate/verify
  const AGENT_OF_ROLE = { course: 'plan', execute: 'generate', verify: 'verify' };
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

  /* ---------- 01 课程智能体：配额表 ---------- */
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
      return '<div class="kp-empty">本册无候选清单 · 考点由规划环节现场提</div>';
    }
    const scope = state.kpScope || [];
    const doneCount = (state.progress && state.progress.points)
      ? Object.keys(state.progress.points).filter(function (k) { return state.progress.points[k].retired; }).length : 0;
    const layer = state.learningLayer || 'B';
    const scopeBar = '<div class="kp-scope">本轮范围 <strong>' + scope.length + '</strong> / ' + list.length +
      '<span class="kp-scope-note">' + layer + ' 层 · 上限 ' + SHT.progress.CAP_OF_LAYER[layer] + (doneCount ? ' · 已考会 ' + doneCount : '') + '</span>' +
      (scope.length
        ? '<span class="kp-scope-note">最多出 ' + scope.length + ' 题</span><button type="button" class="btn btn-mini" data-action="clear-scope">清空</button>'
        : '<span class="kp-scope-note">不限范围 · 规划环节现场提</span>') +
      '</div>';
    return '<details class="kp-fold"' + (scope.length ? ' open' : '') + '><summary>候选知识点 · ' + SHT.curriculum.id + ' · ' + list.length + '</summary>' +
      scopeBar +
      '<div class="kp-current">点「用这个」写入第 ' + state.activeNo + ' 题；点「纳入」加进本轮范围</div>' +
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
                '<button type="button" class="btn btn-mini" data-action="pick-kp" data-id="' + esc(k.id) + '">用这个</button></div>' +
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

  function failFeedHtml() {
    const list = (state.failures || []).slice(0, 12);
    if (!list.length) return '';
    const rows = list.map(function (f) {
      const stage = { plan: '规划', generate: '生成', validate: '代码闸', verify: '质检', giveup: '放弃' }[f.stage] || f.stage;
      const codes = (f.codes || []).join(' ');
      return '<div class="fail-row">' +
        '<span class="fail-stage is-' + esc(f.stage) + '">' + esc(stage) + '</span>' +
        '<span class="fail-kp">' + esc(f.planKp || '整轮') + (f.attempt ? ' · 第 ' + f.attempt + ' 次' : '') + '</span>' +
        '<span class="fail-reason">' + (codes ? '<code>' + esc(codes) + '</code> ' : '') + esc(String(f.reason || '').slice(0, 120)) + '</span>' +
      '</div>';
    }).join('');
    return '<details class="fail-fold"' + (list.length ? ' open' : '') + '>' +
      '<summary>失败记录 · ' + (state.failures || []).length + '</summary>' +
      '<div class="fail-list">' + rows + '</div></details>';
  }

  function modelStateHtml() {
    const cfg = SHT.llm.config();
    if (!cfg.key) return '<span class="model-pill is-off">模型未配置</span>';
    return '<span class="model-pill is-on">' + esc(cfg.model) + '</span>';
  }

  function renderPlanPanel() {
    const list = currentRound().questions;
    const exclusion = exclusionForCurrentRound();
    const projection = weaknessProjection();
    let body;
    if (!list.length) {
      body = '<div class="hint-box">这一轮还没写计划。点「模型出 ' + countFor(state.round) + ' 题」让它自己排；也可以自己排 ' + countFor(state.round) + ' 个角度。</div>';
    } else {
      body = '<div class="plan-head"><span>题号</span><span>考什么（写到错因）</span><span>题型</span><span>场景</span><span>考查层次</span><span>错项类型</span><span>挑错结果</span></div>' +
        '<div class="plan-table">' + list.map(function (q, i) {
          const no = i + 1;
          const blocked = exclusion.isCellBlocked(q.cell);
          return '<div class="plan-row' + (no === state.activeNo ? ' is-active' : '') + (blocked ? ' is-blocked' : '') + '" data-no="' + no + '">' +
            '<span class="no">' + no + '</span>' +
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
      : '上轮占用 ' + exclusion.usedCells.size + ' 个角度 · 本轮撞车 ' + blockedCount + ' 道';

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
              '<button type="button" class="btn" data-action="auto-quota">排 ' + countFor(state.round) + ' 个角度</button>' +
              '<button type="button" class="btn" data-action="fill-weakness">按薄弱点填</button>') +
        '</div>' +
      '</div>' +
      kpFoldHtml() + body + failFeedHtml();
  }

  /* ---------- 01 执行智能体：单题九字段 ---------- */
  function renderExecutePanel() {
    const q = currentQuestion();
    const list = currentRound().questions;
    if (!q) {
      $('agentPanel').innerHTML = '<div class="hint-box">这一轮还没有题。先去第 1 个角色「课程智能体」写计划。</div>';
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
        '<div class="field-row is-wide"><label>题目</label><textarea data-field="prompt" placeholder="只用本单元词表与句型">' + esc(q.prompt) + '</textarea></div>' +
        '<div class="field-row is-wide"><label>听力原文</label><input data-field="audioText" value="' + esc(q.audioText) + '" placeholder="非听力题留空"></div>' +
        '<div class="field-row is-wide"><label>选项</label><div class="opt-row">' +
          [0, 1, 2].map(function (i) {
            return '<input data-field="option" data-index="' + i + '" value="' + esc(q.options[i] || '') + '" placeholder="' + String.fromCharCode(65 + i) + '">';
          }).join('') + '</div></div>' +
        '<div class="field-row"><label>答案</label><input data-field="answer" value="' + esc(q.answer) + '"></div>' +
        '<div class="field-row"><label>质检</label><input value="' + esc(verdictOf(q)) + '" disabled></div>' +
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

  /* ---------- 01 验证智能体：四层，一次一层 ---------- */
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
      '</div>' +
      '<div class="hint-box" style="margin-bottom:8px">' + esc(layer.note) + '</div>' +
      layer.items.map(function (item) {
        const v = checks[item.id];
        return '<div class="check-row">' +
          '<span class="check-id">' + esc(item.id) + '</span>' +
          '<span class="check-text">' + esc(item.text) + '</span>' +
          '<span class="check-btns">' +
            '<button type="button" data-action="check" data-check="' + esc(item.id) + '" data-verdict="pass" class="' + (v === 'pass' ? 'is-pass' : '') + '">过</button>' +
            '<button type="button" data-action="check" data-check="' + esc(item.id) + '" data-verdict="fail" class="' + (v === 'fail' ? 'is-fail' : '') + '">挂</button>' +
          '</span></div>';
      }).join('');
  }

  function renderAgentPanel() {
    if (state.agent === 'course') renderPlanPanel();
    else if (state.agent === 'execute') renderExecutePanel();
    else renderVerifyPanel();
  }

  /* ---------- 02 答题：学生侧，从出题结果接到错题回边 ---------- */
  function practiceOf(round) {
    const r = round || currentRound();
    if (!r.practice) r.practice = blankPractice();
    return r.practice;
  }

  // 能作答的题：有题干、有答案、至少两个选项，且答案在选项里
  function practiceable(q) {
    const filled = (q.options || []).filter(function (o) { return String(o || '').trim(); });
    const answerInside = (q.options || []).some(function (o) {
      return SHT.normAnswer(o) === SHT.normAnswer(q.answer);
    });
    return !!String(q.prompt || '').trim() && !!String(q.answer || '').trim() && filled.length >= 2 && answerInside;
  }

  function practiceQuestions(round) {
    return (round || currentRound()).questions.filter(practiceable);
  }

  function activePracticeQuestion() {
    const p = practiceOf();
    if (p.pending) return p.pending;
    return practiceQuestions()[p.cursor] || null;
  }

  function attemptsOf(no) {
    return practiceOf().attempts.filter(function (a) { return a.no === no; });
  }

  function pointStateOf(q) { return SHT.judgePoint(attemptsOf(q.no)); }

  function roundPracticeSummary(round) {
    const p = (round && round.practice) || blankPractice();
    const out = { total: 0, tested: 0, mastered: 0, passed: 0, assisted: 0, fragile: 0, wrong: 0, unseen: 0, attempts: (p.attempts || []).length };
    practiceQuestions(round).forEach(function (q) {
      const st = SHT.judgePoint((p.attempts || []).filter(function (a) { return a.no === q.no; }));
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
        (p.pending ? '<span class="chip-variant">变体 · 同考点换答案</span>' : '') + '</span>' +
      '<span class="hint">' + esc(q.cell ? q.cell.type + ' / ' + q.cell.level : '') + '</span>' +
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

  function verdictHtml(q, p) {
    const r = p.revealed;
    const isVariant = r.stage === 'variant';
    let next = '';
    if (r.correct) {
      next = '<button type="button" class="btn btn-primary" data-action="next-step">换下一个考点</button>' +
        '<span class="verdict-note">' +
          (isVariant ? '换了答案还答对，这个考点算真会' : '这个考点算会用；换道题再答对才算真会') +
        '</span>';
    } else if (!isVariant && p.nextVariant) {
      next = '<button type="button" class="btn btn-primary" data-action="next-step">换一道同考点的变体再考</button>' +
        '<span class="verdict-note">' + esc(p.nextVariant.basis) + '</span>';
    } else if (!isVariant) {
      next = '<button type="button" class="btn btn-primary" data-action="next-step">写进错题，换下一个考点</button>' +
        '<span class="verdict-note">这种题型自动接不出变体，只能直接记错题</span>';
    } else {
      next = '<button type="button" class="btn btn-primary" data-action="next-step">写进错题，换下一个考点</button>' +
        '<span class="verdict-note">换了答案还是错，这个考点不写 mastered</span>';
    }
    return '<div class="verdict ' + (r.correct ? 'is-good' : 'is-bad') + '">' +
      '<div class="verdict-top">' +
        '<span class="verdict-badge">' + (r.correct ? '对了' : '错了') + '</span>' +
        '<span class="verdict-ans">你选 <b>' + esc(r.picked) + '</b>' +
          (r.correct ? '' : '　正确 <b>' + esc(r.expected) + '</b>') +
          (r.hintCount ? '　用了提示' : '') + '</span>' +
      '</div>' +
      (q.analysis ? '<div class="verdict-analysis">' + esc(q.analysis) + '</div>' : '') +
      '<div class="verdict-next">' + next + '</div>' +
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
    const st = pointStateOf(list[p.cursor] || q);

    $('practiceCard').innerHTML = '' +
      practiceHeadHtml(q, p) +
      '<div class="q-card">' +
        '<div class="q-kp">' + esc(q.knowledgePoint || '（未填知识点）') +
          (p.pending && p.pending.answerShift
            ? '<span class="chip-shift">答案 ' + esc(p.pending.answerShift) + '</span>' : '') +
          (r ? '　·　这个考点：' + esc(SHT.judgePoint(attemptsOf(q.no)).label) : '') + '</div>' +
        '<div class="q-prompt">' + esc(q.prompt) + '</div>' +
        (q.audioText
          ? '<div class="q-audio">' + (r ? '听力原文　' + esc(q.audioText) : '听力题 · 由测试者朗读，提交后显示原文') + '</div>'
          : '') +
        optionButtons(q, p) +
        (r ? verdictHtml(q, p) :
          '<div class="verdict-next">' +
            '<button type="button" class="btn btn-primary" data-action="submit-answer">提交</button>' +
            '<button type="button" class="btn" data-action="use-hint"' + (p.hintUsed ? ' disabled' : '') + '>提示：划掉一个错的</button>' +
            (st.state === 'unseen' ? '' : '<span class="verdict-note">当前判断：' + st.label + '</span>') +
          '</div>') +
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
        cell('真会（原题 + 变体都对）', s.mastered, 'is-good') +
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

  function submitAnswer() {
    const p = practiceOf();
    const q = activePracticeQuestion();
    if (!q || p.revealed) return;
    const ev = SHT.evaluateAnswer(q, p.picked);
    if (!ev.ok) { toast(ev.reason); return; }
    const stage = p.pending ? 'variant' : 'first';
    const kp = SHT.kpByLabel(q.knowledgePoint);
    p.attempts.push({
      no: q.no,
      stage: stage,
      kpId: kp ? kp.id : '',
      kpLabel: q.knowledgePoint || '',
      picked: ev.picked,
      expected: ev.expected,
      expectedIndex: ev.expectedIndex,
      correct: ev.correct,
      hintCount: p.hintUsed ? 1 : 0,
      at: new Date().toISOString()
    });
    p.revealed = p.attempts[p.attempts.length - 1];
    if (!ev.correct && stage === 'first') p.nextVariant = SHT.buildVariant(q, q.no);
    save(); renderAll();
  }

  function writeWrongFromPractice(q, first, last) {
    const kp = SHT.kpByLabel(q.knowledgePoint);
    // 首次错误证据冻结（主仓约定），变体那枪只写进错因说明，不覆盖首次作答
    const tail = last && last.stage === 'variant'
      ? '　换了一道同考点的变体还是错（选了「' + last.picked + '」，应为「' + last.expected + '」）。'
      : '';
    // 「只记住这道题」这一态：原题答对、换题面才错。这时还按首次作答记
    // studentAnswer，卡片上会出现「作答 name / 正确 name」这种看不出错在哪的记录。
    // 这种情况要把变体那枪的选择摆到台面上。
    const onlyVariantWrong = first.correct && last && last.stage === 'variant' && !last.correct;
    const res = SHT.upsertWrongCase(state.wrongCases, {
      studentId: SHT.sampleStudent.id,
      unitId: SHT.curriculum.hostUnitId,
      originalQuestionId: 'q' + q.no,
      kpId: kp ? kp.id : '',
      knowledgePoint: q.knowledgePoint || (kp ? kp.label : '未填写知识点'),
      ability: q.ability || (kp ? kp.ability : 'vocab'),
      category: kp ? kp.cause : '未掌握',
      errorCause: (onlyVariantWrong
        ? '原题答对，换题面就错了——他记住的是这道题，不是这个考点。'
        : (kp ? kp.why : '') + '　第一次选了「' + first.picked + '」，答案是「' + first.expected + '」。') + tail,
      questionSnapshot: q.prompt,
      studentAnswer: onlyVariantWrong ? last.picked : first.picked,
      correctAnswer: onlyVariantWrong ? last.expected : first.expected,
      hintCount: first.hintCount,
      at: first.at
    });
    state.wrongCases = res.list;
    toast(res.created ? '已写进 03 错题，出题要点和教材依据一起带过去' : '这个考点又错一次，错题状态已更新');
  }

  function practiceNext() {
    const p = practiceOf();
    const r = p.revealed;
    if (!r) return;
    const q = activePracticeQuestion();
    // 只在「原题错、且接得出变体」时留在原地换一道，其余都推进到下一个考点
    const goVariant = !r.correct && r.stage === 'first' && !!p.nextVariant;
    if (r.correct) {
      toast(r.stage === 'variant' ? '换了答案也答对，这个考点算真会' : '答对了，换下一个考点');
    } else if (goVariant) {
      p.pending = p.nextVariant;
      toast('换一道同考点的变体：' + p.nextVariant.basis);
    } else {
      const first = p.attempts.filter(function (a) { return a.stage === 'first'; })[0] || r;
      writeWrongFromPractice(q, first, r);
    }
    if (!goVariant) {
      p.cursor += 1;
      p.pending = null;
      p.nextVariant = null;
    }
    p.revealed = null;
    p.picked = null;
    p.hintUsed = false;
    p.hintGone = -1;
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
            '<span class="chip">' + esc(c.category) + '</span>' +
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
          '<div class="wrong-cause"><em>错因</em>　' + esc(c.errorCause) + '</div>' +
        '</div>' +
        '<div class="brief">' +
          '<div class="brief-title">出题要点</div>' +
          '<div class="brief-row"><span>知识点</span><span>' + esc(c.knowledgePoint) + '</span></div>' +
          '<div class="brief-row"><span>能力</span><span>' + esc(c.ability) + '</span></div>' +
          '<div class="brief-row"><span>错因</span><span>' + esc(c.category) + '</span></div>' +
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
      entries.push({ round: rn, kind: 'plan', title: '规划 ' + r.questions.length + ' 道', detail: cells + ' 个不重复角度' });
      r.questions.forEach(function (q, i) {
        const v = verdictOf(q);
        const fails = Object.keys(q.checks || {}).filter(function (k) { return q.checks[k] === 'fail'; });
        if (v === '待检') {
          entries.push({ round: rn, kind: '', title: '#' + (i + 1) + ' 待检', detail: esc(q.knowledgePoint || '未填写知识点') });
        } else if (v === '通过') {
          entries.push({ round: rn, kind: 'pass', title: '#' + (i + 1) + ' 通过', detail: esc(q.knowledgePoint || '') });
        } else {
          entries.push({
            round: rn, kind: 'reject', title: '#' + (i + 1) + ' 退回',
            detail: fails.map(function (f) { return '<code>' + esc(f) + '</code>'; }).join('') + ' ' + esc(checkText(fails[0]))
          });
        }
        // 这道题学生的作答紧跟在它后面，出题与作答在同一条线上，看得出因果
        (r.practice ? r.practice.attempts : []).filter(function (a) { return a.no === i + 1; })
          .forEach(function (a) {
            entries.push({
              round: rn, kind: 'answer',
              title: '#' + a.no + (a.stage === 'variant' ? ' 变体' : '') + (a.correct ? ' 答对' : ' 答错'),
              detail: (a.correct ? '' : '选 ' + esc(a.picked) + ' / 对 ' + esc(a.expected)) + (a.hintCount ? '　用了提示' : '')
            });
          });
      });
      if (r.closed) entries.push({ round: rn, kind: 'close', title: '第 ' + rn + ' 轮结束', detail: '' });
    });
    $('logCount').textContent = entries.length ? entries.length + ' 条' : '';
    $('logFeed').innerHTML = entries.length ? entries.map(function (e) {
      return '<div class="log-item">' +
        '<span class="log-round">R' + e.round + '</span>' +
        '<span class="log-dot' + (e.kind ? ' is-' + e.kind : '') + '"></span>' +
        '<div><div class="log-title">' + esc(e.title) + '</div>' +
          (e.detail ? '<div class="log-detail">' + e.detail + '</div>' : '') + '</div>' +
      '</div>';
    }).join('') : '<div class="chart-empty">暂无记录</div>';
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
    const set = new Set();
    [1, 2].forEach(function (rn) {
      state.rounds[rn].questions.forEach(function (q) { set.add(SHT.cellFingerprint(q.cell)); });
    });
    $('usedCount').textContent = set.size ? set.size + ' 个' : '';
    $('usedCells').innerHTML = set.size
      ? Array.from(set).map(function (c) { return '<span class="used-cell">' + esc(c.slice(-6)) + '</span>'; }).join('')
      : '<span class="chart-empty">暂无</span>';
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
      // 本轮考察范围与三个智能体各自的记忆，导出时一并留档（不含 key）
      kpScope: state.kpScope || [],
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
    if (box) box.textContent = '正在测试…';
    const res = await SHT.pipeline.selfCheck();
    if (box) {
      box.innerHTML = res.ok
        ? '连通正常 · ' + esc(res.model) + ' · ' + res.ms + ' ms · ' + (res.tokens || 0) + ' tokens'
        : '失败：<code>' + esc(res.type) + '</code> ' + esc(res.message);
    }
    renderAll();
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
    save();
    renderAll();

    const round = currentRound();
    const rounds = state.round === 2 ? [state.rounds[1], state.rounds[2]] : [state.rounds[1]];
    const brief = SHT.pipeline.buildBrief({
      unitId: state.unitId,
      rounds: rounds,
      wrongCases: state.wrongCases
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
        stage: { layer: state.learningLayer },
        attempts: (round.practice && round.practice.attempts) || [],
        existing: round.questions.filter(function (q) { return q.prompt; }),
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
        toast('出了 ' + res.questions.length + ' 题，' + (res.plans.length - res.questions.length) + ' 个格子没成，原因在失败记录里');
      } else if (res.ok && planOnly) {
        toast('规划好了 ' + res.plans.length + ' 条，格子已分配');
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
        if (action === 'auto-quota') { autoQuota(); return; }
        if (action === 'fill-weakness') { fillWeakness(); return; }
        if (action === 'pick-kp') { applyKnowledgePoint(b.dataset.id, state.activeNo, true); return; }
        if (action === 'toggle-scope') { toggleScope(b.dataset.id); return; }
        if (action === 'clear-scope') { state.kpScope = []; save(); renderAll(); toast('本轮不限知识点范围'); return; }
        if (action === 'q-nav') { state.activeNo = Number(b.dataset.no); save(); renderAll(); return; }
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
        save(); renderAll();
        return;
      }
      // 课程智能体计划表（带 data-no）：即时保存
      if (el.dataset.no) {
        const q = currentRound().questions[Number(el.dataset.no) - 1];
        if (!q) return;
        if (field === 'knowledgePoint') q[field] = el.value;
        else if (q.cell) q.cell[field] = el.value;
        save(); renderAll();
        return;
      }
      // 执行智能体九字段（不带 data-no）：只写内存，等「保存修改」按钮
      const q = currentQuestion();
      if (!q) return;
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
      if (action === 'next-step') { practiceNext(); return; }
      if (action === 'restart-practice') { restartPractice(); return; }
      if (action === 'goto-wrongbook') { state.tab = 'wrongbook'; save(); renderAll(); return; }
      if (action === 'goto-round2') { startRound2(); return; }
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

  bind();
  renderAll();
  save();
})(window);
