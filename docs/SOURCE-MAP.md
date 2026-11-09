# 来源对照表

本仓库每一块逻辑的知识来源。改动前先查这张表，避免和规范文件或主仓事实脱节。

## 零、教材数据（`src/data/textbook.js`）

2026-11-09 抓取，整册入库，按单元切片。

| 环节 | 值 |
|---|---|
| 目录页 | `https://englishanchor.online/downloads/textbooks/` |
| 教材索引 | `https://media.englishanchor.online/ChinaTextbook-hf/search.json`（`books[]`，2027 本，含 `stage / subject / edition / grade / path / parts[]`） |
| 下载源 | Hugging Face 数据集 `RainPPR/china-textbook-2021-hf`，经 `hf-mirror.com` 取回（直连 huggingface.co 本机被拦） |
| 文件 | `小学/英语/人教版（PEP）（三年级起点）（主编：吴欣）/义务教育教科书·英语（PEP）（三年级起点）四年级上册.pdf`，8.9 MB / 82 页 |
| 抽取 | PyMuPDF 逐页 `get_text()`，28,248 字；再按附录 1「Words in each unit」与各页 Let's learn / Let's talk / Let's spell 校对 |
| 入库字段 | 单元 id、标题、页码、情境域、词表（词 / 义 / 书上页码）、句型表、语音点（焦点 / 对比词对）、功能话题 |
| 未入库 | 课文原文、插图、音频、音标（PDF 里是嵌入字体，抽取为乱码） |

选了「人教版（PEP）三年级起点 四年级上册」的三条理由：① 站点索引里这是小学英语 26 个版本之一、本册 6 个单元结构完整；② 单元主题（教室 / 书包 / 朋友 / 家 / 晚餐 / 家庭）正好覆盖界面 `SCENES` 枚举里的学校、家庭、食物饮料三个域；③ 模板原先手抄的「G4-上-U1」在这个版本里能对上真实单元 `My classroom`。

`src/data/curriculum.js` 不再持有教材数据，只做派生：`SHT.setUnit(unitId)` 把该书某个单元切片成 `SHT.curriculum`（词表 / 句型 / 语音 / 情境域 / 功能词白名单）。换单元时四样同时换，否则超纲判定会拿错单元的边界。

## 一、来自主仓 `D:/vscode/Solingo-main`

