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

    // ---------- 环节 1：规划 ----------
    onEvent({ phase: 'plan', text: '规划中：提 ' + count + ' 条考点' });
    let plans = null;
    const planAgent = SHT.AGENTS.plan;
    for (let i = 0; i < 2 && !plans; i += 1) {
      const res = await SHT.llm.call({
        role: 'plan',
        system: planAgent.system(),
        user: planAgent.user(Object.assign({}, ctxBase, {
          brief: o.brief, blockedCells: (o.brief && o.brief.blockedCells) || [], count: count
        })),
        maxTokens: 1400
      });
      if (res.ok && res.json && Array.isArray(res.json.plans) && res.json.plans.length) {
        plans = res.json.plans.slice(0, count).map(function (p, idx) {
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

    // ---------- 分格（代码，不让模型碰） ----------
    const used = (o.existing || []).map(function (q) { return q.cell; }).filter(Boolean);
    plans.forEach(function (p, i) {
      p.cell = SHT.pickCell(p, used, unit, i);
      used.push(p.cell);
    });
    onEvent({ phase: 'planned', plans: plans, text: '规划完成：' + plans.length + ' 条' });

    if (o.planOnly) {
      return { ok: true, plans: plans, questions: [], failures: failures, stage: 'plan' };
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
          user: verifyAgent.user(Object.assign({}, ctxBase, { question: question })),
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
