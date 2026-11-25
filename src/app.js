/*
 * 界面：选教材单元 → 三个角色出题 → 题目列表。
 * 只负责展示，不判题、不记分、不留学习记录。
 */
(function (root) {
  const SHT = (root.SHT = root.SHT || {});

  const state = {
    bookId: SHT.BOOKS.current().meta.id,
    unitId: SHT.curriculum.id,
    count: 5,
    running: false,
    step: '',
    log: [],
    result: null,
    error: ''
  };

  function $(id) { return root.document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function bookOptions() {
    return SHT.BOOKS.list().map(function (b) {
      return '<option value="' + esc(b.id) + '"' + (b.id === state.bookId ? ' selected' : '') + '>' +
        esc(b.shortName) + '</option>';
    }).join('');
  }

  function unitOptions() {
    const b = SHT.BOOKS.get(state.bookId) || SHT.BOOKS.current();
    return (b.units || []).map(function (u) {
      return '<option value="' + esc(u.id) + '"' + (u.id === state.unitId ? ' selected' : '') + '>' +
        esc(u.id + ' ' + u.title + ' ' + u.titleZh) + '</option>';
    }).join('');
  }

  function formHtml() {
    return '<section class="card intro">' +
      '<h1>让三个角色商量着出一份题</h1>' +
      '<p class="lead">指定方案先定考哪几个点，执行把点写成题，反馈检查题目行不行；不行就退回重出。</p>' +
      '<div class="fields">' +
        '<label>教材<select data-f="book">' + bookOptions() + '</select></label>' +
        '<label>单元<select data-f="unit">' + unitOptions() + '</select></label>' +
        '<label>题数<input type="number" min="1" max="12" data-f="count" value="' + state.count + '"></label>' +
      '</div>' +
      (state.error ? '<div class="error">' + esc(state.error) + '</div>' : '') +
      '<div class="actions"><button type="button" class="btn btn-main" data-act="start">开始出题</button></div>' +
      '</section>';
  }

  function logHtml() {
    if (!state.log.length) return '<div class="muted">三个角色刚开始商量……</div>';
    return state.log.map(function (x) {
      return '<div class="log-row"><span class="tag tag-' + esc(x.role) + '">' + esc(x.title) + '</span>' +
        '<span>' + esc(x.text) + '</span></div>';
    }).join('');
  }

  function runningHtml() {
    return '<section class="card">' +
      '<h2>正在出题</h2>' +
      '<div class="step">' + esc(state.step) + '</div>' +
      '<div class="log">' + logHtml() + '</div>' +
      '</section>';
  }

  function statusOf(q) {
    if (q.passed === true) return '<span class="tag tag-ok">通过</span>';
    if (q.passed === false) return '<span class="tag tag-fail">反馈未通过</span>';
    return '<span class="tag tag-unknown">未收到反馈</span>';
  }

  function questionHtml(q) {
    const notes = (q.optionNotes || []).map(function (n, i) {
      return '<li><b>' + String.fromCharCode(65 + i) + '</b>　' + esc(n) + '</li>';
    }).join('');
    const opts = (q.options || []).map(function (o, i) {
      const right = o === q.answer;
      return '<div class="opt' + (right ? ' is-right' : '') + '">' +
        '<span class="opt-no">' + String.fromCharCode(65 + i) + '</span>' +
        '<span>' + esc(o) + '</span>' + (right ? '<span class="opt-mark">正确答案</span>' : '') +
        '</div>';
    }).join('');
    const reviews = (q.reviews || []).map(function (r) {
      return '<div class="review">第 ' + r.attempt + ' 版：' +
        (r.verdict === 'pass' ? '通过' : r.verdict === 'fail' ? '退回——' + esc(r.reason) : esc(r.reason)) +
        '</div>';
    }).join('');
    return '<article class="card question">' +
      '<div class="q-head"><span class="q-no">第 ' + q.no + ' 题</span>' + statusOf(q) + '</div>' +
      '<div class="q-kp">' + esc(q.plan && q.plan.kp || '') +
        '　<span class="q-meta">' + esc(q.plan && q.plan.ability || '') + ' · ' +
        esc(q.plan && q.plan.level || '') + ' · ' + esc(q.plan && q.plan.angle || '') + '</span></div>' +
      '<h3 class="q-prompt">' + esc(q.prompt || '（执行没有给出题干）') + '</h3>' +
      '<div class="opts">' + (opts || '<div class="muted">（没有选项）</div>') + '</div>' +
      '<div class="q-block"><h4>这道题考的是</h4><div>' + esc(q.analysis || '（没有解析）') + '</div></div>' +
      (notes ? '<div class="q-block"><h4>每个选项错在哪</h4><ul class="notes">' + notes + '</ul></div>' : '') +
      (reviews ? '<div class="q-block"><h4>反馈过程</h4>' + reviews + '</div>' : '') +
      '</article>';
  }

  function resultHtml() {
    const r = state.result;
    const dialogue = (r.dialogue || []).map(function (d) {
      return '<div class="log-row"><span class="tag tag-' + esc(d.role) + '">' + esc(d.title) + '</span>' +
        '<span>' + esc(d.text) + '</span></div>';
    }).join('');
    const errors = (r.errors || []).map(function (e) {
      return '<div class="error">' + esc(e.role + '（第 ' + (e.no || '-') + ' 题）：' + e.message) + '</div>';
    }).join('');
    return '<section class="card result-head">' +
        '<h1>题目列表</h1>' +
        '<p class="lead">' + esc(state.bookId + ' · ' + state.unitId + ' · 共 ' + r.questions.length + ' 题') + '</p>' +
        '<div class="actions"><button type="button" class="btn btn-main" data-act="again">再出一份</button>' +
        '<button type="button" class="btn btn-ghost" data-act="back">改条件</button></div>' +
      '</section>' +
      (errors || '') +
      '<details class="card dialogue"><summary>三个角色说了什么（' + (r.dialogue || []).length + ' 条）</summary>' +
        '<div class="log">' + dialogue + '</div></details>' +
      '<div class="questions">' + (r.questions || []).map(questionHtml).join('') + '</div>';
  }

  function render() {
    const el = $('root');
    if (!el) return;
    el.innerHTML = state.running ? runningHtml() : (state.result ? resultHtml() : formHtml());
  }

  function modelFormHtml() {
    const c = SHT.llm.config();
    return '<label>接口地址<input data-m="baseUrl" value="' + esc(c.baseUrl) + '"></label>' +
      '<label>模型<input data-m="model" value="' + esc(c.model) + '"></label>' +
      '<label>密钥<input data-m="key" type="password" value="' + esc(c.key) + '" placeholder="sk-..."></label>' +
      '<div class="modal-tip" id="modelTip">当前密钥：' + esc(SHT.llm.maskedKey() || '未设置') + '</div>' +
      '<div class="actions"><button type="button" class="btn btn-main" data-act="save-model">保存</button>' +
      '<button type="button" class="btn btn-ghost" data-act="test-model">测试连通性</button></div>';
  }

  function openModel() {
    $('modelForm').innerHTML = modelFormHtml();
    $('modelModal').hidden = false;
  }
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
    const res = await SHT.llm.call({
      role: 'selfcheck',
      system: '只输出 JSON。',
      user: '{"ok":true}',
      maxTokens: 32
    });
    tip(res.ok ? '连通正常' : ('失败：' + (res.error ? res.error.message : '未知错误')));
  }

  async function start() {
    if (!SHT.llm.isReady()) { openModel(); return; }
    state.error = '';
    state.running = true;
    state.result = null;
    state.log = [];
    state.step = '正在准备';
    render();
    try {
      const r = await SHT.pipeline.runRound({
        unit: SHT.curriculum,
        bookName: (SHT.BOOKS.get(state.bookId) || SHT.BOOKS.current()).meta.shortName,
        count: state.count,
        onEvent: function (e) {
          state.step = e.text || '';
          if (e.role === 'plan' && e.plans) {
            state.log.push({ role: 'plan', title: '指定方案', text: '定了 ' + e.plans.length + ' 个考点：' +
              e.plans.map(function (p) { return p.kp; }).join('、') });
          } else if (e.role === 'verify' && e.question) {
            state.log.push({ role: 'verify', title: '反馈', text: e.text });
          }
          render();
        }
      });
      state.result = r;
      if (!r.questions.length) state.error = '一道题也没出出来，检查模型设置或重试。';
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
      if (f === 'book') {
        state.bookId = e.target.value;
        const b = SHT.BOOKS.get(state.bookId);
        state.unitId = b.units[0].id;
        SHT.setBook(state.bookId, state.unitId);
        render();
      } else if (f === 'unit') {
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
      if (a.dataset.act === 'start') start();
      else if (a.dataset.act === 'again') { state.result = null; state.error = ''; render(); }
      else if (a.dataset.act === 'back') { state.result = null; state.error = ''; render(); }
    });
  }

  if (root.document) { bind(); render(); }
  SHT.app = { state: state, render: render, start: start };
})(window);
