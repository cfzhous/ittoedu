HANDOFF
- task: R3-A
- planning pack path: `C:\Users\74755\Documents\HTML课件编辑器\docs\tasks\v8-to-v9-rebuild`
- product worktree / branch / baseline SHA: `C:\Users\74755\Documents\HTML课件编辑器-v8-to-v9-rebuild` / `codex/v8-to-v9-rebuild` / `f27275658c6dfaa12f2ce35cd9368dcdebe99451`
- outcome: 在产品 worktree 新建 global / effective 图层命令。唯一工程真相是 `CourseProjectDocument`；命令吃 document + `makeAuthoringAddress` owner target + revision，返回 `{ ok, reason, nextDocument, historyEntry }`。四种教师 owner 中 global/surface/scene/world 沿用 `EffectiveCourseLayerItem['source']`；named state 是 scene item + `layerItemOverrides`，没有新 source 字符串。排序只在同一 owner 内进行，非法 reorder 失败而不是「暂不能调整顺序」成功。控制器保持 global item，不能搬成 scene item。当前 location 显隐只改 `visibility.mode/locationIds`，不改 `startLocationId` 或 locations 顺序。未改中央热点、R2 三文件、schema。未 commit。默认产品仍是 V8。本 lane 为 integration candidate，不是 art/accepted，不宣称 V9 编辑器可用。
- owned files changed (product worktree, new):
  - `src/renderer/course/globalLayerCommands.ts`
  - `src/renderer/course/effectiveLayerCommands.ts`
  - `tests/unit/effectiveLayerCommands.test.ts`
  计划侧：本 HANDOFF。未改 `tests/unit/globalLayerVisibility.test.ts`（V8 Player 保护，保持原断言）。
- donor files/functions consulted:
  - `git show 4755034:src/renderer/course/globalLayerCommands.ts`（`reorderGlobalLayerItems`、`setGlobalLayerVisible`/`Locked`、delete impact、restore controller、稳定 `makeAuthoringAddress`）
  - `git show 4755034:src/renderer/course/effectiveLayerCommands.ts`（`listEffectiveLayerCommandItems`、owner 内 reorder、state hide、controller 不可跨 owner）
  - 产品 `courseProjectTypes.ts` / `courseProjectModel.ts`（`globalLayerItems`、`LocationVisibility`、`getEffectiveCourseLayerOrder`、`isCourseLayerVisibleAtLocation`、`EffectiveCourseLayerItem['source']`）
  - R2-A/E：`commitSlideProjectMutation`、`SlideCommandResult` 形状、named-state hide vs structural delete、`wrong-owner` scene-only 边界
- donor 舍弃部分:
  - `courseStudioModel` / `updateCourseProject` / `updateLayerItem` / `createEffectiveLayerListHandlers` / T10 binder
  - CourseStudio `selectGlobalAuthoringOwner` / `courseLocationCommands`
  - `commitGlobalControllerTransform` / preview / `updateGlobalControllerContent`（R3-C 几何）
  - 复制控制器返回 `ok: true` 空成功；「暂不能调整顺序」no-op
  - 把控制器改成 scene item 的任何路径；HEAD NodesTab controlled 分支
  - 第二套 owner 枚举（donor `sourceKind: 'state'` / `EditorAuthoringOwner`）
- focused validation command:
  ```
  npx vitest run tests/unit/effectiveLayerCommands.test.ts tests/unit/globalLayerVisibility.test.ts
  git diff --check -- src/renderer/course/globalLayerCommands.ts src/renderer/course/effectiveLayerCommands.ts tests/unit/effectiveLayerCommands.test.ts tests/unit/globalLayerVisibility.test.ts
  ```
- validation result: Vitest 2 files / 7 tests passed，32.67s。`git diff --check` 无输出、exit 0（对新文件先 `git add -N` 再 check，随后 `git reset`，文件仍为 untracked）。
- validation entry / fixture / backend:
  - entry: `listEffectiveLayerCommandItems`、`reorderEffectiveLayerItems`、`moveEffectiveLayerOwner`、`setGlobalLayerVisibleAtLocation` / `setGlobalLayerLocationVisibility`、`patchEffectiveLayerItem`、`duplicateEffectiveLayerItem`、`deleteEffectiveLayerItem`、`restoreDefaultTeacherController`、`makeAuthoringAddress`、`getEffectiveCourseLayerOrder`、`isCourseLayerVisibleAtLocation`
  - fixture: 内存 V9 Slide（两 location、global 横幅/页脚/教师控制器、surface 共享层、scene 文字 + named state）
  - backend: 纯 V9 document 命令；默认产品仍为 V8 `App`
