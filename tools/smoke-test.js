/*
 * 零依赖冒烟测试：node tools/smoke-test.js
 *
 * 用最小 DOM 模拟加载全部前端脚本，验证初始化渲染与三个 tab 的切换不抛错，
 * 并单测核心纯函数（薄弱投影、状态机、认证达标、指纹不变性）。
 * 不做真实浏览器渲染，不替代人工看界面。
 */
const NativeURL = global.URL;
global.window = global;

const handlers = {};
function mk(id) {
  return {
    _id: id,
    innerHTML: '', value: '', checked: false, textContent: '', href: '', download: '',
    dataset: {}, style: {}, tagName: 'DIV',
    classList: { toggle() {}, add() {}, remove() {} },
    addEventListener(type, fn) { (handlers[id] = handlers[id] || {})[type] = fn; },
    matches() { return false; },
    closest() { return null; },
    appendChild() {}, removeChild() {}, remove() {}, click() {}, setAttribute() {},
    querySelector() { return null; }
  };
}
const nodes = {};
global.document = {
  getElementById(id) { return nodes[id] || (nodes[id] = mk(id)); },
  querySelectorAll() { return []; },
  querySelector() { return null; },
  createElement() { return mk('created'); },
  body: mk('body')
};
let store = {};
global.localStorage = {
  getItem(k) { return store[k] || null; },
  setItem(k, v) { store[k] = v; },
  removeItem(k) { delete store[k]; }
};
global.navigator = { clipboard: { writeText() {} } };
global.confirm = () => true;
global.setTimeout = function () { return 0; };
global.clearTimeout = function () {};
global.Blob = class Blob {};
global.URL = class extends NativeURL {
  static createObjectURL() { return 'blob:stub'; }
  static revokeObjectURL() {}
};

require('../src/data/textbook.js');
require('../src/data/curriculum.js');
require('../src/data/knowledgePoints.js');
require('../src/data/wrongCases.js');
require('../src/core/enums.js');
require('../src/core/fingerprint.js');
require('../src/core/checklist.js');
require('../src/core/wrongBook.js');
require('../src/core/practice.js');
require('../src/app.js');

const SHT = global.SHT;
let failed = 0;
function assert(name, cond, extra) {
  if (cond) console.log('PASS  ' + name);
  else { console.log('FAIL  ' + name + (extra ? '  → ' + extra : '')); failed += 1; }
}
function count(id, needle) {
  return (nodes[id].innerHTML.split(needle).length - 1);
}
function fire(id, type, target) {
  if (!handlers[id] || !handlers[id][type]) throw new Error('no handler: ' + id + '/' + type);
  handlers[id][type]({ target: Object.assign({ closest() { return null; }, matches() { return false; }, dataset: {} }, target) });
}
console.log('--- 初始化渲染 ---');
assert('三个智能体卡片 = 3', count('agentRail', 'data-role="') === 3, count('agentRail', 'data-role="'));
assert('默认显示课程智能体的 5 行配额', count('agentPanel', 'class="plan-row') === 5, count('agentPanel', 'class="plan-row'));
assert('错题卡 3 张，每题带 6 行出题要点', count('wrongList', 'class="wrong-card') === 3 && count('wrongList', 'class="brief-row"') === 18,
  count('wrongList', 'class="wrong-card') + ' / ' + count('wrongList', 'class="brief-row"'));
assert('五个 KPI', count('metrics', 'class="kpi"') === 5, count('metrics', 'class="kpi"'));
assert('出题日志有记录', count('logFeed', 'class="log-item"') >= 5, count('logFeed', 'class="log-item"'));
assert('打回缘由有渲染结果', nodes.rejectChart.innerHTML.length > 0);
assert('已占用角度 5 个短码', count('usedCells', 'class="used-cell"') === 5, count('usedCells', 'class="used-cell"'));
assert('停止决策两个信号', count('stopPanel', 'data-stop="') === 2, count('stopPanel', 'data-stop="'));
assert('新增错题表单已渲染', count('addWrongForm', 'data-new="') === 8, count('addWrongForm', 'data-new="'));

