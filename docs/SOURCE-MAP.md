# 来源对照表

本仓库每一块逻辑的知识来源。改动前先查这张表，避免和规范文件或主仓事实脱节。

## 零、教材数据（`src/data/books.js` 注册表 + 一本一文件）

2026-11-09 抓取，整册入库，按单元切片。2026-11-10 起改为注册表：一本教材一个文件，统一契约（`meta` + `units` + `allowedFunctionWords`），结构与来源见第六节。

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

## 六、接模型与多版本教材（2026-11-10 增补）

### 6.1 三本教材，同一注册表

抓取路径同第一节：目录页 `englishanchor.online/downloads/textbooks/` → 索引 `media.englishanchor.online/ChinaTextbook-hf/search.json`（2027 本）→ Hugging Face 数据集 `RainPPR/china-textbook-2021-hf`。索引与 PDF 都要带 Chrome UA + `Referer: https://englishanchor.online/`，否则 Cloudflare 返回 403。

| 文件 | 版本 | 单元数 | 词条 | 文本层 | 备注 |
|---|---|---|---|---|---|
| `src/data/textbook.js` | 人教 PEP（三起）四上 | 6 | 104 | 82 页 / 28,248 字 | 唯一有候选知识点清单（33 条）的册子；书后 `Words in Each Unit` 有文本层 |
| `src/data/books/hebei-g4a.js` | 冀教（三起）四上 | 4 | 77 | 28321 字 | 全角字符（`Ｕｎｉｔ１`）需 NFKC 归一化 + 去软连字符；无语音板块，`phonics` 留空 |
| `src/data/books/xiangshao-g4a.js` | 湘少版四上 | 12 | — | 23991 字 | 书后 Word List 是图片，词表由 `Let's Learn` / `Structures` 正文取词，因此超纲判定边界更窄（已写进 `meta.notes`） |

排除的版本：沪教版四上、外研社陈琳版四上——PDF 文本层 0 字符（扫描版），**没有文本层的册子不入库**，不靠 OCR 猜。

换书必须五样一起换（词表 / 句型 / 语音点 / 情境域 / 功能词白名单），因为超纲判定拿的是当前单元的边界；只换词表会让 V1 用错边界。`SHT.kpsOf` 只在 PEP 四上返回候选清单，其余册子返回空——不借别册候选，界面显示「本册无候选清单 · 考点由规划环节现场提」。

### 6.2 三角色：同一模型的三个「专家」

用户提的原话是「这三个角色可能更像 workbuddy 里面不同专家的机制」，落点就是 `src/core/agents.js`：不是三个模型，是三次调用给不同的 `system` / `user` / `memory`。

| 角色 | 记忆（`memory()`） | 故意不给的 |
|---|---|---|
| 规划 plan | 错题画像 priority / 已真会 / 已占用角度 | 不给词表全文之外的题面 |
| 生成 generate | 只有本单元词表与句型 | **不给学生画像**——知道学生弱会不自觉把题出简单，难度该由规划的 `level` 决定 |
| 质检 verify | 词表 + 四层 23 条 | **不给画像**——会同情，把「他做不出来」当成「题有问题」 |

### 6.3 代码闸：`src/core/validate.js`

判据全部来自 `../Solingo出题RSI/单题出题检查表.md` 的四层 23 条里**能被代码复算**的那部分，不抄原文（原文含大量需要人判断的项），只取可计算项并改成逐词/逐条判定：

| 闸号 | 取自 | 为什么必须是代码 |
|---|---|---|
| V1 超纲 | 「不许出现没教过的词」 | 模型默认往「更地道」写，提示词写多少遍都不如逐词查表 |
| V2 答案在选项 / V3 选项互异 | 卷面层 | 机械可查 |
| V3c 拼写题干扰项必须是近似错拼 | 本次浏览器 E2E 发现（见 6.5） | V1 对拼写题跳过选项检查，不补这一条，`curtain` 这种真词能混进拼写题 |
| V4 题干泄答案 | 卷面层 | 正则可判 |
| V5 解析长度与空话 | 「解析不超过 25 字、不说本题考查」 | 字数与黑名单可判 |
| V6 听力音文一致 | 「听力题必须有原文」 | 字符串比对可判 |
| V7 归属枚举 / V8 同轮同格 | 变化轴四维 | 格子指纹可复算 |