| 本仓库位置 | 主仓位置 | 取了什么 | 改动 |
|---|---|---|---|
| `src/data/textbook.js` 的单元结构 | `public/quiz/data.js` 的 U1 节点 | 「单元 → 词表 / 句型表 / 语音点 / 话题域」这套形状 | 数据改取自官方教材 PDF；形状对齐主仓，便于并回 |
| `src/data/knowledgePoints.js` 的 `source` / `example` | 同上 + `src/data/wrongCases.js` 三条错因 | 候选知识点的教材依据与示例问法 | 按单元生成，只由该书词句与错因推导，不引入单元外词句；示例问法只展示，不自动写进题干 |
| `src/data/curriculum.js` 的 `hostUnitId` | `src/data/quizAssessment.ts:10` | `G4-上-U1` 的 id 格式（`^G4-上-U(1..10)$`） | 无 |
| `src/core/enums.js` 的 `SKILL_CATEGORIES` | `src/engine/personalization.ts:133` | 七类 `SkillCategory`：vocab / spelling / sentence / listening / speaking / phonics / grammar | 无 |
| `src/core/enums.js` 的 `QUESTION_TYPES` | `src/data/quizAssessment.ts:336-342` | 题型与 ability 的对应关系（听音选义/中英匹配/拼写/句子/课文填空等） | 按变化轴补齐到 9 类，新增字母组合辨音、对话补全、看图说词、听写 |
| `src/core/fingerprint.js` 的 `contentFingerprint` | `src/services/remediation/questionIdentity.ts` | FNV-1a 32 位 + base36、NFKC 归一化、选项排序无关 | 语义串改为 prompt/audioText/options/answer 四段（原实现为五段并含题号前缀清理） |
| `src/core/fingerprint.js` 的 `cellFingerprint` | 无 | 新增 | 以变化轴四维为语义，防 diversity collapse |
| 知识点 id 口径（体现在示例题 `knowledgePoint`） | `src/data/quizAssessment.ts:135-141` | `${hostUnitId}:quiz-assessment:${kind}:${target}` | 模板里改用中文可读粒度，便于人工归因；并回主仓时须映射回原格式 |
| 单元词表 ≥ 8 词的约束 | `src/data/quizAssessment.ts:122-133` `choiceOptions()` | 干扰项池不足 4 会抛 `RangeError` | 该书 6 个单元最少 14 词（U4），全部满足 |
| `src/data/wrongCases.js` 错题案结构 | `src/types/index.ts:310-351` `WrongQuestion` | 业务键 id、首次证据冻结、`variantAttempts[]` 追加、`masteryState` 状态机 | 精简掉媒体/语音/AI 讲解/内容版本；补 `category` 与 `errorCause` |
| `src/core/wrongBook.js` 的 `isQualifiedEvidence` | `src/entities/attempt/evidencePolicy.ts:3-8` | 模拟 / 自述 / 未观测证据不算数 | 模板默认 `scoringMethod: 'exact'` |
| `src/core/wrongBook.js` 的 `projectWeaknesses` | `src/entities/weakness-projection/projectWeaknesses.ts:194-295` | 按知识点分组、优先级打分、队列状态、`remediationLoopCount >= 2` 转人工 | 去掉 assessmentRecords 与证据分类，按中文知识点粒度分组 |
| `src/core/wrongBook.js` 的 `certify` / `thresholdForLayer` | `src/entities/remediation-certification/completeRemediationCertification.ts:5-68` | 恰好 5 题、无提示无重试、A 90 / B 80 / C 70 | 模板固定 B 层；「已订正不等于已掌握」保留 |
| `src/core/practice.js` 的判定与写回 | 无直接对应（主仓作答在答题页内完成，没有独立的「变体探针」） | 「答对一道 ≠ 会这个考点」这一问题意识 | 新增：判对错、同考点变体、四态判据、错题 upsert。证据字段仍走主仓 `WrongQuestion` / `ExerciseAttempt` 形状 |
| 03 错题卡展示列 | `src/pages/progress/WrongQuestionCard.tsx:104-251` | 知识点 / 原题 / 首次答案 vs 正确答案 / 用时·提示·重试 / 掌握状态 | 压成一张卡：左半是题，右半是「出题要点」（知识点 · 能力 · 错因 · 建议角度 · 再错则 · 教材依据），去掉媒体与题解展开 |

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
| `src/app.js` 的 `renderExecutePanel` / `sampleQuestions` 九字段 | `出题手册.md` 3.1 | 位置 / 知识点 / 题干 / 选项 / 听力文本 / 答案 / 一句解析 / 格子标记 / 闭环层 L4 |
| 04 日志 停止信号 SATURATED / STALLED | `演示项目档案_RSIAgent论文精华.md`、v5 演讲稿 P14 | 论文停止决策的两个信号 | 必须同时写依据才计入「是否提前结束」指标 |
| `src/core/checklist.js` 的 `QUALITY_GATE` | `出题手册.md` 3.3 | 八条清单 |
| `src/core/checklist.js` 的 `SELF_CHECK_TEN` | `单题出题检查表.md` 第十节 | 自检十问 |
| `src/data/textbook.js` 的 `meta.allowedFunctionWords` | `出题手册.md` 6 节第 7 条 | 全册通用功能词白名单，防按字面判超纲把每题都判死；切片时复制进 `SHT.curriculum` |
| `src/app.js` 的 `buildExclusionList` 调用 | `出题手册.md` 4 节补充、5.2 第 6 步 | 记忆库必须在下一轮规划之前查，事前排除 |
| 「同一考点同类题最多 2 次」 | `出题手册.md` 1 节第 6 条（源自 CSDN 实测） | `fingerprint.js` 的 `isPointTypeFull` |
| 五道题 × 两轮、三个指标 | `出题手册.md` 第 5 节 / `最小测试记录表.md` | 最小测试规程 |
| 导出的 JSON 字段 | `最小测试记录表.md` 逐题表与轮次汇总 | round / questions / indicators |
| 浅蓝 + 蓝主题、少按钮、不写解释性长句 | 用户 2026-11-09 明确要求（覆盖此前绿色偏好） | 无 emoji、无渐变、字体与卡片放大；页面只写数据与动作，设计理由留在 Markdown |
| `src/data/knowledgePoints.js` 的 `label` | `单题出题检查表.md` 第三节 | 知识点颗粒度到错因，不写「词汇」「语法」这种空标签 |
| `src/data/knowledgePoints.js` 的 `cell` | `出题手册.md` 3.2 / `单题出题检查表.md` 第七节 | 每条候选自带建议格子；同一单元内格子互不相同（U1 8 条、U2–U6 各 5 条），第 2 轮不会开局撞车 |
| `src/data/knowledgePoints.js` 的 `nextIfWrong` | `出题手册.md` 3.1 第 9 字段（闭环层 L4） | 答不上来「他错了下一轮出什么」的候选不允许进清单 |
| 界面候选下拉与「用这个」 | 用户 2026-11-09 反馈「不知道填什么内容」 | 补的是**输入层**：静态教材数据确定性带出 4 项，不接模型、不自动生成题目 |
| 顶栏单元下拉 | 用户 2026-11-09「爬一本教材当知识库，以后都围绕这本书出题」 | 切单元时词表 / 句型 / 语音 / 情境 / 候选 / 示例错题一起重建；只换词表会让超纲判定失效 |

