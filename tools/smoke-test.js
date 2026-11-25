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
require('../src/core/levelTrace.js');
require('../src/core/trend.js');
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

  /*
   * 疲劳判定：这是「学生累了要降级」的唯一入口，所以三条信号各测一次，
   * 外加「只慢一两题不能降档」——不然正常思考会被当成累，越练越简单。
   */
  const r = function (ms, correct) { return { durationMs: ms, correct: !!correct }; };
  const tired = SHT.learner.fatigueOf([r(3000, true), r(3000, true), r(12000, false), r(14000, false)]);
  assert('后半段明显变慢 + 连错，判为累了',
    tired.level === 'clear', JSON.stringify(tired));
  const steady = SHT.learner.fatigueOf([r(4000, true), r(5000, true), r(4000, true), r(5000, true)]);
  assert('答题节奏平稳，不判累', steady.level === 'none', steady.reason);
  const streak = SHT.learner.fatigueOf([r(4000, true), r(3000, false), r(3500, false), r(3000, false)]);
  assert('连错 3 题就判累，哪怕答得很快',
    streak.level === 'clear', JSON.stringify(streak));
  const mild = SHT.learner.fatigueOf([r(4000, true), r(3000, true), r(3500, false), r(3000, false)]);
  assert('只连错两题算「有点累」，不降档',
    mild.level === 'mild', JSON.stringify(mild));
  const tooFew = SHT.learner.fatigueOf([r(9000, false), r(9000, false)]);
  assert('样本太少先不判累，避免一开练就降级', tooFew.level === 'none', tooFew.reason);
})();

console.log('--- 句型依赖的词：词没稳住先补词，别记成句型不会 ---');
(function () {
  const kps = SHT.kpsOf('U1');
  const sent = kps.filter(function (k) { return k.targetType === 'sentence' && k.pathStage === 1; })[0];
  const word = SHT.kpByTargetId('U1:word:playground');
  assert('句型的依赖是从句子原文里找出来的，不是写死的',
    sent.requiresWords.indexOf('playground') >= 0 && sent.requiresWords.indexOf('classroom') >= 0,
    JSON.stringify(sent.requiresWords));
  assert('功能词不算依赖（This is a classroom 不该依赖 a / is）',
    sent.requiresWords.indexOf('is') < 0 && sent.requiresWords.indexOf('a') < 0,
    JSON.stringify(sent.requiresWords));
  assert('每个依赖都能反查到课程里的词目标',
    sent.requires.every(function (id) { return !!SHT.kpByTargetId(id); }));

  let seq = 0;
  const ev = [];
  function push(kp, correct) {
    seq += 1;
    ev.push({ seq: seq, qid: 'q' + seq, kp: kp, studentId: 'S-001', round: 2,
      ts: 1000 + seq * 100, type: 'submit',
      payload: { correct: correct, final: true, attemptIndex: 1, durationMs: 5000 } });
  }
  // 其他词都答对两次；playground 一错一对还不稳；句型答错过。
  kps.forEach(function (k) {
    if (k.label !== word.label && k.label !== sent.label) { push(k.label, true); push(k.label, true); }
  });
  push(word.label, true); push(word.label, false);
  push(sent.label, false);
  const model = SHT.learner.build(ev);
  const d = SHT.learner.decide(model, { layer: 'B', kps: kps, count: 5, weights: SHT.weights.blank() });
  const wi = d.items.map(function (it) { return it.kp; }).indexOf(word.label);
  const si = d.items.map(function (it) { return it.kp; }).indexOf(sent.label);
  assert('词不稳时：词排在句型前面', wi >= 0 && si > wi, wi + ' / ' + si);
  assert('句型标出欠哪个词', d.items[si].blockedBy.indexOf(word.label) >= 0,
    JSON.stringify(d.items[si].blockedBy));
  assert('选题理由写人话：句子里的 playground 还没稳住，先补词',
    /句子里的\s*playground\s*还没稳住，先补词/.test(d.items[si].reason), d.items[si].reason);
  assert('补词理由写清是句型在等它',
    /阶段1句型在等这个词/.test(d.items[wi].reason), d.items[wi].reason);
  const solid = d.items.filter(function (it) { return it.kp !== word.label && it.blockedBy.length === 0; });
  assert('已经稳住的词不背「句型在等它」的理由',
    solid.every(function (it) { return !/句型在等这个词/.test(it.reason); }));

  // 把 playground 也答对两次，句型就不该再被挡
  push(word.label, true); push(word.label, true);
  const m2 = SHT.learner.build(ev);
  const d2 = SHT.learner.decide(m2, { layer: 'B', kps: kps, count: 5, weights: SHT.weights.blank() });
  const s2 = d2.items.filter(function (it) { return it.kp === sent.label; })[0];
  assert('词稳住之后，句型不再被挡', s2 && s2.blockedBy.length === 0,
    s2 ? JSON.stringify(s2.blockedBy) : '句型没进选题单');
})();

