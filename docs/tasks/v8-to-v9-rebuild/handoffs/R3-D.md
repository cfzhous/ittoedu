HANDOFF
- task: R3-D
- planning pack path: `C:\Users\74755\Documents\HTML课件编辑器\docs\tasks\v8-to-v9-rebuild`
- product worktree / branch / baseline SHA: `C:\Users\74755\Documents\HTML课件编辑器-v8-to-v9-rebuild` / `codex/v8-to-v9-rebuild` / `f27275658c6dfaa12f2ce35cd9368dcdebe99451`
- outcome: 在产品 worktree 新建只读有效图层投影与可复用 authoring scope token。统一列表合并 global/surface/scene/state（及 Spatial world），行上带 source 与 `all/include/exclude + locationIds`；scene-only 不含全局教师控制器伪装行；选中 global 行得到 `owner: 'global'` 且不改 `locationId`；画布/图层/属性身份是同一 `makeAuthoringAddress`（无 hitId）；owner-aware reorder/lock/hide/duplicate/delete 只有只读 UI 输入合同。未改 NodesTab / ScenePanel / Workspace / PropertiesTab / App / store / MediaTab，未等、未改 R3-A 的 `globalLayerCommands.ts` / `effectiveLayerCommands.ts`，未开始 R3-Z，未 commit。默认产品仍是 V8。本 lane 为 integration candidate。
- owned files changed (product worktree, new):
  - `src/renderer/course/effectiveLayerProjection.ts`
  - `src/renderer/authoring/courseAuthoringScope.ts`
  - `tests/unit/effectiveLayerProjection.test.ts`
  计划侧：本 HANDOFF。未改账本。
- donor files/functions consulted:
  - 产品 R1：`getEffectiveCourseLayerOrder`、`EffectiveCourseLayerItem`（`global | surface | scene | world`）、`isCourseLayerVisibleAtLocation`、`makeAuthoringAddress`、`globalLayerItems` / `surfaceLayerItems` / Slide `layerItemOverrides`
  - 产品 R2-A `slideEditorView.ts`：named-state override 物化（本任务自行实现并修正 `layerItemOrder` 必须返回重排结果，未改 R2-A 文件）
  - 供体 `effectiveLayerCommands.ts` 的 `listEffectiveLayerCommandItems`：scene+override 显示为 `state`，owner 仍是 scene（只读摘取意图，未迁命令）
  - 产品 R2-A/R2-Z：`setSlideEditingScope('global')`、scene-only 不把 controller 当 scene 可选行
  - 产品 R3-A 进行中的 `globalLayerCommands.ts`：`EffectiveLayerCommandTarget` 用 `authoringAddress + locationId + stateId`（只读对齐 row 形状，**未 import、未修改**）
  - 供体 `flowEditorView.ts`：普通 Flow block 不是 overlay LayerItem
- donor 舍弃部分:
  - 供体 `effectiveLayerCommands.ts` 的写命令 / `applyEffectiveLayer*`
  - `EffectiveLayerList.tsx` 与任何 NodesTab/UI 接线
  - 从 R3-A 文件 import（并行未完成，禁止等待）
  - CourseStudio / 第二套图层 UI
- focused validation command:
  ```
  npx vitest run tests/unit/effectiveLayerProjection.test.ts
  git diff --check -- src/renderer/course/effectiveLayerProjection.ts src/renderer/authoring/courseAuthoringScope.ts tests/unit/effectiveLayerProjection.test.ts
  ```
- validation result: Vitest 1 file / 3 tests passed，1.24s。`git diff --check` 无输出、exit 0（对新文件先 `git add -N` 再 check，随后 `git reset -- <owned paths>`，文件仍为 untracked）。
- validation entry / fixture / backend:
  - entry: `projectEffectiveLayers`、`courseAuthoringScopeFromLocation`、`scopeTokenForSelectingRow`、`commandTargetFromRow`、`createEffectiveLayerReorderInput`、`createEffectiveLayerItemActionInput`、`isFlowDocumentBlockId`、`getEffectiveCourseLayerOrder`、`makeAuthoringAddress`
  - fixture: 内存 V9 Mixed（Slide 两页 + named state override/order、Flow 含 heading/section/paragraph、Spatial world 一项、global banner + 教师控制器 `exclude` 第二页、surface include 仅第一页）
  - backend: 纯只读投影；默认产品仍为 V8 `App`
- validation proves / does not prove:
  - proves: 统一行合并四种 owner 并显示来源与 location 影响范围；scene-only 无伪装控制器；选 global 行切到 global scope 且 location 不变；画布/图层/属性同一 address 且无 hitId；named state 反映 `layerItemOverrides` 与 `layerItemOrder`；Flow 普通 block 不进通用图层 adapter；reorder/lock/hide/duplicate/delete 输入合同带 owner/id
  - does not prove: 未接真实 NodesTab / Workspace / Properties / MediaTab；未跑 R3-A 写命令；未改默认 V8；未跑 typecheck/build/E2E/视觉
