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

require('../src/data/books.js');
require('../src/data/textbook.js');
require('../src/data/books/hebei-g4a.js');
require('../src/data/books/xiangshao-g4a.js');
require('../src/data/curriculum.js');
require('../src/data/knowledgePoints.js');
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
require('../src/core/progress.js');
require('../src/core/agentMemory.js');
require('../src/core/pipeline.js');
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
// 日志时间是给人看的，必须是本地时间。记录存的是 UTC（ISO 带 Z），
// 直接截字符串会把下午 4 点印成早上 8 点。这条用本地时钟构造输入，与时区无关。
const localIso = new Date(2026, 10, 12, 16, 13).toISOString();
assert('日志时间按本地时区显示，不是 UTC',
  SHT.timeOf(localIso) === '16:13', SHT.timeOf(localIso));
assert('四个角色卡片 = 4', count('agentRail', 'data-role="') === 4, count('agentRail', 'data-role="'));
assert('默认显示课程角色的 5 行配额', count('agentPanel', 'class="plan-row') === 5, count('agentPanel', 'class="plan-row'));
assert('错题卡 3 张，每题带 6 行出题要点', count('wrongList', 'class="wrong-card') === 3 && count('wrongList', 'class="brief-row"') === 18,
  count('wrongList', 'class="wrong-card') + ' / ' + count('wrongList', 'class="brief-row"'));
assert('五个 KPI', count('metrics', 'class="kpi"') === 5, count('metrics', 'class="kpi"'));
assert('出题日志有记录', count('logFeed', 'class="log-item') >= 5, count('logFeed', 'class="log-item'));
assert('打回缘由有渲染结果', nodes.rejectChart.innerHTML.length > 0);
// 检查标准的明细不该出现在课程角色的面板里，那是日志页的活
assert('01 页不再放检查明细', count('agentPanel', 'class="fail-row') === 0, count('agentPanel', 'class="fail-row'));
assert('出题日志每行带时间', count('logFeed', 'class="log-at"') >= 5, count('logFeed', 'class="log-at"'));
assert('已出过的角度显示题型+层次，不是指纹短码',
  count('usedCells', 'class="used-cell"') === 5 && /class="used-cell"[^>]*>[^<]*·/.test(nodes.usedCells.innerHTML),
  nodes.usedCells.innerHTML.slice(0, 120));
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
assert('答错当场就说要写进错题，不再塞一道同轮变体',
  nodes.practiceCard.innerHTML.indexOf('写进错题，换下一个考点') >= 0 &&
  nodes.practiceCard.innerHTML.indexOf('换一道同考点的变体再考') < 0);
const wrongBefore = count('wrongList', 'class="wrong-card');
click('practiceCard', { action: 'next-step' });
assert('答错后直接进 03 错题本（不在本轮回练）',
  count('wrongList', 'class="wrong-card') === wrongBefore + 1,
  wrongBefore + ' → ' + count('wrongList', 'class="wrong-card'));
assert('写进去的错题带知识点与作答', nodes.wrongList.innerHTML.indexOf('classroom') >= 0 && nodes.wrongList.innerHTML.indexOf('窗户') >= 0);
assert('作答记录进了日志信息流（答对/答错各有颜色）',
  (nodes.logFeed.innerHTML.match(/答对|答错/g) || []).length >= 1,
  String((nodes.logFeed.innerHTML.match(/答对|答错/g) || []).length));

console.log('--- 02 开放题：输入框 → 四段判定 → 冻结 ---');
// 走真实事件路径把当前题改成开放题，不直接改内部状态——
// 这样测的是「人点下拉框」这条路，而不是绕过界面。
function pickTab(tab) {
  fire('tabbar', 'click', {
    closest(sel) { return sel === 'button[data-tab]' ? { dataset: { tab: tab } } : null; }
  });
}
click('practiceCard', { action: 'restart-practice' });
pickTab('agents');
fire('agentRail', 'click', {
  closest(sel) { return sel === 'button[data-role]' ? { dataset: { role: 'execute' } } : null; }
});
assert('01 生成角色有「作答方式」这一项',
  nodes.agentPanel.innerHTML.indexOf('data-field="answerMode"') >= 0);
fire('agentPanel', 'change', { dataset: { field: 'answerMode' }, value: 'open' });
pickTab('practice');

const openQNow = SHT.sampleQuestions[0];
assert('开放题给输入框，不给选项按钮',
  count('practiceCard', 'class="open-input') === 1 && count('practiceCard', 'class="opt-btn') === 0,
  count('practiceCard', 'class="open-input') + ' / ' + count('practiceCard', 'class="opt-btn'));