console.log('--- 02 答题：作答 → 判定 → 分支 ---');
const q1 = SHT.sampleQuestions[0];
function click(id, dataset) {
  fire(id, 'click', {
    closest(sel) { return sel === '[data-action]' ? { dataset } : null; },
    matches() { return false; }
  });
}
assert('答题页显示第 1 个考点的选项', count('practiceCard', 'class="opt-btn') === 3, count('practiceCard', 'class="opt-btn'));
assert('右侧考点列表 5 行', count('practiceRail', 'class="point-row') === 5, count('practiceRail', 'class="point-row'));

click('practiceCard', { action: 'pick-option', index: '0' });
click('practiceCard', { action: 'submit-answer' });
assert('答对后判定条出现', count('practiceCard', 'class="verdict is-good"') === 1);
assert('答对提示换下一个考点', nodes.practiceCard.innerHTML.indexOf('换下一个考点') >= 0);
click('practiceCard', { action: 'next-step' });
assert('答对推进到第 2 个考点', nodes.practiceCard.innerHTML.indexOf('第 2 个考点') >= 0);
assert('右侧第 1 个考点记为会用', nodes.practiceRail.innerHTML.indexOf('会用') >= 0);

click('practiceCard', { action: 'restart-practice' });
assert('重测回到第 1 个考点', nodes.practiceCard.innerHTML.indexOf('第 1 个考点') >= 0);
click('practiceCard', { action: 'pick-option', index: '1' });
click('practiceCard', { action: 'submit-answer' });
assert('答错给的是「换一道同考点的变体」', nodes.practiceCard.innerHTML.indexOf('换一道同考点的变体再考') >= 0);
click('practiceCard', { action: 'next-step' });
assert('变体题上屏且标注同考点换表面', nodes.practiceCard.innerHTML.indexOf('变体 · 同考点换表面') >= 0);

const variant1 = SHT.buildVariant(q1, q1.no);
const wrongIdx = variant1.options.findIndex(o => SHT.normAnswer(o) !== SHT.normAnswer(variant1.answer));
click('practiceCard', { action: 'pick-option', index: String(wrongIdx) });
click('practiceCard', { action: 'submit-answer' });
assert('变体答错后判定条是失败态', count('practiceCard', 'class="verdict is-bad"') === 1);
assert('变体答错写明不写 mastered', nodes.practiceCard.innerHTML.indexOf('这个考点不写 mastered') >= 0);
const wrongBefore = count('wrongList', 'class="wrong-card');
click('practiceCard', { action: 'next-step' });
assert('变体再错自动写进错题本', count('wrongList', 'class="wrong-card') === wrongBefore + 1,
  wrongBefore + ' → ' + count('wrongList', 'class="wrong-card'));
assert('写进去的错题带知识点与作答', nodes.wrongList.innerHTML.indexOf('classroom') >= 0 && nodes.wrongList.innerHTML.indexOf('窗户') >= 0);
assert('作答记录进了日志信息流', count('logFeed', 'is-answer') >= 2, count('logFeed', 'is-answer'));

console.log('--- 教材知识库 ---');
const BOOK = global.SHT_BOOK;
assert('教材入库：6 个教学单元 + 2 个复习单元', BOOK.units.length === 6 && BOOK.reviews.length === 2,
  BOOK.units.length + ' / ' + BOOK.reviews.length);
assert('每单元词表 ≥ 8 词（够凑 4 个选项）', BOOK.units.every(u => u.words.length >= 8),
  BOOK.units.map(u => u.words.length).join(','));
assert('每单元都有句型表 / 语音点 / 情境域', BOOK.units.every(u => u.sentencePatterns.length >= 4 && u.phonics && u.phonics.focus && u.topicDomain));
assert('情境域全部落在界面枚举内', BOOK.units.every(u => SHT.SCENES.includes(u.topicDomain)),
  BOOK.units.map(u => u.topicDomain).join(','));
assert('每个词都带书上页码', BOOK.units.every(u => u.words.every(w => typeof w.p === 'number')));
assert('全册去重后词数 > 单册最大单元', BOOK.allWords().length > 40, BOOK.allWords().length);
assert('超纲判定：本单元词通过、外单元词拦下',
  BOOK.isInUnit('blackboard', 'U1') === true && BOOK.isInUnit('beef', 'U1') === false &&
  BOOK.isInUnit('please', 'U1') === true);
