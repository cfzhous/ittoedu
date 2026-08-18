# 内部开发计划合同

## 目录

1. 输入与不变量
2. 场景—状态矩阵
3. Authoring Inventory
4. 意图—作者入口—结果映射
5. 共享机制与合同
6. 行为门禁映射
7. 任务图
8. 验收矩阵

`03-development-plan.md` 是 Builder 的执行合同，默认不要求用户批准。它必须绑定获批呈现脚本与 Capability Index；`implementation-state.json`、Authoring Inventory、Behavior Spec 和 Evidence Manifest 必须绑定当前计划的实际 SHA-256。任何一项变化都先重算影响范围，旧行为报告和验收随即失效。

## 输入与不变量

记录 Project/Runtime/Component/PublishedLesson 版本、输出格式、离线边界、设计语言、控制器、导航、重播/重开、声音、素材许可和静态输出原则。不能把计划中的未来能力写成当前不变量。

## 场景—状态矩阵

每个 `SCENE/STATE` 映射到稳定 scene/state ID、四类所有权之一、精确内容来源、主要交互、节点/Runtime/Component、静态帧、Authoring Inventory 条目、所属任务和真实验收路径。

## Authoring Inventory

列出全部人工内容、素材和关键参数，而不只列当前可见目标。`canvas-distinct | authoring-view | property | developer | blocked` 必须与真实编辑入口一致。

## 意图—作者入口—结果映射

每个 `AUTH-*` 绑定 Inventory entity、教师的编辑意图、真实入口、预期 Project 字节/字段变化、保存重开结果、Player/导出结果、行为测试和证据。存在入口但没有下游结果，不能通过 authoringOutcome 门。

## 共享机制与合同

每个 Runtime/Component 记录目的、作用域、内容/素材、参数、事件、生命周期、Replay/Restart、Capture、静态后备、失败行为和复用理由。一次性完整场景默认不是组件。

## 行为门禁映射

把 `teacherControl | teacherEscape | requiredActions | assessmentTolerance | authoringOutcome` 映射到 `BEH-*` 可见操作测试，把 `responseCapacity` 映射到获批 `RESP-*` 的计数和时间预算。具体字段与禁用内部 API 规则见同级参考 `assessment-behavior.md`；该参考已由 `SKILL.md` 直接路由。

## 任务图

任务类型只使用 `foundation | risk-slice | shared-mechanism | scene-batch | integration`。按最小独立验证纵切分组，不机械一幕一任务。复杂、跨回合或多 Agent 任务才建独立 task 文件。

## 验收矩阵

分别覆盖内容、结构、视觉、互动、编辑、生命周期、HTML、网页包、PDF、PPTX 和整课集成。每项写具体操作、期望、证据路径和当前状态。
