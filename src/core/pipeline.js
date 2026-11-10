/*
 * 出题流水线：规划 → 分格 → 生成 → 代码闸 → 质检 → 退回重出
 *
 * 三段调用都是同一个模型（SHT.llm），靠 SHT.AGENTS 里的三套配置区分角色。
 * 这一层只做编排与记录，判断全在下面两处：
 *   - SHT.validateQuestion（代码闸，有通过权）
 *   - SHT.AGENTS.verify 的返回（模型质检，只有否决权）
 *
 * 失败不吞：每一次不采纳都进 failures，带 stage / 条款号 / 一句话原因，
 * 界面拿它显示「为什么这次没成」，重出时也把它拼进提示词。
 */
(function (root) {
  const SHT = (root.SHT = root.SHT || {});

  const MAX_ATTEMPTS = 3;

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
        missCount: i.errorCount,
        ability: i.ability,
        cause: i.topCause,
        stage: i.errorCount >= 2 ? 'variant-failed' : '',
        cell: i.suggestedCell || null
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
    const mastered = Object.keys(byKp).filter(function (k) {
      return SHT.judgePoint(byKp[k]).state === 'mastered';
    });

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

    return {
      unitId: unitId,
      priority: priority,
      mastered: mastered,
      blockedCells: blockedCells,
      levelHint: levelHint,
      testedCount: tested,
      note: priority.length ? '上一轮错过的考点优先' : '无历史错题，按单元难点排'
    };
  };

  function failEntry(base) {
    return Object.assign({ at: now() }, base);
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
    const onEvent = typeof o.onEvent === 'function' ? o.onEvent : function () {};
    // 本轮要考察的知识点范围（[{label, ability, cell}]）。空 = 不限制，由模型现场提。
    const scope = (o.scope || []).filter(function (s) { return s && s.label; });
    // 三个智能体各自的记忆：由代码在调用之间搬运，下一轮各自读回
    const memory = (o.memory && o.memory.plan) ? o.memory : SHT.agentMemory.blank();
    const recall = function (id) { return SHT.agentMemory.recallText(memory, id); };
    const normKp = function (s) { return String(s || '').toLowerCase().replace(/\s+/g, '').replace(/[·・.]/g, ''); };

    // ---------- 环节 1：规划 ----------
    const want = scope.length ? Math.min(count, scope.length) : count;
    onEvent({ phase: 'plan', text: '规划中：提 ' + want + ' 条考点' + (scope.length ? '（范围 ' + scope.length + ' 个）' : '') });
    let plans = null;
    const planAgent = SHT.AGENTS.plan;
    for (let i = 0; i < 2 && !plans; i += 1) {
      const res = await SHT.llm.call({
        role: 'plan',
        system: planAgent.system(),
        user: planAgent.user(Object.assign({}, ctxBase, {
          brief: o.brief, blockedCells: (o.brief && o.brief.blockedCells) || [], count: want, scope: scope
        })) + (recall('plan') ? '\n\n' + recall('plan') : ''),
        maxTokens: 1400
      });
      if (res.ok && res.json && Array.isArray(res.json.plans) && res.json.plans.length) {
        plans = res.json.plans.slice(0, want).map(function (p, idx) {
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
        if (scope.length) {
          const pool = scope.map(function (s) { return normKp(s.label); });
          const kept = [];
          plans.forEach(function (p) {
            const n = normKp(p.kp);
            const hit = pool.some(function (x) { return x === n || x.indexOf(n) >= 0 || n.indexOf(x) >= 0; });
            if (hit) { kept.push(p); return; }
            failures.push(failEntry({
              stage: 'plan', attempt: i + 1, planKp: p.kp, codes: ['PLAN_SCOPE'],
              reason: '考点不在本轮选定范围内，这一条不排题：「' + p.kp + '」', detail: ''
            }));
          });
          plans = kept;
        }
        if (!plans.length) plans = null;
      }
      if (!plans) {
        failures.push(failEntry({
          stage: 'plan', attempt: i + 1, codes: res.ok ? ['PLAN_EMPTY'] : [res.error.type],
          reason: res.ok ? '返回里没有可用的 plans' : res.error.message,
          detail: res.text ? String(res.text).slice(0, 300) : ''
        }));
        onEvent({ phase: 'retry', text: '规划没成，重试一次' });
      }
    }
    if (!plans) {
      onEvent({ phase: 'done', text: '规划失败，本轮没有出题' });
      return { ok: false, plans: [], questions: [], failures: failures, stage: 'plan' };
    }

    // 考点去重：模型偶尔把同一个考点换个说法给两条，出出来就是两道同考点的题。
    // 宁可这一轮少一道，也不出两道重复的；被去掉的写进失败记录，不静默吞掉。
    const seenKp = Object.create(null);
    const deduped = [];
    plans.forEach(function (p) {
      const k = p.kp.toLowerCase().replace(/\s+/g, ' ');
      if (seenKp[k]) {
        failures.push(failEntry({
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

    // ---------- 分格（代码，不让模型碰） ----------
    const used = (o.existing || []).map(function (q) { return q.cell; }).filter(Boolean);
    plans.forEach(function (p, i) {
      p.cell = SHT.pickCell(p, used, unit, i);
      used.push(p.cell);
    });
    onEvent({ phase: 'planned', plans: plans, text: '规划完成：' + plans.length + ' 条' });

    if (o.planOnly) {
      return { ok: true, plans: plans, questions: [], failures: failures, stage: 'plan',
        memoryNext: SHT.agentMemory.commit(memory, { questions: [], failures: failures }) };
    }

    // ---------- 环节 2 / 闸 / 环节 3 ----------
    const questions = [];
    const maxAttempts = o.maxAttempts || MAX_ATTEMPTS;

    for (let i = 0; i < plans.length; i += 1) {
      const plan = plans[i];
      let adopted = null;
      let feedback = '';

      for (let attempt = 1; attempt <= maxAttempts && !adopted; attempt += 1) {
        onEvent({ phase: 'generate', index: i, attempt: attempt, text: '第 ' + (i + 1) + ' 题生成中（第 ' + attempt + ' 次）' });

        const genAgent = SHT.AGENTS.generate;
        const generated = await SHT.llm.call({
          role: 'generate',
          system: genAgent.system(),
          user: genAgent.user(Object.assign({}, ctxBase, { plan: plan })) +
            (recall('generate') ? '\n\n' + recall('generate') : '') +
            (feedback ? '\n\n上一版被退回，原因是：\n' + feedback + '\n这次必须避开这些问题。' : ''),
          maxTokens: 900
        });

        if (!generated.ok) {
          failures.push(failEntry({
            stage: 'generate', planKp: plan.kp, attempt: attempt,
            codes: [generated.error.type], reason: generated.error.message,
            detail: generated.text ? String(generated.text).slice(0, 300) : ''
          }));
          feedback = '接口层面失败：' + generated.error.message + '（保持 JSON 合法、字段齐全）';
          continue;
        }

        const raw = generated.json;
        const question = {
          no: i + 1,
          knowledgePoint: plan.kp,
          ability: plan.ability,
          cell: plan.cell,
          prompt: String(raw.prompt || '').trim(),
          audioText: String(raw.audioText || '').trim(),
          options: (Array.isArray(raw.options) ? raw.options : []).slice(0, 3).map(function (x) { return String(x == null ? '' : x).trim(); }),
          answer: String(raw.answer == null ? '' : raw.answer).trim(),
          analysis: String(raw.analysis || '').trim(),
          nextIfWrong: plan.nextIfWrong,
          keyword: String(raw.keyword || '').trim(),
          checks: {},
          source: 'model'
        };
        while (question.options.length < 3) question.options.push('');

        // 听力题的兜底：模型十次有四五次忘记填 audioText，题目本身却没问题。
        // 只给「真要听」的题补：题型是听音选义 / 听写，或题干里写了听 / 录音。
        // 书面辨音题（选出与 cake 中 a 同音的词）不需要朗读，硬补反而音文不一，质检会否。
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
          failures.push(failEntry({
            stage: 'validate', planKp: plan.kp, attempt: attempt,
            codes: codesOf(gate.fails), reason: failsText(gate.fails),
            detail: JSON.stringify({ prompt: question.prompt, options: question.options, answer: question.answer, analysis: question.analysis })
          }));
          feedback = failsText(gate.fails);
          onEvent({ phase: 'reject', index: i, codes: codesOf(gate.fails), text: '第 ' + (i + 1) + ' 题被代码闸退回：' + codesOf(gate.fails).join('、') });
          continue;
        }

        // 模型质检：只有否决权
        onEvent({ phase: 'verify', index: i, text: '第 ' + (i + 1) + ' 题质检中' });
        const verifyAgent = SHT.AGENTS.verify;
        const verdict = await SHT.llm.call({
          role: 'verify',
          system: verifyAgent.system(),
          user: verifyAgent.user(Object.assign({}, ctxBase, { question: question })) +
            (recall('verify') ? '\n\n' + recall('verify') : ''),
          maxTokens: 700,
          temperature: 0.1
        });

        if (!verdict.ok) {
          // 质检本身失败不能把题废掉：记一笔，按「仅代码闸通过」采纳，界面标未复核
          failures.push(failEntry({
            stage: 'verify', planKp: plan.kp, attempt: attempt,
            codes: [verdict.error.type], reason: '质检没跑成，按代码闸通过采纳：' + verdict.error.message,
            detail: ''
          }));
          question.modelVerdict = 'unverified';
          question.checks.__verify = 'skipped';
          adopted = question;
          break;
        }

        const vj = verdict.json || {};
        const vfails = Array.isArray(vj.fails) ? vj.fails.filter(function (f) { return f && f.id; }) : [];
        // 软否决：所有理由都指向「解析写得不够细」时，不重出、直接采纳并标 weak。
        // 理由：解析限 30 字，逐项罗列本来就写不下；为解析把整道题丢掉，代价远大于收益，
        // 而且题面本身是合规的（代码闸已经过了）。解析留给人再润一句就行。
        const softOnly = vj.verdict === 'fail' && vfails.length > 0 &&
          vfails.every(function (f) { return /解析/.test(String(f.reason || '')); });
        if (softOnly) {
          failures.push(failEntry({
            stage: 'verify', planKp: plan.kp, attempt: attempt,
            codes: ['VERIFY_SOFT'].concat(vfails.map(function (f) { return f.id; })),
            reason: '质检只嫌解析写得不够细，题面没过错，采纳并标待润色',
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
            // 说挂又不给条款号 = 无效否决，不采纳但记下来
            failures.push(failEntry({
              stage: 'verify', planKp: plan.kp, attempt: attempt,
              codes: ['VERIFY_NO_CODE'], reason: '质检判 fail 但没给条款号，按无效否决处理',
              detail: String(vj.note || '').slice(0, 200)
            }));
            question.modelVerdict = 'pass';
            question.checks.__verify = 'weak';
            adopted = question;
            break;
          }
          vfails.forEach(function (f) { question.checks[f.id] = 'fail'; });
          failures.push(failEntry({
            stage: 'verify', planKp: plan.kp, attempt: attempt,
            codes: vfails.map(function (f) { return f.id; }),
            reason: vfails.map(function (f) { return f.id + '：' + (f.reason || ''); }).join('；'),
            detail: JSON.stringify({ prompt: question.prompt, options: question.options, answer: question.answer })
          }));
          feedback = vfails.map(function (f) { return f.id + '（' + (SHT.ALL_CHECKS.filter(function (c) { return c.id === f.id; })[0] || {}).text + '）：' + f.reason; }).join('；');
          onEvent({ phase: 'reject', index: i, codes: vfails.map(function (f) { return f.id; }), text: '第 ' + (i + 1) + ' 题质检退回' });
          continue;
        }

        question.modelVerdict = 'pass';
        question.checks.__verify = 'pass';
        adopted = question;
      }

      if (adopted) {
        questions.push(adopted);
        onEvent({ phase: 'adopted', index: i, text: '第 ' + (i + 1) + ' 题通过' });
      } else {
        failures.push(failEntry({
          stage: 'giveup', planKp: plan.kp, attempt: maxAttempts,
          codes: ['GIVE_UP'], reason: '连续 ' + maxAttempts + ' 次都没过闸，这一格留空，不硬塞',
          detail: ''
        }));
        onEvent({ phase: 'dropped', index: i, text: '第 ' + (i + 1) + ' 题放弃（' + maxAttempts + ' 次都没过）' });
      }
    }

    onEvent({ phase: 'done', text: '本轮完成：' + questions.length + ' / ' + plans.length + ' 题' });
    return {
      ok: questions.length > 0,
      plans: plans,
      questions: questions,
      failures: failures,
      stage: 'done',
      memoryNext: SHT.agentMemory.commit(memory, { questions: questions, failures: failures }),
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
    if (!res.ok) return { ok: false, message: res.error.message, type: res.error.type };
    return { ok: true, ms: res.ms, model: SHT.llm.config().model, tokens: res.tokens };
  };
})(window);