assert('当前切片 = U1 My classroom', SHT.curriculum.id === 'U1' && SHT.curriculum.title === 'My classroom' &&
  SHT.curriculum.topicDomain === '学校');

console.log('--- 候选知识点（输入层） ---');
const KPS = SHT.kpsOf('U1');
const typeIds = SHT.QUESTION_TYPES.map(t => t.id);
const causeIds = SHT.ERROR_CAUSES.map(c => c.id);
assert('U1 候选 8 条 / 分 3 组', KPS.length === 8 && SHT.KP_GROUPS.length === 3, KPS.length);
assert('八个出题角度互不重复', new Set(KPS.map(k => SHT.cellFingerprint(k.cell))).size === 8);
assert('格子四维全部落在枚举内', KPS.every(k => typeIds.includes(k.cell.type) && SHT.SCENES.includes(k.cell.scene) && SHT.LEVELS.includes(k.cell.level) && SHT.DISTRACTORS.includes(k.cell.distractor)));
assert('情境全部锁在 U1 话题域', KPS.every(k => k.cell.scene === SHT.curriculum.topicDomain));
assert('每条都有错因 / 教材依据 / 示例问法 / 下一轮建议', KPS.every(k => causeIds.includes(k.cause) && k.source && k.example && k.nextIfWrong && k.why));
assert('每个单元的候选都只属于自己', BOOK.units.every(u => SHT.kpsOf(u.id).every(k => k.unit === u.id)));
assert('每单元候选 ≥ 5 条，且至少 3 条带真实错例', BOOK.units.every(u => {
  const list = SHT.kpsOf(u.id);
  return list.length >= 5 && list.filter(k => k.missedCase).length >= 3;
}), BOOK.units.map(u => SHT.kpsOf(u.id).length).join(','));
assert('计划面板有候选折叠区且默认收起', count('agentPanel', 'class="kp-fold"') === 1 && count('agentPanel', 'data-action="pick-kp"') === 8);

console.log('--- tab / 角色切换 ---');
fire('tabbar', 'click', { closest: () => ({ dataset: { tab: 'wrongbook' } }) });
assert('切到错题记录 tab 不抛错', true);
fire('tabbar', 'click', { closest: () => ({ dataset: { tab: 'agents' } }) });
fire('agentPanel', 'click', {
  closest(sel) { return sel === '[data-action]' ? { dataset: { action: 'pick-kp', id: 'kp-U1-01' } } : null; },
  matches() { return false; }
});
assert('点「用这个」把候选写进第 1 题', nodes.agentPanel.innerHTML.indexOf('value="spelling · blackboard · oa + ar 双字母组合"') >= 0);
fire('agentRail', 'click', { closest: () => ({ dataset: { role: 'execute' } }) });
assert('执行智能体渲染单题表单', count('agentPanel', 'class="field-grid"') === 1 && count('agentPanel', 'data-field="prompt"') === 1);
assert('单题卡有候选下拉且列出 8 条', count('agentPanel', 'data-kp-pick') === 1 && count('agentPanel', '<option value="kp-') === 8);
fire('agentRail', 'click', { closest: () => ({ dataset: { role: 'verify' } }) });
assert('验证智能体渲染层切换', count('agentPanel', 'class="layer-switch"') === 1 && count('agentPanel', 'data-action="layer"') === SHT.CHECK_LAYERS.length);
fire('agentPanel', 'click', {
  closest(sel) { return sel === '[data-action]' ? { dataset: { action: 'check', check: SHT.ALL_CHECKS[0].id, verdict: 'pass' } } : null; },
  matches() { return false; }
});
assert('勾选一条检查后面板重渲染且摘要仍在', count('agentPanel', 'stat-pill') === 2, count('agentPanel', 'stat-pill'));

console.log('--- 错题回写计划 ---');
fire('tabbar', 'click', { closest: () => ({ dataset: { tab: 'wrongbook' } }) });
fire('wrongList', 'click', {
  closest(sel) {
    return sel === '[data-action="apply-weak"]'
      ? { dataset: { action: 'apply-weak', key: SHT.sampleWrongCases[0].knowledgePoint, index: '0' } }
      : null;
  },
  matches() { return false; }
});
assert('错题「写入计划」把知识点带回 01', count('agentPanel', 'value="spelling · blackboard · oa + ar 双字母组合"') >= 1);

