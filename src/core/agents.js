/*
 * 三个角色 = 同一个模型的三套配置（提示词 / 记忆 / 技能）
 *
 * 这套分工借的是「专家」的思路：不是三个不同的模型，而是同一底模在三次调用里
 * 拿到不同的 system、不同的上下文、不同的输出契约。
 *
 *   规划 plan     记忆：错题画像 + 已占用角度 + 上轮退回条款     技能：只提考点意图
 *   生成 generate 记忆：只有本单元词表与句型（不给画像）          技能：九字段单题
 *   质检 verify   记忆：词表 + 23 条（不给画像，防放水）          技能：只判 pass / fail
 *
 * 为什么生成看不到画像：让它知道「这学生弱」就会不自觉地把题出简单，而难度
 * 该由规划环节的 level 决定，不该由出题者临时心软。
 * 为什么质检看不到画像：看到画像会同情，会把「他做不出来」当成「题有问题」。
 *
 * 三套提示词都只描述职责与契约，不含任何判据实现——判据在 validate.js 里，
 * 模型说通过不算通过。
 */
(function (root) {
  const SHT = (root.SHT = root.SHT || {});

  function wordsText(unit) {
    return unit.words.map(function (w) {
      return w.en + '=' + w.zh + (w.p ? '(p' + w.p + ')' : '');
    }).join('；');
  }

  function patternsText(unit) {
    return unit.sentencePatterns.map(function (p, i) { return (i + 1) + '. ' + p; }).join('\n');
  }

  function funcText(unit) {
    const fw = (unit.allowedFunctionWords || []).filter(function (w) { return w.length > 1 || w === 'a' || w === 'i'; });
    return fw.join(' ');
  }

  const CHECK_TEXT = function () {
    return (SHT.CHECK_LAYERS || []).map(function (layer) {
      return '【' + layer.name + '】' + layer.items.map(function (it) {
        return it.id + ' ' + it.text;
      }).join('；');
    }).join('\n');
  };

  SHT.AGENTS = {
    plan: {
      id: 'plan',
      name: '规划',
      memoryLabel: '错题画像 · 已占用角度 · 上轮退回条款',
      skillLabel: '只提考点意图，不写题',
      system: function () {
        return [
          '你是小学英语的命题规划者。你只决定「这一轮考哪几个点」，不写题干、不写选项。',
          '',
          '输出必须是 JSON：{"plans":[{"kp":"","ability":"","cause":"","whyThisOne":"","nextIfWrong":"","level":""}]}',
          '',
          '硬约束：',
          '1. 每个考点必须能在给定的词表或句型里落地。词表里没有的东西，一个都不许考。',
          '2. kp 写成「类型 · 具体对象 · 错在哪」三段，例：phonics · a / a-e · cake 与 cat 长短音。不许写「词汇」「语法」「时态」这种颗粒度。',
          '3. ability 只能取：vocab / spelling / sentence / listening / speaking / phonics / grammar。',
          '4. level 只能取：认 / 辨 / 用 / 表达。',
          '5. 各条考点互不重复；如果给了错题画像，前两条必须冲画像里的 priority 考点。',
          '6. whyThisOne：为什么这一轮要考它，一句话，不超过 25 个字。',
          '7. nextIfWrong：他这次还错，下一轮出什么，必须是更小的一步，不超过 25 个字。',
          '8. 不要输出题目内容、选项、解析、答案。只输出 JSON。'
        ].join('\n');
      },
      user: function (ctx) {
        const u = ctx.unit;
        const lines = [];
        lines.push('教材：' + ctx.bookName + '（' + ctx.bookMeta.grade + ctx.bookMeta.term + '，共 ' + ctx.bookMeta.units + ' 个单元）');
        lines.push('单元：' + u.id + ' ' + u.title + '（' + u.titleZh + '）');
        lines.push('话题域：' + u.topicDomain + '；本单元功能：' + (u.functions || []).join('、'));
        lines.push('词表（' + u.words.length + ' 个）：' + wordsText(u));
        lines.push('句型表：\n' + patternsText(u));
        if ((u.phonics.pairs || []).length) {
          lines.push('语音点：' + u.phonics.pairs.map(function (p) { return p.join(' / '); }).join('；'));
        } else {
          lines.push('语音点：本册没有语音板块，不要提 phonics 类考点。');
        }
        lines.push('');
        const brief = ctx.brief || {};
        if (brief.priority && brief.priority.length) {
          lines.push('错题画像（按优先级）：');
          brief.priority.forEach(function (p) {
            lines.push('- ' + p.kp + '（错过 ' + p.missCount + ' 次' + (p.stage === 'variant-failed' ? '，换题也错' : '') + '）');
          });
          lines.push('前两条计划必须冲上面这些考点。');
        } else {
          lines.push('错题画像：这一轮没有历史错题，按单元本身的难点排。');
        }
        if (brief.mastered && brief.mastered.length) {
          lines.push('上一轮已经真会的考点（不要重复出）：' + brief.mastered.join('；'));
        }
        if (ctx.blockedCells && ctx.blockedCells.length) {
          lines.push('已被占用的出题角度（' + ctx.blockedCells.length + ' 个，不要重复）：');
          lines.push(ctx.blockedCells.map(function (c) {
            return '- ' + c.type + ' / ' + c.scene + ' / ' + c.level + ' / ' + c.distractor;
          }).join('\n'));
        } else {
          lines.push('已被占用的出题角度：无（这是第一轮）。');
        }
        lines.push('');
        lines.push('请给 ' + (ctx.count || 5) + ' 条计划。只输出 JSON。');
        return lines.join('\n');
      },
      // 记忆块：这一层写入的是「跨轮经验」，不进 system，避免被当成永久规则
      memory: function (ctx) {
        return {
          priority: (ctx.brief && ctx.brief.priority) || [],
          mastered: (ctx.brief && ctx.brief.mastered) || [],
          blockedCells: ctx.blockedCells || []
        };
      }
    },

    generate: {
      id: 'generate',
      name: '生成',
      memoryLabel: '只有本单元词表与句型',
      skillLabel: '九字段单题',
      system: function () {
        return [
          '你是小学英语的出题者。一次只出一道单选题，只用给定的词表和句型。',
          '',
          '输出必须是 JSON：',
          '{"prompt":"","audioText":"","options":["","",""],"answer":"","analysis":"","keyword":""}',
          'answer 必须与 options 里的某一项完全一致（大小写、标点都要一致）。',
          '',
          '硬约束，违反任一条整题作废：',
          '1. 题干、选项、解析里出现的每一个英文单词，必须来自给定词表或给定功能词。一个都不许多。',
          '2. options 三项互不相同，且只有一项正确。其余两项要能说出错在哪，且错法要与指定的干扰项类型一致。',
          '3. prompt 里不许出现答案本身。拼写题用中文提问，例：选出「黑板」的正确拼写。',
          '4. audioText：听力类题型填要朗读的英文原文；非听力题型填 ""。',
          '5. analysis 不超过 25 个字，说人话，讲清错在哪，不要写「本题考查……」。',
          '6. keyword 填这道题真正在考的那个词或那个句型片段，方便系统归类。',
          '7. 题号、格子、知识点由系统填，你不用输出。',
          '8. 只输出 JSON。'
        ].join('\n');
      },
      user: function (ctx) {
        const u = ctx.unit;
        const p = ctx.plan;
        const lines = [];
        lines.push('教材：' + ctx.bookName + '；单元：' + u.id + ' ' + u.title + '（' + u.titleZh + '）');
        lines.push('话题域：' + u.topicDomain);
        lines.push('');
        lines.push('这一行的命题计划：');
        lines.push('- 考点：' + p.kp);
        lines.push('- 能力：' + p.ability + '；层次：' + p.level);
        lines.push('- 题型：' + p.cell.type + '；场景：' + p.cell.scene + '；干扰项类型：' + p.cell.distractor);
        lines.push('');
        lines.push('本单元词表（只能用这些词）：');
        lines.push(wordsText(u));
        lines.push('');
        lines.push('允许的功能词（可直接用，不算超纲）：');
        lines.push(funcText(u));
        lines.push('');
        lines.push('本单元句型表（题干里的句子必须来自这里或由其替换词构成）：');
        lines.push(patternsText(u));
        lines.push('');
        if (u.phonics && (u.phonics.pairs || []).length && p.cell.type === '字母组合辨音') {
          lines.push('可用语音组：' + u.phonics.pairs.map(function (x) { return x.join(' vs '); }).join('；'));
          lines.push('');
        }
        lines.push('按上面这一行出题。只输出 JSON。');
        return lines.join('\n');
      },
      memory: function (ctx) {
        return { words: ctx.unit.words.length, patterns: ctx.unit.sentencePatterns.length };
      }
    },

    verify: {
      id: 'verify',
      name: '质检',
      memoryLabel: '词表 + 四层 23 条（不给画像）',
      skillLabel: '只判 pass / fail 与条款号',
      system: function () {
        return [
          '你是独立质检者。你不写题，也不改题，只判这道题能不能进这一轮。',
          '',
          '输出必须是 JSON：',
          '{"verdict":"pass"} 或 {"verdict":"fail","fails":[{"id":"C3","reason":""}],"note":""}',
          '',
          '判据：',
          '1. 每条检查项只能判 pass 或 fail，不许「基本可以」「建议修改」。',
          '2. 判 fail 必须给条款号 + 一句具体理由，指出是哪个词、哪个选项、哪个字段。',
          '3. 你看不到出题者的说明，也不要去推测他的意图，只看题面与词表。',
          '4. 拿不准的按 fail 处理，理由写「拿不准：……」。',
          '5. 只输出 JSON。'
        ].join('\n');
      },
      user: function (ctx) {
        const q = ctx.question;
        const u = ctx.unit;
        const lines = [];
        lines.push('教材：' + ctx.bookName + '；单元：' + u.id + ' ' + u.title + '（' + u.titleZh + '）');
        lines.push('');
        lines.push('待检的题：');
        lines.push('- 知识点：' + q.knowledgePoint);
        lines.push('- 题型：' + q.cell.type + '；场景：' + q.cell.scene + '；层次：' + q.cell.level + '；干扰项类型：' + q.cell.distractor);
        lines.push('- 题干：' + JSON.stringify(q.prompt));
        if (q.audioText) lines.push('- 听力原文：' + q.audioText);
        lines.push('- 选项：' + JSON.stringify(q.options));
        lines.push('- 答案：' + q.answer);
        lines.push('- 解析：' + q.analysis);
        lines.push('');
        lines.push('本单元词表：');
        lines.push(wordsText(u));
        lines.push('');
        lines.push('允许的功能词：');
        lines.push(funcText(u));
        lines.push('');
        lines.push('检查项（每条二元判定）：');
        lines.push(CHECK_TEXT());
        lines.push('');
        lines.push('判完输出 JSON。');
        return lines.join('\n');
      },
      memory: function (ctx) {
        return { checks: (SHT.ALL_CHECKS || []).length, words: ctx.unit.words.length };
      }
    }
  };

  // 界面三张卡直接读这里，保证卡片上的三行与真实提示词同源
  SHT.AGENT_LIST = ['plan', 'generate', 'verify'].map(function (id) {
    const a = SHT.AGENTS[id];
    return { id: a.id, name: a.name, memory: a.memoryLabel, skill: a.skillLabel };
  });
})(window);
