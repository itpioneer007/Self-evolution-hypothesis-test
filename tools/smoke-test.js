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

console.log('--- 单元切换 ---');
SHT.setBook('COURSE-G4A', 'U10');
assert('切到 U10 后课程切片正确', SHT.curriculum.id === 'U10' && SHT.curriculum.title === "What's her job?");
assert('U10 的考点只来自 U10', SHT.kpsOf('U10').every(k => k.unit === 'U10'));

console.log('\n' + (failed ? 'FAILED ' + failed : 'ALL PASS'));
if (failed) process.exitCode = 1;
