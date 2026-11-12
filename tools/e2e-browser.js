/*
 * 浏览器侧端到端验证（零依赖）：本地 mock 模型 + 无头 Edge
 *
 *   node tools/e2e-browser.js
 *
 * 为什么要有这一层：smoke-test.js 是在 Node 里给 SHT.llm.call 打桩，验证的是流水线
 * 逻辑；它验证不了 app 之外的真实链路——页面上的 fetch、CORS、JSON 解析、事件回调。
 * 而真 key 不一定在手上，所以这里起一个说 DeepSeek 协议的本地服务，让页面真的发请求。
 *
 * mock 刻意注入四种失败，覆盖全部退回路径：
 *   第 2 条计划  第一次出拼写题、干扰项写成 curtain / zebra  → 代码闸 V3c 退回，重出后通过
 *   第 3 条计划  第一次质检判 fail C3                       → 质检否决，重出后通过
 *   第 4 条计划  质检判 fail 但一个条款号都不给              → 无效否决，采纳但标 weak
 *   第 5 条计划  每次都出超纲词                              → 3 次不过，放弃并留 GIVE_UP
 *
 * 断言的是「退回之后有没有留下痕迹」，不是「题好不好」——题好不好得拿真模型跑。
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const REPO = path.resolve(__dirname, '..');
const PORT = 8799;
const EDGE_CANDIDATES = [
  process.env.EDGE_PATH,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/usr/bin/microsoft-edge',
  '/usr/bin/google-chrome'
].filter(Boolean);

let passed = 0;
let failed = 0;
function assert(name, cond, extra) {
  if (cond) { passed += 1; console.log('PASS  ' + name); }
  else { failed += 1; console.log('FAIL  ' + name + (extra ? '  → ' + extra : '')); }
}

/* ---------------- mock 模型的剧本 ---------------- */

const kpIndex = {};     // 考点文本 → 计划序号
const verifyHits = {};  // 题干 → 被验证次数
const promptIdx = {};  // 题干 → 计划序号（验证看不到知识点，只能按题干认题）

const MODE = { round: 1 };  // 页面会先打一声招呼切到第二轮

/*
 * 第二轮的剧本刻意和第一轮不同：只排 1 条，而且是「改写过的考点」。
 * 真实模型不会照抄考点文本（实测一轮 5 条计划 5 条自造），这里就按那个真实行为写：
 * 把错题画像里的考点原文砍掉半截，看代码是把它当新考点漏掉，
 * 还是按词面重合挂回第一轮那道错题。
 */
function planFromWrongCard(userText) {
  const m = String(userText).match(/错题画像[^\n]*\n- ([^（\n]+)（/);
  const kp = m ? m[1].trim() : '';
  if (!kp) {
    return [{ kp: 'vocab · 画像没读到 · 兜底', ability: 'vocab', cause: '未掌握', whyThisOne: '画像没读到', nextIfWrong: '重排', level: '认' }];
  }
  return [{
    kp: kp.replace(/·[^·]*$/, '· 换个角度再考一次'), ability: 'vocab', cause: '形近混淆',
    whyThisOne: '上一轮这个考点答错了，换一个角度再考', nextIfWrong: '再换图片直认', level: '辨'
  }];
}

