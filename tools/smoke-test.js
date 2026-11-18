/*
 * 四上课程内容回归测试：node tools/smoke-test.js
 *
 * 只验证当前唯一课程源和基础纯函数，不再加载旧教材。
 */
const fs = require('fs');
const path = require('path');
global.window = global;
global.localStorage = {
  getItem() { return null; },
  setItem() {},
  removeItem() {}
};
global.navigator = { clipboard: { writeText() {} } };

require('../src/data/books.js');
require('../src/data/textbook.js');
require('../src/data/knowledgePoints.js');
require('../src/data/curriculum.js');
require('../src/data/wrongCases.js');
require('../src/core/enums.js');
require('../src/core/fingerprint.js');
require('../src/core/checklist.js');
require('../src/core/wrongBook.js');
require('../src/core/practice.js');
require('../src/core/llm.js');
require('../src/core/grade.js');
require('../src/core/diagnose.js');
require('../src/core/agents.js');
require('../src/core/validate.js');
require('../src/core/quota.js');
require('../src/core/bkt.js');
require('../src/core/learner.js');
require('../src/core/weights.js');
require('../src/core/progress.js');
require('../src/core/assessment.js');
require('../src/core/agentMemory.js');
require('../src/core/pipeline.js');

const SHT = global.SHT;
let failed = 0;
function assert(name, cond, extra) {
  if (cond) console.log('PASS  ' + name);
  else { failed += 1; console.log('FAIL  ' + name + (extra ? '  → ' + extra : '')); }
}

console.log('--- 课程数据 ---');
const books = SHT.BOOKS.list();
assert('只注册一套四上课程', books.length === 1 && books[0].id === 'COURSE-G4A', JSON.stringify(books));
const book = SHT.BOOKS.current();
assert('课程共 10 个单元', book.units.length === 10, String(book.units.length));
assert('每个单元有单词、句型、课文、自然拼读',
  book.units.every(u => u.words.length >= 6 && u.sentencePatterns.length >= 1 && u.passage && u.phonics.extras.length >= 4));
assert('每个词条都有英文和中文', book.units.every(u => u.words.every(w => w.en && w.zh)),
  book.units.map(u => u.id + ':' + u.words.filter(w => !w.en || !w.zh).length).join(' '));
assert('课程没有注册警告', (book.meta.warnings || []).length === 0, (book.meta.warnings || []).join(' | '));
assert('当前单元是 U1 This is our school', SHT.curriculum.id === 'U1' && SHT.curriculum.title === 'This is our school');
assert('每个单元生成单词级路径目标',
  book.units.every(u => SHT.kpsOf(u.id).length >= 20));
assert('共有 262 个候选路径目标', SHT.ALL_KPS().length === 262, String(SHT.ALL_KPS().length));
assert('考点 id 不重复', new Set(SHT.ALL_KPS().map(k => k.id)).size === 262);
assert('考点四维和能力都在枚举内',
  SHT.ALL_KPS().every(k => SHT.QUESTION_TYPES.some(t => t.id === k.cell.type) &&
    SHT.SCENES.includes(k.cell.scene) && SHT.LEVELS.includes(k.cell.level) &&
    SHT.DISTRACTORS.includes(k.cell.distractor) && k.ability));

console.log('--- 示例题与代码闸 ---');
assert('U1 有 5 道真实课程示例题', SHT.sampleQuestions.length === 5);
assert('示例题答案都在选项中', SHT.sampleQuestions.every(q => q.options.some(o => SHT.normAnswer(o) === SHT.normAnswer(q.answer))));
assert('示例题知识点都能反查到课程考点', SHT.sampleQuestions.every(q => !!SHT.kpByLabel(q.knowledgePoint)));
SHT.sampleQuestions.forEach(function (q, i) {
  const unit = SHT.curriculum;
  const result = SHT.validateQuestion(q, unit, {});
  assert('U1 示例题 ' + (i + 1) + ' 通过代码闸', result.pass, SHT.failsText ? SHT.failsText(result) : '');
});

console.log('--- 基础模型 ---');
const b = SHT.bkt.update(null, true, { hint: false });
assert('BKT 可更新掌握概率', b > 0 && b < 1, String(b));
const model = SHT.learner.build([
  { seq: 1, studentId: 'S-T', qid: 'q1', kp: SHT.curriculum.words[0].en, type: 'shown', ts: 1000 },
  { seq: 2, studentId: 'S-T', qid: 'q1', kp: SHT.curriculum.words[0].en, type: 'submit', ts: 3000, payload: { correct: true, durationMs: 2000 } }
]);
assert('学习者模型可从事件生成考点状态', !!model.byKp[SHT.curriculum.words[0].en]);

