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
  const saved = JSON.parse(disk['sht-minimal-test-v2'] || '{}');
  assert('权重随存档落盘（刷新不丢）', saved.weights && saved.weights.answered === 1,
    JSON.stringify(saved.weights || {}).slice(0, 80));
})();

console.log('\n' + (failed ? 'FAILED ' + failed : 'ALL PASS'));
if (failed) process.exitCode = 1;
