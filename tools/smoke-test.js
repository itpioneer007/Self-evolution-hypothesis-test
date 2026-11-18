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
assert('每个单元生成 6 个候选考点',
  book.units.every(u => SHT.kpsOf(u.id).length === 6));
assert('共有 60 个候选考点', SHT.ALL_KPS().length === 60, String(SHT.ALL_KPS().length));
assert('考点 id 不重复', new Set(SHT.ALL_KPS().map(k => k.id)).size === 60);
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

console.log('--- 单元切换 ---');
SHT.setBook('COURSE-G4A', 'U10');
assert('切到 U10 后课程切片正确', SHT.curriculum.id === 'U10' && SHT.curriculum.title === "What's her job?");
assert('U10 的考点只来自 U10', SHT.kpsOf('U10').every(k => k.unit === 'U10'));

<<<<<<< HEAD
console.log('\n' + (failed ? 'FAILED ' + failed : 'ALL PASS'));
if (failed) process.exitCode = 1;
=======
console.log('--- v1 迁移 ---');
store = {
  'sht-minimal-test-v1': JSON.stringify({
    round: 1, activeNo: 1,
    rounds: {
      1: { questions: SHT.sampleQuestions.map(x => Object.assign({}, x, { checks: {} })), endedEarly: true, endReason: 'v1 依据', closed: true },
      2: { questions: [], endedEarly: false, endReason: '', closed: false }
    }
  })
};
delete require.cache[require.resolve('../src/app.js')];
try {
  require('../src/app.js');
  assert('v1 数据可迁移且 endedEarly 转成 SATURATED', count('stopPanel', 'data-stop="SATURATED"') === 1);
} catch (err) {
  assert('v1 数据可迁移且 endedEarly 转成 SATURATED', false, err.message);
}

console.log('--- v2 → v3 迁移：清掉预置的示例错题 ---');
/*
 * v2 的存档里，错题本是启动时按知识点预生成的示例，学生一题没答就有 3 条。
 * 光改 defaultState 不够：老存档里那三条还躺着，用户刷新页面看起来就像没修。
 * 迁移必须只删示例、留住真实作答写入的记录，否则等于把真错题一起清了。
 */
store = {
  'sht-minimal-test-v2': JSON.stringify({
    version: 2, bookId: 'PEP-G4A', unitId: 'U1', tab: 'wrongbook', agent: 'course',
    round: 1, activeNo: 1, learningLayer: 'B',
    rounds: {
      1: { questions: SHT.sampleQuestions.map(x => Object.assign({}, x, { checks: {} })), practice: { attempts: [] } },
      2: { questions: [], practice: { attempts: [] } }
    },
    wrongCases: [
      // 预生成的示例：id 末段是 kpId，时间写死在 11-04，没有诊断结论
      { id: 'wq:S-001:G4-上-U1:kp-U1-01', kpId: 'kp-U1-01', unitId: 'G4-上-U1', knowledgePoint: 'spelling · blackboard', ability: 'spelling', category: '形近混淆', variantAttempts: [], firstAttemptEvidence: { completedAt: '2026-11-04T09:10:00' }, masteryState: 'wrong', createdAt: '2026-11-04T09:10:00' },
      // 真实作答写入的：id 末段是 qid，带诊断，时间在当天
      { id: 'wq:S-001:G4-上-U1:q3', kpId: 'kp-U1-02', unitId: 'G4-上-U1', knowledgePoint: 'vocab · window', ability: 'vocab', category: '近义混淆', diagnosis: { causeId: '近义混淆', confidence: .6 }, variantAttempts: [], firstAttemptEvidence: { completedAt: '2026-11-12T10:00:00Z' }, masteryState: 'wrong', createdAt: '2026-11-12T10:00:00Z' }
    ]
  })
};
delete require.cache[require.resolve('../src/app.js')];
try {
  require('../src/app.js');
  assert('v2 存档里的预置示例被清掉，真实记录留下',
    count('wrongList', 'class="wrong-card') === 1 && nodes.wrongList.innerHTML.indexOf('vocab · window') >= 0 &&
    nodes.wrongList.innerHTML.indexOf('spelling · blackboard') < 0,
    count('wrongList', 'class="wrong-card') + ' / ' + nodes.wrongList.innerHTML.slice(0, 80));
} catch (err) {
  assert('v2 存档里的预置示例被清掉，真实记录留下', false, err.message);
}

/* ================= 多版本教材 ================= */
console.log('--- 多版本教材 ---');
const BOOKS = SHT.BOOKS;
assert('入库三本教材', BOOKS.list().length === 3, BOOKS.list().map(b => b.id).join(','));
assert('三本书的单元数不同（PEP 6 / 冀教 4 / 湘少 12）',
  BOOKS.get('PEP-G4A').units.length === 6 && BOOKS.get('HEB-G4A').units.length === 4 && BOOKS.get('XS-G4A').units.length === 12,
  [BOOKS.get('PEP-G4A').units.length, BOOKS.get('HEB-G4A').units.length, BOOKS.get('XS-G4A').units.length].join('/'));
assert('每本书都有自己的功能词白名单', BOOKS.list().every(b => {
  const bk = BOOKS.get(b.id);
  return Array.isArray(bk.meta.allowedFunctionWords) && bk.meta.allowedFunctionWords.length > 30;
}));
assert('词表全部带书上页码', BOOKS.all().every(b => b.units.every(u => u.words.every(w => typeof w.p === 'number' && w.p > 0))));
assert('每单元至少 1 条句型', BOOKS.all().every(b => b.units.every(u => u.sentencePatterns.length >= 1)));
assert('登记时没有结构错误', BOOKS.all().every(b => (b.meta.warnings || []).every(w => w.indexOf('缺') < 0)),
  BOOKS.all().map(b => b.meta.id + ':' + b.meta.warnings.join('|')).join(' / '));

SHT.setBook('HEB-G4A');
assert('切到冀教：切片换成 The Clothes We Wear', SHT.curriculum.bookId === 'HEB-G4A' && SHT.curriculum.title === 'The Clothes We Wear');
assert('切书时功能词白名单跟着换', SHT.curriculum.allowedFunctionWords.includes('straight') === true);
assert('切书后候选换成冀教自己的清单（PEP 的 33 条不外借）',
  SHT.kpsOf(SHT.curriculum.id).length === 6 &&
  SHT.kpsOf(SHT.curriculum.id).every(k => k.id.indexOf('hb-') === 0),
  SHT.kpsOf(SHT.curriculum.id).length + ' 条');
assert('超纲判定用冀教的边界：shirt 过、blackboard 拦',
  SHT.validateQuestion({ knowledgePoint: 'x', cell: { type: '中英匹配', scene: '身体与衣物', level: '认', distractor: '同类不同物' },
    prompt: '选出「衬衫」的英文。', audioText: '', options: ['shirt', 'skirt', 'coat'], answer: 'shirt', analysis: 'shirt 是衬衫。' },
    SHT.curriculum, {}).pass === true &&
  SHT.validateQuestion({ knowledgePoint: 'x', cell: { type: '中英匹配', scene: '身体与衣物', level: '认', distractor: '同类不同物' },
    prompt: '选出「衬衫」的英文。', audioText: '', options: ['shirt', 'skirt', 'blackboard'], answer: 'shirt', analysis: 'shirt 是衬衫。' },
    SHT.curriculum, {}).pass === false);

/* ================= 另两册的候选清单 ================= */
// 清单是「换考点」与「自动配额」的输入。这里只查清单本身合不合规，不动当前教材——
// 上面的用例已经把当前书切到冀教，后面还有用例依赖它。
console.log('--- 另两册的候选清单 ---');
const HB_BOOK = SHT.BOOKS.get('HEB-G4A');
const XS_BOOK = SHT.BOOKS.get('XS-G4A');
const HB_ALL = SHT.KPS_BY_BOOK['HEB-G4A'];
const XS_ALL = SHT.KPS_BY_BOOK['XS-G4A'];
const sceneOfUnit = (book, unitId) => SHT.SCENE_OF_DOMAIN[book.getUnit(unitId).topicDomain];
assert('冀教 4 单元 × 6 条 = 24 条候选', HB_ALL.length === 24, HB_ALL.length + ' 条');
assert('湘少 12 单元 × 3 条 = 36 条候选', XS_ALL.length === 36, XS_ALL.length + ' 条');
assert('两册每条的四维、错因、依据都在枚举内',
  HB_ALL.concat(XS_ALL).every(k => typeIds.includes(k.cell.type) && SHT.SCENES.includes(k.cell.scene) &&
    SHT.LEVELS.includes(k.cell.level) && SHT.DISTRACTORS.includes(k.cell.distractor) &&
    causeIds.includes(k.cause) && k.source && k.example && k.why && k.nextIfWrong));
assert('两册都没有语音板块 → 一条 phonics / 辨音都不排',
  HB_ALL.concat(XS_ALL).every(k => k.ability !== 'phonics' && k.cell.type !== '字母组合辨音'));
assert('两册候选的情境落在各自单元话题域',
  HB_ALL.every(k => k.cell.scene === sceneOfUnit(HB_BOOK, k.unit)) &&
  XS_ALL.every(k => k.cell.scene === sceneOfUnit(XS_BOOK, k.unit)));
assert('每条候选的 unit 都属于这本书', HB_ALL.every(k => !!HB_BOOK.getUnit(k.unit)) &&
  XS_ALL.every(k => !!XS_BOOK.getUnit(k.unit)));
const allKpIds = SHT.ALL_KPS().map(k => k.id);
assert('三册 93 条候选的 id 不重复', allKpIds.length === 93 && allKpIds.length === new Set(allKpIds).size, allKpIds.length);
assert('按 id / 按 label 都能跨册反查到', !!SHT.kpById('hb-U1-01') && !!SHT.kpByLabel(XS_ALL[0].label));
assert('没建清单的册子返回空，不借别册', SHT.kpsOf !== undefined &&
  (SHT.KPS_BY_BOOK['NOPE-G4A'] || []).length === 0);

/* ================= 代码闸八条 ================= */
console.log('--- 代码闸 ---');
const G_UNIT = SHT.BOOKS.get('XS-G4A').getUnit('U11');
const G_CUR = Object.assign({}, G_UNIT, {
  allowedFunctionWords: SHT.BOOKS.get('XS-G4A').meta.allowedFunctionWords
});
const goodQ = {
  knowledgePoint: '方位 · under · 介词混淆', ability: 'sentence',
  cell: { type: '选词填空', scene: '家庭', level: '用', distractor: '语义近' },
  prompt: 'Where is the pencil? — It is ___ the desk.', audioText: '',
  options: ['under', 'in', 'on'], answer: 'under', analysis: '桌子下面用 under。'
};
assert('V1–V8 全过的题判通过', SHT.validateQuestion(goodQ, G_CUR, {}).pass === true);
const v1 = SHT.validateQuestion(Object.assign({}, goodQ, { options: ['under', 'in', 'curtain'] }), G_CUR, {});
assert('V1 抓超纲词', v1.fails.some(f => f.id === 'V1' && f.detail.includes('curtain')), SHT.failsText(v1));
const v2 = SHT.validateQuestion(Object.assign({}, goodQ, { answer: 'behind' }), G_CUR, {});
assert('V2 抓答案不在选项里', v2.fails.some(f => f.id === 'V2'), SHT.failsText(v2));
const v3 = SHT.validateQuestion(Object.assign({}, goodQ, { options: ['under', 'under', 'on'] }), G_CUR, {});
assert('V3 抓选项重复', v3.fails.some(f => f.id === 'V3'), SHT.failsText(v3));
const v4 = SHT.validateQuestion(Object.assign({}, goodQ, { prompt: 'It is under the desk.' }), G_CUR, {});
assert('V4 抓题干泄答案', v4.fails.some(f => f.id === 'V4'), SHT.failsText(v4));
const v5 = SHT.validateQuestion(Object.assign({}, goodQ, { analysis: '本题考查介词用法的掌握情况以及空间关系的表达能力，需要学生区分 in on under 三个介词在具体语境中的不同含义' }), G_CUR, {});
assert('V5 抓解析过长', v5.fails.some(f => f.id === 'V5'), SHT.failsText(v5));
const v6 = SHT.validateQuestion({
  knowledgePoint: '词汇 · cat · 听辨', cell: { type: '听音选义', scene: '家庭', level: '认', distractor: '音近' },
  prompt: '听录音，选出你听到的单词。', audioText: '', options: ['猫', '狗', '盒子'], answer: '猫', analysis: 'cat 是猫。'
}, G_CUR, {});
assert('V6 抓听力题没有原文', v6.fails.some(f => f.id === 'V6'), SHT.failsText(v6));
const v8 = SHT.validateQuestion(goodQ, G_CUR, { others: [goodQ] });
assert('V8 抓同轮同格', v8.fails.some(f => f.id === 'V8'), SHT.failsText(v8));
assert('拼写题不按超纲判干扰项（故意写错的词）', SHT.validateQuestion({
  knowledgePoint: '拼写 · skirt · 形近', cell: { type: '拼写补全', scene: '身体与衣物', level: '辨', distractor: '形近' },
  prompt: '选出「裙子」的正确拼写。', audioText: '', options: ['skirt', 'skrit', 'skirtt'], answer: 'skirt', analysis: 'skirt 中间是 ir。'
}, SHT.BOOKS.get('HEB-G4A').units[0], {}).pass === true);
const v3c = SHT.validateQuestion({
  knowledgePoint: '拼写 · trousers · 形近', cell: { type: '拼写补全', scene: '身体与衣物', level: '辨', distractor: '形近' },
  prompt: '选出「裤子」的正确拼写。', audioText: '', options: ['trousers', 'curtain', 'zebra'], answer: 'trousers', analysis: '看清词形再选。'
}, SHT.BOOKS.get('HEB-G4A').units[0], {});
assert('V3c 抓拼写题里「其实是个真词」的干扰项', v3c.fails.some(f => f.id === 'V3c'), SHT.failsText(v3c));
const pho = SHT.validateQuestion({
  knowledgePoint: 'phonics · a / a-e · cake 与 cat', ability: 'phonics',
  cell: { type: '字母组合辨音', scene: '学校', level: '辨', distractor: '音近' },
  prompt: '听录音，选出你听到的单词。', audioText: 'cake', options: ['cake', 'cat', 'hat'], answer: 'cake',
  analysis: 'a-e 读字母音，cat 读短音。'
}, SHT.BOOKS.get('PEP-G4A').getUnit('U1'), {});
assert('语音点里的对比词对不算超纲（cake / cat 不在词表但学过的）',
  !pho.fails.some(f => f.id === 'V1'), SHT.failsText(pho));
const anaOpt = SHT.validateQuestion({
  knowledgePoint: 'spelling · blackboard · oa + ar', cell: { type: '拼写补全', scene: '学校', level: '辨', distractor: '形近' },
  prompt: '选出「黑板」的正确拼写。', audioText: '', options: ['blackboard', 'blackbord', 'blakboard'], answer: 'blackboard',
  analysis: 'blakboard 少 c，blackbord 少 a。'
}, SHT.BOOKS.get('PEP-G4A').getUnit('U1'), {});
assert('解析引用本题选项里的错拼不算超纲', !anaOpt.fails.some(f => f.id === 'V1'), SHT.failsText(anaOpt));
assert('听音题题干不许把要听的词写出来', SHT.validateQuestion({
  knowledgePoint: 'vocab · fan · 音义联结', cell: { type: '听音选义', scene: '学校', level: '认', distractor: '同类不同物' },
  prompt: '听音选义：选出「fan」的中文意思。', audioText: 'fan', options: ['风扇', '电灯', '门'], answer: '风扇', analysis: 'light 是电灯。'
}, SHT.BOOKS.get('PEP-G4A').getUnit('U1'), {}).fails.some(f => f.id === 'V6'));

