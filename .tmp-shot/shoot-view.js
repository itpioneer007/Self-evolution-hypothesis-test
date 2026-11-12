/*
 * 一次性截图脚本：04 日志页（不提交）
 * 预置一份存档到 localStorage，再跳回 index.html，让 app 自己渲染。
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const REPO = path.resolve(__dirname, '..');
const PORT = 8807;
const VIEW = process.argv[2] || 'loop';
const OUT = path.join(__dirname, VIEW + '.png');

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };

const day = (h, m) => {
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.toISOString();
};
const q = (o) => Object.assign({
  qid: 'q-' + Math.random().toString(36).slice(2, 7), no: 1, ability: 'vocab',
  cell: { type: '中英匹配', scene: '学校', level: '认', distractor: '同类不同物' },
  audioText: '', options: [], answer: '', analysis: '', optionNotes: [], checks: {}, source: 'model'
}, o);

const state = {
  version: 2, bookId: 'PEP-G4A', unitId: 'U1', tab: VIEW, agent: 'course',
  checkLayer: 0, round: 2, activeNo: 3, learningLayer: 'B',
  questionCounts: { 1: 5, 2: 5 },
  kpScope: [], failures: [], gradeLedger: {}, diagnoses: {}, logOpenDays: {},
  traces: [], traceLastId: 0, auditDrills: [],
  agentMemory: { plan: { rounds: [] }, generate: { rounds: [] }, verify: { rounds: [] }, diagnose: { rounds: [], causes: {}, lowConf: 0 } },
  progress: { points: {} },
  quota: { source: 'manual', total: 5, byAbility: { vocab: 3, sentence: 1, listening: 1 }, note: '', updatedAt: '' },
  wrongCases: [],
  rounds: {
    1: {
      startedAt: day(18, 10), closed: true, endedAt: day(18, 40), stopSignals: [], endReason: '',
      questions: [
        q({ no: 1, knowledgePoint: 'vocab · classroom · 音义联结', prompt: '选出「教室」的英文。', options: ['classroom', 'window', 'door'], answer: 'classroom', analysis: 'classroom 是教室。', optionNotes: ['classroom 就是教室', 'window 是窗户', 'door 是门'], createdAt: day(18, 11) }),
        q({ no: 2, knowledgePoint: 'listening · teacher\'s desk · 听辨教室物品', prompt: '听录音，选出你听到的教室物品。', audioText: "teacher's desk", options: ['computer', "teacher's desk", 'blackboard'], answer: "teacher's desk", analysis: '讲台是 teacher\'s desk。', optionNotes: ['computer 是计算机', '讲台就是 teacher\'s desk', 'blackboard 是黑板'], createdAt: day(18, 11) }),
        q({ no: 3, knowledgePoint: 'spelling · blackboard · oa + ar', prompt: '选出 blackboard 的正确拼写。', options: ['blackboard', 'blackbord', 'blakboard'], answer: 'blackboard', createdAt: day(18, 12) }),
        q({ no: 4, knowledgePoint: 'sentence · Where is it? · on / in', prompt: 'It is ___ the wall.', options: ['on', 'in', 'under'], answer: 'on', createdAt: day(18, 12) }),
        q({ no: 5, knowledgePoint: 'vocab · light · 电灯', prompt: '选出「电灯」的英文。', options: ['light', 'window', 'door'], answer: 'light', createdAt: day(18, 13) })
      ],
      practice: {
        cursor: 5, picked: null, draft: '', grading: false, error: '', shownAt: 0, revealed: null,
        attempts: [
          { no: 1, picked: 'classroom', expected: 'classroom', correct: true, at: day(18, 20), durationMs: 3200, hintCount: 0, via: 'exact' },
          { no: 2, picked: 'computer', expected: "teacher's desk", correct: false, at: day(18, 21), durationMs: 15400, hintCount: 0, via: 'exact',
            diag: { ok: true, correct: false, causeId: '近义混淆', causeLabel: '近义混淆', confidence: 0.72, headline: '近义混淆 · 都是教室里的东西', whyPicked: 'computer 也是教室里的物品', eliminated: [], signals: [], timing: { ms: 15400, band: 'normal' }, nextStep: '同考点换场景再考，把「指认物品」和「记单词」分开', source: 'code' } },
          { no: 3, picked: 'blackbord', expected: 'blackboard', correct: false, at: day(18, 22), durationMs: 2600, hintCount: 1, via: 'exact',
            diag: { ok: true, correct: false, causeId: '形近混淆', causeLabel: '形近混淆', confidence: 0.66, headline: '形近混淆 · 漏了一个 a', whyPicked: '少写中间的 a', eliminated: [], signals: [], timing: { ms: 2600, band: 'quick' }, nextStep: '拆成 black + board 两段拼', source: 'code' } },
          { no: 4, picked: 'on', expected: 'on', correct: true, at: day(18, 23), durationMs: 9000, hintCount: 0, via: 'exact' },
          { no: 5, picked: 'light', expected: 'light', correct: true, at: day(18, 24), durationMs: 2100, hintCount: 0, via: 'exact' }
        ]
      }
    },
    2: {
      startedAt: day(19, 5), closed: false, endedAt: '', stopSignals: [], endReason: '', progressCommitted: false,
      questions: [
        q({ no: 1, knowledgePoint: 'vocab · classroom · 音义联结', prompt: '选出「教室」的英文。', options: ['classroom', 'window', 'door'], answer: 'classroom', createdAt: day(19, 6), parentQid: '' }),
        q({ no: 2, knowledgePoint: 'listening · teacher\'s desk · 听辨教室物品', prompt: '听录音，选出你听到的物品。', audioText: 'computer', options: ['computer', "teacher's desk", 'blackboard'], answer: 'computer', createdAt: day(19, 6), parentQid: 'q-a' })
      ],
      practice: { cursor: 0, picked: null, draft: '', grading: false, error: '', shownAt: 0, revealed: null, attempts: [] }
    }
  }
};

// 失败记录：两轮都有，用来验证「这一轮」的计数与按轮次分组
const F = (round, at, kp, codes, stage, reason) => ({ round, at, planKp: kp, codes, stage, reason, attempt: 1, detail: '' });
state.failures = [
  F(2, day(19, 1), 'spelling · picture · 字母组合 ture 写成 cher', ['V1'], 'validate', '解析里出现了本单元没教过的词：cher'),
  F(2, day(19, 2), 'spelling · picture · 字母组合 ture 写成 cher', ['V1', 'V3c'], 'validate', '解析里出现了本单元没教过的词：tuer；干扰拼写和原词差太远，不像错拼：picher'),
  F(2, day(19, 3), 'spelling · picture · 字母组合 ture 写成 cher', ['V1'], 'validate', '解析里出现了本单元没教过的词：cher'),
  F(2, day(19, 4), 'spelling · picture · 字母组合 ture 写成 cher', ['GIVE_UP'], 'giveup', '连续 3 次都没过闸，这一格留空，不硬塞'),
  F(2, day(19, 5), 'spelling · picture · 字母组合 ture 写成 cher', ['V1', 'V3c'], 'validate', '解析里出现了本单元没教过的词：cher；干扰拼写和原词差太远'),
  F(2, day(19, 6), 'grammar · this / these · 单复数', ['V1'], 'validate', '解析里出现了本单元没教过的词：true'),
  F(2, day(19, 7), 'grammar · this / these · 单复数', ['V1'], 'validate', '解析里出现了本单元没教过的词：cher'),
  F(2, day(19, 8), 'grammar · this / these · 单复数', ['BENCH_UP'], 'plan', '这一格（grammar · this / these）没出成，由替补「vocab · turn on · 开关混用」顶上'),
  F(2, day(19, 9), 'vocab · turn on · 开关混用', ['PLAN_SWITCH_KP'], 'plan', '这个考点连着 2 次都造不出可信的干扰项，换相近考点重出'),
  F(1, day(18, 5), 'sentence · Where is it? · on / in', ['V3c'], 'validate', '干扰拼写和原词差太远'),
  F(1, day(18, 6), 'sentence · Where is it? · on / in', ['V1'], 'validate', '解析里出现了本单元没教过的词：above')
];

const SEED = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font:14px sans-serif">
<script>
localStorage.setItem('sht-minimal-test-v2', ${JSON.stringify(JSON.stringify(state))});
/* 先只写存档，下一步单独打开 index.html */
<\/script></body></html>`;

const server = http.createServer(function (req, res) {
  const url = req.url.split('?')[0];
  if (url === '/seed') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    return res.end(SEED);
  }
  const file = path.join(REPO, url);
  fs.readFile(file, function (err, buf) {
    if (err) { res.writeHead(404); return res.end('nf'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(buf);
  });
});

const EDGE = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].filter(p => { try { return fs.existsSync(p); } catch (e) { return false; } })[0];

server.listen(PORT, '127.0.0.1', function () {
  if (!EDGE) { console.log('no edge'); server.close(); return; }
  const profile = path.join(os.tmpdir(), 'shot-loop-' + Date.now());
  const base = ['--headless=new', '--disable-gpu', '--no-first-run', '--hide-scrollbars',
    '--force-device-scale-factor=1', '--user-data-dir=' + profile];

  // 第一步：同一个 profile 下先写存档，等进程退出（存储已落盘）
  const seed = spawn(EDGE, base.concat(['--virtual-time-budget=2000', 'http://127.0.0.1:' + PORT + '/seed']), { stdio: 'ignore' });
  seed.on('exit', function () {
    // 第二步：再开一次，这次开应用本身并截图
    const shot = spawn(EDGE, base.concat([
      '--window-size=1280,1500',
      '--screenshot=' + OUT,
      '--virtual-time-budget=6000',
      'http://127.0.0.1:' + PORT + '/index.html'
    ]), { stdio: 'ignore' });
    shot.on('exit', function () {
      server.close();
      console.log(fs.existsSync(OUT) ? 'SHOT ' + OUT + ' ' + Math.round(fs.statSync(OUT).size / 1024) + 'KB' : 'FAIL');
    });
  });
});