候选清单同时是**以后自动生成器的输出规格**：接模型时让它按 `label / ability / cause / why / source / example / cell / nextIfWrong` 产出候选，人只守 23 条判据。它不是答案库，不参与判分。

九个字段在界面里的落点（避免把「输入框数量」误当成「字段数量」）：「位置」由顶栏轮次 + 01 出题 执行智能体的题号导航全局承载，不逐题重复填；「格子标记」在课程智能体的配额表指定，生成面板只展示不可改；「知识点」在生成面板拆成「知识点」与「七类能力」两个输入框；「选项」是 3 个输入框同属一个字段；「质检结论」为只读展示，不计入字段。

## 三、来自两篇外部材料

| 判断 | 来源 | 落点 |
|---|---|---|
| 先规划后生成、一次只生成一题 | CSDN《Agent自出题教学实践》2.2 | 01 出题 角色按流程顺序排列；执行智能体一次只显示一题 |
| 同一考点同类题最多两次，第三次必须换角度 | 同上 4.1 避坑表 | `isPointTypeFull` |
| 退回要写明违反哪一条（过程级信号） | 知乎 RSI 综述解读 5.5 | 验证智能体每条挂了都留条款号，04 日志 自动汇总分布 |
| 验证器硬度决定改进上限 | 同上 5.2 / 总结 | 验证智能体 23 条二元判定，不设「基本可以」 |
| diversity collapse 源于收敛到易过关题带 | 同上 5.3 | 变化轴 + 格子指纹 + 第 2 轮撞格子高亮 |
| 生成方自查只能当线索不能当通过依据 | 两篇交叉 | 界面没有「让模型自查」入口，检查全部由人独立点 |

## 四、本仓库自己新增的（无外部来源）

- 按「变化轴四维」而非题干文本算格子指纹
- 确定性 `generateCells()`：按固定步长遍历组合，跳过历史已用格子，保证可复现
- 第 2 轮保留知识点、换格子、清空题目内容的初始化方式
- 三个 tab 的信息分层：tab → 角色 → 检查层，单屏只呈现一个主面板
- `ERROR_CAUSES` 结构化错因分类与 `suggestCell()`：主仓错因是 AI 自由文本，这里补成可计算枚举并回写规划
- `appendVariantAttempt()` 的简化：连续答错累加 loopCount，>= 2 转 `teacher-help`（主仓是「两轮补救未过」）
- 把「提前结束」从单个勾选改成 04 日志 的 SATURATED / STALLED 双信号 + 必填依据
- `src/core/practice.js` 的 `buildVariant()`：按题型从本单元教材数据确定性派生「同考点、同格子、换表面、换答案」的变体。出题要换格子，探针要同格子换表面——两条判据方向相反，这是本仓库的原创判断
- `SHT.VARIANT_RULES` 四条铁律 + `auditVariant()` 出口硬校验：答案必须与原题不同、原答案留作干扰项（防答案惯性）、题干不许出现答案原词、答案必须落在自己的选项里。不满足就返回 `null`，按接不出变体处理
- `judgePoint()` 四态判据：真会 / 会用 / 只记住这道题 / 不会（外加用了提示一律降级）。「换掉题面、换掉答案还答对才算会」
- `upsertWrongCase()`：作答侧写错题时按考点去重，首次证据不覆盖
- `tools/smoke-test.js`：最小 DOM 模拟的零依赖自检脚本（含答题 → 判定 → 变体 → 错题的整条链路）

## 五、四个 tab 与原流程图的对应

用户最初给的五环节流程图（`Solingo汇报_v5_五段版` P14，演讲稿同页）：学生画像 → 命题规划 → 题目生成 → 独立质检 → 记忆库 → 组卷与停止。论文角色对照见同页：

| 原图环节 | 论文角色 | 本仓库落点 |
|---|---|---|
| 1 命题规划 | 课程智能体 | 01 出题 · 左侧第一张卡 |
| 2 题目生成 | 执行智能体 | 01 出题 · 左侧第二张卡 |
| 3 独立质检 | 验证智能体 | 01 出题 · 左侧第三张卡 |
| 学生画像 → 错因 | 学生侧回边 | 03 错题（每题右侧「出题要点」） |
| 作答与判定（原图没有的一步） | 无 | 02 答题：一题两枪，对就换考点，错就换同考点的变体，还错写错题 |
| 4 记忆库 | 持久记忆 | 04 日志 · 已占用角度 + 打回缘由 + 每题的作答 |
| 5 组卷与停止 | 停止决策 | 04 日志 · 底部停止条 + 顶部 5 个 KPI |

界面呈现上把三个角色画成「同一模型的三套配置」：卡片上直接标 提示词 / 记忆 / 技能，其中执行智能体的记忆只给本单元词表，与课程智能体的「上轮角度 + 薄弱画像」刻意不同。
