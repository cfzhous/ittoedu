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
```

`kind` 使用 `text | asset | number | boolean | color | select | formula`。绑定必须包含作用域；节点 ID 不假设跨场景唯一。禁止保存 `registered:*`、`dom:*` 或挂载序号 targetId。

每个实体至少包含全局唯一 `id`、作者可读 `label`、上述 `kind`、唯一精确内容来源 `sourceRef: CNT-*`、`binding`、`editability` 和 `requiredForAcceptance`。每个 Project 场景都必须有一个 scene entry，即使该幕没有需登记实体；全局内容放入 `globalEntities`，不重复挂到各幕。Runtime 当前可持久编辑入口只有 `text`（`content.values`）和 `asset`（`assets`），其他关键参数若在 Runtime 源码中无结构化入口必须标记 `blocked`，不能用虚构 binding 掩盖。

`generatedFrom.presentationScriptSha256` 和 `generatedFrom.capabilityIndexSha256` 必须分别等于当前 V2 readiness 绑定的呈现脚本哈希和当前 Capability Index 哈希；每个 `sourceRef` 的 `CNT-*` 主键必须存在于 `derivedReadiness.exactContentLocations`。Builder 总校验器会重新计算这些关系，不能只提供形似 SHA-256 的占位值。

编辑状态：

- `visible`：可在当前作者视图直接定位/编辑；
- `property-only`：有稳定属性入口，但当前画布没有可测量区域；
- `blocked`：只有来源和绑定，当前没有可用修改入口，必须写 `limitation`。

Component 隐藏页优先使用 `editor.pages + previewPageProp`。Runtime 隐藏内容可暂时为 `property-only`；若要求画布原位编辑却无协议支持，记录 `blocked` 和 `authoring-view-blocked`，不要强制组件化或制造无教学意义的状态。

任何学生/教师可见文字、教材素材、题目、答案、反馈、公式或关键教学参数在 `accepted` 前不得保持 `blocked`。内部算法和不可配置装饰可带理由保留。
