/*
 * 四个角色 = 同一个模型的四套配置（提示词 / 记忆 / 上下文）
 *
 * 说法要严谨：这里没有「智能体」。模型不会自己去做事——它没有工具、不会读文件、
 * 不会在两次调用之间记住任何东西。每一轮都是代码把上下文拼好、调一次、拿回一段
 * JSON。所以它们只是同一底模在不同位置上的四个角色，记忆由代码搬运。
 *
 *   plan     课程：决定这一轮考哪几个点、往哪个方向出      看得到学情（诊断 / 作答 / 掌握概率）
 *   generate 生成：把课程给的方向落成一道题                看不到学情，防手软
 *   verify   验证：只针对题目本身判能不能进这一轮          看不到学情，防同情
 *   diagnose 诊断：解释他为什么选了这个、为什么排掉那些    只在作答之后跑，不参与命题
 *
 * 权限边界（这条是整套设计的地基）：
 *   - 验证只有否决权，通过权在代码闸 validate.js 手里。
 *   - 生成不能自己改方向：考点、层次、题型、干扰项类型都由课程定，代码落格。
 *   - 课程不写题、不判对错；层次由 progress.js 的阶梯与上限按住，模型只能在其内选。
 *   - 诊断不改判定结果，也不改题；它只给「为什么」，而且代码先算，模型只能补。
 *
 * 为什么生成看不到学情：让它知道「这学生弱」就会不自觉把题出简单，难度该由
 * 课程的 level 决定，不该由出题者临时心软。
 * 为什么验证看不到学情：看到学情会同情，会把「他做不出来」当成「题有问题」。
 * 为什么验证也看不到出题意图：看到「这题应该用形近干扰项」就会去确认意图，
 * 而不是独立判断选项在这道题里成不成立。
 *
 * 四套提示词都只描述职责与契约，不含判据实现——判据在 validate.js 里，
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

  // 除了词表和功能词，还有两类词是「学过但不在词表里」的，必须主动告诉模型与验证：
  //   语音板块的对比词对（a / a-e 这一课就是用 cat / cake 讲的）
  //   教材句型表原文里出现的词（One blackboard, one TV, many desks and chairs）
  // 不说清楚，模型会不敢用、验证会拿词表去否掉本来对的题（实测两条都发生过）。
  function extraKnownText(unit) {
    const lines = [];
    const pairs = ((unit.phonics && unit.phonics.pairs) || []).map(function (p) { return p.join(' / '); });
    const extras = ((unit.phonics && unit.phonics.extras) || []);
    if (pairs.length) {
      lines.push('语音板块词对（必须用这些词，它们算学过）：' + pairs.concat(extras).join('；'));
    }
    return lines.join('\n');
  }

  function patternText(unit) {
    return (unit.sentencePatterns || []).map(function (p, i) { return (i + 1) + '. ' + p; }).join('\n');
  }

  /*
   * 同源选项检测：let / let's / let me、a / an、is / are、near / nears 这类，
   * 共享词干、只差一个词素。它们最容易两项代回原句都成立，
   * 而单看「正确答案」是看不出这件事的。检测出来就在验证上下文里点名，
   * 要求它逐项代回去读——这是 C3（答案不唯一）最常见的来源。
   */
  function sameRootOptions(options) {
    const list = (options || []).map(function (o) { return String(o == null ? '' : o).trim().toLowerCase(); })
      .filter(Boolean);
    const pairs = [];
    for (let i = 0; i < list.length; i += 1) {
      for (let j = i + 1; j < list.length; j += 1) {
        const a = list[i];
        const b = list[j];
        const short = a.length <= b.length ? a : b;
        const long = a.length <= b.length ? b : a;
        if (!short || !long) continue;
        // 互相包含（let ⊂ let's / let me）或只差一个字母（near / nears）
        const contained = long.indexOf(short) === 0 && long.length - short.length <= 3;
        const oneOff = Math.abs(a.length - b.length) <= 1 && (a.indexOf(b) === 0 || b.indexOf(a) === 0);
        if (contained || oneOff) pairs.push([short, long]);
      }
    }
    return pairs;
  }

  // 只列「只看题目本身就能判」的条目  // 只列「只看题目本身就能判」的条目：拿不到判定所需信息的条目列给它，
  // 它只能靠猜，猜出来的理由就是失败日志里的空话。
  const CHECK_TEXT = function () {
    const ok = {};
    (SHT.JUDGEABLE_CHECKS || []).forEach(function (c) { ok[c.id] = true; });
    return (SHT.CHECK_LAYERS || []).map(function (layer) {
      const items = layer.items.filter(function (it) { return ok[it.id]; });
      if (!items.length) return '';
      return '【' + layer.name + '】' + items.map(function (it) {
        return it.id + ' ' + it.text;
      }).join('；');
    }).filter(Boolean).join('\n');
  };

  SHT.ROLES = {
    plan: {
      id: 'plan',
      name: '课程',
      memoryLabel: '上轮角度 · 考点台账 · 诊断与掌握概率',
      skillLabel: '只提考点意图，不写题',
      system: function () {
        return [
          '你是小学英语的课程设计者。你决定「这一轮考哪几个点、往哪个方向出」，不写题干、不写选项。',
          '',
          '你的边界：不判对错，不声明学生为什么错。学生为什么错由诊断角色根据作答证据给出，',
          '你只负责读它、并据此决定这一轮考什么。题目怎么落地由生成角色负责，你不写题面。',
          '',
          '输出必须是 JSON：{"plans":[{"kp":"","ability":"","cause":"","whyThisOne":"","nextIfWrong":"","level":""}]}',
          '',
          '硬约束：',
          '1. 每个考点必须能在给定的词表或句型里落地。词表里没有的东西，一个都不许考。',
          '2. kp 写成「类型 · 具体对象 · 错在哪」三段，例：phonics · a / a-e · cake 与 cat 长短音。不许写「词汇」「语法」「时态」这种颗粒度。',
          '3. ability 只能取：vocab / spelling / sentence / listening / speaking / phonics / grammar。',
          '4. level 只能取：认 / 辨 / 用 / 表达。',
          '5. 各条考点互不重复；如果给了错题画像，画像里排第一的那个考点要吃满这一轮：',
          '   给了几条就排几条，但不少于 3 条（能力配额不足 3 条时，按配额上限排）。',
          '   再往下排的才轮到画像里第二、第三条。理由：验收要求「第一轮错最多的那个点，',
          '   第二轮至少 3 道直接考它」，只写「前两条」永远只打 2 道，验收必然不过。',
          '6. 如果给了「本轮考点范围」，每条的 kp 必须原样用范围内的一条说法，一个字都不许改，也不许自己另造。',
          '7. whyThisOne：为什么这一轮要考它，一句话，不超过 25 个字。要引用诊断结论或掌握概率，不许写「巩固基础」这种空话。',
          '8. nextIfWrong：他这次还错，下一轮出什么，必须是更小的一步，不超过 25 个字。',
          '9. cause 是你打算用哪种错法做干扰项（形近 / 音近 / 语法错形 / 单复数 / 近义 / 母语负迁移），',
          '   这是设计意图，不是对学生的判断。诊断角色给过真实错因时，干扰项要跟它对齐。',
          '10. 如果给了「本轮能力配额」，按配额分每类能力的条数，一类都不许多；每条的 ability 必须来自配额表，配额里没有的能力不要出现。',
          '11. 相邻两条计划的语境不要跨太远。检验「他是不是真记住」靠的是把上一题的错误答案放进下一题当干扰项——只有两题语境相近时这个干扰项才可信。一条考词汇拼写、下一条考问答应答，跨得太远，上一题的答案在新题里根本说不通，放进去就是个谁都不会选的废选项。排的时候把同话题、同句型的考点放在相邻位置。',
          '12. 上一轮没出成题的考点，读「为什么没出成」那一段：如果是超纲或词表里没有，就换一个能落地的说法；如果是层次高了，就降到上限以内。不要原样再排一遍。',
          '13. 如果你被要求多给几条「替补」：正取在前、替补在后，替补是正取那几条出不成题时顶上去的。',
          '    替补要挑「和某个正取考点相近但不同」的，别和正取撞同一个点；替补不占配额，也不占格子，分到哪一格由代码决定。',
          '14. 不要输出题目内容、选项、解析、答案。只输出 JSON。'
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
        const stage = ctx.stage;
        if (stage && stage.cap) {
          lines.push('学生当前阶段：' + stage.layer + ' 层；这一轮层次上限「' + stage.cap + '」，' +
            '高过上限的层次不许出（层次阶梯：' + (stage.ladder || []).join(' → ') + '）。');
          if ((stage.retired || []).length) {
            lines.push('这些考点他已经真会到顶，一个都不要排：' + stage.retired.join('；'));
          }
          if ((stage.retry || []).length) {
            lines.push('上一轮这些考点没出成题（被退回或放弃），这一轮换个角度重试，不要照原样再写一遍：' +
              stage.retry.map(function (x) { return x.kp + '（已失败 ' + x.times + ' 次）'; }).join('；'));
          }
          if ((stage.advancing || []).length) {
            lines.push('这些考点上一轮已经答对，这一轮要往上走一层：' +
              stage.advancing.map(function (a) { return a.kp + ' → ' + a.level; }).join('；'));
          }
          if (stage.scopeExhausted) {
            lines.push('注意：本轮勾选的范围已经考完，考点要从范围外另提。');
          }
          lines.push('');
        }
        const quota = ctx.quota;
        if (quota && quota.byAbility && Object.keys(quota.byAbility).length) {
          lines.push('本轮能力配额（共 ' + SHT.quota.sum(quota) + ' 条，一类都不许多）：');
          SHT.SKILL_CATEGORIES.forEach(function (a) {
            if (quota.byAbility[a]) lines.push('- ' + a + '：' + quota.byAbility[a] + ' 条');
          });
          lines.push('配额的来历：' + (quota.note || '人工填写') + '。配额外的能力一个都不要排。');
          lines.push('');
        }
        const scope = ctx.scope || [];
        if (scope.length) {
          lines.push('本轮考点范围（' + scope.length + ' 个，只能从里面挑，kp 原样照抄）：');
          scope.forEach(function (s, i) {
            lines.push((i + 1) + '. ' + s.label + (s.cell ? '　（建议角度：' + s.cell.type + ' / ' + s.cell.level + '）' : ''));
          });
          lines.push('');
        }
        const brief = ctx.brief || {};
        if (brief.priority && brief.priority.length) {
          lines.push('错题画像（按优先级，越靠前越该先考）：');
          brief.priority.forEach(function (p) {
            const bits = ['错过 ' + p.missCount + ' 次'];
            if (p.stage === 'variant-failed') bits.push('换题也错');
            if (p.pKnown != null) bits.push('掌握概率 ' + SHT.bkt.text(p.pKnown));
            lines.push('- ' + p.kp + '（' + bits.join('，') + '）');
            if (p.diag && p.diag.causeLabel) {
              lines.push('  诊断：' + p.diag.causeLabel +
                (p.diag.headline ? '——' + p.diag.headline : '') +
                (p.diag.confidence != null ? '（置信 ' + Math.round(p.diag.confidence * 100) + '%）' : ''));
            }
            if (p.lastPicked) {
              lines.push('  上一次他选的是「' + p.lastPicked + '」，正确是「' + (p.lastAnswer || '') + '」' +
                (p.lastMs ? '，用了 ' + Math.round(p.lastMs / 1000) + ' 秒' : '') +
                (p.lastHint ? '，用了提示' : ''));
            }
            if (p.diag && p.diag.eliminated && p.diag.eliminated.length) {
              lines.push('  他排掉了：' + p.diag.eliminated.map(function (e) {
                return e.letter + '「' + e.option + '」（' + e.why + '）';
              }).join('；') + '——同考点继续出题时，别再靠这几项做干扰');
            }
            if (p.diag && p.diag.nextStep) lines.push('  诊断建议的下一步：' + p.diag.nextStep);
          });
          lines.push('前两条计划必须冲上面这些考点。');
        } else {
          lines.push('错题画像：这一轮没有历史错题，按单元本身的难点排。');
        }
        // 验证角色的输出：上一轮这些题为什么没过。给的是条款 + 一句原因，
        // 不是整道题——课程要据此换一个能落地的说法，而不是照原样再排一遍。
        if (brief.rejects && brief.rejects.length) {
          lines.push('');
          lines.push('上一轮没出成题的考点（验证角色退回的原因，这一轮别再犯）：');
          brief.rejects.forEach(function (r) {
            lines.push('- ' + (r.kp || '（未记考点）') + '：' + r.text + (r.times > 1 ? '（' + r.times + ' 次）' : ''));
          });
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
        if (ctx.bench) {
          lines.push('请给 ' + (ctx.count || 5) + ' 条计划，其中前 ' + ((ctx.count || 5) - ctx.bench) +
            ' 条是正取，最后 ' + ctx.bench + ' 条是替补。只输出 JSON。');
          lines.push('替补的用处：正取某一条实在出不成题时，由替补顶上那一格。所以替补要和正取不重复，');
          lines.push('并且挑「和正取里某一条主题相近、但换个切入点」的——换得太远，顶上去也不像同一轮的题。');
          lines.push('替补不占能力配额，也不用管配额表里还剩几个名额。');
        } else {
          lines.push('请给 ' + (ctx.count || 5) + ' 条计划。只输出 JSON。');
        }
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
          '{"prompt":"","audioText":"","options":["","",""],"answer":"","analysis":"","optionNotes":["","",""],"keyword":"","acceptable":[]}',
          'answer 必须与 options 里的某一项完全一致（大小写、标点都要一致）。',
          '开放题（题干要求写出来、说出来，不给选项）时 options 填 []，answer 写成一句完整的话。',
          '',
          '硬约束，违反任一条整题作废：',
          '1. 题干、选项、解析里出现的每一个英文单词，必须来自给定词表或给定功能词。一个都不许多。',
          '2. options 三项互不相同，且只有一项正确。其余两项要能说出错在哪，且错法要与指定的干扰项类型一致。',
          '3. prompt 里不许出现答案本身。拼写题用中文提问，例：选出「黑板」的正确拼写。',
          '4. audioText：听力类题型（听音选义 / 字母组合辨音 / 听写）必须填要朗读的英文原文，就是答案那个词；非听力题型填 ""。漏填整题作废。',
          '5. analysis 不超过 25 个字，只讲最主要的那个错因，不要把每个错项都罗列一遍（罗列必然超字数）。不要写「本题考查……」。',
          '6. keyword 填这道题真正在考的那个词或那个句型片段，方便系统归类。',
          '7. 题号、格子、知识点由系统填，你不用输出。',
          '8. 如果这一行标了「错题回练」，说明他上一轮就是栽在这个考点上。这一条的要求与普通题不同：',
          '   - 考点、层次、题型不变，但题干、场景、选项必须整体重写，不能只改几个字。',
          '   - 答案要换一个值。答案不换，他照上一枪的记忆选就赢了，测不出会不会。',
          '   - 系统会给你上一轮那道原题，那是反例，不是模板：不要照抄它的句式与用词。',
          '9. 只输出 JSON。',
          '10. acceptable：同一个答案还有别的正确写法时，全填进这个数组，判分才不用猜。',
          '    例：答案 He is tall. 时，["He\'s tall."] 也是对的，填进去；',
          '    例：答案是 ice cream 时，"ice-cream" 也对，填进去。',
          '    选择题填 []（学生只能从选项里选，写法本来就固定）；没有别的正确写法也填 []。',
          '    不要把「意思相近但换了主体/时态/单复数」的句子填进来，那不是写法差异，是另一个答案。',
          '11. optionNotes 与 options 一一对应，三项都要写，每条不超过 14 个字：',
          '    正确的那项写清它为什么成立（词义、语法规则、搭配）；',
          '    错误的那两项写出它错在哪个词、哪条规则，例：「shirt 是衬衫，不是裙子」。',
          '    不许写「意思弄混了」「不符合要求」这类换个词也能用的空话。',
          '    如果你发现某两项在原句里都成立（比如 Let me / Let\'s 都能接），',
          '    就在那一项的说明里直接写「这一项也成立」——那说明这题本身不该这么出。',
          '12. 方向不是你定的：考点、层次、题型、干扰项类型都由课程给定，你不许改。',
          '    按这个方向出不来时，换一个同方向的写法（换场景、换问法、换具体词），',
          '    不许自己把考点挪到别处、不许偷偷把难度降下来。出不来就如实按方向再写一版。'
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
        if (extraKnownText(u)) lines.push(extraKnownText(u));
        lines.push('');
        lines.push('本单元句型表（题干里的句子必须来自这里或由其替换词构成；句型原文里的词也算学过）：');
        lines.push(patternsText(u));
        lines.push('');
        if (u.phonics && (u.phonics.pairs || []).length && p.cell.type === '字母组合辨音') {
          lines.push('可用语音组：' + u.phonics.pairs.map(function (x) { return x.join(' vs '); }).join('；'));
          lines.push('');
        }
        if (p.probe) {
          lines.push('这一行是错题回练：他上一轮这个考点答错了（错 ' + (p.probe.missCount || 1) + ' 次）。');
          if (p.probe.prevPrompt) {
            lines.push('上一轮那道题是（反例，不要照抄）：' + p.probe.prevPrompt);
          }
          lines.push('同考点、同层次，但题面要换个场景与问法，答案换个值。');
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
      name: '验证',
      memoryLabel: '词表 + ' + (SHT.JUDGEABLE_CHECKS || []).length + ' 条可判条款（不给学情）',
      skillLabel: '只判 pass / fail 与条款号',
      system: function () {
        return [
          '你是独立验证者。你不写题、不改题、不判分，只判这道题本身能不能进这一轮。',
          '',
          '你不知道学生是谁、他错过什么、这道题原本想考哪一层。这不是遗漏，是刻意不给：',
          '知道了你会去确认出题者的意图，而不是独立判断选项在这道题里成不成立。',
          '',
          '输出必须是 JSON：',
          '{"verdict":"pass"} 或 {"verdict":"fail","fails":[{"id":"C3","reason":""}],"note":""}',
          '',
          '判据：',
          '1. 每条检查项只能判 pass 或 fail，不许「基本可以」「建议修改」。',
          '2. 判 fail 必须给条款号 + 一句具体理由，指出是哪个词、哪个选项、哪个字段。',
          '2.1 理由控制在 20 个字以内，只写「哪儿不对」，不要复述题目、不要写分析、不要重复条款说明。',
          '    要短，但不要把关键信息砍掉：宁可换一句更短的话，也不要写成「选项有问题」这种空话。',
          '    好：「选项 2 的 near 不能加 s」；坏：「这个题目中第二个选项 nears 其实是 near 的第三人称单数形式，但是作为介词使用时不应当加 s」。',
          '3. 只判下面列出的 ' + (SHT.JUDGEABLE_CHECKS || []).length + ' 条。',
          '    其余 ' + (SHT.OUT_OF_SCOPE_CHECKS || []).length + ' 条要看同轮其它题或学生画像，你看不到，一律不要判；' +
            '判了也不算数，会被代码当无效否决丢掉。' +
            '（具体是：' + (SHT.OUT_OF_SCOPE_CHECKS || []).map(function (c) { return c.id; }).join('、') + '）',
          '3.1 判「答案唯一」时不许只盯正确答案：把另外两个选项逐个代回题干读一遍。',
          '    let / let\'s / let me、a / an、is / are、near / nears 这类同源形式最容易两项都成立；',
          '    只要有一项代回去句子也通顺且意思合理，就判 C3，并写清是哪两项、那句话读成什么。',
          '4. 知识点措辞、解析详细程度都不在你判的范围里：知识点标签是课程写的；解析只要求讲清最主要的那个错因。',
          '    以「解析没有分别说明每个错项」为由判挂，属于无效否决。',
          '5. 拿不准的按 fail 处理，理由写「拿不准：……」。',
          '6. 只输出 JSON。'
        ].join('\n');
      },
      user: function (ctx) {
        const q = ctx.question;
        const u = ctx.unit;
        const lines = [];
        lines.push('教材：' + ctx.bookName + '；单元：' + u.id + ' ' + u.title + '（' + u.titleZh + '）');
        lines.push('');
        lines.push('待检的题（只有题目本身）：');
        lines.push('- 题型：' + q.cell.type);
        lines.push('- 题干：' + JSON.stringify(q.prompt));
        if (q.audioText) lines.push('- 听力原文：' + q.audioText);
        lines.push('- 选项：' + JSON.stringify(q.options));
        const sameRoot = sameRootOptions(q.options);
        if (sameRoot.length) {
          lines.push('  注意：这几项是同源形式（' +
            sameRoot.map(function (p) { return p[0] + ' / ' + p[1]; }).join('；') +
            '），必须逐项代回题干读一遍，只要第二项也通顺就判 C3。');
        }
        lines.push('- 答案：' + q.answer);
        lines.push('- 解析：' + q.analysis);
        lines.push('');
        lines.push('本单元词表：');
        lines.push(wordsText(u));
        lines.push('');
        lines.push('允许的功能词：');
        lines.push(funcText(u));
        if (extraKnownText(u)) lines.push(extraKnownText(u));
        lines.push('本单元句型表原文（其中出现的词也算学过，不许按超纲否）：');
        lines.push(patternText(u));
        lines.push('');
        lines.push('检查项（每条二元判定，只判这些）：');
        lines.push(CHECK_TEXT());
        lines.push('');
        lines.push('判完输出 JSON。');
        return lines.join('\n');
      },
      memory: function (ctx) {
        return { checks: (SHT.JUDGEABLE_CHECKS || []).length, words: ctx.unit.words.length };
      }
    },

    /*
     * 诊断角色：只在作答之后跑，解释「他为什么选了这个、为什么排掉那些」。
     * 它不改判定结果，不改题，也不参与命题——它是课程角色的参谋。
     *
     * 输入里的「代码算出来的证据」是硬事实（差几个字母、音形键是否相同、
     * 哪些选项被排掉、花了多少秒），提示词明确要求不许推翻，只能引用。
     * 这样模型即使想编，也编不出一个和证据相反的说法。
     */
    diagnose: {
      id: 'diagnose',
      name: '诊断',
      memoryLabel: '代码证据 · 固定的错因编号',
      skillLabel: '只解释为什么，不判对错',
      system: function () {
        return [
          '你是学情诊断者。你不写题、不改题、不判对错，只解释一次作答为什么会这样。',
          '',
          '系统已经先把能算的都算过了：错选与正确答案差几个字母、读音是否接近、是不是只差一个词形后缀、',
          '另外两个选项为什么被他排掉、他花了多少秒、有没有用提示。这些是证据，不许推翻，只许引用。',
          '',
          '输出必须是 JSON：{"cause":"","why":"","confidence":0.0}',
          '',
          '约束：',
          '1. cause 只能取这些编号之一：' + (SHT.ERROR_CAUSES || []).map(function (c) { return c.id; }).join(' / ') + '。',
          '   不许自己发明说法，也不许写「基础不牢」「掌握不牢」这种放之四海皆准的话。',
          '2. why 一句话，不超过 30 个字，说清「他拿什么当成了什么」，例：把 nears 当成 near 的复数。',
          '3. confidence 取 0 到 1。证据不足以判断时给 0.2 以下，不要硬编一个听上去合理的说法。',
          '4. 只能引用给你的证据。证据里没有的东西，不要写。',
          '5. 只输出 JSON。'
        ].join('\n');
      },
      user: function (ctx) {
        const q = ctx.question;
        const d = ctx.diagnosis || {};
        const lines = [];
        lines.push('这道题：' + JSON.stringify(q.prompt));
        lines.push('正确答案：' + q.answer);
        if ((q.options || []).filter(Boolean).length) lines.push('选项：' + JSON.stringify(q.options));
        lines.push('他答的：' + JSON.stringify(ctx.picked || ''));
        lines.push('');
        lines.push('代码算出来的证据：');
        if (!(d.signals || []).length) lines.push('- （没有可用的硬证据）');
        (d.signals || []).forEach(function (s) { lines.push('- ' + s.text); });
        lines.push('- 耗时：' + Math.round((d.timing && d.timing.ms || 0) / 1000) + ' 秒' +
          (d.timing && d.timing.note ? '（' + d.timing.note + '）' : ''));
        lines.push('');
        lines.push('请判断他为什么会这样答。只输出 JSON。');
        return lines.join('\n');
      },
      memory: function () {
        return { causes: (SHT.ERROR_CAUSES || []).length };
      }
    }
  };

  // 界面四张卡直接读这里，保证卡片上的四行与真实提示词同源
  SHT.ROLE_LIST = ['plan', 'generate', 'verify', 'diagnose'].map(function (id) {
    const a = SHT.ROLES[id];
    return { id: a.id, name: a.name, memory: a.memoryLabel, skill: a.skillLabel };
  });
})(window);;
