# Unified Authoring Blueprint RFC

> 日期：2026-08-13
>
> 状态：**研究提案，等待人类评审；不得描述为当前产品能力。V8 Builder MVP 表述已过时。**
>
> 范围：AI 外部创作、Authoring Inventory、统一作者视图、跨载体编辑与局部 Patch 语义
>
> 不在范围：编辑器内模型调用、Project V8 Schema 变更、自由布局求解器、像素反向识别、任意 Runtime 源码重写

## 1. 结果目标

让 AI、编辑器和人工作者对“这段内容是什么、由谁承载、在哪里编辑、当前是否可编辑”使用同一套可验证事实，同时不把运行期几何快照误当持久工程模型。

首版研究应解决四个问题：

1. Authoring Inventory 与 authoring target/layout snapshot 的职责边界；
2. 原生节点、Runtime、组件和混合场景如何进入同一作者视图；
3. AI 如何在人工编辑后按稳定身份局部修改，而不是重新生成整课；
4. 哪些能力可在现有 Project V8 外部 Builder 中实现，哪些必须等待新协议或新 Project 版本。

本 RFC 不要求所有画面原生化。结果质量优先决定载体，可编辑性由显式来源、稳定绑定和真实入口保障。

## 2. 当前事实，不是提案

当前软件与 W1 Builder 已有以下边界：

- Project V8 是保存与发布真相；HTML/网页包保留互动，PDF/PPTX 是静态投影；
- 编辑状态由隔离 authoring Player 产生真实合成视觉，透明原生层只负责选择和几何变换；试运行才启用学生互动、媒体、导航与状态推进；
- 原生节点具有持久 scene/node ID；Runtime 的可见内容应来自 `content.values`、`assets` 与结构化参数；组件的作者内容应来自 Props/manifest 字段；
- Runtime Authoring V1 和 Component API 4 可在当前会话报告可测量的文字/素材目标；这些目标带 session/revision，`registered:*`、`dom:*` 等 targetId 可能在重挂载后变化；
- 当前统一画布协议没有 Blueprint、模型调用或可持久化布局快照；
- W1 的 `build-project-v8-courseware` 在课例目录维护外部 Authoring Inventory，并使用带作用域的稳定绑定，例如 `runtime:scene:<sceneId>:text:<key>`；
- 自动化最多签发 `engineering candidate`，不能由清单完整或测试通过推导人工 `accepted`。

因此，当前可交付路径是“Project V8 + 可复现 TypeScript Builder/Patch + 外部 Inventory + 真实证据”，不是在工程内新增一套影子 Blueprint。

## 3. 三层事实模型

### 3.1 Authoring Inventory：持久语义与责任清单

Inventory 回答：

- 用户看见或依赖的实体是什么；
- 来源位于获批合同/脚本的哪里；
- 由 native/runtime/component/hybrid 的哪一部分承载；
- 使用哪个跨会话稳定绑定；
- 编辑入口是 `visible | property-only | blocked`；
- 是否为验收必需，受限时原因是什么。

Inventory 不保存当前像素矩形、DOM 节点、挂载序号或会话 targetId。它属于课例实现证据，可由 Builder 生成并由验证器对实际 Project 复核，但不是第二份 Project。

建议的持久身份保持如下：

```text
native:scene:<sceneId>:<nodeId>:<field>
native:global:<nodeId>:<field>
component:scene:<sceneId>:<nodeId>:<propertyKey>
component:global:<nodeId>:<propertyKey>
runtime:scene:<sceneId>:<kind>:<key>
runtime:global:<kind>:<key>
```

`nodeId` 只在所属作用域解释；Runtime 的 `key` 必须回到结构化内容或参数；组件 `propertyKey` 必须回到 manifest 公开字段。源码中的自由字符串和装饰算法不是可接受的隐藏内容源。

### 3.2 Authoring Target/Layout Snapshot：会话几何事实

Snapshot 回答：

- 当前 authoring Player 的哪个目标可被命中；
- 它在规范画布上的矩形、旋转、可见性和能力是什么；
- 该结果属于哪个 session、revision、scene/state 和渲染上下文；
- 对这一快照发出的 patch 是否已被同一实例确认。

Snapshot 可以包含 `registered:1` 或 `dom:2`，但只能用于当前握手和短期命中，不能写入 Project、Inventory、任务文件或跨回合 AI 计划。任何实例替换、revision 变化、scene/state 切换或重新测量都使旧快照失效。

### 3.3 Authoring View：复核上下文

Authoring View 回答“作者正在看哪一个稳定画面”，至少包含：

