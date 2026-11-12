/*
 * 审计台（开发者界面）的渲染与交互
 *
 * 这里只做两件事：把 SHT.audit 算出来的结论画成人能一眼看懂的版式，
 * 以及接三个动作（导出 JSON / 刷新重算 / 拦截演练）。
 * 判断一律不写在这里——达标与否由 core/audit.js 算，界面只负责显示与解释。
 *
 * 为什么单独一个页签而不是另开一个页面：状态存在 localStorage 里，
 * 用 file:// 打开时独立页面拿到的可能是另一个存储域，数据会「凭空变空」。
 * 同一个页面里加页签，数据一定对得上。
 *
 * 为什么深色而不跟其它页签统一：这一页是给评审逐行看证据的，
 * 深底 + 等宽小字 + 状态色，比浅底更适合长时间读表。作用域全部收在
 * .audit-root 内，不影响学生端。
 */
(function (root) {
  const SHT = (root.SHT = root.SHT || {});

  /* ---------- 小工具 ---------- */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  function pct(a, b) { return b ? Math.round((a / b) * 100) : null; }
  function timeOf(iso) {
    const d = iso ? new Date(iso) : null;
    if (!d || isNaN(d.getTime())) return '--:--:--';
    const p = function (n) { return (n < 10 ? '0' : '') + n; };
    return p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
  }
  function n1(v) { return v == null ? '—' : (Math.round(v * 10) / 10).toFixed(1); }

  // 四种状态：达标 / 未达标 / 待验（差一层数据）/ 无数据
  const STATE_TEXT = { pass: '达标', fail: '未达标', wait: '待验', nodata: '无数据' };
  function stateOf(ok, hasData) {
    if (!hasData) return 'nodata';
    if (ok === null || ok === undefined) return 'wait';
    return ok ? 'pass' : 'fail';
  }

  /* ---------- 卡片 ---------- */
  function card(opt) {
    const st = opt.state;
    const ev = (opt.evidence || []).map(function (e) {
      return '<div class="audit-ev' + (e.gap ? ' is-gap' : '') + '"><dt>' + esc(e.k) + '</dt><dd>' + esc(e.v) + '</dd></div>';
    }).join('');
    const more = opt.href
      ? '<a class="audit-more" href="' + esc(opt.href) + '">' + esc(opt.more || '看证据 ↓') + '</a>'
      : '<span class="audit-more is-flat">' + esc(opt.more || '') + '</span>';
    return '' +
      '<section class="audit-card" id="' + esc(opt.id) + '" data-state="' + st + '">' +
        '<div class="audit-card-head">' +
          '<span class="audit-no">' + esc(opt.no) + '</span>' +
          '<h3 class="audit-card-title">' + esc(opt.title) + '</h3>' +
          '<span class="audit-badge" data-state="' + st + '">' + STATE_TEXT[st] + '</span>' +
        '</div>' +
        '<p class="audit-conclusion">' + esc(opt.conclusion) + '</p>' +
        '<dl class="audit-evidence">' + ev + '</dl>' +
        more +
      '</section>';
  }

  /* ---------- ① 变体逐条对照 ---------- */
  function variantBlock(m) {
    const v = m.variant;
    if (!v.total) {
      return block('audit-variant-detail', '① 变体质量 · 逐条对照',
        '还没有变体题。第一轮答错、第二轮重出之后，这里会出现对照。',
        '<p class="audit-empty">第二轮还没出题，或者出的题没挂上第一轮的错题。去 01 出题页跑完两轮再看。</p>');
    }
    const rows = v.rows.map(function (r, i) {
      const bad = r.missingParent || !r.answerChanged || !r.sameKp || r.fake;
      const chip = function (ok, textBad, textOk) {
        return '<span class="audit-chip" data-tone="' + (ok ? 'ok' : 'bad') + '">' + (ok ? textOk : textBad) + '</span>';
      };
      return '' +
        '<tr class="audit-row" data-state="' + (bad ? 'bad' : 'ok') + '" tabindex="0" aria-expanded="false">' +
          '<td class="audit-num">' + (i + 1 < 10 ? '0' : '') + (i + 1) + '</td>' +
          '<td class="audit-kp" title="' + esc(r.kp) + '">' + esc(r.kp || '（没写考点）') + '</td>' +
          '<td class="audit-num audit-col-qid">' + esc((r.parentQid || '—').slice(0, 8)) + '</td>' +
          '<td class="audit-num audit-col-qid">' + esc((r.childQid || '—').slice(0, 8)) + '</td>' +
          '<td class="audit-clip audit-col-answer">' + esc(r.parentAnswer || '—') + '</td>' +
          '<td class="audit-clip audit-col-answer">' + esc(r.childAnswer || '—') + '</td>' +
          '<td>' + chip(r.answerChanged, '没换', '换了') + '</td>' +
          '<td>' + chip(r.sameKp, '不同', '同') + '</td>' +
          '<td>' + chip(!r.fake, '伪', '真') + '</td>' +
        '</tr>' +
        '<tr class="audit-row-detail" hidden><td colspan="9">' +
          '<div class="audit-diff">' +
            '<p class="audit-diff-line"><span class="audit-diff-tag">第一轮</span>' + esc(r.parentPrompt || '（找不到上一轮那道题）') + '</p>' +
            '<p class="audit-diff-line"><span class="audit-diff-tag">第二轮</span>' + esc(r.childPrompt || '（没写题干）') + '</p>' +
            (r.missingParent ? '<p class="audit-diff-line is-warn">这一行指向的上一轮题目不存在，挂错了来源。</p>' : '') +
            (r.fake ? '<p class="audit-diff-line is-warn">骨架与上一轮完全相同：只换了人名地名，句子结构没动。</p>' : '') +
          '</div>' +
        '</td></tr>';
    }).join('');
    return '' +
      '<section class="audit-block" id="audit-variant-detail">' +
        '<div class="audit-block-head">' +
          '<h3>① 变体质量 · 逐条对照</h3>' +
          '<span class="audit-block-note">' + v.total + ' 道变体 · 点一行展开两版原文</span>' +
        '</div>' +
        '<table class="audit-table">' +
          '<caption class="audit-sr">第二轮变体与第一轮原题逐条对照</caption>' +
          '<thead><tr><th>#</th><th>考点</th><th class="audit-col-qid">上一轮</th><th class="audit-col-qid">这一轮</th><th class="audit-col-answer">原答案</th><th class="audit-col-answer">新答案</th><th>答案换</th><th>考点同</th><th>伪变体</th></tr></thead>' +
          '<tbody>' + rows + '</tbody>' +
        '</table>' +
      '</section>';
  }

  function block(id, title, note, body) {
    return '' +
      '<section class="audit-block" id="' + esc(id) + '">' +
        '<div class="audit-block-head"><h3>' + esc(title) + '</h3>' +
        (note ? '<span class="audit-block-note">' + esc(note) + '</span>' : '') + '</div>' +
        '<div class="audit-block-body">' + body + '</div>' +
      '</section>';
  }

  function fold(id, title, note, body, open) {
    return '' +
      '<section class="audit-block" id="' + esc(id) + '">' +
        '<details class="audit-fold"' + (open ? ' open' : '') + '>' +
          '<summary class="audit-block-head"><h3>' + esc(title) + '</h3>' +
          (note ? '<span class="audit-block-note">' + esc(note) + '</span>' : '') + '</summary>' +
          '<div class="audit-block-body">' + body + '</div>' +
        '</details>' +
      '</section>';
  }

  function lines(list) {
    if (!list.length) return '<p class="audit-empty">没有可列的记录。</p>';
    return '<ul class="audit-lines">' + list.join('') + '</ul>';
  }
  function line(time, main, note, st) {
    return '<li class="audit-line" data-state="' + (st || 'ok') + '">' +
      '<span class="audit-line-time">' + esc(time) + '</span>' +
      '<span class="audit-line-main">' + esc(main) + '</span>' +
      '<span class="audit-line-note">' + esc(note) + '</span></li>';
  }

  /* ---------- ② 信息隔离 ---------- */
  function isolationBlock(m) {
    const s = m.isolation;
    if (!s.calls) {
      return fold('audit-isolation', '② 信息隔离 · 验证角色看到了什么', '还没调过验证角色',
        '<p class="audit-empty">这一轮还没跑过验证角色。跑一次出题，验证角色每判一道题都会在这里留一行。</p>', true);
    }
    const list = s.rows.slice(-12).reverse().map(function (t) {
      const leak = t.guard && !t.guard.ok;
      const hits = leak ? '泄漏命中：' + t.guard.hits.map(function (h) { return h.word + '@' + h.at; }).join('、') : '干净';
      return line(timeOf(t.at), '验证 · ' + (t.fields && t.fields.length ? t.fields.join(' / ') : '没认出字段') +
        ' · ' + t.line, hits, leak ? 'bad' : 'ok');
    });
    return fold('audit-isolation', '② 信息隔离 · 验证角色看到了什么',
      s.calls + ' 次调用 · 泄漏 ' + s.leaks + ' 次', lines(list), true);
  }

  /* ---------- ③ 进化机制 ---------- */
  function evolveBlock(m) {
    const e = m.evolve;
    const note = e.children ? (e.children + ' 道变体 · 焦点 ' + e.focusHit + '/' + e.focusNeed) : '还没有变体';
    if (!e.children) {
      return fold('audit-evolve', '③ 进化机制 · 谁从谁演化来', note,
        '<p class="audit-empty">第一轮答错的题还没有演化出第二轮。跑完两轮之后，这里会显示每道变体挂在哪道错题上。</p>');
    }
    const list = [];
    m.variant.rows.forEach(function (r) {
      list.push(line((r.childQid || '').slice(0, 8),
        (r.sameKp ? '同考点' : '考点变了') + ' · 从 ' + ((r.parentQid || '—').slice(0, 8)) + ' 演化来',
        r.kp + ' · 答案 ' + (r.parentAnswer || '—') + ' → ' + (r.childAnswer || '—'),
        r.missingParent || !r.sameKp ? 'bad' : 'ok'));
    });
    list.push(line('难度', 'R1 ' + (e.levelFrom.label || '—') + '（' + n1(e.levelFrom.avgLevel) + '）→ R2 ' +
      (e.levelTo.label || '—') + '（' + n1(e.levelTo.avgLevel) + '）',
      e.levelReason + ' · 实际 ' + ({ up: '升', down: '降', flat: '持平' }[e.levelActual] || '持平'),
      e.levelExpected === 'unknown' || e.levelExpected === e.levelActual ? 'ok' : 'bad'));
    list.push(line('焦点', '第一轮错最多的是「' + (e.focusKp || '—') + '」',
      '第二轮命中 ' + e.focusHit + '/' + e.focusNeed + '（' + (e.levelTo.count || 0) + ' 道题）',
      e.focusHit >= Math.min(e.focusNeed, e.levelTo.count || 0) ? 'ok' : 'bad'));
    return fold('audit-evolve', '③ 进化机制 · 谁从谁演化来', note, lines(list));
  }

  /* ---------- ④ 工程可复现 ---------- */
  function reproduceBlock(m) {
    const r = m.reproduce;
    const f = r.freeze;
    if (!r.traceCount) {
      return fold('audit-reproduce', '④ 工程可复现 · 台账与留痕', '还没有调用记录',
        '<p class="audit-empty">还没调过模型。跑一轮之后，四个角色每次调用都会留一行。</p>');
    }
    const list = [
      line('台账', f.total + ' 条 · 能离线复算 ' + f.recomputed + ' 条 · 冲突 ' + f.conflicts.length,
        f.conflicts.length ? '不一致的键：' + f.conflicts.map(function (c) { return c.qid; }).join('、')
          : '同一题同一答案重判结论一致', f.conflicts.length ? 'bad' : 'ok'),
      line('依赖模型', f.modelOnly + ' 条只能靠模型判（开放题）',
        '这些条目的冻结靠台账本身，不重复问模型', 'ok'),
      line('角色留痕', r.roles.map(function (x) { return x.name + ' ' + x.calls; }).join(' · '),
        '共 ' + r.traceCount + ' 次调用', r.roles.every(function (x) { return x.calls > 0; }) ? 'ok' : 'bad')
    ];
    if (f.missing) {
      list.push(line('缺题', f.missing + ' 条台账找不到对应题目', '题目被覆盖或换了单元，这几条无法复算', 'bad'));
    }
    return fold('audit-reproduce', '④ 工程可复现 · 台账与留痕',
      f.recomputed + ' 条复算 · ' + f.conflicts.length + ' 冲突', lines(list));
  }

  /* ---------- 时间线 ---------- */
  const ROLE_FILTERS = [
    { id: 'all', name: '全部' }, { id: 'plan', name: '课程' }, { id: 'generate', name: '生成' },
    { id: 'verify', name: '验证' }, { id: 'diagnose', name: '诊断' }
  ];

  function timelineBlock(m, ui) {
    const all = m.__traces || [];
    const role = ui.role || 'all';
    const show = ui.more ? 999 : 6;
    const rows = all.filter(function (t) { return role === 'all' || t.role === role; });
    const chips = ROLE_FILTERS.map(function (f) {
      const n = f.id === 'all' ? all.length : all.filter(function (t) { return t.role === f.id; }).length;
      return '<button type="button" class="audit-chip-btn' + (role === f.id ? ' is-active' : '') +
        '" data-action="audit-filter" data-role="' + f.id + '">' + f.name + ' ' + n + '</button>';
    }).join('');
    const items = rows.slice(-show).reverse().map(function (t) {
      const st = t.ok ? (t.codes.length ? 'fail' : 'ok') : 'bad';
      return '<li class="audit-tl" data-state="' + st + '" tabindex="0" aria-expanded="false">' +
        '<span class="audit-tl-time">' + timeOf(t.at) + '</span>' +
        '<span class="audit-tl-role" data-role="' + esc(t.role) + '">' + esc(t.roleName) + '</span>' +
        '<span class="audit-tl-line">' + esc(t.line) + '</span>' +
        '<span class="audit-tl-ms">' + (t.ms ? t.ms + 'ms' : '—') + '</span>' +
        '<span class="audit-tl-codes">' + t.codes.map(function (c) {
          return '<span class="audit-chip">' + esc(c) + '</span>';
        }).join('') + '</span>' +
        '<div class="audit-tl-detail" hidden>' + esc(t.out || '（没有返回内容）') + '</div>' +
      '</li>';
    }).join('');
    const moreBtn = rows.length > 6
      ? '<button type="button" class="audit-more-btn" data-action="audit-more-rows">' +
        (ui.more ? '收起到 6 条' : '再看 ' + Math.min(rows.length - 6, 999) + ' 条（共 ' + rows.length + '）') + '</button>'
      : '';
    return '' +
      '<section class="audit-block" id="audit-timeline">' +
        '<div class="audit-block-head"><h3>角色调用时间线</h3>' +
          '<div class="audit-chips">' + chips + '</div>' + moreBtn +
        '</div>' +
        (rows.length
          ? '<ul class="audit-timeline">' + items + '</ul>'
          : '<p class="audit-empty">这个角色这一轮还没被调用过。</p>') +
      '</section>';
  }

  /* ---------- 总览 ---------- */
  function verdictBar(m) {
    const st = { pass: 'pass', fail: 'fail', wait: 'wait', nodata: 'none' }[m.verdict] || 'none';
    const total = 4;
    const list = [m.variant, m.isolation, m.evolve, m.reproduce];
    const passed = list.filter(function (x) { return x.ok === true; }).length;
    const text = m.verdict === 'pass' ? '达标 · ' + passed + '/' + total
      : m.verdict === 'fail'
        ? (m.scoredCount < total
          ? '已跑 ' + m.scoredCount + '/' + total + ' · ' +
            list.filter(function (x) { return x.ok === false; }).length + ' 项未达标'
          : '未达标 · ' + passed + '/' + total)
        : '还没跑够 · ' + passed + '/' + total;
    const names = ['变体质量', '信息隔离', '进化机制', '工程可复现'];
    const failed = list.filter(function (x) { return x.ok === false; });
    const sub = m.verdict === 'pass'
      ? '四项达标线都过了，可以拿去复核'
      : m.verdict === 'fail'
        ? failed.map(function (x) { return names[list.indexOf(x)]; }).join('、') + '没过，依据在下面'
        : (m.scoredCount ? '已判 ' + m.scoredCount + ' 项，其余等两轮跑完' :
          '跑两轮之后这里才有可判的东西：一轮出题 + 作答，再出第二轮');
    // 四指标迷你徽章：给评审 3 秒扫「哪一项没过」，比逐张看卡快
    const vbadges = list.map(function (x, i) {
      const s = x.ok === true ? 'pass' : (x.ok === false ? 'fail' : 'none');
      return '<span class="audit-vbadge" data-state="' + s + '">' + names[i] +
        ' ' + (s === 'pass' ? '达标' : (s === 'fail' ? '未达标' : '无数据')) + '</span>';
    }).join('');
    return '' +
      '<section class="audit-top">' +
        '<div class="audit-verdict" data-state="' + st + '">' +
          '<span class="audit-verdict-text">' + esc(text) + '</span>' +
          '<span class="audit-verdict-sub">' + esc(sub) + '</span>' +
        '</div>' +
        '<span class="audit-vbadges">' + vbadges + '</span>' +
        '<div class="audit-tools">' +
          '<button type="button" class="audit-btn is-primary" data-action="audit-export">导出 JSON</button>' +
          '<button type="button" class="audit-btn" data-action="audit-refresh">刷新重算</button>' +
          '<button type="button" class="audit-btn is-danger" data-action="audit-drill">跑一次拦截演练</button>' +
        '</div>' +
        '<p class="audit-live" aria-live="polite"' + (ui.live ? '' : ' hidden') + '>' + esc(ui.live) + '</p>' +
      '</section>';
  }

  /* ---------- 渲染 ---------- */
  const ui = { role: 'all', more: false, live: '', bus: false };

  function render() {
    const el = root.document && root.document.getElementById('auditRoot');
    if (!el) return;
    const state = (SHT.devAudit.state && SHT.devAudit.state()) || {};
    const m = SHT.audit.metrics(state);
    m.__traces = state.traces || [];

    const nc = function (v) { return v === null || v === undefined; };
    const v = m.variant; const iso = m.isolation; const ev = m.evolve; const rp = m.reproduce;

    const cards = [
      card({
        id: 'audit-variant', no: '①', title: '变体质量',
        state: stateOf(v.ok, v.total > 0 || v.drills > 0),
        conclusion: v.total
          ? (v.total + ' 道变体 · 答案换 ' + v.answerChanged + '/' + v.total +
             ' · 伪变体 ' + v.fake + '/' + v.total + '（' + (nc(v.fakeRate) ? '—' : pct(v.fake, v.total)) + '%）')
          : (v.drills ? '还没变体 · 拦截演练 ' + v.drilled + '/' + v.drills : '还没有变体题'),
        evidence: [
          { k: '考点必同', v: v.total ? v.sameKp + '/' + v.total : '—' },
          { k: '拦截演练', v: v.drills ? v.drilled + '/' + v.drills + ' 拦住' : '还没跑' },
          { k: '缺来源', v: v.orphan ? v.orphan + ' 道没挂 parent' : (v.total ? '0 道' : '—'), gap: v.orphan > 0 }
        ],
        href: '#audit-variant-detail', more: v.total ? '看证据 ↓ ' + v.total + ' 行' : '看说明 ↓'
      }),
      card({
        id: 'audit-isolation', no: '②', title: '信息隔离',
        state: stateOf(iso.ok, iso.calls > 0),
        conclusion: iso.calls ? (iso.calls + ' 次验证 · 泄漏 ' + iso.leaks + ' 次') : '还没调过验证角色',
        evidence: [
          { k: '看到字段', v: iso.fields.length ? iso.fields.join(' / ') : '—' },
          { k: '命中词', v: iso.hitWords.length ? iso.hitWords.join('、') : '无' },
          { k: '说明', v: iso.calls ? '验证只看题目本身，不碰学情' : '跑一次出题才有记录' }
        ],
        href: '#audit-isolation', more: '看每次调用的字段'
      }),
      card({
        id: 'audit-evolve', no: '③', title: '进化机制',
        state: stateOf(ev.ok, ev.children > 0),
        conclusion: ev.children
          ? (ev.children + ' 道挂了来源 · 焦点 ' + ev.focusHit + '/' + ev.focusNeed + ' · 难度' +
             (ev.levelExpected === 'unknown' ? '待作答' : (ev.levelActual === ev.levelExpected ? '跟着走' : '没跟上')))
          : '第二轮还没有从错题演化出题',
        evidence: [
          { k: '挂上来源', v: ev.children ? ev.withParent + '/' + ev.children : '—' },
          { k: '焦点考点', v: ev.focusKp || '第一轮还没有错题' },
          { k: '难度档', v: ev.children ? 'R1 ' + (ev.levelFrom.label || '—') + ' → R2 ' + (ev.levelTo.label || '—') : '—' },
        ],
        href: '#audit-evolve', more: '看演化链'
      }),
      card({
        id: 'audit-reproduce', no: '④', title: '工程可复现',
        state: stateOf(rp.ok, rp.traceCount > 0),
        conclusion: rp.traceCount
          ? (rp.freeze.recomputed + ' 条复算 · 冲突 ' + rp.freeze.conflicts.length +
             ' · 四角色 ' + rp.roles.filter(function (x) { return x.calls > 0; }).length + '/4')
          : '还没有调用记录',
        evidence: [
          { k: '判分台账', v: rp.freeze.total + ' 条（能复算 ' + rp.freeze.recomputed + '）' },
          { k: '结论一致', v: rp.traceCount ? (rp.freeze.conflicts.length ? '不一致 ' + rp.freeze.conflicts.length + ' 条' : '100% 一致') : '—' },
          { k: '依赖模型', v: rp.freeze.modelOnly + ' 条（开放题）' },
        ],
        href: '#audit-reproduce', more: '看台账与留痕'
      })
    ].join('');

    el.innerHTML =
      verdictBar(m) +
      '<div class="audit-grid">' + cards + '</div>' +
      variantBlock(m) +
      isolationBlock(m) +
      evolveBlock(m) +
      reproduceBlock(m) +
      timelineBlock(m, ui);
    el.setAttribute('data-verdict', m.verdict);
    return m;
  }

  function gapOf(v) {
    const gap = [];
    if (v.answerChanged !== v.total) gap.push((v.total - v.answerChanged) + ' 道复用原答案');
    if (v.sameKp !== v.total) gap.push((v.total - v.sameKp) + ' 道考点变了');
    if (v.fakeRate != null && v.fakeRate > 0.2) gap.push('伪变体 ' + Math.round(v.fakeRate * 100) + '% 超 20%');
    if (v.drills && v.drilled !== v.drills) gap.push('有坏题没拦住');
    return gap.join('，') || '—';
  }
  function gapOfEvolve(e) {
    const gap = [];
    if (e.withParent !== e.children) gap.push((e.children - e.withParent) + ' 道没挂来源');
    if (e.focusHit < e.focusNeed) gap.push('焦点只中 ' + e.focusHit + '/' + e.focusNeed);
    if (e.levelExpected !== 'unknown' && e.levelActual !== e.levelExpected) gap.push('难度没跟上作答');
    return gap.join('，') || '—';
  }
  function gapOfReproduce(r) {
    const gap = [];
    if (r.freeze.conflicts.length) gap.push(r.freeze.conflicts.length + ' 条重判结论不一致');
    const missingRoles = r.roles.filter(function (x) { return !x.calls; }).map(function (x) { return x.name; });
    if (missingRoles.length) gap.push('缺留痕：' + missingRoles.join('、'));
    return gap.join('，') || '—';
  }

  /* ---------- 动作 ---------- */
  function exportPayload() {
    const state = (SHT.devAudit.state && SHT.devAudit.state()) || {};
    const m = SHT.audit.metrics(state);
    // 导出要能独立复核：结论 + 逐条证据 + 四角色留痕 + 台账，一个都不少。
    // 不含 API Key（在另一个 localStorage 项里，这里根本读不到）。
    return {
      exportedAt: new Date().toISOString(),
      student: SHT.sampleStudent && SHT.sampleStudent.id,
      book: SHT.curriculum.bookName,
      unit: SHT.curriculum.hostUnitId,
      verdict: m.verdict,
      metrics: {
        variant: {
          total: m.variant.total, answerChanged: m.variant.answerChanged, sameKp: m.variant.sameKp,
          fake: m.variant.fake, fakeRate: m.variant.fakeRate, orphan: m.variant.orphan,
          drills: m.variant.drills, drilled: m.variant.drilled, ok: m.variant.ok
        },
        isolation: {
          calls: m.isolation.calls, leaks: m.isolation.leaks, hitWords: m.isolation.hitWords,
          fields: m.isolation.fields, ok: m.isolation.ok
        },
        evolve: {
          children: m.evolve.children, withParent: m.evolve.withParent, focusKp: m.evolve.focusKp,
          focusHit: m.evolve.focusHit, focusNeed: m.evolve.focusNeed,
          levelFrom: m.evolve.levelFrom, levelTo: m.evolve.levelTo,
          levelExpected: m.evolve.levelExpected, levelActual: m.evolve.levelActual, ok: m.evolve.ok
        },
        reproduce: {
          freeze: {
            total: m.reproduce.freeze.total, recomputed: m.reproduce.freeze.recomputed,
            modelOnly: m.reproduce.freeze.modelOnly, missing: m.reproduce.freeze.missing,
            conflicts: m.reproduce.freeze.conflicts
          },
          roles: m.reproduce.roles, ok: m.reproduce.ok
        }
      },
      // 逐条证据：变体对照、隔离命中、台账明细
      variantRows: m.variant.rows,
      freezeRows: m.reproduce.freeze.rows,
      gradeLedger: state.gradeLedger || {},
      drills: state.auditDrills || [],
      // 四角色输出：谁、什么时候、结论、耗时、返回摘要
      traces: (state.traces || []).map(function (t) {
        return { at: t.at, role: t.role, roleName: t.roleName, ok: t.ok, ms: t.ms, line: t.line, codes: t.codes, out: t.out };
      })
    };
  }

  function download() {
    const data = exportPayload();
    const text = JSON.stringify(data, null, 2);
    const name = 'audit-' + SHT.curriculum.hostUnitId + '-' +
      new Date().toISOString().slice(0, 19).replace(/[:T]/g, '') + '.json';
    try {
      const blob = new root.Blob([text], { type: 'application/json' });
      const url = root.URL.createObjectURL(blob);
      const a = root.document.createElement('a');
      a.href = url; a.download = name;
      root.document.body.appendChild(a);
      a.click();
      root.document.body.removeChild(a);
      setTimeout(function () { root.URL.revokeObjectURL(url); }, 1000);
      return { ok: true, name: name, bytes: text.length };
    } catch (e) {
      return { ok: false, message: String(e && e.message || e) };
    }
  }

  /*
   * 拦截演练：人为混进两道坏题，看拦不拦得住。
   *   一道超纲：正确答案用了本单元没教的词（curtain）→ 期望代码闸 V1
   *   一道错答案：answer 不在选项里 → 期望 V2
   * 代码闸先判；模型可用时再让验证角色判一次（它只有否决权，但这里要的正是它说不说不行）。
   * 「拦住」= 代码闸或验证角色任一给出 FAIL 并带得出条款号。两个都漏才是真漏。
   */
  async function runDrill() {
    if (ui.bus) return;
    const state = (SHT.devAudit.state && SHT.devAudit.state()) || {};
    const unit = SHT.curriculum;
    const kp = (SHT.kpsOf(unit.id)[0] || {}).label || 'vocab · 本单元词 · 音义联结';
    const cell = { type: '中英匹配', scene: (SHT.SCENE_OF_DOMAIN[unit.topicDomain] || '学校'), level: '认', distractor: '同类不同物' };
    const probes = [
      { kind: '超纲题', expect: 'V1',
        q: { qid: 'drill-scope-' + Date.now(), no: 0, knowledgePoint: kp, ability: 'vocab', cell: cell,
          prompt: '选出「窗帘」的英文。', audioText: '', options: ['curtain', 'window', 'door'],
          answer: 'curtain', analysis: 'curtain 是窗帘。', checks: {}, source: 'drill' } },
      { kind: '错答案题', expect: 'V2',
        q: { qid: 'drill-answer-' + Date.now(), no: 0, knowledgePoint: kp, ability: 'vocab', cell: cell,
          prompt: '选出「衬衫」的英文。', audioText: '', options: ['shirt', 'skirt', 'coat'],
          answer: 'shoes', analysis: 'shirt 是衬衫。', checks: {}, source: 'drill' } }
    ];

    ui.bus = true;
    ui.live = '正在跑拦截演练：塞了 ' + probes.length + ' 道坏题，先过代码闸…';
    render();
    const out = [];
    for (let i = 0; i < probes.length; i += 1) {
      const p = probes[i];
      const gate = SHT.validateQuestion(p.q, unit, { others: [] });
      const codeCodes = (gate.fails || []).map(function (f) { return f.id; });
      let modelVerdict = 'skipped';
      let modelCodes = [];
      if (SHT.llm.isReady()) {
        ui.live = '第 ' + (i + 1) + ' 道（' + p.kind + '）：代码闸' + (gate.pass ? '没拦住' : '拦住了') + '，正问验证角色…';
        render();
        const verdict = await SHT.llm.call({
          role: 'verify',
          system: SHT.ROLES.verify.system(),
          user: SHT.ROLES.verify.user({ bookName: SHT.curriculum.bookName, bookMeta: unit.meta || {},
            unit: unit, question: p.q }),
          maxTokens: 700, temperature: 0.1
        });
        const j = verdict.json || {};
        modelVerdict = verdict.ok ? (j.verdict || '?') : 'error';
        modelCodes = (j.fails || []).filter(function (f) { return f && f.id; }).map(function (f) { return f.id; });
      }
      const caughtByCode = !gate.pass && codeCodes.length > 0;
      const caughtByModel = modelVerdict === 'fail' && modelCodes.length > 0;
      out.push({
        at: new Date().toISOString(),
        kind: p.kind,
        expect: p.expect,
        codeVerdict: gate.pass ? 'pass' : 'fail',
        codeCodes: codeCodes,
        modelVerdict: modelVerdict,
        modelCodes: modelCodes,
        caught: caughtByCode || caughtByModel,
        caughtBy: caughtByCode ? 'code' : (caughtByModel ? 'model' : 'none')
      });
    }
    state.auditDrills = (out.concat(state.auditDrills || [])).slice(0, 40);
    if (SHT.devAudit.collectTraces) SHT.devAudit.collectTraces();
    if (SHT.devAudit.save) SHT.devAudit.save();
    const caught = out.filter(function (x) { return x.caught; }).length;
    ui.live = '拦截演练完成：' + caught + '/' + out.length + ' 拦住' +
      (caught === out.length ? '，坏题都没进来' : '，有坏题混进来了——看下面变体质量卡');
    if (SHT.devAudit.toast) SHT.devAudit.toast('拦截演练 ' + caught + '/' + out.length);
    ui.bus = false;
    render();
    return out;
  }

  function bind() {
    const el = root.document && root.document.getElementById('auditRoot');
    if (!el || el.__auditBound) return;
    el.__auditBound = true;
    el.addEventListener('click', function (e) {
      const act = e.target.closest && e.target.closest('[data-action]');
      if (act) {
        const a = act.dataset.action;
        if (a === 'audit-export') {
          const r = download();
          ui.live = r.ok ? ('已导出 ' + r.name + '（' + Math.round(r.bytes / 1024) + ' KB）') : ('导出失败：' + r.message);
          render();
          return;
        }
        if (a === 'audit-refresh') { ui.live = '已按当前存档重算'; render(); return; }
        if (a === 'audit-drill') { runDrill(); return; }
        if (a === 'audit-filter') { ui.role = act.dataset.role || 'all'; ui.more = false; render(); return; }
        if (a === 'audit-more-rows') { ui.more = !ui.more; render(); return; }
      }
      // 变体表：点一行展开两版原文
      const row = e.target.closest && e.target.closest('.audit-row');
      if (row && row.nextElementSibling && row.nextElementSibling.classList.contains('audit-row-detail')) {
        const next = row.nextElementSibling;
        const open = next.hidden;
        next.hidden = !open;
        row.setAttribute('aria-expanded', open ? 'true' : 'false');
        return;
      }
      // 时间线：点一行展开返回摘要
      const tl = e.target.closest && e.target.closest('.audit-tl');
      if (tl) {
        const d = tl.querySelector('.audit-tl-detail');
        if (d) {
          d.hidden = !d.hidden;
          tl.setAttribute('aria-expanded', d.hidden ? 'false' : 'true');
        }
      }
    });
    // 键盘：表行与时间线行都当按钮用
    el.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const t = e.target.closest && (e.target.closest('.audit-row') || e.target.closest('.audit-tl'));
      if (!t) return;
      e.preventDefault();
      t.click();
    });
  }

  SHT.devAudit = {
    render: function () { const m = render(); bind(); return m; },
    exportPayload: exportPayload,
    download: download,
    runDrill: runDrill,
    __ui: ui
  };
})(window);
