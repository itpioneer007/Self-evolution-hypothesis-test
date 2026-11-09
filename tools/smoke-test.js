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

require('../src/data/curriculum.js');
require('../src/data/knowledgePoints.js');
require('../src/data/wrongCases.js');
require('../src/core/enums.js');
require('../src/core/fingerprint.js');
require('../src/core/checklist.js');
require('../src/core/wrongBook.js');
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
assert('四个 KPI', count('metrics', 'class="kpi"') === 4, count('metrics', 'class="kpi"'));
assert('出题日志有记录', count('logFeed', 'class="log-item"') >= 5, count('logFeed', 'class="log-item"'));
assert('打回缘由有渲染结果', nodes.rejectChart.innerHTML.length > 0);
assert('已占用角度 5 个短码', count('usedCells', 'class="used-cell"') === 5, count('usedCells', 'class="used-cell"'));
assert('停止决策两个信号', count('stopPanel', 'data-stop="') === 2, count('stopPanel', 'data-stop="'));
assert('新增错题表单已渲染', count('addWrongForm', 'data-new="') === 8, count('addWrongForm', 'data-new="'));

console.log('--- 候选知识点（输入层） ---');
const KPS = SHT.KNOWLEDGE_POINTS;
const typeIds = SHT.QUESTION_TYPES.map(t => t.id);
const causeIds = SHT.ERROR_CAUSES.map(c => c.id);
assert('候选知识点 12 条 / 分 3 组', KPS.length === 12 && SHT.KP_GROUPS.length === 3, KPS.length);
assert('12 个出题角度互不重复', new Set(KPS.map(k => SHT.cellFingerprint(k.cell))).size === 12);
assert('格子四维全部落在枚举内', KPS.every(k => typeIds.includes(k.cell.type) && SHT.SCENES.includes(k.cell.scene) && SHT.LEVELS.includes(k.cell.level) && SHT.DISTRACTORS.includes(k.cell.distractor)));
assert('情境全部锁在 U1 话题域', KPS.every(k => k.cell.scene === SHT.curriculum.topicDomain));
assert('每条都有错因 / 教材依据 / 示例问法 / 下一轮建议', KPS.every(k => causeIds.includes(k.cause) && k.source && k.example && k.nextIfWrong && k.why));
assert('计划面板有候选折叠区且默认收起', count('agentPanel', 'class="kp-fold"') === 1 && count('agentPanel', 'data-action="pick-kp"') === 12);

console.log('--- tab / 角色切换 ---');
fire('tabbar', 'click', { closest: () => ({ dataset: { tab: 'wrongbook' } }) });
assert('切到错题记录 tab 不抛错', true);
fire('tabbar', 'click', { closest: () => ({ dataset: { tab: 'agents' } }) });
fire('agentPanel', 'click', {
  closest(sel) { return sel === '[data-action]' ? { dataset: { action: 'pick-kp', id: 'kp-01' } } : null; },
  matches() { return false; }
});
assert('点「用这个」把候选写进第 1 题', nodes.agentPanel.innerHTML.indexOf('value="vocab · 校园场所名词 · class / classroom 形近"') >= 0);
fire('agentRail', 'click', { closest: () => ({ dataset: { role: 'execute' } }) });
assert('执行智能体渲染单题表单', count('agentPanel', 'class="field-grid"') === 1 && count('agentPanel', 'data-field="prompt"') === 1);
assert('单题卡有候选下拉且列出 12 条', count('agentPanel', 'data-kp-pick') === 1 && count('agentPanel', '<option value="kp-') === 12);
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
assert('错题「写入计划」把知识点带回 01', count('agentPanel', 'value="vocab · 校园场所名词 · class / classroom 形近"') >= 1);

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
