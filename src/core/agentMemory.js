/*
 * 四个角色各自的记忆
 *
 * brief（pipeline.buildBrief）是「这一轮该考什么」的输入，一份。记忆不同：它按角色
 * 分开存，因为四个角色该记的东西根本不是一回事——
 *
 *   plan     记「出过哪些角度、补过哪些考点、哪几条被退回」——排题时别撞自己
 *   generate 记「哪个条款最容易把它退回」——写题时先躲开
 *   verify   记「上一轮有多少次判 fail 没给条款号」——这是它自己被判无效的记录
 *   diagnose 记「错因分布、有没有老把同一类挂在嘴边」——诊断要能自我校准
 *
 * 为什么不分给模型自己维护：模型没有跨调用状态，所谓「角色记忆」必须由代码
 * 在两次调用之间搬运，而且写成可数的字段，不能写成一段散文——散文没法验证，
 * 也没法在下一轮判断它到底用上了没有。
 */
(function (root) {
  const SHT = (root.SHT = root.SHT || {});

  const CAP_CELLS = 60;
  const CAP_KPS = 40;

  function uniqPush(list, value, cap) {
    if (!value) return list;
    if (list.indexOf(value) >= 0) return list;
    list.push(value);
    if (list.length > cap) list.shift();
    return list;
  }

  function bump(map, key) {
    if (!key) return map;
    map[key] = (map[key] || 0) + 1;
    return map;
  }

  function cellText(c) {
    if (!c) return '';
    return [c.type, c.scene, c.level, c.distractor].join(' / ');
  }

  SHT.agentMemory = {
    // 空记忆：四个角色各一份
    blank: function () {
      return {
        plan: { rounds: 0, cells: [], kps: [], backoff: {}, lessons: [] },
        generate: { rounds: 0, fails: {} },
        verify: { rounds: 0, fails: {}, noCodeCount: 0 },
        diagnose: { rounds: 0, causes: {}, lowConf: 0 }
      };
    },

    /**
     * 把一轮的结果写进三个角色各自的记忆。纯函数，不改入参。
     * @param {object} mem 上一份记忆
     * @param {object} round { questions, failures }
     */
    commit: function (mem, round) {
      const base = mem && mem.plan ? mem : SHT.agentMemory.blank();
      const next = JSON.parse(JSON.stringify(base));
      const questions = (round && round.questions) || [];
      const failures = (round && round.failures) || [];

      next.plan.rounds += 1;
      questions.forEach(function (q) {
        uniqPush(next.plan.cells, cellText(q.cell), CAP_CELLS);
        uniqPush(next.plan.kps, q.knowledgePoint, CAP_KPS);
      });
      failures.forEach(function (f) {
        if (f.stage === 'plan') (f.codes || []).forEach(function (c) { bump(next.plan.backoff, c); });
      });

      /*
       * 诱饵放不进去，说明这一轮的考点跨度太大：上一题的答案在新题里根本说不通，
       * 硬塞就是一个谁都不会选的废选项。这条要记住，下一轮排考点时别跨这么远。
       * 记录的是「为什么放不进」，不是「放不进几次」——后者没用，前者能指导选题。
       */
      if (!next.plan.lessons) next.plan.lessons = [];
      // 上一次的作答可能属于上一轮：生成下一轮时，这一轮还没开始答。
      // 两份都收进来，教训和诊断才不会因为「跨了一轮」就丢了。
      const attempts = (round && round.attempts || []).concat(round && round.priorAttempts || []);
      attempts.forEach(function (a) {
        if (!a || a.stage !== 'variant' || !a.bait) return;
        const why = String(a.bait).replace(/^dropped:\s*/, '');
        if (why === a.bait || why === 'used') return;
        uniqPush(next.plan.lessons, why, 6);
      });

      next.generate.rounds += 1;
      failures.forEach(function (f) {
        if (f.stage === 'validate' || f.stage === 'generate' || f.stage === 'giveup') {
          (f.codes || []).forEach(function (c) { bump(next.generate.fails, c); });
        }
      });

      next.verify.rounds += 1;
      failures.forEach(function (f) {
        if (f.stage !== 'verify') return;
        (f.codes || []).forEach(function (c) { bump(next.verify.fails, c); });
        if ((f.codes || []).indexOf('VERIFY_NO_CODE') >= 0) next.verify.noCodeCount += 1;
      });

      /*
       * 诊断角色的记忆：它自己给过的错因分布。用处在下一轮——
       * 如果它把八成的错都归成「未掌握」，那这个归类没有信息量，
       * 提示词里就让它这次先看证据再落编号。
       */
      next.diagnose = next.diagnose || { rounds: 0, causes: {}, lowConf: 0 };
      next.diagnose.rounds += 1;
      if (!next.diagnose.causes) next.diagnose.causes = {};
      attempts.forEach(function (a) {
        const d = a && a.diag;
        if (!d || !d.causeId) return;
        bump(next.diagnose.causes, d.causeId);
        if (Number(d.confidence || 0) < 0.4) next.diagnose.lowConf += 1;
      });

      return next;
    },

    // 给界面的四行摘要（卡片上的记忆那一行）
    summary: function (mem, agentId) {
      const m = (mem && mem[agentId]) || null;
      if (!m) return '';
      if (agentId === 'plan') return '已记 ' + m.rounds + ' 轮 · ' + m.cells.length + ' 个角度 · ' + m.kps.length + ' 个考点';
      if (agentId === 'generate') {
        const top = topCode(m.fails);
        return '已记 ' + m.rounds + ' 轮 · 最常被退回 ' + (top ? top.code + '×' + top.n : '无');
      }
      if (agentId === 'diagnose') {
        const top = topCode(m.causes);
        return '已记 ' + m.rounds + ' 轮 · 最常见错因 ' + (top ? top.code + '×' + top.n : '无');
      }
      return '已记 ' + m.rounds + ' 轮 · 无效否决 ' + m.noCodeCount + ' 次';
    },

    /**
     * 拼进这次调用提示词的记忆段落。没有记忆就返回空串，不留占位噪音。
     */
    recallText: function (mem, agentId) {
      const m = (mem && mem[agentId]) || null;
      if (!m || !m.rounds) return '';
      const lines = [];
      if (agentId === 'plan') {
        if (m.cells.length) {
          lines.push('你上一轮用过的出题角度（' + m.cells.length + ' 个，别重复）：');
          lines.push(m.cells.slice(-6).map(function (c) { return '- ' + c; }).join('\n'));
        }
        if (m.kps.length) {
          lines.push('已经出过的考点（别当新考点再排一遍）：' + m.kps.slice(-10).join('；'));
        }
        const backs = sortedCodes(m.backoff).slice(0, 3);
        if (backs.length) {
          lines.push('你上一轮被退回的条款：' + backs.map(function (b) { return b.code + '×' + b.n; }).join('、'));
        }
        if ((m.lessons || []).length) {
          lines.push('上一轮有题目没把「学生上次的错答案」放进选项，原因：' + m.lessons.slice(-3).join('；') +
            '。说明考点之间跨得太远。这一轮如果两个考点的语境差很多，就不要指望用上一题的错答案当诱饵。');
        }
      } else if (agentId === 'generate') {
        const fails = sortedCodes(m.fails).slice(0, 4);
        if (fails.length) {
          lines.push('上一轮把你退回最多的条款：' + fails.map(function (b) { return b.code + '×' + b.n; }).join('、') + '。写之前先自查这几条。');
        }
      } else if (agentId === 'diagnose') {
        const causes = sortedCodes(m.causes).slice(0, 3);
        if (causes.length) {
          const total = Object.keys(m.causes).reduce(function (a, k) { return a + m.causes[k]; }, 0);
          const top = causes[0];
          lines.push('你上一轮给过的错因：' + causes.map(function (b) { return b.code + '×' + b.n; }).join('、'));
          if (total >= 3 && top.n / total >= 0.7) {
            lines.push('其中 ' + top.n + ' / ' + total + ' 次都归成「' + top.code + '」，这一轮先看证据再落编号，别默认往这一类靠。');
          }
        }
        if (m.lowConf) {
          lines.push('上一轮有 ' + m.lowConf + ' 次置信度低于 0.4，说明当时证据不足。证据不足就直说，不要凑一个说法。');
        }
      } else {
        const fails = sortedCodes(m.fails).slice(0, 4);
        if (m.noCodeCount) {
          lines.push('上一轮你有 ' + m.noCodeCount + ' 次判 fail 没给条款号，那种否决不算数。这一次判 fail 必须给条款号和具体位置。');
        }
        if (fails.length) {
          lines.push('你上一轮判 fail 的条款：' + fails.map(function (b) { return b.code + '×' + b.n; }).join('、'));
        }
      }
      return lines.length ? '你的记忆：\n' + lines.join('\n') : '';
    }
  };

  function sortedCodes(map) {
    return Object.keys(map || {}).map(function (k) { return { code: k, n: map[k] }; })
      .sort(function (a, b) { return b.n - a.n; });
  }
  function topCode(map) {
    return sortedCodes(map)[0] || null;
  }

  SHT.agentMemory.cellText = cellText;
})(window);
