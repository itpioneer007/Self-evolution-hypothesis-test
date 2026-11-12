/*
 * 审计台截图（零依赖）：起静态服务 + 无头 Edge 截图
 *
 *   node tools/shot-audit.js [输出路径]
 *
 * 为什么单独一个工具：审计台的版式靠「三行证据 + 固定 156px 卡片 + 表头降档」
 * 撑起来，这些用冒烟测试断言不出来，只能看。所以这里喂一份**样例存档**给
 * 真实的渲染函数（不是手写 HTML 样张），截出来就是上线后的样子。
 *
 * 样例数据刻意做成「三项达标、一项没达标（信息隔离泄漏）」，这样四种状态色
 * 与总判的红/徽章反差能同时出现在一张图里。
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const REPO = path.resolve(__dirname, '..');
const PORT = 8801;
const OUT = process.argv[2] || path.join(REPO, '.tmp-shot', 'audit.png');

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

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png' };

const PREVIEW = `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="UTF-8">
<title>审计台预览</title>
<link rel="stylesheet" href="/styles.css">
<link rel="stylesheet" href="/src/dev/audit.css">
<style>body{background:#f4f6f5;margin:0}</style>
</head><body>
<div class="app"><main class="stage"><section class="stage-page is-active" id="page-audit"><div class="audit-root" id="auditRoot"></div></section></main></div>
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
<script>window.onerror=function(m,src,l){document.body.innerHTML='<pre style="color:#b00;font:13px monospace;background:#fff;padding:16px">JS ERROR: '+m+' @'+l+'</pre>';};</script>
<script>
/* ---- 样例存档：形状与真实状态下的一致，只是填了内容 ---- */
SHT.setBook('PEP-G4A'); SHT.setUnit('U1');
const P = [
  { qid:'q-8f2a', kp:'phonics · a / a-e · cake 与 cat 长短音', lv:'辨', prompt:'听录音，选出你听到的单词。（cake）　cake / cat / hat', ans:'cake' },
  { qid:'q-3c19', kp:'sentence · Where is it? · on / in 介词', lv:'用', prompt:'— Where is the picture?　— It is ___ the wall.　on / in / under', ans:'on' },
  { qid:'q-b71c', kp:'vocab · light · 一词两义', lv:'认', prompt:'选出「电灯」的英文。　light / window / door', ans:'light' },
  { qid:'q-77d0', kp:'spelling · blackboard · oa + ar 双字母组合', lv:'辨', prompt:'选出 blackboard 的正确拼写。　blackboard / blackbord / blakboard', ans:'blackboard' },
  { qid:'q-1a4e', kp:'grammar · this / these · 单复数', lv:'用', prompt:'This ___ my new shoes.　is / are / am', ans:'are' }
];
const C = [
  { qid:'q-9a01', parent:'q-8f2a', kp:P[0].kp, lv:'辨', prompt:'听录音，选出与 gate 中 a 同音的词。（name）　name / map / bag', ans:'name' },
  { qid:'q-9a02', parent:'q-3c19', kp:P[1].kp, lv:'用', prompt:'— Where are the keys?　— They are ___ the door.　in / on / under', ans:'in' },
  { qid:'q-9a03', parent:'q-b71c', kp:P[2].kp, lv:'认', prompt:'选出「电灯」的英文。　light / window / door', ans:'light' },
  { qid:'q-9a04', parent:'q-77d0', kp:P[3].kp, lv:'辨', prompt:'选出 classroom 的正确拼写。　classroom / clasroom / classrom', ans:'classroom' },
  { qid:'q-9a05', parent:'q-1a4e', kp:P[4].kp, lv:'用', prompt:'These ___ my new books.　are / is / am', ans:'are' }
];
const mk = function (o) {
  return { qid:o.qid, no:0, knowledgePoint:o.kp, ability:'vocab', cell:{ type:'中英匹配', scene:'学校', level:o.lv, distractor:'形近' },
    prompt:o.prompt, options:[], answer:o.ans, analysis:'看词形。', checks:{}, parentQid:o.parent || '' };
};
const state = {
  rounds: {
    1: { questions: P.map(mk), practice: { attempts: [
      { correct:false, picked:'cat', expected:'cake', durationMs:9800 },
      { correct:false, picked:'in', expected:'on', durationMs:13100 },
      { correct:true, picked:'light', expected:'light', durationMs:4200 },
      { correct:true, picked:'blackboard', expected:'blackboard', durationMs:6100 },
      { correct:true, picked:'are', expected:'are', durationMs:7800 }
    ] } },
    2: { questions: C.map(mk), practice: { attempts: [] } }
  },
  wrongCases: [
    { knowledgePoint:P[0].kp }, { knowledgePoint:P[0].kp }, { knowledgePoint:P[1].kp }
  ],
  gradeLedger: {}, traces: [], auditDrills: [],
  tab: 'audit'
};
/* 台账：三条可离线复算（exact）+ 一条只能靠模型（开放题写法差异） */
let L = {};
[P[2], P[3], P[4]].forEach(function (q) {
  L = SHT.grade.remember(L, mk(q), q.ans, { correct: true, via: 'exact' });
});
L = SHT.grade.remember(L, mk(P[1]), 'in the door', { correct: true, via: 'model', reason: '写法与标准答案等义' });
state.gradeLedger = L;