- narrow UI smoke, if authorized: 未授权；未启动 App。
- INTEGRATION_REQUESTS:
  ```
  INTEGRATION_REQUEST
  - requester task: R3-D
  - target stage integrator: R3-Z
  - target hotspot file: src/renderer/ui/NodesTab.tsx（及 candidate 时的 store 选择/scope；不要改本任务文件）
  - exported symbol / callback: projectEffectiveLayers、rowsForListKind、visualFrontToBackRows、scopeTokenForSelectingRow、commandTargetFromRow、createEffectiveLayerReorderInput、createEffectiveLayerItemActionInput
  - required user-visible behavior: V9 candidate 下 NodesTab 使用投影 rows（来源+影响范围）；选中 global 行真实切换到 global `courseAuthoringScope`（location 不变）；scene-only 列表不含把教师控制器伪装成 scene 的行。默认入口仍是 V8，禁止 candidate UI no-op。
  - focused test proving lane side: tests/unit/effectiveLayerProjection.test.ts
  - exact wiring requested: 见下方「R3-Z：NodesTab / scope / 命令输入」。把 `commandTargetFromRow(row)` 的 owner/id/`authoringAddress` 交给 R3-A 命令，不要在 UI 里把 global 项写成 scene id。
  - risk if omitted: 统一图层仍只列 scene；选控制器不进 global scope；或控制器继续伪装成本页行
  - status: open
  ```
- DECISION_REQUESTS: 无
- remaining risks / untested full checks:
  - 未跑 `npm run typecheck` / `npm test` / `npm run build` / E2E / 视觉回归（R8）
  - 未接真实 NodesTab 拖排；本任务只提供 back-to-front 输入合同（`visualFrontToBackRows` 供 V8 视觉序）
  - R3-A 命令文件并行中，本任务未 import；R3-Z 接线时以本 row 的 owner/id/address 为输入
  - `getEffectiveCourseLayerOrder` 仍是未物化 named-state 的引擎成员资格；投影的 `compositedRows` 用该函数过滤成员，再叠 override
- rollback point: 删除产品 worktree 中上述 3 个未跟踪文件。其他 lane 文件保持不动。基线仍为 `f272756`。
- execution state: lane_candidate
- integration state: pending
- quality state: unverified

## 投影 row 形状

`EffectiveLayerProjectionRow`（back-to-front 在 `unifiedRows` / `sceneOnlyRows` / `compositedRows`）：

| 字段 | 含义 |
|---|---|
| `id` | 稳定 `layerItemId` |
| `owner` / `ownerKey` | 存储 owner：`global` / `surface:{id}` / `scene:{id}` / `world:{surfaceId}` |
| `source` / `sourceLabel` | 行上显示：`global` 全课、`surface` 当前内容、`scene` 本页、`state` 当前状态、`world` 世界 |
| `impact` | global/surface：`all \| include \| exclude + locationIds`；scene/world：`owner` |
| `authoringAddress` | `makeAuthoringAddress`，`field=item`，无 hitId |
| `scopeToken` | 选中该行后的 authoring scope |
| `hidden` / `visibleAtLocation` / `effectiveVisible` / `locked` | 显隐与锁定 |
| `stateOverrideApplied` | named-state 是否改写了该 scene 项 |
| `isTeacherController` | 控制器检测 |
| `item` | 物化后的 LayerItem（含 override） |

`compositedRows` 成员资格 = `getEffectiveCourseLayerOrder`（当前 location 可见）。`unifiedRows` 额外保留当前 location 被 exclude 的 global/surface 行，供逐页显隐编辑。`sceneOnlyRows` = `owner === 'scene'` 且不是控制器。

## Scope API

`src/renderer/authoring/courseAuthoringScope.ts`（Flow/Spatial 复用，不要再造第二套）：

- `courseAuthoringScopeFromLocation({ project, locationId, owner?, stateId? })` — Slide 默认 `scene`，Flow 默认 `surface`，Spatial 默认 `world`
- `scopeTokenForSelectingRow(current, row)` — 选 global 行 → `owner: 'global'`，**不改** `locationId` / `stateId`
- `makeLayerItemAuthoringAddress` / `ownerKeyFor` / `authoringAddressScopeForOwner`（world 的 address scope 仍是 `surface`，与 R1 inventory 一致）

## 给 R3-A 的命令输入（只读 token，本任务不调用命令）

```ts
commandTargetFromRow(row)
// { authoringAddress, owner, ownerKey, layerItemId, locationId, stateId }

createEffectiveLayerReorderInput({ unifiedRows, fromId, toId, placement })
// sameOwner 时 orderedLayerItemIds 为该 owner 完整 back-to-front 排列
// 跨 owner：sameOwner=false，orderedLayerItemIds=[]，R3-A 应拒绝

createEffectiveLayerItemActionInput(row, 'lock' | 'unlock' | 'hide' | 'show' | 'duplicate' | 'delete')
// scene + stateId 时 deleteMode='hide-in-state'
```

## R3-Z：NodesTab / scope / 命令输入

默认 V8：不要包一层 no-op。

V9 candidate：

1. **NodesTab 统一列表** → `visualFrontToBackRows(projectEffectiveLayers(...).unifiedRows)`。行上显示 `sourceLabel` 与 `describeLayerImpact(row.impact)`。
2. **scene-only 回退**（若仍走现有 V8「只列本页」）→ `rowsForListKind(projection, 'scene-only')`。此列表不得出现教师控制器。
3. **选中 global 行** → `scopeTokenForSelectingRow(current, row)`，把 candidate `editingScope` / `setSlideEditingScope` 切到 `global`。画布与属性用同一 `row.authoringAddress` / `commandTargetFromRow(row)`。
4. **锁/隐/复制/删除/拖排** → 把上述 UI 输入交给 R3-A，不要在 NodesTab 内把 global 项当 scene 命令。跨 owner 拖排不得假排序。
5. 成功 command 后 `set` 刷新订阅。一次会话一个 backend，不双写 V8 project。