console.log('--- 核心纯函数 ---');
const projection = SHT.projectWeaknesses(SHT.sampleWrongCases, '学校');
assert('薄弱投影 3 组 / 队列 3 条', projection.items.length === 3 && projection.remainingCount === 3);
assert('建议格子情境锁在本单元话题域', projection.items.every(i => i.suggestedCell.scene === '学校'));
assert('错因→格子：形近映射到「辨 / 形近」', SHT.suggestCell('形近混淆', '学校').level === '辨' && SHT.suggestCell('形近混淆', '学校').distractor === '形近');

const base = SHT.sampleWrongCases[2];
const cleaned = SHT.appendVariantAttempt(base, { correct: true, hintCount: 0, retryCount: 0 });
assert('无提示答对 → corrected', cleaned.masteryState === 'corrected', cleaned.masteryState);
const supported = SHT.appendVariantAttempt(base, { correct: true, hintCount: 1, retryCount: 0 });
assert('用了提示的答对不算订正', supported.masteryState === 'wrong', supported.masteryState);
const twice = SHT.appendVariantAttempt(SHT.appendVariantAttempt(base, { correct: false }), { correct: false });
assert('连续两轮不过 → 需教师介入', twice.masteryState === 'teacher-help', twice.masteryState);
const mastered = Object.assign({}, base, { masteryState: 'mastered' });
assert('已掌握不回退', SHT.appendVariantAttempt(mastered, { correct: false }).masteryState === 'mastered');

const five = n => Array.from({ length: 5 }, (_, i) => ({ correct: i < n, hintCount: 0, retryCount: 0, scoringMethod: 'exact' }));
assert('认证 5/5 达到 B 层 80 分', SHT.certify(base, five(5), 'B').passed === true);
assert('认证 4/5 = 80 分，B 层通过', SHT.certify(base, five(4), 'B').score === 80 && SHT.certify(base, five(4), 'B').passed === true);
assert('认证 3/5 = 60 分，未通过', SHT.certify(base, five(3), 'B').passed === false);
assert('认证不足 5 题直接拒绝', SHT.certify(base, five(3).slice(0, 3), 'B').ok === false);
assert('认证有提示直接拒绝', SHT.certify(base, five(5).map((a, i) => i === 0 ? Object.assign({}, a, { hintCount: 1 }) : a), 'B').ok === false);
assert('分层分数线 A90 / B80 / C70', SHT.thresholdForLayer('A') === 90 && SHT.thresholdForLayer('B') === 80 && SHT.thresholdForLayer('C') === 70);

const q = SHT.sampleQuestions[0];
const reordered = Object.assign({}, q, { options: q.options.slice().reverse() });
assert('内容指纹与选项顺序无关', SHT.contentFingerprint(q) === SHT.contentFingerprint(reordered));
const ex = SHT.buildExclusionList([{ questions: SHT.sampleQuestions }]);
assert('历史格子 5 个且全部可排除', ex.usedCells.size === 5 && SHT.sampleQuestions.every(x => ex.isCellBlocked(x.cell)));
assert('四层检查共 23 条', SHT.ALL_CHECKS.length === 23, SHT.ALL_CHECKS.length);
assert('自检十问 = 10', SHT.SELF_CHECK_TEN.length === 10);

console.log('--- 判对错与变体（纯函数） ---');
assert('答案比对忽略大小写与句点', SHT.normAnswer(' Thank you. ') === 'thank you');
assert('答对判 true / 答错判 false',
  SHT.evaluateAnswer(q, 0).correct === true && SHT.evaluateAnswer(q, 1).correct === false);
assert('没选答案直接拒答', SHT.evaluateAnswer(q, null).ok === false);
assert('缺答案的题不能作答', SHT.evaluateAnswer({ options: ['a', 'b'], answer: '' }, 0).ok === false);

