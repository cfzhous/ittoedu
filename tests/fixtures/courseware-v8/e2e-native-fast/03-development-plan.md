# Project V8 内部开发计划

- 课例 ID：`e2e-native-fast`
- 标题：分数意义：整体与等分
- 呈现脚本 SHA-256：`{{PRESENTATION_SHA256}}`
- Capability Index SHA-256：`{{CAPABILITY_SHA256}}`
- 状态：implemented

## 工程级不变量

Project V8；固定 1280×720；原生承载；离线归档；稳定 ID；不引入 Runtime 或组件；本夹具只验证 Builder 机制，不签发产品验收。

## 场景—状态实现矩阵

| Script Scene/State | Project Scene/State | 所有权 | 内容来源 | 交互 | Authoring Inventory | 静态帧 | Task | 验收路径 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| SCN-001 / STATE-001..003 | scene_fraction_choice / state_fraction_* | native-owned | CNT-001 | 命名稳定状态 | title, prompt, feedback | STATE-003 | TASK-001 | archive reopen + inventory + stable-ID patch |

## 共享机制

无；单课例原生场景不建立组件或 Runtime 抽象。

## Runtime / Component 合同

无；本夹具不使用 Runtime 或组件，所有人工内容均映射到原生文本节点。

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