console.log('--- 练了几天的方向：方向 / 广度 / 深度 ---');
(function () {
  const sessions = [
    { rounds: [{ right: 2, wrong: 3 }, { right: 3, wrong: 2 }] },
    { rounds: [{ right: 4, wrong: 1 }, { right: 4, wrong: 1 }] }
  ];
  const model = {
    byKp: {
      k1: { attempts: 3, wrong: 0, tendency: 'solid' },
      k2: { attempts: 2, wrong: 1, tendency: 'emerging' },
      k3: { attempts: 1, wrong: 1, tendency: 'unknown' }
    }
  };
  const trace = [{ from: '辨', to: '用' }, { from: '用', to: '表达' }];
  const t = SHT.trend.build({ sessions: sessions, levelTrace: trace, learnerModel: model, totalKps: 20 });
  assert('方向：前段正确率 40%，后段 80%，算出升高 40 个百分点',
    t.accuracy.first === 0.4 && t.accuracy.last === 0.8 && t.accuracy.delta === 0.4,
    JSON.stringify(t.accuracy));
  assert('广度：覆盖 3/20 个考点', t.coverage.known === 3 && t.coverage.total === 20,
    JSON.stringify(t.coverage));
  assert('深度：两个考点练过两次以上', t.coverage.deep === 2, String(t.coverage.deep));
  assert('还没掌握的数出来（不算已经 solid 的）', t.weakLeft === 2, String(t.weakLeft));
  assert('难度变化数得清：两次调整都是升高',
    t.difficulty.steps === 2 && t.difficulty.ups === 2, JSON.stringify(t.difficulty));
  assert('一句话里同时交代方向与广度深度',
    /正确率/.test(t.summary) && /广度/.test(t.summary) && /深度/.test(t.summary), t.summary);
  const one = SHT.trend.build({ sessions: [{ rounds: [{ right: 1, wrong: 0 }] }] });
  assert('只练一轮时明说样本不够，不硬判走势',
    one.accuracy.delta === null && /样本不够/.test(one.summary), one.summary);
})();

