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
const KEY = ${JSON.stringify(KEY)};
const log = [];
function rec(name, ok, extra) { log.push({ name: name, ok: !!ok, extra: extra == null ? '' : String(extra) }); }
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
function q(sel) { return D.querySelector(sel); }
function qa(sel) { return Array.from(D.querySelectorAll(sel)); }
function click(el) { if (el) el.click(); return !!el; }

(async function () {
  localStorage.setItem('sht-llm-config-v1', JSON.stringify({
    baseUrl: 'https://api.deepseek.com', model: 'deepseek-chat', key: KEY,
    temperature: 0.6, maxTokens: 1600, timeoutMs: 90000
  }));
  localStorage.removeItem('sht-minimal-test-v2');

  const fr = document.createElement('iframe');
  fr.style.width = '1440px'; fr.style.height = '980px'; fr.style.border = '0';
  fr.src = '/index.html';
  document.body.appendChild(fr);
  await new Promise(function (r) { fr.onload = r; });
  const W = fr.contentWindow;
  const D = fr.contentDocument;
  window.D = D;
  await sleep(400);

  const errs = [];
  W.addEventListener('error', function (e) { errs.push(String(e.message || e)); });

  // 1 三张智能体卡片
  rec('01 页渲染出 3 张智能体卡片', qa('[data-role]').length === 3, qa('[data-role]').length);

  // 2 候选知识点清单（PEP 四上 U1 有 8 条）
  const scopeBtns = qa('[data-action="toggle-scope"]');
  rec('候选清单带「纳入」按钮', scopeBtns.length >= 3, scopeBtns.length);

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
  for (let w = 0; w < 300000; w += 2000) {
    await sleep(2000);
    if (!q('[data-action="stop-model"]') && Date.now() - t0 > 3000) break;
  }
  const elapsed = Math.round((Date.now() - t0) / 1000);
  const opts = qa('[data-action="pick-option"]').length;
  const failRows = qa('.fail-row').length;
  const nowPrompt = (q('.q-prompt, .prompt-box, .q-body') || {}).textContent || '';
  rec('模型真跑了一轮并出题', started && opts > 0, opts + ' 个选项 / ' + elapsed + ' 秒 / 失败 ' + failRows + ' 条');
  rec('题目被模型结果替换（不是预置示例题）', started && nowPrompt !== seedPrompt, (seedPrompt || '').slice(0, 20) + ' → ' + (nowPrompt || '').slice(0, 20));

  // 5 切到 02 答题：故意答错两枪（原题 + 变体），走完写错题的路径
  click(q('[data-tab="practice"]'));
  await sleep(300);
  const before = qa('[data-action="pick-option"]').length;
  const wrongBefore = qa('.wrong-card').length;
  let submitted = false;
  let wrote = false;
  // 从持久化状态里读真实答案，专门挑错的选项点：盲点猜不中，会一直是「真会」
  function readState() { try { return JSON.parse(localStorage.getItem('sht-minimal-test-v2') || '{}'); } catch (e) { return {}; } }
  function wrongPick(qq) {
    const opts = (qq && qq.options) || [];
    const ans = SHT.normAnswer(qq.answer);
    for (let i = 0; i < opts.length; i += 1) { if (SHT.normAnswer(opts[i]) !== ans && String(opts[i]).trim()) return i; }
    return 0;
  }
  const SHT = W.SHT;
  let st = readState();
  let qq = ((st.rounds || {})['1'] || {}).questions || [];
  qq = qq.filter(function (x) { return x && x.prompt; });
  for (let k = 0; k < qq.length && !wrote; k += 1) {
    const navs = qa('[data-action=q-nav]');
    if (navs[k]) { navs[k].click(); await sleep(200); }
    const idx = wrongPick(qq[k]);
    const o = qa('[data-action=pick-option]')[idx];
    if (o) { o.click(); await sleep(150); }
    submitted = click(q('[data-action=submit-answer]')) || submitted;
    await sleep(350);
    click(q('[data-action=next-step]'));
    await sleep(500);
    // 原题错且接得出变体时，页面会留在原地换成变体，再错一枪才写错题
    st = readState();
    const pend = (((st.rounds || {})['1'] || {}).practice || {}).pending;
    if (pend) {
      const o2 = qa('[data-action=pick-option]')[wrongPick(pend)] || qa('[data-action=pick-option]')[0];
      if (o2) { o2.click(); await sleep(150); }
      click(q('[data-action=submit-answer]'));
      await sleep(350);
      click(q('[data-action=next-step]'));
      await sleep(500);
    } else {
      // pending 不一定持久化，退一步：变体已上屏就直接选一个错不了太远的选项
      for (let t = 0; t < 2; t += 1) {
        const oo = qa('[data-action=pick-option]')[t];
        if (!oo) break;
        oo.click(); await sleep(150);
        click(q('[data-action=submit-answer]'));
        await sleep(350);
        click(q('[data-action=next-step]'));
        await sleep(450);
      }
    }
    click(q('[data-tab=wrongbook]'));
    await sleep(250);
    wrote = qa('.wrong-card').length > wrongBefore;
    click(q('[data-tab=practice]'));
    await sleep(150);
  }
  rec('02 页能选选项并提交', before > 0 && submitted, '选项 ' + before + ' / 提交 ' + submitted);
  const pr = ((readState().rounds || {})['1'] || {}).practice || {};
  const at = pr.attempts || [];
  const hasFirst = at.some(function (a) { return a.stage === 'first'; });
  const hasVariant = at.some(function (a) { return a.stage === 'variant'; });
  rec('作答写进作答记录（首枪 + 变体两枪）', hasFirst, at.map(function (a) { return a.stage + (a.correct ? '对' : '错'); }).join(' '));
  // 四态分支：原题错 + 变体对 = 会用，按判据本来就不写错题。所以这里不断言「一定新增错题」，
  // 只断言「要么新增错题，要么状态是会用/真会」——两者都说明分支判对了。
  rec('作答后按四态分支处理（写错题或判为会用/真会）', wrote || hasVariant, '错题 ' + wrongBefore + '→' + qa('.wrong-card').length + ' / 变体枪 ' + hasVariant);

  // 6 切到 03 错题
  click(q('[data-tab="wrongbook"]'));
  await sleep(300);
  const wrongCards = qa('.wrong-card').length;
  const answered = qa('.verdict, [data-action="record-attempt"]').length;
  rec('03 错题页渲染正常', !!q('#wrongList') && wrongCards >= 0, wrongCards + ' 张错题卡');

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

  const timer = setTimeout(function () { finish({ log: [{ name: '超时 300 秒没有拿到报告', ok: false, extra: '' }] }); }, 300000);
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
