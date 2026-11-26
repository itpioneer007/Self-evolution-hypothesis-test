/*
 * 三角色出题的最小回归：node tools/smoke-test.js
 * 只盯这件事：方案定点 → 执行出题 → 反馈打分，不合格就换下一轮，每轮都留完整题目。
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
    plan: { kp: 'classroom 的词义', ability: 'vocab', level: '认', angle: '中英匹配' },
    question: { prompt: '选出「教室」的英文。', options: ['classroom'], answer: 'classroom',
      analysis: '', optionNotes: [] }
  });
  assert('反馈能看到学生画像、出题方案、执行题目三项输入',
    /学生画像/.test(verUser) && /出题方案/.test(verUser) && /执行题目/.test(verUser));
  assert('反馈拿到的方案里有考点、层次、切入角度',
    /classroom 的词义/.test(verUser) && /中英匹配/.test(verUser));
  const dims = (sysVer.match(/（(\d+)分）/g) || []).map(function (x) { return Number(x.replace(/\D/g, '')); });
  assert('十个维度满分合计 100 分', dims.length === 10 && dims.reduce(function (a, b) { return a + b; }, 0) === 100,
    dims.join('+'));
  assert('85 分及格线、低于 85 判 false 写进提示词',
    /及格线85分/.test(sysVer) && /低于85分时 passed 必须为 false/.test(sysVer));
  assert('严重跑偏的严厉警告写进提示词',
    /请策划重新审视方案，是不是你的方案描述不够具体/.test(sysVer));
  assert('答案不唯一、中英不对等会压到 85 分以下',
    /答案不唯一、中英不对等/.test(sysVer));
  assert('输出模板里的 JSON 结构合法（scores_detail 后有逗号）',
    /\},\n"feedback_to_thinker"/.test(sysVer));
  assert('执行要求中文题干与英文答案逐点对等',
    /逐点翻译/.test(sysGen) && /一个字不许添/.test(sysGen));
  assert('反馈会拦「题干多添地点」这类错',
    /中英对等/.test(sysVer) && /我们学校/.test(sysVer) && /in our school/.test(sysVer));
  assert('执行要求每个选项都写说明', /optionNotes 与 options 一一对应/.test(sysGen));
  assert('反馈提示词含查重与新意检查、只换名词判高度重复扣20分',
    /查重与新意检查/.test(sysVer) && /高度重复/.test(sysVer) &&
    /额外扣 20 分/.test(sysVer) && /必须改变句式结构或情境/.test(sysVer));
  const q0 = { prompt: 'The monkey eats a banana.', options: ['monkey', 'lion'], answer: 'monkey' };
  const q1 = { prompt: 'The elephant eats a banana.', options: ['elephant', 'lion'], answer: 'elephant' };
  const qSame = { prompt: 'the monkey eats a banana', options: ['lion', 'monkey'], answer: 'monkey' };
  assert('查重指纹：只换主语不算完全重复（交给反馈角色扣分）',
    SHT.pipeline.isRepeat(q0, [q1]) === false);
  assert('查重指纹：一模一样的题（忽略标点大小写选项序）判重复',
    SHT.pipeline.isRepeat(q0, [qSame]) === true);
  const verSeen = SHT.ROLES.verify.user({
    unit: u, bookName: '测试教材', plan: {}, question: q1,
    seen: ['题干：The monkey eats a banana.；选项：monkey / lion；答案：monkey']
  });
  assert('反馈输入里带上已出过的题目列表',
    /已出过的题目列表/.test(verSeen) && /The monkey eats a banana/.test(verSeen));

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

  console.log('--- 多轮出题：每轮都留完整题目快照 ---');
  const calls = [];
  const originalCall = SHT.llm.call;
  let verifyCount = 0;
  SHT.llm.call = async function (o) {
    calls.push(o);
    if (o.role === 'plan') {
      // 第二轮收到第一轮的反馈，返回修订过的方案
      if (/反馈角色对上一条方案的建议/.test(o.user)) {
        return { ok: true, json: { plans: Array.from({ length: 5 }, function (_, i) {
          return { kp: '第2轮考点' + (i + 1), ability: 'vocab', level: '认', angle: '中英匹配' };
        }) } };
      }
      return { ok: true, json: { plans: [
        { kp: 'classroom 的词义', ability: 'vocab', level: '认', angle: '中英匹配' },
        { kp: 'This is our ... 句型', ability: 'sentence', level: '用', angle: '选词填空' }
      ] } };
    }
    if (o.role === 'generate') {
      const second = /第2轮考点/.test(o.user);
      return { ok: true, json: {
        prompt: second ? '第二轮：选出「教室」的英文。' : '第一轮：选出「教室」的英文。',
        options: ['classroom', 'playground', 'library'],
        answer: 'classroom',
        analysis: second ? '修订后：classroom 是教室。' : 'classroom 是教室。',
        optionNotes: ['classroom 是教室。', 'playground 是操场。', 'library 是图书馆。']
      } };
    }
    if (o.role === 'verify') {
      verifyCount += 1;
      const firstRound = verifyCount <= 5;
      return { ok: true, json: firstRound
        ? { passed: false, total_score: 72,
            feedback_to_thinker: '方案的情境描述不够具体，请写清目标词与场景',
            scores_detail: { interest_context: { score: 3, reason: '情境偏干' } } }
        : { passed: true, total_score: 92, feedback_to_thinker: '', scores_detail: {} } };
    }
    return { ok: false, error: { message: '未知角色' } };
  };

  const events = [];
  try {
    const r = await SHT.pipeline.runRound({
      unit: u, bookName: '测试教材', count: 5,
      onEvent: function (e) { events.push(e); }
    });
    assert('产出两轮，第一轮不通过、第二轮通过',
      r.rounds.length === 2 && r.rounds[0].passed === false && r.rounds[1].passed === true,
      r.rounds.map(function (x) { return x.no + ':' + x.score + ':' + x.passed; }).join(' / '));
    assert('每轮都出满 5 题', r.rounds.every(function (x) { return x.questions.length === 5; }));
    assert('轮次编号连续', r.rounds.every(function (x, i) { return x.no === i + 1; }));
    assert('每轮题目都是完整快照（题干/选项/答案/解析/选项说明都在）',
      r.rounds.every(function (x) {
        return x.questions.every(function (q) {
          return q.plan && q.prompt && q.options.length === 3 && q.answer &&
            q.analysis && q.optionNotes.length === 3;
        });
      }));
    assert('两轮题目内容确实不同（不是同一套留两份）',
      r.rounds[0].questions[0].prompt !== r.rounds[1].questions[0].prompt &&
      r.rounds[0].questions[0].analysis !== r.rounds[1].questions[0].analysis);
    assert('每轮都有总分，第一轮的分数低于第二轮',
      r.rounds[0].score === 72 && r.rounds[1].score === 92);
    assert('第一轮的不通过原因留在这轮上',
      /情境描述不够具体/.test(r.rounds[0].questions[0].feedback));
    assert('第一轮的反馈给了第二轮的方案',
      calls.some(function (c) {
        return c.role === 'plan' && /情境描述不够具体/.test(c.user);
      }));
    assert('第二轮方案换了，题目也跟着换',
      calls.some(function (c) { return c.role === 'generate' && /第2轮考点/.test(c.user); }));
    assert('第二轮三个角色都能看到第一轮出过的题目（查重有输入）',
      ['plan', 'generate', 'verify'].every(function (role) {
        return calls.some(function (c) {
          return c.role === role && Array.isArray(c.seen) && c.seen.length > 0 &&
            /第一轮/.test(c.seen.join(' '));
        });
      }));
    assert('评分明细留在题目快照里',
      r.rounds[0].questions[0].scoresDetail &&
      r.rounds[0].questions[0].scoresDetail.interest_context.score === 3);
    assert('三个角色都被调用过',
      ['plan', 'generate', 'verify'].every(function (role) {
        return calls.some(function (c) { return c.role === role; });
      }));
    assert('有整轮完成的事件，前端据此显示进度',
      events.some(function (e) { return e.role === 'round' && e.roundData && e.roundData.no === 1; }));
    assert('最多 4 轮写死，不会无限出下去', SHT.pipeline.MAX_ROUNDS === 4);
  } catch (e) {
    assert('出题流程不抛异常', false, e && e.stack ? e.stack : String(e));
  } finally {
    SHT.llm.call = originalCall;
  }

  console.log('--- 查重兜底：模型误放行相同题也要挡住 ---');
  const dupOriginal = SHT.llm.call;
  let dupVerify = 0;
  SHT.llm.call = async function (o) {
    if (o.role === 'plan') {
      return { ok: true, json: { plans: [{ kp: 'classroom 的词义', ability: 'vocab', level: '认', angle: '中英匹配' }] } };
    }
    if (o.role === 'generate') {
      // 每轮都出同一道题，故意制造重复
      return { ok: true, json: {
        prompt: '选出「教室」的英文。', options: ['classroom', 'playground', 'library'],
        answer: 'classroom', analysis: 'classroom 是教室。',
        optionNotes: ['classroom 是教室。', 'playground 是操场。', 'library 是图书馆。']
      } };
    }
    if (o.role === 'verify') {
      dupVerify += 1;
      // 第一轮故意不通过以进入第二轮；第二轮模型误判为通过
      const pass = dupVerify > 1;
      return { ok: true, json: { passed: pass, total_score: pass ? 95 : 70,
        feedback_to_thinker: pass ? '' : '再想想', scores_detail: {} } };
    }
    return { ok: false, error: { message: '未知角色' } };
  };
  try {
    const r = await SHT.pipeline.runRound({ unit: u, bookName: '测试教材', count: 1 });
    const second = r.rounds[1] && r.rounds[1].questions[0];
    assert('第二轮相同题被兜底判为未通过', !!second && second.passed === false);
    assert('兜底扣分并写清改句式或情境',
      !!second && second.score === 75 && /必须改变句式结构或情境/.test(second.feedback));
    assert('兜底不篡改首轮模型原始打分',
      r.rounds[0].questions[0].passed === false && r.rounds[0].questions[0].score === 70);
  } catch (e) {
    assert('查重兜底流程不抛异常', false, e && e.stack ? e.stack : String(e));
  } finally {
    SHT.llm.call = dupOriginal;
  }

}

main().then(function () {
  console.log('\n' + (failed ? 'FAILED ' + failed : 'ALL PASS'));
  process.exitCode = failed ? 1 : 0;
}).catch(function (e) {
  console.log('FAIL 测试脚本出错 → ' + (e && e.stack ? e.stack : String(e)));
  process.exitCode = 1;
});