- `sceneId`；
- 基础场景或稳定 `presentationStateId`；
- 全局层是否显示、当前载体组合与作者可见性；
- 只读的 capture/preview 意图，例如缩略图、PDF、PPTX 或编辑状态；
- 对应的 Inventory 覆盖与最新 snapshot revision。

View 不是新的内容存储。它引用 Project 的场景/状态和 Inventory 的稳定实体，再消费当前会话 Snapshot。拖拽中间帧、粒子随机帧、悬停态或业务瞬态不能成为默认作者视图。

三层关系为：

```text
获批脚本 → Project V8 + Inventory（持久）
                     ↓
        Authoring View（稳定复核上下文）
                     ↓
       Target/Layout Snapshot（会话、可失效）
```

任何由 Snapshot 反向创造新持久身份的方案都应拒绝；持久身份必须先存在于 Project 或结构化 Runtime/组件数据中。

## 4. 跨载体作者模型

统一作者视图不等于统一渲染器。不同载体保留各自真实语义：

| 载体 | 视觉真相 | 持久编辑入口 | 画布入口 | 局部 Patch |
|---|---|---|---|---|
| native-owned | Project 节点 | 节点字段/状态覆盖 | 选择、几何、文字/公式 | scene + node + field |
| runtime-owned | Runtime source + content/assets/params | 属性/开发面板 | 显式 Runtime Authoring target | scene + kind + key；必要时受控源码 patch |
| component-composed | 包内容 + instance Props | manifest 公开 Props | 显式 Component target/页面 | scene + node + propertyKey |
| hybrid-owned | 上述组合 | 按实体分别归属 | 同一合成画布上的多个目标 | 不跨所有权边界合并写入 |

共同要求：

- 同一可见内容只能有一个权威写入位置；不得同时把 Runtime 文案复制到 native 节点作为“可编辑镜像”；
- 画布直编是便利入口，不是唯一编辑能力。无可靠几何目标时保留 `property-only`；
- `blocked` 必须显式、可报告，并在验收必需内容上阻止 `accepted`；
- 隐藏组件页面优先由组件 `editor.pages` 和预览页属性表达；不得为了露出隐藏内容创建无教学意义的 Presentation State；
- Runtime 不因缺少画布直编而被强制组件化；组件也不因复用想象而被创建。

## 5. 局部 Patch 合同

人工修改后的 AI 续作必须以实际 `.h5lesson` 为输入，并遵循：

1. 重开并通过 Project Schema/Health；
2. 校验获批脚本、Capability Index、当前 Project 和 Inventory 哈希；
3. 按稳定 scene/node/key 解析目标；目标缺失或出现多个匹配时停止；
4. 仅更新计划内实体，不重建未涉及场景，不重新分配既有稳定 ID；
5. 保存新工程，再关闭、重开并复核 Inventory；
6. 对受影响的 authoring view、Player 路径和静态导出重新取证；
7. 内容语义、用户流程、互动或视觉取舍变化时返回编排审批。

Snapshot 只能帮助当前会话定位，不能成为 Patch 的唯一目标。若 Property 与画布目标暂时不一致，以持久数据和重新测量结果为准，记录协议诊断而不是写入旧矩形。

## 6. 建议的 Blueprint 研究形态

如未来引入 Blueprint，推荐把它定义为“可重算的作者索引”，而非第三份内容模型。最小候选结构只引用现有事实：

```ts
interface UnifiedAuthoringBlueprint {
  schemaVersion: 1
  projectSchemaVersion: number
  projectSha256: string
  inventorySha256: string
  views: AuthoringViewReference[]
  entities: AuthoringEntityReference[]
  generatedAt: string
  generator: string
}
```

候选实体只保存 stable binding、source reference、ownership、editability 和 view references；不复制正文、Props、Runtime source、图片字节或布局矩形。几何通过带 revision 的 snapshot 另取。

首个实现应仍在课例证据目录中生成，不进入 `.h5lesson`。只有多个真实课例证明需要离线交换、编辑器内检索或版本迁移后，才评估是否进入正式协议。

## 7. 一致性与失效规则

下列变化必须使对应索引或证据失效：

- Project 字节变化：重算 Project hash，并复核全部绑定；
- scene/node 删除或改 ID：受影响实体错误，不能自动按标题猜测；
- Runtime content/assets/params key 或组件 manifest property 变化：受影响实体错误；
- presentation state 变化：重新生成相关 View 和静态证据；
- session/revision 变化：只使 Snapshot 失效，不应使 Inventory 身份自动改变；
- Capability 或协议版本变化：Builder 入口阻断，重新评估载体与 Patch；
- 获批脚本字节变化：实现准备度失效，返回编排校验。

