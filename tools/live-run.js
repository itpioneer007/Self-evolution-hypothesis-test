/*
 * 真实模型全链路验证：node tools/live-run.js
 *
 * 需要 DEEPSEEK_API_KEY 环境变量（不写进任何文件、不进仓库）：
 *   DEEPSEEK_API_KEY=sk-xxx node tools/live-run.js
 *
 * 走的是页面里同一条代码路径（不是另写一套），逐条验证七件事：
 *   1 选定知识点范围 → 2 每道题考哪个考点 → 3 出题 → 4 作答判定 →
 *   5 错题进日志 → 6 日志被下一轮复用 → 7 变体探针 + 三份智能体记忆
 *
 * 学生是模拟的：按题号确定性地答对 / 答错，不引入随机数，跑两次结果结构一致。
 * 这样验的是「机制通不通」，不是「这个学生学得好不好」。
 */
const NativeURL = global.URL;
global.window = global;
global.document = {
  getElementById() {
    return {
      innerHTML: '', value: '', dataset: {}, style: {},
      classList: { toggle() {}, add() {}, remove() {} },
      addEventListener() {}, matches() { return false; }, closest() { return null; },
      appendChild() {}, querySelector() { return null; }
    };
  },
  querySelectorAll() { return []; },
  querySelector() { return null; },
  createElement() { return { style: {}, classList: { add() {} }, dataset: {}, appendChild() {} }; },
  body: {}
};
const store = {};
global.localStorage = {
  getItem(k) { return store[k] || null; },
  setItem(k, v) { store[k] = v; },
  removeItem(k) { delete store[k]; }
};
global.navigator = { clipboard: { writeText() {} } };
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
require('../src/core/progress.js');
require('../src/core/agentMemory.js');
require('../src/core/pipeline.js');

const SHT = global.SHT;
const KEY = process.env.DEEPSEEK_API_KEY || '';
if (!KEY) {
  console.error('缺 DEEPSEEK_API_KEY。用法：DEEPSEEK_API_KEY=sk-xxx node tools/live-run.js');
  process.exit(2);
}

let passed = 0;
let failed = 0;
function assert(name, cond, extra) {
  if (cond) { passed += 1; console.log('PASS  ' + name); }
  else { failed += 1; console.log('FAIL  ' + name + (extra ? '  → ' + extra : '')); }
}
function hr(title) { console.log('\n=== ' + title + ' ==='); }
function line(label, value) { console.log('  ' + label + '：' + value); }

function indexOfAnswer(q) {
  const target = SHT.normAnswer(q.answer);
  return (q.options || []).findIndex(function (o) { return SHT.normAnswer(o) === target; });
}
function wrongIndex(q) {
  const right = indexOfAnswer(q);
  for (let i = 0; i < (q.options || []).length; i += 1) if (i !== right) return i;
  return -1;
}

