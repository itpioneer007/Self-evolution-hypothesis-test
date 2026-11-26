# 出题反馈回溯机制：区分「方案问题」与「题目问题」

## Context

当前出题流水线里，verify 打回题目后，feedback 只传给 plan（方案角色），generate（执行角色）永远收不到 verify 的具体意见。导致「verify 拦了多次，题目还是改不对」——具体批评（如"dolly/socks/pot 三个都同音，答案不唯一"）在 plan 的 4 字段（kp/ability/level/angle）里被降维丢失。

本次改动让 verify 明确区分两种问题，各自回溯到对应步骤：

- **方案问题** → 回溯 plan，重新定方案（整轮重出）。
- **题目问题** → 回溯 generate，只重出这道题（带 verify 的具体修改意见），已通过的题跨轮保留。

已确认的语义：题目问题时，**只重出这道题，已通过的题保留**。

## 改动方案

### 1. agents.js —— verify 输出问题分类

verify 的 system 提示词（约 L170-224）：

- 新增「问题归类」要求：当 `passed=false` 时，输出 `issue_type`，取值 `"plan"` / `"generate"` / `"both"`：
  - `plan`：方案描述不具体、考点跑偏、层次/角度模糊，导致执行者无法正确落地（如方案只说"辨音"没说清唯一正确项）。
  - `generate`：方案没问题，执行者写岔了（选词同音、选项说明错位、中英不对等、语法/拼写错）。
  - `both`：两者都有。
- 新增 `feedback_to_executor` 字段：当 issue_type 含 `generate` 时，给出**针对这道题的逐题修改意见**（具体到"哪个词/哪条说明要改"），区别于面向方案的 `feedback_to_thinker`。
- 输出 JSON 模板（约 L197-213）加入这两个字段。

### 2. agents.js —— generate 接收逐题修改意见

generate 的 user 已有 `ctx.feedback` 分支（L149-155），本次真正启用：pipeline 把 `feedback_to_executor` 传进来。措辞从「反馈角色退回了这个考点的上一版」微调为「反馈角色指出了这道题的具体问题，重出时必须改掉」（语义不变）。

### 3. pipeline.js —— 轮次逻辑支持跨轮保留与分流

runRound（L101-193）改造：

- 新增跨轮状态：`carryPlans`（复用方案）、`carryQuestions`（已通过的题）、`carryGenFeedback`（按题号 `{no: [feedback]}` 的执行修改意见）。
- 每轮开始：若 `carryPlans` 存在（只有执行问题）→ 复用方案、不重新 plan；否则 → 重新 plan（带 `planFeedback`）。
- 逐题：已通过的题（`carryQuestions` 里 `passed===true`）直接保留、不再 generate；未通过的题 → generate（有 `carryGenFeedback[no]` 则带 feedback）。
- verify 后记录每题的 `issue_type`、`feedback_to_executor`。
- 轮末分流：
  - 有 plan 问题 → 下一轮重新 plan（清空 carry，整轮重出）。
  - 只有 generate 问题 → 复用方案 + 保留已通过的题 + 只重出未通过的题。
- snapshot（L69-86）新增 `issue_type`、`feedbackToExecutor` 字段（默认 `null` / `''`）。

关键点：`rounds[round].questions` 始终保持「完整一套题」（count 道），已通过的题跨轮保留时按相同 `no` 原位出现，界面按轮回看无需改动。

### 4. smoke-test.js —— 更新断言

- 更新 verify 输出模板断言：新增 `issue_type`、`feedback_to_executor` 字段校验。
- 更新「多轮出题」测试：验证「题目问题只重出该题、已通过的题保留」。
- 新增分流断言：方案问题 → 重新 plan；题目问题 → 复用 plan 只重出该题。

## 关键文件

- `src/core/agents.js`（verify system/user、generate user）
- `src/core/pipeline.js`（runRound、snapshot）
- `tools/smoke-test.js`（回归断言）

## 验证

1. `node --check src/core/pipeline.js` 与 `node --check src/core/agents.js` 语法通过。
2. `node tools/smoke-test.js` 全部 PASS。
3. 浏览器 file:// 打开 index.html，点「开始」出题：被打回时，方案问题会看到 plan 重定（整轮换题），题目问题会看到只重出那一两道题（其它题不动）。
