/*
 * 出题流水线：课程 → 分格 → 生成 → 代码闸 → 验证 → 退回重出 → （作答后）诊断
 *
 * 几次调用都是同一个模型（SHT.llm），靠 SHT.ROLES 里的几套配置区分角色。
 * 这一层只做编排与记录，判断全在下面两处：
 *   - SHT.validateQuestion（代码闸，有通过权）
 *   - SHT.ROLES.verify 的返回（模型验证，只有否决权）
 *
 * 失败不吞：每一次不采纳都进 failures，带 stage / 条款号 / 一句话原因，
 * 界面拿它显示「为什么这次没成」，下一轮课程角色读它决定换什么说法重试。
 */
(function (root) {
  const SHT = (root.SHT = root.SHT || {});

  const MAX_ATTEMPTS = 3;
  // 课程角色多提几条当替补。为什么是 2：一次退不成的格子通常只有一格两格，
  // 提太多会挤占正取的注意力（模型给 7 条时会顺手把后两条写成空话）。
  const BENCH_SIZE = 2;
  // 「干扰项造不出来」这一族：V3 选项不合规 / V3b 干扰项太好排除 / V3c 干扰拼写不像错拼。
  // 连着卡在这几条上，说明不是题写坏了，是这个考点在这个单元里造不出可信的诱饵。
  const DISTRACTOR_CODES = ['V3', 'V3b', 'V3c'];

  function kpTokens(s) {
    return String(s || '').toLowerCase()
      .replace(/[·・．.\/、，,；;：:（）()「」【】"'’—-]/g, ' ')
      .split(/\s+/)
      .filter(function (w) { return !!w; });
  }

  // 两个考点「近不近」：只看字面重合的词有几个。同一个语音组、同一个句型、
  // 同一个话题的词会重合，跨话题的不会。不做语义相似度——那要调模型，
  // 而这一步必须在退题当下就决定，等不起一次调用。
  function kpAffinity(a, b) {
    const A = kpTokens(a);
    const B = kpTokens(b);
    let n = 0;
    A.forEach(function (x) { if (B.indexOf(x) >= 0) n += 1; });
    return n;
  }

  /**
   * llm.call 失败时返回的是扁平结构 { ok:false, errorType, message }，
   * 不是 { error:{ type, message } }。以前整条链路都按后者读，
   * 于是任何接口层失败（key 无效 / 超时 / 限流 / 返回非 JSON）都会在这里
   * 抛 TypeError，被上层 catch 吞成一句「出错了」，连通性测试更是永远停在
   * 「正在测试…」——真实错误全被一个字段名挡住了。这两个函数是唯一的读法。
   */
  function shtErrType(r) {
    if (!r) return 'unknown';
    return r.errorType || (r.error && r.error.type) || 'unknown';
  }
  function shtErrMsg(r) {
    if (!r) return '未知错误';
    return r.message || (r.error && r.error.message) || '未知错误';
  }

  function now() { return new Date().toISOString(); }

  function cellList() {
    return (SHT.QUESTION_TYPES || []).map(function (t) { return t.id; });
  }

  // 能力 → 偏好题型（生成的题必须落在这个范围里，否则知识点与题型对不上）
  const TYPE_BY_ABILITY = {
    vocab: ['中英匹配', '听音选义', '拼写补全'],
    spelling: ['拼写补全', '听写'],
    listening: ['听音选义', '听写'],
    phonics: ['字母组合辨音', '听音选义'],
    sentence: ['选词填空', '句子判断', '对话补全'],
    grammar: ['选词填空', '句子判断'],
    speaking: ['看图说词']
  };

  function sceneOf(unit) {
    const map = SHT.SCENE_OF_DOMAIN || {};
    return map[unit.topicDomain] || '学校';
  }

  function defaultLevel(plan) {
    if (SHT.LEVELS.indexOf(plan.level) >= 0) return plan.level;
    const byAbility = { spelling: '辨', phonics: '辨', listening: '认', speaking: '表达', grammar: '用', sentence: '用', vocab: '认' };
    return byAbility[plan.ability] || '用';
  }

  function distractorFor(plan, i) {
    const causes = SHT.ERROR_TO_CELL || [];
    const hit = causes.filter(function (c) {
      return plan.cause && String(plan.cause).indexOf(c.pattern) >= 0;
    })[0];
    if (hit) return hit.distractor;
    return SHT.DISTRACTORS[i % SHT.DISTRACTORS.length];
  }

  /**
   * 为一行计划分配格子。模型不参与这一步：
   * 让它自己分，5 道题会收敛到最省力的那一格，而且它说的「不一样」没法验证。
   */
  SHT.pickCell = function (plan, used, unit, index) {
    const scene = sceneOf(unit);
    const level = defaultLevel(plan);
    const prefer = TYPE_BY_ABILITY[plan.ability] || cellList();
    const alt = cellList().filter(function (t) { return prefer.indexOf(t) < 0; });
    const types = prefer.concat(alt);
    const distractor = distractorFor(plan, index);
    const distractorOrder = [distractor].concat(SHT.DISTRACTORS.filter(function (d) { return d !== distractor; }));
    const levelOrder = [level].concat(SHT.LEVELS.filter(function (l) { return l !== level; }));
    const sceneOrder = [scene].concat(SHT.SCENES.filter(function (s) { return s !== scene; }));

    for (let ti = 0; ti < types.length; ti += 1) {
      for (let di = 0; di < distractorOrder.length; di += 1) {
        for (let li = 0; li < levelOrder.length; li += 1) {
          for (let si = 0; si < sceneOrder.length; si += 1) {
            const cell = { type: types[ti], scene: sceneOrder[si], level: levelOrder[li], distractor: distractorOrder[di] };
            const key = SHT.cellKey(cell);
            const dup = used.some(function (u) { return SHT.cellKey(u) === key; });
            if (!dup) return cell;
          }
        }
      }
    }
    return { type: types[0], scene: scene, level: level, distractor: distractor };
  };

  /**
   * 把错题与作答记录压成下一轮的 brief。这是「下一轮根据错题记录判断怎么出」的落点。
   */
  SHT.pipeline = SHT.pipeline || {};

  SHT.pipeline.buildBrief = function (opts) {
    const o = opts || {};
    const unitId = o.unitId || (SHT.curriculum && SHT.curriculum.id);
    const rounds = o.rounds || [];
    const wrongCases = (o.wrongCases || []).filter(function (c) { return !c.unitId || c.unitId === unitId; });
    const proj = SHT.projectWeaknesses(wrongCases, SHT.curriculum && SHT.curriculum.topicDomain);

    const priority = (proj.queue || []).slice(0, 3).map(function (i) {
      return {
        kp: i.label,
        kpId: i.kpId || '',
        missCount: i.errorCount,
        ability: i.ability,
        cause: i.topCause,
        stage: i.errorCount >= 2 ? 'variant-failed' : '',
        cell: i.suggestedCell || null,
        // 上一轮那道原题。生成时当反例用：同一考点、换题面，但别照着这一版改字。
        prevPrompt: i.snapshot || '',
        // 上一轮那道题的 id：变体题要挂上它，审计时才能画出「谁从谁演化来」
        prevQid: i.qid || '',
        // 以下四项是「作答证据」，不是「出题意图」：
        //   诊断角色说他错在哪一维、上次选了什么、花了多久、有没有用提示
        // 课程角色要据此决定下一轮往哪个方向压，而不是只看「错了几次」。
        diag: i.diag || null,
        pKnown: i.pKnown,
        lastPicked: i.lastPicked || '',
        lastAnswer: i.lastAnswer || '',
        lastMs: i.lastMs || 0,
        lastHint: i.lastHint || 0
      };
    });

    const byKp = {};
    rounds.forEach(function (r) {
      const attempts = (r.practice && r.practice.attempts) || [];
      attempts.forEach(function (a) {
        if (!a.kpLabel) return;
        (byKp[a.kpLabel] = byKp[a.kpLabel] || []).push(a);
      });
    });
    const masteredInRound = Object.keys(byKp).filter(function (k) {
      return SHT.judgePoint(byKp[k]).state === 'mastered';
    });
    // 一轮里只答一枪，「真会」现在主要落在错题本上：错过、下一轮回练连对两次才算。
    // 只看轮内作答的话，这份清单永远空，规划就不知道哪些考点不用再出。
    const masteredInCases = wrongCases.filter(function (c) {
      return c.masteryState === 'mastered';
    }).map(function (c) { return c.knowledgePoint; });
    const mastered = masteredInRound.concat(masteredInCases.filter(function (k) {
      return masteredInRound.indexOf(k) < 0;
    }));

    const blockedCells = [];
    rounds.forEach(function (r) {
      (r.questions || []).forEach(function (q) {
        if (q && q.cell) blockedCells.push(q.cell);
      });
    });

    const tested = Object.keys(byKp).length;
    const masteredCount = mastered.length;
    let levelHint = '持平';
    if (tested >= 3 && masteredCount === 0) levelHint = '整体降一档';
    else if (tested >= 3 && masteredCount / tested >= 0.8) levelHint = '升一档';

    /*
     * 验证角色的输出要进课程的输入：不是整道题，是「哪个考点、卡在哪几条、几次」。
     * 课程据此换一个能落地的说法重排，而不是把上一轮的计划原样再写一遍。
     */
    const byKpFail = {};
    // 只汇总最近这一小段：失败记录是跨轮累积的，越早的越不代表「这一轮为什么没过」。
    // 数组是最新的在前，取前 40 条足够覆盖上一轮。
    (o.failures || []).slice(0, 40).forEach(function (f) {
      if (!f || !f.planKp) return;
      const codes = f.codes || [];
      if (codes.indexOf('PLAN_RETIRED') >= 0) return;
      const e = byKpFail[f.planKp] = byKpFail[f.planKp] || { kp: f.planKp, codes: [], times: 0 };
      e.times += 1;
      codes.forEach(function (c) { if (e.codes.indexOf(c) < 0) e.codes.push(c); });
    });
    const rejects = Object.keys(byKpFail).map(function (k) {
      const e = byKpFail[k];
      return {
        kp: e.kp, times: e.times, codes: e.codes,
        text: e.codes.map(function (c) { return SHT.codeLabel(c); }).join('；')
      };
    }).sort(function (a, b) { return b.times - a.times; }).slice(0, 4);

    return {
      unitId: unitId,
      priority: priority,
      mastered: mastered,
      blockedCells: blockedCells,
      levelHint: levelHint,
      testedCount: tested,
      rejects: rejects,
      note: priority.length ? '上一轮错过的考点优先' : '无历史错题，按单元难点排'
    };
  };

  /*
   * 失败记录带轮次。以前不带，界面只能拿「全部失败记录」当「这一轮的」，
   * 第二轮一跑就显示「这一轮有 78 条没出成」——那其实是两轮累计。
   * 轮次从 runRound 的 opts.round 传进来（app 知道当前是第几轮），
   * 没有就记 0，界面按时间兜底。
   */
  function failEntry(base, roundNo) {
    return Object.assign({ at: now(), round: roundNo || 0 }, base);
  }

  function codesOf(fails) {
    return (fails || []).map(function (f) { return f.id; });
  }

  function failsText(fails) {
    return (fails || []).map(function (f) { return f.id + '：' + f.detail; }).join('；');
  }

  /**
   * 跑一轮。
   * @param {object} opts {
   *   unit, count, brief, existing, onEvent, maxAttempts,
   *   planOnly
   * }
   */
  SHT.pipeline.runRound = async function (opts) {
    const o = opts || {};
    const unit = o.unit || SHT.curriculum;
    const count = o.count || 5;
    const book = SHT.BOOKS.current();
    const ctxBase = {
      bookName: book.meta.shortName,
      bookMeta: book.meta,
      unit: unit
    };
    const failures = [];
    // 本轮编号：失败记录都带它，界面才分得清「这一轮的」和「两轮累计的」
    const ROUND_NO = o.round || 0;
    const fail = function (base) { return failEntry(base, ROUND_NO); };
    const onEvent = typeof o.onEvent === 'function' ? o.onEvent : function () {};
    // 本轮要考察的知识点范围（[{label, ability, cell}]）。空 = 不限制，由模型现场提。
    const scope = (o.scope || []).filter(function (s) { return s && s.label; });
    // 四个角色各自的记忆：由代码在调用之间搬运，下一轮各自读回
    const memory = (o.memory && o.memory.plan) ? o.memory : SHT.agentMemory.blank();
    const recall = function (id) { return SHT.agentMemory.recallText(memory, id); };

    // 考点推进：会过的考点退役、升层的考点带上目标层次、学生分层给层次上限
    const progress = (o.progress && o.progress.points) ? o.progress : SHT.progress.blank();
    const hint = SHT.progress.planHint(progress, { layer: (o.stage && o.stage.layer) || 'B', scope: scope });
    const scopeAlive = scope.filter(function (s) { return hint.retired.indexOf(s.label) < 0; });
    hint.retiredInScope.forEach(function (kp) {
      failures.push(fail({
        stage: 'plan', attempt: 1, planKp: kp, codes: ['PLAN_RETIRED'],
        reason: '这个考点他已经真会到顶了，本轮从范围里移出', detail: ''
      }));
    });
    const normKp = function (s) { return String(s || '').toLowerCase().replace(/\s+/g, '').replace(/[·・.]/g, ''); };

    // 能力配额：给了就用给的（人改过的优先），没给就按「范围 → 错题 → 本册」自动算。
    // 题量不是「出 5 题」，是「词汇 2 / 语法 2 / 听力 1」这张小表。
    const quota = (o.quota && SHT.quota.sum(o.quota) > 0)
      ? SHT.quota.normalize(o.quota)
      : SHT.quota.auto({ scope: scopeAlive, brief: o.brief, kps: (unit.kps || SHT.kpsOf(unit.id) || []), total: count });
    const quotaSum = SHT.quota.sum(quota);
    let quotaReport = null;

    // ---------- 环节 1：规划 ----------
    const want = scopeAlive.length ? Math.min(quotaSum, scopeAlive.length) : quotaSum;
    // 正取 want 条，另外多要 BENCH_SIZE 条当替补：某一格实在出不成时由它顶上，
    // 总比留个空格强——一轮 5 题只出 3 题，学生做完就没题了。
    const wantBench = Math.min(BENCH_SIZE, Math.max(1, quotaSum));
    onEvent({
      phase: 'plan',
      text: '规划中：' + want + ' 条考点' + (scopeAlive.length ? '（范围 ' + scopeAlive.length + ' 个）' : '') +
        '　替补 ' + wantBench + ' 条' +
        (hint.layer ? '　' + hint.layer + ' 层上限 ' + hint.cap : '') + '　配额 ' + SHT.quota.text(quota)
    });
    let plans = null;
    let spare = [];
    const planAgent = SHT.ROLES.plan;
    for (let i = 0; i < 2 && !plans; i += 1) {
      const res = await SHT.llm.call({
        role: 'plan',
        system: planAgent.system(),
        user: planAgent.user(Object.assign({}, ctxBase, {
          brief: o.brief, blockedCells: (o.brief && o.brief.blockedCells) || [],
          count: want + wantBench, bench: wantBench,
          scope: scopeAlive, stage: hint, quota: quota
        })) + (recall('plan') ? '\n\n' + recall('plan') : ''),
        maxTokens: 1600
      });
      if (res.ok && res.json && Array.isArray(res.json.plans) && res.json.plans.length) {
        plans = res.json.plans.map(function (p, idx) {
          return {
            kp: String(p.kp || p.knowledgePoint || '').trim(),
            ability: (SHT.SKILL_CATEGORIES.indexOf(p.ability) >= 0) ? p.ability : 'vocab',
            cause: String(p.cause || '').trim(),
            whyThisOne: String(p.whyThisOne || '').trim(),
            nextIfWrong: String(p.nextIfWrong || '').trim(),
            level: SHT.LEVELS.indexOf(p.level) >= 0 ? p.level : '',
            no: idx + 1
          };
        }).filter(function (p) { return p.kp; });
        // 范围的硬校验：说好只考这几个，就得真落在这几个上。
        // 提示词里写「必须照抄」不管用，模型会顺手把它改得更漂亮。
        if (scopeAlive.length) {
          const pool = scopeAlive.map(function (s) { return normKp(s.label); });
          const kept = [];
          plans.forEach(function (p) {
            const n = normKp(p.kp);
            const hit = pool.some(function (x) { return x === n || x.indexOf(n) >= 0 || n.indexOf(x) >= 0; });
            if (hit) { kept.push(p); return; }
            failures.push(fail({
              stage: 'plan', attempt: i + 1, planKp: p.kp, codes: ['PLAN_SCOPE'],
              reason: '考点不在本轮选定范围内，这一条不排题：「' + p.kp + '」', detail: ''
            }));
          });
          plans = kept;
        }
        // 层次上限：C 层不给「用」，B 层不给「表达」。模型爱往高考，代码按住。
        plans.forEach(function (p) {
          if (SHT.LEVELS.indexOf(p.level) < 0) { p.level = hint.cap; return; }
          const over = SHT.LEVELS.indexOf(p.level) > SHT.LEVELS.indexOf(hint.cap);
          if (over) {
            failures.push(fail({
              stage: 'plan', attempt: i + 1, planKp: p.kp, codes: ['PLAN_LEVEL_CAP'],
              reason: '层次「' + p.level + '」超过 ' + hint.layer + ' 层的上限「' + hint.cap + '」，已降到上限', detail: ''
            }));
            p.level = hint.cap;
          }
        });
        // 退役考点再出现（模型从记忆里抄回来的），直接剔掉
        plans = plans.filter(function (p) {
          if (hint.retired.indexOf(p.kp) < 0) return true;
          failures.push(fail({
            stage: 'plan', attempt: i + 1, planKp: p.kp, codes: ['PLAN_RETIRED'],
            reason: '这个考点已经真会到顶，不再排题', detail: ''
          }));
          return false;
        });

        // 能力配额：模型爱把一整轮都写成 vocab（最容易出题），代码按住。
        // 先按配额裁，再截总条数——反过来会把靠后能力的题当超额砍掉。
        const applied = SHT.quota.apply(plans, quota);
        applied.over.forEach(function (x) {
          failures.push(fail({
            stage: 'plan', attempt: i + 1, planKp: x.kp, codes: ['QUOTA_OVER'],
            reason: '「' + x.ability + '」这一轮只排 ' + quota.byAbility[x.ability] + ' 条，这条不当正取（留作替补）', detail: ''
          }));
        });
        // 配额外的能力没被剔掉（名额还空着就收下），只留一笔在报告里，不算失败
        applied.report.short.forEach(function (x) {
          failures.push(fail({
            stage: 'plan', attempt: i + 1, codes: ['QUOTA_SHORT'],
            reason: '「' + x.ability + '」配额 ' + x.want + ' 条，规划只给了 ' + x.got + ' 条', detail: ''
          }));
        });
        /*
         * 替补从「没当上正取」的那些里挑：被配额挤出来的、以及超出总条数的。
         * 不另开一次模型调用——正取没排上的考点本来就是最合适的替补，
         * 它们和这一轮的方向最近，顶上去不像外来的题。
         */
        spare = applied.over.map(function (x) {
          return plans.filter(function (p) { return p.kp === x.kp; })[0];
        }).filter(Boolean)
          .concat(applied.plans.slice(want))
          .slice(0, wantBench);
        plans = applied.plans.slice(0, want);
        plans.forEach(function (p, idx) { p.no = idx + 1; });
        quotaReport = applied.report;
        if (!plans.length) plans = null;
      }
      if (!plans) {
        failures.push(fail({
          stage: 'plan', attempt: i + 1, codes: res.ok ? ['PLAN_EMPTY'] : [shtErrType(res)],
          reason: res.ok ? '返回里没有可用的 plans' : shtErrMsg(res),
          detail: res.text ? String(res.text).slice(0, 300) : ''
        }));
        onEvent({ phase: 'retry', text: '规划没成，重试一次' });
      }
    }
    if (!plans) {
      onEvent({ phase: 'done', text: '规划失败，本轮没有出题' });
      return { ok: false, plans: [], questions: [], failures: failures, stage: 'plan',
        quota: quota, quotaReport: null };
    }

    // 考点去重：模型偶尔把同一个考点换个说法给两条，出出来就是两道同考点的题。
    // 宁可这一轮少一道，也不出两道重复的；被去掉的写进失败记录，不静默吞掉。
    const seenKp = Object.create(null);
    const deduped = [];
    plans.forEach(function (p) {
      const k = p.kp.toLowerCase().replace(/\s+/g, ' ');
      if (seenKp[k]) {
        failures.push(fail({
          stage: 'plan', attempt: 1, planKp: p.kp, codes: ['PLAN_DUP'],
          reason: '考点与前面重复：「' + p.kp + '」，这一条不排题', detail: ''
        }));
        return;
      }
      seenKp[k] = true;
      deduped.push(p);
    });
    if (deduped.length !== plans.length) {
      plans = deduped;
      plans.forEach(function (p, i) { p.no = i + 1; });
      onEvent({ phase: 'planned', plans: plans, text: '考点去重后剩 ' + plans.length + ' 条' });
    }

    /*
     * 替补：正取之外多要的那几条。不占配额、不占格子、不进 plans，
     * 只有某一格连续退不成时才顶上（顶上那一刻才分配格子）。
     * 和正取撞同一个考点的直接剔掉——替补的意义是换一条路，不是把正取再写一遍。
     */
    const bench = spare.filter(function (p) {
      const n = normKp(p.kp);
      return !!n && !plans.some(function (x) { return normKp(x.kp) === n; });
    }).map(function (p) { return Object.assign({}, p, { bench: true }); });

    // 上一轮错的考点：这一轮请模型换题面重出，标记成 probe。
    // 这一枪和上一轮的首答配成一对，才判得出是真会还是只记住那道题。
    // 用代码标记而不是让模型自己声明：模型会把「我觉得相关」也算进去。
    const prio = (o.brief && o.brief.priority) || [];
    const markProbe = function (p) {
      const n = normKp(p.kp);
      const exact = prio.filter(function (x) { return normKp(x.kp) === n; })[0];
      const near = exact || prio.filter(function (x) {
        const a = normKp(x.kp);
        return a && n && (a.indexOf(n) >= 0 || n.indexOf(a) >= 0);
      })[0];
      if (near) {
        p.probe = {
          kpId: near.kpId || '',
          // 变体挂在错题本里那道原题的 id 上（不是题干）。审计台靠它回答
          // 「第二轮的这道题，是不是从第一轮那道错题演化来的」。
          parentQid: near.prevQid || '',
          prevPrompt: near.prevPrompt || '',
          missCount: near.missCount || 1
        };
      }
    };
    plans.forEach(markProbe);
    // 替补顶上来时同样要对上那一枪，否则「他到底是不是真会了」配不成对
    bench.forEach(markProbe);

    // ---------- 分格（代码，不让模型碰） ----------
    const used = (o.existing || []).map(function (q) { return q.cell; }).filter(Boolean);
    plans.forEach(function (p, i) {
      p.cell = SHT.pickCell(p, used, unit, i);
      used.push(p.cell);
    });
    onEvent({ phase: 'planned', plans: plans, text: '规划完成：' + plans.length + ' 条' });

    if (o.planOnly) {
      return { ok: true, plans: plans, bench: bench, questions: [], failures: failures, stage: 'plan',
        quota: quota, quotaReport: quotaReport,
        memoryNext: SHT.agentMemory.commit(memory, {
          questions: [], failures: failures,
          attempts: o.attempts || [], priorAttempts: o.priorAttempts || []
        }) };
    }

    // ---------- 环节 2 / 闸 / 环节 3 ----------
    const questions = [];
    const maxAttempts = o.maxAttempts || MAX_ATTEMPTS;

    // 本轮已经排上的考点（含换出来、顶上来的），防止两格撞同一个点
    const takenKp = Object.create(null);
    plans.forEach(function (p) { takenKp[normKp(p.kp)] = true; });

    /*
     * 换相近考点：只在「这个考点的诱饵造不出来」的时候用。
     * 候选池只取这一轮真能考的：给了范围就只用范围里剩下的，没给就用本单元候选清单。
     * 挑法不调模型——同能力优先，其次字面重合的词多。这一步要在退题的当下就决定，
     * 等一次模型调用会把「这一个考点造不出诱饵」拖成整轮的等待。
     */
    function nearKpFor(from, stage, scopeList) {
      const pool = [];
      if ((scopeList || []).length) {
        scopeList.forEach(function (s) { pool.push({ kp: s.label, ability: s.ability || '' }); });
      } else {
        (SHT.kpsOf(unit.id) || []).forEach(function (k) { pool.push({ kp: k.label, ability: k.ability || '' }); });
      }
      let best = null;
      let bestScore = -1;
      pool.forEach(function (c) {
        const n = normKp(c.kp);
        if (!n || takenKp[n]) return;
        if ((stage.retired || []).indexOf(c.kp) >= 0) return;
        let score = (c.ability && c.ability === from.ability) ? 2 : 0;
        score += kpAffinity(c.kp, from.kp);
        if (score > bestScore) { bestScore = score; best = c; }
      });
      if (!best) return null;
      const ability = best.ability || from.ability;
      const lv = defaultLevel({ ability: ability, level: from.level });
      return {
        kp: best.kp,
        ability: ability,
        cause: from.cause,
        whyThisOne: from.whyThisOne,
        nextIfWrong: from.nextIfWrong,
        level: SHT.LEVELS.indexOf(lv) > SHT.LEVELS.indexOf(stage.cap) ? stage.cap : lv,
        probe: null,
        switchedFrom: from.kp
      };
    }

    // 替补顶上：优先同能力的那条（顶上去仍保持在原来那类能力的配比上），没有就用第一条。
    const benchLeft = bench.slice();
    function nextBench(from) {
      // 换考点可能已经用掉了替补里的某一条，顶上时不能重复排同一个考点
      const open = benchLeft.filter(function (b) { return !takenKp[normKp(b.kp)]; });
      if (!open.length) return null;
      const sameAbility = open.filter(function (b) { return b.ability === from.ability; })[0];
      const picked = sameAbility || open[0];
      benchLeft.splice(benchLeft.indexOf(picked), 1);
      const lv = defaultLevel({ ability: picked.ability, level: picked.level || from.level });
      return {
        kp: picked.kp,
        ability: picked.ability,
        cause: picked.cause || from.cause,
        whyThisOne: picked.whyThisOne || from.whyThisOne,
        nextIfWrong: picked.nextIfWrong || from.nextIfWrong,
        level: SHT.LEVELS.indexOf(lv) > SHT.LEVELS.indexOf(hint.cap) ? hint.cap : lv,
        probe: picked.probe || null,
        fromBench: true
      };
    }

    for (let i = 0; i < plans.length; i += 1) {
      let plan = plans[i];
      let adopted = null;
      let feedback = '';
      let attempt = 0;
      // 这一格历次被退回的条款号：用来判断「是不是诱饵造不出来」，而不是题写坏了
      let slotCodes = [];
      let switched = false;   // 换考点最多一次，再换就成了瞎试
      let benched = false;    // 替补最多顶一次

      while (!adopted) {
        let moved = null;
        /*
         * 诱饵造不出来：连着两次卡在同一条「选项 / 干扰项」条款上，就不再耗第三次。
         * 那不是题写坏了，是这个考点在这个单元里造不出可信的诱饵——
         * 再退回一次也只会得到同样一堆废选项，换一个相近考点才有意义。
         */
        const stuckTimes = slotCodes.filter(function (c) {
          return DISTRACTOR_CODES.indexOf(c) >= 0;
        }).length;
        if (stuckTimes >= 2 && !switched) {
          const alt = nearKpFor(plan, hint, scopeAlive);
          if (alt) {
            moved = {
              plan: alt,
              why: '诱饵造不出来（连着 ' + stuckTimes + ' 次），换到相近的「' + alt.kp + '」重出'
            };
            failures.push(fail({
              stage: 'plan', planKp: plan.kp, attempt: attempt,
              codes: ['PLAN_SWITCH_KP'],
              reason: '这个考点连着 ' + stuckTimes + ' 次都造不出可信的干扰项，换相近考点重出：' +
                plan.kp + ' → ' + alt.kp,
              detail: ''
            }));
          }
        }

        // 次数用满了（或者没得换）：替补顶上；替补也没了就真放弃，这一格留空
        if (!moved && attempt >= maxAttempts && !benched) {
          const b = nextBench(plan);
          if (b) {
            benched = true;
            moved = { plan: b, why: '这一格没出成，替补顶上：「' + b.kp + '」' };
            failures.push(fail({
              stage: 'plan', planKp: plan.kp, attempt: attempt,
              codes: ['BENCH_UP'],
              reason: '这一格（' + plan.kp + '）没出成，由替补「' + b.kp + '」顶上',
              detail: ''
            }));
          }
        }

        if (moved) {
          plan = moved.plan;
          plan.no = i + 1;
          // 换出来的这一格要重新分格：原格子已经被上一版占住了
          plan.cell = SHT.pickCell(plan, used, unit, i);
          used.push(plan.cell);
          takenKp[normKp(plan.kp)] = true;
          attempt = 0;
          slotCodes = [];
          feedback = moved.why;
          onEvent({ phase: 'switch', index: i, text: '第 ' + (i + 1) + ' 题：' + moved.why });
          continue;
        }
        if (attempt >= maxAttempts) break;   // 真放弃

        attempt += 1;
        onEvent({ phase: 'generate', index: i, attempt: attempt, text: '第 ' + (i + 1) + ' 题生成中（第 ' + attempt + ' 次）' });

        const genAgent = SHT.ROLES.generate;
        const generated = await SHT.llm.call({
          role: 'generate',
          system: genAgent.system(),
          user: genAgent.user(Object.assign({}, ctxBase, { plan: plan })) +
            (recall('generate') ? '\n\n' + recall('generate') : '') +
            (feedback ? '\n\n上一版被退回，原因是：\n' + feedback + '\n这次必须避开这些问题。' : ''),
          maxTokens: 900
        });

        if (!generated.ok) {
          failures.push(fail({
            stage: 'generate', planKp: plan.kp, attempt: attempt,
            codes: [shtErrType(generated)], reason: shtErrMsg(generated),
            detail: generated.text ? String(generated.text).slice(0, 300) : ''
          }));
          feedback = '接口层面失败：' + shtErrMsg(generated) + '（保持 JSON 合法、字段齐全）';
          continue;
        }

        const raw = generated.json;
        const question = {
          // 稳定 id：判分台账拿它做键的一半。重新生成的题即使题号相同，
          // 题面也变了，必须被当成另一道题——所以这里按生成时刻发号，不复用题号。
          qid: 'g' + Date.now().toString(36) + '-' + (i + 1),
          no: i + 1,
          knowledgePoint: plan.kp,
          ability: plan.ability,
          cell: plan.cell,
          prompt: String(raw.prompt || '').trim(),
          audioText: String(raw.audioText || '').trim(),
          options: (Array.isArray(raw.options) ? raw.options : []).slice(0, 3).map(function (x) { return String(x == null ? '' : x).trim(); }),
          answer: String(raw.answer == null ? '' : raw.answer).trim(),
          // 同一个答案的其它正确写法。判分第 2 段用，命中就不调模型。
          acceptable: (Array.isArray(raw.acceptable) ? raw.acceptable : [])
            .map(function (x) { return String(x == null ? '' : x).trim(); })
            .filter(Boolean).slice(0, 6),
          // 开放题：答案是一句话而不是三个选项之一。看图说词天然是这种。
          open: plan.cell.type === '看图说词' || raw.open === true,
          analysis: String(raw.analysis || '').trim(),
          // 逐项说明：与 options 一一对应，答错时前端按「他选的 / 正确答案 / 另一项」展示。
          // 缺了不废题（老数据也没有），界面会退回一句解析。
          optionNotes: (Array.isArray(raw.optionNotes) ? raw.optionNotes : [])
            .slice(0, 3).map(function (x) { return String(x == null ? '' : x).trim(); }),
          nextIfWrong: plan.nextIfWrong,
          keyword: String(raw.keyword || '').trim(),
          // 上一轮错过、这一轮重出的题：作答时和上一轮首答配一对
          probe: plan.probe || null,
          // 审计用：这道题从第一轮哪道错题演化来。空 = 不是变体（广度探索那一轮）
          parentQid: (plan.probe && plan.probe.parentQid) || '',
          // 日志要显示「什么时候出的这道题」，生成时刻在这里落下
          createdAt: now(),
          checks: {},
          source: 'model'
        };
        while (question.options.length < 3) question.options.push('');

        // 听力题的兜底：模型十次有四五次忘记填 audioText，题目本身却没问题。
        // 只给「真要听」的题补：题型是听音选义 / 听写，或题干里写了听 / 录音。
        // 书面辨音题（选出与 cake 中 a 同音的词）不需要朗读，硬补反而音文不一，验证会否。
        const LISTENING = ['听音选义', '字母组合辨音', '听写'];
        const needsAudio = question.cell.type === '听音选义' || question.cell.type === '听写' ||
          /听|录音/.test(question.prompt);
        if (needsAudio && !question.audioText && /^[A-Za-z'’\- ]+$/.test(question.answer)) {
          question.audioText = question.answer;
          question.checks.__audioFilled = 'auto';
        }

        // 代码闸：有通过权
        const gate = SHT.validateQuestion(question, unit, { others: questions });
        if (!gate.pass) {
          failures.push(fail({
            stage: 'validate', planKp: plan.kp, attempt: attempt,
            codes: codesOf(gate.fails), reason: failsText(gate.fails),
            detail: JSON.stringify({ prompt: question.prompt, options: question.options, answer: question.answer, analysis: question.analysis })
          }));
          feedback = failsText(gate.fails);
          slotCodes = slotCodes.concat(codesOf(gate.fails));
          onEvent({ phase: 'reject', index: i, codes: codesOf(gate.fails), text: '第 ' + (i + 1) + ' 题被代码闸退回：' + codesOf(gate.fails).join('、') });
          continue;
        }

        // 模型验证：只有否决权
        onEvent({ phase: 'verify', index: i, text: '第 ' + (i + 1) + ' 题验证中' });
        const verifyAgent = SHT.ROLES.verify;
        const verdict = await SHT.llm.call({
          role: 'verify',
          system: verifyAgent.system(),
          user: verifyAgent.user(Object.assign({}, ctxBase, { question: question })) +
            (recall('verify') ? '\n\n' + recall('verify') : ''),
          maxTokens: 700,
          temperature: 0.1
        });

        if (!verdict.ok) {
          // 验证本身失败不能把题废掉：记一笔，按「仅代码闸通过」采纳，界面标未复核
          failures.push(fail({
            stage: 'verify', planKp: plan.kp, attempt: attempt,
            codes: [shtErrType(verdict)], reason: '验证没跑成，按代码闸通过采纳：' + shtErrMsg(verdict),
            detail: ''
          }));
          question.modelVerdict = 'unverified';
          question.checks.__verify = 'skipped';
          adopted = question;
          break;
        }

        const vj = verdict.json || {};
        const rawFails = Array.isArray(vj.fails)
          ? vj.fails.filter(function (f) { return f && f.id; })
          : [];
        /*
         * 验证角色只该判它拿得到信息的条款。判了「需要同轮其它题」或「需要学生画像」
         * 的条目，说明它在猜——那种否决不采纳，但记一笔，让它自己的记忆看得见。
         * 这一步把「验证越权」从一句话变成可统计的失败条目。
         */
        const needOf = {};
        (SHT.OUT_OF_SCOPE_CHECKS || []).forEach(function (c) { needOf[c.id] = c; });
        const outScope = rawFails.filter(function (f) { return !!needOf[f.id]; });
        const vfails = rawFails.filter(function (f) { return !needOf[f.id]; });
        if (outScope.length) {
          failures.push(fail({
            stage: 'verify', planKp: plan.kp, attempt: attempt,
            codes: ['VERIFY_OUT_OF_SCOPE'].concat(outScope.map(function (f) { return f.id; })),
            reason: '判了它看不到信息的条款（' + outScope.map(function (f) { return f.id; }).join('、') +
              '），这些否决不算数',
            detail: outScope.map(function (f) { return f.id + '：' + (f.reason || ''); }).join('；').slice(0, 200)
          }));
        }
        // 软否决：所有理由都指向「解析写得不够细」时，不重出、直接采纳并标 weak。
        // 理由：解析限 30 字，逐项罗列本来就写不下；为解析把整道题丢掉，代价远大于收益，
        // 而且题面本身是合规的（代码闸已经过了）。解析留给人再润一句就行。
        const softOnly = vj.verdict === 'fail' && vfails.length > 0 &&
          vfails.every(function (f) { return /解析/.test(String(f.reason || '')); });
        if (softOnly) {
          failures.push(fail({
            stage: 'verify', planKp: plan.kp, attempt: attempt,
            codes: ['VERIFY_SOFT'].concat(vfails.map(function (f) { return f.id; })),
            reason: '验证只嫌解析写得不够细，题面没过错，采纳并标待润色',
            detail: vfails.map(function (f) { return f.id + '：' + (f.reason || ''); }).join('；').slice(0, 200)
          }));
          question.modelVerdict = 'pass';
          question.checks.__verify = 'soft';
          question.checks.__analysis = 'needs-polish';
          adopted = question;
          break;
        }
        if (vj.verdict === 'fail') {
          if (!vfails.length) {
            /*
             * 说挂但没给条款号，先看它说的是什么。
             * 如果说的是「答案不唯一 / 两个都成立」，那就是 C3 的口语版，
             * 不能按「无条款号 = 无效否决」放过去——这是会把错题写进错题本、
             * 再喂给诊断和下一轮出题的最严重的一类错误，宁可退回去重出。
             */
            const said = String(vj.note || '') + ' ' +
              (Array.isArray(vj.fails) ? vj.fails.map(function (f) { return f && f.reason || ''; }).join(' ') : '');
            if (/不唯一|都成立|两个?都对|也(都)?可以|都行|均正确|也能选/.test(said)) {
              vfails.push({ id: 'C3', reason: String(vj.note || '它认为答案不唯一').slice(0, 40) });
            }
          }
          if (!vfails.length) {
            // 说挂却给不出它有权判的条款号 = 无效否决，不采纳但记下来
            failures.push(fail({
              stage: 'verify', planKp: plan.kp, attempt: attempt,
              codes: ['VERIFY_NO_CODE'],
              reason: outScope.length
                ? '只给了它看不到信息的条款，按无效否决处理'
                : '判 fail 但没给条款号，按无效否决处理',
              detail: String(vj.note || '').slice(0, 200)
            }));
            question.modelVerdict = 'pass';
            question.checks.__verify = 'weak';
            adopted = question;
            break;
          }
          vfails.forEach(function (f) { question.checks[f.id] = 'fail'; });
          failures.push(fail({
            stage: 'verify', planKp: plan.kp, attempt: attempt,
            codes: vfails.map(function (f) { return f.id; }),
            reason: vfails.map(function (f) { return f.id + '：' + (f.reason || ''); }).join('；'),
            detail: JSON.stringify({ prompt: question.prompt, options: question.options, answer: question.answer })
          }));
          feedback = vfails.map(function (f) { return f.id + '（' + (SHT.ALL_CHECKS.filter(function (c) { return c.id === f.id; })[0] || {}).text + '）：' + f.reason; }).join('；');
          slotCodes = slotCodes.concat(vfails.map(function (f) { return f.id; }));
          onEvent({ phase: 'reject', index: i, codes: vfails.map(function (f) { return f.id; }), text: '第 ' + (i + 1) + ' 题被验证退回' });
          continue;
        }

        question.modelVerdict = 'pass';
        question.checks.__verify = 'pass';
        adopted = question;
      }

      if (adopted) {
        // 换过考点或替补顶上来的，plans 里那一格要跟着换，否则下游按 plan.kp 记账会对不上
        plans[i] = plan;
        questions.push(adopted);
        onEvent({ phase: 'adopted', index: i, text: '第 ' + (i + 1) + ' 题通过' });
      } else {
        const tried = (switched ? '换过相近考点、' : '') + (benched || plan.fromBench ? '替补也顶上过，' : '');
        failures.push(fail({
          stage: 'giveup', planKp: plan.kp, attempt: maxAttempts,
          codes: ['GIVE_UP'],
          reason: tried + '连续 ' + maxAttempts + ' 次都没过闸，这一格留空，不硬塞',
          detail: ''
        }));
        onEvent({ phase: 'dropped', index: i, text: '第 ' + (i + 1) + ' 题放弃（' + maxAttempts + ' 次都没过）' });
      }
    }

    onEvent({ phase: 'done', text: '本轮完成：' + questions.length + ' / ' + plans.length + ' 题' +
      (bench.length ? '（替补 ' + (bench.length - benchLeft.length) + ' / ' + bench.length + ' 用上）' : '') });
    return {
      ok: questions.length > 0,
      plans: plans,
      // 替补：这次用了哪几条、还剩几条。界面据此说清「本来还能顶上几条」
      bench: bench,
      benchUsed: bench.length - benchLeft.length,
      questions: questions,
      failures: failures,
      stage: 'done',
      memoryNext: SHT.agentMemory.commit(memory, { questions: questions, failures: failures, attempts: o.attempts || [], priorAttempts: o.priorAttempts || [] }),
      // 推进状态与自动停止建议：界面据此把停止条自动勾上，并把已会的考点从下一轮范围里去掉
      progressNext: SHT.progress.commit(progress, { questions: questions, attempts: o.attempts || [], priorAttempts: o.priorAttempts || [] }),
      stageHint: hint,
      stop: SHT.progress.stopJudge({ questions: questions, attempts: o.attempts || [], failures: failures }),
      // 这一轮实际用的配额与达成情况，界面回写后下一轮才看得见偏差
      quota: quota, quotaReport: quotaReport,
      stats: SHT.llm.stats()
    };
  };

  // 连通性自检：一条极短的调用，只验证 key / 网络 / JSON 三件事
  SHT.pipeline.selfCheck = async function () {
    const res = await SHT.llm.call({
      role: 'selfcheck',
      system: '你是一个自检端点。只输出 JSON：{"ok":true}',
      user: '返回 {"ok":true}',
      maxTokens: 40,
      temperature: 0
    });
    if (!res.ok) return { ok: false, message: shtErrMsg(res), type: shtErrType(res) };
    return { ok: true, ms: res.ms, model: SHT.llm.config().model, tokens: res.tokens };
  };
})(window);