assert('开放题不显示「划掉一个错的」（没有选项可划）',
  nodes.practiceCard.innerHTML.indexOf('划掉一个错的') < 0);

// 写对：本地第 1 段就判完，不调模型
fire('practiceCard', 'input', { dataset: { role: 'open-input' }, value: openQNow.answer });
click('practiceCard', { action: 'submit-answer' });
assert('写对直接判对，判定来源写「与标准答案一致」',
  count('practiceCard', 'class="verdict is-good"') === 1 &&
  nodes.practiceCard.innerHTML.indexOf('与标准答案一致') >= 0,
  nodes.practiceCard.innerHTML.slice(0, 200));
assert('判完把学生写的内容原样显示出来',
  nodes.practiceCard.innerHTML.indexOf(openQNow.answer) >= 0);
// 规则判的（与答案一致）不说「冻结」——它本来就不可能变，
// 说了是废话。只有模型判的才需要在界面上讲清「这条不会再判一次」。
assert('规则判的判定条不啰嗦「冻结」', nodes.practiceCard.innerHTML.indexOf('不再重判') < 0);

// 写成一个别的意思：本地判不了，要先问模型。此时界面必须给出「判定中」，
// 不能让人以为点了没反应（这是上一轮连通性测试踩过的坑）。
click('practiceCard', { action: 'restart-practice' });
fire('practiceCard', 'input', { dataset: { role: 'open-input' }, value: 'This is a completely different sentence.' });
click('practiceCard', { action: 'submit-answer' });
assert('开放题判不了时进入「判定中」，按钮同时禁用',
  nodes.practiceCard.innerHTML.indexOf('判定中…') >= 0 &&
  nodes.practiceCard.innerHTML.indexOf('data-action="submit-answer" disabled') >= 0,
  nodes.practiceCard.innerHTML.slice(-260));

// 收尾：把这道题改回选择题、角色切回课程角色。
// 上面为了测开放题改过作答方式和当前角色，不收尾的话后面的用例会读到半路状态。
pickTab('agents');
fire('agentRail', 'click', {
  closest(sel) { return sel === 'button[data-role]' ? { dataset: { role: 'execute' } } : null; }
});
fire('agentPanel', 'change', { dataset: { field: 'answerMode' }, value: 'choice' });
fire('agentRail', 'click', {
  closest(sel) { return sel === 'button[data-role]' ? { dataset: { role: 'course' } } : null; }
});
pickTab('practice');

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
assert('生成角色渲染单题表单', count('agentPanel', 'class="field-grid"') === 1 && count('agentPanel', 'data-field="prompt"') === 1);
assert('生成角色知识点为只读展示（无候选下拉）', count('agentPanel', 'data-kp-pick') === 0 && count('agentPanel', 'cell-badge') >= 2);
fire('agentRail', 'click', { closest: () => ({ dataset: { role: 'verify' } }) });
assert('验证角色渲染层切换', count('agentPanel', 'class="layer-switch"') === 1 && count('agentPanel', 'data-action="layer"') === SHT.CHECK_LAYERS.length);
fire('agentPanel', 'click', {
  closest(sel) { return sel === '[data-action]' ? { dataset: { action: 'check', check: SHT.ALL_CHECKS[0].id, verdict: 'pass' } } : null; },
  matches() { return false; }
});
assert('勾选一条检查后面板重渲染且摘要仍在', count('agentPanel', 'stat-pill') === 3, count('agentPanel', 'stat-pill'));
assert('验证页标出模型只能判 15 条，不让人以为漏判',
  nodes.agentPanel.innerHTML.indexOf('模型只能判 ' + SHT.JUDGEABLE_CHECKS.length + ' 条') >= 0);
assert('判不了的条款在页面上写明原因',
  nodes.agentPanel.innerHTML.indexOf('check-need') >= 0 && nodes.agentPanel.innerHTML.indexOf('不归验证判') >= 0);

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
// 跨轮真会：一轮一次机会，错过的考点要连对两次才升「已掌握」
const once = SHT.appendVariantAttempt(base, { correct: true, hintCount: 0, retryCount: 0 });
assert('回练第一次答对只到「已订正」，还不算真会', once.masteryState === 'corrected', once.masteryState);
const twiceRight = SHT.appendVariantAttempt(once, { correct: true, hintCount: 0, retryCount: 0 });
assert('第二轮再答对才升「已掌握」', twiceRight.masteryState === 'mastered', twiceRight.masteryState);
const broken = SHT.appendVariantAttempt(once, { correct: false, hintCount: 0, retryCount: 0 });
assert('中间又错一次就把连对数清零', broken.consecutiveClean === 0 && broken.masteryState !== 'corrected', broken.masteryState + '/' + broken.consecutiveClean);
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