标题、可见文本、DOM 顺序和几何相似度都不能用作静默身份恢复。可提供人工辅助匹配建议，但必须由人确认后生成新的持久绑定和迁移记录。

## 8. 诊断与产品呈现

建议的诊断类别：

- `inventory-binding-missing`
- `inventory-binding-ambiguous`
- `inventory-source-stale`
- `inventory-required-content-blocked`
- `authoring-view-state-missing`
- `authoring-snapshot-stale`
- `authoring-target-unmeasurable`
- `authoring-patch-ack-mismatch`
- `cross-carrier-duplicate-owner`

编辑器未来若展示 Blueprint，应先显示“内容与入口”，再显示实现载体。教师不需要理解 Runtime 或组件术语；高级诊断才显示稳定绑定、协议版本与来源哈希。

`property-only` 不是错误；它表示有稳定、可保存的属性入口但无法在当前画布命中。`blocked` 才表示当前没有可用修改入口，并必须给出限制和返回路径。

## 9. 安全、许可与离线边界

- Blueprint/Inventory 不能授权执行新代码，也不扩大 Runtime/组件信任边界；
- 不扫描任意 DOM、Canvas 像素或组件私有状态推断可编辑内容；
- 不把外部 URL、凭证或联网依赖嵌入索引；素材继续由工程资产与许可记录管理；
- 导出的成品不携带开发任务、人工审阅隐私或本地绝对路径；
- 所有生成与 Patch 可在受控本地环境离线完成。

## 10. 分阶段验证夹具

### A. 原生型

一幕包含原生文字、公式、图片和命名状态。证明 Inventory 可定位节点字段与状态覆盖；人工移动和改字后局部 Patch 保留 ID，并在重开、Player、PDF/PPTX 中一致。

### B. Runtime/Hybrid 型

一幕由 Runtime 主视觉和少量原生控制组成。证明内容表、素材、关键参数都可追溯；可测量目标使用当次 Snapshot，未测量内容为 `property-only`；Patch 不覆盖人工几何调整。

### C. 组件隐藏页

组件 Props 含多个页面。证明稳定 property key 与 `editor.pages` 可访问隐藏内容，不制造假 Presentation State；普通 playback/capture 不暴露 authoring 扩展。

### D. 失效与冲突

覆盖 Project hash 变化、节点删除、重复绑定、session/revision 更新、旧 targetId、脚本批准失效、Capability 漂移和同一内容双所有者。所有情况应产生确定诊断或返回上游，不按文本相似度自动修复。

### E. 产品验收

除结构测试外，必须由人类检查画布编辑入口是否真实可理解、属性入口是否能找到、静态与互动结果是否符合预期。自动化仍只能给出 `engineering candidate`。

## 11. 推荐决策

1. **当前 W1 采用外部 Inventory，不新增 Project Schema。** 它直接服务 Builder、证据和人工验收，复杂度最低。
2. **Snapshot 保持会话态。** 禁止把 `registered:*`、`dom:*`、revision 或矩形写成跨回合绑定。
3. **Authoring View 引用已有 scene/state。** 不为编辑便利制造教学状态，也不复制内容。
4. **局部 Patch 只按稳定绑定操作实际工程。** 首次 Builder 与人工修改后的续作是两条明确路径。
5. **Blueprint 延后为可重算索引。** 只有多个冷启动课例证明共同需求后再决定是否版本化、是否进入编辑器。
6. **统一体验，不统一载体。** native、Runtime、组件和 hybrid 保持各自成熟路径，由同一 Inventory 与证据层连接。

## 12. 待人类评审的问题

1. Inventory 最终应长期留在课例仓库，还是随 `.h5lesson` 保存一个只含稳定引用的投影；
2. Authoring View 是否需要独立持久 ID，还是 `sceneId + presentationStateId/base` 已足够；
3. Runtime/组件的结构化内容 key 改名是否需要正式迁移表；
4. `property-only` 的产品界面如何让普通教师快速找到对应属性；
5. 多个实例有意共享同一内容源时，如何表达“一源多视图”而不误报双所有者；
6. 何时有足够真实课例证据启动编辑器内 Blueprint，而不是继续使用外部索引。

在这些问题完成真实课例验证和人类评审前，本 RFC 的结论是：**边界已明确，外部 Builder 路径可继续；统一 Blueprint 尚未成为当前产品能力。**