assert('解析拆解词根（black + board）不算超纲', !SHT.validateQuestion({
  knowledgePoint: 'spelling · blackboard · oa + ar', cell: { type: '拼写补全', scene: '学校', level: '辨', distractor: '形近' },
  prompt: '选出「黑板」的正确拼写。', audioText: '', options: ['blackboard', 'blackbord', 'blakboard'], answer: 'blackboard',
  analysis: 'black board 两个词合起来，oa 和 ar 都不能省。'
}, SHT.BOOKS.get('PEP-G4A').getUnit('U1'), {}).fails.some(f => f.id === 'V1'));
assert('V3c 不误伤字母顺序颠倒的错拼（sheo / sohe）', SHT.validateQuestion({
  knowledgePoint: 'spelling · shoe · 形近', cell: { type: '拼写补全', scene: '身体与衣物', level: '辨', distractor: '形近' },
  prompt: '选出「鞋」的正确拼写。', audioText: '', options: ['shoe', 'sheo', 'sohe'], answer: 'shoe', analysis: 'o 在 h 后面。'
}, SHT.BOOKS.get('HEB-G4A').units[0], {}).pass === true);
assert('V3c 不误伤少字母的错拼（blackbord / blakboard）', SHT.validateQuestion({
  knowledgePoint: 'spelling · blackboard · oa + ar', cell: { type: '拼写补全', scene: '学校', level: '辨', distractor: '形近' },
  prompt: '选出「黑板」的正确拼写。', audioText: '', options: ['blackboard', 'blackbord', 'blakboard'], answer: 'blackboard', analysis: 'oa 和 ar 两个组合都不能省。'
}, SHT.BOOKS.get('PEP-G4A').getUnit('U1'), {}).pass === true);

/* ================= 格子分配 ================= */
console.log('--- 格子分配（代码，不让模型碰） ---');
SHT.setBook('XS-G4A', 'U1');
const fivePlans = [
  { kp: 'a', ability: 'vocab', level: '认', cause: '形近' },
  { kp: 'b', ability: 'vocab', level: '认', cause: '形近' },
  { kp: 'c', ability: 'sentence', level: '用', cause: '语义近' },
  { kp: 'd', ability: 'phonics', level: '辨', cause: '音近' },
  { kp: 'e', ability: 'spelling', level: '辨', cause: '形近' }
];
const cells = [];
fivePlans.forEach((p, i) => cells.push(SHT.pickCell(p, cells, SHT.curriculum, i)));
assert('5 行计划分到 5 个不同格子', new Set(cells.map(c => SHT.cellKey(c))).size === 5, cells.map(c => SHT.cellKey(c)).join(' | '));
assert('格子四维全部落在枚举内', cells.every(c =>
  SHT.QUESTION_TYPES.some(t => t.id === c.type) && SHT.SCENES.includes(c.scene) &&
  SHT.LEVELS.includes(c.level) && SHT.DISTRACTORS.includes(c.distractor)));
assert('场景从单元话题域映射，不乱填', cells[0].scene === '学校', cells[0].scene);

/* ================= 下一轮 brief ================= */
console.log('--- 下一轮 brief ---');
const brief = SHT.pipeline.buildBrief({
  unitId: 'U1',
  rounds: [{ questions: [], practice: { attempts: [
    { no: 1, stage: 'first', kpLabel: '真会考点', correct: true, hintCount: 0 },
    { no: 1, stage: 'variant', kpLabel: '真会考点', correct: true, hintCount: 0 },
    { no: 2, stage: 'first', kpLabel: '半会考点', correct: true, hintCount: 0 },
    { no: 2, stage: 'variant', kpLabel: '半会考点', correct: false, hintCount: 0 }
  ] } }],
  wrongCases: [
    { knowledgePoint: '错两次的考点', ability: 'vocab', category: '形近', masteryState: 'wrong', variantAttempts: [{ correct: false, hintCount: 0 }], firstAttemptEvidence: { hintCount: 0 }, remediationLoopCount: 0 },
    { knowledgePoint: '错一次的考点', ability: 'vocab', category: '形近', masteryState: 'wrong', variantAttempts: [], firstAttemptEvidence: { hintCount: 0 }, remediationLoopCount: 0 }
  ]
});
assert('brief 带着错题优先级', brief.priority.length >= 1 && brief.priority[0].kp === '错两次的考点',
  JSON.stringify(brief.priority.map(p => p.kp)));
assert('brief 记下已真会的考点', brief.mastered.includes('真会考点'), brief.mastered.join(','));
assert('错题本里已掌握的考点也进 mastered（跨轮的唯一真凭据）',
  SHT.pipeline.buildBrief({
    unitId: 'U1', rounds: [],
    wrongCases: [{ knowledgePoint: '已掌握考点', kpId: 'kp-x', ability: 'vocab', masteryState: 'mastered', variantAttempts: [], firstAttemptEvidence: { hintCount: 0 } }]
  }).mastered.includes('已掌握考点'));
assert('brief 把上一轮那道原题带给生成方当反例',
  SHT.pipeline.buildBrief({
    unitId: 'U1', rounds: [],
    wrongCases: [{
      knowledgePoint: '错题考点', kpId: 'kp-1', ability: 'vocab', category: '形近',
      questionSnapshot: '选出「讲台」的英文。', masteryState: 'wrong',
      variantAttempts: [], firstAttemptEvidence: { hintCount: 0 }, remediationLoopCount: 0
    }]
  }).priority[0].prevPrompt === '选出「讲台」的英文。');
assert('两枪都对的考点不会再被优先出', brief.priority.every(p => p.kp !== '真会考点'));
assert('brief 是结构化字段，不是一段话', typeof brief.levelHint === 'string' && Array.isArray(brief.blockedCells));
/*
 * 错题落库时 unitId 存的是教材单元 id（G4-上-U1 / HEB4-上-U1），brief 传的是册内 id（U1）。
 * 只比一个的话所有错题都会被滤掉，课程角色读不到任何错题 ——
 * 界面照常显示错题，但「根据错题出下一轮」这件事悄悄失效。
 *
 * 这里必须按「当前册」取 hostUnitId：早期修复误用了 root.SHT_BOOK，
 * 那是 textbook.js 里的旧单册数据集（只有人教），getUnit('U1') 永远返回人教那条，
 * 多册并存时会把别册的错题当成自己的。这类错，只有换到非人教册才暴露。
 */
const curBook = SHT.BOOKS.current();
const curU1 = curBook.getUnit('U1');
const hostOfU1 = curU1 ? curU1.hostUnitId : 'G4-上-U1';
const otherHost = hostOfU1 === 'G4-上-U1' ? 'HEB4-上-U1' : 'G4-上-U1';
const briefUnitId = SHT.pipeline.buildBrief({
  unitId: 'U1', rounds: [],
  wrongCases: [{ knowledgePoint: '按教材单元 id 存的错题', kpId: 'kp-u', ability: 'vocab', unitId: hostOfU1, masteryState: 'wrong', variantAttempts: [], firstAttemptEvidence: { hintCount: 0 }, remediationLoopCount: 0 }]
});
assert('错题按教材单元 id 存，也要能被 brief 认出来',
  briefUnitId.priority.length === 1 && briefUnitId.priority[0].kp === '按教材单元 id 存的错题',
  JSON.stringify(briefUnitId.priority.map(p => p.kp)) + ' / 当前册 ' + curBook.meta.id + ' hostUnitId ' + hostOfU1);
const briefOtherUnit = SHT.pipeline.buildBrief({
  unitId: 'U1', rounds: [],
  wrongCases: [{ knowledgePoint: '别的单元的错题', kpId: 'kp-o', ability: 'vocab', unitId: otherHost, masteryState: 'wrong', variantAttempts: [], firstAttemptEvidence: { hintCount: 0 }, remediationLoopCount: 0 }]
});
assert('别的册/别的单元的错题不会串进本单元 brief', briefOtherUnit.priority.length === 0,
  JSON.stringify(briefOtherUnit.priority.map(p => p.kp)) + ' / 拿 ' + otherHost + ' 试的');

/* ================= 三个角色各自的记忆 ================= */
console.log('--- 角色记忆 ---');
const MEM0 = SHT.agentMemory.blank();
const MEM1 = SHT.agentMemory.commit(MEM0, {
  questions: [{ knowledgePoint: 'vocab · shirt', cell: { type: '中英匹配', scene: '身体与衣物', level: '认', distractor: '同类不同物' } }],
  failures: [
    { stage: 'validate', codes: ['V1'] },
    { stage: 'validate', codes: ['V1'] },
    { stage: 'verify', codes: ['VERIFY_NO_CODE'] }
  ]
});
assert('记忆按角色分开写：plan 记角度与考点', MEM1.plan.cells.length === 1 && MEM1.plan.kps[0] === 'vocab · shirt');
assert('generate 记「最常被退回的条款」', MEM1.generate.fails.V1 === 2);
assert('verify 记自己的无效否决次数', MEM1.verify.noCodeCount === 1);
assert('commit 不改入参（纯函数）', MEM0.plan.rounds === 0 && MEM0.generate.fails.V1 === undefined);
assert('plan 记忆会写进出题提示词', SHT.agentMemory.recallText(MEM1, 'plan').indexOf('别重复') >= 0);
assert('verify 记忆会提醒它给条款号', SHT.agentMemory.recallText(MEM1, 'verify').indexOf('没给条款号') >= 0);
assert('没有记忆时不留占位噪音', SHT.agentMemory.recallText(MEM0, 'plan') === '');
assert('卡片摘要能读出一轮记忆', SHT.agentMemory.summary(MEM1, 'plan').indexOf('已记 1 轮') === 0);

/* ================= 解析与逐项说明 ================= */
console.log('--- 解析：只在答错时给，且逐项说 ---');
{
  const qn = { options: ['shirt', 'skirt', 'coat'], answer: 'shirt', optionNotes: ['shirt 是衬衫', 'skirt 是裙子', 'coat 是大衣'] };
  const html = SHT.optionNotesHtml(qn, { picked: 'skirt', expected: 'shirt' });
  assert('逐项说明把「你选的 / 正确 / 另一项」三行都列出来',
    html.indexOf('你选 B') >= 0 && html.indexOf('正确 A') >= 0 && html.indexOf('C') >= 0,
    html.replace(/<[^>]+>/g, ' ').slice(0, 60));
  assert('逐项说明带上每项的具体理由',
    html.indexOf('skirt 是裙子') >= 0 && html.indexOf('shirt 是衬衫') >= 0);
  const partial = SHT.optionNotesHtml(
    { options: ['a', 'b', 'c'], answer: 'a', optionNotes: ['a 对', '', ''] },
    { picked: 'b', expected: 'a' });
  assert('缺说明的项宁可不显示，不硬编', partial.indexOf('你选 B') < 0 && partial.indexOf('正确 A') >= 0);

  // 代码闸 V9：解析自己承认另一个选项也成立
  const v9 = SHT.validateQuestion({
    knowledgePoint: 'x', cell: { type: '选词填空', scene: '学校', level: '用', distractor: '语法错形' },
    prompt: '___ help you.', audioText: '', options: ['Let me', "Let's", 'Let'], answer: 'Let me',
    analysis: '又不一定只能我来帮你，也可以我们来帮你。'
  }, SHT.curriculum, {});
  assert('解析自证两解 → 代码闸 V9 拦下', !v9.pass && v9.fails.some(f => f.id === 'V9'),
    JSON.stringify(v9.fails.map(f => f.id)));
  const v9ok = SHT.validateQuestion({
    knowledgePoint: 'x', cell: { type: '选词填空', scene: '学校', level: '用', distractor: '语法错形' },
    prompt: '___ help you.', audioText: '', options: ['Let me', "Let's", 'Let'], answer: 'Let me',
    analysis: "不能选 Let's，虽然它也可以，但这里只有我能帮你。"
  }, SHT.curriculum, {});
  assert('否定语境里提到「也可以」不误判', !v9ok.fails.some(f => f.id === 'V9'),
    JSON.stringify(v9ok.fails.map(f => f.id)));
}

/* ================= 失败记录：按轮次算 ================= */
console.log('--- 失败记录按轮 ---');
{
  const at1 = '2026-11-12T10:00:00.000Z';
  const at2 = '2026-11-12T11:00:00.000Z';
  const list = [
    { round: 1, at: at1, codes: ['V1'] },
    { round: 2, at: at2, codes: ['V1'] },
    { round: 2, at: at2, codes: ['V3c'] },
    { at: at2, codes: ['V2'] }   // 老数据：没有 round，只能按本轮开始时间兜底
  ];
  assert('带轮次的按轮次算', SHT.failuresOfRound(2, list, at2).length === 3,
    String(SHT.failuresOfRound(2, list, at2).length));
  assert('老数据靠开始时间兜底，不把上一轮的账算进来',
    SHT.failuresOfRound(2, list, at2).every(f => String(f.at) >= at2));
}

/* ================= 流水线（mock 模型） ================= */
console.log('--- 流水线：规划 → 生成 → 闸 → 质检 → 退回重出 ---');
SHT.setBook('HEB-G4A', 'U1');
const REAL_CALL = SHT.llm.call;
const PLAN_OK = { ok: true, json: { plans: [{ kp: 'vocab · shirt · 音义联结', ability: 'vocab', cause: '形近', whyThisOne: '本单元首个衣物词', nextIfWrong: '先做中英匹配', level: '认' }] }, tokens: 10, ms: 1 };
function qJson(over) {
  return Object.assign({
    prompt: '选出「衬衫」的英文。', audioText: '', options: ['shirt', 'skirt', 'coat'],
    answer: 'shirt', analysis: 'shirt 是衬衫，skirt 是裙子。', keyword: 'shirt'
  }, over || {});
}

async function runCase(name, script, expect) {
  let i = 0;
  SHT.llm.call = async function () {
    const f = script[Math.min(i, script.length - 1)];
    i += 1;
    return f();
  };
  const out = await SHT.pipeline.runRound({ unit: SHT.curriculum, count: 1, brief: {}, existing: [] });
  expect(out, name);
}