console.log('--- 答错提示与重试 ---');
const retryState = SHT.judgePoint([
  { stage: 'first', attemptIndex: 1, final: false, correct: false, hintCount: 0 },
  { stage: 'first', attemptIndex: 2, final: true, correct: true, hintCount: 1 }
]);
assert('首答错、提示后改对只算看提示才会', retryState.state === 'assisted', JSON.stringify(retryState));
const retryWrong = SHT.judgePoint([
  { stage: 'first', attemptIndex: 1, final: false, correct: false, hintCount: 0 },
  { stage: 'first', attemptIndex: 2, final: true, correct: false, hintCount: 1 }
]);
assert('提示后仍错判为不会', retryWrong.state === 'wrong', JSON.stringify(retryWrong));

console.log('--- 学生评价单 ---');
const sampleRound = {
  questions: [{ no: 1, knowledgePoint: SHT.kpsOf('U1')[0].label }],
  practice: { attempts: [
    { no: 1, stage: 'first', attemptIndex: 1, final: false, correct: false, hintCount: 0, picked: 'playground', expected: 'classroom', durationMs: 6000 },
    { no: 1, stage: 'first', attemptIndex: 2, final: true, retried: true, correct: true, firstCorrect: false, retryCorrect: true, hintCount: 1, picked: 'classroom', expected: 'classroom', retryDurationMs: 4000 }
  ] }
};
const sampleReport = SHT.assessment.buildRoundReport({ round: sampleRound, learnerModel: { byKp: {} } });
assert('提示后答对评价单记为看提示才会', sampleReport.knowledgePoints[0].state === 'assisted');
assert('提示后答对只给半分', sampleReport.performanceScore === 50, String(sampleReport.performanceScore));
assert('保持度和迁移度没有伪造分数', sampleReport.dimensions.retention === null && sampleReport.dimensions.transfer === null);

console.log('--- 能力权重（痕迹 → 难度） ---');
/*
 * 权重是「答对升、答错降」的唯一落点：每答一题按对数损失梯度走一步
 *   w ← w + η·(r - p)
 * 下面按四条边界验：方向、证据打折、粗心保护、可复算。
 */
const W = SHT.weights;
const wBlank = W.blank();
const oneRight = W.update(wBlank, { kp: 'kp-a', ability: 'vocab', correct: true, durationMs: 6000 });
const oneWrong = W.update(wBlank, { kp: 'kp-a', ability: 'vocab', correct: false, durationMs: 9000 });
assert('独立答对让权重上升', oneRight.kp['kp-a'].w > W.START,
  String(oneRight.kp['kp-a'].w));
assert('答错让权重下降', oneWrong.kp['kp-a'].w < W.START,
  String(oneWrong.kp['kp-a'].w));
assert('权重同时记在能力与考点两层',
  Number.isFinite(oneRight.ability.vocab.w) && Number.isFinite(oneRight.kp['kp-a'].w));

const hinted = W.update(wBlank, { kp: 'kp-a', ability: 'vocab', correct: true, hintCount: 1, retried: true, durationMs: 6000 });
assert('靠提示/重试答对升得比独立答对少',
  hinted.kp['kp-a'].w < oneRight.kp['kp-a'].w && hinted.kp['kp-a'].w > W.START,
  hinted.kp['kp-a'].w + ' vs ' + oneRight.kp['kp-a'].w);

const fastWrong = W.update(wBlank, { kp: 'kp-b', ability: 'vocab', correct: false, durationMs: 2000, changes: 0 });
const slowWrong = W.update(wBlank, { kp: 'kp-b', ability: 'vocab', correct: false, durationMs: 25000 });
assert('秒错降得比想很久才错少（手滑不该砸穿权重）',
  fastWrong.kp['kp-b'].w > slowWrong.kp['kp-b'].w,
  fastWrong.kp['kp-b'].w + ' vs ' + slowWrong.kp['kp-b'].w);

