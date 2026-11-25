/*
 * 三角色出题的最小回归：node tools/smoke-test.js
 * 只盯这件事：方案定点 → 执行出题 → 反馈检查，不行就退回重出，最后给出题目列表。
 */
'use strict';

global.window = global;
global.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };

let failed = 0;
function assert(name, ok, extra) {
  if (ok) console.log('PASS ' + name);
  else { console.log('FAIL ' + name + (extra ? '  → ' + extra : '')); failed += 1; }
}

['src/data/books.js', 'src/data/textbook.js', 'src/data/curriculum.js',
 'src/core/llm.js', 'src/core/agents.js', 'src/core/pipeline.js'].forEach(function (f) {
  require('../' + f);
});

async function main() {
  const u = SHT.curriculum;
  console.log('--- 教材与角色 ---');
  assert('教材注册成功，有单元可选', SHT.BOOKS.list().length >= 1 && SHT.BOOKS.current().units.length >= 5);
  assert('当前单元切片带词表和句型',
    SHT.curriculum.words.length > 0 && SHT.curriculum.sentencePatterns.length > 0);
  assert('只剩三个角色：指定方案 / 执行 / 反馈',
    SHT.ROLE_LIST.length === 3 &&
    SHT.ROLE_LIST.map(function (r) { return r.id; }).join(',') === 'plan,generate,verify');
  assert('三个角色各自有独立的提示词',
    SHT.ROLES.plan.system() !== SHT.ROLES.generate.system() &&
    SHT.ROLES.generate.system() !== SHT.ROLES.verify.system());

  console.log('--- 角色边界与提示词硬约束 ---');
  const sysPlan = SHT.ROLES.plan.system();
  const sysGen = SHT.ROLES.generate.system();
  const sysVer = SHT.ROLES.verify.system();
  assert('方案不写题面：提示词里写明不写题干选项',
    /不写题干/.test(sysPlan) && /不写选项/.test(sysPlan));
  assert('方案提示写明题数必须给够', /数量恰好等于用户给的本轮题数/.test(sysPlan));
  assert('执行看不到学情（提示词里没有掌握概率、错题本、学生画像）',
    !/掌握概率|错题本|学生画像/.test(sysGen));
  const verUser = SHT.ROLES.verify.user({
    unit: u, bookName: '测试教材',
    question: { prompt: '选出「教室」的英文。', options: ['classroom'], answer: 'classroom',
      analysis: '', optionNotes: [] }
  });
  assert('反馈看不到出题意图（收到的题目里没有考点、层次、切入角度）',
    !/考点|层次|切入角度|plan/.test(verUser));
  assert('执行要求中文题干与英文答案逐点对等',
    /逐点翻译/.test(sysGen) && /一个字不许添/.test(sysGen));
  assert('反馈会拦「题干多添地点」这类错', /中英对等/.test(sysVer) && /多添/.test(sysVer));
  assert('执行要求每个选项都写说明', /optionNotes 与 options 一一对应/.test(sysGen));

  const planUser = SHT.ROLES.plan.user({ unit: u, bookName: '测试教材', count: 5 });
  assert('方案收到的提示里写明要定 5 个点', /请指定 5 个考点/.test(planUser));
  assert('方案收到的提示里有真实词表和句型',
    planUser.indexOf(u.words[0].en) >= 0 && planUser.indexOf(u.sentencePatterns[0]) >= 0);
  const genUser = SHT.ROLES.generate.user({
    unit: u, bookName: '测试教材', count: 5,
    plan: { kp: 'classroom 的词义', ability: 'vocab', level: '认', angle: '中英匹配' },
    feedback: ['选项 2 的 near 不能加 s']
  });
  assert('执行收到反馈时能读到退回原因', /选项 2 的 near 不能加 s/.test(genUser));

  console.log('--- 方案少给时补满题数 ---');
  const filled = SHT.pipeline.fillPlans(
    [{ kp: 'classroom 的词义', ability: 'vocab', level: '认', angle: '中英匹配' }], 5, u);
  assert('方案只给 1 条也补到 5 条', filled.length === 5, String(filled.length));
  assert('补的考点互不重复',
    new Set(filled.map(function (p) { return p.kp; })).size === filled.length);

  console.log('--- 三角色出题全流程（桩模型） ---');
  const calls = [];
  const originalCall = SHT.llm.call;
  SHT.llm.call = async function (o) {
    calls.push(o);
    if (o.role === 'plan') {
      // 故意只给 2 条，验证代码补到 5 条
      return { ok: true, json: { plans: [
        { kp: 'classroom 的词义', ability: 'vocab', level: '认', angle: '中英匹配' },
        { kp: 'This is our ... 句型', ability: 'sentence', level: '用', angle: '选词填空' }
      ] } };
    }
    if (o.role === 'generate') {
      const q = {
        prompt: '选出「教室」的英文。',
        options: ['classroom', 'playground', 'library'],
        answer: 'classroom',
        analysis: 'classroom 是教室。',
        optionNotes: ['classroom 是教室。', 'playground 是操场。', 'library 是图书馆。']
      };
      if (/反馈角色退回/.test(o.user)) q.analysis = '已按反馈改过：classroom 是教室。';
      return { ok: true, json: q };
    }
    if (o.role === 'verify') {
      // 只有第一次检查退回，其余通过
      const first = calls.filter(function (c) { return c.role === 'verify'; }).length === 1;
      return { ok: true, json: first
        ? { verdict: 'fail', reason: '题干多了答案没有的信息' }
        : { verdict: 'pass' } };
    }
    return { ok: false, error: { message: '未知角色' } };
  };

  const events = [];
  try {
    const r = await SHT.pipeline.runRound({
      unit: u, bookName: '测试教材', count: 5,
      onEvent: function (e) { events.push(e); }
    });
    assert('方案只给 2 条仍出满 5 题', r.questions.length === 5, String(r.questions.length));
    assert('题目编号连续', r.questions.every(function (q, i) { return q.no === i + 1; }));
    assert('每题带考点、题干、选项、答案、解析、逐项说明',
      r.questions.every(function (q) {
        return q.plan && q.prompt && q.options.length === 3 && q.answer &&
          q.analysis && q.optionNotes.length === 3;
      }));
    assert('反馈退回的那题重出了至少两次',
      r.questions[0].reviews.length >= 2, JSON.stringify(r.questions[0].reviews));
    assert('退回原因传给了执行角色',
      calls.some(function (c) {
        return c.role === 'generate' && /题干多了答案没有的信息/.test(c.user);
      }));
    assert('重出后的解析确实改了', /已按反馈改过/.test(r.questions[0].analysis));
    assert('5 题最终都通过反馈', r.questions.every(function (q) { return q.passed === true; }));
    assert('三个角色都被调用过',
      ['plan', 'generate', 'verify'].every(function (role) {
        return calls.some(function (c) { return c.role === role; });
      }));
    assert('流程事件里有三个角色的进度',
      ['plan', 'generate', 'verify'].every(function (role) {
        return events.some(function (e) { return e.role === role; });
      }));
    assert('商讨记录逐条可读', r.dialogue.length >= 7 && r.dialogue[0].role === 'plan',
      String(r.dialogue.length));
  } catch (e) {
    assert('出题流程不抛异常', false, e && e.stack ? e.stack : String(e));
  } finally {
    SHT.llm.call = originalCall;
  }
}

main().then(function () {
  console.log('\n' + (failed ? 'FAILED ' + failed : 'ALL PASS'));
  process.exitCode = failed ? 1 : 0;
}).catch(function (e) {
  console.log('FAIL 测试脚本出错 → ' + (e && e.stack ? e.stack : String(e)));
  process.exitCode = 1;
});
