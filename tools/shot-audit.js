/*
 * 审计台截图（零依赖）：起静态服务 + 无头 Edge 截图
 *
 *   node tools/shot-audit.js [pane] [输出路径]
 *   pane: plan | execute | verify | diagnose | reuse | trace（默认 plan）
 *
 * 为什么单独一个工具：审计台是「左侧导航 + 右侧详情」，版式对不对用冒烟测试
 * 断言不出来，只能看。这里喂一份样例存档给真实渲染函数（不是手写 HTML 样张），
 * 截出来就是上线后的样子。
 *
 * 样例刻意覆盖五种情况：课程给点带错因意图、执行产出带逐项说明、
 * 验证退回带题目原文、诊断带原始证据、第二轮变体挂了 parent。
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const REPO = path.resolve(__dirname, '..');
const PORT = 8801;
const PANE = process.argv[2] || 'plan';
const ROUND = Number(process.argv[4] || 2);
const OUT = process.argv[3] || path.join(REPO, '.tmp-shot', 'audit-' + PANE + '-r' + ROUND + '.png');

const EDGE_CANDIDATES = [
  process.env.EDGE_PATH,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/usr/bin/microsoft-edge',
  '/usr/bin/google-chrome'
].filter(Boolean);

function findEdge() {
  for (const p of EDGE_CANDIDATES) {
    try { if (fs.existsSync(p)) return p; } catch (e) { /* ignore */ }
  }
  return null;
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };

const PREVIEW = `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="UTF-8">
<title>审计台预览</title>
<link rel="stylesheet" href="/styles.css">
</head><body>
<div class="app"><main class="stage"><section class="stage-page is-active" id="page-audit" style="display:block;overflow:auto;padding:16px"><div class="audit-root" id="auditRoot"></div></section></main></div>
<script src="/src/data/books.js"></script>
<script src="/src/data/textbook.js"></script>
<script src="/src/data/books/hebei-g4a.js"></script>
<script src="/src/data/books/xiangshao-g4a.js"></script>
<script src="/src/data/kps-hebei-g4a.js"></script>
<script src="/src/data/kps-xiangshao-g4a.js"></script>
<script src="/src/data/curriculum.js"></script>
<script src="/src/data/knowledgePoints.js"></script>
<script src="/src/data/wrongCases.js"></script>
<script src="/src/core/enums.js"></script>
<script src="/src/core/fingerprint.js"></script>
<script src="/src/core/checklist.js"></script>
<script src="/src/core/wrongBook.js"></script>
<script src="/src/core/practice.js"></script>
<script src="/src/core/llm.js"></script>
<script src="/src/core/grade.js"></script>
<script src="/src/core/diagnose.js"></script>
<script src="/src/core/agents.js"></script>
<script src="/src/core/validate.js"></script>
<script src="/src/core/quota.js"></script>
<script src="/src/core/bkt.js"></script>
<script src="/src/core/progress.js"></script>
<script src="/src/core/agentMemory.js"></script>
<script src="/src/core/pipeline.js"></script>
<script src="/src/core/audit.js"></script>
<script src="/src/dev/audit.js"></script>
<script>
SHT.setBook('PEP-G4A'); SHT.setUnit('U1');
window.onerror = function (m, s, l) {
  document.body.innerHTML = '<pre style="color:#b00;background:#fff;padding:16px;font:13px monospace">ERROR: ' + m + ' @' + l + '</pre>';
};

const T = function (h, m) { const d = new Date(); d.setHours(h, m, 0, 0); return d.toISOString(); };
const Q = function (o) {
  return Object.assign({
    qid: 'q-' + Math.random().toString(36).slice(2, 7), no: 1, ability: 'vocab',
    cell: { type: '中英匹配', scene: '学校', level: '认', distractor: '同类不同物' },
    audioText: '', options: [], answer: '', analysis: '', optionNotes: [], checks: {}, source: 'model'
  }, o);
};

/* 第一轮：五道题，其中两道答错（诊断带原始证据） */
const R1Q = [
  Q({ qid: 'q-a1b2c3d4', no: 1, knowledgePoint: 'vocab · classroom · 音义联结',
    prompt: '选出「教室」的英文。', options: ['classroom', 'window', 'door'], answer: 'classroom',
    analysis: 'classroom 是教室。', optionNotes: ['classroom 就是教室', 'window 是窗户', 'door 是门'] }),
  Q({ qid: 'q-e5f6a7b8', no: 2, knowledgePoint: "listening · teacher's desk · 听辨教室物品",
    ability: 'listening', prompt: '听录音，选出你听到的教室物品。', audioText: "teacher's desk",
    options: ['computer', "teacher's desk", 'blackboard'], answer: "teacher's desk",
    analysis: '讲台是 teacher 的 desk。', optionNotes: ['computer 是计算机', '讲台就是 teacher 的 desk', 'blackboard 是黑板'],
    cell: { type: '听音选义', scene: '学校', level: '辨', distractor: '同类不同物' } }),
  Q({ qid: 'q-c9d0e1f2', no: 3, knowledgePoint: 'spelling · blackboard · oa + ar',
    ability: 'spelling', prompt: '选出 blackboard 的正确拼写。', options: ['blackboard', 'blackbord', 'blakboard'],
    answer: 'blackboard', analysis: 'black 与 board 中间是 oa。',
    optionNotes: ['拼作 blackboard', '错拼：漏了 oa', '错拼：少了 c'],
    cell: { type: '拼写补全', scene: '学校', level: '辨', distractor: '形近' } }),
  Q({ qid: 'q-a3b4c5d6', no: 4, knowledgePoint: 'sentence · Where is it? · on / in',
    ability: 'sentence', prompt: 'It is ___ the wall.', options: ['on', 'in', 'under'], answer: 'on',
    analysis: '墙上用 on。', optionNotes: ['on 表示贴在表面', 'in 表示在里面', 'under 表示在下面'],
    cell: { type: '选词填空', scene: '学校', level: '用', distractor: '语义近' } }),
  Q({ qid: 'q-e7f8a9b0', no: 5, knowledgePoint: 'vocab · light · 电灯',
    prompt: '选出「电灯」的英文。', options: ['light', 'window', 'door'], answer: 'light',
    analysis: 'light 是电灯。', optionNotes: ['light 是灯', 'window 是窗户', 'door 是门'] })
];

/* 第二轮：两道挂了 parent 的变体（一道答案换了、一道没换） */
const R2Q = [
  Q({ qid: 'q-9a01', no: 1, parentQid: 'q-e5f6a7b8', knowledgePoint: "listening · teacher's desk · 听辨教室物品",
    ability: 'listening', prompt: '听录音，选出你听到的物品。', audioText: 'computer',
    options: ['computer', "teacher's desk", 'blackboard'], answer: 'computer',
    analysis: 'computer 是计算机。', optionNotes: ['computer 是计算机', 'teacher 的 desk 是讲台', 'blackboard 是黑板'],
    cell: { type: '听音选义', scene: '学校', level: '辨', distractor: '同类不同物' } }),
  Q({ qid: 'q-9a02', no: 2, parentQid: 'q-c9d0e1f2', knowledgePoint: 'spelling · blackboard · oa + ar',
    ability: 'spelling', prompt: '选出 blackboard 的正确拼写。', options: ['blackboard', 'blackbord', 'blakboard'],
    answer: 'blackboard', analysis: 'black 与 board 中间是 oa。',
    optionNotes: ['拼作 blackboard', '错拼：漏了 oa', '错拼：少了 c'],
    cell: { type: '拼写补全', scene: '学校', level: '辨', distractor: '形近' } })
];

const state = {
  round: __ROUND__,
  auditPane: '__PANE__',
  rounds: {
    1: {
      startedAt: T(18, 10),
      plans: [
        { no: 1, kp: 'vocab · classroom · 音义联结', ability: 'vocab', cause: '同类不同物', whyThisOne: '本单元第一个教室词，先立住', level: '认', cell: { type: '中英匹配', scene: '学校', level: '认', distractor: '同类不同物' } },
        { no: 2, kp: "listening · teacher's desk · 听辨教室物品", ability: 'listening', cause: '同类不同物', whyThisOne: '他上次把讲台听成计算机', level: '辨', cell: { type: '听音选义', scene: '学校', level: '辨', distractor: '同类不同物' }, probe: { parentQid: 'q-w0', prevPrompt: '听录音，选出你听到的教室物品。', missCount: 2 } },
        { no: 3, kp: 'spelling · blackboard · oa + ar', ability: 'spelling', cause: '形近混淆', whyThisOne: '词形最长，最容易漏字母', level: '辨', cell: { type: '拼写补全', scene: '学校', level: '辨', distractor: '形近' } },
        { no: 4, kp: 'sentence · Where is it? · on / in', ability: 'sentence', cause: '母语负迁移', whyThisOne: '中文「在墙上」不分介词', level: '用', cell: { type: '选词填空', scene: '学校', level: '用', distractor: '语义近' } },
        { no: 5, kp: 'vocab · light · 电灯', ability: 'vocab', cause: '近义混淆', whyThisOne: '与 window / door 同类，容易混', level: '认', cell: { type: '中英匹配', scene: '学校', level: '认', distractor: '同类不同物' } }
      ],
      questions: R1Q,
      practice: {
        attempts: [
          { no: 1, picked: 'classroom', expected: 'classroom', correct: true, at: T(18, 20), durationMs: 3200, via: 'exact' },
          { no: 2, picked: 'computer', expected: "teacher's desk", correct: false, at: T(18, 21), durationMs: 15400, via: 'exact',
            diag: { ok: true, correct: false, causeId: '近义混淆', causeLabel: '近义混淆', confidence: 0.72,
              headline: '两个都是教室里的物品，他按「看得见的电器」挑了一个',
              whyPicked: 'computer 也是教室里的东西，位置就在讲台边上',
              signals: [{ kind: 'meaning', text: '两个词的中文义同属「教室物品」，没有字面重叠' }],
              eliminated: [{ index: 2, letter: 'C', option: 'blackboard', why: '黑板在墙上，和「听到的声音」对不上，靠位置排掉了' }],
              timing: { ms: 15400, band: 'normal', note: '' },
              nextStep: '同考点换场景再考，把「指认物品」和「记单词」分开', source: 'code' } },
          { no: 3, picked: 'blackbord', expected: 'blackboard', correct: false, at: T(18, 22), durationMs: 2600, hintCount: 1, via: 'exact',
            diag: { ok: true, correct: false, causeId: '形近混淆', causeLabel: '形近混淆', confidence: 0.66,
              headline: '漏了中间 oa 里的 a',
              whyPicked: '与正确答案差 2 个字母，少写中间的 a',
              signals: [{ kind: 'spell', text: '与正确答案差 2 个字母（blackbord / blackboard）' }],
              eliminated: [{ index: 2, letter: 'C', option: 'blakboard', why: '开头字母顺序错，他一眼看得出' }],
              timing: { ms: 2600, band: 'quick', note: '2.6 秒作答' },
              nextStep: '拆成 black + board 两段拼', source: 'code' } },
          { no: 4, picked: 'on', expected: 'on', correct: true, at: T(18, 23), durationMs: 9000, via: 'exact' },
          { no: 5, picked: 'light', expected: 'light', correct: true, at: T(18, 24), durationMs: 2100, via: 'exact' }
        ]
      },
      closed: true
    },
    2: {
      startedAt: T(19, 5),
      plans: [
        { no: 1, kp: "listening · teacher's desk · 听辨教室物品", ability: 'listening', cause: '同类不同物', whyThisOne: '他上次就错在这', level: '辨', cell: { type: '听音选义', scene: '学校', level: '辨', distractor: '同类不同物' }, probe: { parentQid: 'q-e5f6a7b8', prevPrompt: '听录音，选出你听到的教室物品。', missCount: 1 } },
        { no: 2, kp: 'spelling · blackboard · oa + ar', ability: 'spelling', cause: '形近混淆', whyThisOne: '漏字母，这次换个拼写角度', level: '辨', cell: { type: '拼写补全', scene: '学校', level: '辨', distractor: '形近' }, probe: { parentQid: 'q-c9d0e1f2', prevPrompt: '选出 blackboard 的正确拼写。', missCount: 1 } }
      ],
      questions: R2Q,
      practice: { attempts: [] }
    }
  },
  wrongCases: [
    { knowledgePoint: "listening · teacher's desk · 听辨教室物品", unitId: SHT.curriculum.hostUnitId },
    { knowledgePoint: 'spelling · blackboard · oa + ar', unitId: SHT.curriculum.hostUnitId }
  ],
  failures: [
    { round: 2, at: T(19, 1), stage: 'verify', planKp: "listening · teacher's desk · 听辨教室物品",
      codes: ['C3'], reason: '选项里 computer 与 teacher 的 desk 在「教室物品」这一类里都成立，题干没有限定',
      detail: JSON.stringify({ prompt: '听录音，选出你听到的教室物品。', options: ['computer', "teacher's desk", 'blackboard'], answer: "teacher's desk", analysis: '讲台就是那个桌子。' }) },
    { round: 2, at: T(19, 2), stage: 'validate', planKp: 'spelling · blackboard · oa + ar',
      codes: ['V3c'], reason: '干扰拼写和原词差太远，不像错拼：blckbord',
      detail: JSON.stringify({ prompt: '选出 blackboard 的正确拼写。', options: ['blackboard', 'blckbord', 'blakbord'], answer: 'blackboard', analysis: '中间是 oa。' }) },
    { round: 2, at: T(19, 3), stage: 'validate', planKp: 'sentence · Where is it? · on / in',
      codes: ['V1'], reason: '解析里出现了本单元没教过的词：surface',
      detail: JSON.stringify({ prompt: 'It is ___ the wall.', options: ['on', 'in', 'under'], answer: 'on', analysis: 'on 表示在表面（surface）上。' }) },
    { round: 2, at: T(19, 4), stage: 'giveup', planKp: 'vocab · turn on · 开关混用',
      codes: ['GIVE_UP'], reason: '连续 3 次都没过闸，这一格留空，不硬塞', detail: '' }
  ],
  gradeLedger: {},
  diagnoses: {},
  traces: [
    { at: T(19, 5), role: 'plan', roleName: '课程', ok: true, ms: 3120, line: '排 2 条考点', codes: [], out: '{"plans":[{"kp":"..."}]}' },
    { at: T(19, 6), role: 'generate', roleName: '生成', ok: true, ms: 2410, line: '出题：答案「computer」', codes: [], out: '{"answer":"computer"}' },
    { at: T(19, 7), role: 'verify', roleName: '验证', ok: true, ms: 1810, line: '否决 C3', codes: ['C3'], out: '{"verdict":"fail","fails":[{"id":"C3"}]}' },
    { at: T(19, 8), role: 'generate', roleName: '生成', ok: true, ms: 2190, line: '出题：答案「blackboard」', codes: [], out: '{"answer":"blackboard"}' },
    { at: T(19, 9), role: 'verify', roleName: '验证', ok: true, ms: 1640, line: '通过', codes: [], out: '{"verdict":"pass"}' },
    { at: T(19, 10), role: 'diagnose', roleName: '诊断', ok: true, ms: 3720, line: '错因：近义混淆（72%）', codes: [], out: '{"cause":"近义混淆"}' }
  ]
};

SHT.devAudit.state = function () { return state; };
SHT.devAudit.save = function () {};
SHT.devAudit.toast = function () {};
SHT.devAudit.collectTraces = function () { return 0; };
SHT.devAudit.render();
document.title = 'ready';
</script>
</body></html>`.replace('__PANE__', PANE).replace('__ROUND__', ROUND);