const replayA = W.build([{ kp: 'kp-a', ability: 'vocab', correct: true, durationMs: 5000 }, { kp: 'kp-a', ability: 'vocab', correct: false, durationMs: 7000 }]);
const replayB = W.build([{ kp: 'kp-a', ability: 'vocab', correct: true, durationMs: 5000 }, { kp: 'kp-a', ability: 'vocab', correct: false, durationMs: 7000 }]);
assert('同一串作答重放，权重逐字段相等（可复算）',
  JSON.stringify(replayA) === JSON.stringify(replayB));

const high = W.build(Array.from({ length: 8 }, () => ({ kp: 'kp-h', ability: 'vocab', correct: true, durationMs: 5000 })));
const low = W.build(Array.from({ length: 8 }, () => ({ kp: 'kp-l', ability: 'vocab', correct: false, durationMs: 9000 })));
assert('连对把难度上限顶到更高一层', W.difficultyOf(high).cap === '表达', W.difficultyOf(high).cap);
assert('连错把难度上限压到更低一层', W.difficultyOf(low).cap === '辨', W.difficultyOf(low).cap);
assert('难度给的是依据，不是一句结论',
  typeof W.difficultyOf(high).reason === 'string' && W.difficultyOf(high).answered === 8);

/*
 * 错题表的权重项：同等错误次数下，答错时权重越低说明越没底，越该先练。
 * 这条把「权重」从难度回路接到了弱点排序上，两条链共用同一个数。
 */
const projFixture = function (weightAt) {
  return [{
    knowledgePoint: 'kp-w', ability: 'vocab', category: '未掌握', masteryState: 'wrong',
    variantAttempts: [], firstAttemptEvidence: { hintCount: 0 }, remediationLoopCount: 0, weightAt: weightAt
  }];
};
const projLowW = SHT.projectWeaknesses(projFixture(0.2), '学校');
const projHighW = SHT.projectWeaknesses(projFixture(0.9), '学校');
assert('答错时权重越低，弱点排序分越高', projLowW.items[0].priorityScore > projHighW.items[0].priorityScore,
  projLowW.items[0].priorityScore + ' vs ' + projHighW.items[0].priorityScore);
/*
 * 这里只测纯函数。权重写进 state、导出带 weightsDigest 这两处接线在浏览器里验：
 * 本文件不加载 app.js（远端基线就是纯函数测试），拿不到 devAudit。
 */

console.log('--- 单元切换 ---');
SHT.setBook('COURSE-G4A', 'U10');
assert('切到 U10 后课程切片正确', SHT.curriculum.id === 'U10' && SHT.curriculum.title === "What's her job?");
assert('U10 的考点只来自 U10', SHT.kpsOf('U10').every(k => k.unit === 'U10'));

/* ================= 接线：作答 → 权重 → 落盘 ================= */
/*
 * 上面测的是纯函数。这一段专门验 app.js 里那几行接线：
 * 字段名写错、isRetry 取错、忘了 save，纯函数测试全绿也发现不了。
 * 加载 app.js 需要最小 DOM 桩，所以放在文件末尾，不影响前面的纯函数段。
 */