- validation proves / does not prove:
  - proves: 统一有效图层来自 `getEffectiveCourseLayerOrder`；地址稳定且无 hitId；owner 内排序一次 history；跨 owner 列表失败；控制器不可搬 scene、不可复制；`all/include/exclude + locationIds` 改当前 location 显隐不改 active location / 课程顺序；lock 拒绝其它写；duplicate/delete/state-hide 各一次 history；stale-revision 拒绝；缺控制器时 restore 仍写入 global
  - does not prove: 未接真实 NodesTab / Properties 全局挂载 / Workspace / Player；未改默认 V8；未跑 typecheck/build/E2E/视觉
- narrow UI smoke, if authorized: 未授权；未启动 App。未开始 R3-Z / R3-CUT。
- INTEGRATION_REQUESTS:
  ```
  INTEGRATION_REQUEST
  - requester task: R3-A
  - target stage integrator: R3-Z
  - target hotspot file: src/renderer/ui/NodesTab.tsx、src/renderer/store/editorStore.ts
  - exported symbol / callback: listEffectiveLayerCommandItems、reorderEffectiveLayerItems、patchEffectiveLayerItem、duplicateEffectiveLayerItem、deleteEffectiveLayerItem
  - required user-visible behavior: V9 candidate 下 NodesTab 显示统一有效图层（行上来源为 global/surface/scene/world，named state 用同一 scene 行 + override，不把 global 控制器伪装成 scene 行）。拖排只把同一 owner 的 back-to-front id 交给 reorderEffectiveLayerItems。锁/隐/复制/删除走 patch/duplicate/delete。R2-E scene-only 对 global/surface 写返回 wrong-owner 仍正确；global/surface 改走本任务命令。默认 V8 路径不变。
  - focused test proving lane side: tests/unit/effectiveLayerCommands.test.ts
  - exact wiring requested: R3A-R3Z-01。candidate 时用 listEffectiveLayerCommandItems({ project, locationId, stateId }) 取代只列 scene nodes；视觉仍可 reverse 成前到后，提交前再 reverse 回 back-to-front。成功且 historyEntry 时用 nextDocument 包进现有 candidate history（commitSlideAuthoringHistory），然后 set 刷新订阅。不要为接线新增置顶/置底按钮。
  - risk if omitted: candidate 图层仍只能改 scene，或把 global 控制器画成 scene 行后误删/误搬
  - status: open
  ```
  ```
  INTEGRATION_REQUEST
  - requester task: R3-A
  - target stage integrator: R3-Z
  - target hotspot file: src/renderer/ui/PropertiesTab.tsx、src/renderer/ui/NodesTab.tsx、src/renderer/store/editorStore.ts
  - exported symbol / callback: setGlobalLayerVisibleAtLocation、setGlobalLayerLocationVisibility、isCourseLayerVisibleAtLocation
  - required user-visible behavior: 选中 global 项时，「当前页显隐 / 全部、仅所选、除所选」写入 V9 `visibility.mode + locationIds`，不得写 V8 `sceneIds`。改当前 location 显隐不得切换 active location，不得重排课程 locations。item.visible（眼睛）与逐 location 可见范围分开。
  - focused test proving lane side: tests/unit/effectiveLayerCommands.test.ts
  - exact wiring requested: R3A-R3Z-02。Properties「场景可见范围」在 candidate 下改为 location 列表并调用 setGlobalLayerLocationVisibility(document, { authoringAddress, locationId }, spec, { expectedRevision })。若 UI 提供「本页显示/隐藏」，调用 setGlobalLayerVisibleAtLocation。target.locationId 用当前预览 location，不要改 startLocationId。
  - risk if omitted: U3 逐 location 显隐仍只存在于 V8 globalLayer，candidate 无法设置 include/exclude
  - status: open
  ```
  ```
  INTEGRATION_REQUEST
  - requester task: R3-A
  - target stage integrator: R3-Z
  - target hotspot file: src/renderer/ui/NodesTab.tsx、src/renderer/ui/Workspace.tsx、src/renderer/store/editorStore.ts
  - exported symbol / callback: moveEffectiveLayerOwner、isTeacherControllerLayerItem、findGlobalTeacherController、restoreDefaultTeacherController、CONTROLLER_MOVE_REASON
  - required user-visible behavior: 教师控制器始终是 global item。拖到 scene/surface/world 必须失败并展示原因，不能变成 scene 行，不能当成功 no-op。删除后可用 restoreDefaultTeacherController 重新加入 global。
  - focused test proving lane side: tests/unit/effectiveLayerCommands.test.ts
  - exact wiring requested: R3A-R3Z-03。跨 owner 放置只能走显式 moveEffectiveLayerOwner；reorderEffectiveLayerItems 遇到混源 id 会失败。若 destination.source !== 'global' 且目标是 teacher-controller，不要改写 document。不要把控制器插入 scene.layerItems。
  - risk if omitted: 控制器被搬进 scene，破坏 global owner 与 Player 全课控制台
  - status: open
  ```
