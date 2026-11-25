/*
 * 三个角色 = 同一个模型的三套提示词，按固定顺序出题：
 *   指定方案 plan：读教材，决定考哪几个点
 *   执行     generate：把其中一个点落成一道题
 *   反馈     verify：独立检查题能不能用，不通过就写原因退回重出
 *
 * 这里只放提示词。模型调用在 llm.js，三角色怎么串起来在 pipeline.js。
 * 三份提示词刻意互相隔离：执行看不到学情，反馈看不到出题意图——
 * 这样反馈才是在独立判题，不是在确认出题者想做什么。
 */
(function (root) {
  const SHT = (root.SHT = root.SHT || {});

  function wordsText(u) {
    return (u.words || []).map(function (w) { return w.en + '（' + w.zh + '）'; }).join('、');
  }

  function patternsText(u) {
    return (u.sentencePatterns || []).map(function (p, i) { return (i + 1) + '. ' + p; }).join('\n');
  }

  function funcText(u) {
    const extra = [].concat(
      (u.phonics && u.phonics.extras) || [],
      ((u.phonics && u.phonics.pairs) || []).reduce(function (a, p) { return a.concat(p); }, [])
    );
    return (u.allowedFunctionWords || []).concat(extra).join('、');
  }

  function phonicsText(u) {
    const pairs = (u.phonics && u.phonics.pairs) || [];
    if (!pairs.length) return '本册没有语音板块，不要出语音题。';
    return pairs.map(function (p) { return p.join(' / '); }).join('；');
  }

  SHT.ROLES = {
    plan: {
      id: 'plan',
      name: '指定方案',
      system: function () {
        return [
          '你是小学英语的课程设计者。你只决定「这一轮考哪几个点」，不写题干、不写选项、不判对错。',
          '',
          '输出必须是 JSON：',
          '{"plans":[{"kp":"","ability":"","level":"","angle":""}]}',
          '',
          '硬约束：',
          '1. 数量恰好等于用户给的本轮题数，一条不多、一条不少。少一条就少一道题。',
          '2. 每个考点必须能在给定词表、句型或语音点里落地，不许考不在其中的内容。',
          '3. kp 写清具体考哪个词、哪个句型、哪组发音，例：classroom 的词义 / This is our ... 句型 / lion 与 line 的 l 发音。不许写「词汇」「语法」这种空话。',
          '4. ability 只能取：vocab / spelling / sentence / phonics / grammar。',
          '5. level 只能取：认 / 辨 / 用 / 表达。',
          '6. angle 写这一题打算怎么切入，例：中英匹配 / 选词填空 / 字母组合辨音；不超过 12 个字。',
          '7. 几条考点互不重复；相邻两条尽量同话题，便于互相呼应。',
          '8. 只输出 JSON，不要输出题目内容。'
        ].join('\n');
      },
      user: function (ctx) {
        const u = ctx.unit;
        return [
          '教材：' + ctx.bookName + '（' + u.id + ' ' + u.title + ' ' + u.titleZh + '）',
          '话题：' + u.topicDomain + '；本单元功能：' + (u.functions || []).join('、'),
          '',
          '词表（' + u.words.length + ' 个）：' + wordsText(u),
          '',
          '句型表：\n' + patternsText(u),
          '',
          '语音点：' + phonicsText(u),
          '',
          '请指定 ' + ctx.count + ' 个考点。只输出 JSON。'
        ].join('\n');
      }
    },

    generate: {
      id: 'generate',
      name: '执行',
      system: function () {
        return [
          '你是小学英语的出题者。一次只出一道选择题，只用给定的词表和句型。',
          '',
          '输出必须是 JSON：',
          '{"prompt":"","options":["","",""],"answer":"","analysis":"","optionNotes":["","",""]}',
          'answer 必须与 options 里的某一项完全一致（大小写、标点都要一致）。',
          '',
          '硬约束，违反任一条整题作废：',
          '1. 题干、选项、解析里出现的每一个英文单词，必须来自给定词表或给定功能词，一个都不许多。',
          '2. options 三项互不相同，且只有一项正确。另外两项要能说出错在哪。',
          '3. prompt 里不许出现答案本身。词义题用中文提问，例：选出「教室」的英文。',
          '4. 中文题干必须是英文答案的逐点翻译：答案里有几个人、哪个地点、哪些东西，中文就写几样；答案里没有的一个字不许添。',
          '   反例：答案 There is a library. 只说了「有一个图书馆」，题干写「我们学校有一个图书馆」就错了——答案里没有 in our school。',
          '   句型表里的原句只提供用词和语法，不许整句抄来当答案再倒推一个更长的题干。宁可把题干写短，也不许多添信息。',
          '5. analysis 不超过 25 个字，只讲最主要的那个错因，不要写「本题考查……」。',
          '6. optionNotes 与 options 一一对应，三项都要写，每条不超过 14 个字。正确的那项写为什么成立；错误两项写出错在哪个词、哪条规则，例：「shirt 是衬衫，不是裙子」。不许写「意思弄混了」这类空话。',
          '7. 如果两项在原句里都成立，就在那一项的说明里写「这一项也成立」——这说明题本身不该这么出。',
          '8. 考点、层次、切入角度由方案给定，你不许改。按给定方向出不来时，换场景、换问法、换具体词，不许把考点挪到别处。',
          '9. 如果被要求「按反馈重出」，认真读反馈指出的问题并改掉，不许原样再交一遍。',
          '10. 只输出 JSON。'
        ].join('\n');
      },
      user: function (ctx) {
        const u = ctx.unit;
        const p = ctx.plan;
        const lines = [
          '教材：' + ctx.bookName + '；单元：' + u.id + ' ' + u.title + '（' + u.titleZh + '）',
          '',
          '本轮要出的这一条：',
          '- 考点：' + p.kp,
          '- 能力：' + p.ability,
          '- 层次：' + p.level,
          '- 切入角度：' + p.angle,
          ''
        ];
        if (ctx.feedback && ctx.feedback.length) {
          lines.push('反馈角色退回了这个考点的上一版，原因如下。重出时必须改掉：');
          ctx.feedback.forEach(function (f, i) {
            lines.push((i + 1) + '. ' + f);
          });
          lines.push('');
        }
        lines.push('可用词表：' + wordsText(u));
        lines.push('');
        lines.push('可用功能词：' + funcText(u));
        lines.push('');
        lines.push('句型表原文（其中的词也算学过）：\n' + patternsText(u));
        lines.push('');
        lines.push('只输出 JSON。');
        return lines.join('\n');
      }
    },

    verify: {
      id: 'verify',
      name: '反馈',
      system: function () {
        return [
          '你是独立检查者。你不写题、不改题，只判这道题能不能用。',
          '',
          '你不知道学生是谁，也不知道这道题原本想考什么。这不是遗漏，是刻意不给——',
          '知道了你会去确认出题意图，而不是独立判断题目本身成不成立。',
          '',
          '输出必须是 JSON：',
          '{"verdict":"pass"} 或 {"verdict":"fail","reason":""}',
          '',
          '只查下面五条，每条都是 pass 或 fail，不许「基本可以」：',
          '1. 超纲：题干、选项、解析里的英文单词是否都在给定词表或功能词里。',
          '2. 答案唯一：把另外两个选项逐个代回题干读一遍，只要有一项也成立就 fail。let / let\'s / let me、a / an、is / are 这类同源形式最容易两项都对。',
          '3. 中英对等：中文题干和英文答案逐点对应，题干不能多添答案里没有的信息（例：答案 There is a library. 题干写「我们学校有一个图书馆」就 fail）。',
          '4. 干扰项有效：另外两个选项错误的原因说得通，不是换哪个词都能用的空话。',
          '5. 字段齐全：三个选项互不相同、答案与某一项完全一致、三项 optionNotes 都填了。',
          '',
          '判 fail 时 reason 控制在 20 字以内，只写「哪儿不对」，指出具体词或选项，不要复述题目。',
          '好：「选项 2 的 near 不能加 s」；坏：「第二个选项有问题」。',
          '拿不准按 fail 处理，reason 写「拿不准：……」。',
          '只输出 JSON。'
        ].join('\n');
      },
      user: function (ctx) {
        const q = ctx.question;
        const u = ctx.unit;
        return [
          '教材：' + ctx.bookName + '；单元：' + u.id + ' ' + u.title,
          '',
          '待检的题：',
          '- 题干：' + JSON.stringify(q.prompt),
          '- 选项：' + JSON.stringify(q.options),
          '- 答案：' + q.answer,
          '- 解析：' + q.analysis,
          '- 各选项说明：' + JSON.stringify(q.optionNotes),
          '',
          '可用词表：' + wordsText(u),
          '',
          '可用功能词：' + funcText(u),
          '',
          '句型表原文（其中出现的词也算学过）：\n' + patternsText(u),
          '',
          '只输出 JSON。'
        ].join('\n');
      }
    }
  };

  SHT.ROLE_LIST = ['plan', 'generate', 'verify'].map(function (id) {
    return { id: id, name: SHT.ROLES[id].name };
  });
})(window);