console.log('--- 答题过后重出题：证据有没有真的进模型 ---');
(function () {
  const EV = function (seq, qid, kp, type, payload) {
    return { seq: seq, qid: qid, kp: kp, studentId: 'S-001', round: 1, ts: 1000 + seq * 100, type: type, payload: payload || {} };
  };
  /*
   * 学生端真实的一条作答链是两枪：先答错 → 系统给提示 → 同一题再答一次。
   * 所以「一题」在事件流里有两条 submit。这里把两种结局都造出来。
   */
  const retriedWrong = [
    EV(1, 'q-a', 'library · 图书馆', 'shown', {}),
    EV(2, 'q-a', 'library · 图书馆', 'pick', { index: 1 }),
    EV(3, 'q-a', 'library · 图书馆', 'submit', { correct: false, final: false, attemptIndex: 1, durationMs: 1200, hintUsed: false }),
    EV(4, 'q-a', 'library · 图书馆', 'hint', { auto: true }),
    EV(5, 'q-a', 'library · 图书馆', 'pick', { index: 2 }),
    EV(6, 'q-a', 'library · 图书馆', 'submit', { correct: false, final: true, retry: true, firstCorrect: false, durationMs: 400, hintUsed: true })
  ];
  const ma = SHT.learner.build(retriedWrong).byKp['library · 图书馆'];
  assert('提示后仍错被单独记下来（以前这条证据丢了）',
    ma && ma.retriedWrong === 1, ma && JSON.stringify({ rw: ma.retriedWrong, t: ma.tendency }));
  assert('提示后仍错判成「没掌握」，不判成粗心',
    ma && ma.tendency === 'unknown', ma && ma.tendency);

  // 同样一题，先错后提示答对：只能算「看提示才会」，掌握概率必须低于一眼答对。
  const retriedRight = retriedWrong.slice(0, 4).concat([
    EV(5, 'q-b', 'library · 图书馆', 'pick', { index: 0 }),
    EV(6, 'q-b', 'library · 图书馆', 'submit', { correct: true, final: true, retry: true, firstCorrect: false, durationMs: 900, hintUsed: true })
  ]);
  const mb = SHT.learner.build(retriedRight).byKp['library · 图书馆'];
  const clean = [
    EV(1, 'q-c', 'library · 图书馆', 'shown', {}),
    EV(2, 'q-c', 'library · 图书馆', 'pick', { index: 0 }),
    EV(3, 'q-c', 'library · 图书馆', 'submit', { correct: true, final: true, attemptIndex: 1, durationMs: 6000, hintUsed: false })
  ];
  const mc = SHT.learner.build(clean).byKp['library · 图书馆'];
  assert('先错后提示答对，掌握概率低于独立答对',
    mb && mc && mb.pKnown < mc.pKnown,
    '提示后 ' + (mb && mb.pKnown) + ' vs 独立 ' + (mc && mc.pKnown));

  // 先选 A、改 B、改 C，再一路秒错：有改选就不是手滑，不能被判成 slip。
  const changed = [
    EV(1, 'q-d', 'library · 图书馆', 'shown', {}),
    EV(2, 'q-d', 'library · 图书馆', 'pick', { index: 0 }),
    EV(3, 'q-d', 'library · 图书馆', 'change', { index: 1, prevIndex: 0 }),
    EV(4, 'q-d', 'library · 图书馆', 'change', { index: 2, prevIndex: 1 }),
    EV(5, 'q-d', 'library · 图书馆', 'submit', { correct: false, final: false, attemptIndex: 1, durationMs: 800, hintUsed: false })
  ];
  const md = SHT.learner.build(changed).byKp['library · 图书馆'];
  assert('改选过再秒错，不算「手滑」',
    md && md.fastWrong === 0 && md.tendency !== 'slip',
    md && JSON.stringify({ fast: md.fastWrong, t: md.tendency }));

  /*
   * 权重侧：同一道题「提示后还是错」应该比「没提示、秒错」掉得更狠。
   * 以前重试那枪耗时很短又被当成秒错，只降半格，两者降幅一样 —— 这是反的。
   */
  const wRetry = SHT.weights.build([{ kp: 'k', ability: 'vocab', correct: false, retried: true, durationMs: 400, changes: 0 }]);
  const wSlip = SHT.weights.build([{ kp: 'k', ability: 'vocab', correct: false, retried: false, durationMs: 400, changes: 0 }]);
  assert('提示后仍错的降幅大于没提示的秒错',
    wRetry.kp.k.w < wSlip.kp.k.w,
    '重试 ' + wRetry.kp.k.w + ' vs 秒错 ' + wSlip.kp.k.w);

  /*
   * 最关键的一条：权重算出来的难度档，必须真的换掉这一轮出题的层次。
   * 以前 decide 先用掌握概率把层次定死，之后才改 cap 的数字，题一条没变。
   */
  const K = [
    { id: 'k1', label: 'weak · 弱考点', ability: 'vocab', pathStage: 1, pathLabel: '阶段 1' },
    { id: 'k2', label: 'strong · 强考点', ability: 'vocab', pathStage: 1, pathLabel: '阶段 1' },
    { id: 'k3', label: 'mid · 中考点', ability: 'vocab', pathStage: 1, pathLabel: '阶段 1' }
  ];
  const cell = function (kp) {
    return {
      kp: kp, attempts: 3, correct: 3, wrong: 0, fastWrong: 0, slowWrong: 0,
      guessRight: 0, retriedWrong: 0, retriedRight: 0, changes: 0, hintUsed: 0,
      avgMs: 5000, pKnown: 0.8, tendency: 'solid', score: 10,
      eventSeqs: [1, 2], qids: ['q1']
    };
  };
  const solidModel = {
    eventCount: 30, answeredCount: 3,
    byKp: { 'weak · 弱考点': cell('weak · 弱考点'), 'strong · 强考点': cell('strong · 强考点'), 'mid · 中考点': cell('mid · 中考点') }
  };
  const ws = { version: 1, answered: 8, updatedAt: '', ability: { vocab: { w: 0.3, n: 8, correct: 2 } }, kp: {} };
  const dLow = SHT.learner.decide(solidModel, { layer: 'A', kps: K, count: 2, capOverride: '认', weights: ws });
  const dHigh = SHT.learner.decide(solidModel, { layer: 'A', kps: K, count: 2, capOverride: '表达', weights: ws });
  assert('难度档按权重覆盖：低权重出「认」层',
    dLow.levelCap.cap === '认' && dLow.items.every(i => i.level === '认'),
    dLow.levelCap.cap + ' / ' + dLow.items.map(i => i.level).join(','));
  assert('难度档按权重覆盖：高权重出「表达」层',
    dHigh.levelCap.cap === '表达' && dHigh.items.every(i => i.level === '表达'),
    dHigh.levelCap.cap + ' / ' + dHigh.items.map(i => i.level).join(','));
  assert('原掌握概率算出的档留在记录里，方便核对为什么改档',
    dLow.levelCap.source === 'weights' && dLow.levelCap.learnerCap === '表达',
    JSON.stringify({ src: dLow.levelCap.source, learnerCap: dLow.levelCap.learnerCap }));

  // 同一阶段里，权重最低的考点排最前面 —— 那是最该验的地方。
  const ws2 = {
    version: 1, answered: 9, updatedAt: '', ability: {},
    kp: {
      'weak · 弱考点': { w: 0.2, n: 3, correct: 0 },
      'mid · 中考点': { w: 0.5, n: 3, correct: 2 },
      'strong · 强考点': { w: 0.9, n: 3, correct: 3 }
    }
  };
  const dOrder = SHT.learner.decide(solidModel, { layer: 'A', kps: K, count: 3, capOverride: '表达', weights: ws2 });
  assert('同层里先出权重最低的考点',
    dOrder.items[0] && dOrder.items[0].kp === 'weak · 弱考点',
    dOrder.items.map(i => i.kp + '@' + i.evidence.weight).join(' , '));
  assert('每条选题都写着出题当时的权重，能事后核对',
    dOrder.items.every(i => typeof i.evidence.weight === 'number'));
})();

