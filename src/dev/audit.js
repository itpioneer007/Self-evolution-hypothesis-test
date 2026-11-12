/*
 * 审计台（开发者界面）· 角色流水视图
 *
 * 这一页要回答的不是「达标没达标」，而是「四个角色各自到底做了什么」：
 *   ① 课程角色给了哪几个点、每个点希望用哪种错法做干扰项
 *   ② 执行角色把这些点落成了什么题、有没有走样
 *   ③ 验证角色拦下了哪些题、因为哪一条、被拦下的题长什么样
 *   ④ 学生答错时诊断角色先记下了什么原始信息、又得出了什么结论
 *   ⑤ 第二轮是不是真的拿了第一轮的错题去做变体
 *
 * 版式：左侧一列纵向导航（像抽屉），点标题右边换内容；不是一屏塞满指标卡。
 * 数据一律来自存档：取不到就写「没有记录」，不拿估算值充数。
 *
 * 达标口径仍在 core/audit.js，这里不重复判定，只做「谁做了什么」的还原。
 */
(function (root) {
  const SHT = (root.SHT = root.SHT || {});

  /* ---------- 小工具 ---------- */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  function timeOf(iso) {
    const d = iso ? new Date(iso) : null;
    if (!d || isNaN(d.getTime())) return '--:--';
    const p = function (x) { return (x < 10 ? '0' : '') + x; };
    return p(d.getHours()) + ':' + p(d.getMinutes());
  }
  function dayOf(iso) {
    const d = iso ? new Date(iso) : null;
    if (!d || isNaN(d.getTime())) return '';
    return (d.getMonth() + 1) + '月' + d.getDate() + '日';
  }
  function shortId(id) { return String(id || '').slice(0, 8) || '—'; }

  // 与 app.js 同口径：带 round 按 round，老数据按本轮开始时间兜底
  function failsOf(state, roundNo) {
    const r = (state.rounds || {})[roundNo] || {};
    const since = r.startedAt ? new Date(r.startedAt).getTime() : 0;
    return (state.failures || []).filter(function (f) {
      if (typeof f.round === 'number' && f.round > 0) return f.round === roundNo;
      if (!since) return false;
      const t = f.at ? new Date(f.at).getTime() : 0;
      return t >= since;
    });
  }

  // 验证/自动检查退回时，题目原文以 JSON 存在 detail 里，这里还原出来
  function questionOf(f) {
    try {
      const d = JSON.parse(String(f.detail || ''));
      if (d && (d.prompt || d.options)) return d;
    } catch (e) { /* 不是 JSON 就算了 */ }
    return null;
  }

  function codeLabel(id) { return SHT.codeLabel ? SHT.codeLabel(id) : id; }

  /*
   * 当前轮没数据、但另一轮有——不要说「没有记录」就完事。
   * 审计页跟着顶部的 R1 / R2 走，用户很可能停在第二轮却想查第一轮的诊断，
   * 一句「切到 R1 可以看」比一个空态有用得多。
   */
  function hintOtherRound(state, kind) {
    const others = [1, 2].filter(function (r) { return r !== state.round; });
    for (let i = 0; i < others.length; i += 1) {
      const rn = others[i];
      if (kind === 'diagnose') {
        const n = attemptsOf(state, rn).filter(function (a) { return !a.correct; }).length;
        if (n) return '第 ' + rn + ' 轮有 ' + n + ' 条答错记录，切到顶部 R' + rn + ' 可以看。';
      } else {
        const n = failsOf(state, rn).filter(function (f) {
          return f.stage === 'verify' || f.stage === 'validate';
        }).length;
        if (n) return '第 ' + rn + ' 轮有 ' + n + ' 条拦截记录，切到顶部 R' + rn + ' 可以看。';
      }
    }
    return '';
  }

  function attemptsOf(state, roundNo) {
    return (((state.rounds || {})[roundNo] || {}).practice || {}).attempts || [];
  }

  /* ---------- 导航 ---------- */
  const PANES = [
    { id: 'plan', no: '01', title: '课程给点', hint: '考哪几个点、怎么错' },
    { id: 'execute', no: '02', title: '执行理解', hint: '点落成题，走样没有' },
    { id: 'verify', no: '03', title: '验证拦截', hint: '拦下哪道、为什么' },
    { id: 'diagnose', no: '04', title: '诊断反应', hint: '答错时记了什么' },
    { id: 'reuse', no: '05', title: '第二轮复用', hint: '错题变体的链条' },
    { id: 'trace', no: '06', title: '角色留痕', hint: '每次调用一行' }
  ];

  function counts(state) {
    const round = (state.rounds || {})[state.round] || {};
    const fails = failsOf(state, state.round);
    const wrong = (((round.practice || {}).attempts) || []).filter(function (a) { return !a.correct; });
    const r2 = (state.rounds || {})[2] || {};
    const variants = (r2.questions || []).filter(function (q) { return q && q.parentQid; });
    return {
      plan: (round.plans || []).length || (round.questions || []).length,
      execute: (round.questions || []).length,
      verify: fails.filter(function (f) { return f.stage === 'verify' || f.stage === 'validate'; }).length,
      diagnose: wrong.length,
      reuse: variants.length,
      trace: (state.traces || []).length
    };
  }

  function navHtml(state, active) {
    const c = counts(state);
    return '<nav class="audit-nav">' +
      '<div class="audit-nav-head">' +
        '<span class="an-round">第 ' + state.round + ' 轮</span>' +
        '<span class="an-sub">' + esc(SHT.curriculum.id + ' · ' + (SHT.curriculum.titleZh || '')) + '</span>' +
      '</div>' +
      PANES.map(function (p) {
        return '<button type="button" class="audit-nav-item' + (p.id === active ? ' is-active' : '') + '"' +
          ' data-action="audit-pane" data-pane="' + p.id + '">' +
          '<span class="an-no">' + p.no + '</span>' +
          '<span class="an-body"><span class="an-title">' + p.title + '</span>' +
            '<span class="an-hint">' + p.hint + '</span></span>' +
          (c[p.id] ? '<span class="an-count">' + c[p.id] + '</span>' : '') +
        '</button>';
      }).join('') +
      '<div class="audit-nav-foot">' +
        '<button type="button" class="btn btn-mini" data-action="audit-export">导出 JSON</button>' +
        '<button type="button" class="btn btn-mini" data-action="audit-refresh">刷新</button>' +
      '</div>' +
    '</nav>';
  }

  /* ---------- 01 课程给点 ---------- */
  function panePlan(state) {
    const round = (state.rounds || {})[state.round] || {};
    const plans = round.plans || [];
    const qs = round.questions || [];
    const head = paneHead('课程给点', '这一轮课程角色交出来的原始考点。「干扰项意图」是它希望这道题用哪种错法；' +
      '「为什么考它」是留给下一轮的依据。');

    if (!plans.length) {
      return head + empty('这一轮没有保存课程给点的快照。' +
        (qs.length ? '下面是从题上反推的知识点（没有错因意图与理由）。' : '先去 01 页跑一次「模型出题」。')) +
        (qs.length ? '<div class="audit-card">' + table(['题号', '知识点（从题反推）', '能力', '层次'],
          qs.map(function (q, i) {
            return [i + 1, q.knowledgePoint || '（未填）', q.ability || '—', (q.cell || {}).level || '—'];
          })) + '</div>' : '');
    }

    const rows = plans.map(function (p, i) {
      const from = p.probe
        ? '错题回练 · ' + shortId(p.probe.parentQid)
        : (p.switchedFrom ? '换考点（原：' + p.switchedFrom + '）' : (p.fromBench ? '替补顶上' : '—'));
      return '<tr>' +
        '<td class="c-no">' + (p.no || i + 1) + '</td>' +
        '<td class="c-kp">' + esc(p.kp) + '</td>' +
        '<td>' + esc(SHT.ABILITY_LABEL[p.ability] || p.ability || '—') + '</td>' +
        '<td>' + esc(p.cause || '—') + '</td>' +
        '<td class="c-why">' + esc(p.whyThisOne || '—') + '</td>' +
        '<td>' + esc(p.level || ((p.cell || {}).level) || '—') + '</td>' +
        '<td class="c-from">' + esc(from) + '</td>' +
      '</tr>';
    }).join('');

    return head + '<div class="audit-card"><table class="audit-table">' +
      '<thead><tr><th>#</th><th>考点</th><th>能力</th><th>干扰项意图</th><th>为什么考它</th><th>层次</th><th>从哪来</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div>';
  }

  /* ---------- 02 执行理解 ---------- */
  function paneExecute(state) {
    const round = (state.rounds || {})[state.round] || {};
    const qs = round.questions || [];
    const plans = round.plans || [];
    const head = paneHead('执行理解', '左边是课程给的点，右边是执行角色最终交出来的题。' +
      '「有没有走样」只看两件可判的事：考点是否还是同一个、逐项说明有没有把课程要的错法讲清。');

    if (!qs.length) return head + empty('这一轮还没有题。');

    const cards = qs.map(function (q, i) {
      const plan = plans.filter(function (p) { return p.kp === q.knowledgePoint; })[0] ||
        plans.filter(function (p) { return p.no === q.no; })[0] || null;
      const sameKp = plan ? plan.kp === q.knowledgePoint : null;
      const notes = (q.optionNotes || []).filter(Boolean);
      const optN = (q.options || []).filter(function (o) { return String(o || '').trim(); }).length;
      /*
       * 只判两件代码真能判的事：考点还是不是同一个、三项有没有都写说明。
       * 「它有没有贯彻课程要的那种错法」是语义判断，关键词匹配会冤枉人：
       * 说明里写「computer 是计算机」其实就是在做同类不同物的干扰，
       * 只是没出现「同类不同物」四个字。判不准就别判，把原文摆给人看。
       */
      let verdict;
      let cls = 'is-ok';
      if (sameKp === false) {
        verdict = '考点被换掉了：课程给的是「' + plan.kp + '」';
        cls = 'is-warn';
      } else if (optN && notes.length < optN) {
        verdict = '逐项说明不全：' + notes.length + ' / ' + optN + ' 项，剩下的看不出为什么对错';
        cls = 'is-warn';
      } else {
        verdict = '考点没变，' + notes.length + ' 项都写了说明（错法对不对得看上面的原文）';
      }

      return '<div class="exec-row">' +
        '<div class="exec-src">' +
          '<div class="exec-tag">课程给点</div>' +
          '<div class="exec-kp">' + esc(q.knowledgePoint || '（未填）') + '</div>' +
          '<div class="exec-meta">' +
            (plan ? '能力 ' + esc(SHT.ABILITY_LABEL[plan.ability] || plan.ability || '—') +
              ' · 意图 ' + esc(plan.cause || '—') + ' · 层次 ' + esc(plan.level || '—') : '没有对应的给点快照') +
          '</div>' +
        '</div>' +
        '<div class="exec-arrow">→</div>' +
        '<div class="exec-out">' +
          '<div class="exec-tag">执行产出 · 第 ' + (i + 1) + ' 题</div>' +
          '<div class="exec-prompt">' + esc(q.prompt || '（空题干）') + '</div>' +
          (q.audioText ? '<div class="exec-line"><b>听力原文</b>' + esc(q.audioText) + '</div>' : '') +
          '<div class="exec-line"><b>选项</b>' + esc((q.options || []).join(' / ')) + '</div>' +
          '<div class="exec-line"><b>答案</b>' + esc(q.answer || '—') +
            (q.analysis ? '　<b>解析</b>' + esc(q.analysis) : '') + '</div>' +
          (notes.length ? '<div class="exec-line"><b>逐项说明</b>' +
            notes.map(function (t) { return '<span class="exec-note">' + esc(t) + '</span>'; }).join('') + '</div>' : '') +
          '<div class="exec-verdict ' + cls + '">' + esc(verdict) + '</div>' +
        '</div>' +
      '</div>';
    }).join('');

    return head + '<div class="audit-card">' + cards + '</div>';
  }

  /* ---------- 03 验证拦截 ---------- */
  function paneVerify(state) {
    const fails = failsOf(state, state.round);
    const vFails = fails.filter(function (f) { return f.stage === 'verify'; });
    const gFails = fails.filter(function (f) { return f.stage === 'validate'; });
    const giveup = fails.filter(function (f) { return f.stage === 'giveup'; });
    const qs = ((state.rounds || {})[state.round] || {}).questions || [];

    const head = paneHead('验证拦截', '被拦下的题按拦截者分开：验证角色（模型）与自动检查（代码闸）。' +
      '每条都带当时的题目原文——这是核对「它拦得对不对」的唯一依据。');

    const block = function (title, note, list, tone) {
      const body = list.length ? list.map(function (f) {
        const q = questionOf(f);
        const codes = (f.codes || []).filter(function (c, i, arr) { return arr.indexOf(c) === i; });
        const why = String(f.reason || '').replace(/^[A-Z0-9_]+[：:]\s*/, '').trim();
        return '<div class="hit-row ' + tone + '">' +
          '<div class="hit-head">' +
            '<span class="hit-kp">' + esc(f.planKp || '（整轮）') + '</span>' +
            '<span class="hit-codes">' + codes.map(function (c) {
              return '<span class="hit-code" title="' + esc(codeLabel(c)) + '">' + esc(c) + '</span>';
            }).join('') + '</span>' +
            '<span class="hit-at">' + esc(timeOf(f.at)) + '</span>' +
          '</div>' +
          '<div class="hit-why">' + esc(why || '（没写理由）') + '</div>' +
          (q ? '<div class="hit-q">' +
            '<div class="hq-line"><b>题干</b>' + esc(q.prompt || '—') + '</div>' +
            '<div class="hq-line"><b>选项</b>' + esc((q.options || []).join(' / ')) + '</div>' +
            '<div class="hq-line"><b>答案</b>' + esc(q.answer || '—') +
              (q.analysis ? '　<b>解析</b>' + esc(q.analysis) : '') + '</div>' +
          '</div>' : '') +
        '</div>';
      }).join('') : empty('这一轮没有被它拦下的题。');
      return '<div class="audit-block"><div class="audit-block-head"><h4>' + title + '</h4>' +
        '<span>' + note + '</span></div>' + body + '</div>';
    };

    const passed = qs.filter(function (q) {
      return q.modelVerdict === 'pass' || (q.checks || {}).__verify === 'soft';
    });
    const passHtml = passed.length
      ? '<div class="pass-list">' + passed.map(function (q, i) {
        return '<div class="pass-row"><span class="pr-no">' + (i + 1) + '</span>' +
          '<span class="pr-kp">' + esc(q.knowledgePoint || '') + '</span>' +
          '<span class="pr-prompt">' + esc(String(q.prompt || '').slice(0, 44)) + '</span>' +
          '<span class="pr-mark">' + ((q.checks || {}).__verify === 'soft' ? '软通过（只嫌解析）' : '通过') + '</span></div>';
      }).join('') + '</div>'
      : empty('这一轮还没有题通过。');

    const other = (vFails.length + gFails.length) ? '' : hintOtherRound(state, 'verify');
    return head +
      (other ? '<div class="audit-hint">' + esc(other) + '</div>' : '') +
      block('验证角色拦下的', vFails.length + ' 条 · 模型判它不能进这一轮', vFails, 'is-verify') +
      block('自动检查拦下的', gFails.length + ' 条 · 代码闸判它不合规', gFails, 'is-gate') +
      (giveup.length ? block('三次都没过，放弃的', giveup.length + ' 条 · 这一格留空', giveup, 'is-giveup') : '') +
      '<div class="audit-block"><div class="audit-block-head"><h4>最终进这一轮的</h4>' +
        '<span>' + passed.length + ' 道</span></div>' + passHtml + '</div>';
  }

  /* ---------- 04 诊断反应 ---------- */
  function paneDiagnose(state) {
    const round = (state.rounds || {})[state.round] || {};
    const attempts = attemptsOf(state, state.round).filter(function (a) { return !a.correct; });
    const head = paneHead('诊断反应', '学生答错之后诊断角色先记下了什么、又据此得出什么结论。' +
      '左上角是它拿到的原始证据（不加工），右边才是结论。');

    if (!attempts.length) {
      const other = hintOtherRound(state, 'diagnose');
      return head + empty('这一轮还没有答错的题，诊断角色没有被叫起来。' + (other ? ' ' + other : ''));
    }

    const cards = attempts.map(function (a) {
      const d = a.diag || {};
      const q = (round.questions || [])[a.no - 1] || {};
      const sig = (d.signals || []).map(function (s) { return '<li>' + esc(s.text) + '</li>'; }).join('');
      const elim = (d.eliminated || []).map(function (e) {
        return '<li><b>' + esc(e.letter) + ' ' + esc(e.option) + '</b>' + esc(e.why) + '</li>';
      }).join('');
      return '<div class="diag-row">' +
        '<div class="diag-row-head">' +
          '<span class="dr-no">第 ' + a.no + ' 题</span>' +
          '<span class="dr-kp">' + esc(q.knowledgePoint || '') + '</span>' +
          '<span class="dr-ans">他选 <b>' + esc(a.picked) + '</b>　正确 <b>' + esc(a.expected) + '</b>' +
            (a.durationMs ? '　' + Math.round(a.durationMs / 1000) + 's' : '') + '</span>' +
        '</div>' +
        '<div class="diag-split">' +
          '<div class="diag-raw">' +
            '<div class="ds-title">它最初记下的（原始证据）</div>' +
            '<ul class="ds-list">' +
              (sig || '<li class="ds-none">没有可算的硬证据（字母差、音形、中文义都没命中）</li>') + elim +
            '</ul>' +
            '<div class="ds-timing">耗时 ' + Math.round(((d.timing || {}).ms || 0) / 1000) + ' 秒' +
              ((d.timing || {}).note ? '　' + esc(d.timing.note) : '') + '</div>' +
          '</div>' +
          '<div class="diag-result">' +
            '<div class="ds-title">据此得出的结论</div>' +
            '<div class="dr-cause">' + esc(d.causeLabel || d.causeId || '未给出') +
              '（置信 ' + Math.round((d.confidence || 0) * 100) + '%）</div>' +
            '<div class="dr-headline">' + esc(d.headline || '') + '</div>' +
            (d.nextStep ? '<div class="dr-next"><b>下一轮怎么出</b>' + esc(d.nextStep) + '</div>' : '') +
            '<div class="dr-src">来源：' + (d.source === 'model' ? '模型补诊' : '代码归因') + '</div>' +
          '</div>' +
        '</div>' +
      '</div>';
    }).join('');

    return head + '<div class="audit-card">' + cards + '</div>';
  }

  /* ---------- 05 第二轮复用 ---------- */
  function paneReuse(state) {
    const r1 = (state.rounds || {})[1] || {};
    const r2 = (state.rounds || {})[2] || {};
    const q2 = r2.questions || [];
    const plans2 = r2.plans || [];
    const head = paneHead('第二轮复用', '从错题 → 诊断 → 课程读到的信息 → 第二轮出的题，一条链看完。' +
      '重点看两件事：变体有没有挂上第一轮那道原题、答案有没有换。');

    if (!q2.length) return head + empty('第二轮还没出题。先在第一轮答错几道，再去 01 页出第二轮。');

    let prio = [];
    try {
      const brief = SHT.pipeline.buildBrief({
        unitId: SHT.curriculum.hostUnitId,
        rounds: [r1, r2],
        wrongCases: state.wrongCases || [],
        failures: state.failures || []
      });
      prio = (brief && brief.priority) || [];
    } catch (e) { prio = []; }

    const prioHtml = '<div class="audit-block"><div class="audit-block-head"><h4>课程这一轮读到的错题</h4>' +
      '<span>' + prio.length + ' 条（按优先级）</span></div>' +
      (prio.length ? prio.map(function (p) {
        return '<div class="prio-row">' +
          '<span class="prio-kp">' + esc(p.kp) + '</span>' +
          '<span class="prio-meta">错过 ' + p.missCount + ' 次' +
            (p.pKnown != null ? ' · 掌握概率 ' + Math.round(p.pKnown * 100) + '%' : '') +
            (p.lastPicked ? ' · 上次选「' + esc(p.lastPicked) + '」' : '') +
            (p.diag && p.diag.causeLabel ? ' · 诊断：' + esc(p.diag.causeLabel) : '') + '</span>' +
        '</div>';
      }).join('') : empty('错题本里没有这一单元的错题，第二轮没有可复用的诊断结果。')) +
      '</div>';

    const chain = q2.map(function (q) {
      const parent = (r1.questions || []).filter(function (x) { return x.qid === q.parentQid; })[0] || null;
      const plan = plans2.filter(function (p) { return p.kp === q.knowledgePoint; })[0] || null;
      const changed = parent ? String(parent.answer || '') !== String(q.answer || '') : null;
      const sameKp = parent ? parent.knowledgePoint === q.knowledgePoint : null;
      return '<div class="chain-row' + (parent ? '' : ' is-orphan') + '">' +
        '<div class="chain-side">' +
          '<div class="chain-tag">第一轮那道题</div>' +
          (parent
            ? '<div class="chain-prompt">' + esc(parent.prompt || '') + '</div>' +
              '<div class="chain-meta">答案 <b>' + esc(parent.answer || '—') + '</b> · ' + esc(parent.knowledgePoint || '') + '</div>'
            : '<div class="chain-none">没挂上一轮的题（parentQid：' + esc(shortId(q.parentQid)) + '）</div>') +
        '</div>' +
        '<div class="chain-arrow">→</div>' +
        '<div class="chain-side">' +
          '<div class="chain-tag">第二轮的变体</div>' +
          '<div class="chain-prompt">' + esc(q.prompt || '') + '</div>' +
          '<div class="chain-meta">答案 <b>' + esc(q.answer || '—') + '</b>' +
            ' · ' + (plan && plan.probe ? '标了错题回练' : '没标错题回练') + '</div>' +
          '<div class="chain-flags">' +
            (parent ? '<span class="flag ' + (sameKp ? 'is-ok' : 'is-bad') + '">' + (sameKp ? '考点相同' : '考点变了') + '</span>' : '') +
            (parent ? '<span class="flag ' + (changed ? 'is-ok' : 'is-bad') + '">' + (changed ? '答案换了' : '答案没换') + '</span>' : '') +
            (parent ? '' : '<span class="flag is-bad">没挂来源</span>') +
          '</div>' +
        '</div>' +
      '</div>';
    }).join('');

    return head + prioHtml +
      '<div class="audit-block"><div class="audit-block-head"><h4>变体链条</h4>' +
        '<span>' + q2.filter(function (q) { return q.parentQid; }).length + ' / ' + q2.length + ' 道挂了来源</span></div>' +
        chain + '</div>';
  }

  /* ---------- 06 角色留痕 ---------- */
  function paneTrace(state) {
    const traces = (state.traces || []).slice().reverse();
    const head = paneHead('角色留痕', '每次模型调用一行：谁、什么时候、得出什么结论、花了多久。点一行看返回内容。');
    if (!traces.length) return head + empty('还没有调用记录。');
    return head + '<div class="audit-card"><div class="trace-list">' +
      traces.slice(0, 40).map(function (t) {
        return '<details class="trace-row"><summary>' +
          '<span class="tr-at">' + esc(dayOf(t.at) + ' ' + timeOf(t.at)) + '</span>' +
          '<span class="tr-role">' + esc(t.roleName || t.role) + '</span>' +
          '<span class="tr-line">' + esc(t.line || '') + '</span>' +
          '<span class="tr-ms">' + (t.ms ? t.ms + 'ms' : '—') + '</span>' +
        '</summary><div class="tr-body">' +
          '<div class="tr-kv"><b>返回</b>' + esc(t.out || '（没有保存返回内容）') + '</div>' +
          (t.codes && t.codes.length ? '<div class="tr-kv"><b>条款</b>' + esc(t.codes.join('、')) + '</div>' : '') +
          (t.fields && t.fields.length ? '<div class="tr-kv"><b>它看到的字段</b>' + esc(t.fields.join(' / ')) + '</div>' : '') +
        '</div></details>';
      }).join('') + '</div></div>';
  }

  /* ---------- 骨架 ---------- */
  function paneHead(title, note) {
    return '<div class="audit-pane-head"><h3>' + title + '</h3><p>' + note + '</p></div>';
  }
  function empty(text) { return '<div class="audit-empty">' + esc(text) + '</div>'; }
  function table(heads, rows) {
    return '<table class="audit-table"><thead><tr>' +
      heads.map(function (h) { return '<th>' + esc(h) + '</th>'; }).join('') +
      '</tr></thead><tbody>' + rows.map(function (r) {
        return '<tr>' + r.map(function (c, i) {
          return '<td' + (i === 0 ? ' class="c-no"' : '') + '>' + esc(c) + '</td>';
        }).join('') + '</tr>';
      }).join('') + '</tbody></table>';
  }

  const ui = { pane: '' };

  function render() {
    const el = root.document && root.document.getElementById('auditRoot');
    if (!el) return '';
    const state = (SHT.devAudit.state && SHT.devAudit.state()) || {};
    if (!ui.pane) ui.pane = state.auditPane || 'plan';
    const active = PANES.some(function (p) { return p.id === ui.pane; }) ? ui.pane : 'plan';
    const body = {
      plan: panePlan, execute: paneExecute, verify: paneVerify,
      diagnose: paneDiagnose, reuse: paneReuse, trace: paneTrace
    }[active](state);

    el.innerHTML = '<div class="audit-layout">' + navHtml(state, active) +
      '<section class="audit-pane">' + body + '</section></div>';
    return active;
  }

  /* ---------- 导出与交互 ---------- */
  function exportPayload() {
    const state = (SHT.devAudit.state && SHT.devAudit.state()) || {};
    const round = (state.rounds || {})[state.round] || {};
    return {
      exportedAt: new Date().toISOString(),
      student: SHT.sampleStudent && SHT.sampleStudent.id,
      book: SHT.curriculum.bookName,
      unit: SHT.curriculum.hostUnitId,
      round: state.round,
      plans: round.plans || [],
      questions: round.questions || [],
      failures: state.failures || [],
      attempts: (round.practice || {}).attempts || [],
      traces: state.traces || []
    };
  }

  function download() {
    const text = JSON.stringify(exportPayload(), null, 2);
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
      return { ok: false, message: String((e && e.message) || e) };
    }
  }

  function bind() {
    const el = root.document && root.document.getElementById('auditRoot');
    if (!el || el.__auditBound) return;
    el.__auditBound = true;
    el.addEventListener('click', function (e) {
      const act = e.target.closest && e.target.closest('[data-action]');
      if (!act) return;
      const a = act.dataset.action;
      if (a === 'audit-pane') {
        ui.pane = act.dataset.pane || 'plan';
        const st = SHT.devAudit.state && SHT.devAudit.state();
        if (st) { st.auditPane = ui.pane; if (SHT.devAudit.save) SHT.devAudit.save(); }
        render();
        return;
      }
      if (a === 'audit-refresh') { render(); return; }
      if (a === 'audit-export') {
        const r = download();
        if (SHT.devAudit.toast) {
          SHT.devAudit.toast(r.ok
            ? '已导出 ' + r.name + '（' + Math.round(r.bytes / 1024) + ' KB）'
            : '导出失败：' + r.message);
        }
      }
    });
  }

  SHT.devAudit = {
    render: function () { const p = render(); bind(); return p; },
    exportPayload: exportPayload,
    download: download,
    panes: PANES,
    __ui: ui
  };
})(window);
