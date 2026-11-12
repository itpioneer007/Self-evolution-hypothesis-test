/*
 * 单题四层 23 条检查项
 * 来源：单题出题检查表.md 第二至第五节
 * 每条都是可二元判定的问句；「挂了」必须写条款号，供记忆库沉淀过程级信号。
 *
 * needs 标的是「判这一条需要什么」，不是「重不重要」：
 *   ''        只看题目本身就够判
 *   'label'   要看知识点标签（标签是课程写的，不归验证判）
 *   'plan'    要看课程声明的层次/干扰项类型（那是出题意图，看了就会去确认意图）
 *   'round'   要看同轮其它题（单题调用里根本不存在）
 *   'student' 要看学生画像与历史（刻意不给，防同情）
 *
 * 标了 needs 的条目，验证角色一律看不到也判不了。以前 23 条一股脑塞给它，
 * 其中 8 条它拿不到判定所需信息，只能编——失败日志里那些空话有一部分就是这里来的。
 */
(function (root) {
  const SHT = (root.SHT = root.SHT || {});

  SHT.CHECK_LAYERS = [
    {
      id: 'content',
      name: '内容层',
      note: '题本身对不对 · 一票否决',
      items: [
        { id: 'C1', text: '知识点单一、可命名，颗粒度到错因', needs: 'label' },
        { id: 'C2', text: '单元归属四查：词表 / 句型表 / 语法进度 / 话题域' },
        { id: 'C3', text: '答案唯一；每个错项都说得出为什么错（审核者说得出即可，不要求解析逐项罗列）' },
        { id: 'C4', text: '题干自洽：条件够、无冗余、无两种读法' },
        { id: 'C5', text: '语言正确：拼写 / 大小写 / 复数 / 连字符与教材一致' },
        { id: 'C6', text: '听力题音文一致' },
        { id: 'C7', text: '语音可读：TTS 不会读错、连读不出歧义' },
        { id: 'C8', text: '配图题图文一致，不能看图就猜对' }
      ]
    },
    {
      id: 'fit',
      name: '适配层',
      note: '这道题对这个考点有没有用 · App 区别于考试之处',
      items: [
        { id: 'F1', text: '冲具体错因，不是冲分数', needs: 'student' },
        { id: 'F2', text: '五阶段与题型、层次匹配', needs: 'plan' },
        { id: 'F3', text: '兴趣载体是他学过的词，没引入生词' },
        { id: 'F4', text: '一题只一个难点，无叠加负荷' },
        { id: 'F5', text: '情绪安全，不指向他上次做错', needs: 'student' },
        { id: 'F6', text: '可承受失败：想一想能做出来' }
      ]
    },
    {
      id: 'paper',
      name: '卷面层',
      note: '放进这一轮合不合适 · 只看单题查不出来',
      items: [
        { id: 'P1', text: '与同轮其它题不在同一格', needs: 'round' },
        { id: 'P2', text: '相邻题难度差不超过一档', needs: 'round' },
        { id: 'P3', text: '同题型不连续超过 2 道', needs: 'round' },
        { id: 'P4', text: '单题时长 20–40 秒' },
        { id: 'P5', text: '位置合适：首题给信心，末题不留挫败', needs: 'round' }
      ]
    },
    {
      id: 'loop',
      name: '闭环层',
      note: '错了之后能不能被用起来 · 最容易漏',
      items: [
        { id: 'L1', text: '解析教会：错在哪 + 为什么 + 正确是什么，≤25 字' },
        { id: 'L2', text: '错了能归到知识点 id 和错误类型' },
        { id: 'L3', text: '带格子标记，可去重' },
        { id: 'L4', text: '答得出「他错了，下一轮出什么」' }
      ]
    }
  ];

  SHT.ALL_CHECKS = SHT.CHECK_LAYERS.reduce(function (acc, layer) {
    return acc.concat(layer.items.map(function (item) {
      return Object.assign({ layer: layer.id, layerName: layer.name, needs: '' }, item);
    }));
  }, []);

  // 只看题目本身就能判的条目。验证角色的提示词只列这些，其余由代码判或直接不判。
  SHT.JUDGEABLE_CHECKS = SHT.ALL_CHECKS.filter(function (c) { return !c.needs; });
  SHT.OUT_OF_SCOPE_CHECKS = SHT.ALL_CHECKS.filter(function (c) { return !!c.needs; });

  // 非检查项类的退回原因（规划、配额、放弃、接口失败）。课程角色读「为什么没出成」
  // 时需要一个看得懂的说法，不能给它 PLAN_SCOPE 这种短码。
  SHT.CODE_TEXT = {
    PLAN_SCOPE: '考点不在这一轮选定的范围内',
    PLAN_LEVEL_CAP: '层次超过了学生当前的上限，已降回',
    PLAN_RETIRED: '这个考点已经真会到顶，不用再考',
    PLAN_DUP: '考点与前面重复',
    PLAN_SWITCH_KP: '这个考点造不出可信的干扰项，换成了相近的考点',
    BENCH_UP: '这一格没出成，替补顶上',
    PLAN_EMPTY: '规划返回里没有能用的考点',
    QUOTA_OVER: '超出这一轮的能力配额',
    QUOTA_SHORT: '配额里的这一类没给够',
    VERIFY_SOFT: '只是嫌解析写得不够细，题面没过错',
    VERIFY_NO_CODE: '判了不通过，但没给条款号',
    VERIFY_OUT_OF_SCOPE: '判了它看不到信息的条款',
    GIVE_UP: '连续三次都没过闸',
    EXCEPTION: '程序异常'
  };

  SHT.codeLabel = function (id) {
    const c = (SHT.ALL_CHECKS || []).filter(function (x) { return x.id === id; })[0];
    if (c) return c.id + ' ' + c.text;
    return SHT.CODE_TEXT[id] || id;
  };

  // 出题手册 3.3 的八条清单 → 界面上的快速质检（与四层检查表并列，不替代）
  SHT.QUALITY_GATE = [
    '不超纲', '答案唯一', '干扰项有诊断价值', '听力和题干一致',
    '拼写口径统一', '难度对画像', '情境适宜', '解析说人话'
  ];

})(window);