原则：**代码闸有通过权，模型质检只有否决权**。模型质检挂掉时不废题（标 `unverified`），模型只说 fail 不给条款号时按无效否决处理（标 `weak`）。

### 6.4 新判据的两个来源

- `V3c`：拼写题过去对选项完全不查（干扰项本来就是故意写错的词），实测 `trousers / curtain / zebra` 能过闸。改用编辑距离（Damerau，允许一次相邻颠倒），阈值 `词长/4`，`curtain` 判不过、`sheo / sohe / blakboard` 判得过。**不用纯 Levenshtein**：`sheo / shoe` 会被算成两次替换，把合法干扰项误判成差太远。
- `PLAN_DUP`：`src/core/pipeline.js` 里规划完成后按考点文本去重（小写 + 压空白后比）。模型偶尔把同一考点换个说法给两条，出出来就是两道同考点的题——宁可这一轮少一道，也不出两道重复的，被去掉的写进失败记录不静默吞掉。

### 6.5 两个测试工具

- `tools/smoke-test.js`：Node 里给 `SHT.llm.call` 打桩，验的是流水线逻辑（含 v1 数据迁移）。
- `tools/e2e-browser.js`：起一个说 DeepSeek 协议的本地 mock 服务 + 无头 Edge，让**页面真的发 fetch**，验的是 smoke-test 验不到的那截（浏览器 fetch、CORS、JSON 解析、事件回调、按钮接线）。mock 刻意注入四种失败：拼写假干扰项、质检否决、无效否决、连续不过闸，逐个断言有没有留痕。`V3c` 和 `PLAN_DUP` 都是这个工具跑出来的，不是想出来的。


## 七、接真模型之后补的东西（2026-11-10 晚，真 key 跑通后）

首轮真跑（`deepseek-flash`，30 次调用 / 3.4 万 token / 约 50 秒）暴露的问题，全部是「判据太硬」或「提示词没说清」，不是模型不行。逐条记下来，因为它们比任何设计文档都准：

| 症状 | 根因 | 改法 |
|---|---|---|
| 0 题通过，V1 判 `cake`/`cat` 超纲 | 语音板块的对比词对不在词表里 | `knownSet` 并入 `phonics.pairs` 与 `extras` |
| 引用课文的题被判超纲（`TV` / `many`） | 教材句型原文里的词没进允许集合 | `knownSet` 并入 `sentencePatterns` 的分词 |
| 解析写「black + board」被判超纲 | 解析拆解词根时会引用答案的组成部分 | 解析豁免：答案的子串不算生词 |
| 解析引用选项里的错拼被判超纲 | 拼写题解析必然提到 `blakboard` 这类错拼 | 解析豁免：本题任何选项都算 |
| 听音选义永远 V6 不过 | 朗读的是英文、答案是中文，`audioText !== answer` 恒成立 | 中文答案只要求原文非空；另加「题干不许把要听的词写出来」 |
| 书面辨音题被 V6 判音文不一致 | 模型顺带给的 `audioText` 被当成硬要求 | 只有题干要求「听」的题才查音文一致 |
| 变体接不出 | 变体由代码派生，却没过同一道闸 | `buildVariant` 末尾过 `validateQuestion`，不过就当接不出 |
| 变体被 V3c 判「干扰项不是错拼」 | 探针铁律三要求把原答案留在选项里当诱饵 | `validateQuestion({exempt})` 豁免诱饵 |
| 质检反复以「解析没逐项罗列」退题 | 解析限 30 字，逐项罗列写不下，重出三次也改不好 | 软否决：理由全部指向解析时采纳并标 `soft` / `needs-polish` |
| 质检拿词表否掉 phonics 题 | 质检不知道语音词对也算学过 | verify 提示词里补语音词对与句型原文 |

### 7.1 这一轮新加的三个机制

- **选定考察范围**：`state.kpScope`（候选知识点的 id 数组）→ `runRound({scope})` → 规划提示词里列成「本轮考点范围，kp 原样照抄」，代码再硬校验一遍（不在范围内记 `PLAN_SCOPE` 并丢弃）。范围只有 N 个时最多出 N 题，不硬凑。
- **三份智能体记忆**：`src/core/agentMemory.js`。plan 记角度与考点、generate 记最常被退回的条款、verify 记自己被判无效否决的次数；`commit()` 是纯函数，`recallText()` 拼进对应角色的下一次调用。界面卡片上直接显示「已记 N 轮」。
- **软否决**：质检的否决按理由分级。指向解析的否决不废题（解析可以事后再润一句），指向题面的才退回重出。