const variants = SHT.sampleQuestions.map(x => SHT.buildVariant(x, x.no));
assert('U1 五道题都能接出变体', variants.every(Boolean),
  variants.map(v => v ? 'ok' : 'null').join(','));
assert('变体答案都落在自己的选项里',
  variants.every(v => v.options.some(o => SHT.normAnswer(o) === SHT.normAnswer(v.answer))));
assert('同参调用结果完全一致（确定性）',
  JSON.stringify(SHT.buildVariant(q, q.no)) === JSON.stringify(variants[0]));
assert('变体确实换了表面：答案与原题不同、并写明换了什么',
  SHT.normAnswer(variants[0].answer) !== SHT.normAnswer(q.answer) && variants[0].basis.indexOf('换') === 0,
  variants[0].basis);
assert('变体沿用原题格子（同考点才叫探针）',
  variants.every((v, i) => JSON.stringify(v.cell) === JSON.stringify(SHT.sampleQuestions[i].cell)));

const A = (stage, correct, hintCount) => ({ stage: stage, correct: correct, hintCount: hintCount || 0 });
assert('没作答 → 未测', SHT.judgePoint([]).state === 'unseen');
assert('原题对 + 变体对 → 真会', SHT.judgePoint([A('first', true), A('variant', true)]).state === 'mastered');
assert('原题对 + 变体错 → 只记住这道题', SHT.judgePoint([A('first', true), A('variant', false)]).state === 'fragile');
assert('原题对、接不出变体 → 只算会用', SHT.judgePoint([A('first', true)]).state === 'passed');
assert('原题错 + 变体对 → 换个角度才会', SHT.judgePoint([A('first', false), A('variant', true)]).state === 'passed');
assert('原题错 + 变体错 → 不会', SHT.judgePoint([A('first', false), A('variant', false)]).state === 'wrong');
assert('用了提示最高只到看提示才会', SHT.judgePoint([A('first', true, 1), A('variant', true)]).state === 'assisted');

const draft = {
  kpId: 'kp-U1-04', knowledgePoint: 'vocab · classroom', unitId: 'G4-上-U1',
  originalQuestionId: 'q1', category: '未掌握', at: '2026-11-09T10:00:00'
};
const createdCase = SHT.upsertWrongCase([], draft);
assert('错题写入用业务键生成 id',
  createdCase.created === true && createdCase.list[0].id === 'wq:S-001:G4-上-U1:q1', createdCase.list[0].id);
const againCase = SHT.upsertWrongCase(createdCase.list, draft);
assert('同考点再错只追加记录，不新建卡片',
  againCase.created === false && againCase.list.length === 1 && againCase.list[0].variantAttempts.length === 1);

console.log('--- 单元切换 ---');
fire('unitSelect', 'change', { value: 'U5' });
assert("切到 U5：切片换成 Dinner's ready", SHT.curriculum.id === 'U5' && SHT.curriculum.title === "Dinner's ready",
  SHT.curriculum.id + ' / ' + SHT.curriculum.title);
assert('切到 U5：情境域跟着变食物饮料', SHT.curriculum.topicDomain === '食物饮料', SHT.curriculum.topicDomain);
assert('切到 U5：词表换成本单元 22 词', SHT.curriculum.words.length === 22, SHT.curriculum.words.length);
assert('切到 U5：候选只剩本单元 5 条', SHT.kpsOf('U5').length === 5 && count('agentPanel', 'data-action="pick-kp"') === 5,
  SHT.kpsOf('U5').length + ' / ' + count('agentPanel', 'data-action="pick-kp"'));
assert('错题跟着换成本单元 3 条', count('wrongList', 'class="wrong-card') === 3 && count('wrongList', '"Fork"') === 0,
  count('wrongList', 'class="wrong-card'));
assert('切回来后仍是同一份教材', SHT_BOOK.units.every(u => u.hostUnitId.indexOf('G4-上-') === 0));
fire('unitSelect', 'change', { value: 'U1' });
assert('切回 U1：候选恢复 8 条', SHT.kpsOf('U1').length === 8 && SHT.curriculum.id === 'U1');

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

console.log('\n' + (failed === 0 ? 'ALL PASS' : failed + ' FAILED'));
process.exit(failed === 0 ? 0 : 1);
