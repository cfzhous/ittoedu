# Project V8 内部开发计划

- 课例 ID：`e2e-native-fast`
- 标题：分数意义：整体与等分
- 课件合同 SHA-256：`{{COURSEWARE_CONTRACT_SHA256}}`
- 呈现脚本 SHA-256：`{{PRESENTATION_SHA256}}`
- Capability Index SHA-256：`{{CAPABILITY_SHA256}}`
- 状态：implemented

## 工程级不变量

Project V8；固定 1280×720；原生内容 + 最薄 Runtime assessment producer；离线归档；稳定 ID；本夹具只验证 Builder 机制，不签发产品验收。

## 场景—状态实现矩阵

| Script Scene/State | Project Scene/State | 所有权 | 内容来源 | 交互 | Authoring Inventory | 静态帧 | Task | 验收路径 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| SCN-001 / STATE-001..003 | scene_fraction_choice / state_fraction_* | hybrid-owned | CNT-001 | 命名稳定状态 + Runtime evaluator | title, prompt, feedback | STATE-003 | TASK-001 | archive reopen + inventory + stable-ID patch |

## 意图—作者入口—结果映射

| AUTH | Inventory Entity | 编辑意图 | 编辑入口 | 预期 Project 变化 | 重开结果 | Player/导出结果 | 行为测试 | 证据 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| AUTH-001 | fraction-title | 修改任务标题 | canvas-distinct | node_fraction_title.text 更新 | 文本保留 | Player 与导出显示新标题 | BEH-007 | archive reopen + stable-ID patch |
| AUTH-002 | fraction-prompt | 修改完整题面 | canvas-distinct | node_fraction_prompt.text 更新 | 文本保留 | 操作前状态与导出显示新题面 | BEH-007 | archive reopen + inventory |
| AUTH-003 | fraction-feedback | 修改错误修复反馈 | canvas-distinct | node_fraction_feedback.text 更新 | 文本保留 | 错误态与稳定导出显示新反馈 | BEH-007 | archive reopen + stable-ID patch |

## 共享机制

无；单课例原生场景不建立组件或 Runtime 抽象。

## Runtime / Component 合同

场景内容仍映射到原生文本节点；finite-auto RESP-001 由最薄 Runtime surface 调用 `ctx.assessment.evaluate` / `EVAL-finite-choice-v1`，不伪称纯原生具有自动判定动作。

## 行为门禁映射

| Gate | 合同来源 | Behavior Tests | 可见操作 | 可观察断言/事件 | 状态 |
| --- | --- | --- | --- | --- | --- |
| teacherControl | ESC-001 | BEH-001 | 点击教师场景选择器 | 选择器对话框可见 | planned |
| teacherEscape | ESC-001 | BEH-002 | 点击未完成继续 | 明确确认提示可见 | planned |
| requiredActions | ACT-001 | BEH-003 | 选择图 A | 产生 RESP-001 提交事件与可见结果 | planned |
| assessmentTolerance | RESP-001 / TOL-001..006 | BEH-004..006, BEH-008..010 | 每个 TOL 独立提交精确冻结输入 | 公开判定事件与每个 pass/fail 一致 | planned |
| authoringOutcome | AUTH-001..003 | BEH-007 | 修改、存档并重开 | Inventory 实体与 Player 结果一致 | planned |
| responseCapacity | RESP-001 | validator | 不适用 | 375 秒不超过 600 秒 | planned |

## 任务图

| Task | 类型 | 依赖 | 范围 | 产物 | 验证 | 状态 |
| --- | --- | --- | --- | --- | --- | --- |
| TASK-001 | risk-slice | 无 | 首次构建、保存编辑、稳定 ID Patch | e2e-native-fast.h5lesson | V8 schema、archive reopen、Inventory、Patch 保留 | verified |

## 验收矩阵

| 维度 | 操作 | 期望 | 证据 | 状态 |
| --- | --- | --- | --- | --- |
| 内容 | 核对 CNT-001 绑定 | 三个可编辑文本实体都有唯一来源 | Authoring Inventory | verified |
| 结构 | 打开 Project V8 归档 | 单场景和三个稳定节点 ID 存在 | 自动测试 | verified |
| 视觉 | 不在 W1 机制夹具中签发 | 留给 W2 真实截图 | W2 | deferred |
| 互动 | 核对三个 Presentation State | 状态 ID 可达且稳定 | 自动测试 | verified |
| 编辑 | 保存标题人工编辑后执行反馈 Patch | 标题保留，反馈更新 | 自动测试 | verified |
| 生命周期 | 关闭并重开归档 | Schema 仍有效 | 自动测试 | verified |
| HTML/网页包 | 不在 W1 机制夹具中签发 | 留给 W2 产品证据 | W2 | deferred |
| PDF/PPTX | 不在 W1 机制夹具中签发 | 留给 W2 产品证据 | W2 | deferred |
| 整课 | 运行 validate_v8_case implementation | 工程与 Inventory 通过 | 自动测试 | verified |
