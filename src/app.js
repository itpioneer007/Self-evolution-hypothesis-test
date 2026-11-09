/*
 * 最小出题测试工作台 · 界面逻辑
 *
 * 定位：给人手工出题用的模板，不是自动出题器，后面才「注入灵魂」。
 * 界面只自动做三件事：分配不重复格子、记录检查结果、算三个指标。
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
      id: 'course', no: '环节 1', name: '课程智能体', tag: '命题规划',
      io: '输入：画像、错题、当前阶段、记忆库　→　输出：5 行配额表',
      desc: '决定这一轮练什么、各几题、落在哪个格子。<strong>题不一样，从这里开始</strong>：变化轴由规划指定，不靠生成模型自由发挥。'
    },
    {
      id: 'execute', no: '环节 2', name: '执行智能体', tag: '题目生成',
      io: '输入：配额与知识点　→　输出：单题九字段',
      desc: '一次只出一道题，只从本单元词表与句型表取材。<strong>不看画像、不看历史</strong>，这个隔离是刻意的。'
    },
    {
      id: 'verify', no: '环节 3', name: '验证智能体', tag: '独立质检',
      io: '输入：题目 + 词表 + 画像　→　输出：通过 / 退回 + 条款号',
      desc: '四层 23 条逐条二元判定，<strong>不听生成方自述</strong>。退回必须写明违反哪一条，那是记忆库最有价值的输入。'
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

  function renderPlanPanel() {
    const list = currentRound().questions;
    const exclusion = exclusionForCurrentRound();
    const projection = weaknessProjection();
    let body;
    if (!list.length) {
      body = '<div class="hint-box">本轮还没有配额。点「按变化轴分配格子」开始，或切回第 1 轮。</div>';
    } else {
      body = '<div class="plan-head"><span>题号</span><span>知识点（细到错因）</span><span>题型</span><span>情境</span><span>层次</span><span>干扰项</span><span>质检</span></div>' +
        '<div class="plan-table">' + list.map(function (q, i) {
          const no = i + 1;
          const blocked = exclusion.isCellBlocked(q.cell);
          return '<div class="plan-row' + (no === state.activeNo ? ' is-active' : '') + (blocked ? ' is-blocked' : '') + '" data-no="' + no + '">' +
            '<span class="no">' + no + '</span>' +
            '<input data-no="' + no + '" data-field="knowledgePoint" value="' + esc(q.knowledgePoint) + '" placeholder="知识点（细到错因）">' +
            '<select data-no="' + no + '" data-field="type">' + selectHtml(SHT.QUESTION_TYPES.map(function (t) { return t.id; }), q.cell.type) + '</select>' +
            '<select data-no="' + no + '" data-field="scene">' + selectHtml(SHT.SCENES, q.cell.scene) + '</select>' +
            '<select data-no="' + no + '" data-field="level">' + selectHtml(SHT.LEVELS, q.cell.level) + '</select>' +
            '<select data-no="' + no + '" data-field="distractor">' + selectHtml(SHT.DISTRACTORS, q.cell.distractor) + '</select>' +
            '<span class="verdict">' + esc(verdictOf(q)) + '</span>' +
            (blocked ? '<div class="blocked-note">与历史轮次撞格子：按记忆库规则应换角度</div>' : '') +
          '</div>';
        }).join('') + '</div>';
    }
    const note = state.round === 1
      ? '第 1 轮无历史记录。本轮结束后，格子与退回条款会写进记忆库。U1 话题域是 Our School，情境实际只开放「学校」。'
      : '记忆库已查：历史格子 ' + exclusion.usedCells.size + ' 个，本轮撞格子 ' + list.filter(function (q) { return exclusion.isCellBlocked(q.cell); }).length + ' 道，触顶（同考点同类题最多 2 次）' + list.filter(function (q) { return exclusion.isPointTypeFull(q); }).length + ' 道。';

    $('agentPanel').innerHTML = '' +
      '<div class="panel-toolbar">' +
        '<span class="hint">格子＝题型 / 情境 / 层次 / 干扰项。换措辞、换选项顺序都不算新题。</span>' +
        '<div class="toolbar-actions">' +
          '<button type="button" class="btn btn-primary" data-action="auto-quota">按变化轴分配格子</button>' +
          '<button type="button" class="btn" data-action="fill-weakness">取薄弱画像前 3 条</button>' +
        '</div>' +
      '</div>' + body +
      '<div class="hint-box' + (state.round === 2 ? ' is-warn' : '') + '" style="margin-top:14px">' + esc(note) +
        ' 薄弱画像当前有 ' + projection.remainingCount + ' 条待练知识点。</div>';
  }

  /* ---------- 01 执行智能体：单题九字段 ---------- */
  function renderExecutePanel() {
    const q = currentQuestion();
    const list = currentRound().questions;
    if (!q) {
      $('agentPanel').innerHTML = '<div class="hint-box">本轮还没有题目。先在「课程智能体」里分配格子。</div>';
      return;
    }
    const c = q.cell;
    $('agentPanel').innerHTML = '' +
      '<div class="panel-toolbar"><span class="hint">一次只出一道题。位置由顶栏单元 + 题号承载；格子由规划指定，这里只读。</span></div>' +
      '<div class="q-nav">' + list.map(function (_, i) {
        const no = i + 1;
        const cls = (no === state.activeNo ? ' is-active' : '') + (verdictOf(list[i]) === '退回' ? ' is-failed' : '');
        return '<button type="button" data-action="q-nav" data-no="' + no + '" class="' + cls.trim() + '">' + no + '</button>';
      }).join('') + '</div>' +
      '<div class="field-grid">' +
        '<div class="field-row is-wide"><label>格子标记（去重身份，去规划里改）</label><span class="cell-badge">' +
          esc(c.type) + ' / ' + esc(c.scene) + ' / ' + esc(c.level) + ' / ' + esc(c.distractor) + '</span></div>' +
        '<div class="field-row"><label>知识点（颗粒度到错因）</label><input data-field="knowledgePoint" value="' + esc(q.knowledgePoint) + '"></div>' +
        '<div class="field-row"><label>七类能力</label><input data-field="ability" value="' + esc(q.ability) + '"></div>' +
        '<div class="field-row is-wide"><label>题干</label><textarea data-field="prompt" placeholder="只用本单元词表和句型表">' + esc(q.prompt) + '</textarea></div>' +
        '<div class="field-row is-wide"><label>听力文本（无则留空；必须与题干问的是同一件事）</label><input data-field="audioText" value="' + esc(q.audioText) + '"></div>' +
        '<div class="field-row is-wide"><label>选项（三个须对应三种不同成因）</label><div class="opt-row">' +
          [0, 1, 2].map(function (i) {
            return '<input data-field="option" data-index="' + i + '" value="' + esc(q.options[i] || '') + '" placeholder="选项 ' + String.fromCharCode(65 + i) + '">';
          }).join('') + '</div></div>' +
        '<div class="field-row"><label>答案（唯一，可精确匹配）</label><input data-field="answer" value="' + esc(q.answer) + '"></div>' +
        '<div class="field-row"><label>质检结论（只读）</label><input value="' + esc(verdictOf(q)) + '" disabled></div>' +
        '<div class="field-row is-wide"><label>一句解析（错在哪 + 为什么 + 正确是什么，≤25 字）</label><textarea data-field="analysis">' + esc(q.analysis) + '</textarea></div>' +
        '<div class="field-row is-wide"><label>闭环层 L4：他错了，下一轮出什么（答不上来就不要出这道题）</label><textarea data-field="nextIfWrong" placeholder="答不上来就不要出这道题">' + esc(q.nextIfWrong) + '</textarea></div>' +
      '</div>' +
      '<details class="vocab-fold"><summary>本单元可用词（点击复制；超纲判定以此表 + 通用功能词白名单为准）</summary>' +
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
      '<div class="layer-switch">' + SHT.CHECK_LAYERS.map(function (l, i) {
        const bad = l.items.filter(function (it) { return checks[it.id] === 'fail'; }).length;
        return '<button type="button" data-action="layer" data-index="' + i + '" class="' + (i === state.checkLayer ? 'is-active' : '') + '">' +
          esc(l.name) + '<span class="cnt">' + l.items.length + ' 条' + (bad ? ' / 挂 ' + bad : '') + '</span></button>';
      }).join('') + '</div>' +
      '<div class="check-summary">' +
        '<span class="stat-pill">第 ' + state.activeNo + ' 题 · 已检 ' + done + '/' + SHT.ALL_CHECKS.length + '</span>' +
        '<span class="stat-pill ' + (failed.length ? 'is-bad' : (verdictOf(q) === '通过' ? 'is-good' : '')) + '">' +
          (failed.length ? '退回：' + esc(failed.join(' / ')) : (verdictOf(q) === '通过' ? '通过' : '暂无退回')) + '</span>' +
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
      '<details class="selfcheck"><summary>出完一道题，照着念十句</summary><ol>' +
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
      $('weaknessStrip').innerHTML = '<div class="hint-box">还没有错题，薄弱画像为空。可在下面记一条新错题。</div>';
      return;
    }
    $('weaknessStrip').innerHTML = p.items.slice(0, 3).map(function (item, i) {
      const cell = item.suggestedCell;
      return '<div class="weak-card' + (i === 0 ? ' is-top' : '') + '">' +
        '<div class="weak-label">' + esc(item.label) + '</div>' +
        '<div class="weak-meta">错 ' + item.errorCount + ' 次 · 提示/重试 ' + item.supportCount + ' 次 · 优先分 ' + item.priorityScore + ' · ' + esc(SHT.MASTERY_LABELS[item.status] || item.status) + '</div>' +
        '<div class="weak-cell">建议格子：<strong>' + esc(cell.type) + ' / ' + esc(cell.level) + ' / ' + esc(cell.distractor) + '</strong>（错因：' + esc(item.topCause) + '）</div>' +
        (i === 0 ? '<div class="weak-cell"><button type="button" class="btn btn-mini" data-action="apply-weak" data-key="' + esc(item.key) + '">填入配额</button></div>' : '') +
      '</div>';
    }).join('');
  }

  /* ---------- 02 错题案 ---------- */
  const NEXT_ACTIONS = [
    { value: 'wrong', label: '答错（无提示）' },
    { value: 'support', label: '答对，但用了提示或重试' },
    { value: 'clean', label: '答对，无提示无重试 → 已订正' },
    { value: 'cert-5', label: '独立认证 5/5 全对' },
    { value: 'cert-4', label: '独立认证 4/5' },
    { value: 'cert-3', label: '独立认证 ≤3/5' }
  ];

  function renderWrongList() {
    if (!state.wrongCases.length) {
      $('wrongList').innerHTML = '<div class="hint-box">还没有错题案。</div>';
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
          '<div class="wrong-ans">首次答案 <b>' + esc(c.studentAnswer) + '</b> → 正确答案 <b>' + esc(c.correctAnswer) + '</b>' +
            '<br>用时 ' + Math.round((c.firstAttemptEvidence.durationMs || 0) / 1000) + ' 秒 · 提示 ' + (c.firstAttemptEvidence.hintCount || 0) +
            ' 次 · 重试 ' + (c.firstAttemptEvidence.retryCount || 0) + ' 次' +
            '<br>后续作答 ' + attempts.length + ' 次，其中答对 ' + corrected + ' 次' +
            (c.certificationScore != null ? ' · 认证分 ' + c.certificationScore : '') + '</div>' +
        '</div>' +
        '<div class="wrong-cause">错因：' + esc(c.errorCause) + '</div>' +
        '<div class="wrong-foot">' +
          '<span class="wrong-meta">' + esc(c.id) + '</span>' +
          '<div class="wrong-actions">' +
            '<select data-attempt-field="next" data-index="' + idx + '">' + NEXT_ACTIONS.map(function (a) {
              return '<option value="' + a.value + '">' + esc(a.label) + '</option>';
            }).join('') + '</select>' +
            '<button type="button" class="btn btn-mini" data-action="record-attempt" data-index="' + idx + '">记录</button>' +
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
      '<div><label>知识点（细到错因）</label><input data-new="knowledgePoint" placeholder="如 vocab · class / classroom 形近"></div>' +
      '<div><label>七类能力</label><select data-new="ability">' + selectHtml(SHT.SKILL_CATEGORIES, 'vocab') + '</select></div>' +
      '<div><label>首次答案</label><input data-new="studentAnswer" placeholder="学生选了什么"></div>' +
      '<div><label>正确答案</label><input data-new="correctAnswer" placeholder="唯一答案"></div>' +
      '<div><label>错因分类（结构化，补充项）</label><select data-new="category">' + selectHtml(SHT.ERROR_CAUSES.map(function (c) { return c.id; }), '未掌握') + '</select></div>' +
      '<div><label>提示 / 重试次数（逗号分隔）</label><input data-new="support" placeholder="0,0"></div>' +
      '<div class="is-wide"><label>原题快照</label><input data-new="questionSnapshot" placeholder="题干"></div>' +
      '<div class="is-wide"><label>错因说明（自由文本，借鉴主仓）</label><input data-new="errorCause" placeholder="他为什么错"></div>' +
      '<div class="form-actions"><button type="button" class="btn btn-primary" data-action="add-wrong">保存错题案</button>' +
        '<span class="form-note">同一知识点 + 同一学生只存一条，后续作答走上面的「记录」。</span></div>';
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
      '<div class="metric-card"><div class="metric-label">格子重合率</div>' +
        '<div class="metric-value ' + (overlap !== null && overlap > 1 ? 'is-bad' : '') + '">' + (overlap === null ? '—' : overlap + '/5') + '</div>' +
        '<div class="metric-note">合格线 ≤1/5；≥3/5 说明变化轴或记忆库没起作用</div></div>' +
      '<div class="metric-card"><div class="metric-label">两轮退回趋势</div>' +
        '<div class="metric-value ' + (r1 !== null && r2 !== null && r2 >= r1 ? 'is-warn' : '') + '">' +
          (r1 === null || r2 === null ? '待第 2 轮' : r1 + ' → ' + r2) + '</div>' +
        '<div class="metric-note">第 2 轮应低于第 1 轮，否则退回原因码没被用上</div></div>' +
      '<div class="metric-card"><div class="metric-label">是否提前结束</div>' +
        '<div class="metric-value">' + (early ? '是' : '否') + '</div>' +
        '<div class="metric-note">两轮都凑满 5 道，说明停止判据没落地</div></div>';
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
      '<div class="mem-row"><span>已存通过 / 退回的题</span><span>' + passed + ' / ' + rejected + '</span></div>' +
      '<div class="mem-row"><span>历史格子（下一轮排除用）</span><span>' + exclusion.usedCells.size + '</span></div>' +
      '<div class="mem-row"><span>同一考点同类题触顶</span><span>' + (currentRound().questions || []).filter(function (q) { return exclusion.isPointTypeFull(q); }).length + '</span></div>' +
      '<div class="mem-row"><span>本轮撞格子</span><span>' + (currentRound().questions || []).filter(function (q) { return exclusion.isCellBlocked(q.cell); }).length + '</span></div>' +
      '<div class="mem-list"><strong>退回条款号</strong><br>' +
        (codes.length ? codes.map(function (c) { return '<code>' + esc(c) + ' ×' + failCodes[c] + '</code>'; }).join('') : '<span class="empty-note">暂无退回记录。记「挂了」没用，要记挂在第几条。</span>') + '</div>' +
      '<div class="mem-list"><strong>排除清单（格子指纹后 6 位）</strong><br>' +
        (allCells.size ? Array.from(allCells).map(function (c) { return '<code>' + esc(c) + '</code>'; }).join('') : '<span class="empty-note">空</span>') + '</div>';
  }

  /* ---------- 03 停止决策 ---------- */
  const STOP_SIGNALS = [
    { id: 'SATURATED', label: '够了（SATURATED）', note: '同一知识点连续三次全对，不需要再练' },
    { id: 'STALLED', label: '卡住（STALLED）', note: '连续两轮卡在同一条，换角度或转人工，不继续凑题' }
  ];

  function renderStop() {
    const round = currentRound();
    $('stopPanel').innerHTML = '' +
      STOP_SIGNALS.map(function (s) {
        return '<label class="stop-rule" style="cursor:pointer">' +
          '<input type="checkbox" data-stop="' + s.id + '"' + (round.stopSignals.indexOf(s.id) >= 0 ? ' checked' : '') + '>' +
          '<span><strong>' + esc(s.label) + '</strong><small>' + esc(s.note) + '</small></span></label>';
      }).join('') +
      '<div class="stop-field"><label>停止依据（必填，否则不算判据落地）</label>' +
        '<input data-stop-reason value="' + esc(round.endReason || '') + '" placeholder="如：classroom 连续三次全对，本轮只出 3 道即收"></div>' +
      '<div class="stop-actions">' +
        '<button type="button" class="btn btn-primary" data-action="next-round">' +
          (state.round === 1 ? '结束本轮，进入第 2 轮' : '查看两轮结论') + '</button>' +
        '<span class="form-note">第 2 轮会先查记忆库排除历史格子，保留知识点、清空题面。</span>' +
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
    $('footStatus').textContent = '第 ' + state.round + ' 轮 · 学生 ' + SHT.sampleStudent.id + ' · ' + SHT.curriculum.hostUnitId +
      ' ' + SHT.curriculum.title + ' · 数据仅存本机浏览器';
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
    toast('已分配 5 个不重复格子；题目内容需按新格子核对或重出');
  }

  function fillWeakness() {
    const queue = weaknessProjection().queue.slice(0, 3);
    if (!queue.length) { toast('薄弱画像为空，先去「错题记录」记一条'); return; }
    const list = currentRound().questions;
    if (!list.length) { toast('先分配格子'); return; }
    queue.forEach(function (item, i) {
      if (!list[i]) return;
      list[i].knowledgePoint = item.label;
      list[i].cell = SHT.suggestCell(item.topCause, SHT.curriculum.topicDomain);
    });
    save(); renderAll();
    toast('已把前 ' + Math.min(queue.length, list.length) + ' 条薄弱点连同建议格子写入配额');
  }

  function applyWeak(key) {
    const item = weaknessProjection().items.filter(function (i) { return i.key === key; })[0];
    if (!item) return;
    const list = currentRound().questions;
    if (!list.length) { toast('先分配格子'); return; }
    const slot = list.filter(function (q) { return !q.knowledgePoint; })[0] || list[0];
    slot.knowledgePoint = item.label;
    slot.cell = item.suggestedCell;
    state.tab = 'agents';
    state.agent = 'course';
    save(); renderAll();
    toast('已写入配额：' + item.label);
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
      toast('认证 ' + result.score + '/' + result.threshold + ' 分：' + result.reason);
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
      toast('已记录，状态 → ' + label + (action === 'support' ? '（用了提示，不算订正）' : ''));
    }
    save(); renderAll();
  }

  function addWrongCase() {
    const get = function (name) {
      const el = document.querySelector('[data-new="' + name + '"]');
      return el ? el.value.trim() : '';
    };
    const kp = get('knowledgePoint');
    if (!kp) { toast('知识点不能为空'); return; }
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
    toast('已新增错题案，薄弱画像已重算');
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
    toast('记录已导出，可直接对照 最小测试记录表.md');
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
        if (!window.confirm('结束第 1 轮并进入第 2 轮？第 2 轮会先查记忆库，自动排除第 1 轮用过的格子。')) return;
        state.rounds[1].closed = true;
        startRound2();
        toast('第 2 轮已按记忆库排除历史格子；知识点保留，内容需按新格子重出');
      } else {
        const overlap = overlapCount();
        const r1 = countFailed(state.rounds[1]);
        const r2 = countFailed(state.rounds[2]);
        toast('两轮结论：格子重合 ' + (overlap === null ? '—' : overlap + '/5') +
          '，退回 ' + (r1 === null ? '—' : r1) + ' → ' + (r2 === null ? '—' : r2) +
          '。样本仅够看方向，不能证明效果。');
      }
    });

    $('exportBtn').addEventListener('click', exportJSON);

    $('resetBtn').addEventListener('click', function () {
      if (!window.confirm('重置全部两轮数据、错题案与停止记录？此操作不可撤销。')) return;
      try { localStorage.removeItem(STORAGE_KEY); } catch (err) { /* ignore */ }
      state = defaultState();
      state.rounds[1].questions = cloneSample();
      save(); renderAll();
      toast('已重置为示例数据');
    });
  }

  bind();
  renderAll();
  save();
})(window);
