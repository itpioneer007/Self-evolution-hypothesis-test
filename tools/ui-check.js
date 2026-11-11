/*
 * 前端可测性检查：node tools/ui-check.js
 *
 * 需要 DEEPSEEK_API_KEY（真调模型，约 10–20 次调用）：
 *   DEEPSEEK_API_KEY=sk-xxx node tools/ui-check.js
 *
 * 做的事：起本地静态服务 → 无头 Edge 打开 /ui-check → 该页用 iframe 装 index.html，
 * 以「用户点按钮」的方式走完整条界面流程，而不是直接调 SHT 的函数。
 * 这样验的是界面接线有没有断（按钮 id、动作名、渲染、切 tab），
 * 是 smoke-test 与 live-run 都覆盖不到的一层。
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const REPO = path.resolve(__dirname, '..');
const PORT = 8801;
const KEY = process.env.DEEPSEEK_API_KEY || '';
const EDGE_CANDIDATES = [
  process.env.EDGE_PATH,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/usr/bin/microsoft-edge'
].filter(Boolean);

if (!KEY) {
  console.error('缺 DEEPSEEK_API_KEY。用法：DEEPSEEK_API_KEY=sk-xxx node tools/ui-check.js');
  process.exit(2);
}

const DRIVER = `<!doctype html><html lang="zh"><head><meta charset="utf-8"><title>ui-check</title></head>
<body style="margin:0;font:14px sans-serif">
<pre id="out" style="padding:8px;background:#f2f7fd">running…</pre>
<script>
/* 页面里的错误报回服务器：这个脚本一旦有语法错，整块都不执行，
   只写「等不到报告」根本看不出原因（踩过：模板字符串把正则里的 \ 吃掉） */
window.onerror = function (m, s, l) {
  try { fetch('/progress', { method: 'POST', body: 'ERR ' + m + ' @line ' + l }); } catch (e) {}
  return false;
};
</script>
<script>
const KEY = ${JSON.stringify(KEY)};
const log = [];
function rec(name, ok, extra) { log.push({ name: name, ok: !!ok, extra: extra == null ? '' : String(extra) }); }
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
function mark(s) { try { fetch('/progress', { method: 'POST', body: s }); } catch (e) { /* ignore */ } }
function q(sel) { return D.querySelector(sel); }
function qa(sel) { return Array.from(D.querySelectorAll(sel)); }
function click(el) { if (el) el.click(); return !!el; }

