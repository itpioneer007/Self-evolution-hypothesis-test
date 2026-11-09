/*
 * 最小出题测试工作台 · 界面逻辑
 *
 * 定位：这是给人手工出题用的工作台，不是自动出题器。
 * 自动化的只有三件事：格子分配、四层检查记录、两轮指标统计。
 * 题目内容由人按格子填写 —— 对应出题手册「最小测试全手工」的口径。
 *
 * 数据只写 localStorage（实验数据，不涉及真实学生信息）。
 */
(function (root) {
  const SHT = root.SHT;
  const STORAGE_KEY = 'sht-minimal-test-v1';
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

  function blankRound() {
    return { questions: [], endedEarly: false, endReason: '', closed: false };
  }

  function defaultState() {
    return {
      round: 1,
      activeNo: 1,
      rounds: { 1: blankRound(), 2: blankRound() }
    };
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      const parsed = JSON.parse(raw);
      if (!parsed || !parsed.rounds || !parsed.rounds[1]) return defaultState();
      return parsed;
    } catch (err) {
      return defaultState();
    }
  }

  let state = loadState();
  if (!state.rounds[1].questions.length) {
    state.rounds[1].questions = cloneSample();
  }

  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (err) { /* 隐私模式下忽略 */ }
  }

  function currentRound() { return state.rounds[state.round]; }
  function currentQuestion() {
    const list = currentRound().questions;
    return list[state.activeNo - 1] || null;
  }

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
    const levels = SHT.LEVELS;
    const distractors = SHT.DISTRACTORS;
    const out = [];
    const seen = new Set();
    for (let i = 0; i < 120 && out.length < count; i += 1) {
      const cell = {
        type: types[i % types.length],
        scene: SHT.curriculum.topicDomain,
        level: levels[Math.floor(i / 2) % levels.length],
        distractor: distractors[(i * 5 + Math.floor(i / 7)) % distractors.length]
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

  function exclusionForCurrentRound() {
    return SHT.buildExclusionList(historicalRounds());
  }

  /* ---------- 渲染：配额表 ---------- */
  function renderQuota() {
    const list = currentRound().questions;
    const exclusion = exclusionForCurrentRound();
    if (!list.length) {
      $('quotaList').innerHTML = '<div class="hint-box">本轮还没有配额。点「按变化轴分配格子」开始，或切到第 1 轮。</div>';
      return;
    }
    $('quotaList').innerHTML = list.map(function (q, i) {
      const no = i + 1;
      const blocked = exclusion.isCellBlocked(q.cell);
      const fp = SHT.cellFingerprint(q.cell).slice(-6);
      const options = function (values, selected) {
        return values.map(function (v) {
          return '<option value="' + esc(v) + '"' + (v === selected ? ' selected' : '') + '>' + esc(v) + '</option>';
        }).join('');
      };
      return '' +
        '<div class="quota-card' + (no === state.activeNo ? ' is-active' : '') + (blocked ? ' is-blocked' : '') + '" data-no="' + no + '">' +
          '<div class="quota-head"><span class="quota-no">第 ' + no + ' 题</span>' +
            '<span class="cell-code">格子 ' + esc(fp) + ' · ' + esc(verdictOf(q)) + '</span></div>' +
          '<input class="quota-kp" data-no="' + no + '" data-field="knowledgePoint" value="' + esc(q.knowledgePoint) + '" placeholder="知识点（细到错因）">' +
          '<div class="cell-grid">' +
            '<select data-no="' + no + '" data-field="type">' + options(SHT.QUESTION_TYPES.map(function (t) { return t.id; }), q.cell.type) + '</select>' +
            '<select data-no="' + no + '" data-field="scene">' + options(SHT.SCENES, q.cell.scene) + '</select>' +
            '<select data-no="' + no + '" data-field="level">' + options(SHT.LEVELS, q.cell.level) + '</select>' +
            '<select data-no="' + no + '" data-field="distractor">' + options(SHT.DISTRACTORS, q.cell.distractor) + '</select>' +
          '</div>' +
          (blocked ? '<div class="blocked-note">与历史轮次撞格子：按记忆库规则应换角度</div>' : '') +
        '</div>';
    }).join('');
  }

  /* ---------- 渲染：题目导航与表单 ---------- */
  function renderQNav() {
    const list = currentRound().questions;
    $('qNav').innerHTML = list.map(function (q, i) {
      const no = i + 1;
      const cls = (no === state.activeNo ? ' is-active' : '') + (verdictOf(q) === '退回' ? ' is-failed' : '');
      return '<button type="button" data-no="' + no + '" class="' + cls.trim() + '">' + no + '</button>';
    }).join('');
  }

  function renderQForm() {
    const q = currentQuestion();
    if (!q) {
      $('qForm').innerHTML = '<div class="hint-box">本轮还没有题目。先在左侧分配格子。</div>';
      return;
    }
    const c = q.cell;
    $('qForm').innerHTML = '' +
      '<div class="f-row"><label>格子标记（决定去重的身份，改左侧配额表）</label>' +
        '<span class="cell-badge">' + esc(c.type) + ' / ' + esc(c.scene) + ' / ' + esc(c.level) + ' / ' + esc(c.distractor) + '</span></div>' +
      '<div class="f-two">' +
        '<div class="f-row"><label>知识点（颗粒度到错因）</label><input data-field="knowledgePoint" value="' + esc(q.knowledgePoint) + '"></div>' +
        '<div class="f-row"><label>七类能力</label><input data-field="ability" value="' + esc(q.ability) + '"></div>' +
      '</div>' +
      '<div class="f-row"><label>题干</label><textarea data-field="prompt" placeholder="只用本单元词表和句型表">' + esc(q.prompt) + '</textarea></div>' +
      '<div class="f-row"><label>听力文本（无则留空；必须与题干问的是同一件事）</label><input data-field="audioText" value="' + esc(q.audioText) + '"></div>' +
      '<div class="f-row"><label>选项（三个错误项须对应三种不同成因）</label>' +
        [0, 1, 2].map(function (i) {
          return '<input data-field="option" data-index="' + i + '" value="' + esc(q.options[i] || '') + '" placeholder="选项 ' + String.fromCharCode(65 + i) + '" style="margin-bottom:5px">';
        }).join('') + '</div>' +
      '<div class="f-two">' +
        '<div class="f-row"><label>答案（唯一，可精确匹配）</label><input data-field="answer" value="' + esc(q.answer) + '"></div>' +
        '<div class="f-row"><label>质检结论</label><input value="' + esc(verdictOf(q)) + '" disabled></div>' +
      '</div>' +
      '<div class="f-row"><label>一句解析（错在哪 + 为什么 + 正确是什么，≤25 字）</label><textarea data-field="analysis">' + esc(q.analysis) + '</textarea></div>' +
      '<div class="f-row"><label>闭环层 L4：他错了，下一轮出什么</label><textarea data-field="nextIfWrong" placeholder="答不上来就不要出这道题">' + esc(q.nextIfWrong) + '</textarea></div>';
  }

  function renderVocab() {
    $('vocabStrip').innerHTML = SHT.curriculum.words.map(function (w) {
      return '<button type="button" class="vocab-chip" data-word="' + esc(w.en) + '" title="' + esc(w.zh) + '">' + esc(w.en) + '</button>';
    }).join('');
  }

  /* ---------- 渲染：四层检查表 ---------- */
  function renderChecks() {
    const q = currentQuestion();
    const checks = (q && q.checks) || {};
    const done = Object.keys(checks).length;
    const failed = Object.keys(checks).filter(function (k) { return checks[k] === 'fail'; });
    $('checkSummary').innerHTML = '' +
      '<span class="stat-pill">第 ' + state.activeNo + ' 题 · 已检 ' + done + '/' + SHT.ALL_CHECKS.length + '</span>' +
      '<span class="stat-pill ' + (failed.length ? 'is-bad' : 'is-good') + '">' +
        (failed.length ? '退回：' + failed.join(' / ') : (verdictOf(q) === '通过' ? '通过' : '暂无退回')) + '</span>';

    $('checkList').innerHTML = SHT.CHECK_LAYERS.map(function (layer) {
      return '<div class="check-layer">' +
        '<div class="check-layer-head"><strong>' + esc(layer.name) + '</strong><span>' + esc(layer.note) + '</span></div>' +
        layer.items.map(function (item) {
          const v = checks[item.id];
          return '<div class="check-item">' +
            '<span class="check-id">' + esc(item.id) + '</span>' +
            '<span class="check-text">' + esc(item.text) + '</span>' +
            '<span class="check-btns">' +
              '<button type="button" data-check="' + esc(item.id) + '" data-verdict="pass" class="' + (v === 'pass' ? 'is-pass' : '') + '">过</button>' +
              '<button type="button" data-check="' + esc(item.id) + '" data-verdict="fail" class="' + (v === 'fail' ? 'is-fail' : '') + '">挂</button>' +
            '</span></div>';
        }).join('') +
      '</div>';
    }).join('');
  }

  function renderSelfCheck() {
    $('selfCheckList').innerHTML = SHT.SELF_CHECK_TEN.map(function (s) {
      return '<li>' + esc(s) + '</li>';
    }).join('');
  }

  /* ---------- 渲染：记忆库提示 ---------- */
  function renderExclusionHint() {
    const exclusion = exclusionForCurrentRound();
    const round = currentRound();
    const repeated = round.questions.filter(function (q) { return exclusion.isCellBlocked(q.cell); }).length;
    const full = round.questions.filter(function (q) { return exclusion.isPointTypeFull(q); }).length;
    if (state.round === 1) {
      $('exclusionHint').innerHTML = '第 1 轮无历史记录。本轮结束后，通过的题与退回原因会写进记忆库；第 2 轮规划前必须先查这里。' +
        '<br>注意：U1 话题域是 Our School，情境维度实际只开放「学校」，换情境会引入单元外词汇。';
      return;
    }
    $('exclusionHint').innerHTML = '记忆库已查：历史格子 ' + exclusion.usedCells.size + ' 个。' +
      '本轮撞格子 ' + repeated + ' 道，同考点同类题触顶（规则：最多 2 次）' + full + ' 道。' +
      '<br>撞格子或触顶的题需要换角度后重出；只换措辞、换选项顺序不算新题。';
  }

  /* ---------- 渲染：底部指标 ---------- */
  function countFailed(round) {
    if (!round || !round.questions.length) return null;
    return round.questions.filter(function (q) { return verdictOf(q) === '退回'; }).length;
  }

  function overlapCount() {
    const r1 = state.rounds[1];
    const r2 = state.rounds[2];
    if (!r1.questions.length || !r2.questions.length) return null;
    const used = new Set(r1.questions.map(function (q) { return SHT.cellFingerprint(q.cell); }));
    return r2.questions.filter(function (q) { return used.has(SHT.cellFingerprint(q.cell)); }).length;
  }

  function renderMetrics() {
    const r1Failed = countFailed(state.rounds[1]);
    const r2Failed = countFailed(state.rounds[2]);
    const overlap = overlapCount();
    const currentFailed = countFailed(currentRound());
    const overlapText = overlap === null ? '—' : overlap + '/5';
    const overlapCls = overlap === null ? '' : (overlap <= 1 ? '' : 'is-bad');
    const failedText = currentFailed === null ? '—' : currentFailed + '/5';
    const trendText = (r1Failed === null || r2Failed === null) ? '待第 2 轮' : (r1Failed + ' → ' + r2Failed);
    const trendCls = (r1Failed === null || r2Failed === null) ? '' : (r2Failed < r1Failed ? '' : 'is-warn');
    const early = currentRound().endedEarly;

    $('metrics').innerHTML = '' +
      '<div class="metric"><div class="metric-label">格子重合率（≤1/5 合格）</div><div class="metric-value ' + overlapCls + '">' + overlapText + '</div></div>' +
      '<div class="metric"><div class="metric-label">本轮退回数</div><div class="metric-value">' + failedText + '</div></div>' +
      '<div class="metric"><div class="metric-label">两轮退回趋势</div><div class="metric-value ' + trendCls + '">' + trendText + '</div></div>' +
      '<div class="metric"><div class="metric-label">是否提前结束</div><div class="metric-value">' + (early ? '是' : '否') + '</div></div>';

    $('earlyStopChk').checked = !!early;
    $('endReason').value = currentRound().endReason || '';
    $('nextRoundBtn').textContent = state.round === 1 ? '结束本轮，进入第 2 轮' : '查看两轮结论';
  }

  function renderAll() {
    document.querySelectorAll('#roundSwitch button').forEach(function (b) {
      b.classList.toggle('is-active', Number(b.dataset.round) === state.round);
    });
    renderQuota();
    renderQNav();
    renderQForm();
    renderChecks();
    renderExclusionHint();
    renderMetrics();
    renderSelfCheck();
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
          ability: '',
          cell: cell,
          prompt: '',
          audioText: '',
          options: ['', '', ''],
          answer: '',
          analysis: '',
          nextIfWrong: '',
          checks: {}
        };
      }),
      endedEarly: false,
      endReason: '',
      closed: false
    };
    state.round = 2;
    state.activeNo = 1;
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
    save();
    renderAll();
    toast('已分配 5 个不重复格子；题目内容需按新格子核对或重出');
  }

  function exportJSON() {
    const payload = {
      exportedAt: new Date().toISOString(),
      unit: SHT.curriculum.hostUnitId,
      student: SHT.sampleStudent.id,
      indicators: {
        overlap: overlapCount(),
        round1Failed: countFailed(state.rounds[1]),
        round2Failed: countFailed(state.rounds[2])
      },
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
    toastTimer = setTimeout(function () { node.remove(); }, 3200);
  }

  /* ---------- 事件 ---------- */
  function bind() {
    $('roundSwitch').addEventListener('click', function (e) {
      const btn = e.target.closest('button[data-round]');
      if (!btn) return;
      const target = Number(btn.dataset.round);
      if (target === 2 && !state.rounds[2].questions.length) { startRound2(); return; }
      state.round = target;
      state.activeNo = 1;
      save();
      renderAll();
    });

    $('quotaList').addEventListener('click', function (e) {
      const card = e.target.closest('.quota-card');
      if (!card || e.target.matches('input,select')) return;
      state.activeNo = Number(card.dataset.no);
      save();
      renderQuota(); renderQNav(); renderQForm(); renderChecks();
    });

    $('quotaList').addEventListener('change', function (e) {
      const el = e.target;
      const no = Number(el.dataset.no);
      const field = el.dataset.field;
      const q = currentRound().questions[no - 1];
      if (!q) return;
      if (field === 'knowledgePoint') q[field] = el.value;
      else if (field && q.cell) q.cell[field] = el.value;
      save();
      renderAll();
    });

    $('qNav').addEventListener('click', function (e) {
      const btn = e.target.closest('button[data-no]');
      if (!btn) return;
      state.activeNo = Number(btn.dataset.no);
      save();
      renderQuota(); renderQNav(); renderQForm(); renderChecks();
    });

    $('qForm').addEventListener('input', function (e) {
      const el = e.target;
      const field = el.dataset.field;
      const q = currentQuestion();
      if (!q || !field) return;
      if (field === 'option') q.options[Number(el.dataset.index)] = el.value;
      else q[field] = el.value;
      save();
    });

    $('checkList').addEventListener('click', function (e) {
      const btn = e.target.closest('button[data-check]');
      if (!btn) return;
      const q = currentQuestion();
      if (!q) return;
      const id = btn.dataset.check;
      const v = btn.dataset.verdict;
      if (q.checks[id] === v) delete q.checks[id];
      else q.checks[id] = v;
      save();
      renderChecks(); renderQNav(); renderMetrics(); renderQuota();
    });

    $('vocabStrip').addEventListener('click', function (e) {
      const chip = e.target.closest('.vocab-chip');
      if (!chip) return;
      const word = chip.dataset.word;
      try {
        navigator.clipboard.writeText(word);
        toast('已复制：' + word);
      } catch (err) {
        toast(word);
      }
    });

    $('autoQuotaBtn').addEventListener('click', autoQuota);
    $('clearQuotaBtn').addEventListener('click', function () {
      if (!window.confirm('清空本轮 5 道题的配额与内容？此操作不可撤销。')) return;
      currentRound().questions = [];
      state.activeNo = 1;
      save();
      renderAll();
      toast('本轮配额已清空');
    });

    $('exportBtn').addEventListener('click', exportJSON);

    $('nextRoundBtn').addEventListener('click', function () {
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

    $('earlyStopChk').addEventListener('change', function (e) {
      currentRound().endedEarly = e.target.checked;
      save();
      renderMetrics();
    });
    $('endReason').addEventListener('input', function (e) {
      currentRound().endReason = e.target.value;
      save();
    });

    $('resetBtn').addEventListener('click', function () {
      if (!window.confirm('重置全部两轮数据？此操作不可撤销。')) return;
      try { localStorage.removeItem(STORAGE_KEY); } catch (err) { /* ignore */ }
      state = defaultState();
      state.rounds[1].questions = cloneSample();
      save();
      renderAll();
      toast('已重置为示例数据');
    });
  }

  renderVocab();
  bind();
  renderAll();
  save();
})(window);