function parseVocab(text) {
  const out = [];
  const seen = {};
  const re = /([A-Za-z][A-Za-z'’\- ]*?)=([^；(（]+)/g;
  let m;
  while ((m = re.exec(String(text)))) {
    const en = m[1].trim().replace(/\s+/g, ' ');
    const zh = m[2].trim();
    const k = en.toLowerCase();
    if (!en || seen[k] || !zh || zh.length > 11) continue;
    seen[k] = 1;
    out.push({ en: en, zh: zh });
  }
  return out;
}

function buildPlans(userText) {
  if (MODE.round === 2) return planFromWrongCard(userText);
  const words = parseVocab(userText).slice(0, 12);
  const shapes = [['vocab', '认'], ['spelling', '辨'], ['sentence', '用'], ['vocab', '认'], ['vocab', '认']];
  return shapes.map(function (s, i) {
    const w = words[i] || words[0];
    const kp = s[0] + ' · ' + w.en + ' · 混淆词义与拼写';
    kpIndex[kp] = i;
    return {
      kp: kp, ability: s[0], cause: '看到词想不起中文',
      whyThisOne: '本单元核心词', nextIfWrong: '先配对再认词', level: s[1]
    };
  });
}

function mutate(word, seed) {
  const a = word.split('');
  const i = 1 + (seed % Math.max(1, a.length - 2));
  const t = a[i]; a[i] = a[i + 1]; a[i + 1] = t;
  return a.join('');
}

function buildQuestion(userText, idx) {
  const vocab = parseVocab(userText);
  const tm = userText.match(/- 题型：([^；\n]+)/);
  const type = tm ? tm[1].trim() : '中英匹配';
  const isSpelling = type === '拼写补全' || type === '听写';
  const isListening = ['听音选义', '字母组合辨音', '听写'].indexOf(type) >= 0;
  const retry = /上一版被退回/.test(userText);

  if (idx === 4) {
    const w = vocab[0];
    return { prompt: '选出「' + w.zh + '」对应的英文。', audioText: '', options: ['zebra', w.en, 'curtain'], answer: w.en, analysis: '别和动物词混。', keyword: w.en };
  }
  if (idx === 1 && !retry) {
    const w = vocab[1] || vocab[0];
    return { prompt: '选出「' + w.zh + '」的正确拼写。', audioText: '', options: [w.en, 'curtain', 'zebra'], answer: w.en, analysis: '看清词形。', keyword: w.en };
  }

  // 第二轮换个词出：复用的意思是「同考点、换题面」，不是把原题再印一遍
  const base = (idx + 1) * 7 % vocab.length;
  const w = vocab[MODE.round === 2 ? (base + 1) % vocab.length : base] || vocab[0];
  const others = vocab.filter(function (x) { return x.en.toLowerCase() !== w.en.toLowerCase(); });
  const o1 = others[(idx + 1) % others.length];
  const o2 = others[(idx + 2) % others.length];
  if (isSpelling) {
    return {
      prompt: '选出「' + w.zh + '」的正确拼写。', audioText: isListening ? w.en : '',
      options: [w.en, mutate(w.en, 1), mutate(w.en, 2)], answer: w.en,
      analysis: w.zh + ' 拼成 ' + w.en + '，注意中间字母。', keyword: w.en
    };
  }
  return {
    prompt: '选出「' + w.zh + '」对应的英文。', audioText: isListening ? w.en : '',
    options: [w.en, o1.en, o2.en], answer: w.en,
    analysis: '「' + w.zh + '」就是 ' + w.en + '。', keyword: w.en
  };
}

function answerFor(role, user) {
  if (role === 'plan') return JSON.stringify({ plans: buildPlans(user) });
  if (role === 'generate') {
    const m = user.match(/- 考点：(.+)/);
    const kp = m ? m[1].trim() : '';
    return JSON.stringify(buildQuestion(user, kpIndex[kp] == null ? 0 : kpIndex[kp]));
  }
  /*
   * 验证角色现在看不到知识点与出题意图（那是刻意拿掉的），所以 mock 只能按题面
   * 认题：题干 + 选项一起当键。只按题干不够——两道题可能问同一个中文词。
   */
  const m = user.match(/- 题干：(.+)/);
  const mo = user.match(/- 选项：(.+)/);
  const key = (m ? m[1].trim() : '') + '|' + (mo ? mo[1].trim() : '');
  if (promptIdx[key] == null) promptIdx[key] = Object.keys(promptIdx).length;
  const idx = promptIdx[key];
  verifyHits[key] = (verifyHits[key] || 0) + 1;
  const first = verifyHits[key] === 1;
  if (idx === 2 && first) return JSON.stringify({ verdict: 'fail', fails: [{ id: 'C3', reason: '选项里 This 与 These 大小写不一致' }], note: '' });
  if (idx === 3 && first) return JSON.stringify({ verdict: 'fail', fails: [], note: '说不上来哪里不对' });
  return JSON.stringify({ verdict: 'pass' });
}

/* ---------------- 页面（内联，不落地成文件） ---------------- */

const PAGE = function () {
  const scripts = [
    'src/data/books.js', 'src/data/textbook.js', 'src/data/books/hebei-g4a.js',
    'src/data/books/xiangshao-g4a.js', 'src/data/curriculum.js', 'src/data/knowledgePoints.js',
    'src/data/wrongCases.js', 'src/core/enums.js', 'src/core/fingerprint.js', 'src/core/checklist.js',
    'src/core/wrongBook.js', 'src/core/practice.js', 'src/core/llm.js', 'src/core/grade.js', 'src/core/diagnose.js', 'src/core/agents.js',
    'src/core/validate.js', 'src/core/quota.js', 'src/core/bkt.js', 'src/core/progress.js', 'src/core/agentMemory.js', 'src/core/pipeline.js'
  ];
  return [
    '<!doctype html><html lang="zh"><head><meta charset="utf-8"><title>e2e</title></head><body>',
    '<pre id="out">running</pre>',
    scripts.map(function (s) { return '<script src="/' + s + '"><\/script>'; }).join(''),
    '<script>',
    'function send(obj){return fetch("/report",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(obj)});}',
    '(async function(){',
    '  try {',
    '    SHT.llm.save({baseUrl:"http://127.0.0.1:' + PORT + '",model:"mock-model",key:"mock-key",temperature:0.6,maxTokens:1600,timeoutMs:30000});',
    '    SHT.setBook("HEB-G4A","U1");',
    '    var unit = SHT.curriculum;',
    '    var events = [];',
    // 显式给配额：这个用例要验的是「退回 → 留痕 → 重出 → 放弃」这条链，
    // 不该被自动算出来的能力配额拦掉几条计划
    '    var res = await SHT.pipeline.runRound({unit:unit,count:5,brief:SHT.pipeline.buildBrief({unitId:unit.id,rounds:[],wrongCases:[]}),existing:[],quota:{total:5,byAbility:{vocab:3,spelling:1,sentence:1}},onEvent:function(e){events.push(e.phase);}});',
    '    var cells = {};',
    '    res.questions.forEach(function(q){cells[SHT.cellKey(q.cell)]=1;});',
    /*
     * 第二轮：把第一轮第 1 题当成他答错了，走一遍「错题本 → brief → 计划 → 题」。
     * 这一步以前没有覆盖：smoke 里是手搓一条 wrongCase 直接喂 brief，
     * 验不到「页面上的 buildBrief 用的是哪个 unitId」「改写过的考点还能不能挂上」。
     */
    '    var q1 = res.questions[0];',
    '    var wrong = {',
    '      id: "wq:S-001:" + unit.hostUnitId + ":" + q1.qid, studentId: "S-001",',
    '      unitId: unit.hostUnitId, originalQuestionId: q1.qid, kpId: "",',
    '      knowledgePoint: q1.knowledgePoint, ability: q1.ability, category: "未掌握",',
    '      questionSnapshot: q1.prompt, studentAnswer: "他选错的项", correctAnswer: q1.answer,',
    '      firstAttemptEvidence: { hintCount: 0, retryCount: 0, durationMs: 6000, completedAt: new Date().toISOString() },',
    '      variantAttempts: [], masteryState: "wrong", remediationLoopCount: 0, createdAt: new Date().toISOString()',
    '    };',
    // 只传本轮的 attempts，等于告诉 brief「上一轮没人作答」，这里刻意带上一次错答
    '    var brief2 = SHT.pipeline.buildBrief({',
    '      unitId: unit.id,',
    '      rounds: [{ questions: res.questions, practice: { attempts: [{ no: q1.no, stage: "first", kpLabel: q1.knowledgePoint, picked: "他选错的项", expected: q1.answer, correct: false, hintCount: 0 }] } }],',
    '      wrongCases: [wrong]',
    '    });',
    '    await fetch("/mode", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ round: 2 }) });',
    '    var res2 = await SHT.pipeline.runRound({',
    '      unit: unit, count: 1, brief: brief2, existing: res.questions,',
    '      quota: { source: "manual", total: 1, byAbility: { vocab: 1 } }',
    '    });',
    '    var summary = {',
    '      ok: res.ok, unit: unit.id, planCount: res.plans.length, questionCount: res.questions.length,',
    '      distinctCells: Object.keys(cells).length,',
    '      questions: res.questions.map(function(q){return {no:q.no,type:q.cell.type,options:q.options,answer:q.answer,verdict:q.modelVerdict,verify:q.checks.__verify};}),',
    '      failures: res.failures.map(function(f){return {stage:f.stage,codes:f.codes,reason:String(f.reason||"")};}),',
    '      events: events, llm: SHT.llm.stats(),',
    '      round2: {',
    '        wrongQid: q1.qid, wrongKp: q1.knowledgePoint, wrongPrompt: q1.prompt,',
    '        priorityCount: (brief2.priority || []).length,',
    '        priorityQid: (brief2.priority[0] || {}).prevQid || "",',
    '        planProbe: (res2.plans[0] || {}).probe || null,',
    '        planKp: (res2.plans[0] || {}).kp || "",',
    '        questionCount: res2.questions.length,',
    '        questionParent: (res2.questions[0] || {}).parentQid || "",',
    '        questionPrompt: (res2.questions[0] || {}).prompt || "",',
    '        failures: res2.failures.map(function(f){return {stage:f.stage,codes:f.codes,reason:String(f.reason||"")};})',
    '      }',
    '    };',
    '    await send({ok:true,summary:summary});',
    '  } catch(e) { await send({ok:false,error:String(e&&e.stack||e)}); }',
    '})();',
    '<\/script></body></html>'
  ].join('\n');
};

/* ---------------- 起服务 + 起浏览器 ---------------- */

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };

let finish;
const done = new Promise(function (r) { finish = r; });

const server = http.createServer(function (req, res) {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Private-Network': 'true'
  };
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }

  if (req.method === 'GET') {
    const rel = decodeURIComponent(req.url.split('?')[0]);
    if (rel === '/e2e') {
      res.writeHead(200, Object.assign({ 'Content-Type': MIME['.html'] }, cors));
      return res.end(PAGE());
    }
    const file = path.join(REPO, rel === '/' ? 'index.html' : rel);
    if (!file.startsWith(REPO)) { res.writeHead(403); return res.end(); }
    fs.readFile(file, function (err, buf) {
      if (err) { res.writeHead(404); return res.end('404'); }
      res.writeHead(200, Object.assign({ 'Content-Type': MIME[path.extname(file)] || 'text/plain' }, cors));
      res.end(buf);
    });
    return;
  }

  let body = '';
  req.on('data', function (c) { body += c; });
  req.on('end', function () {
    if (req.url === '/report') {
      res.writeHead(200, Object.assign({ 'Content-Type': 'application/json' }, cors));
      res.end('{"ok":true}');
      try { finish(JSON.parse(body)); } catch (e) { finish({ ok: false, error: '报告不是合法 JSON' }); }
      return;
    }
    // 页面要跑第二轮前先切剧本：同一个 mock 服务，第一轮演「出题失败」，第二轮演「复用错题」
    if (req.url === '/mode') {
      res.writeHead(200, Object.assign({ 'Content-Type': 'application/json' }, cors));
      res.end('{"ok":true}');
      try { MODE.round = Number(JSON.parse(body).round) || 1; } catch (e) { MODE.round = 1; }
      return;
    }
    let payload = {};
    try { payload = JSON.parse(body); } catch (e) { /* 忽略 */ }
    const system = (payload.messages && payload.messages[0] && payload.messages[0].content) || '';
    const user = (payload.messages && payload.messages[1] && payload.messages[1].content) || '';
    let role = 'other';
    if (/"plans"/.test(system)) role = 'plan';
    else if (/"verdict"/.test(system)) role = 'verify';
    else if (/"options"/.test(system)) role = 'generate';

    const content = answerFor(role, user);
    res.writeHead(200, Object.assign({ 'Content-Type': 'application/json' }, cors));
    res.end(JSON.stringify({
      id: 'mock', object: 'chat.completion', model: 'mock-model',
      choices: [{ index: 0, message: { role: 'assistant', content: content }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 500, completion_tokens: 120, total_tokens: 620 }
    }));
  });
});