### 7.2 真跑怎么复现

```
DEEPSEEK_API_KEY=sk-xxx node tools/live-run.js
```

`tools/live-run.js` 走的是页面同一条代码路径，模拟一个确定性的学生（第 1 题不会、第 2 题只记住、第 3 题换角度才会、其余真会），把「选范围 → 出题 → 作答 → 错题 → brief → 第二轮」整条链跑两轮并逐条断言。key 只从环境变量读，不落盘、不进仓库。

## 八、能力配额与失败重试（2026-11-10 晚）

### 8.1 题量不是数字，是一张小表

以前一轮只说「出 5 题」，结果是模型爱出什么出什么——5 题全考词汇也合规，语法一次没考。现在这一轮要带一张「能力 → 条数」的表：

```
{ source: 'scope', total: 3, byAbility: { spelling: 1, sentence: 1, listening: 1 }, note: '按勾选的 3 个考点分配' }
```

`src/core/quota.js` 一个模块管完。四类来源产出同一个形状，所以接学生画像时**只换来源、不改下游**：

| source | 什么时候用 | 名额怎么分 |
|---|---|---|
| `profile` | 项目对接后传学生画像进来 | 错得多、最近错的先拿（`wrongCount × 近因`） |
| `brief` | 没画像时最接近画像的东西：错题清单 | 同上，输入换成 `brief.priority` |
| `scope` | 勾了本轮考点范围 | 按范围里的能力分布，范围 N 个最多 N 条 |
| `unit` | 都没勾也没错题 | 按本册候选清单的能力分布，或默认顺序铺开 |
| `manual` | 人点过 ＋/− | 只取整，不重排；此后自动重算不再覆盖它 |

分配算法（`allocate`）：名额够时先每类各 1 个，余下按权重比例分；重试的确定性是硬要求——同输入必得同输出，否则两轮之间分不清「是模型变了还是配额变了」。**不用「轮流加」**：那样 9:1 和 3:1 都算成 3:2，权重等于没用。

代码闸（`quota.apply`）只做两件事：超额的能力剔掉多余条目（记 `QUOTA_OVER`）；配额里没有的能力，**只要总名额还空着就收下**（记 `extra`，不算失败）。第二条是实跑校准出来的：按本册候选清单自动算配额时，清单里没有 `listening`，一上来就把听力题全剔了。配额要防的是「一轮全考词汇」，不是禁止考清单外的一类。

### 8.2 界面：为什么不在计划表加两列

计划表已经七列（题号 / 考什么 / 题型 / 场景 / 层次 / 错项 / 挑错结果），再加「能力」「题量」两列会挤掉知识点输入框。配额是「这一轮各类各几条」的判断，本来就该横着看，所以做成计划表上方一行：七类能力各一个 chip，显示 `已排/配额`，点 − ＋ 改，右侧「共 N 条」和「重算」。

题号列里带一个能力小字（`1 / 词汇`），和 chip 对得上，不加列。

跑过模型之前 chip 只显示配额数字——此时计划表里是预置示例题，显示「已排」没有意义，还会被误当成 bug。

### 8.3 没出成题的考点要回灌

失败记录只解决「留痕」，不解决「下一次补上」。`progress.commit` 现在把 `stage='giveup'` 的考点写进 `retry` 队列，`planHint` 带出来，规划提示词里写成：

> 上一轮这些考点没出成题（被退回或放弃），这一轮换个角度重试，不要照原样再写一遍：sentence · Where is it? · on / in 介词（已失败 1 次）

出了题的考点立刻从队列里删掉。这一条对应原话「生成失败就要给出原因，要有记录，然后再重新生成」里的「然后」。

### 8.4 真跑观测（deepseek-flash）

- 勾 4 个考点 → 配额 `spelling 1 / sentence 1 / listening 1 / phonics 1` → 4 条计划 4 个不同格子
- 第一轮只成 2 题：拼写题被判「两个干扰项错因太像（都算漏字母），解析分不开」，介词题被判「`near the wall` 也通顺，答案不唯一」——两条都是真问题，模型三轮改不好就放弃那一格，写进失败记录
- 第二轮配额自动偏成 `spelling 2 / sentence 1`（上一轮两个拼写错题），这就是配额该有的样子
- 两轮 25 次调用 / 2.8 万 token / 约 40 秒