const server = http.createServer(function (req, res) {
  const url = req.url.split('?')[0];
  if (url === '/preview') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    return res.end(PREVIEW);
  }
  const file = path.join(REPO, url);
  fs.readFile(file, function (err, buf) {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(buf);
  });
});

server.listen(PORT, '127.0.0.1', function () {
  const edge = findEdge();
  if (!edge) {
    console.log('SKIP  没找到 Edge / Chrome，设 EDGE_PATH 指向可执行文件后再跑');
    server.close();
    return process.exit(0);
  }
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  const profile = path.join(os.tmpdir(), 'sht-shot-' + Date.now());
  const child = spawn(edge, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--disable-extensions', '--hide-scrollbars', '--force-device-scale-factor=1',
    '--window-size=1280,1120',
    '--screenshot=' + OUT,
    '--virtual-time-budget=4000',
    '--user-data-dir=' + profile,
    'http://127.0.0.1:' + PORT + '/preview'
  ], { stdio: 'ignore' });

  child.on('exit', function () {
    server.close();
    if (fs.existsSync(OUT)) console.log('SHOT  ' + OUT + '  ' + Math.round(fs.statSync(OUT).size / 1024) + ' KB');
    else { console.log('FAIL  没生成截图'); process.exitCode = 1; }
  });
});