function findEdge() {
  for (let i = 0; i < EDGE_CANDIDATES.length; i += 1) {
    if (fs.existsSync(EDGE_CANDIDATES[i])) return EDGE_CANDIDATES[i];
  }
  return '';
}

server.listen(PORT, '127.0.0.1', function () {
  const edge = findEdge();
  if (!edge) {
    console.log('SKIP  没找到 Edge / Chrome，设 EDGE_PATH 指向可执行文件后再跑');
    server.close();
    return process.exit(0);
  }
  // 每次用独立 profile：同一目录被上一个无头实例锁着时，新进程会静默并入旧实例
  const profile = path.join(os.tmpdir(), 'sht-e2e-' + Date.now());
  const child = spawn(edge, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--disable-extensions', '--mute-audio', '--user-data-dir=' + profile,
    'http://127.0.0.1:' + PORT + '/e2e'
  ], { stdio: 'ignore' });

  const timer = setTimeout(function () {
    finish({ ok: false, error: '超时 60 秒没拿到报告' });
  }, 60000);

  done.then(function (report) {
    clearTimeout(timer);
    try { child.kill(); } catch (e) { /* 忽略 */ }
    server.close();

    if (!report.ok) {
      assert('页面跑完一整轮', false, report.error);
      console.log('\n' + failed + ' FAILED');
      return process.exit(1);
    }
    const s = report.summary;
    const byCode = function (code) { return s.failures.filter(function (f) { return f.codes.indexOf(code) >= 0; }); };

    assert('页面真发出了模型请求（三角色都调到了）', s.llm.calls >= 10 && s.llm.ok === s.llm.calls,
      s.llm.calls + ' 次调用 / 成功 ' + s.llm.ok);
    assert('5 条计划里 1 条被放弃、4 条落库', s.planCount === 5 && s.questionCount === 4,
      s.planCount + ' 计划 / ' + s.questionCount + ' 题');
    assert('4 道题落在 4 个不同格子', s.distinctCells === s.questionCount, s.distinctCells + ' 格');
    assert('代码闸退回拼写题的假干扰项（V3c）', byCode('V3c').length === 1,
      JSON.stringify(byCode('V3c').map(function (f) { return f.reason; })));
    assert('质检否决（C3）留痕并重出通过', byCode('C3').length === 1 && s.events.indexOf('reject') > 0);
    assert('质检只说 fail 不给条款号时按弱通过采纳', byCode('VERIFY_NO_CODE').length === 1 &&
      s.questions.some(function (q) { return q.verify === 'weak'; }));
    assert('连续 3 次不过闸 → 放弃并留 GIVE_UP', byCode('GIVE_UP').length === 1 &&
      byCode('V1').length === 3);
    assert('失败记录一条都没被吞（退回的题都留在记录里）', s.failures.length === 7,
      s.failures.length + ' 条');

    /*
     * 第二轮：错题复用。这条链在浏览器里跑，验的是 smoke 覆盖不到的两件事：
     *   1. 页面调 buildBrief 时传的是哪个 unitId（错题存的是教材单元 id）
     *   2. 模型把考点改写之后，probe 还挂不挂得上（真实模型不照抄考点文本）
     */
    const r2 = s.round2 || {};
    assert('第二轮 brief 里读到了第一轮的错题',
      r2.priorityCount === 1 && r2.priorityQid === r2.wrongQid,
      'priority ' + r2.priorityCount + ' 条 / prevQid ' + (r2.priorityQid || '(空)') + ' / 原题 ' + r2.wrongQid);
    assert('考点被模型改写后仍挂上了，并标成近似命中',
      !!r2.planProbe && r2.planProbe.match === 'near',
      JSON.stringify(r2.planProbe || null) + ' / 计划考点：' + r2.planKp);
    assert('计划挂回第一轮那道错题（parentQid）',
      !!r2.planProbe && r2.planProbe.parentQid === r2.wrongQid,
      String(r2.planProbe && r2.planProbe.parentQid));
    assert('出出来的题带着同一个 parentQid',
      r2.questionCount === 1 && r2.questionParent === r2.wrongQid,
      r2.questionCount + ' 题 / parentQid ' + (r2.questionParent || '(空)'));
    assert('复用题换了题面，不是把原题照抄一遍',
      !!r2.questionPrompt && r2.questionPrompt !== r2.wrongPrompt,
      '第一轮：' + r2.wrongPrompt + ' / 第二轮：' + r2.questionPrompt);
    console.log('\n' + (failed === 0 ? 'ALL PASS' : failed + ' FAILED'));
    process.exit(failed === 0 ? 0 : 1);
  });
});