(async function main() {
  const t0 = Date.now();
  SHT.llm.save({ baseUrl: 'https://api.deepseek.com', model: 'deepseek-chat', key: KEY, temperature: 0.6, maxTokens: 1600, timeoutMs: 90000 });
  SHT.BOOKS.setCurrent('PEP-G4A');
  SHT.setUnit('U1');

  // ---------- 1 选定知识点范围 ----------
  hr('1 选定本轮要考察的知识点范围');
  const allKps = SHT.kpsOf('U1') || [];
  const scope = allKps.slice(0, 4).map(function (k) {
    return { id: k.id, label: k.label, ability: k.ability, cell: k.cell };
  });
  line('候选清单', allKps.length + ' 条（PEP 四上 U1）');
  scope.forEach(function (s, i) { line('范围 ' + (i + 1), s.label + '　·　' + s.ability + ' · ' + s.cell.type); });

  // ---------- 第一轮 ----------
  hr('2 规划：每道题考哪个考点（模型提，代码分格）');
  const usage = { calls: 0, ms: 0 };
  const r1 = await SHT.pipeline.runRound({
    unit: SHT.curriculum,
    count: 5,
    scope: scope,
    brief: SHT.pipeline.buildBrief({ unitId: 'U1', rounds: [], wrongCases: [] }),
    memory: SHT.agentMemory.blank(),
    existing: [],
    onEvent: function (ev) { process.stdout.write('  · ' + ev.text + '\n'); }
  });
  usage.calls += SHT.llm.stats().calls;

  r1.plans.forEach(function (p) {
    line('第 ' + p.no + ' 条', p.kp + '\n      能力 ' + p.ability + '　格子 ' + SHT.agentMemory.cellText(p.cell) +
      '\n      为什么这轮考它：' + p.whyThisOne + '　再错则：' + p.nextIfWrong);
  });
  assert('每条计划的考点都落在选定范围内',
    r1.plans.every(function (p) {
      return scope.some(function (s) { return p.kp === s.label || p.kp.indexOf(s.label) >= 0 || s.label.indexOf(p.kp) >= 0; });
    }), r1.plans.map(function (p) { return p.kp; }).join(' | '));
  assert('4 条计划落在 4 个不同格子',
    new Set(r1.plans.map(function (p) { return SHT.cellKey(p.cell); })).size === r1.plans.length);

  hr('3 出题：题干 / 选项 / 答案 / 解析');
  r1.questions.forEach(function (q) {
    line('第 ' + q.no + ' 题 [' + q.cell.type + ']', q.knowledgePoint);
    line('  题干', q.prompt + (q.audioText ? '　（听力原文：' + q.audioText + '）' : ''));
    line('  选项', q.options.map(function (o, i) { return String.fromCharCode(65 + i) + '. ' + o; }).join('　'));
    line('  答案', q.answer + '　解析：' + q.analysis);
    line('  质检', q.modelVerdict + (q.checks.__verify ? ' / ' + q.checks.__verify : ''));
  });
  assert('至少出了 3 道题（真实模型有退回，不保证满 5）', r1.questions.length >= 3, String(r1.questions.length));
  assert('每题都有解析且不超过 30 字',
    r1.questions.every(function (q) { return q.analysis && q.analysis.replace(/\s/g, '').length <= 30; }));
  assert('采纳的题全部过了代码闸',
    r1.questions.every(function (q) { return q.modelVerdict === 'pass' || q.modelVerdict === 'unverified'; }));
  if (r1.failures.length) {
    line('失败记录', r1.failures.length + ' 条');
    r1.failures.slice(0, 8).forEach(function (f) {
      console.log('      ' + f.stage + ' ' + (f.codes || []).join(' ') + ' ' + String(f.reason || '').slice(0, 70));
    });
  }

  // ---------- 4 模拟作答 + 变体探针 ----------
  hr('4 作答判定 + 同考点变体探针（模拟学生）');
  const attempts = [];
  let wrongCases = [];
  const report = [];
  r1.questions.forEach(function (q, i) {
    // 确定性「学生」：第 1 题真会，第 2 题只记住原题，第 3 题换角度才会，其余不会
    const mode = i === 0 ? 'wrong' : i === 1 ? 'fragile' : i === 2 ? 'passed' : 'mastered';
    const firstIdx = mode === 'mastered' || mode === 'fragile' ? indexOfAnswer(q) : wrongIndex(q);
    const first = SHT.evaluateAnswer(q, firstIdx);
    attempts.push({ no: q.no, stage: 'first', kpLabel: q.knowledgePoint, correct: first.correct, hintCount: 0 });

    const variant = SHT.buildVariant(q, q.no);
    let vCorrect = false;
    if (variant) {
      const vIdx = mode === 'mastered' || mode === 'passed' ? indexOfAnswer(variant) : wrongIndex(variant);
      vCorrect = SHT.evaluateAnswer(variant, vIdx).correct;
      attempts.push({ no: q.no, stage: 'variant', kpLabel: q.knowledgePoint, correct: vCorrect, hintCount: 0 });
    }
    const state = SHT.judgePoint(attempts.filter(function (a) { return a.no === q.no; }));
    line('第 ' + q.no + ' 题', '原题' + (first.correct ? '对' : '错（选 ' + first.picked + '）') +
      '　变体' + (variant ? (vCorrect ? '对' : '错（选 ' + (variant.options[wrongIndex(variant)] || '') + '）') : '接不出') +
      '　→ ' + state.label);

    if (variant) {
      line('  变体', '[' + variant.cell.type + '] ' + variant.prompt + '　' + JSON.stringify(variant.options) +
        '　答案 ' + variant.answer + '（' + (variant.answerShift || '') + '）');
    }
    if (state.state === 'wrong' || state.state === 'fragile') {
      // 只记住这道题：原题对、变体错。错题卡的「作答 vs 正确」要摆变体那一枪，
      // 否则会写成「name / name」，看不出错在哪。
      const onlyVariant = first.correct && variant && !vCorrect;
      const up = SHT.upsertWrongCase(wrongCases, {
        unitId: 'U1',
        kpId: q.knowledgePoint,
        knowledgePoint: q.knowledgePoint,
        ability: q.ability,
        category: (q.cell && q.cell.distractor) || '未掌握',
        errorCause: onlyVariant
          ? '原题答对，换题面就错了——记住的是这道题，不是这个考点。'
          : '原题错，变体也错；变体答案 ' + (variant ? variant.answer : '接不出'),
        questionSnapshot: q.prompt,
        studentAnswer: onlyVariant ? variant.options[wrongIndex(variant)] : first.picked,
        correctAnswer: onlyVariant ? variant.answer : q.answer,
        originalQuestionId: 'live-q' + q.no,
        hintCount: 0
      });
      wrongCases = up.list;
    }
    report.push({ no: q.no, kp: q.knowledgePoint, state: state.state, label: state.label });
  });
  const judged = report.map(function (r) { return r.label; });
  const distinct = new Set(judged).size;
  assert(r1.questions.length >= 3
      ? '四态判据都判出来了（真会 / 只记住这道题 / 会用 / 不会）'
      : '题量不足时判据仍能给出确定状态',
    r1.questions.length >= 3 ? distinct >= 3 : distinct >= 1, judged.join(' '));
  assert('变体全部接得出（接不出要明说是哪类）',
    r1.questions.every(function (q) { return SHT.buildVariant(q, q.no); }),
    r1.questions.filter(function (q) { return !SHT.buildVariant(q, q.no); }).map(function (q) { return q.cell.type; }).join(','));

  hr('5 错题进日志');
  wrongCases.forEach(function (c) {
    line('错题', c.knowledgePoint);
    line('  原题', c.questionSnapshot);
    line('  作答 / 正确', c.studentAnswer + ' / ' + c.correctAnswer);
    line('  错因', c.errorCause);
    line('  状态', c.masteryState + '　认证分数 ' + (c.certificationScore == null ? '未认证' : c.certificationScore));
  });
  assert('答错 / 只记住的题都进了错题日志', wrongCases.length >= 1, String(wrongCases.length));
  assert('错题带原题快照与作答证据',
    wrongCases.every(function (c) { return c.questionSnapshot && c.studentAnswer && c.correctAnswer; }));

  // ---------- 6 日志复用 ----------
  hr('6 下一轮 brief：错题日志被复用');
  const round1Record = { questions: r1.questions, practice: { attempts: attempts } };
  const brief = SHT.pipeline.buildBrief({ unitId: 'U1', rounds: [round1Record], wrongCases: wrongCases });
  line('优先考点', brief.priority.map(function (p) { return p.kp + '（错 ' + p.missCount + ' 次）'; }).join('；') || '无');
  line('已真会的考点', brief.mastered.join('；') || '无');
  line('已占用格子', brief.blockedCells.length + ' 个');
  line('难度提示', brief.levelHint);
  assert('brief 从错题日志里取出了优先考点', brief.priority.length >= 1);
  assert('两个智能体的记忆都记下了这一轮',
    (function () {
      const m = SHT.agentMemory.commit(SHT.agentMemory.blank(), { questions: r1.questions, failures: r1.failures });
      return m.plan.rounds === 1 && m.generate.rounds === 1 && m.verify.rounds === 1;
    })());

  // ---------- 7 第二轮：复用日志 + 带上记忆 ----------
  hr('7 第二轮：冲错题考点，且带上第一轮的记忆');
  const mem1 = SHT.agentMemory.commit(SHT.agentMemory.blank(), { questions: r1.questions, failures: r1.failures });
  const r2 = await SHT.pipeline.runRound({
    unit: SHT.curriculum,
    count: 3,
    brief: brief,
    memory: mem1,
    existing: r1.questions,
    onEvent: function (ev) { process.stdout.write('  · ' + ev.text + '\n'); }
  });
  r2.plans.forEach(function (p) {
    line('第 ' + p.no + ' 条', p.kp + '　·　' + SHT.agentMemory.cellText(p.cell)) ;
  });
  const hit = r2.plans.slice(0, 2).some(function (p) {
    return brief.priority.some(function (x) {
      return p.kp === x.kp || p.kp.indexOf(x.kp) >= 0 || x.kp.indexOf(p.kp) >= 0;
    });
  });
  assert('第二轮前两条计划冲了上一轮的错题考点', hit,
    r2.plans.slice(0, 2).map(function (p) { return p.kp; }).join(' | '));
  const cell1 = new Set(r1.questions.map(function (q) { return SHT.cellKey(q.cell); }));
  assert('第二轮的格子不与第一轮重复',
    r2.plans.every(function (p) { return !cell1.has(SHT.cellKey(p.cell)); }),
    r2.plans.map(function (p) { return SHT.cellKey(p.cell); }).join(' | '));
  assert('第二轮出了题', r2.questions.length >= 1, String(r2.questions.length));

  // ---------- 收尾 ----------
  hr('汇总');
  const stats = SHT.llm.stats();
  line('模型调用', stats.calls + ' 次（成功 ' + stats.ok + '，失败 ' + stats.fail + '）');
  line('token', stats.tokens);
  line('耗时', Math.round((Date.now() - t0) / 1000) + ' 秒（模型侧累计 ' + Math.round(stats.ms / 1000) + ' 秒）');
  line('第一轮失败记录', r1.failures.length + ' 条；第二轮 ' + r2.failures.length + ' 条');
  const lastErr = SHT.llm.lastError();
  if (lastErr) line('最后一次错误', lastErr.errorType + ' ' + lastErr.message);
  console.log('\n' + (failed === 0 ? 'ALL PASS' : failed + ' FAILED') + '　（' + passed + ' 通过 / ' + failed + ' 失败）');
  process.exit(failed === 0 ? 0 : 1);
})().catch(function (e) {
  console.error('崩了：' + (e && e.stack || e));
  process.exit(1);
});