console.log('--- 难度台账要说人话：从第几级到第几级、凭什么 ---');
(function () {
  const up = {
    group: 1, round: 1, from: '辨', to: '用', source: 'weights',
    basis: { kind: 'weights', weight: 0.68, answered: 8, up: 0.6, down: 0.35 }
  };
  const e1 = SHT.levelTrace.explain(up);
  assert('主句说「难度升高 1 级」，两端带级别与含义',
    /难度升高 1 级/.test(e1.head) && /第 2 级「辨」（能分清/.test(e1.head) &&
    /第 3 级「用」（能自己用对）/.test(e1.head), e1.head);
  assert('凭什么写在一条里：做了几题、预计正确率、越过哪条线',
    /累计 8 题/.test(e1.why) && /68%/.test(e1.why) && /60% 的升档线/.test(e1.why), e1.why);

  const down = {
    group: 2, round: 1, from: '用', to: '辨', source: 'fatigue',
    basis: { kind: 'fatigue', drift: 3.1, slowRate: 0.5, streak: 2, sample: 8, capByPerf: '用' }
  };
  const e2 = SHT.levelTrace.explain(down);
  assert('降档说清是状态原因，并交代「只看正确率本该在哪」',
    /慢了 210%/.test(e2.why) && /这 8 题里有 4 题超过 20 秒/.test(e2.why) &&
    /连错 2 题/.test(e2.why) && /只看正确率本该停在第 3 级/.test(e2.why), e2.why);
  assert('主句说「难度降低 1 级」，两端是从第 3 级到第 2 级',
    /难度降低 1 级/.test(e2.head) && /从第 3 级/.test(e2.head) && /到第 2 级/.test(e2.head), e2.head);

  const old = { group: 1, round: 1, from: '', to: '用', source: 'weights', why: '累积权重 68%' };
  const e3 = SHT.levelTrace.explain(old);
  assert('老导出缺依据时如实说「凑不出」，不编',
    /旧版本/.test(e3.why) && /重新导出/.test(e3.why), e3.why);

  const same = { group: 1, round: 2, from: '用', to: '用', source: 'weights', basis: { kind: 'weights', weight: 0.5, answered: 6, up: 0.6, down: 0.35 } };
  const e4 = SHT.levelTrace.explain(same);
  assert('没调档时写「不变」，并说明数值落在区间内',
    /不变/.test(e4.head) && /之间，不该调档/.test(e4.why), e4.head + ' | ' + e4.why);
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
    prompt: '选出「教室」的英文。', options: ['classroom', 'library', 'playground'], answer: 'classroom',
    analysis: 'classroom 是教室，另外两个是图书馆和操场。',
    optionNotes: ['教室就是 classroom，选对了', 'library 是图书馆，不是教室', 'playground 是操场，不是教室']
  }];
  st.rounds[1].practice = Object.assign({}, st.rounds[1].practice, {
    cursor: 0, attempts: [], picked: null, revealed: null, shownAt: 0, draft: '', hintUsed: false
  });

  click('pick', { index: '0' });
  click('submit');
  const afterRight = nodes['studentRoot'].innerHTML || '';
  assert('答对也显示解析（像试卷答案一样讲这道题考什么）',
    /这道题考的是/.test(afterRight) && /classroom 是教室/.test(afterRight), afterRight.slice(0, 200));
  assert('答对时不显示「错在哪」那一块',
    !/错在哪/.test(afterRight));
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
    prompt: '选出「图书馆」的英文。', options: ['library', 'classroom', 'playground'], answer: 'library',
    analysis: 'library 是图书馆，别和教室 classroom 混。',
    optionNotes: ['图书馆就是 library', 'classroom 是教室，不是图书馆', 'playground 是操场，不是图书馆']
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
  const afterWrong = nodes['studentRoot'].innerHTML || '';
  assert('答错时单独给「错在哪」一块', /错在哪/.test(afterWrong), afterWrong.slice(0, 240));
  assert('「错在哪」写明他选的那项为什么错', /你选的/.test(afterWrong) && /classroom 是教室/.test(afterWrong));
  assert('「错在哪」也写明正确项为什么对', /正确的是/.test(afterWrong) && /图书馆就是 library/.test(afterWrong));
  assert('答错时解析照样在，不只写对错', /这道题考的是/.test(afterWrong) && /library 是图书馆/.test(afterWrong));
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
   * 学生端只负责答题：答完一轮的结果页只说「做完了、答对几题」和下一步按钮。
   * 表现分、四个比例、知识点评价、下一轮难度提示这些统计/记录一律不摆给学生，
   * 它们原样存在 round.report / levelTrace 里，开发视图 07「本轮评价」能看。
   */
  const summary = nodes['studentRoot'].innerHTML || '';
  assert('结果页只报完成与答对数，不摆评价单',
    /这一轮做完了/.test(summary) && /答对 \d+ 题/.test(summary), summary.slice(0, 180));
  assert('学生端不出现表现分、比例、掌握概率这些开发口径',
    !/表现分|掌握概率|预计答对率|难度档|独立答对|看提示后答对|自己答对/.test(summary));
  assert('学生端不出现难度变化提示（判定只留在导出）',
    !/下一轮会难一点|下一轮先出简单一点|保持这个节奏/.test(summary));
  assert('结果页仍给下一步按钮（流程不中断）',
    /data-st-action="(next-round|regroup|restart)"/.test(summary));
  // 数据没丢：报告仍在 round.report 里，开发能查
  const roundWithReport = SHT2.devAudit.state().rounds[SHT2.devAudit.state().round];
  assert('评价报告仍落盘在 round.report（只是不展示）',
    !!(roundWithReport && roundWithReport.report && roundWithReport.report.dimensions));
  const exported = SHT2.devAudit.exportPayload();
  assert('导出里带走了评价报告与难度台账',
    !!(exported.report && exported.report.dimensions) && Array.isArray(exported.levelTrace),
    'report=' + !!exported.report + ' levelTrace=' + Array.isArray(exported.levelTrace));

  /*
   * 定档规则：权重说他该考「用」层，但最近几题明显变慢又连错 → 降回「辨」。
   * source 要写成 fatigue，导出时才能分清「按表现降的」和「看他累了降的」。
   */
  const tiredModel = {
    recent: [
      { durationMs: 3000, correct: true }, { durationMs: 3000, correct: true },
      { durationMs: 12000, correct: false }, { durationMs: 14000, correct: false }
    ],
    answeredCount: 6, byKp: {}, eventCount: 40
  };
  const planTired = SHT2.devAudit.planCap(tiredModel, { answered: 8, cap: '用', weight: 0.55 });
  assert('状态不好时，难度档从「用」降回「辨」',
    planTired.cap === '辨' && planTired.source === 'fatigue', JSON.stringify(planTired.fatigue));
  const planFit = SHT2.devAudit.planCap(
    { recent: [], answeredCount: 0, byKp: {}, eventCount: 0 },
    { answered: 8, cap: '用', weight: 0.55 }
  );
  assert('状态正常时按权重定档，不无故降级',
    planFit.cap === '用' && planFit.source === 'weights');

  // 留痕进导出：开发能看「难度什么时候变过、谁定的」，学生端界面一个字不显示
  const payload = SHT2.devAudit.exportPayload();
  assert('导出带难度变化台账（levelTrace）', Array.isArray(payload.levelTrace));
})();