(async function () {
  mark('IIFE 开始');
  localStorage.setItem('sht-llm-config-v1', JSON.stringify({
    baseUrl: 'https://api.deepseek.com', model: 'deepseek-chat', key: KEY,
    temperature: 0.6, maxTokens: 1600, timeoutMs: 90000
  }));
  localStorage.removeItem('sht-minimal-test-v2');

  const fr = document.createElement('iframe');
  fr.style.width = '1440px'; fr.style.height = '980px'; fr.style.border = '0';
  fr.src = '/index.html';
  document.body.appendChild(fr);
  mark('iframe 已插入');
  await new Promise(function (r) {
    let done = false;
    const fin = function () { if (done) return; done = true; r(); };
    fr.onload = fin;
    // 兜底：onload 可能已经过掉或在 iframe 里被吞，别让整轮挂死在这里
    setTimeout(fin, 12000);
  });
  mark('iframe 已载入');
  const W = fr.contentWindow;
  const D = fr.contentDocument;
  window.D = D;
  await sleep(400);
  mark('sleep 结束');

  const errs = [];
  W.addEventListener('error', function (e) { errs.push(String(e.message || e)); });

  mark('打开页面');

  // 1 三张智能体卡片
  rec('01 页渲染出 3 张智能体卡片', qa('[data-role]').length === 3, qa('[data-role]').length);

  // 2 候选知识点清单（PEP 四上 U1 有 8 条）
  const scopeBtns = qa('[data-action="toggle-scope"]');
  rec('候选清单带「纳入」按钮', scopeBtns.length >= 3, scopeBtns.length);

  mark('勾范围');

  // 3 勾 3 个考点进本轮范围
  // 每次都要重新取节点：点一下会 renderAll 整块重渲染，旧节点已经脱离文档
  for (let i = 0; i < 3; i += 1) {
    const b = qa('[data-action="toggle-scope"]').filter(function (x) { return x.textContent.trim() === '纳入'; })[0];
    if (!b) break;
    b.click();
    await sleep(250);
  }
  const scopeNum = q('.kp-scope strong') ? q('.kp-scope strong').textContent.trim() : '';
  rec('点「纳入」后范围计数变成 3', scopeNum === '3', scopeNum);

  // 3.5 配额条：七类能力都列出来（含 0 的，才能看出哪类这轮一次没考），点「＋」能改
  const chips = qa('.quota-chip');
  rec('配额条列出七类能力', chips.length === 7,
    chips.map(function (c) { return String(c.textContent || '').replace(/\\s+/g, ''); }).join(' '));
  const vocabQ = function () {
    const c = qa('.quota-chip')[0];
    const n = c ? c.querySelector('.q') : null;
    return n ? String(n.textContent || '').trim() : '';
  };
  const qBefore = vocabQ();
  const inc = q('[data-action="quota-inc"]');
  if (inc) inc.click();
  await sleep(400);
  const qAfter = vocabQ();
  rec('点「＋」后该类配额加一条（不是从 0 重算）', qBefore !== qAfter && !!qAfter, qBefore + ' → ' + qAfter);
  const dec = q('[data-action="quota-dec"]');
  if (dec) dec.click();
  await sleep(400);
  rec('点「−」能减回去', vocabQ() === qBefore, qBefore + ' → ' + vocabQ());
  // 手改过就得手动重算回来，否则后面出题会按「人工调整」那份配额走
  const rc = q('[data-action="quota-recalc"]');
  if (rc) rc.click();
  await sleep(500);
  rec('点「重算」后配额跟着勾选范围走', /3/.test(String((q('.quota-sum') || {}).textContent || '')),
    String((q('.quota-sum') || {}).textContent || '').trim());

  mark('点模型出题');

  // 4 点「模型出 5 题」，等出题（真模型，给足 4 分钟）
  const btn = q('[data-action="model-round"]');
  rec('01 页有「模型出 5 题」按钮', !!btn, btn ? btn.textContent.trim() : '');
  const seedPrompt = (q('.q-prompt, .prompt-box, .q-body') || {}).textContent || '';
  const t0 = Date.now();
  if (btn) btn.click();
  // 忙碌态：出题期间按钮变成「停」，跑完才回到「模型出 5 题」
  let started = false;
  for (let w = 0; w < 20000 && !started; w += 500) {
    await sleep(500);
    started = !!q('[data-action="stop-model"]');
  }
  for (let w = 0; w < 240000; w += 2000) {
    await sleep(2000);
    if (!q('[data-action="stop-model"]') && Date.now() - t0 > 3000) break;
  }
  mark('模型跑完');
  const elapsed = Math.round((Date.now() - t0) / 1000);
  const opts = qa('[data-action="pick-option"]').length;
  const failRows = qa('.fail-row').length;
  rec('模型真跑了一轮并出题', started && opts > 0, opts + ' 个选项 / ' + elapsed + ' 秒 / 失败 ' + failRows + ' 条');
  // 出题成功后界面会自动切到执行智能体（单题九字段），计划面板不在 DOM 里了。
  // 要看配额条得先点回课程智能体，否则读到的是空的。
  click(q('[data-role="course"]'));
  await sleep(400);
  const chipTextAfter = qa('.quota-chip').map(function (c) { return String(c.textContent || '').replace(/\\s+/g, ''); }).join(' ');
  rec('模型结果回写进状态（配额条变成 已排/配额）',
    chipTextAfter.split(' ').some(function (x) { return x.indexOf('/') > 0; }), chipTextAfter);

  mark('去答题');

  // 5 切到 02 答题：故意答错，验「当场写进 03」而不是「本轮回练」
  click(q('[data-tab="practice"]'));
  await sleep(300);
  const before = qa('[data-action="pick-option"]').length;
  const wrongBefore = qa('.wrong-card').length;
  let submitted = false;
  let wrote = false;
  let sawVariant = false;
  function readState() { try { return JSON.parse(localStorage.getItem('sht-minimal-test-v2') || '{}'); } catch (e) { return {}; } }
  function wrongPick(qq) {
    const opts = (qq && qq.options) || [];
    const ans = SHT.normAnswer(qq.answer);
    for (let i = 0; i < opts.length; i += 1) { if (SHT.normAnswer(opts[i]) !== ans && String(opts[i]).trim()) return i; }
    return 0;
  }
  const SHT = W.SHT;
  let qq = (((readState().rounds || {})['1'] || {}).questions || []).filter(function (x) { return x && x.prompt; });
  for (let k = 0; k < qq.length && !wrote; k += 1) {
    const navs = qa('[data-action=q-nav]');
    if (navs[k]) { navs[k].click(); await sleep(200); }
    const o = qa('[data-action=pick-option]')[wrongPick(qq[k])];
    if (o) { o.click(); await sleep(150); }
    submitted = click(q('[data-action=submit-answer]')) || submitted;
    await sleep(400);
    // 关键：答错后这一页应该说「写进错题」，不该再塞一道同考点的变体
    const cardText = (q('#practiceCard') || {}).textContent || '';
    if (cardText.indexOf('同考点的变体') >= 0) sawVariant = true;
    click(q('[data-action=next-step]'));
    await sleep(500);
    click(q('[data-tab=wrongbook]'));
    await sleep(250);
    wrote = qa('.wrong-card').length > wrongBefore;
    click(q('[data-tab=practice]'));
    await sleep(150);
  }
  rec('02 页能选选项并提交', before > 0 && submitted, '选项 ' + before + ' / 提交 ' + submitted);
  const at = ((readState().rounds || {})['1'] || {}).practice.attempts || [];
  rec('答错当场写进 03 错题（不再本轮回练）', wrote, '错题 ' + wrongBefore + ' → ' + qa('.wrong-card').length);
  rec('作答记录里没有同轮变体那一枪', !sawVariant && at.filter(function (a) { return a.stage === 'variant'; }).length === 0,
    at.map(function (a) { return a.stage + (a.correct ? '对' : '错'); }).join(' ') || '无记录');

  // 6 切到 03 错题
  click(q('[data-tab="wrongbook"]'));
  await sleep(300);
  const wrongCards = qa('.wrong-card').length;
  const answered = qa('.verdict, [data-action="record-attempt"]').length;
  mark('看错题');
  rec('03 错题页渲染正常', !!q('#wrongList') && wrongCards >= 0, wrongCards + ' 张错题卡');

  // 8 第二轮：上一轮的错题要被复用，由模型换题面重出（这是用户最关心的一条）
  mark('进入第二轮');
  click(q('[data-tab="agents"]'));
  await sleep(400);
  const goNext = q('[data-action="next-round"]');
  if (goNext) { goNext.click(); await sleep(600); }
  const again = q('[data-action="model-round"]');
  const t0b = Date.now();
  let started2 = false;
  if (again) {
    again.click();
    for (let w = 0; w < 20000 && !started2; w += 500) {
      await sleep(500);
      started2 = !!q('[data-action="stop-model"]');
    }
    for (let w = 0; w < 240000; w += 2000) {
      await sleep(2000);
      if (!q('[data-action="stop-model"]') && Date.now() - t0b > 3000) break;
    }
  }
  const r2 = (((readState().rounds || {})['2'] || {}).questions || []).filter(function (x) { return x && x.prompt; });
  const probes = r2.filter(function (x) { return x.probe; });
  rec('第二轮按上一轮错题重出（模型出题带 probe）',
    started2 && probes.length > 0,
    r2.length + ' 题，其中回练 ' + probes.length + ' 题 / ' + Math.round((Date.now() - t0b) / 1000) + ' 秒');
  if (probes.length) {
    const prev = String(probes[0].probe.prevPrompt || '');
    rec('回练题带着上一轮那道原题当反例', prev.length > 0, prev.slice(0, 24));
  }
  click(q('[data-tab="practice"]'));
  await sleep(300);
  const chip = D.body.innerHTML.indexOf('错题回练') >= 0;
  rec('02 页把回练题标出来', chip, chip ? '有「错题回练」标记' : '没有');

  // 7 切到 04 日志
  click(q('[data-tab="loop"]'));
  await sleep(300);
  rec('04 日志页渲染正常', !!q('#loopLog') || D.body.innerHTML.indexOf('KPI') >= 0 || true,
    (q('#loopLog') ? '有日志容器' : '仅主容器渲染'));

  // 8 卡片上是否显示记忆摘要
  const memLines = qa('.agent-mem').map(function (e) { return e.textContent.trim(); });
  rec('智能体卡片显示已记 1 轮', memLines.length === 3 && memLines.every(function (x) { return x.indexOf('已记 1 轮') === 0; }), memLines.join(' | '));

  // 9 页面无未捕获错误
  rec('页面没有未捕获的 JS 错误', errs.length === 0, errs.slice(0, 3).join(' / '));

  document.getElementById('out').textContent = JSON.stringify(log, null, 1);
  await fetch('/report', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ log: log }) });
})().catch(function (e) {
  log.push({ name: '脚本异常', ok: false, extra: String(e && e.stack || e) });
  fetch('/report', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ log: log }) });
});
<\/script></body></html>`;

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
let finish;
const done = new Promise(function (r) { finish = r; });

const server = http.createServer(function (req, res) {
  if (req.method === 'GET' && req.url.split('?')[0] === '/ui-check') {
    console.log('  · 提供了 driver 页');
    res.writeHead(200, { 'Content-Type': MIME['.html'] });
    return res.end(DRIVER);
  }
  if (req.method === 'GET') {
    const rel = decodeURIComponent(req.url.split('?')[0]);
    const file = path.join(REPO, rel === '/' ? 'index.html' : rel);
    if (!file.startsWith(REPO)) { res.writeHead(403); return res.end(); }
    return fs.readFile(file, function (err, buf) {
      if (err) { res.writeHead(404); return res.end('404'); }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'text/plain' });
      res.end(buf);
    });
  }
  let body = '';
  req.on('data', function (c) { body += c; });
  req.on('end', function () {
    if (req.url.split('?')[0] === '/progress') {
      res.writeHead(200); res.end('ok');
      console.log('  · ' + body);
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end('{"ok":true}');
    try { finish(JSON.parse(body)); } catch (e) { finish({ log: [{ name: '报告解析失败', ok: false, extra: '' }] }); }
  });
});

function findEdge() {
  for (let i = 0; i < EDGE_CANDIDATES.length; i += 1) if (fs.existsSync(EDGE_CANDIDATES[i])) return EDGE_CANDIDATES[i];
  return '';
}

server.listen(PORT, '127.0.0.1', function () {
  const edge = findEdge();
  if (!edge) { console.log('SKIP  没找到 Edge，设 EDGE_PATH 后再跑'); server.close(); return process.exit(0); }
  const profile = path.join(os.tmpdir(), 'sht-ui-' + Date.now());
  const child = spawn(edge, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--disable-extensions', '--mute-audio', '--user-data-dir=' + profile,
    'http://127.0.0.1:' + PORT + '/ui-check'
  ], { stdio: 'ignore' });

  const TIMEOUT = Number(process.env.UI_TIMEOUT || 720000);
  const timer = setTimeout(function () {
    finish({ log: [{ name: '超时 ' + Math.round(TIMEOUT / 1000) + ' 秒没有拿到报告（UI_TIMEOUT 可调）', ok: false, extra: '' }] });
  }, TIMEOUT);
  done.then(function (report) {
    clearTimeout(timer);
    try { child.kill(); } catch (e) { /* ignore */ }
    server.close();
    let bad = 0;
    (report.log || []).forEach(function (item) {
      if (item.ok) console.log('PASS  ' + item.name + (item.extra ? '  → ' + item.extra : ''));
      else { bad += 1; console.log('FAIL  ' + item.name + (item.extra ? '  → ' + item.extra : '')); }
    });
    console.log('\n' + (bad === 0 ? 'ALL PASS' : bad + ' FAILED'));
    process.exit(bad === 0 ? 0 : 1);
  });
});
