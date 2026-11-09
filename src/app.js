/*
 * 最小出题测试工作台 · 界面逻辑
 *
 * 定位：给人手工出题用的模板，不是自动出题器，后面才「注入灵魂」。
 * 界面只自动做四件事：排不重复的出题角度、从静态候选清单确定性带出 4 项、记录检查结果、算三个指标。
 * 题目内容由人按格子填写 —— 对应出题手册「最小测试全手工」的口径。
 *
 * 三个 tab 按流程切分：
 *   01 三个智能体   = 环节 1/2/3（课程规划 / 执行生成 / 验证质检），一次只显示一个角色
 *   02 错题记录     = 学生侧回边：作答 → 错因 → 薄弱画像 → 规划
 *   03 记忆库与停止 = 环节 4/5，含跨轮事前排除与停止决策
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

  function cloneSample() {
    return SHT.sampleQuestions.map(function (q) {
      return Object.assign({}, q, {
        cell: Object.assign({}, q.cell),
        options: q.options.slice(),
        checks: {}
      });
    });
  }

  function cloneWrongCases() {
    return SHT.sampleWrongCases.map(function (c) {
      return Object.assign({}, c, {
        firstAttemptEvidence: Object.assign({}, c.firstAttemptEvidence),
        variantAttempts: c.variantAttempts.map(function (a) { return Object.assign({}, a); })
      });
    });
  }

  function blankRound() {
    return { questions: [], stopSignals: [], endReason: '', closed: false };
  }

  function defaultState() {
    return {
      version: 2,
      tab: 'agents',
      agent: 'course',
      checkLayer: 0,
      round: 1,
      activeNo: 1,
      learningLayer: SHT.sampleLearningLayer || 'B',
      rounds: { 1: blankRound(), 2: blankRound() },
      wrongCases: cloneWrongCases()
    };
  }

  function normalizeState(parsed) {
    if (!parsed.wrongCases) parsed.wrongCases = cloneWrongCases();
    if (!parsed.rounds[2]) parsed.rounds[2] = blankRound();
    ['1', '2'].forEach(function (k) {
      const r = parsed.rounds[k] = Object.assign(blankRound(), parsed.rounds[k] || {});
      if (!Array.isArray(r.stopSignals)) r.stopSignals = [];
      // v1 用单个 endedEarly 布尔，迁移成停止信号 + 依据
      if (r.endedEarly && !r.stopSignals.length) r.stopSignals.push('SATURATED');
      delete r.endedEarly;
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
  if (!state.rounds[1].questions.length) state.rounds[1].questions = cloneSample();

  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (err) { /* 隐私模式下忽略 */ }
  }

  function currentRound() { return state.rounds[state.round]; }
  function currentQuestion() { return currentRound().questions[state.activeNo - 1] || null; }

  function verdictOf(q) {
    if (!q) return '待检';
    const values = Object.keys(q.checks || {}).map(function (k) { return q.checks[k]; });
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

  /* ---------- 角色定义 ---------- */
  const ROLES = [
    {
      id: 'course', no: '环节 1', name: '课程智能体', tag: '写出题计划',
      io: '定这 5 道题各考什么、出成什么样 → 得到一张计划表',
      desc: '先把要练什么、每道题用什么题型和场景定下来。<strong>题会不会重复，在这一步就决定了</strong>，不是靠写题时换说法。'
    },
    {
      id: 'execute', no: '环节 2', name: '执行智能体', tag: '写出题目',
      io: '照计划一次写一道 → 得到题干、选项、答案、讲解',
      desc: '一次只写一道，只用本单元学过的词和句型。<strong>故意不看学生画像、不看上轮出了什么</strong>，防止写题的人自己偷懒照抄。'
    },
    {
      id: 'verify', no: '环节 3', name: '验证智能体', tag: '逐条挑错',
      io: '拿 23 条清单逐条打「过 / 挂」 → 得到通过或退回',
      desc: '<strong>不听写题的人自己说好不好</strong>。挂在哪一条要记下来，那是下一轮最有用的信息。'
    }
  ];

  function renderRoleRow() {
    $('roleRow').innerHTML = ROLES.map(function (r) {
      return '<button type="button" class="role-card' + (state.agent === r.id ? ' is-active' : '') + '" data-role="' + r.id + '">' +
        '<div class="role-card-top"><span class="role-name">' + esc(r.name) + '</span><span class="role-no">' + esc(r.no) + '</span></div>' +
        '<div class="role-io">' + esc(r.io) + '</div>' +
        '<span class="role-tag">' + esc(r.tag) + '</span>' +
      '</button>';
    }).join('');
    const role = ROLES.filter(function (r) { return r.id === state.agent; })[0];
    $('roleDesc').innerHTML = role.desc;
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

  function kpSelectHtml() {
    return '<option value="">从候选中挑一个…</option>' +
      SHT.KP_GROUPS.map(function (g) {
        return '<optgroup label="' + esc(g.name) + '">' +
          SHT.KNOWLEDGE_POINTS.filter(function (k) { return k.group === g.id; }).map(function (k) {
            return '<option value="' + esc(k.id) + '">' + esc(k.label) + '</option>';
          }).join('') + '</optgroup>';
      }).join('');
  }

  function kpFoldHtml() {
    return '<details class="kp-fold"><summary>不知道填什么？从这 12 个候选知识点里挑（点「用这个」会一次带出 4 项）</summary>' +
      '<div class="kp-current">当前是第 ' + state.activeNo + ' 题。带出来的内容都能改，这只是起点，不是自动出题。</div>' +
      SHT.KP_GROUPS.map(function (g) {
        return '<div class="kp-group"><div class="kp-group-head"><strong>' + esc(g.name) + '</strong>' +
          '<span>' + esc(g.note) + '</span></div>' +
          SHT.KNOWLEDGE_POINTS.filter(function (k) { return k.group === g.id; }).map(function (k) {
            return '<div class="kp-item">' +
              '<div class="kp-main"><span class="kp-label">' + esc(k.label) + '</span>' +
                '<button type="button" class="btn btn-mini" data-action="pick-kp" data-id="' + esc(k.id) + '">用这个</button></div>' +
              '<div class="kp-why">' + esc(k.why) + '　<span>依据：' + esc(k.source) + '</span></div>' +
              '<div class="kp-meta">建议出题角度：' + esc(k.cell.type) + ' / ' + esc(k.cell.level) + ' / ' + esc(k.cell.distractor) +
                '　·　可以这样问：' + esc(k.example) + '</div>' +
            '</div>';
          }).join('') + '</div>';
      }).join('') + '</details>';
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

  function renderPlanPanel() {
    const list = currentRound().questions;
    const exclusion = exclusionForCurrentRound();
    const projection = weaknessProjection();
    let body;
    if (!list.length) {
      body = '<div class="hint-box">这一轮还没写计划。点右上「帮我排 5 个不重复的出题角度」开始；也可以切回第 1 轮。</div>';
    } else {
      body = '<div class="plan-head"><span>第几题</span><span>考什么（写到错因）</span><span>题型</span><span>场景</span><span>考查层次</span><span>错项类型</span><span>挑错结果</span></div>' +
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
    const note = state.round === 1
      ? '第 1 轮没有上轮记录可查。这轮结束后，用过的出题角度、被退回时挂在第几条，都会存进第 3 页。本单元讲的是 Our School，场景只能用「学校」。'
      : '已查第 3 页的记录：上轮用过 ' + exclusion.usedCells.size + ' 个出题角度；这一轮有 ' + list.filter(function (q) { return exclusion.isCellBlocked(q.cell); }).length + ' 道撞了车（该换角度），' + list.filter(function (q) { return exclusion.isPointTypeFull(q); }).length + ' 道同一个考点出到上限（同类题最多 2 次）。';

    $('agentPanel').innerHTML = '' +
      '<div class="panel-lede"><strong>现在：写出题计划</strong>' +
        '<p>一行就是一道题。后面四个下拉框（题型＋场景＋考查层次＋错项类型）合起来叫「格子」，也就是这道题的出题角度。只换说法或换选项顺序，不算新题。</p>' +
        '<span>做完得到：一张 5 行的计划表，下一步照着它出题。</span></div>' +
      kpFoldHtml() +
      '<div class="panel-toolbar">' +
        '<span class="hint">「考什么」要细到他哪儿不会，别只写「词汇」。</span>' +
        '<div class="toolbar-actions">' +
          '<button type="button" class="btn btn-primary" data-action="auto-quota">帮我排 5 个不重复的出题角度</button>' +
          '<button type="button" class="btn" data-action="fill-weakness">用最该练的 3 个知识点填计划</button>' +
        '</div>' +
      '</div>' + body +
      '<div class="hint-box' + (state.round === 2 ? ' is-warn' : '') + '" style="margin-top:14px">' + esc(note) +
        ' 这个学生还有 ' + projection.remainingCount + ' 个知识点等着练。</div>';
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
      '<div class="panel-lede"><strong>现在：把第 ' + state.activeNo + ' 题写出来</strong>' +
        '<p>照计划里指定的出题角度写，只用本单元学过的词和句型，一次只写一道。上面的数字可以换题，写好的内容会自动存下来。</p>' +
        '<span>写完记得切到第 3 个角色「验证智能体」，逐条挑错。</span></div>' +
      '<div class="panel-toolbar"><span class="hint">单元和题号已在顶部；下面的出题角度由计划决定，在这里不能改。</span></div>' +
      '<div class="q-nav">' + list.map(function (_, i) {
        const no = i + 1;
        const cls = (no === state.activeNo ? ' is-active' : '') + (verdictOf(list[i]) === '退回' ? ' is-failed' : '');
        return '<button type="button" data-action="q-nav" data-no="' + no + '" class="' + cls.trim() + '">' + no + '</button>';
      }).join('') + '</div>' +
      '<div class="field-grid">' +
        '<div class="field-row is-wide"><label>这道题的出题角度（在第 1 个角色里改）</label><span class="cell-badge">' +
          esc(c.type) + ' / ' + esc(c.scene) + ' / ' + esc(c.level) + ' / ' + esc(c.distractor) + '</span></div>' +
        '<div class="field-row"><label>这题考什么（右边下拉可挑，也可以自己填）</label><div class="kp-inline">' +
          '<input data-field="knowledgePoint" value="' + esc(q.knowledgePoint) + '" placeholder="细到「他哪儿不会」">' +
          '<select data-kp-pick>' + kpSelectHtml() + '</select></div></div>' +
        '<div class="field-row"><label>属于哪类能力（词汇 / 拼写 / 句子 / 听力 / 口语 / 语音 / 语法）</label><input data-field="ability" value="' + esc(q.ability) + '"></div>' +
        '<div class="field-row is-wide"><label>题目（写给学生看的话）</label><textarea data-field="prompt" placeholder="只用本单元学过的词和句型">' + esc(q.prompt) + '</textarea></div>' +
        '<div class="field-row is-wide"><label>听力原文（不是听力题就留空；有则必须和题目问的是同一件事）</label><input data-field="audioText" value="' + esc(q.audioText) + '"></div>' +
        '<div class="field-row is-wide"><label>三个选项（三个错项要错在不同原因上）</label><div class="opt-row">' +
          [0, 1, 2].map(function (i) {
            return '<input data-field="option" data-index="' + i + '" value="' + esc(q.options[i] || '') + '" placeholder="选项 ' + String.fromCharCode(65 + i) + '">';
          }).join('') + '</div></div>' +
        '<div class="field-row"><label>正确答案（只能有一个）</label><input data-field="answer" value="' + esc(q.answer) + '"></div>' +
        '<div class="field-row"><label>挑错结果（自动显示，不能改）</label><input value="' + esc(verdictOf(q)) + '" disabled></div>' +
        '<div class="field-row is-wide"><label>一句话讲解（错在哪＋为什么＋正确的是什么，25 字内）</label><textarea data-field="analysis">' + esc(q.analysis) + '</textarea></div>' +
        '<div class="field-row is-wide"><label>闭环层 L4 · 如果他做错了，下轮该出什么题？（答不上来，这题就别出）</label><textarea data-field="nextIfWrong" placeholder="答不上来就不要出这道题">' + esc(q.nextIfWrong) + '</textarea></div>' +
      '</div>' +
      '<details class="vocab-fold"><summary>本单元学过的词（点一下复制；题目里出现表外的词就算超纲，please / now / look 这类通用词除外）</summary>' +
        '<div class="vocab-strip">' + SHT.curriculum.words.map(function (w) {
          return '<button type="button" class="vocab-chip" data-action="copy-word" data-word="' + esc(w.en) + '" title="' + esc(w.zh) + '">' + esc(w.en) + '</button>';
        }).join('') + '</div></details>';
  }

  /* ---------- 01 验证智能体：四层，一次一层 ---------- */
  function renderVerifyPanel() {
    const q = currentQuestion();
    const checks = (q && q.checks) || {};
    const done = Object.keys(checks).length;
    const failed = Object.keys(checks).filter(function (k) { return checks[k] === 'fail'; });
    const layer = SHT.CHECK_LAYERS[state.checkLayer] || SHT.CHECK_LAYERS[0];

    $('agentPanel').innerHTML = '' +
      '<div class="panel-lede"><strong>现在：给第 ' + state.activeNo + ' 题挑错</strong>' +
        '<p>四个层次一次看一层：题对不对 / 合不合这个学生 / 五题放一起像不像一套 / 他错了下轮出什么。每条只能选「过」或「挂」，不能写「基本可以」；挂＝这条不合格，题要重出，挂在第几条会被记下来。</p>' +
        '<span>做完得到：每道题是「通过」还是「退回」，以及挂在第几条。</span></div>' +
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
      }).join('') +
      '<details class="selfcheck"><summary>拿不准时，照这十句自查一遍</summary><ol>' +
        SHT.SELF_CHECK_TEN.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ol></details>';
  }

  function renderAgentPanel() {
    if (state.agent === 'course') renderPlanPanel();
    else if (state.agent === 'execute') renderExecutePanel();
    else renderVerifyPanel();
  }

  /* ---------- 02 薄弱画像 ---------- */
  function renderWeakness() {
    const p = weaknessProjection();
    if (!p.items.length) {
      $('weaknessStrip').innerHTML = '<div class="hint-box">还没记过错题，所以排不出该练什么。在下面记一条就有了。</div>';
      return;
    }
    $('weaknessStrip').innerHTML = p.items.slice(0, 3).map(function (item, i) {
      const cell = item.suggestedCell;
      return '<div class="weak-card' + (i === 0 ? ' is-top' : '') + '">' +
        '<div class="weak-label">' + esc(item.label) + '</div>' +
        '<div class="weak-meta">错了 ' + item.errorCount + ' 次 · 用过提示/重试 ' + item.supportCount + ' 次 · 优先级 ' + item.priorityScore + ' 分 · ' + esc(SHT.MASTERY_LABELS[item.status] || item.status) + '</div>' +
        '<div class="weak-cell">下一轮建议这么出：<strong>' + esc(cell.type) + ' / ' + esc(cell.level) + ' / ' + esc(cell.distractor) + '</strong>（因为他 ' + esc(item.topCause) + '）</div>' +
        (i === 0 ? '<div class="weak-cell"><button type="button" class="btn btn-mini" data-action="apply-weak" data-key="' + esc(item.key) + '">写进第 1 页的计划</button></div>' : '') +
      '</div>';
    }).join('');
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
    if (!state.wrongCases.length) {
      $('wrongList').innerHTML = '<div class="hint-box">还没有记过错题。展开下面「记一条新错题」开始。</div>';
      return;
    }
    $('wrongList').innerHTML = state.wrongCases.map(function (c, idx) {
      const attempts = c.variantAttempts || [];
      const corrected = attempts.filter(function (a) { return a.correct; }).length;
      const statusLabel = SHT.MASTERY_LABELS[c.masteryState] || c.masteryState;
      const statusCls = c.masteryState === 'mastered' ? 'is-mastered' : (c.masteryState === 'teacher-help' ? 'is-alert' : '');
      return '<div class="wrong-card" data-index="' + idx + '">' +
        '<div class="wrong-head"><span class="wrong-kp">' + esc(c.knowledgePoint) + '</span>' +
          '<div class="wrong-tags">' +
            '<span class="chip">' + esc(c.ability) + '</span>' +
            '<span class="chip">' + esc(c.category) + '</span>' +
            '<span class="chip is-status ' + statusCls + '">' + esc(statusLabel) + '</span>' +
          '</div></div>' +
        '<div class="wrong-body">' +
          '<div class="wrong-q">' + esc(c.questionSnapshot) + '</div>' +
          '<div class="wrong-ans">第一次选了 <b>' + esc(c.studentAnswer) + '</b>，正确答案是 <b>' + esc(c.correctAnswer) + '</b>' +
            '<br>花了 ' + Math.round((c.firstAttemptEvidence.durationMs || 0) / 1000) + ' 秒 · 看了 ' + (c.firstAttemptEvidence.hintCount || 0) +
            ' 次提示 · 重做 ' + (c.firstAttemptEvidence.retryCount || 0) + ' 次' +
            '<br>之后又做了 ' + attempts.length + ' 次，答对 ' + corrected + ' 次' +
            (c.certificationScore != null ? ' · 独立验证 ' + c.certificationScore + ' 分' : '') + '</div>' +
        '</div>' +
        '<div class="wrong-cause">他为什么错：' + esc(c.errorCause) + '</div>' +
        '<div class="wrong-foot">' +
          '<span class="wrong-meta">同一个知识点只记这一条，后面重做都补在下面</span>' +
          '<div class="wrong-actions">' +
            '<select data-attempt-field="next" data-index="' + idx + '">' + NEXT_ACTIONS.map(function (a) {
              return '<option value="' + a.value + '">' + esc(a.label) + '</option>';
            }).join('') + '</select>' +
            '<button type="button" class="btn btn-mini" data-action="record-attempt" data-index="' + idx + '">记下这次</button>' +
          '</div>' +
        '</div>' +
      '</div>';
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
    const r1 = countFailed(state.rounds[1]);
    const r2 = countFailed(state.rounds[2]);
    const overlap = overlapCount();
    const early = endedEarly(currentRound());
    $('metrics').innerHTML = '' +
      '<div class="metric-card"><div class="metric-label">两轮出题角度重复了几道</div>' +
        '<div class="metric-value ' + (overlap !== null && overlap > 1 ? 'is-bad' : '') + '">' + (overlap === null ? '—' : overlap + '/5') + '</div>' +
        '<div class="metric-note">5 道里最多重 1 道算合格；重 3 道以上，说明「先查上轮再出」没做到</div></div>' +
      '<div class="metric-card"><div class="metric-label">被退回的题有没有变少</div>' +
        '<div class="metric-value ' + (r1 !== null && r2 !== null && r2 >= r1 ? 'is-warn' : '') + '">' +
          (r1 === null || r2 === null ? '等第 2 轮' : r1 + ' → ' + r2) + '</div>' +
        '<div class="metric-note">第 2 轮应该更少；没少，说明上轮「挂在哪一条」白记了</div></div>' +
      '<div class="metric-card"><div class="metric-label">有没有该停就停</div>' +
        '<div class="metric-value">' + (early ? '是' : '否') + '</div>' +
        '<div class="metric-note">两轮都硬凑满 5 道，就是没真正判断过要不要停</div></div>';
  }

  /* ---------- 03 记忆库 ---------- */
  function renderMemory() {
    const exclusion = exclusionForCurrentRound();
    const rounds = [state.rounds[1], state.rounds[2]].filter(function (r) { return r.questions.length; });
    const failCodes = {};
    let passed = 0, rejected = 0;
    rounds.forEach(function (r) {
      r.questions.forEach(function (q) {
        const v = verdictOf(q);
        if (v === '通过') passed += 1;
        if (v === '退回') rejected += 1;
        Object.keys(q.checks || {}).forEach(function (id) {
          if (q.checks[id] === 'fail') failCodes[id] = (failCodes[id] || 0) + 1;
        });
      });
    });
    const codes = Object.keys(failCodes);
    const allCells = new Set();
    rounds.forEach(function (r) {
      r.questions.forEach(function (q) { allCells.add(SHT.cellFingerprint(q.cell).slice(-6)); });
    });
    $('memoryPanel').innerHTML = '' +
      '<div class="mem-row"><span>已记下：合格 / 要重出的题</span><span>' + passed + ' / ' + rejected + '</span></div>' +
      '<div class="mem-row"><span>上轮用过的出题角度（第 2 轮要避开）</span><span>' + exclusion.usedCells.size + '</span></div>' +
      '<div class="mem-row"><span>同一个考点出到上限（同类题最多 2 次）</span><span>' + (currentRound().questions || []).filter(function (q) { return exclusion.isPointTypeFull(q); }).length + '</span></div>' +
      '<div class="mem-row"><span>这一轮和上轮撞了车</span><span>' + (currentRound().questions || []).filter(function (q) { return exclusion.isCellBlocked(q.cell); }).length + '</span></div>' +
      '<div class="mem-list"><strong>被退回时挂在哪几条（次数）</strong><br>' +
        (codes.length ? codes.map(function (c) { return '<code>' + esc(c) + ' ×' + failCodes[c] + '</code>'; }).join('') : '<span class="empty-note">还没有退回记录。只记「不合格」不够，要记下挂在第几条。</span>') + '</div>' +
      '<div class="mem-list"><strong>第 2 轮要避开的组合编号（短码）</strong><br>' +
        (allCells.size ? Array.from(allCells).map(function (c) { return '<code>' + esc(c) + '</code>'; }).join('') : '<span class="empty-note">还没有</span>') + '</div>';
  }

  /* ---------- 03 停止决策 ---------- */
  const STOP_SIGNALS = [
    { id: 'SATURATED', label: '会了，不用再练（够了 / SATURATED）', note: '同一个知识点连续三次都做对' },
    { id: 'STALLED', label: '一直卡住，换个办法（卡住 / STALLED）', note: '连续两轮都挂在同一个问题上，换出题角度或交给老师，别再凑题' }
  ];

  function renderStop() {
    const round = currentRound();
    $('stopPanel').innerHTML = '' +
      STOP_SIGNALS.map(function (s) {
        return '<label class="stop-rule" style="cursor:pointer">' +
          '<input type="checkbox" data-stop="' + s.id + '"' + (round.stopSignals.indexOf(s.id) >= 0 ? ' checked' : '') + '>' +
          '<span><strong>' + esc(s.label) + '</strong><small>' + esc(s.note) + '</small></span></label>';
      }).join('') +
      '<div class="stop-field"><label>为什么可以停（必须写，光勾选不算）</label>' +
        '<input data-stop-reason value="' + esc(round.endReason || '') + '" placeholder="如：classroom 连续三次全对，本轮只出 3 道就收"></div>' +
      '<div class="stop-actions">' +
        '<button type="button" class="btn btn-primary" data-action="next-round">' +
          (state.round === 1 ? '第 1 轮做完，开始第 2 轮' : '看看两轮的结果') + '</button>' +
        '<span class="form-note">第 2 轮会先避开上轮用过的出题角度，知识点保留，题目内容要重写。</span>' +
      '</div>';
  }

  /* ---------- 总渲染 ---------- */
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
    renderRoleRow();
    renderAgentPanel();
    renderWeakness();
    renderWrongList();
    renderAddWrongForm();
    renderMetrics();
    renderMemory();
    renderStop();
    $('footStatus').textContent = '第 ' + state.round + ' 轮 · 学生 ' + SHT.sampleStudent.id + ' · 单元 ' + SHT.curriculum.hostUnitId +
      '（' + SHT.curriculum.title + '）· 数据只存在这台电脑的浏览器里';
  }

  /* ---------- 动作 ---------- */
  function startRound2() {
    const exclusion = SHT.buildExclusionList([state.rounds[1]]);
    const cells = generateCells(5, exclusion);
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
      stopSignals: [], endReason: '', closed: false
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
    const cells = generateCells(5, exclusion);
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
    toast('已排好 5 个不重复的出题角度；题目内容要照新角度检查或重写');
  }

  function fillWeakness() {
    const queue = weaknessProjection().queue.slice(0, 3);
    if (!queue.length) { toast('还没有该练的知识点，先去第 2 页记一条错题'); return; }
    const list = currentRound().questions;
    if (!list.length) { toast('先在第 1 页排好出题角度'); return; }
    queue.forEach(function (item, i) {
      if (!list[i]) return;
      list[i].knowledgePoint = item.label;
      list[i].cell = SHT.suggestCell(item.topCause, SHT.curriculum.topicDomain);
    });
    save(); renderAll();
    toast('已把最该练的 ' + Math.min(queue.length, list.length) + ' 个知识点和建议的出题角度写进计划');
  }

  function applyWeak(key) {
    const item = weaknessProjection().items.filter(function (i) { return i.key === key; })[0];
    if (!item) return;
    const list = currentRound().questions;
    if (!list.length) { toast('先在第 1 页排好出题角度'); return; }
    const slot = list.filter(function (q) { return !q.knowledgePoint; })[0] || list[0];
    slot.knowledgePoint = item.label;
    slot.cell = item.suggestedCell;
    state.tab = 'agents';
    state.agent = 'course';
    save(); renderAll();
    toast('已写进第 1 页的计划：' + item.label);
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
    const payload = {
      exportedAt: new Date().toISOString(),
      unit: SHT.curriculum.hostUnitId,
      student: SHT.sampleStudent.id,
      learningLayer: state.learningLayer,
      indicators: {
        overlap: overlapCount(),
        round1Failed: countFailed(state.rounds[1]),
        round2Failed: countFailed(state.rounds[2]),
        round1EndedEarly: endedEarly(state.rounds[1]),
        round2EndedEarly: endedEarly(state.rounds[2])
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

  /* ---------- 事件（全部委托，重渲染不会重复绑定） ---------- */
  function bind() {
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

    $('roleRow').addEventListener('click', function (e) {
      const b = e.target.closest('button[data-role]');
      if (!b) return;
      state.agent = b.dataset.role; save(); renderAll();
    });

    $('agentPanel').addEventListener('click', function (e) {
      const b = e.target.closest('[data-action]');
      if (b) {
        const action = b.dataset.action;
        if (action === 'auto-quota') { autoQuota(); return; }
        if (action === 'fill-weakness') { fillWeakness(); return; }
        if (action === 'pick-kp') { applyKnowledgePoint(b.dataset.id, state.activeNo, true); return; }
        if (action === 'q-nav') { state.activeNo = Number(b.dataset.no); save(); renderAll(); return; }
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
      if (el.dataset.kpPick !== undefined) {
        if (el.value) applyKnowledgePoint(el.value, state.activeNo, false);
        return;
      }
      const field = el.dataset.field;
      if (!field) return;
      if (el.dataset.no) {
        const q = currentRound().questions[Number(el.dataset.no) - 1];
        if (!q) return;
        if (field === 'knowledgePoint') q[field] = el.value;
        else if (q.cell) q.cell[field] = el.value;
      } else {
        const q = currentQuestion();
        if (!q) return;
        if (field === 'option') q.options[Number(el.dataset.index)] = el.value;
        else q[field] = el.value;
      }
      save(); renderAll();
    });

    $('agentPanel').addEventListener('input', function (e) {
      const el = e.target;
      const field = el.dataset.field;
      if (!field || el.dataset.no || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') return;
      const q = currentQuestion();
      if (!q) return;
      if (field === 'option') q.options[Number(el.dataset.index)] = el.value;
      else q[field] = el.value;
      save();
    });

    $('weaknessStrip').addEventListener('click', function (e) {
      const b = e.target.closest('[data-action="apply-weak"]');
      if (b) applyWeak(b.dataset.key);
    });

    $('wrongList').addEventListener('click', function (e) {
      const b = e.target.closest('[data-action="record-attempt"]');
      if (!b) return;
      const idx = Number(b.dataset.index);
      const sel = document.querySelector('[data-attempt-field="next"][data-index="' + idx + '"]');
      recordAttempt(idx, sel ? sel.value : 'wrong');
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
        toast('两轮结果：出题角度重复 ' + (overlap === null ? '—' : overlap + '/5') +
          '，被退回的题 ' + (r1 === null ? '—' : r1) + ' → ' + (r2 === null ? '—' : r2) +
          '。样本小，只够看方向。');
      }
    });

    $('exportBtn').addEventListener('click', exportJSON);

    $('resetBtn').addEventListener('click', function () {
      if (!window.confirm('清空两轮题目、错题和停止记录？不能撤销。')) return;
      try { localStorage.removeItem(STORAGE_KEY); } catch (err) { /* ignore */ }
      state = defaultState();
      state.rounds[1].questions = cloneSample();
      save(); renderAll();
      toast('已恢复成初始示例');
    });
  }

  bind();
  renderAll();
  save();
})(window);