console.log('--- 判对错与变体（纯函数） ---');
assert('答案比对忽略大小写与句点', SHT.normAnswer(' Thank you. ') === 'thank you');
assert('答对判 true / 答错判 false',
  SHT.evaluateAnswer(q, 0).correct === true && SHT.evaluateAnswer(q, 1).correct === false);
assert('没选答案直接拒答', SHT.evaluateAnswer(q, null).ok === false);
assert('缺答案的题不能作答', SHT.evaluateAnswer({ options: ['a', 'b'], answer: '' }, 0).ok === false);

console.log('--- 判分链路（本地 → 可接受答案 → 冻结） ---');
// 开放题：答案是一句话，选项为空。这类题字符串比不完，才需要模型兜底。
const openQ = {
  qid: 'test-open-1', no: 1,
  prompt: '用英语说：他很高。',
  answer: 'He is tall.',
  acceptable: ["He's tall."],
  cell: { type: '对话补全', level: '用' }
};
assert('没有选项的题按开放题作答', SHT.grade.mode(openQ) === 'open');
assert('有选项的题按选择题作答', SHT.grade.mode(q) === 'choice');
assert('第 1 段：归一化相同直接判对（大小写、句号不敏感）',
  SHT.grade.local(openQ, 'he is tall').correct === true &&
  SHT.grade.local(openQ, 'he is tall').via === 'exact');
assert('第 2 段：可接受写法命中，不用问模型',
  SHT.grade.local(openQ, 'He’s tall.').decided === true &&
  SHT.grade.local(openQ, 'He’s tall.').correct === true &&
  SHT.grade.local(openQ, 'He’s tall.').via === 'acceptable',
  JSON.stringify(SHT.grade.local(openQ, 'He’s tall.')));
assert('第 3 段：开放题换了意思就交给模型，不硬判',
  SHT.grade.local(openQ, 'He is very tall.').decided === false);
assert('选择题选了别的项是死判断，不问模型',
  SHT.grade.local(q, q.options[1]).decided === true &&
  SHT.grade.local(q, q.options[1]).correct === false);
assert('答案里的并列写法拆成多个可接受答案',
  SHT.grade.splitAcceptable("He is tall. / He's tall.").length === 2 &&
  SHT.grade.acceptable({ answer: 'A；B' }).length === 2);
assert('a.m. 这种带点的缩写不会被斜杠拆坏',
  SHT.grade.splitAcceptable('at 9 a.m./p.m.').length === 1);

// 台账：一次判定落库后就不再改口。这条是整个判分链的地基。
const ans1 = "He's quite tall indeed.";
let led = SHT.grade.remember({}, openQ, ans1, { correct: true, via: 'model', reason: '同义表达' }, 1);
const k1 = SHT.grade.ledgerKey(openQ, 1, ans1);
assert('模型判定落库，键是题目 + 归一化答案', !!led[k1] && led[k1].correct === true, k1);
assert('同一个答案大小写不同也算同一条记录',
  SHT.grade.ledgerKey(openQ, 1, ans1.toUpperCase()) === k1);
const reled = SHT.grade.remember(led, openQ, ans1, { correct: false, via: 'model' }, 1);
assert('已有记录不被第二次判定覆盖（冻结）', reled === led && reled[k1].correct === true);
assert('读台账拿到的是冻结结论，不是重算',
  SHT.grade.read(led, openQ, ans1, 1).correct === true);
const over = SHT.grade.override(led, openQ, ans1, false, '人工改判：他写的不是这个意思', 1);
assert('人工可以改判，改的是同一条记录',
  over[k1].correct === false && over[k1].via === 'human');
assert('改判保留原来的模型判定，以后查得到',
  over[k1].modelFirst && over[k1].modelFirst.correct === true);
assert('台账只把模型判过 / 人工改过的条目列出来',
  SHT.grade.modelEntries(over).length === 1);
assert('台账有上限，不会无限长', SHT.grade.LEDGER_LIMIT > 0 && SHT.grade.LEDGER_LIMIT <= 2000);
assert('空答案不判，免得把没作答记成答错', SHT.grade.local(openQ, '   ').decided === false);

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