- DECISION_REQUESTS: 无
- remaining risks / untested full checks:
  - 未跑 `npm run typecheck` / `npm test` / `npm run build` / E2E / 视觉回归（R8）
  - 未接真实 NodesTab 拖排或 Properties 全局挂载 UI
  - R3-D 只读投影尚未存在；本任务已导出 list/address/source，R3-D 不要另起 owner 枚举
  - 控制器几何/八向拖动属 R3-C，本任务不写 transform
  - world owner 命令已实现，定向测试以 Slide global/surface/scene/state 为主
- rollback point: 删除产品 worktree 中上述 3 个未跟踪文件。其他 lane 文件保持不动。基线仍为 `f272756`。
- execution state: lane_candidate
- integration state: pending
- quality state: unverified

## 冻结接口（实际导出名）

命令输入一律为 `CourseProjectDocument` + `EffectiveLayerCommandTarget`（`authoringAddress` = `makeAuthoringAddress`，`locationId` 为当前预览位置，`stateId` 可选）+ `LayerCommandOptions.expectedRevision`。

成功写：`{ ok: true, nextDocument, historyEntry: true }`。身份 no-op：`historyEntry: false` 且 `nextDocument` 为原引用。失败：`ok: false`、`historyEntry: false`、无 `nextDocument`。

拒绝码与 R2 对齐：`locked` / `stale-revision` / `wrong-owner`。跨 owner 排序：`CROSS_OWNER_REORDER_REASON`。控制器搬离 global：`CONTROLLER_MOVE_REASON`。

### `src/renderer/course/globalLayerCommands.ts`

| 符号 | 角色 |
|---|---|
| `LayerCommandResult` / `LayerCommandOptions` / `EffectiveLayerCommandTarget` | 与 R2 等价的 document 级合同 |
| `parseLayerAuthoringAddress` / `makeGlobalLayerAuthoringAddress` | 稳定地址；不持久化 hitId |
| `isTeacherControllerLayerItem` / `findGlobalTeacherController` | 控制器探测 |
| `reorderGlobalLayerItems` | 只置换 global owner 的 order 槽 |
| `patchGlobalLayerItem` | lock / hide（`item.visible`）/ rename |
| `setGlobalLayerLocationVisibility` | 写入 `all \| include \| exclude + locationIds` |
| `setGlobalLayerVisibleAtLocation` | 当前 location 显隐；不改 active location 或课程顺序 |
| `duplicateGlobalLayerItem` / `deleteGlobalLayerItem` | 复制新稳定 ID；控制器复制失败 |
| `restoreDefaultTeacherController` | 只恢复为 global item |
| `describeGlobalLayerDeleteImpact` | 删除影响范围文案 |

### `src/renderer/course/effectiveLayerCommands.ts`

| 符号 | 角色 |
|---|---|
| `LayerOwnerSource` | `EffectiveCourseLayerItem['source']`：`global \| surface \| scene \| world` |
| `listEffectiveLayerCommandItems` | 统一有效图层；`stateOverride` 不是 source |
| `makeEffectiveLayerAuthoringAddress` / `locateCourseLayer` / `resolveEffectiveLayerTarget` | owner 解析 |
| `reorderEffectiveLayerItems` | 合法 owner 内排序；混源失败 |
| `patchEffectiveLayerItem` / `duplicateEffectiveLayerItem` / `deleteEffectiveLayerItem` | 按 owner 分发；state 走 overrides |
| `moveEffectiveLayerOwner` | 显式改存储 owner；控制器不能离开 global |

R3-D 只读投影应复用 `LayerOwnerSource` 与 `makeEffectiveLayerAuthoringAddress`，不要等本文件之外的第二套枚举。

## 为何第二条测试是 V8 保护

`tests/unit/globalLayerVisibility.test.ts` 只覆盖 V8 Player `isGlobalLayerItemVisible`（`visibility.sceneIds`）。未改该文件、未放宽断言。V9 `locationIds` 命令断言全部放在 `effectiveLayerCommands.test.ts`。

## R2-E 边界

`v9SlideActionCommands` 对 global/surface 写返回 `wrong-owner` 仍是正确的 scene-only 边界。本任务另建 global/effective 命令，未改 R2 文件。
