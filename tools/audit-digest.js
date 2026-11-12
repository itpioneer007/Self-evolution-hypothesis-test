#!/usr/bin/env node
/*
 * 审计导出摘要：node tools/audit-digest.js <审计json>
 *
 * 为什么要有这个脚本：导出的 JSON 是给程序读的，字段多、层级深，
 * 验收现场翻原文很难在几十秒内说清「错题怎么被复用的」。
 * 这里把一份导出压成一页人话，重点标出复用的三处落点：
 *   第一轮答错的那道题  →  错题本里那条  →  第二轮哪道题挂着它（parentQid）
 *
 * 兼容老文件：早期导出不含 prevRound / wrongCases，脚本会明说「无法核对」，
 * 而不是假装复用率是 0%——那会把「文件缺字段」误报成「系统没复用」。
 */
const fs = require('fs');

const file = process.argv[2];
if (!file) {
  console.log('用法：node tools/audit-digest.js <audit-xxx.json>');
  process.exit(1);
}
const j = JSON.parse(fs.readFileSync(file, 'utf8'));
const line = (s) => console.log(s || '');
const hr = (t) => { line(''); line('===== ' + t + ' ====='); };
const shortKp = (k) => String(k || '').replace(/^(\w+) · /, '$1 · ').slice(0, 46);

function fmtTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  const p = (n) => (n < 10 ? '0' + n : n);
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
}

/* ---------- 1 概况 ---------- */
hr('一 这份文件是什么');
line('导出时间　' + fmtTime(j.exportedAt));
line('学生　　　' + (j.student || '(未记)'));
line('教材单元　' + (j.book || '') + ' / ' + (j.unit || ''));
line('轮次　　　' + (j.round || '?') + (j.prevRound ? '（文件里同时带着第 ' + j.prevRound.round + ' 轮）' : '（文件里只有这一轮）'));
const qs = j.questions || [];
const wrongNow = (j.attempts || []).filter((a) => a.correct === false);
line('本轮题目　' + qs.length + ' 道，已作答 ' + (j.attempts || []).length + ' 道，答错 ' + wrongNow.length + ' 道');
line('出题失败　' + (j.failures || []).length + ' 条（验证/代码闸拦下的，不是学生错题）');
line('模型留痕　' + (j.traces || []).length + ' 条调用');

/* ---------- 2 上一轮 ---------- */
hr('二 第一轮发生了什么（复用的源头）');
const prev = j.prevRound;
let prevWrong = [];
if (!prev) {
  line('这份导出里没有上一轮数据。');
  line('→ 如果这份文件自称是第 2 轮，那它没法证明「第二轮用了第一轮的东西」；');
  line('  要么第一轮还没跑过，要么导出工具只导了当前轮（老版本就是这样）。');
} else {
  const pa = prev.attempts || [];
  prevWrong = pa.filter((a) => a.correct === false);
  line('第 ' + prev.round + ' 轮：' + (prev.questions || []).length + ' 道题，作答 ' + pa.length + ' 道，答错 ' + prevWrong.length + ' 道');
  if (!prevWrong.length) line('这一轮没有答错，所以下一轮没有错题可复用——这是正常的，不是 bug。');
  prevWrong.forEach((a, i) => {
    const q = (prev.questions || []).filter((x) => x.no === a.no)[0] || {};
    line('  错 ' + (i + 1) + ') 第 ' + a.no + ' 题　' + shortKp(a.kpLabel || q.knowledgePoint));
    line('        他选「' + a.picked + '」　正确「' + a.expected + '」　题号 qid=' + (q.qid || '(无)'));
    if (a.diag && a.diag.headline) line('        诊断：' + a.diag.headline);
  });
}

/* ---------- 3 错题本 ---------- */
hr('三 错题本（复用的凭据）');
const wc = j.wrongCases;
if (!Array.isArray(wc)) {
  line('这份导出不含错题本。');
  line('→ 错题本是「复用」这件事唯一的落账处：没有它，只能看到第二轮出题，看不到依据。');
} else if (!wc.length) {
  line('错题本是空的。');
} else {
  wc.forEach((c, i) => {
    line((i + 1) + ') ' + shortKp(c.knowledgePoint) + '　[' + (c.masteryState || '') + ']');
    line('   作答「' + (c.studentAnswer || '') + '」　正确「' + (c.correctAnswer || '') + '」　错因：' + (c.category || '未定'));
    line('   原题 qid=' + (c.originalQuestionId || '(无)') + '　回练 ' + ((c.variantAttempts || []).length) + ' 次　错 ' + (c.remediationLoopCount || 0) + ' 轮');
  });
}

