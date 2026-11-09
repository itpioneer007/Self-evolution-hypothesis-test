/*
 * 变化轴四维 + 五阶段 + 七类能力
 * 来源：出题手册 3.2 / 单题出题检查表 第三节 / 主仓 personalization.ts 的 SkillCategory
 * 「题不一样」的可计算定义 = 落在不同格子，不是措辞不同。
 */
(function (root) {
  const SHT = (root.SHT = root.SHT || {});

  // 题型与主仓 quizAssessment.ts 的 frontendType / ability 对齐
  SHT.QUESTION_TYPES = [
    { id: '听音选义', ability: 'listening / vocab', frontendType: '单选题' },
    { id: '中英匹配', ability: 'vocab', frontendType: '单选题' },
    { id: '拼写补全', ability: 'spelling', frontendType: '单选题' },
    { id: '字母组合辨音', ability: 'phonics', frontendType: '单选题' },
    { id: '选词填空', ability: 'grammar / sentence', frontendType: '单选题' },
    { id: '句子判断', ability: 'grammar / sentence', frontendType: '单选题' },
    { id: '对话补全', ability: 'sentence', frontendType: '单选题' },
    { id: '看图说词', ability: 'speaking', frontendType: '口语题' },
    { id: '听写', ability: 'listening / spelling', frontendType: '填空题' }
  ];

  // 小学生生活域；超出此表即判「情境不适宜」
  SHT.SCENES = [
    '学校', '家庭', '食物饮料', '动物', '颜色形状',
    '数字时间', '天气季节', '身体与衣物', '交通出行', '玩具游戏'
  ];

  SHT.LEVELS = ['认', '辨', '用', '表达'];

  SHT.DISTRACTORS = ['同类不同物', '形近', '音近', '语义近', '语法错形', '母语负迁移'];

  // 五阶段 → 该给的层次 / 该用的题型（单题出题检查表 3.2）
  SHT.STAGES = [
    { id: '未接触', level: '认', types: ['听音选义', '中英匹配'] },
    { id: '刚有印象', level: '辨', types: ['字母组合辨音', '拼写补全', '句子判断'] },
    { id: '正在操练', level: '用', types: ['选词填空', '句子判断', '对话补全'] },
    { id: '会用但生疏', level: '用', types: ['对话补全', '选词填空'] },
    { id: '已稳定', level: '表达', types: ['看图说词', '听写'] }
  ];

  // 七类能力（主仓 src/engine/personalization.ts:133 的 SkillCategory）
  SHT.SKILL_CATEGORIES = [
    'vocab', 'spelling', 'sentence', 'listening', 'speaking', 'phonics', 'grammar'
  ];

  // 错因 → 格子（单题出题检查表第七节）
  SHT.ERROR_TO_CELL = [
    { pattern: '形近', level: '辨', distractor: '形近', types: ['拼写补全', '中英匹配'] },
    { pattern: '第三人称单数', level: '用', distractor: '语法错形', types: ['选词填空', '句子判断'] },
    { pattern: '听不出', level: '辨', distractor: '音近', types: ['听音选义', '字母组合辨音'] },
    { pattern: '复数', level: '用', distractor: '语法错形', types: ['选词填空', '句子判断'] },
    { pattern: '近义', level: '用', distractor: '语义近', types: ['选词填空', '对话补全'] }
  ];

  SHT.cellKey = function (cell) {
    return [cell.type, cell.scene, cell.level, cell.distractor].join('|');
  };
})(window);