(async function () {
  await runCase('一次通过：规划 + 生成 + 质检', [
    () => PLAN_OK,
    () => ({ ok: true, json: qJson(), tokens: 10, ms: 1 }),
    () => ({ ok: true, json: { verdict: 'pass' }, tokens: 10, ms: 1 })
  ], (out) => {
    assert('流水线一次通过时采到 1 题', out.questions.length === 1 && out.failures.length === 0,
      out.questions.length + ' / ' + out.failures.length);
    assert('采纳的题带格子与模型判定', out.questions[0].cell && out.questions[0].modelVerdict === 'pass');
    assert('格子由代码分配，不由模型给', out.questions[0].cell.type === out.plans[0].cell.type);
  });

  await runCase('代码闸退回后重出', [
    () => PLAN_OK,
    () => ({ ok: true, json: qJson({ options: ['shirt', 'skirt', 'blackboard'] }), tokens: 10, ms: 1 }),
    () => ({ ok: true, json: qJson(), tokens: 10, ms: 1 }),
    () => ({ ok: true, json: { verdict: 'pass' }, tokens: 10, ms: 1 })
  ], (out) => {
    const gate = out.failures.filter(f => f.stage === 'validate');
    assert('超纲的那一版被代码闸退回', gate.length === 1 && gate[0].codes.includes('V1'), JSON.stringify(gate.map(g => g.codes)));
    assert('退回后重出，最终采纳 1 题', out.questions.length === 1);
  });

  await runCase('质检退回后重出', [
    () => PLAN_OK,
    () => ({ ok: true, json: qJson(), tokens: 10, ms: 1 }),
    () => ({ ok: true, json: { verdict: 'fail', fails: [{ id: 'F5', reason: '题干提到上次做错' }] }, tokens: 10, ms: 1 }),
    () => ({ ok: true, json: qJson({ prompt: '选出「衬衫」的英文。' }), tokens: 10, ms: 1 }),
    () => ({ ok: true, json: { verdict: 'pass' }, tokens: 10, ms: 1 })
  ], (out) => {
    assert('质检否决写进失败记录并带条款号',
      out.failures.some(f => f.stage === 'verify' && f.codes.includes('F5')),
      JSON.stringify(out.failures.map(f => f.stage + ':' + f.codes)));
  });

  await runCase('三次都没过闸 → 放弃，不硬塞', [
    () => PLAN_OK,
    () => ({ ok: true, json: qJson({ options: ['shirt', 'skirt', 'blackboard'] }), tokens: 10, ms: 1 })
  ], (out) => {
    assert('放弃时一道题都不落库', out.questions.length === 0);
    assert('放弃也要留原因', out.failures.some(f => f.stage === 'giveup'));
  });

  await runCase('质检接口失败 → 采纳但标未复核', [
    () => PLAN_OK,
    () => ({ ok: true, json: qJson(), tokens: 10, ms: 1 }),
    () => ({ ok: false, error: { type: 'timeout', message: '超过 90 秒没返回' }, ms: 90000 })
  ], (out) => {
    assert('质检挂掉不废题，但标记未复核', out.questions.length === 1 && out.questions[0].modelVerdict === 'unverified');
    assert('质检失败本身进失败记录', out.failures.some(f => f.stage === 'verify'));
  });

  await runCase('规划两次都失败 → 整轮不出题', [
    () => ({ ok: false, error: { type: 'network', message: '网络不通' }, ms: 1 })
  ], (out) => {
    assert('规划失败不产出题', out.questions.length === 0 && out.ok === false);
    assert('规划失败带错误类型', out.failures.every(f => f.codes.length > 0));
  });

  // 考点去重：模型把同一个考点给两条时，只排一道，另一条记 PLAN_DUP
  await (function () {
    const dupPlan = {
      ok: true, tokens: 10, ms: 1,
      json: {
        plans: [
          { kp: 'vocab · shirt · 音义联结', ability: 'vocab', cause: '形近', whyThisOne: '核心词', nextIfWrong: '先配对', level: '认' },
          { kp: 'Vocab ·  Shirt · 音义联结', ability: 'spelling', cause: '形近', whyThisOne: '换个说法再说一遍', nextIfWrong: '先配对', level: '辨' }
        ]
      }
    };
    let k = 0;
    const script = [
      () => dupPlan,
      () => ({ ok: true, json: qJson(), tokens: 10, ms: 1 }),
      () => ({ ok: true, json: { verdict: 'pass' }, tokens: 10, ms: 1 })
    ];
    SHT.llm.call = async function () { const f = script[Math.min(k, script.length - 1)]; k += 1; return f(); };
    return SHT.pipeline.runRound({ unit: SHT.curriculum, count: 2, brief: {}, existing: [] }).then((out) => {
      assert('同一考点给两条时只排一道', out.plans.length === 1, JSON.stringify(out.plans.map(p => p.kp)));
      assert('被去掉的重复考点进失败记录', out.failures.some(f => f.codes.includes('PLAN_DUP')),
        JSON.stringify(out.failures.map(f => f.codes)));
      assert('去重后题号重排，不留空号', out.plans[0].no === 1);
    });
  })();

  // 选定知识点范围：范围外的考点不许进这一轮，提示词要真带上范围
  const SCOPE = [{ id: 'k1', label: 'vocab · shirt · 音义联结', ability: 'vocab', cell: { type: '中英匹配', scene: '身体与衣物', level: '认', distractor: '同类不同物' } }];
  assert('规划提示词里带着选定范围', SHT.ROLES.plan.user({
    bookName: 'PEP', bookMeta: { grade: '四', term: '上', units: 6 },
    unit: SHT.curriculum, brief: {}, blockedCells: [], count: 1, scope: SCOPE
  }).indexOf('vocab · shirt · 音义联结') >= 0);

  await (function () {
    let n = 0;
    const script = [
      () => ({ ok: true, tokens: 10, ms: 1, json: { plans: [{ kp: 'vocab · 范围外的考点 · 自造', ability: 'vocab', level: '认' }] } }),
      () => ({ ok: true, tokens: 10, ms: 1, json: { plans: [{ kp: 'vocab · shirt · 音义联结', ability: 'vocab', cause: '形近', nextIfWrong: '先配对', level: '认' }] } }),
      () => ({ ok: true, json: qJson(), tokens: 10, ms: 1 }),
      () => ({ ok: true, json: { verdict: 'pass' }, tokens: 10, ms: 1 })
    ];
    SHT.llm.call = async function () { const f = script[Math.min(n, script.length - 1)]; n += 1; return f(); };
    return SHT.pipeline.runRound({ unit: SHT.curriculum, count: 5, brief: {}, existing: [], scope: SCOPE }).then((out) => {
      assert('范围外的考点被丢掉并留 PLAN_SCOPE', out.failures.some(f => f.codes.includes('PLAN_SCOPE')),
        JSON.stringify(out.failures.map(f => f.codes)));
      assert('重排后只出范围内的考点', out.questions.length === 1 && out.plans[0].kp === SCOPE[0].label,
        JSON.stringify(out.plans.map(p => p.kp)));
      assert('范围只有 1 个时不硬凑 5 题', out.plans.length === 1);
    });
  })();

  // 替补与换考点：两种「这一格出不成」的补救，都不许静默留空
  assert('规划提示词说明哪些是替补',
    SHT.ROLES.plan.user({
      bookName: 'PEP', bookMeta: { grade: '四', term: '上', units: 6 },
      unit: SHT.curriculum, brief: {}, blockedCells: [], count: 4, bench: 2
    }).indexOf('最后 2 条是替补') >= 0);

  await (function () {
    // 配额 2 条，规划给了 4 条：后两条当替补，第一格三次都出不成时由替补顶上。
    // 这里把冀教的候选清单临时清空：有清单时系统会先换考点（那一路由下一个用例覆盖），
    // 清空后才是「换不了，只能靠替补」——也正是这本册子刚接入清单之前的真实处境。
    const savedKps = SHT.KPS_BY_BOOK['HEB-G4A'];
    SHT.KPS_BY_BOOK['HEB-G4A'] = [];
    let n = 0;
    const four = { ok: true, tokens: 10, ms: 1, json: { plans: [
      { kp: 'vocab · A · 甲', ability: 'vocab', level: '认' },
      { kp: 'vocab · B · 乙', ability: 'vocab', level: '认' },
      { kp: 'vocab · C · 丙', ability: 'vocab', level: '认' },
      { kp: 'vocab · D · 丁', ability: 'vocab', level: '认' }
    ] } };
    const bad = () => ({ ok: true, json: qJson({ options: ['shirt', 'shirt', 'coat'] }), tokens: 10, ms: 1 });
    const ok = () => ({ ok: true, json: qJson(), tokens: 10, ms: 1 });
    // 第二格必须换题面：同轮两道题内容一模一样会被 V_DUP 拦下，这是有意的
    const ok2 = () => ({ ok: true, json: qJson({
      prompt: '选出「裙子」的英文。', answer: 'skirt',
      options: ['skirt', 'shirt', 'coat'], keyword: 'skirt'
    }), tokens: 10, ms: 1 });
    const pass = () => ({ ok: true, json: { verdict: 'pass' }, tokens: 10, ms: 1 });
    const script = [() => four, bad, bad, bad, ok, pass, ok2, pass];
    SHT.llm.call = async function () { const f = script[Math.min(n, script.length - 1)]; n += 1; return f(); };
    return SHT.pipeline.runRound({
      unit: SHT.curriculum, count: 2, brief: {}, existing: [],
      quota: { source: 'manual', total: 2, byAbility: { vocab: 2 } }
    }).then(function (out) {
      assert('多排的考点留作替补，不占正取', out.plans.length === 2 && out.bench.length === 2,
        out.plans.length + ' / ' + out.bench.length);
      assert('某一格没出成时替补顶上', out.questions.length === 2 && out.benchUsed === 1,
        out.questions.length + ' / ' + out.benchUsed);
      assert('顶上来的那题记的是替补的考点', out.questions[0].knowledgePoint === 'vocab · C · 丙' ||
        out.questions[1].knowledgePoint === 'vocab · C · 丙',
        JSON.stringify(out.questions.map(q => q.question ? q.knowledgePoint : q.knowledgePoint)));
      assert('替补顶上要留痕（BENCH_UP）', out.failures.some(f => f.codes.includes('BENCH_UP')),
        JSON.stringify(out.failures.map(f => f.codes)));
      assert('顶上来的题也有自己的格子', !!out.questions[0].cell && out.questions[0].cell.type);
    }).finally(function () { SHT.KPS_BY_BOOK['HEB-G4A'] = savedKps; });
  })();

  await (function () {
    /*
     * 错题复用的整条链，一步不许断：
     *   第一轮答错 → 错题本（unitId 存的是教材单元 id）→ brief.priority → plan.probe → 题目 parentQid
     * 以前 buildBrief 拿册内 id 去比教材单元 id，priority 恒空，
     * 于是 probe 全 null、parentQid 全空，界面上一点异常都看不出来。
     */
    // 注意用 BOOKS.current()：SHT_BOOK 是旧单册数据集，getUnit('U1') 永远返回人教那条
    const hostId = SHT.BOOKS.current().getUnit(SHT.curriculum.id).hostUnitId;
    const saved = {
      id: 'wq:S-001:' + hostId + ':q3', studentId: 'S-001', unitId: hostId,
      originalQuestionId: 'q3', kpId: 'kp-shirt', knowledgePoint: 'vocab · shirt · 音义联结',
      ability: 'vocab', category: '形近混淆', questionSnapshot: '选出「衬衫」的英文。',
      studentAnswer: 'skirt', correctAnswer: 'shirt',
      firstAttemptEvidence: { hintCount: 0, durationMs: 8000 },
      variantAttempts: [], masteryState: 'wrong', remediationLoopCount: 0
    };
    const brief = SHT.pipeline.buildBrief({ unitId: SHT.curriculum.id, rounds: [], wrongCases: [saved] });
    assert('真实错题进得了 brief 的 priority（probe 的唯一来源）',
      brief.priority.length === 1 && brief.priority[0].prevQid === 'q3', JSON.stringify(brief.priority));
    const one = { ok: true, tokens: 10, ms: 1, json: { plans: [{ kp: 'vocab · shirt · 音义联结', ability: 'vocab', cause: '形近', whyThisOne: '上一轮答错，换题面重考', nextIfWrong: '先配对', level: '认' }] } };
    let k = 0;
    const script = [() => one, () => ({ ok: true, json: qJson(), tokens: 10, ms: 1 }), () => ({ ok: true, json: { verdict: 'pass' }, tokens: 10, ms: 1 })];
    SHT.llm.call = async function () { const f = script[Math.min(k, script.length - 1)]; k += 1; return f(); };
    return SHT.pipeline.runRound({
      unit: SHT.curriculum, count: 1, brief: brief, existing: [],
      quota: { source: 'manual', total: 1, byAbility: { vocab: 1 } }
    }).then(function (out) {
      assert('本轮计划标成复用错题（probe）', !!out.plans[0].probe, JSON.stringify(out.plans[0].probe || null));
      assert('计划挂回第一轮那道错题的 id', out.plans[0].probe.parentQid === 'q3',
        String(out.plans[0].probe && out.plans[0].probe.parentQid));
      assert('出出来的题带 parentQid，审计台靠它对上', out.questions[0].parentQid === 'q3', String(out.questions[0].parentQid));
      assert('题级 probe 带上一轮题干当反例',
        !!out.questions[0].probe && out.questions[0].probe.prevPrompt === '选出「衬衫」的英文。');
    });
  })();

  (function () {
    /*
     * 考点对齐的三层判定。为什么值得单测：
     * 模型几乎不照抄考点文本（实测 5 条计划 5 条自造），
     * 只做逐字/包含匹配会让 probe 大量漏挂，而漏挂在界面上完全看不出来。
     */
    const prio = [
      { kp: 'vocab · parents / uncle / aunt / cousin · 家庭成员称呼词义混淆', ability: 'vocab', kpId: 'k1', prevQid: 'q-1', missCount: 1 },
      { kp: 'spelling · doctor / cook / driver / farmer / nurse · 职业拼写', ability: 'spelling', kpId: 'k2', prevQid: 'q-2', missCount: 2 }
    ];
    const m = SHT.pipeline.matchPriority;
    assert('考点逐字相同算 exact',
      m({ kp: 'vocab · parents / uncle / aunt / cousin · 家庭成员称呼词义混淆', ability: 'vocab' }, prio).match === 'exact');
    assert('考点只是长短不同算 contain',
      m({ kp: 'vocab · parents / uncle / aunt / cousin · 家庭成员称呼词义混淆（补充）', ability: 'vocab' }, prio).match === 'contain');
    const near = m({ kp: 'vocab · parents / uncle / aunt · 家庭称呼词辨认', ability: 'vocab' }, prio);
    assert('换成自己的措辞也能挂上，但标成 near',
      near && near.match === 'near' && near.item.prevQid === 'q-1', JSON.stringify(near && near.match));
    assert('同域但词不同的考点不会被误挂',
      m({ kp: 'vocab · family / people / photo · 家庭相关名词', ability: 'vocab' }, prio) === null);
    assert('能力不同不挂（拼写题不能顶成词汇错题的回练）',
      m({ kp: 'vocab · parents / uncle / aunt / cousin', ability: 'vocab' },
        [{ kp: 'spelling · parents / uncle / aunt / cousin · 职业拼写', ability: 'spelling', prevQid: 'q-9' }]) === null);
  })();

  await (function () {
    // 诱饵造不出来：连着两次 V3（选项重复）就换相近考点，不把第三次机会耗完
    const S2 = [
      { id: 'a', label: 'vocab · A · 甲', ability: 'vocab', cell: { type: '中英匹配', level: '认' } },
      { id: 'b', label: 'vocab · B · 乙', ability: 'vocab', cell: { type: '中英匹配', level: '认' } }
    ];
    let n = 0;
    const one = { ok: true, tokens: 10, ms: 1, json: { plans: [
      { kp: 'vocab · A · 甲', ability: 'vocab', level: '认', cause: '形近', nextIfWrong: '先配对' }
    ] } };
    const dup = () => ({ ok: true, json: qJson({ options: ['shirt', 'shirt', 'coat'] }), tokens: 10, ms: 1 });
    const ok = () => ({ ok: true, json: qJson(), tokens: 10, ms: 1 });
    const pass = () => ({ ok: true, json: { verdict: 'pass' }, tokens: 10, ms: 1 });
    const script = [() => one, dup, dup, ok, pass];
    SHT.llm.call = async function () { const f = script[Math.min(n, script.length - 1)]; n += 1; return f(); };
    return SHT.pipeline.runRound({
      unit: SHT.curriculum, count: 1, brief: {}, existing: [], scope: S2,
      quota: { source: 'manual', total: 1, byAbility: { vocab: 1 } }
    }).then(function (out) {
      assert('只退回两次就换考点，不耗第三次', out.failures.filter(f => f.stage === 'validate').length === 2,
        String(out.failures.filter(f => f.stage === 'validate').length));
      assert('换考点留痕（PLAN_SWITCH_KP）', out.failures.some(f => f.codes.includes('PLAN_SWITCH_KP')),
        JSON.stringify(out.failures.map(f => f.codes)));
      assert('换出来的题记的是新考点', out.questions.length === 1 &&
        out.questions[0].knowledgePoint === 'vocab · B · 乙', JSON.stringify(out.plans.map(p => p.kp)));
      assert('plans 里的那一格跟着换成新考点', out.plans[0].kp === 'vocab · B · 乙', out.plans[0].kp);
    });
  })();

  // 听力题漏填 audioText：用答案补上并留痕，不整题作废
  await runCase('听力题漏填原文 → 兜底补上', [
    () => ({ ok: true, tokens: 10, ms: 1, json: { plans: [{ kp: 'vocab · shirt · 音义联结', ability: 'listening', cause: '形近', nextIfWrong: '先配对', level: '认' }] } }),
    () => ({ ok: true, json: qJson({ prompt: '听录音，选出你听到的单词。', audioText: '', options: ['shirt', 'skirt', 'coat'], answer: 'shirt' }), tokens: 10, ms: 1 }),
    () => ({ ok: true, json: { verdict: 'pass' }, tokens: 10, ms: 1 })
  ], (out) => {
    assert('听力题漏填原文时用答案兜底并留痕',
      out.questions.length === 1 && out.questions[0].audioText === 'shirt' && out.questions[0].checks.__audioFilled === 'auto',
      JSON.stringify(out.questions.map(q => q.audioText + '/' + q.checks.__audioFilled)));
  });

/* ================= 考点推进与自动停止 ================= */
console.log('--- 考点推进与自动停止 ---');
const PQ = [{ no: 1, knowledgePoint: 'kp-a' }, { no: 2, knowledgePoint: 'kp-b' }];
const PA = [{ no: 1, stage: 'first', correct: true }, { no: 1, stage: 'variant', correct: true }, { no: 2, stage: 'first', correct: false }, { no: 2, stage: 'variant', correct: false }];
let PX = SHT.progress.blank();
PX = SHT.progress.commit(PX, { questions: PQ, attempts: PA });
assert('真会一次升一层（认→辨）', PX.points['kp-a'].level === '辨', JSON.stringify(PX.points['kp-a']));
assert('答错降一层，但不低于最低层', PX.points['kp-b'].level === '认', JSON.stringify(PX.points['kp-b']));
PX = SHT.progress.commit(PX, { questions: PQ, attempts: PA });
PX = SHT.progress.commit(PX, { questions: PQ, attempts: PA });
assert('考到顶层且会了两次以上就退役', PX.points['kp-a'].retired === true, JSON.stringify(PX.points['kp-a']));
assert('C 层上限是辨，B 层是用，A 层才是表达',
  SHT.progress.planHint(PX, { layer: 'C' }).cap === '辨' &&
  SHT.progress.planHint(PX, { layer: 'B' }).cap === '用' &&
  SHT.progress.planHint(PX, { layer: 'A' }).cap === '表达');
const HINT = SHT.progress.planHint(PX, { layer: 'B', scope: [{ label: 'kp-a' }, { label: 'kp-c' }] });
assert('提示里带上退役清单与范围里的存活考点', HINT.retired.indexOf('kp-a') >= 0 && HINT.aliveInScope.join() === 'kp-c', JSON.stringify(HINT));
assert('整池退役时给 scopeExhausted，界面据此扩池',
  SHT.progress.planHint(PX, { layer: 'B', scope: [{ label: 'kp-a' }] }).scopeExhausted === true);

// 没出成题的考点要进重试队列，下一轮才知道该补哪一格
const PR = SHT.progress.commit(SHT.progress.blank(), {
  questions: [{ no: 1, knowledgePoint: 'kp-ok' }],
  attempts: [],
  failures: [
    { stage: 'giveup', planKp: 'kp-lost', codes: ['GIVE_UP'] },
    { stage: 'verify', planKp: 'kp-notgiveup', codes: ['C3'] }
  ]
});
assert('放弃的考点进重试队列，被退回但没放弃的不进', !!PR.retry['kp-lost'] && !PR.retry['kp-notgiveup'],
  JSON.stringify(PR.retry));
const PR2 = SHT.progress.commit(PR, {
  questions: [{ no: 1, knowledgePoint: 'kp-lost' }], attempts: [], failures: []
});
assert('出了题的考点从重试队列里删掉', !PR2.retry['kp-lost'], JSON.stringify(PR2.retry));
assert('重试队列进得了规划提示词的上下文', SHT.progress.planHint(PR, { layer: 'B' }).retry.length === 1,
  JSON.stringify(SHT.progress.planHint(PR, { layer: 'B' }).retry));
assert('规划提示词里写出「上一轮这些考点没出成题」', SHT.ROLES.plan.user({
  bookName: 'PEP', bookMeta: { grade: '四', term: '上', units: 6 }, unit: SHT.curriculum,
  brief: {}, blockedCells: [], count: 1, scope: [],
  stage: SHT.progress.planHint(PR, { layer: 'B' })
}).indexOf('没出成题') >= 0);

const stop1 = SHT.progress.stopJudge({
  questions: [{ no: 1, knowledgePoint: 'kp-1' }, { no: 2, knowledgePoint: 'kp-2' }, { no: 3, knowledgePoint: 'kp-3' }],
  attempts: [1, 2, 3].filter(function () { return true; }).map(function (n) { return { no: n, stage: 'first', correct: true }; }).concat(
    [1, 2, 3].map(function (n) { return { no: n, stage: 'variant', correct: true }; })),
  failures: []
});
assert('三个考点全真会 → 自动判 SATURATED 并给依据', stop1.saturated && !!stop1.reason, stop1.reason);
const stop2 = SHT.progress.stopJudge({ questions: [], attempts: [], failures: [{ stage: 'giveup', planKp: 'x' }, { stage: 'giveup', planKp: 'y' }] });
assert('两个考点连续过不了闸 → 自动判 STALLED', stop2.stalled, stop2.reason);

// 流水线：退役考点不许再排、超上限的层次被按下

  await (function () {
    const script = [
      () => ({ ok: true, tokens: 1, ms: 1, json: { plans: [{ kp: 'kp-a', ability: 'vocab', level: '表达', nextIfWrong: 'x' }] } }),
      () => ({ ok: true, tokens: 1, ms: 1, json: { plans: [{ kp: 'kp-b', ability: 'vocab', level: '用', cause: '形近', nextIfWrong: 'x' }] } }),
      () => ({ ok: true, json: qJson(), tokens: 1, ms: 1 }),
      () => ({ ok: true, json: { verdict: 'pass' }, tokens: 1, ms: 1 })
    ];
    let m = 0;
    SHT.llm.call = async function () { const f = script[Math.min(m, script.length - 1)]; m += 1; return f(); };
    return SHT.pipeline.runRound({
      unit: SHT.curriculum, count: 5, brief: {}, existing: [],
      scope: [{ label: 'kp-a' }, { label: 'kp-b' }],
      progress: PX, stage: { layer: 'C' }, attempts: []
    }).then(function (out) {
      assert('退役考点被剔掉并留 PLAN_RETIRED', out.failures.some(function (f) { return f.codes.indexOf('PLAN_RETIRED') >= 0; }), JSON.stringify(out.failures.map(function (f) { return f.codes; })));
      assert('超过 C 层上限的层次被降到上限并留痕', out.plans.length === 1 && out.plans[0].level === '辨' && out.failures.some(function (f) { return f.codes.indexOf('PLAN_LEVEL_CAP') >= 0; }), JSON.stringify(out.plans.map(function (p) { return p.level; })));
    });
  })();

  /* ================= 能力配额 ================= */
  console.log('--- 能力配额 ---');
  assert('配额分配可复算：同样输入两次结果一样',
    JSON.stringify(SHT.quota.allocate([{ ability: 'vocab', w: 3 }, { ability: 'grammar', w: 1 }], 5))
    === JSON.stringify(SHT.quota.allocate([{ ability: 'vocab', w: 3 }, { ability: 'grammar', w: 1 }], 5)));
  const AQ = SHT.quota.allocate([{ ability: 'vocab', w: 3 }, { ability: 'grammar', w: 1 }], 5);
  assert('名额先每类各给 1 个，谁也别饿着', AQ.vocab >= 1 && AQ.grammar >= 1 && AQ.vocab + AQ.grammar === 5, JSON.stringify(AQ));
  const AQ2 = SHT.quota.allocate([{ ability: 'vocab', w: 9 }, { ability: 'spelling', w: 1 }], 5);
  assert('权重悬殊时真按比例给（9:1 → 4:1，不是 3:2）', AQ2.vocab === 4 && AQ2.spelling === 1, JSON.stringify(AQ2));
  assert('名额比能力少时只给权重最大的',
    JSON.stringify(SHT.quota.allocate([{ ability: 'vocab', w: 2 }, { ability: 'grammar', w: 5 }], 1)) === '{"grammar":1}');
  const NQ = SHT.quota.normalize({ source: '乱写', total: 2, byAbility: { vocab: 2, grammar: 1, 乱来: 5, listening: -3 } });
  assert('归一化丢掉枚举外的能力、负数归零', !NQ.byAbility['乱来'] && !NQ.byAbility.listening, JSON.stringify(NQ));
  assert('各项之和超过 total 时以和为准', NQ.total === 3, String(NQ.total));
  assert('来源不认识时退回 manual', NQ.source === 'manual');
  const SQ = SHT.quota.fromScope([{ label: 'a', ability: 'vocab' }, { label: 'b', ability: 'vocab' }, { label: 'c', ability: 'listening' }], { total: 5 });
  assert('按范围分：范围只有 3 个考点就最多 3 条', SHT.quota.sum(SQ) === 3 && SQ.source === 'scope', JSON.stringify(SQ.byAbility));
  assert('按范围分：两类能力都拿到名额', SQ.byAbility.vocab >= 2 && SQ.byAbility.listening === 1, JSON.stringify(SQ.byAbility));
  const PQ2 = SHT.quota.fromProfile({ layer: 'B', weaknesses: [
    { ability: 'grammar', wrongCount: 4, lastWrongDays: 1 },
    { ability: 'vocab', wrongCount: 1, lastWrongDays: 10 }
  ] }, { total: 4 });
  assert('画像里错得多的能力先拿名额', PQ2.byAbility.grammar >= PQ2.byAbility.vocab, JSON.stringify(PQ2.byAbility));
  assert('画像来源记成 profile', PQ2.source === 'profile', PQ2.source);
  const BQ = SHT.quota.fromBrief({ priority: [{ kp: 'x', ability: 'listening', missCount: 2 }] }, { total: 3 });
  assert('错题画像折算成配额', BQ.byAbility.listening >= 1, JSON.stringify(BQ.byAbility));
  const ap = SHT.quota.apply([
    { kp: 'v1', ability: 'vocab' }, { kp: 'v2', ability: 'vocab' }, { kp: 'v3', ability: 'vocab' },
    { kp: 'g1', ability: 'grammar' }
  ], { total: 4, byAbility: { vocab: 2, grammar: 1, listening: 1 } });
  assert('超额的能力被剔掉并记下来', ap.plans.length === 3 && ap.over.length === 1 && ap.over[0].kp === 'v3', JSON.stringify(ap.over));
  assert('没排满的能力进 short，不补假题', ap.report.short.some(function (x) { return x.ability === 'listening'; }), JSON.stringify(ap.report.short));
  const ax = SHT.quota.apply([{ kp: 'l1', ability: 'listening' }], { total: 3, byAbility: { vocab: 2 } });
  assert('配额外的能力名额还空着就收下，只记 extra', ax.plans.length === 1 && ax.extra.length === 1, JSON.stringify(ax.extra));
  assert('课程提示词要求焦点考点吃满 3 条（验收指标三）',
  SHT.ROLES.plan.system().indexOf('不少于 3 条') >= 0);
assert('规划提示词里带着能力配额', SHT.ROLES.plan.user({
    bookName: 'PEP', bookMeta: { grade: '四', term: '上', units: 6 },
    unit: SHT.curriculum, brief: {}, blockedCells: [], count: 3,
    quota: { total: 3, byAbility: { vocab: 2, grammar: 1 }, note: '人工填写' }
  }).indexOf('vocab：2 条') >= 0);

  // 流水线：配额只给 1 条 vocab，多出来的那类不排题
  await (function () {
    let n = 0;
    const script = [
      () => ({ ok: true, tokens: 10, ms: 1, json: { plans: [
        { kp: 'vocab · A · x', ability: 'vocab', level: '认' },
        { kp: 'vocab · B · y', ability: 'vocab', level: '认' },
        { kp: 'grammar · C · z', ability: 'grammar', level: '认' }
      ] } }),
      () => ({ ok: true, json: qJson(), tokens: 10, ms: 1 }),
      () => ({ ok: true, json: { verdict: 'pass' }, tokens: 10, ms: 1 })
    ];
    SHT.llm.call = async function () { const f = script[Math.min(n, script.length - 1)]; n += 1; return f(); };
    return SHT.pipeline.runRound({
      unit: SHT.curriculum, count: 5, brief: {}, existing: [],
      quota: { source: 'manual', total: 2, byAbility: { vocab: 1, grammar: 1 } }
    }).then(function (out) {
      assert('配额只给 1 条 vocab 时多出来的不排题',
        out.plans.length === 2 && !out.plans.some(function (p) { return p.kp === 'vocab · B · y'; }),
        JSON.stringify(out.plans.map(function (p) { return p.kp; })));
      assert('超额条目记 QUOTA_OVER', out.failures.some(function (f) { return f.codes.indexOf('QUOTA_OVER') >= 0; }),
        JSON.stringify(out.failures.map(function (f) { return f.codes; })));
      assert('返回这一轮实际用的配额', !!out.quota && out.quota.byAbility.vocab === 1, JSON.stringify(out.quota));
    });
  })();

  /* ================= 审计：四条达标线 ================= */
  console.log('--- 审计台 ---');
  {
    // ① 变体：答案必换 / 考点必同 / 伪变体
    const r1q = [
      { qid: 'q-a', no: 1, knowledgePoint: 'phonics · a / a-e · 长短音', prompt: '听录音，选出你听到的单词。（cake）', options: ['cake', 'cat', 'hat'], answer: 'cake', cell: { level: '辨' } },
      { qid: 'q-b', no: 2, knowledgePoint: 'vocab · coat · 同类不同物', prompt: '选出「大衣」的英文。', options: ['coat', 'cap', 'dress'], answer: 'coat', cell: { level: '认' } }
    ];
    const r2q = [
      // 答案换了、题面换了 → 合格变体
      { qid: 'q-c', no: 1, parentQid: 'q-a', knowledgePoint: 'phonics · a / a-e · 长短音', prompt: '听录音，选出与 gate 中 a 同音的词。（name）', options: ['name', 'map', 'bag'], answer: 'name', cell: { level: '辨' } },
      // 答案没换 → 不合规
      { qid: 'q-d', no: 2, parentQid: 'q-b', knowledgePoint: 'vocab · coat · 同类不同物', prompt: '选出「大衣」的英文。', options: ['coat', 'cap', 'dress'], answer: 'coat', cell: { level: '认' } },
      // 没挂来源 → orphan
      { qid: 'q-e', no: 3, parentQid: '', knowledgePoint: 'vocab · shirt · 音义联结', prompt: '选出「衬衫」的英文。', options: ['shirt', 'skirt', 'sock'], answer: 'shirt', cell: { level: '认' } }
    ];
    const vm = SHT.audit.variantRows([{ questions: r1q }, { questions: r2q }]);
    assert('变体只数挂了 parent 的题', vm.stats.total === 2 && vm.orphan.length === 1, vm.stats.total + ' / orphan ' + vm.orphan.length);
    assert('答案换了算合规，没换算不合规', vm.stats.answerChanged === 1 && vm.stats.total === 2, String(vm.stats.answerChanged));
    assert('考点相同才认变体', vm.stats.sameKp === 2, String(vm.stats.sameKp));
    assert('只换指代、骨架不动 → 判伪变体', vm.rows.filter(r => r.fake).length === 1,
      JSON.stringify(vm.rows.map(r => ({ q: r.childQid, fake: r.fake }))));
    assert('挂了不存在的 parent 单独标出来',
      SHT.audit.variantRows([{ questions: r1q }, { questions: [{ qid: 'q-x', parentQid: 'q-nope', knowledgePoint: 'x', prompt: 'p', answer: 'a' }] }])
        .rows[0].missingParent === true);

    // ② 隔离：学情词必须被扫出来
    const leakA = SHT.audit.scanLeak('待检的题：题型 中英匹配\n题干 "选出..."\n选项 [...]\n答案 coat\n本单元词表：coat=大衣');
    assert('干净上下文不误报', leakA.ok === true && leakA.hits.length === 0);
    const leakB = SHT.audit.scanLeak('错题画像：掌握概率 0.31（低），上次他选的是 cap');
    assert('学情词一条不漏地扫出来', !leakB.ok && leakB.hits.length >= 2,
      JSON.stringify(leakB.hits.map(h => h.word)));
    const vf = SHT.audit.verifyFields('题型：中英匹配 题干："x" 选项 [] 答案 coat 解析 ... 词表 ...');
    assert('能认出验证上下文里带了哪些字段', vf.length >= 4, vf.join('/'));

    // ③ 进化：焦点与难度
    const stat1 = { rounds: [{ questions: r1q, practice: { attempts: [{ correct: true }, { correct: false }] } },
      { questions: r2q, practice: { attempts: [] } }], wrongCases: [{ knowledgePoint: 'phonics · a / a-e · 长短音' }], traces: [] };
    const em = SHT.audit.metrics(stat1);
    assert('焦点考点取第一轮错最多的那个', em.evolve.focusKp === 'phonics · a / a-e · 长短音', em.evolve.focusKp);
    assert('焦点命中数算得对（第二轮同考点 1 道）', em.evolve.focusHit === 1, String(em.evolve.focusHit));
    assert('难度档按层次均值算（R1 0.5 / R2 0.33）',
      Math.abs(em.evolve.levelFrom.avgLevel - 0.5) < 0.01 && Math.abs(em.evolve.levelTo.avgLevel - 1 / 3) < 0.01,
      JSON.stringify([em.evolve.levelFrom.avgLevel, em.evolve.levelTo.avgLevel]));

    // ④ 复现：台账重判一致 / 不一致要报冲突
    const qq = { qid: 'q-a', prompt: 'p', options: ['coat', 'cap', 'dress'], answer: 'coat', open: false };
    const frozen = SHT.grade.remember({}, qq, 'coat', { correct: true, via: 'exact' });
    const good = SHT.audit.freezeAudit({ rounds: [{ questions: [qq] }], gradeLedger: frozen });
    assert('同一题同一答案能离线复算且一致', good.recomputed === 1 && good.conflicts.length === 0, JSON.stringify(good));
    const tampered = Object.assign({}, frozen);
    const k = Object.keys(tampered)[0];
    tampered[k] = Object.assign({}, tampered[k], { correct: false });
    const badFreeze = SHT.audit.freezeAudit({ rounds: [{ questions: [qq] }], gradeLedger: tampered });
    assert('台账被改过一定要报冲突（防悄悄改口）', badFreeze.conflicts.length === 1, JSON.stringify(badFreeze.conflicts));

    // 总判：一项没过就是未达标，跑得少不能报达标
    // 真实存档里 rounds 是 { 1: {...}, 2: {...} }，不是数组：形状没归一化过会整页渲染失败
    assert('存档的 rounds 是对象也能算',
      SHT.audit.metrics({ rounds: { 1: { questions: [] }, 2: { questions: [] } }, traces: [] }).verdict === 'nodata');
    assert('四项都没数据时判「还没跑够」', SHT.audit.metrics({ rounds: [], traces: [] }).verdict === 'nodata');
    const allRoles = ['plan', 'generate', 'verify', 'diagnose'].map(function (role) {
      return { role: role, ok: true, guard: { ok: true, hits: [] }, fields: ['题干'] };
    });
    const partial = SHT.audit.metrics({ rounds: [], traces: allRoles });
    assert('四角色都上了但还没判分 → 待验，不报达标', partial.verdict === 'wait', partial.verdict);
    const lacking = SHT.audit.metrics({ rounds: [], traces: [{ role: 'verify', ok: true, guard: { ok: true, hits: [] }, fields: ['题干'] }] });
    assert('有一类角色没留痕 → 复现判未达标', lacking.reproduce.ok === false, String(lacking.reproduce.ok));
    assert('任一项没过 → 未达标', em.verdict === 'fail' || em.verdict === 'wait', em.verdict);
  }

  /* ================= 接口层失败不能抛异常 ================= */
  // llm.call 失败时返回 { ok:false, errorType, message }，调用方一律按 res.error.message 读是错的：
  // 任何接口层失败（key 无效 / 超时 / 限流）都会抛 TypeError，被上层吞成「出错了」，
  // 连通性测试更会永远停在「正在测试…」。这条断言锁住读法。
  console.log('--- 接口层失败 ---');
  await (function () {
    const REAL = SHT.llm.call;
    SHT.llm.call = async function () {
      return { ok: false, ms: 12, errorType: 'auth', message: 'Authentication Fails, Your api key is invalid', tokens: 0 };
    };
    return SHT.pipeline.selfCheck().then(function (r) {
      SHT.llm.call = REAL;
      assert('连通性测试遇到接口失败时给出原因，不抛异常',
        r.ok === false && r.type === 'auth' && String(r.message).indexOf('Authentication') >= 0,
        JSON.stringify(r));
    }, function (e) {
      SHT.llm.call = REAL;
      assert('连通性测试遇到接口失败时给出原因，不抛异常', false, '抛了: ' + e.message);
    });
  })();

  await (function () {
    const REAL = SHT.llm.call;
    SHT.llm.call = async function () {
      return { ok: false, ms: 10, errorType: 'rate', message: '请求太频繁', tokens: 0 };
    };
    return SHT.pipeline.runRound({ unit: SHT.curriculum, count: 1, brief: {}, existing: [] }).then(function (out) {
      SHT.llm.call = REAL;
      assert('规划连续接口失败时整轮不抛异常', out.ok === false, JSON.stringify(out.ok));
      assert('接口失败的类型被记进失败记录',
        out.failures.some(function (f) { return f.codes.indexOf('rate') >= 0; }),
        JSON.stringify(out.failures.map(function (f) { return f.codes; })));
      assert('接口失败的原因写成人能读的话',
        out.failures.every(function (f) { return String(f.reason || '').indexOf('undefined') < 0; }),
        JSON.stringify(out.failures.map(function (f) { return f.reason; })));
    }, function (e) {
      SHT.llm.call = REAL;
      assert('规划连续接口失败时整轮不抛异常', false, '抛了: ' + e.message);
    });
  })();

  // 错题回练：上一轮错的考点，这一轮由模型换题面重出，并带上「上一轮那道题」当反例
  console.log('--- 错题回练（跨轮） ---');
  await (function () {
    const REAL = SHT.llm.call;
    const seen = [];
    let n = 0;
    const script = [
      () => ({ ok: true, tokens: 10, ms: 1, json: { plans: [
        { kp: 'spelling · blackboard · oa + ar', ability: 'spelling', level: '辨', nextIfWrong: '先认词义' }
      ] } }),
      (req) => { seen.push(req.user); return { ok: true, json: qJson({ prompt: '选出「黑板」的正确拼写。', options: ['blackboard', 'blackbord', 'blakboard'], answer: 'blackboard', analysis: 'black + board，oa 和 ar 都不能漏。' }), tokens: 10, ms: 1 }; },
      () => ({ ok: true, json: { verdict: 'pass' }, tokens: 10, ms: 1 })
    ];
    SHT.llm.call = async function (req) {
      const f = script[Math.min(n, script.length - 1)];
      n += 1;
      return f(req);
    };
    return SHT.pipeline.runRound({
      unit: SHT.curriculum, count: 1, existing: [],
      quota: { source: 'manual', total: 1, byAbility: { spelling: 1 } },
      brief: {
        unitId: 'U1',
        priority: [{
          kp: 'spelling · blackboard · oa + ar', kpId: 'kp-9', missCount: 2,
          ability: 'spelling', prevPrompt: '选出「黑板」的正确拼写。'
        }],
        mastered: [], blockedCells: []
      }
    }).then(function (out) {
      SHT.llm.call = REAL;
      assert('命中上一轮错题的考点被标成 probe',
        !!out.plans[0] && out.plans[0].probe && out.plans[0].probe.kpId === 'kp-9',
        JSON.stringify(out.plans[0] && out.plans[0].probe));
      assert('题目上也带 probe，作答时据此记成第二枪',
        !!out.questions[0] && !!out.questions[0].probe,
        JSON.stringify(out.questions[0] && out.questions[0].probe));
      assert('生成提示词里带着「错题回练」与上一轮原题',
        seen.some(function (u) { return String(u).indexOf('错题回练') >= 0 && String(u).indexOf('选出「黑板」的正确拼写') >= 0; }),
        (seen[0] || '').slice(0, 80));
    }, function (e) {
      SHT.llm.call = REAL;
      assert('命中上一轮错题的考点被标成 probe', false, '抛了: ' + e.message);
    });
  })();

  /* ================= 题量与配额联动 ================= */
  console.log('--- 题量与配额联动 ---');
  fire('agentPanel', 'change', { dataset: { field: 'questionCount', round: '1' }, value: '8' });
  assert('改题量为 8 后计划表变 8 行', count('agentPanel', 'class="plan-row') === 8,
    String(count('agentPanel', 'class="plan-row')));
  assert('配额总分跟着题量走（不是写死 5）', /共 8 条/.test(nodes.agentPanel.innerHTML),
    (nodes.agentPanel.innerHTML.match(/共 \d+ 条|\d+\/\d+/g) || []).join(' '));
  fire('agentPanel', 'change', { dataset: { field: 'questionCount', round: '1' }, value: '3' });
  assert('改到 3 题后表只剩 3 行且配额变 3', count('agentPanel', 'class="plan-row') === 3 &&
    /共 3 条/.test(nodes.agentPanel.innerHTML),
    count('agentPanel', 'class="plan-row') + ' 行');
  fire('agentPanel', 'change', { dataset: { field: 'questionCount', round: '1' }, value: '5' });

  /* ================= 回练题在界面上长什么样 ================= */
  console.log('--- 错题回练（界面） ---');
  const pr = { cursor: 0, picked: null, hintUsed: false, hintGone: -1, revealed: null, attempts: [] };
  store = {
    'sht-minimal-test-v2': JSON.stringify({
      bookId: 'PEP-G4A', unitId: 'U1', round: 2, activeNo: 1, tab: 'practice',
      rounds: {
        1: { questions: [], practice: Object.assign({}, pr) },
        2: {
          questions: [{
            no: 1, knowledgePoint: 'spelling · blackboard · oa + ar', ability: 'spelling',
            cell: { type: '拼写补全', scene: '学校', level: '辨', distractor: '形近' },
            prompt: '选出「黑板」的正确拼写。', options: ['blackboard', 'blackbord', 'blakboard'],
            answer: 'blackboard', analysis: 'black 两个 a，ar 不能漏。', audioText: '',
            probe: { kpId: 'kp-1', prevPrompt: '选出「讲台」的英文。', missCount: 1 },
            checks: {}, source: 'model'
          }],
          practice: Object.assign({}, pr)
        }
      },
      wrongCases: [{
        id: 'wc-1', studentId: 'S-001', unitId: 'U1', kpId: 'kp-1',
        knowledgePoint: 'spelling · blackboard · oa + ar', ability: 'spelling',
        category: '形近', masteryState: 'wrong', variantAttempts: [],
        firstAttemptEvidence: { hintCount: 0 }, remediationLoopCount: 0
      }]
    })
  };
  delete require.cache[require.resolve('../src/app.js')];
  try {
    require('../src/app.js');
    assert('回练题在 02 页标成「错题回练」',
      nodes.practiceCard.innerHTML.indexOf('错题回练') >= 0,
      nodes.practiceCard.innerHTML.slice(0, 120));
    assert('回练题把上一轮原题放在提示里',
      nodes.practiceCard.innerHTML.indexOf('选出「讲台」的英文') >= 0);

    /* 诊断页：答完才说话，且要说清「他排掉了什么」 */
    fire('agentRail', 'click', {
      closest(sel) { return sel === 'button[data-role]' ? { dataset: { role: 'diagnose' } } : null; }
    });
    assert('诊断页在未作答时不给结论', nodes.agentPanel.innerHTML.indexOf('这一题还没作答') >= 0,
      nodes.agentPanel.innerHTML.slice(0, 160));
    click('practiceCard', { action: 'pick-option', index: 1 });
    click('practiceCard', { action: 'submit-answer' });
    fire('agentRail', 'click', {
      closest(sel) { return sel === 'button[data-role]' ? { dataset: { role: 'diagnose' } } : null; }
    });
    assert('作答之后诊断页给出结论与置信度',
      nodes.agentPanel.innerHTML.indexOf('class="diag-card') >= 0 &&
      nodes.agentPanel.innerHTML.indexOf('置信 ') >= 0,
      nodes.agentPanel.innerHTML.slice(0, 220));
    assert('诊断说出他没选的那一项为什么被排掉',
      nodes.agentPanel.innerHTML.indexOf('为什么没选其它项') >= 0 &&
      nodes.agentPanel.innerHTML.indexOf('class="diag-reason"') >= 0);
    assert('诊断给出下一轮怎么出', nodes.agentPanel.innerHTML.indexOf('下一轮怎么出') >= 0);
    assert('诊断页写明它不改判定、不改题',
      nodes.agentPanel.innerHTML.indexOf('不改判定结果') >= 0);
  } catch (err) {
    assert('回练题在 02 页标成「错题回练」', false, err.message);
  }

  /* ================= 诊断：为什么偏选这个 ================= */
  console.log('--- 诊断归因 ---');
  const dUnit = {
    words: [
      { en: 'near', zh: '在附近' }, { en: 'class', zh: '班级' }, { en: 'classroom', zh: '教室' },
      { en: 'wall', zh: '墙' }, { en: 'blackboard', zh: '黑板' }, { en: 'in', zh: '在…里' },
      { en: 'on', zh: '在…上' }, { en: 'cake', zh: '蛋糕' }, { en: 'cat', zh: '猫' }
    ],
    allowedFunctionWords: ['is', 'are', 'the', 'a', 'he', 'she', 'it', 'very', 'tall', 'has']
  };
  const judgeD = function (q, picked, ms, hint) {
    return SHT.diagnose.judge({
      question: q,
      attempt: { picked: picked, correct: false, durationMs: ms == null ? 9000 : ms, hintCount: hint || 0 },
      unit: dUnit
    });
  };
  const dNear = judgeD({ prompt: '听录音，选出你听到的单词。', options: ['near', 'nears', 'not'], answer: 'near' }, 'nears');
  assert('near / nears 判成词形问题，不是形近拼写',
    dNear.causeId === '语法错形', dNear.causeId);
  assert('词形问题的理由说清「加了 -s」', /加 -s/.test(dNear.whyPicked), dNear.whyPicked);
  assert('诊断带上他排掉的选项与理由',
    dNear.eliminated.length === 1 && dNear.eliminated[0].letter === 'C' && dNear.eliminated[0].why.length > 6,
    JSON.stringify(dNear.eliminated));

  const dPrefix = judgeD({ prompt: '选出「教室」的正确拼写。', options: ['classroom', 'class', 'calssroom'], answer: 'classroom' }, 'class');
  assert('class / classroom 按共同前缀判成形近', dPrefix.causeId === '形近混淆', dPrefix.causeId);

  const dIrregular = judgeD({ prompt: 'She ___ long hair.', options: ['has', 'have', 'is'], answer: 'has' }, 'have');
  assert('have / has 按不规则屈折判成语法错形，不当形近', dIrregular.causeId === '语法错形', dIrregular.causeId);

  const dShort = judgeD({ prompt: '— Where is the picture? — It\'s ___ the wall.', options: ['on', 'in', 'at'], answer: 'on' }, 'in');
  assert('in / on 这种短词判成近义（用法）而不是音近', dShort.causeId === '近义混淆', dShort.causeId);

  const dBe = judgeD({ prompt: '用英语说：他很高。', options: [], answer: 'He is very tall.', open: true }, 'He tall');
  assert('开放题漏 be 动词能读出来', dBe.causeId === '语法错形' && /be 动词/.test(dBe.whyPicked), dBe.whyPicked);

  const dOrder = judgeD({ prompt: '用英语说：他很高。', options: [], answer: 'He is very tall.', open: true }, 'Very tall he is');
  assert('开放题词序颠倒判成母语负迁移', dOrder.causeId === '母语负迁移', dOrder.causeId);

  const dTwice = judgeD({ prompt: '听录音，选出你听到的单词。', options: ['near', 'nears', 'not'], answer: 'near' }, 'nears');
  assert('同一个答案跑两次结论一致（可复算）',
    dTwice.causeId === dNear.causeId && dTwice.confidence === dNear.confidence);

  const dQuick = judgeD({ prompt: '听录音，选出你听到的单词。', options: ['near', 'nears', 'not'], answer: 'near' }, 'nears', 1500);
  const dSlow = judgeD({ prompt: '听录音，选出你听到的单词。', options: ['near', 'nears', 'not'], answer: 'near' }, 'nears', 26000);
  assert('秒选的诊断置信度低于想了很久的', dQuick.confidence < dSlow.confidence,
    dQuick.confidence + ' / ' + dSlow.confidence);

  const dRight = SHT.diagnose.judge({
    question: { prompt: '选出「教室」的正确拼写。', options: ['classroom', 'class'], answer: 'classroom' },
    attempt: { picked: 'classroom', correct: true, durationMs: 1200, hintCount: 0 },
    unit: dUnit
  });
  // 答对不再编「为什么对」：快答与真会分不开，硬归因等于把「会」判成「背」
  assert('答对不做错因归因（causeId 为空）', dRight.correct && dRight.causeId === '', dRight.causeId);
  assert('答对仍记下快答这个事实，但不据此下结论',
    dRight.fast === true && dRight.headline === '答对', JSON.stringify([dRight.fast, dRight.headline]));
  const dRightHint = SHT.diagnose.judge({
    question: { prompt: '选出「教室」的正确拼写。', options: ['classroom', 'class'], answer: 'classroom' },
    attempt: { picked: 'classroom', correct: true, durationMs: 9000, hintCount: 1 },
    unit: dUnit
  });
  assert('用了提示的答对只标「用了提示」，同样不归因',
    dRightHint.causeId === '' && dRightHint.hinted === true, dRightHint.headline);

  /* 冻结：同一个 (题目, 答案) 只诊断一次 */
  const dQ = { qid: 'dq-1', prompt: '听录音，选出你听到的单词。', options: ['near', 'nears', 'not'], answer: 'near' };
  const dAtt = { picked: 'nears', correct: false, durationMs: 9000, hintCount: 0 };
  let dStore = SHT.diagnose.remember({}, dQ, dAtt, 1, dNear);
  const dStore2 = SHT.diagnose.remember(dStore, dQ, dAtt, 1, Object.assign({}, dNear, { causeId: '未掌握' }));
  assert('诊断落库后不覆盖（冻结）',
    SHT.diagnose.read(dStore2, dQ, dAtt, 1).causeId === dNear.causeId);
  assert('改答案重答是另一条诊断记录',
    SHT.diagnose.read(dStore2, { qid: 'dq-1', answer: 'near' }, { picked: 'not' }, 1) === null);

  // 代码证据强时，模型只能附加意见，不能改主结论
  const dStrong = SHT.diagnose.appendModel(dStore2, dQ, dAtt, 1, { causeId: '未掌握', why: '我觉得是没掌握', confidence: 0.9 });
  const dStrongHit = SHT.diagnose.read(dStrong, dQ, dAtt, 1);
  assert('代码证据强时模型补诊不推翻主结论', dStrongHit.causeId === dNear.causeId, dStrongHit.causeId);
  assert('模型补的意见另存一份可对照', dStrongHit.modelView && dStrongHit.modelView.causeId === '未掌握');
  // 代码证据弱时，模型那一份才顶上来
  const dWeak = Object.assign({}, dNear, { causeId: '未掌握', confidence: 0.2 });
  let dWeakStore = SHT.diagnose.remember({}, { qid: 'dq-2' }, { picked: 'x' }, 1, dWeak);
  dWeakStore = SHT.diagnose.appendModel(dWeakStore, { qid: 'dq-2' }, { picked: 'x' }, 1, { causeId: '形近混淆', why: '差一个字母', confidence: 0.7 });
  assert('代码证据弱时模型补诊顶上来当主结论',
    SHT.diagnose.read(dWeakStore, { qid: 'dq-2' }, { picked: 'x' }, 1).causeId === '形近混淆');

  /* ================= 掌握概率（BKT） ================= */
  console.log('--- 掌握概率 ---');
  const p0 = SHT.bkt.P.init;
  const pUp = SHT.bkt.project([{ correct: true }, { correct: true }, { correct: true }]).p;
  const pDown = SHT.bkt.project([{ correct: false }, { correct: false }, { correct: false }]).p;
  assert('连对三次掌握概率上升', pUp > p0, p0 + ' → ' + pUp);
  assert('连错三次掌握概率下降', pDown < p0, p0 + ' → ' + pDown);
  const pHint = SHT.bkt.project([{ correct: true, hintCount: 1 }, { correct: true, hintCount: 1 }]).p;
  const pClean = SHT.bkt.project([{ correct: true }, { correct: true }]).p;
  assert('靠提示答对涨得比独立答对慢', pHint < pClean, pHint + ' / ' + pClean);
  assert('掌握概率带档位，规划提示词读得懂',
    SHT.bkt.text(0.82).indexOf('高') >= 0 && SHT.bkt.text(0.1).indexOf('低') >= 0);

  /* ================= 角色边界：谁看得到什么 ================= */
  console.log('--- 角色边界 ---');
  assert('四个角色都在，且诊断角色存在',
    ['plan', 'generate', 'verify', 'diagnose'].every(function (k) { return !!SHT.ROLES[k]; }), Object.keys(SHT.ROLES).join(','));
  const verifyCtx = SHT.ROLES.verify.user({
    bookName: 'PEP 四上', unit: SHT.curriculum,
    question: {
      knowledgePoint: 'spelling · blackboard · oa + ar',
      cell: { type: '拼写补全', scene: '学校', level: '辨', distractor: '形近' },
      prompt: '选出「黑板」的正确拼写。', options: ['blackboard', 'blackbord', 'blakboard'],
      answer: 'blackboard', analysis: 'black 两个 a。'
    }
  });
  assert('验证角色看不到干扰项类型（那是出题意图）', verifyCtx.indexOf('干扰项类型') < 0);
  assert('验证角色看不到层次（不给它确认意图的机会）', verifyCtx.indexOf('层次') < 0);
  assert('验证角色看不到知识点标签', verifyCtx.indexOf('- 知识点：') < 0);
  assert('验证提示词只列可判条款，并点明其余不判',
    verifyCtx.indexOf('P1') < 0 && verifyCtx.indexOf('F2') < 0 &&
    SHT.ROLES.verify.system().indexOf('一律不要判') >= 0);
  assert('可判 15 条 / 不判 8 条（23 条总数不变）',
    SHT.JUDGEABLE_CHECKS.length === 15 && SHT.OUT_OF_SCOPE_CHECKS.length === 8 &&
    SHT.ALL_CHECKS.length === 23,
    SHT.JUDGEABLE_CHECKS.length + '/' + SHT.OUT_OF_SCOPE_CHECKS.length);
  assert('生成角色看不到学情（不给画像）', SHT.ROLES.generate.user({
    bookName: 'PEP 四上', unit: SHT.curriculum,
    plan: { kp: 'spelling · blackboard · oa + ar', ability: 'spelling', level: '辨',
      cell: { type: '拼写补全', scene: '学校', level: '辨', distractor: '形近' } }
  }).indexOf('错过') < 0);
  assert('生成角色被告知方向由课程定、不许自己改',
    SHT.ROLES.generate.system().indexOf('方向不是你定的') >= 0 &&
    SHT.ROLES.generate.system().indexOf('不许自己把考点挪到别处') >= 0);
  assert('诊断角色只能取固定错因编号，不许自造说法',
    SHT.ROLES.diagnose.system().indexOf('不许自己发明说法') >= 0 &&
    SHT.ROLES.diagnose.system().indexOf('未掌握') >= 0);
  assert('诊断角色不判对错、不改题',
    SHT.ROLES.diagnose.system().indexOf('不判对错') >= 0);

  /* 课程角色必须读到：诊断结论、错选、耗时、掌握概率、上一轮没过成的原因 */
  const planCtx = SHT.ROLES.plan.user({
    bookName: 'PEP 四上', bookMeta: SHT.BOOKS.current().meta, unit: SHT.curriculum,
    count: 3, quota: SHT.quota.blank(), scope: [], stage: null,
    brief: {
      priority: [{
        kp: 'spelling · blackboard · oa + ar', kpId: 'kp-1', missCount: 2, ability: 'spelling',
        stage: 'variant-failed', pKnown: 0.31, lastPicked: 'blackbord', lastAnswer: 'blackboard',
        lastMs: 15200, lastHint: 1,
        diag: {
          causeId: '形近混淆', causeLabel: '形近混淆', confidence: 0.72,
          headline: '形近混淆 · 选了「blackbord」没选「blackboard」',
          whyPicked: '只差 1 个字母',
          eliminated: [{ letter: 'C', option: 'blakboard', why: '不在本单元词表里' }],
          nextStep: '下一轮出同一组词形对比'
        }
      }],
      mastered: [], blockedCells: [],
      rejects: [{ kp: 'phonics · a / a-e · cake', times: 2, codes: ['C2'], text: 'C2 单元归属四查' }]
    }
  });
  assert('课程角色读到诊断结论与置信度',
    planCtx.indexOf('诊断：形近混淆') >= 0 && planCtx.indexOf('置信 72%') >= 0);
  assert('课程角色读到上次错选与耗时', planCtx.indexOf('blackbord') >= 0 && planCtx.indexOf('15 秒') >= 0);
  assert('课程角色读到掌握概率', planCtx.indexOf('掌握概率 0.31') >= 0);
  assert('课程角色读到「他排掉了什么」', planCtx.indexOf('他排掉了') >= 0);
  assert('课程角色读到验证角色的退回原因', planCtx.indexOf('上一轮没出成题') >= 0 && planCtx.indexOf('C2') >= 0);
  assert('课程提示词写明 cause 是设计意图、不是诊断',
    SHT.ROLES.plan.system().indexOf('设计意图') >= 0);

  /* ================= 错因来源：诊断，不是出题意图 ================= */
  console.log('--- 错因来源 ---');
  const kpWithCause = SHT.KNOWLEDGE_POINTS.filter(function (k) { return k.cause; })[0] || { id: 'kp-x', cause: '形近混淆', label: 'x', ability: 'vocab' };
  const upserted = SHT.upsertWrongCase([], {
    studentId: 'S-001', unitId: 'U1', originalQuestionId: 'q-x',
    kpId: kpWithCause.id, knowledgePoint: kpWithCause.label, ability: 'vocab',
    category: '未掌握', causeSource: 'code', causeConfidence: 0.72,
    intentCause: '语法错形',
    diagnosis: { causeId: '未掌握', causeLabel: '尚未掌握', confidence: 0.72, headline: '没认出正确答案', whyPicked: '看不出关系', eliminated: [] },
    errorCause: '没认出正确答案。看不出关系', questionSnapshot: '题干', studentAnswer: 'x',
    correctAnswer: 'y', hintCount: 0, durationMs: 9000, at: new Date().toISOString()
  });
  const wc = upserted.list[0];
  assert('错题本的错因来自诊断，不抄课程的 cause',
    wc.category === '未掌握' && wc.category !== kpWithCause.cause, wc.category + ' / ' + kpWithCause.cause);
  assert('出题意图单独留档，两者不混', wc.intentCause === '语法错形');
  assert('错题本带上诊断全文与置信度',
    !!wc.diagnosis && wc.causeConfidence === 0.72);
  assert('首次作答的耗时被记下来（诊断要用）', wc.firstAttemptEvidence.durationMs === 9000);

  SHT.llm.call = REAL_CALL;

  /*
   * 模型不可用时的判分。这条最要紧：ask 只能返回「失败」，不能返回任何
   * correct 值——一旦往回编一个 false，调用方就会把「服务挂了」记成
   * 「学生答错了」，错题本和考点推进跟着全错，而且因为冻结再也纠不回来。
   */
  const askFail = await SHT.grade.ask(
    { qid: 't-ask-fail', prompt: '用英语说：他很高。', answer: 'He is tall.', cell: { type: '对话补全', level: '用' } },
    'he is very tall'
  );
  assert('模型不可用时判分只报错，不给对错结论',
    askFail.ok === false && askFail.decided === false && askFail.correct === undefined,
    JSON.stringify(askFail));
  assert('判分失败带着人能读的原因', /没填 API Key|密钥|网络|超时/.test(String(askFail.error || '')),
    String(askFail.error || ''));

  /*
   * 学生端动线：选画像 → 出题 → 答题 → 下一轮。
   * 这条线以前完全没测 —— 页面是给开发者看的，学生端是后加的入口，
   * 一旦 start / next-round 的按钮接错，界面照样能渲染，只是点了没反应。
   */
  console.log('--- 学生端：选画像 → 出题 → 答题 → 下一轮 ---');
  store = {};
  delete require.cache[require.resolve('../src/app.js')];
  // 要先「已配置模型」，否则 start 会先去开设置弹窗而不是出题
  SHT.llm.save({ baseUrl: 'http://mock', model: 'mock-model', key: 'mock-key', temperature: 0.6, maxTokens: 800, timeoutMs: 1000 });
  require('../src/app.js');
  await Promise.resolve();
  const st0 = SHT.devAudit.state();
  assert('默认进学生端，不是开发视图', st0.view === 'student', String(st0.view));
  assert('学生端首屏是选画像（教材/单元/水平 + 开始按钮）',
    nodes.studentRoot.innerHTML.indexOf('今天练什么') >= 0 &&
    nodes.studentRoot.innerHTML.indexOf('data-st-action="book"') >= 0 &&
    nodes.studentRoot.innerHTML.indexOf('data-st-action="unit"') >= 0 &&
    nodes.studentRoot.innerHTML.indexOf('data-st-action="level"') >= 0 &&
    nodes.studentRoot.innerHTML.indexOf('data-st-action="start"') >= 0,
    nodes.studentRoot.innerHTML.slice(0, 60));
  assert('学生端不出现开发话语（配额 / 角色分工）',
    nodes.studentRoot.innerHTML.indexOf('配额') < 0 && nodes.studentRoot.innerHTML.indexOf('角色') < 0);
  /*
   * 单元名用课本原文。以前这里显示的是我们自己译的中文（titleZh），
   * 学生对着书找不到「第 6 单元 · 见见我的家人」这种写法。
   */
  assert('单元标题用课本原文，不用自己译的中文',
    (function () {
      const bk = SHT.BOOKS.get(st0.bookId) || SHT.BOOKS.current();
      const u = bk.units[0];
      const html = nodes.studentRoot.innerHTML;
      return !!u && !!u.title && html.indexOf(u.title) >= 0 && (!u.titleZh || html.indexOf(u.titleZh) < 0);
    })(),
    nodes.studentRoot.innerHTML.slice(0, 200));

  // 出题：模型桩按 计划 → 题 → 验证 的顺序应答；选项取本单元真实词，否则代码闸会判假干扰项
  let stCalls = 0;
  let stWord = '';
  let stPhase = 1;
  SHT.llm.call = async function (opts) {
    stCalls += 1;
    const ws = (SHT.curriculum.words || []);
    const w0 = ws[0] || { en: 'shirt', zh: '衬衫' };
    const o2 = (ws[1] || { en: 'skirt' }).en;
    const o3 = (ws[2] || { en: 'coat' }).en;
    if (opts.role === 'plan') {
      return { ok: true, tokens: 10, ms: 1, json: { plans: [
        { kp: 'vocab · ' + w0.en + ' · 音义联结', ability: 'vocab', cause: '形近', whyThisOne: '本单元核心词', nextIfWrong: '先配对', level: '认' }
      ] } };
    }
    if (opts.role === 'generate') {
      // 第二轮必须换题面：跨轮内容指纹闸会把「上一轮原题照抄」退回。
      // 计划里的考点仍用 w0，这样 parentQid 还能挂回第一轮那道错题。
      if (stPhase === 2) {
        const w1 = ws[1] || { en: 'skirt', zh: '裙子' };
        const zh1 = w1.zh || '第二个词';
        return { ok: true, tokens: 10, ms: 1, json: {
          prompt: '看图选词：这张图里的「' + zh1 + '」是哪个？', audioText: '',
          options: [w1.en, w0.en, o3], answer: w1.en,
          analysis: '「' + zh1 + '」就是 ' + w1.en + '。', keyword: w1.en
        } };
      }
      stWord = w0.en;
      // 题干只能写中文义：写英文原词会被 V4「题干泄答案」直接退回
      return { ok: true, tokens: 10, ms: 1, json: {
        prompt: '选出「' + w0.zh + '」对应的英文。', audioText: '', options: [w0.en, o2, o3],
        answer: w0.en, analysis: '「' + w0.zh + '」就是 ' + w0.en + '。', keyword: w0.en
      } };
    }
    if (opts.role === 'verify') return { ok: true, tokens: 10, ms: 1, json: { verdict: 'pass' } };
    return { ok: true, tokens: 10, ms: 1, json: {} };
  };
  fire('studentRoot', 'click', {
    closest: (sel) => (sel === '[data-st-action]' ? { dataset: { stAction: 'start' } } : null),
    matches() { return false; }
  });
  // 出题是异步的：喂完模型桩，把微任务推完，等界面自己切到第 1 题
  for (let i = 0; i < 300 && nodes.studentRoot.innerHTML.indexOf('data-st-action="pick"') < 0; i += 1) {
    await Promise.resolve();
  }
  assert('点开始后走完整条出题流水线，界面切到第 1 题',
    stCalls >= 2 && nodes.studentRoot.innerHTML.indexOf('第 1 / 1 题') >= 0 &&
    nodes.studentRoot.innerHTML.indexOf(stWord) >= 0,
    '模型调用 ' + stCalls + ' 次 / ' + nodes.studentRoot.innerHTML.slice(0, 80));
  // 上手快：没选就点不动提交，少一次「点了没反应」的试探
  assert('没选选项时提交按钮是禁用的',
    /data-st-action="submit"[^>]*disabled/.test(nodes.studentRoot.innerHTML),
    nodes.studentRoot.innerHTML.slice(0, 200));

  // 答错：选第 2 项
  fire('studentRoot', 'click', {
    closest: (sel) => (sel === '[data-st-action]' ? { dataset: { stAction: 'pick', index: '1' } } : null),
    matches() { return false; }
  });
  fire('studentRoot', 'click', {
    closest: (sel) => (sel === '[data-st-action]' ? { dataset: { stAction: 'submit' } } : null),
    matches() { return false; }
  });
  for (let i = 0; i < 300 && nodes.studentRoot.innerHTML.indexOf('答错了') < 0; i += 1) {
    await Promise.resolve();
  }
  assert('答错后给判定、正确答案与一句去向说明',
    nodes.studentRoot.innerHTML.indexOf('答错了') >= 0 &&
    nodes.studentRoot.innerHTML.indexOf('记下') >= 0,
    nodes.studentRoot.innerHTML.slice(0, 120));

  fire('studentRoot', 'click', {
    closest: (sel) => (sel === '[data-st-action]' ? { dataset: { stAction: 'next' } } : null),
    matches() { return false; }
  });
  assert('答完最后一道进本轮结果，给出「出下一轮题目」',
    nodes.studentRoot.innerHTML.indexOf('轮结束') >= 0 &&
    nodes.studentRoot.innerHTML.indexOf('data-st-action="next-round"') >= 0,
    nodes.studentRoot.innerHTML.slice(0, 120));

  /*
   * 会话记录：界面不展示，但「这次练习多久、成绩怎么走、难度有没有动」
   * 只能从这上面算。没有它，之后想复盘学习曲线就只剩零散事件。
   */
  const stSess = SHT.devAudit.state();
  const sess0 = (stSess.sessions || [])[0];
  assert('会话记录：点开始就建一条，起止/机型/起始水平齐全',
    !!sess0 && sess0.id && sess0.startedAt && !sess0.endedAt &&
    sess0.bookId === stSess.bookId && sess0.unitId === stSess.unitId &&
    !!sess0.startLevel,
    JSON.stringify(sess0 || {}).slice(0, 160));
  assert('会话记录：这一轮出了几题、答对几道、用了哪些决策规则都落进去',
    !!sess0 && sess0.rounds.length === 1 &&
    sess0.rounds[0].count === 1 && (sess0.rounds[0].right + sess0.rounds[0].wrong) === 1 &&
    !!sess0.rounds[0].answeredAt && (sess0.rounds[0].rules || []).length >= 1,
    JSON.stringify(sess0 && sess0.rounds[0] || {}).slice(0, 160));
  assert('这些记录不上界面（学生看不到自己的行为统计与规则编号）',
    nodes.studentRoot.innerHTML.indexOf('profileChanges') < 0 &&
    nodes.studentRoot.innerHTML.indexOf('R-') < 0 &&
    nodes.studentRoot.innerHTML.indexOf('ss-') < 0);

  // 下一轮：错题要进 brief，probe 要指回第一轮那道题
  const beforeNext = stCalls;
  stPhase = 2;
  fire('studentRoot', 'click', {
    closest: (sel) => (sel === '[data-st-action]' ? { dataset: { stAction: 'next-round' } } : null),
    matches() { return false; }
  });
  for (let i = 0; i < 300 && nodes.studentRoot.innerHTML.indexOf('第 1 / 1 题') < 0; i += 1) {
    await Promise.resolve();
  }
  const st1 = SHT.devAudit.state();
  // C 接线：选题决策不是一句「模型觉得他可能不会」，要能顺着 seq 回查轨迹
  assert('C 第二轮选题决策落库，证据 seq 能在原始轨迹里逐条查到',
    st1.decisions.length > 0 && !!st1.levelCap &&
    st1.decisions[0].evidence && Array.isArray(st1.decisions[0].evidence.eventSeqs) &&
    st1.decisions[0].evidence.eventSeqs.every(function (s) {
      return (st1.events || []).some(function (e) { return e.seq === s; });
    }),
    JSON.stringify(st1.decisions[0] || {}).slice(0, 140));
  assert('C 计划与题目都带着同一份决策凭据（规则 + 数值 + 事件 seq）',
    !!(st1.rounds[2].questions[0] && st1.rounds[2].questions[0].decision) &&
    !!st1.rounds[2].questions[0].decision.rule &&
    !!st1.rounds[2].questions[0].decision.evidence &&
    !!(st1.rounds[2].plans[0] && st1.rounds[2].plans[0].decision),
    JSON.stringify((st1.rounds[2].questions[0] || {}).decision || {}).slice(0, 140));
  const stExport = SHT.devAudit.exportPayload();
  assert('C 导出带 decisions / levelCap / events，证据链能带出文件',
    stExport.decisions.length > 0 && !!stExport.levelCap &&
    Array.isArray(stExport.events) && stExport.events.length > 0,
    JSON.stringify(Object.keys(stExport)));
  assert('点「出下一轮」会重新调模型出题，不是复用上一轮的题',
    stCalls > beforeNext && nodes.studentRoot.innerHTML.indexOf('第 1 / 1 题') >= 0,
    '新增调用 ' + (stCalls - beforeNext) + ' 次');
  assert('第二轮那道题挂回第一轮的错题（parentQid）',
    !!(st1.rounds[2].questions[0] && st1.rounds[2].questions[0].parentQid),
    JSON.stringify(st1.rounds[2].questions[0] && st1.rounds[2].questions[0].parentQid));
  assert('学生端全程没把开发面板带出来（错题本/日志/审计台都不在页面里）',
    nodes.studentRoot.innerHTML.indexOf('判分台账') < 0 &&
    nodes.studentRoot.innerHTML.indexOf('出题日志') < 0 &&
    nodes.studentRoot.innerHTML.indexOf('审计') < 0);

  // 出题失败时不能静默退回首页：学生端没有「失败记录」页，原因要写在画像页上
  SHT.llm.call = async function (opts) {
    if (opts.role === 'plan') return { ok: false, errorType: 'network', message: '网络超时' };
    return { ok: false, message: '网络超时' };
  };
  fire('studentRoot', 'click', {
    closest: (sel) => (sel === '[data-st-action]' ? { dataset: { stAction: 'regroup' } } : null),
    matches() { return false; }
  });
  for (let i = 0; i < 300 && nodes.studentRoot.innerHTML.indexOf('没能出成题') < 0; i += 1) {
    await Promise.resolve();
  }
  assert('出题失败时在画像页给出原因，并允许再试一次',
    nodes.studentRoot.innerHTML.indexOf('没能出成题') >= 0 &&
    nodes.studentRoot.innerHTML.indexOf('data-st-action="start"') >= 0,
    nodes.studentRoot.innerHTML.slice(0, 100));

  // 会话封口：真实点过「开始」的这份状态里，重新开始要记结束时间与结束档
  const stEnd = SHT.devAudit.state();
  stEnd.stGroup = 2;
  stEnd.round = 2;
  fire('studentRoot', 'click', {
    closest: (sel) => (sel === '[data-st-action]' ? { dataset: { stAction: 'restart' } } : null),
    matches() { return false; }
  });
  assert('重新开始给会话封口：记结束时间、结束档与原因',
    (stEnd.sessions || []).some(function (s) {
      return !!s.endedAt && s.endReason === 'restart' && !!s.endLevel;
    }),
    JSON.stringify((stEnd.sessions || []).slice(-1)));

  // 收尾：模型桩换回真的，别影响后面的断言
  SHT.llm.call = REAL_CALL;

  /* ================= A：答题轨迹采集 ================= */
  console.log('--- A 答题轨迹采集 ---');
  store = {};
  delete require.cache[require.resolve('../src/app.js')];
  require('../src/app.js');
  await Promise.resolve();
  const stA = SHT.devAudit.state();
  // 学生还没点「开始」，02 页的样题也在渲染，但学生没看见 —— 不能凭空记一段学习轨迹
  assert('A 学生还没开始答题时不产生假曝光轨迹（和错题本同理）',
    stA.events.length === 0, JSON.stringify(stA.events.map(e => e.type)));
  const qA = {
    qid: 'q-trajectory-1', no: 1, knowledgePoint: 'vocab · shirt · 音义联结',
    ability: 'vocab', cell: { type: '中英匹配', level: '认', distractor: '形近' },
    prompt: '选出「衬衫」的英文。', options: ['shirt', 'skirt', 'coat'], answer: 'shirt'
  };
  stA.rounds[1].questions = [qA];
  stA.stStarted = true;

  const stClick = function (action, extra) {
    fire('studentRoot', 'click', {
      closest: (sel) => (sel === '[data-st-action]'
        ? { dataset: Object.assign({ stAction: action }, extra || {}) } : null),
      matches() { return false; }
    });
  };
  const evOf = function (t) { return stA.events.filter(function (e) { return e.type === t; }); };
  const inc = function (arr, field) {
    return arr.every(function (e, i) { return i === 0 || e[field] > arr[i - 1][field]; });
  };

  // 用「选水平」触发一次渲染（值不变，无业务副作用），让曝光事件打点
  stClick('level', { id: 'B' });
  assert('A 题一出现就记曝光，且带学生 / 题 / 轮次 / 知识点',
    evOf('shown').length === 1 && evOf('shown')[0].qid === qA.qid &&
    evOf('shown')[0].studentId === SHT.sampleStudent.id &&
    evOf('shown')[0].kp === qA.knowledgePoint && evOf('shown')[0].round === 1,
    JSON.stringify(evOf('shown')));
  stClick('level', { id: 'B' });
  assert('A 重复渲染不重复记曝光', evOf('shown').length === 1, String(evOf('shown').length));

  stClick('submit');
  await Promise.resolve();
  assert('A 只提交不选不记 submit（空作答不是证据）',
    evOf('submit').length === 0, String(evOf('submit').length));

  stClick('pick', { index: '0' });
  stClick('pick', { index: '1' });
  // 第三次必须换个值：点同一个是「取消选择」，那样提交时又变成没选
  stClick('pick', { index: '2' });
  assert('A 改选记成独立事件，不覆盖首次选择',
    evOf('pick').length === 1 && evOf('change').length === 2 &&
    evOf('change')[0].payload.prevIndex === 0,
    stA.events.map(e => e.type).join(','));

  stClick('submit');
  for (let i = 0; i < 200 && evOf('reveal').length === 0; i += 1) await Promise.resolve();
  assert('A 提交与反馈各一条，带上判定依据与耗时',
    evOf('submit').length === 1 && evOf('reveal').length === 1 &&
    evOf('submit')[0].payload.correct === false &&
    evOf('submit')[0].payload.picked === 'coat' &&
    evOf('submit')[0].payload.via === 'exact' &&
    evOf('submit')[0].payload.hintUsed === false &&
    typeof evOf('submit')[0].payload.durationMs === 'number',
    JSON.stringify((evOf('submit')[0] || {}).payload || {}));

  stClick('submit');
  await Promise.resolve();
  assert('A 重复提交不重复记（revealed 后直接挡下）',
    evOf('submit').length === 1, String(evOf('submit').length));

  stClick('next');
  assert('A 答完离开本题记 leave', evOf('leave').length >= 1,
    'leave ' + evOf('leave').length);
  const beforeUnit = stA.events.length;
  stClick('book', { id: 'HEB-G4A' });
  assert('A 切教材不清空轨迹（轨迹跟着学生走，和错题一致）',
    stA.events.length >= beforeUnit &&
    stA.events.slice(0, beforeUnit).every(e => e && e.qid && e.type),
    beforeUnit + ' → ' + stA.events.length);
  assert('A seq 与 ts 都严格递增，每条带完整身份信息',
    inc(stA.events, 'seq') && inc(stA.events, 'ts') &&
    stA.events.every(e => e.studentId && e.qid && e.kp && e.round >= 1 &&
      SHT.learner.TYPES.indexOf(e.type) >= 0),
    '共 ' + stA.events.length + ' 条 / ' + stA.events.map(e => e.type).join(','));
  assert('A 覆盖曝光→选择→改选→提交→反馈→离开六类事件',
    ['shown', 'pick', 'change', 'submit', 'reveal', 'leave'].every(t => evOf(t).length > 0),
    stA.events.map(e => e.type).join(','));

  /* ================= B：可复算的学习者模型 ================= */
  console.log('--- B 学习者模型可复算 ---');
  const KP = 'vocab · shirt · 形近';
  const mkEv = function (seq, qid, type, payload, sid) {
    return {
      seq: seq, studentId: sid || 'S-TEST', qid: qid, kp: KP, round: 1,
      ts: 1000 + seq, type: type, payload: payload || {}
    };
  };
  // 一串轨迹：每题 shown → pick → (change / hint) → submit → reveal → leave
  const series = function (prefix, spec) {
    const out = [];
    let seq = 0;
    spec.forEach(function (s, i) {
      const qid = prefix + '-' + (i + 1);
      out.push(mkEv(++seq, qid, 'shown', {}));
      out.push(mkEv(++seq, qid, 'pick', { index: 0 }));
      for (let c = 0; c < (s.changes || 0); c += 1) {
        out.push(mkEv(++seq, qid, 'change', { index: 1, prevIndex: 0 }));
      }
      if (s.hint) out.push(mkEv(++seq, qid, 'hint', { removedIndex: 1 }));
      out.push(mkEv(++seq, qid, 'submit', {
        picked: s.correct ? 'shirt' : 'skirt', expected: 'shirt',
        correct: s.correct, via: 'exact', durationMs: s.ms, hintUsed: !!s.hint
      }));
      out.push(mkEv(++seq, qid, 'reveal', { correct: s.correct }));
      out.push(mkEv(++seq, qid, 'leave', {}));
    });
    return out;
  };
  const fast = series('fast', [{ ms: 2500, correct: false }, { ms: 2800, correct: false }]);
  const slow = series('slow', [{ ms: 20000, correct: false }, { ms: 22000, correct: false }]);
  const guess = series('guess', [{ ms: 9000, correct: true, changes: 2, hint: true }]);
  const clean = series('clean', [{ ms: 6000, correct: true }, { ms: 6200, correct: true }]);

  const emptyModel = SHT.learner.build([]);
  assert('B 没有轨迹时模型是空的，理由说人话',
    emptyModel.queue.length === 0 && emptyModel.answeredCount === 0 &&
    emptyModel.reason.indexOf('还没有作答轨迹') >= 0, emptyModel.reason);

  const mFast = SHT.learner.build(fast);
  const mSlow = SHT.learner.build(slow);
  assert('B 同样错两次：掌握概率相同（BKT 只看对错序列）',
    mFast.byKp[KP].pKnown === mSlow.byKp[KP].pKnown,
    mFast.byKp[KP].pKnown + ' / ' + mSlow.byKp[KP].pKnown);
  assert('B 但秒错判成粗心、久想仍错判成未掌握，排序权重也不同',
    mFast.byKp[KP].tendency === 'slip' && mSlow.byKp[KP].tendency === 'unknown' &&
    mSlow.queue[0].score > mFast.queue[0].score,
    mFast.byKp[KP].tendency + ' ' + mFast.queue[0].score + ' / ' +
    mSlow.byKp[KP].tendency + ' ' + mSlow.queue[0].score);
  assert('B 靠提示加改选才答对，判成不稳定且掌握概率压低',
    SHT.learner.build(guess).byKp[KP].tendency === 'unstable' &&
    SHT.learner.build(guess).byKp[KP].pKnown < SHT.learner.build(clean).byKp[KP].pKnown,
    String(SHT.learner.build(guess).byKp[KP].pKnown) + ' / ' +
    String(SHT.learner.build(clean).byKp[KP].pKnown));

  const before = JSON.stringify(fast);
  const r1 = JSON.stringify(SHT.learner.build(fast));
  const r2 = JSON.stringify(SHT.learner.build(fast));
  const rShuffled = JSON.stringify(SHT.learner.build(fast.slice().reverse()));
  assert('B 同一串事件重放结果逐字段相等', r1 === r2, '两次输出不一致');
  assert('B 输入数组被打乱，只要 seq 不变结果就一样', r1 === rShuffled,
    '乱序后结果变了：说明还在依赖数组顺序');
  assert('B build 不修改入参', JSON.stringify(fast) === before);

  const mixed = fast.concat(slow.map(function (e) {
    return Object.assign({}, e, {
      studentId: 'S-OTHER', seq: e.seq + 1000, qid: e.qid + '-b'
    });
  }));
  const mA = SHT.learner.build(mixed, { studentId: 'S-TEST' });
  const mB = SHT.learner.build(mixed, { studentId: 'S-OTHER' });
  assert('B 混合轨迹按学生分开算，两个学生的模型互不污染',
    mA.byKp[KP].tendency === 'slip' && mB.byKp[KP].tendency === 'unknown' &&
    mA.studentId === 'S-TEST' && mB.studentId === 'S-OTHER',
    mA.byKp[KP].tendency + ' / ' + mB.byKp[KP].tendency);

  // 桥接：真实采集的事件必须能被模型直接读，防止采集格式和模型契约各写一套
  const mReal = SHT.learner.build(stA.events);
  assert('B 真实采集的事件能直接喂给模型（采集格式与算法契约一致）',
    mReal.answeredCount === 1 && !!mReal.byKp[qA.knowledgePoint] &&
    mReal.byKp[qA.knowledgePoint].changes === 2 &&
    mReal.queue[0].reason.indexOf('掌握概率') >= 0,
    JSON.stringify(mReal.queue[0] || {}));
  const dg = SHT.learner.digest(mReal, 2);
  assert('B 导出摘要只带可核对的字段，不塞整串事件',
    dg.queue.length <= 2 && typeof dg.reason === 'string' && dg.answeredCount === 1 &&
    !dg.events, JSON.stringify(dg).slice(0, 120));

  /* ================= C：决策有凭据、两个学生拿到不同题 ================= */
  console.log('--- C 选题决策的证据链 ---');
  const kps = [
    { id: 'kp-shirt', label: KP, ability: 'vocab' },
    { id: 'kp-coat', label: 'vocab · coat · 形近', ability: 'vocab' },
    { id: 'kp-hat', label: 'vocab · hat · 形近', ability: 'vocab' }
  ];
  const opt = { layer: 'B', kps: kps, count: 3 };
  const dFast = SHT.learner.decide(mFast, opt);
  const cSlow = SHT.learner.decide(mSlow, opt);
  const dGuess = SHT.learner.decide(SHT.learner.build(guess), opt);
  const dCold = SHT.learner.decide(SHT.learner.build([]), opt);

  assert('C 秒错与久想仍错，命中不同规则 / 层次 / 干扰项（不是同一套题换个说法）',
    dFast.items[0].rule === 'R-SLIP-RETRY' && cSlow.items[0].rule === 'R-UNKNOWN-DOWN' &&
    dFast.items[0].level !== cSlow.items[0].level &&
    dFast.items[0].distractor !== cSlow.items[0].distractor,
    dFast.items[0].rule + '/' + dFast.items[0].level + ' vs ' + cSlow.items[0].rule + '/' + cSlow.items[0].level);
  assert('C 靠提示改选才答对判「不稳定」，不冒充掌握',
    dGuess.items[0].rule === 'R-UNSTABLE-VERIFY', dGuess.items[0].rule);
  assert('C 没有轨迹时按未测考点冷启动，且不编造证据',
    dCold.items.length === 3 && dCold.items[0].evidence.eventSeqs.length === 0 &&
    dCold.items.every(function (i) { return i.rule === 'R-EXPLORE' || i.rule === 'R-COLD-START'; }),
    JSON.stringify(dCold.items.map(function (i) { return i.rule; })));
  assert('C 每条决策都带数值理由与可回查的原始事件 seq',
    /掌握概率 \d+%/.test(dFast.items[0].reason) &&
    /事件 seq [\d,]+/.test(dFast.items[0].reason) &&
    dFast.items[0].evidence.eventSeqs.length > 0 &&
    dFast.items[0].evidence.eventSeqs.every(function (s) {
      return fast.some(function (e) { return e.seq === s; });
    }), dFast.items[0].reason.slice(0, 160));
  assert('C 决策可复算：同一状态重放逐字段相等',
    JSON.stringify(SHT.learner.decide(mFast, opt)) === JSON.stringify(dFast));

  const good3 = series('g3', [{ ms: 6000, correct: true }, { ms: 6100, correct: true }, { ms: 6200, correct: true }]);
  const bad3 = series('b3', [{ ms: 20000, correct: false }, { ms: 21000, correct: false }, { ms: 22000, correct: false }]);
  const mGood = SHT.learner.build(good3);
  const mBad = SHT.learner.build(bad3);
  assert('C 水平上限随表现调档：连对三次升一档、久想连错三次降一档、作答不足三次不动',
    SHT.learner.levelCapOf(mGood, 'B').delta === 1 &&
    SHT.learner.levelCapOf(mBad, 'B').delta === -1 &&
    SHT.learner.levelCapOf(mFast, 'B').delta === 0,
    [SHT.learner.levelCapOf(mGood, 'B').delta, SHT.learner.levelCapOf(mBad, 'B').delta,
      SHT.learner.levelCapOf(mFast, 'B').delta].join('/'));
  const dGood = SHT.learner.decide(mGood, opt);
  assert('C 真会的考点出进阶题，不跳回「认」层',
    dGood.items[0].rule === 'R-SOLID-ADVANCE' &&
    dGood.items[0].level === dGood.levelCap.cap,
    dGood.items[0].rule + ' / ' + dGood.items[0].level + ' / cap ' + dGood.levelCap.cap);

  /* ================= 跨轮重复题：硬闸，不靠模型自觉 ================= */
  console.log('--- 跨轮去重 ---');
  await (async function () {
    // 桩题必须用当前册的真实词：写死 shirt/skirt/coat 换一本教材就会被 V1 超纲拦下，
    // 那样测到的不是去重闸，是词表。
    const ws = (SHT.curriculum.words || []).map(function (w) { return w.en; });
    const a = ws[0] || 'shirt';
    const b = ws[1] || 'skirt';
    const c = ws[2] || 'coat';
    const dupQ = qJson({
      prompt: '选出正确的一项。', options: [a, b, c], answer: a,
      analysis: '这是本单元学过的词。', keyword: a
    });
    const hist = [{
      qid: 'h1', prompt: dupQ.prompt, audioText: '', options: dupQ.options.slice(),
      answer: dupQ.answer,
      cell: { type: '中英匹配', scene: '学校', level: '认', distractor: '形近' }
    }];
    SHT.llm.call = async function (o) {
      if (o.role === 'plan') return PLAN_OK;
      if (o.role === 'generate') return { ok: true, json: dupQ, tokens: 10, ms: 1 };
      return { ok: true, json: { verdict: 'pass' }, tokens: 10, ms: 1 };
    };
    const out = await SHT.pipeline.runRound({
      unit: SHT.curriculum, count: 1, brief: {}, existing: [], history: hist
    });
    assert('跨轮把原题照抄会被代码闸退回，并留下人话原因',
      out.questions.length === 0 && out.failures.some(function (f) { return f.codes.indexOf('V_DUP') >= 0; }) &&
      SHT.codeLabel('V_DUP').indexOf('重复') >= 0,
      JSON.stringify(out.failures.map(function (f) { return f.codes.join(','); })));

    SHT.llm.call = async function (o) {
      if (o.role === 'plan') return PLAN_OK;
      if (o.role === 'generate') return { ok: true, tokens: 10, ms: 1, json: Object.assign({}, dupQ, {
        prompt: '换一个问法：下面哪个是对的？', answer: b,
        options: [b, a, c], keyword: b
      }) };
      return { ok: true, json: { verdict: 'pass' }, tokens: 10, ms: 1 };
    };
    const out2 = await SHT.pipeline.runRound({
      unit: SHT.curriculum, count: 1, brief: {}, existing: [], history: hist
    });
    assert('换了题面就能过，且不再落在历史用过的格子上',
      out2.questions.length === 1 &&
      SHT.cellKey(out2.questions[0].cell) !== SHT.cellKey(hist[0].cell),
      JSON.stringify((out2.questions[0] || {}).cell || {}) + ' | ' +
      JSON.stringify(out2.failures.map(function (f) {
        return f.stage + ':' + f.codes.join(',') + ':' + String(f.reason || '').slice(0, 100);
      })));
    SHT.llm.call = REAL_CALL;
  })();

  /* ================= 轮次上限与水平标签 ================= */
  console.log('--- 轮次上限 ---');
  stA.round = 2;
  stA.stGroup = 2;
  stA.rounds[2].questions = [qA];
  stA.rounds[2].practice.cursor = 1;
  stClick('level', { id: 'A' });
  const sumHtml = nodes.studentRoot.innerHTML;
  assert('画像变更留痕：改水平写进 profileLog（界面不显示这条）',
    (stA.profileLog || []).some(function (x) { return x.kind === 'level' && x.to === 'A'; }) &&
    nodes.studentRoot.innerHTML.indexOf('profileLog') < 0,
    JSON.stringify((stA.profileLog || []).slice(-2)));
  assert('两组两轮跑完给终态，不再有「再练一组」的无限循环',
    sumHtml.indexOf('data-st-action="restart"') >= 0 &&
    sumHtml.indexOf('data-st-action="regroup"') < 0 &&
    sumHtml.indexOf('第 2 轮结束') >= 0,
    sumHtml.slice(0, 160));
  stClick('regroup');
  assert('到上限后再点「再练一组」被挡住，轮次不再重置',
    stA.stGroup === 2 && stA.round === 2, stA.stGroup + ' / ' + stA.round);
  const eventsBeforeRestart = stA.events.length;
  stClick('restart');
  const profHtml = nodes.studentRoot.innerHTML;
  assert('重新开始回到画像页，但轨迹/错题/历史题跟着学生保留',
    stA.stGroup === 1 && stA.stStarted === false &&
    stA.events.length === eventsBeforeRestart &&
    profHtml.indexOf('今天练什么') >= 0,
    '组 ' + stA.stGroup + ' / 事件 ' + stA.events.length + ' / ' + profHtml.slice(0, 60));
  assert('水平标签与算法 A/B/C 语义对齐：基础=C、较好=A（以前写反了）',
    /data-id="C"[^>]*>基础/.test(profHtml) && /data-id="A"[^>]*>较好/.test(profHtml),
    (profHtml.match(/data-id="[ABC]"[^>]*>[^<]+/g) || []).join(' | '));

  console.log('\n' + (failed === 0 ? 'ALL PASS' : failed + ' FAILED'));
  process.exit(failed === 0 ? 0 : 1);
})();
>>>>>>> f3eb87416fa411393fc7688ca7a5347928fdd19b