/* ---------- 4 本轮计划 ---------- */
hr('四 第二轮怎么排的（每条计划的来由）');
const matchText = { exact: '逐字命中', contain: '包含命中', near: '近似命中（词面重合，建议人工确认）' };
(j.plans || []).forEach((p) => {
  const tag = p.probe ? ('复用错题 · 上轮错 ' + (p.probe.missCount || 1) + ' 次') : '新考点';
  line('P' + p.no + '　[' + tag + ']　' + shortKp(p.kp));
  line('      题型/层次/干扰：' + (p.cell ? p.cell.type + ' / ' + p.cell.level + ' / ' + p.cell.distractor : '(未分格)'));
  line('      为什么排它：' + (p.whyThisOne || '(模型没写理由)'));
  if (p.probe && p.probe.parentQid) line('      挂在第一轮的原题：' + p.probe.parentQid);
  if (p.probe && p.probe.match) line('      挂接方式：' + (matchText[p.probe.match] || p.probe.match));
});

/* ---------- 5 复用核对 ---------- */
hr('五 复用核对：第二轮哪道题是从第一轮错题长出来的');
let hit = 0;
const rows = [];
(qs || []).forEach((q) => {
  const parent = q.parentQid || (q.probe && q.probe.parentQid) || '';
  const src = parent && prev ? (prev.questions || []).filter((x) => x.qid === parent)[0] : null;
  const srcAttempt = src && prev ? (prev.attempts || []).filter((a) => a.no === src.no && a.correct === false)[0] : null;
  if (parent) hit += 1;
  rows.push({ q, parent, src, srcAttempt });
});
rows.forEach((r) => {
  const head = 'Q' + r.q.no + '　' + shortKp(r.q.knowledgePoint);
  if (!r.parent) {
    line(head + '　→ 新题，没有挂接到任何历史错题');
    return;
  }
  line(head + '　→ 挂接 parentQid=' + r.parent);
  if (r.src) {
    line('    源题：第一轮第 ' + r.src.no + ' 题「' + String(r.src.prompt || '').slice(0, 30) + '…」');
    if (r.srcAttempt) line('    源作答：他选「' + r.srcAttempt.picked + '」，正确「' + r.srcAttempt.expected + '」');
    line('    本轮换面：' + String(r.q.prompt || '').slice(0, 40));
  } else {
    line('    但上一轮里找不到 qid=' + r.parent + ' 的那道题（文件缺上一轮数据，无法核对）');
  }
});

/* ---------- 6 结论 ---------- */
hr('六 可以说出口的结论');
const canProve = !!(prev && Array.isArray(wc));
line('本轮 ' + qs.length + ' 道题里，' + hit + ' 道挂接到历史错题（parentQid 非空）。');
if (hit > 0 && canProve) {
  line('复用链路完整：第一轮答错 → 错题本落账 → 本轮计划标 probe → 本题 parentQid 指回原题。');
  line('这条链可以当场逐条点开给老师看。');
} else if (hit > 0) {
  line('有 parentQid，但文件缺上一轮或错题本，链条只能证明一半。');
} else if (!prev) {
  line('这份文件证明不了复用：本轮 ' + qs.length + ' 道题的 parentQid 全空，而上一轮数据不在文件里。');
  line('两种可能：(1) 第一轮全答对，没有错题可复用；(2) 导出工具只导了当前轮。');
  line('要区分这两者，重新导出一次（新版本会带 prevRound 与 wrongCases）。');
} else if (!prevWrong.length && Array.isArray(wc) && !wc.length) {
  line('第一轮没有答错，错题本为空——所以本轮 0 复用是符合预期的。');
  line('要演示复用，需要先在第一轮故意答错一两道，再进第二轮。');
} else {
  line('第一轮有错题，但本轮一道都没复用——这才是需要修的问题。');
}
line('');
