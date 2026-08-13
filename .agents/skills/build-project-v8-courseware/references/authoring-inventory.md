# Authoring Inventory

Inventory 是课例全部可编辑实体清单；它与当前画布可测量目标快照分开。

持久绑定格式：

```text
native:scene:<sceneId>:<nodeId>:<field>
native:global:<nodeId>:<field>
component:scene:<sceneId>:<nodeId>:<propertyKey>
component:global:<nodeId>:<propertyKey>
runtime:scene:<sceneId>:<kind>:<key>
runtime:global:<kind>:<key>
source:scene:<sceneId>:<key>
source:global:<key>
```

`kind` 使用 `text | asset | number | boolean | color | select | formula`。绑定必须包含作用域；节点 ID 不假设跨场景唯一。禁止保存 `registered:*`、`dom:*` 或挂载序号 targetId。

Schema V2 的每个实体至少包含全局唯一、文件名安全的 `id`（`[A-Za-z0-9][A-Za-z0-9._-]{0,127}`）、作者可读 `label`、上述 `kind`、唯一精确内容来源 `sourceRef: CNT-*`、`binding`、`editability`、`requiredForAcceptance`，以及可核查的 `intent → authoringEntry → expectedOutcome`。`authoringOutcomeId` 必须引用获批课件合同中的 `AUTH-*`。每个 Project 场景都必须有一个 scene entry，即使该幕没有需登记实体；全局内容放入 `globalEntities`，不重复挂到各幕。Runtime 当前可持久编辑入口只有 `text`（`content.values`）和 `asset`（`assets`），其他关键参数若在 Runtime 源码中无结构化入口必须标记 `developer` 或 `blocked`，不能用虚构 binding 掩盖。

`generatedFrom.coursewareContractSha256`、`generatedFrom.presentationScriptSha256`、`generatedFrom.capabilityIndexSha256` 和 `generatedFrom.developmentPlanSha256` 必须分别等于获批合同、当前 V2 readiness 绑定的呈现脚本、当前 Capability Index 与当前开发计划哈希；每个 `sourceRef` 的 `CNT-*` 主键必须存在于 `derivedReadiness.exactContentLocations`。Builder 总校验器会重新计算这些关系，不能只提供形似 SHA-256 的占位值。

编辑状态：

- `canvas-distinct`：默认画布中存在可区分、可直接选择的实体；
- `authoring-view`：通过明确的作者视图切换后可在画布中定位；
- `property`：通过稳定属性面板入口编辑，画布不承诺独立几何区域；
- `developer`：只能由开发者修改源码/构建参数，必须写 `limitation`，绑定使用 `source:scene:<sceneId>:<key>` 或 `source:global:<key>`；
- `blocked`：当前没有可靠修改入口，必须写 `limitation`。

Component 隐藏页优先使用 `editor.pages + previewPageProp`。Runtime 隐藏内容可暂时为 `property`；若要求画布原位编辑却无协议支持，记录 `blocked`，不要强制组件化或制造无教学意义的状态。

任何 `requiredForAcceptance: true` 的学生/教师可见文字、教材素材、题目、答案、反馈、公式或关键教学参数，在 `engineering candidate` 前不得保持 `developer | blocked`。Evidence 的 authoringOutcome 门会从真实 edit round trip 逐个覆盖每个 required entity，并核对画布选择、保存重开、Player 与导出结果；Inventory 中自填“可编辑”不构成证据。