**通过率仍会抖**：4 个考点有时 4 题、有时 2 题。配额=每类 1 条时没有冗余，一格失败就少一题。要不要留替补位是下一件要定的事。

## 九、三个假阳性与「跨轮回练」（2026-11-11）

### 9.1 PHRASE：代码自己造出来的超纲词

失败记录里成片出现「用了没教过的词：PHRASE」，一度看着像是模型在乱写。实际是代码自己造的：

`protectPhrases()` 把 `teacher's desk` / `turn on` 这类多词项替换成占位符，避免被拆成两个词分别查表。占位符原先写成 `[[PHRASE]]`，而分词正则 `[A-Za-z][A-Za-z'’-]*` 会把 `PHRASE` 当成一个英文单词——于是**每一道含多词项的题都必然被判 V1 超纲**，而且报错信息里那个「词」在题面上根本不存在。

改法：占位符换成 `\u0001`（分词器认不出来的控制字符）。这类「占位符自己被当成内容」的 bug 很隐蔽，特征是：报错里的词在题面上搜不到。

### 9.2 nears：只查原形，把词形变化判成超纲

`near` 在 PEP 四上 U1 的词表里（在…附近），但 `nears` 被判超纲。原因很直接：`knownSet` 只收原形，查表用全等。

补 `derivedFrom()`，只认六类最常见后缀（-s / -es / -ies / -ing / -ed / -er / -est），且要求：

- 词干本身在表里，或补回结尾 e（`making → make`）、或去掉双写辅音（`running → run`）
- 词干长度 ≥ 3（否则 `is → i`、`us → u` 会被误配）
- 原形命中就返回，走不到派生那一步（所以 `teacher` 不会因为 `teach` 在表里被放过）

同时把 V1 的报错改成按词归并：一个词报一次，后面跟它出现的位置（`PHRASE（选项 1、解析） 没学过`），不再逐字段重复。

### 9.3 判题权限：代码闸有通过权，模型只有否决权

回答一个常被问的问题——**到底谁在判**：

| 角色 | 权力 | 原因 |
|---|---|---|
| 代码闸 `validateQuestion`（V1–V8） | 有**通过权** | 可复算、可回归。它说不过，一定不过 |
| 模型质检 `AGENTS.verify`（C/F/P/L 共 33 条） | 只有**否决权** | 它说挂才退回；它说「通过」不算数，仍要过代码闸 |

这个分工是刻意的不对称：生成方和质检方是同一个模型的不同配置，如果让质检拥有通过权，就等于让模型给自己判卷（self-confirming loop）。所以模型只能挑错，不能放行。

代价是：代码闸的误判会直接吃掉题。这次两个假阳性（PHRASE、nears）就是代价的实例——所以每一条闸的误杀都要能复现、能被回归测试锁住。

### 9.4 变体从「当轮派生」改成「下一轮模型重出」

原先答错就当场用 `SHT.buildVariant()` 拼一道同考点变体，问题是：

- 它是**代码派生**的，只有少数题型（换答案、换介词）接得出，接不出就只剩「直接记错题」
- 它发生在**同一轮之内**，看起来像「这题错了马上补一道」，而不是「这一轮学完，下一轮再看会不会」

现在改成：

1. 答错 → 当场写进 03 错题 → 直接进下一个考点，**本轮不再出第二枪**
2. 下一轮规划时，`buildBrief` 从错题本取 `priority`，一并带出 `kpId` 与上一轮那道原题的题干
3. 代码按 `priority` 给计划打 `probe` 标记（不让模型自己声明，它会把「我觉得相关」也算进去）
4. 生成角色收到 `probe` 上下文：**同考点、同层次，题面换场景与问法，答案换一个值**，上一轮那道题作为反例给出来
5. 回练题的作答记成 `stage: 'variant'`，与上一轮首答配成一对；结果回写错题本
6. 错题本里**连对两次**才升「已掌握」，一次只到「已订正」——一次可能是蒙对，或只是记住了上一轮那道题

界面上的标记也从「变体 · 同考点换答案」改成「错题回练 · 上一轮没过」，鼠标悬停可看上一轮那道原题。