// 铁律 2：答案必须换。五道题逐题查，不能只看第一道
assert('五道变体的答案全部与原题不同（防答案惯性）',
  variants.every((v, i) => SHT.normAnswer(v.answer) !== SHT.normAnswer(SHT.sampleQuestions[i].answer)),
  variants.map((v, i) => v.answer + '≠' + SHT.sampleQuestions[i].answer).join(','));

// 铁律 3：原答案留在选项里当诱饵 —— 但只在它在新题里也说得通的时候。
// 语境差太远的题（上一题拼写 blackboard、下一题介词 near），塞进去就是一眼能排除的废选项，
// 学生排掉它反而更省事，难度不升反降。
assert('诱饵要么留在选项里，要么明确写了不放的理由',
  variants.every((v, i) => {
    const has = v.options.some(o => SHT.normAnswer(o) === SHT.normAnswer(SHT.sampleQuestions[i].answer));
    return has || /^dropped: /.test(String(v.__bait || ''));
  }),
  variants.map(v => (v.__bait || '(无标记)') + JSON.stringify(v.options)).join(' | '));

assert('变体选项不是原题选项的重排',
  variants.every((v, i) => v.options.map(SHT.normAnswer).sort().join('|') !==
    SHT.sampleQuestions[i].options.map(SHT.normAnswer).sort().join('|')));

assert('变体题干里不出现答案原词（拼写题不许把答案写在题干上）',
  variants.every(v => {
    if (!/^[a-z]+$/i.test(String(v.answer))) return true;
    return !new RegExp('(^|[^a-z])' + v.answer + '([^a-z]|$)', 'i').test(String(v.prompt));
  }),
  variants.map(v => v.prompt).join(' / '));

// 辨音：原答案所在词对必须整组排除，否则换 seed 就撞回同一个答案
const cakeQ = {
  no: 3, cell: { type: '字母组合辨音', scene: '学校', level: '辨', distractor: '音近' }, prompt: '听录音，选出你听到的单词。',
  options: ['cake', 'cat', 'hat'], answer: 'cake', audioText: 'cake'
};
const cakeVars = [1, 2, 3, 4, 5, 6, 7, 8].map(n => SHT.buildVariant(cakeQ, n)).filter(Boolean);
assert('辨音变体不会撞回原答案（原答案所在词对整组排除）',
  cakeVars.length > 0 && cakeVars.every(v => SHT.normAnswer(v.answer) !== 'cake'),
  cakeVars.map(v => v.answer).join(','));

// 答案没换的假变体由 auditVariant() 在出口拦掉，因此 buildVariant 的返回值
// 必须永远满足「答案与原题不同」—— 这一条由上面「五道变体答案全部不同」与
// 「六单元扫描」两处覆盖，不再单独构造不可能的负例。

// 六个单元 × 七种可派生题型：凡接得出的，答案都得换、诱饵都得在
let variantTried = 0;
let variantBad = [];
SHT_BOOK.units.forEach(function (u) {
  SHT.setUnit(u.id);
  ['听音选义', '中英匹配', '拼写补全', '字母组合辨音', '选词填空', '句子判断', '对话补全'].forEach(function (t) {
    // 基底题要造得像真题：题干用中文、选项取词表词、听力题带原文，
    // 否则它自己就过不了闸，变体自然全接不出，这一条会退化成空断言
    const ws = SHT.curriculum.words;
    const listening = ['听音选义', '字母组合辨音', '听写'].indexOf(t) >= 0;
    const spelling = t === '拼写补全' || t === '听写';
    const swap = function (w, k) {
      const a = w.split(''); const i = 1 + (k % Math.max(1, a.length - 2));
      const tmp = a[i]; a[i] = a[i + 1]; a[i + 1] = tmp; return a.join('');
    };
    const base = {
      no: 2, cell: { type: t, scene: '学校', level: '辨', distractor: '形近' },
      prompt: '选出「' + ws[0].zh + '」对应的英文。',
      options: spelling ? [ws[0].en, swap(ws[0].en, 1), swap(ws[0].en, 2)] : [ws[0].en, ws[1].en, ws[2].en],
      answer: ws[0].en,
      audioText: listening ? ws[0].en : ''
    };
    const v = SHT.buildVariant(base, 2);
    if (!v) return;
    variantTried += 1;
    const ansChanged = SHT.normAnswer(v.answer) !== SHT.normAnswer(base.answer);
    const baitIn = v.options.some(function (o) { return SHT.normAnswer(o) === SHT.normAnswer(base.answer); });
    const explained = /^dropped: /.test(String(v.__bait || ''));
    if (!ansChanged || (!baitIn && !explained)) variantBad.push(u.id + '/' + t);
  });
});
SHT.setUnit('U1');
assert('六单元所有接得出的变体都换了答案，诱饵放不下时有理由',
  variantTried > 0 && variantBad.length === 0,
  variantTried + ' 例，异常：' + (variantBad.join(',') || '无'));