console.log('--- 模型少给计划也要出满题：补格子 ---');
(function () {
  const all = SHT.kpsOf('U1').map(function (k) {
    return { kp: k.label, ability: k.ability, id: k.id };
  });
  // 复现实际截图：配额要 5（vocab2/sentence1/phonics1/grammar1），模型只给 4 条
  const four = [
    { kp: all[0].kp, ability: all[0].ability, level: '认' },
    { kp: all[1].kp, ability: all[1].ability, level: '认' },
    { kp: all[6].kp, ability: all[6].ability, level: '用' },
    { kp: all[7].kp, ability: all[7].ability, level: '用' }
  ];
  const short = [
    { ability: 'phonics', want: 1, got: 0 },
    { ability: 'grammar', want: 1, got: 0 }
  ];
  const r = SHT.pipeline.fillPlanSlots(four, 5, { kpPool: all, short: short, cap: '用' });
  assert('4 条计划补到 5 条', r.plans.length === 5 && r.added.length === 1, r.plans.length + ' 条');
  assert('补的是配额缺的那一类（语音或语法）',
    r.added.length === 1 && ['phonics', 'grammar'].indexOf(r.added[0].ability) >= 0,
    JSON.stringify(r.added));
  assert('补的考点不在原计划里，不撞车',
    new Set(r.plans.map(function (p) { return p.kp; })).size === 5);
  assert('补的计划带来源标记，导出能看出是补的', r.added[0].fromPool === true);
  assert('原计划数组没被改动', four.length === 4);
  const enough = SHT.pipeline.fillPlanSlots(four, 4, { kpPool: all });
  assert('计划已够时不补，不硬塞第 5 条', enough.plans.length === 4 && enough.added.length === 0);
  const noPool = SHT.pipeline.fillPlanSlots(four, 9, { kpPool: all, cap: '用' });
  assert('候选不够也只补到能补的为止，不造假考点',
    noPool.plans.length <= all.length, noPool.plans.length + ' / 候选 ' + all.length);
})();

(function () {
  const planUser = SHT.ROLES.plan.user({
    bookName: '四上课程', bookMeta: { grade: '四年级', term: '上册', units: 10 },
    unit: SHT.BOOKS.current().units[0], want: 5, bench: 3,
    quota: { byAbility: { vocab: 2, sentence: 1, phonics: 1, grammar: 1 } },
    stage: {}, scope: [], brief: {}
  });
  assert('规划提示写明本轮正取条数，模型不能少给',
    /本轮正取 5 条/.test(planUser), planUser.slice(0, 120));
  const planSys = SHT.ROLES.plan.system();
  assert('规划硬约束要求给够条数，一条都不能少',
    /恰好给够/.test(planSys) && /一条都不能少/.test(planSys));
})();

console.log('--- 中文题干要忠实翻译英文答案，不多添信息 ---');
(function () {
  const gen = SHT.ROLES.generate.system();
  const ver = SHT.ROLES.verify.system();
  assert('生成提示要求中文题干是英文答案的逐点翻译',
    /逐点翻译/.test(gen) && /不许多写/.test(gen),
    gen.slice(gen.indexOf('14.'), gen.indexOf('14.') + 60));
  assert('生成提示用本题做过反例（我们学校 / in our school）',
    /我们学校有一个图书馆/.test(gen) && /in our school/.test(gen));
  assert('验证提示让验证者按 C4 查这种「题干多添地点」',
    /判 C4/.test(ver) && /我们学校有一个图书馆/.test(ver),
    ver.slice(ver.indexOf('3.2'), ver.indexOf('3.2') + 80));
  const c4 = SHT.ALL_CHECKS.filter(function (c) { return c.id === 'C4'; })[0];
  assert('C4 条款写明：答案没有的信息不许写进题干',
    /答案没有的信息不许写进题干/.test(c4.text), c4.text);
})();

console.log('\n' + (failed ? 'FAILED ' + failed : 'ALL PASS'));
if (failed) process.exitCode = 1;
