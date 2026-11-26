/*
 * 界面：选教材单元 → 出题 → 按轮次回看题目。
 * 不展示角色商讨过程，只展示每一轮的题目结果。
 */
(function (root) {
  const SHT = (root.SHT = root.SHT || {});

  const state = {
    bookId: SHT.BOOKS.current().meta.id,
    unitId: SHT.curriculum.id,
    count: 5,
    running: false,
    step: '',
    rounds: [],
    selected: 0,
    error: ''
  };

  function $(id) { return root.document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function unitOptions() {
    const b = SHT.BOOKS.get(state.bookId) || SHT.BOOKS.current();
    return (b.units || []).map(function (u) {
      return '<option value="' + esc(u.id) + '"' + (u.id === state.unitId ? ' selected' : '') + '>' +
        esc(u.id + ' ' + u.title + ' ' + u.titleZh) + '</option>';
    }).join('');
  }

  function profileHtml() {
    const b = SHT.BOOKS.get(state.bookId) || SHT.BOOKS.current();
    const u = SHT.curriculum || b.getUnit(state.unitId) || b.units[0];
    return '<div class="profile-card">' +
      '<div class="profile-head"><span class="profile-badge">已固定</span>学生画像</div>' +
      '<p class="profile-note">画像由课程数据生成，出题时自动带入，不用填写。</p>' +
      '<dl class="profile-list">' +
        '<div><dt>年级</dt><dd>' + esc(b.meta.grade || '四年级') + '</dd></div>' +
        '<div><dt>教材</dt><dd>' + esc(b.meta.shortName) + '</dd></div>' +
        '<div><dt>当前单元</dt><dd>' + esc(u.id + ' ' + u.title + '（' + u.titleZh + '）') + '</dd></div>' +
        '<div><dt>已学词汇</dt><dd>' + (u.words || []).length + ' 个</dd></div>' +
        '<div><dt>已学句型</dt><dd>' + (u.sentencePatterns || []).length + ' 条</dd></div>' +
      '</dl>' +
      '</div>';
  }

  function formHtml() {
    return '<section class="setup entry">' +
      '<h1>三角色出题</h1>' +
      '<p class="sub">指定方案定考点，执行写成题，反馈打分；不合格换下一轮，每轮都留着。</p>' +
      profileHtml() +
      '<div class="setup-grid">' +
        '<label>出题单元<select data-f="unit">' + unitOptions() + '</select></label>' +
        '<label>每轮题数<input type="number" min="1" max="12" data-f="count" value="' + state.count + '"></label>' +
      '</div>' +
      (state.error ? '<p class="error">' + esc(state.error) + '</p>' : '') +
      '<button type="button" class="btn btn-primary" data-act="start">开始出题</button>' +
      '</section>';
  }

  function runningHtml() {
    return '<section class="setup">' +
      '<h1>正在出题</h1>' +
      '<p class="sub">' + esc(state.step || '正在准备') + '</p>' +
      '<div class="progress"><span class="progress-bar"></span></div>' +
      '</section>';
  }

  function scoreColor(score) {
    if (score == null) return 'var(--muted)';
    if (score >= 85) return 'var(--good)';
    if (score >= 70) return 'var(--warn)';
    return 'var(--bad)';
  }

  function roundItem(r, i) {
    const active = i === state.selected;
    const score = r.score == null ? '—' : r.score;
    return '<button type="button" class="round-item' + (active ? ' is-active' : '') + '"' +
        ' data-act="round" data-i="' + i + '"' + (active ? ' aria-current="true"' : '') + '>' +
        '<span class="round-head">' +
          '<span class="round-no">第 ' + r.no + ' 轮</span>' +
          '<span class="round-status ' + (r.passed ? 'is-pass' : 'is-fail') + '">' +
            (r.passed ? '通过' : '未通过') + '</span>' +
        '</span>' +
        '<span class="round-score" style="color:' + scoreColor(r.score) + '">' + score + '<small> 分</small></span>' +
        '<span class="round-track"><span class="round-fill" style="width:' +
          (r.score == null ? 0 : Math.min(100, Math.max(0, r.score))) + '%;background:' +
          scoreColor(r.score) + '"></span></span>' +
        '<span class="round-meta">' + r.questions.length + ' 道题</span>' +
      '</button>';
  }

  function optionsHtml(q) {
    return (q.options || []).map(function (o, i) {
      const right = o === q.answer;
      return '<li class="option' + (right ? ' is-answer' : '') + '">' +
        '<span class="option-key">' + String.fromCharCode(65 + i) + '</span>' +
        '<span class="option-text">' + esc(o) + '</span>' +
        (right ? '<span class="option-tag">正确答案</span>' : '') +
        (q.optionNotes && q.optionNotes[i] ? '<span class="option-note">' + esc(q.optionNotes[i]) + '</span>' : '') +
        '</li>';
    }).join('');
  }

  function scoresHtml(q) {
    if (!q.scoresDetail || typeof q.scoresDetail !== 'object') return '';
    const names = {
      vocab_scope: '词汇范围', grammar_match: '语法匹配', interest_context: '情境趣味',
      distractor_quality: '干扰项', answer_uniqueness: '答案唯一', no_ambiguity: '无歧义',
      cognitive_load: '认知负荷', format_compliance: '格式规范',
      prompt_answer_alignment: '中英对等', intent_consistency: '方案一致'
    };
    const maxes = {
      vocab_scope: 15, grammar_match: 12, interest_context: 8, distractor_quality: 12,
      answer_uniqueness: 10, no_ambiguity: 8, cognitive_load: 8, format_compliance: 7,
      prompt_answer_alignment: 10, intent_consistency: 10
    };
    const rows = Object.keys(names).filter(function (k) { return q.scoresDetail[k]; }).map(function (k) {
      const d = q.scoresDetail[k];
      const s = Number(d.score) || 0;
      const m = maxes[k] || 10;
      return '<li class="dim"><span class="dim-name">' + names[k] + '</span>' +
        '<span class="dim-track"><span class="dim-fill" style="width:' +
          Math.round(s / m * 100) + '%"></span></span>' +
        '<span class="dim-value">' + s + '/' + m + '</span></li>';
    }).join('');
    return rows ? '<details class="dims"><summary>评分明细</summary><ul class="dim-list">' + rows + '</ul></details>' : '';
  }

  function questionHtml(q) {
    return '<article class="question">' +
      '<div class="q-top">' +
        '<span class="q-no">第 ' + q.no + ' 题</span>' +
        '<span class="q-kp">' + esc(q.plan && q.plan.kp || '') + '</span>' +
        '<span class="q-score" style="color:' + scoreColor(q.score) + '">' +
          (q.score == null ? '未评分' : q.score + ' 分') + '</span>' +
      '</div>' +
      '<p class="q-prompt">' + esc(q.prompt || '（没有题干）') + '</p>' +
      '<ul class="options">' + (optionsHtml(q) || '<li class="muted">没有选项</li>') + '</ul>' +
      (q.analysis ? '<div class="q-analysis"><b>这道题考的是</b><p>' + esc(q.analysis) + '</p></div>' : '') +
      (q.feedback ? '<div class="q-feedback"><b>给方案的建议</b><p>' + esc(q.feedback) + '</p></div>' : '') +
      scoresHtml(q) +
      '</article>';
  }

  function detailHtml() {
    const r = state.rounds[state.selected];
    if (!r) return '<section class="detail"><p class="muted">没有可展示的题目。</p></section>';
    const feedback = (r.feedback || []).length
      ? '<div class="round-feedback"><b>本轮给下一轮方案的建议</b>' +
        r.feedback.map(function (f) { return '<p>' + esc(f) + '</p>'; }).join('') + '</div>'
      : '';
    return '<section class="detail">' +
      '<header class="detail-head">' +
        '<div><h2>第 ' + r.no + ' 轮题目</h2>' +
          '<p class="sub">' + r.questions.length + ' 道题 · ' +
            (r.score == null ? '没有分数' : '总分 ' + r.score + ' 分') + '</p></div>' +
        '<span class="detail-status ' + (r.passed ? 'is-pass' : 'is-fail') + '">' +
          (r.passed ? '通过' : '未通过') + '</span>' +
      '</header>' +
      feedback +
      '<div class="question-list">' + r.questions.map(questionHtml).join('') + '</div>' +
      '</section>';
  }

  function resultHtml() {
    return '<section class="result-bar">' +
        '<div><h1>出题结果</h1><p class="sub">点左侧任一轮，右侧显示那一轮的完整题目。</p></div>' +
        '<div class="actions">' +
          '<button type="button" class="btn btn-primary" data-act="again">再出一份</button>' +
          '<button type="button" class="btn" data-act="back">改条件</button>' +
        '</div>' +
      '</section>' +
      '<div class="workspace">' +
        '<aside class="rounds">' +
          '<h2>轮次</h2>' +
          state.rounds.map(roundItem).join('') +
        '</aside>' +
        detailHtml() +
      '</div>' + (state.error ? '<p class="error">' + esc(state.error) + '</p>' : '');
  }

  function render() {
    const el = $('root');
    if (!el) return;
    const stage = root.document.querySelector('.stage');
    if (stage) stage.classList.toggle('is-entry', !state.rounds.length);
    el.innerHTML = state.running ? runningHtml() : (state.rounds.length ? resultHtml() : formHtml());
  }

  function modelFormHtml() {
    const c = SHT.llm.config();
    return '<label>接口地址<input data-m="baseUrl" value="' + esc(c.baseUrl) + '"></label>' +
      '<label>模型<input data-m="model" value="' + esc(c.model) + '"></label>' +
      '<label>密钥<input data-m="key" type="password" value="' + esc(c.key) + '" placeholder="sk-..."></label>' +
      '<div class="modal-tip" id="modelTip">当前密钥：' + esc(SHT.llm.maskedKey() || '未设置') + '</div>' +
      '<div class="actions"><button type="button" class="btn btn-primary" data-act="save-model">保存</button>' +
      '<button type="button" class="btn" data-act="test-model">测试连通性</button></div>';
  }

  function openModel() { $('modelForm').innerHTML = modelFormHtml(); $('modelModal').hidden = false; }
  function closeModel() { $('modelModal').hidden = true; }
  function readModelForm() {
    const out = {};
    root.document.querySelectorAll('[data-m]').forEach(function (el) { out[el.dataset.m] = el.value.trim(); });
    return out;
  }
  function tip(text) { const t = $('modelTip'); if (t) t.textContent = text; }

  async function testModel() {
    SHT.llm.save(readModelForm());
    tip('正在测试……');
    const res = await SHT.llm.call({ role: 'selfcheck', system: '只输出 JSON。', user: '{"ok":true}', maxTokens: 32 });
    tip(res.ok ? '连通正常' : ('失败：' + (res.error ? res.error.message : '未知错误')));
  }

  async function start() {
    if (!SHT.llm.isReady()) { openModel(); return; }
    state.error = '';
    state.running = true;
    state.rounds = [];
    state.selected = 0;
    state.step = '正在准备';
    render();
    try {
      const r = await SHT.pipeline.runRound({
        unit: SHT.curriculum,
        bookName: (SHT.BOOKS.get(state.bookId) || SHT.BOOKS.current()).meta.shortName,
        count: state.count,
        onEvent: function (e) {
          state.step = e.text || '';
          render();
        }
      });
      state.rounds = r.rounds || [];
      // 默认选中最后通过的那一轮；没有通过的就选最后一轮
      let pick = state.rounds.length - 1;
      for (let i = state.rounds.length - 1; i >= 0; i -= 1) {
        if (state.rounds[i].passed) { pick = i; break; }
      }
      state.selected = Math.max(0, pick);
      if (!state.rounds.length) state.error = '一道题也没出出来，检查模型设置或重试。';
    } catch (e) {
      state.error = '出题过程出错：' + (e && e.message ? e.message : '未知错误');
    }
    state.running = false;
    render();
  }

  function bind() {
    const btn = $('modelBtn');
    if (btn) btn.addEventListener('click', openModel);
    const modal = $('modelModal');
    if (modal) {
      modal.addEventListener('click', function (e) {
        if (e.target === modal) { closeModel(); return; }
        const a = e.target.closest('[data-act]');
        if (!a) return;
        if (a.dataset.act === 'close-model') closeModel();
        else if (a.dataset.act === 'save-model') { SHT.llm.save(readModelForm()); closeModel(); }
        else if (a.dataset.act === 'test-model') testModel();
      });
    }
    const el = $('root');
    if (!el) return;
    el.addEventListener('change', function (e) {
      const f = e.target.dataset && e.target.dataset.f;
      if (f === 'unit') {
        state.unitId = e.target.value;
        SHT.setUnit(state.unitId);
        render();
      } else if (f === 'count') {
        state.count = Math.max(1, Math.min(12, Number(e.target.value) || 5));
      }
    });
    el.addEventListener('click', function (e) {
      const a = e.target.closest('[data-act]');
      if (!a) return;
      const act = a.dataset.act;
      if (act === 'start') start();
      else if (act === 'round') { state.selected = Number(a.dataset.i) || 0; render(); }
      else if (act === 'again') { state.rounds = []; state.error = ''; render(); }
      else if (act === 'back') { state.rounds = []; state.error = ''; render(); }
    });
  }

  if (root.document) { bind(); render(); }
  SHT.app = { state: state, render: render, start: start };
})(window);
