# 来源对照表

本仓库每一块逻辑的知识来源。改动前先查这张表，避免和规范文件或主仓事实脱节。

## 一、来自主仓 `D:/vscode/Solingo-main`

| 本仓库位置 | 主仓位置 | 取了什么 | 改动 |
|---|---|---|---|
| `src/data/curriculum.js` 的 `words` / `sentencePatterns` / `phonics` / `title` | `public/quiz/data.js` 的 `U1` 节点 | 25 个词、8 条句型、4 个 phonics 词、话题域 Our School | 原样抄录，仅转成 JS 对象 |
| `src/data/curriculum.js` 的 `hostUnitId` | `src/data/quizAssessment.ts:10` | `G4-上-U1` 的 id 格式（`^G4-上-U(1..10)$`） | 无 |
| `src/core/enums.js` 的 `SKILL_CATEGORIES` | `src/engine/personalization.ts:133` | 七类 `SkillCategory`：vocab / spelling / sentence / listening / speaking / phonics / grammar | 无 |
| `src/core/enums.js` 的 `QUESTION_TYPES` | `src/data/quizAssessment.ts:336-342` | 题型与 ability 的对应关系（听音选义/中英匹配/拼写/句子/课文填空等） | 按变化轴补齐到 9 类，新增字母组合辨音、对话补全、看图说词、听写 |
| `src/core/fingerprint.js` 的 `contentFingerprint` | `src/services/remediation/questionIdentity.ts` | FNV-1a 32 位 + base36、NFKC 归一化、选项排序无关 | 语义串改为 prompt/audioText/options/answer 四段（原实现为五段并含题号前缀清理） |
| `src/core/fingerprint.js` 的 `cellFingerprint` | 无 | 新增 | 以变化轴四维为语义，防 diversity collapse |
| 知识点 id 口径（体现在示例题 `knowledgePoint`） | `src/data/quizAssessment.ts:135-141` | `${hostUnitId}:quiz-assessment:${kind}:${target}` | 模板里改用中文可读粒度，便于人工归因；并回主仓时须映射回原格式 |
| 单元词表 ≥ 8 词的约束 | `src/data/quizAssessment.ts:122-133` `choiceOptions()` | 干扰项池不足 4 会抛 `RangeError` | U1 有 25 词，满足 |

**必须注意**：主仓有三套能力维度，不可混用。

1. `SkillCategory`（7 类，`personalization.ts`）— 薄弱画像，本仓库用这套
2. `AbilityDimension`（7 类，`entities/question/types.ts`）— `Question.dimensions`
3. `SkillDimension`（4 类 listening/speaking/reading/writing，`src/types/index.ts:381`）— `quizAssessment.ts` 出题用

其它主仓约定（本仓库未违反，但并回时要注意）：学生数据只能走 `StudentWorkspace` + zustand persist（key `solingo-store-v3`），页面禁止直接访问 localStorage；本模板因为是独立实验仓库、不存真实学生信息，才用了 localStorage。并回主仓时**必须**换成 store slice。

## 二、来自三份规范文件 `../Solingo出题RSI/`

| 本仓库位置 | 规范文件与章节 | 内容 |
|---|---|---|
| `src/core/enums.js` 的 `SCENES` / `LEVELS` / `DISTRACTORS` | `出题手册.md` 3.2 变化轴 | 10 情境 / 4 层次 / 6 干扰项类型 |
| `src/core/enums.js` 的 `STAGES` | `单题出题检查表.md` 3.2 | 五阶段 → 层次 → 题型 |
| `src/core/enums.js` 的 `ERROR_TO_CELL` | `单题出题检查表.md` 第七节 | 错因 → 格子三步 |
| `src/core/checklist.js` 的 `CHECK_LAYERS` | `单题出题检查表.md` 第二至第五节 | 四层 23 条 |
| `src/app.js` 的 `renderQuestionForm` / `sampleQuestions` 九字段 | `出题手册.md` 3.1 | 位置 / 知识点 / 题干 / 选项 / 听力文本 / 答案 / 一句解析 / 格子标记 / 闭环层 L4 |
| `src/core/checklist.js` 的 `QUALITY_GATE` | `出题手册.md` 3.3 | 八条清单 |
| `src/core/checklist.js` 的 `SELF_CHECK_TEN` | `单题出题检查表.md` 第十节 | 自检十问 |
| `src/data/curriculum.js` 的 `allowedFunctionWords` | `出题手册.md` 6 节第 7 条 | 通用功能词白名单，防按字面判超纲把每题都判死 |
| `src/app.js` 的 `buildExclusionList` 调用 | `出题手册.md` 4 节补充、5.2 第 6 步 | 记忆库必须在下一轮规划之前查，事前排除 |
| 「同一考点同类题最多 2 次」 | `出题手册.md` 1 节第 6 条（源自 CSDN 实测） | `fingerprint.js` 的 `isPointTypeFull` |
| 五道题 × 两轮、三个指标 | `出题手册.md` 第 5 节 / `最小测试记录表.md` | 最小测试规程 |
| 导出的 JSON 字段 | `最小测试记录表.md` 逐题表与轮次汇总 | round / questions / indicators |
| 界面绿色主题、自解释标注、少按钮 | 项目长期记忆中的视觉偏好 | 无 emoji、无渐变、每块面板自带说明 |

九个字段在界面里的落点（避免把「输入框数量」误当成「字段数量」）：「位置」由顶栏单元选择 + 中列题号导航全局承载，不逐题重复填；「格子标记」在左侧配额表指定，中列只展示不可改；「知识点」在中列拆成「知识点」与「七类能力」两个输入框；「选项」是 3 个输入框同属一个字段；「质检结论」为只读展示，不计入字段。

## 三、来自两篇外部材料

| 判断 | 来源 | 落点 |
|---|---|---|
| 先规划后生成、一次只生成一题 | CSDN《Agent自出题教学实践》2.2 | 左列配额表强制先于中列题目卡；中列一次只显示一题 |
| 同一考点同类题最多两次，第三次必须换角度 | 同上 4.1 避坑表 | `isPointTypeFull` |
| 退回要写明违反哪一条（过程级信号） | 知乎 RSI 综述解读 5.5 | 右列每条挂了都留条款号 |
| 验证器硬度决定改进上限 | 同上 5.2 / 总结 | 右列 23 条二元判定，不设「基本可以」 |
| diversity collapse 源于收敛到易过关题带 | 同上 5.3 | 变化轴 + 格子指纹 + 第 2 轮撞格子高亮 |
| 生成方自查只能当线索不能当通过依据 | 两篇交叉 | 界面没有「让模型自查」入口，检查全部由人独立点 |

## 四、本仓库自己新增的（无外部来源）

- 按「变化轴四维」而非题干文本算格子指纹
- 确定性 `generateCells()`：按固定步长遍历组合，跳过历史已用格子，保证可复现
- 第 2 轮保留知识点、换格子、清空题目内容的初始化方式
- 把「提前结束」做成底栏可勾选项并要求填依据