/* 留痕：四角色都有；验证角色故意留一条泄漏（信息隔离未达标） */
const t = function (role, at, ms, line, codes, guard) {
  return { at: at, role: role, roleName: ({plan:'课程',generate:'生成',verify:'验证',diagnose:'诊断'})[role],
    ok: true, ms: ms, tokens: 1200, line: line, codes: codes || [], errorType: '',
    inChars: 2860, fields: role === 'verify' ? ['题型','题干','选项','答案','解析','词表'] : [],
    guard: role === 'verify' ? guard : null, out: '{"ok":true}' };
};
const now = Date.now();
state.traces = [
  t('plan', new Date(now - 62000).toISOString(), 3120, '排 5 条考点'),
  t('generate', new Date(now - 58000).toISOString(), 2410, '出题：答案「name」'),
  t('verify', new Date(now - 55000).toISOString(), 1810, '通过', [], { ok: true, hits: [] }),
  t('generate', new Date(now - 51000).toISOString(), 2190, '出题：答案「in」'),
  /* 这条泄漏：模板把掌握概率带进了验证上下文（演示用） */
  t('verify', new Date(now - 48000).toISOString(), 2050, '否决 V3c',
    ['V3c'], { ok: false, hits: [{ word: '掌握概率', at: 612 }, { word: '错题', at: 640 }] }),
  t('diagnose', new Date(now - 41000).toISOString(), 3720, '错因：音近混淆（72%）'),
  t('verify', new Date(now - 34000).toISOString(), 1640, '通过', [], { ok: true, hits: [] })
];

SHT.devAudit.state = function () { return state; };
SHT.devAudit.save = function () {};
SHT.devAudit.toast = function () {};
SHT.devAudit.collectTraces = function () { return 0; };
SHT.devAudit.render();
document.title = 'ready';
</script>
</body></html>`;

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
    '--window-size=1280,1180',
    '--screenshot=' + OUT,
    '--virtual-time-budget=4000',
    '--user-data-dir=' + profile,
    'http://127.0.0.1:' + PORT + '/preview'
  ], { stdio: 'ignore' });

  child.on('exit', function () {
    server.close();
    if (fs.existsSync(OUT)) console.log('SHOT  ' + OUT + '  ' + Math.round(fs.statSync(OUT).size / 1024) + ' KB');
    else { console.log('FAIL  没生成截图，检查 Edge 版本是否支持 --headless=new --screenshot'); process.exitCode = 1; }
  });
});