console.log('--- 权重接线（加载 app.js） ---');
(function () {
  const handlers = {};
  const mk = function (id) {
    return {
      _id: id, innerHTML: '', value: '', checked: false, textContent: '', href: '', download: '',
      dataset: {}, style: {}, tagName: 'DIV',
      classList: { toggle() {}, add() {}, remove() {} },
      addEventListener(type, fn) { (handlers[id] = handlers[id] || {})[type] = fn; },
      matches() { return false; }, closest() { return null; },
      appendChild() {}, removeChild() {}, remove() {}, click() {}, setAttribute() {},
      querySelector() { return null; }
    };
  };
  const nodes = {};
  global.document = {
    getElementById(id) { return nodes[id] || (nodes[id] = mk(id)); },
    querySelectorAll() { return []; }, querySelector() { return null; },
    createElement() { return mk('created'); }, body: mk('body')
  };
  global.navigator = global.navigator || { clipboard: { writeText() {} } };
  global.confirm = function () { return true; };
  // 文件顶部的 localStorage 是 no-op 桩（纯函数段不需要落盘）。这一段要验落盘，
  // 换成可写的内存实现，才能读到 app.save() 真正写进去的东西。
  const disk = {};
  global.localStorage = {
    getItem(k) { return disk[k] == null ? null : disk[k]; },
    setItem(k, v) { disk[k] = String(v); },
    removeItem(k) { delete disk[k]; }
  };
  require('../src/core/audit.js');
  require('../src/dev/audit.js');
  require('../src/app.js');

  const SHT2 = global.SHT;
  const fire = function (id, type, target) {
    const fn = handlers[id] && handlers[id][type];
    if (!fn) throw new Error('no handler ' + id + '/' + type);
    fn({ target: Object.assign({ closest() { return null; }, matches() { return false; }, dataset: {} }, target) });
  };
  const click = function (action, extra) {
    fire('studentRoot', 'click', {
      closest: sel => (sel === '[data-st-action]' ? { dataset: Object.assign({ stAction: action }, extra || {}) } : null)
    });
  };

  const st = SHT2.devAudit.state();
  SHT2.llm.save({ baseUrl: 'http://mock', model: 'mock-model', key: 'mock-key', temperature: 0.6, maxTokens: 800, timeoutMs: 1000 });
  st.stStarted = true;
  st.round = 1;
  st.rounds[1].questions = [{
    qid: 'wire-1', no: 1, knowledgePoint: 'vocab · classroom · 教室物品', ability: 'vocab',
    cell: { type: '中英匹配', scene: '学校', level: '认', distractor: '同类不同物' },
    prompt: '选出「教室」的英文。', options: ['classroom', 'library', 'playground'], answer: 'classroom'
  }];
  st.rounds[1].practice = Object.assign({}, st.rounds[1].practice, {
    cursor: 0, attempts: [], picked: null, revealed: null, shownAt: 0, draft: '', hintUsed: false
  });

  click('pick', { index: '0' });
  click('submit');
  const w = SHT2.devAudit.state().weights;
  assert('答对一题后权重被更新（不是只算不用）', w && w.answered === 1, w && String(w.answered));
  assert('更新落在考点与能力两层，且方向是上升',
    w && w.kp['vocab · classroom · 教室物品'] && w.kp['vocab · classroom · 教室物品'].w > 0.5 &&
    w.ability.vocab && w.ability.vocab.w > 0.5,
    w && JSON.stringify(w.kp['vocab · classroom · 教室物品']));

  // 第二题故意答错：权重该降，错题表该带走当时的权重快照。
  // 直接挪游标，不走练习页的「下一题」按钮——那段交互在 e2e 里验，这里只验接线。
  st.rounds[1].questions.push({
    qid: 'wire-2', no: 2, knowledgePoint: 'vocab · library · 教室场所', ability: 'vocab',
    cell: { type: '中英匹配', scene: '学校', level: '认', distractor: '同类不同物' },
    prompt: '选出「图书馆」的英文。', options: ['library', 'classroom', 'playground'], answer: 'library'
  });
  const pr = st.rounds[1].practice;
  pr.cursor = 1;
  pr.revealed = null;
  pr.picked = null;
  pr.draft = '';
  pr.grading = false;
  pr.hintUsed = false;
  pr.gradeError = '';
  pr.retryFirst = null;
  pr.retry = null;
  click('pick', { index: '1' });
  click('submit');
  /*
   * 远端流程：首答错不直接定案，先给提示让人重选；第二次提交才是 final。
   * 权重只认 final（避免一题记两次账），所以这里要答两枪。
   */
  click('pick', { index: '1' });
  click('submit');
  // 错题是在离开本题时落账的（practiceNext），不是提交那一刻
  click('next');
  const after2 = SHT2.devAudit.state();
  assert('答错一题后权重下降', after2.weights.answered === 2 && after2.weights.kp['vocab · library · 教室场所'].w < 0.5,
    JSON.stringify(after2.weights.kp['vocab · library · 教室场所']));
  assert('错题记录带走答错当时的权重快照',
    after2.wrongCases.length === 1 && typeof after2.wrongCases[0].weightAt === 'number',
    JSON.stringify(after2.wrongCases[0] || {}).slice(0, 120));

  const saved = JSON.parse(disk['sht-minimal-test-v2'] || '{}');
  assert('权重随存档落盘（刷新不丢）', saved.weights && saved.weights.answered === 2,
    JSON.stringify(saved.weights || {}).slice(0, 80));

  /*
   * 闭环的最后一段：答完一轮，学生得看到「下一轮会怎么变」。
   * 上面已经点完两题（一题对、一题提示后仍错），游标走到末尾，界面应该落在评价单上。
   */
  const summary = nodes['studentRoot'].innerHTML || '';
  assert('答完一轮，评价单上写着下一轮难度会怎么变',
    /下一轮(会难一点|会简单一点|难度不变)/.test(summary), summary.slice(0, 160));
  assert('这句反馈带具体依据（答了几题、对了几题）',
    /这一轮 \d+ 题答对 \d+ 题/.test(summary));
})();

console.log('\n' + (failed ? 'FAILED ' + failed : 'ALL PASS'));
if (failed) process.exitCode = 1;
