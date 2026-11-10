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
require('../src/core/agents.js');
require('../src/core/validate.js');
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
assert('变体题上屏且标注同考点换答案', nodes.practiceCard.innerHTML.indexOf('变体 · 同考点换答案') >= 0);

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

// 铁律 2：答案必须换。五道题逐题查，不能只看第一道
assert('五道变体的答案全部与原题不同（防答案惯性）',
  variants.every((v, i) => SHT.normAnswer(v.answer) !== SHT.normAnswer(SHT.sampleQuestions[i].answer)),
  variants.map((v, i) => v.answer + '≠' + SHT.sampleQuestions[i].answer).join(','));

// 铁律 3：原答案留在选项里当诱饵，盲选上一次答案的学生才会被打中
assert('原题答案全部留在变体选项里当诱饵',
  variants.every((v, i) => v.options.some(o =>
    SHT.normAnswer(o) === SHT.normAnswer(SHT.sampleQuestions[i].answer))),
  variants.map(v => JSON.stringify(v.options)).join(' '));

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
    if (!ansChanged || !baitIn) variantBad.push(u.id + '/' + t);
  });
});
SHT.setUnit('U1');
assert('六单元所有接得出的变体都换了答案且留着诱饵',
  variantTried > 0 && variantBad.length === 0,
  variantTried + ' 例，异常：' + (variantBad.join(',') || '无'));

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
assert('两枪都对的考点不会再被优先出', brief.priority.every(p => p.kp !== '真会考点'));
assert('brief 是结构化字段，不是一段话', typeof brief.levelHint === 'string' && Array.isArray(brief.blockedCells));

/* ================= 三个智能体各自的记忆 ================= */
console.log('--- 智能体记忆 ---');
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
  assert('规划提示词里带着选定范围', SHT.AGENTS.plan.user({
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

  SHT.llm.call = REAL_CALL;

  console.log('\n' + (failed === 0 ? 'ALL PASS' : failed + ' FAILED'));
  process.exit(failed === 0 ? 0 : 1);
})();