// 诱饵判定本身：上一题的答案在新题里说不通时，一个都不许放
const BU = SHT.curriculum;
assert('上一题答案是数字，不当诱饵（放进英语题里一眼能排除）',
  SHT.baitJudge({ answer: '2' }, { answer: 'Thank you.' }, BU).ok === false,
  JSON.stringify(SHT.baitJudge({ answer: '2' }, { answer: 'Thank you.' }, BU)));
assert('中英语言对不上，不当诱饵',
  SHT.baitJudge({ answer: '风扇' }, { answer: 'near' }, BU).ok === false,
  JSON.stringify(SHT.baitJudge({ answer: '风扇' }, { answer: 'near' }, BU)));
assert('字数差一个量级，不当诱饵',
  SHT.baitJudge({ answer: 'blackboard' }, { answer: 'news' }, BU).ok === false,
  JSON.stringify(SHT.baitJudge({ answer: 'blackboard' }, { answer: 'news' }, BU)));
assert('上一题答案不是本单元学过的词，不当诱饵',
  SHT.baitJudge({ answer: 'chrysanthemum' }, { answer: 'near' }, BU).ok === false,
  JSON.stringify(SHT.baitJudge({ answer: 'chrysanthemum' }, { answer: 'near' }, BU)));
assert('同语言、学过的词、长度相近时才留作诱饵',
  SHT.baitJudge({ answer: '教室' }, { answer: '墙' }, BU).ok === true,
  JSON.stringify(SHT.baitJudge({ answer: '教室' }, { answer: '墙' }, BU)));

assert('看图说词接不出变体就走错题（口语要语音证据，不硬编）',
  SHT.buildVariant({ no: 1, cell: { type: '看图说词' }, prompt: 'x', options: ['a', 'b', 'c'], answer: 'a' }, 1) === null);

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
assert('切书后候选知识点为空（PEP 的 33 条不外借）', SHT.kpsOf(SHT.curriculum.id).length === 0);
assert('超纲判定用冀教的边界：shirt 过、blackboard 拦',
  SHT.validateQuestion({ knowledgePoint: 'x', cell: { type: '中英匹配', scene: '身体与衣物', level: '认', distractor: '同类不同物' },
    prompt: '选出「衬衫」的英文。', audioText: '', options: ['shirt', 'skirt', 'coat'], answer: 'shirt', analysis: 'shirt 是衬衫。' },
    SHT.curriculum, {}).pass === true &&
  SHT.validateQuestion({ knowledgePoint: 'x', cell: { type: '中英匹配', scene: '身体与衣物', level: '认', distractor: '同类不同物' },
    prompt: '选出「衬衫」的英文。', audioText: '', options: ['shirt', 'skirt', 'blackboard'], answer: 'shirt', analysis: 'shirt 是衬衫。' },
    SHT.curriculum, {}).pass === false);

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
    // 配额 2 条，规划给了 4 条：后两条当替补，第一格三次都出不成时由替补顶上
    let n = 0;
    const four = { ok: true, tokens: 10, ms: 1, json: { plans: [
      { kp: 'vocab · A · 甲', ability: 'vocab', level: '认' },
      { kp: 'vocab · B · 乙', ability: 'vocab', level: '认' },
      { kp: 'vocab · C · 丙', ability: 'vocab', level: '认' },
      { kp: 'vocab · D · 丁', ability: 'vocab', level: '认' }
    ] } };
    const bad = () => ({ ok: true, json: qJson({ options: ['shirt', 'shirt', 'coat'] }), tokens: 10, ms: 1 });
    const ok = () => ({ ok: true, json: qJson(), tokens: 10, ms: 1 });
    const pass = () => ({ ok: true, json: { verdict: 'pass' }, tokens: 10, ms: 1 });
    const script = [() => four, bad, bad, bad, ok, pass, ok, pass];
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
    });
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
  assert('答对也诊断：秒答会被标成「记住了」而不是「会了」',
    dRight.correct && dRight.causeId === '秒答', dRight.causeId);

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

  console.log('\n' + (failed === 0 ? 'ALL PASS' : failed + ' FAILED'));
  process.exit(failed === 0 ? 0 : 1);
})();
