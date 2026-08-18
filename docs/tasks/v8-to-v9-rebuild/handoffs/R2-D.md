HANDOFF
- task: R2-D
- planning pack path: `C:\Users\74755\Documents\HTML课件编辑器\docs\tasks\v8-to-v9-rebuild`
- product worktree / branch / baseline SHA: `C:\Users\74755\Documents\HTML课件编辑器-v8-to-v9-rebuild` / `codex/v8-to-v9-rebuild` / `f27275658c6dfaa12f2ce35cd9368dcdebe99451`
- outcome: 在产品 worktree 新建 Slide 内容命令：连续插入沿用 V8 自动错开；图片/视频作为 scene Native layer 可加入、替换、裁剪/适配并改属性；Component instance 的 props/variant/preset/nested content 可读写；Runtime 用 `makeAuthoringAddress` 作 authoring target，asset 引用写 `runtime.assets[key].assetId`；简单出现动画与专业 interaction 规则写在当前 scene 的 `interactions`（V8 `simple_entrance_*` / `node.enter` 形状）。命令只写 candidate `CourseProjectDocument` session，不写 V8 `ProjectDocument`。未改 MediaTab / ComponentsTab / AutomationTab / App / store / Workspace / Phaser / R2-A 三文件 / `elementAnimationPreviewBus.ts`。未接线动画预览总线。未 commit。本 lane 为 integration candidate。
- owned files changed (product worktree, new):
  - `src/renderer/course/v9SlideContentCommands.ts`
  - `tests/unit/v9SlideContentCommands.test.ts`
  计划侧：本 HANDOFF。未改 R2-A 三文件、账本、archive、export。
- donor files/functions consulted:
  - `git show 4755034:src/renderer/course/courseStudioModel.ts`：`addSlideTextLayer` / `addImageLayer` / `addComponentLayer` / `appendSlideLayerForPresentation` / `sceneNodeToCourseLayerItem`（只摘插入与 order/state 语义，未整文件迁入 `courseStudioModel`）
  - 产品 V8 `editorStore.offsetDefaultInsertion`（`DEFAULT_INSERTION_COLUMNS = 6`、`DEFAULT_INSERTION_OFFSET = 20`、slot `% 24`）与 `createImageNode(assetId, width, height)` 缩放
  - 产品 `tests/unit/batchMediaAndInsertion.test.ts` 连续插入唯一 `x:y`
  - 产品 `setSimpleEntranceAnimation` / `simple_entrance_` 规则形状；`elementAnimationPreviewBus` 的 `{ action, delayMs }`（只读，未改）
  - 供体 `v9SlideVerticalSlice`：`replaceV9SlideMedia`、`updateV9SlideComponentProps`、`updateV9SlideRuntimeContent/Asset`、`addV9SlideComponentLayer`（改写成 R2-A session/`SlideCommandResult`）
  - R2-A：`SlideAuthoringSession` / `SlideCommandResult` / `commitSlideProjectMutation` / `makeSlideAuthoringTarget`
- donor 舍弃部分:
  - `courseStudioModel.ts` 整文件；CourseStudio / 第二媒体库 / 第二组件面板
  - 供体文字默认 `(120,120)`（改用 V8 `createTextNode` 居中 + 错开）
  - `elementAnimationPreviewBus.ts` / `EditorScene.ts` 预览接线（交给 R2-Z）
  - MediaTab / ComponentsTab / AutomationTab / store / App / Workspace / Phaser（R2-B 独占）
  - 从 Player/Phaser proxy 反建项目
- focused validation command:
  ```
  npx vitest run tests/unit/v9SlideContentCommands.test.ts tests/unit/nodeAdapterAnimation.test.ts
  git diff --check -- src/renderer/course/v9SlideContentCommands.ts tests/unit/v9SlideContentCommands.test.ts tests/unit/nodeAdapterAnimation.test.ts
  ```
- validation result: Vitest 2 files / 12 tests passed，2.07s（本任务 10 个 + `nodeAdapterAnimation` 2 个）。`git diff --check` 无输出、exit 0（对新文件先 `git add -N` 再 check，随后 `git reset`，文件仍为 untracked）。未改 `nodeAdapterAnimation.test.ts`。
- validation entry / fixture / backend:
  - entry: `offsetDefaultSlideInsertion`、`addSlideTextLayer` / `addSlideImageLayer` / `addSlideVideoLayer` / `addSlideComponentLayer` / `addSlideRuntimeLayer`、`replaceSlideMediaAsset`、`updateSlideNativeLayerContent`、`updateSlideComponentProps` / variant / preset / nested content、`updateSlideRuntimeContentValue` / `updateSlideRuntimeAsset`、`makeSlideAuthoringTarget`、`setSlideSimpleEntranceAnimation`、`upsertSlideInteractionRule`、`openSlideAuthoringSession`
  - fixture: 内存 V9 Slide（1 surface / 1 空 scene；图片+视频 assets；已嵌入 Component API 4 包元数据）。第二个测试用现有 V8 Phaser `BaseNodeAdapter` fixture
  - backend: 纯 Slide domain / in-memory candidate session；命令写 `CourseProjectDocument`；默认产品仍为 V8
- validation proves / does not prove:
  - proves: 连续默认插入与 V8 6×20px / `% 24` 错开一致；显式坐标不错开；图片/视频 scene Native 可加入、替换 asset、写 crop/fit/播放字段；Component props/variant/preset/nested `content.*` 可读写；Runtime target 为 `makeAuthoringAddress`（carrier `runtime`），asset 引用稳定；简单出现动画写成 `simple_entrance_*` + `node.enter`（含 slide/left/420/80，与 `nodeAdapterAnimation` 预览载荷同形）；专业 interaction 可 upsert；locked / stale-revision / wrong-owner 拒绝且无 history；源 fixture 不被改；`schemaVersion === 9`
  - does not prove: 未接真实 Workspace / MediaTab / ComponentsTab / AutomationTab / Player；插入后画布命中/选择未接 R2-B；动画预览总线未接 `requestNodeMotionPreview`；未把命令挂到 `SlideCandidateBackend`；未跑 typecheck/build/E2E/视觉
- narrow UI smoke, if authorized: 未授权；未启动 App。
- INTEGRATION_REQUESTS:
  ```
  INTEGRATION_REQUEST
  - requester task: R2-SEAM
  - target stage integrator: R2-D
  - target hotspot file: src/renderer/course/v9SlideContentCommands.ts
  - exported symbol / callback: addSlideImageLayer、addSlideVideoLayer、addSlideComponentLayer、addSlideRuntimeLayer、setSlideSimpleEntranceAnimation、upsertSlideInteractionRule
  - required user-visible behavior: 无
  - focused test proving lane side: tests/unit/v9SlideContentCommands.test.ts
  - exact wiring requested: R2SEAM-R2D-01 已由本任务消费：内容命令只写 candidate `CourseProjectDocument` session；测试直接对 session 调纯函数；未改 store/MediaTab；未把 V8 saveProject 写成 V9 archive。账本 status 请协调者改为 implemented（本任务不改 INTEGRATION_LEDGER）。
  - risk if omitted: （已消费）
  - status: implemented（lane 侧已满足；待协调者改账本）
  ```
  ```
  INTEGRATION_REQUEST
  - requester task: R2-D
  - target stage integrator: R2-B
  - target hotspot file: src/renderer/ui/workspaceSlideAuthoring.ts、src/renderer/phaser（R2-B 独占；本任务不改）
  - exported symbol / callback: addSlideImageLayer / addSlideVideoLayer / addSlideComponentLayer / addSlideRuntimeLayer 成功后 `selection.selectionIds[0]` 与 `makeSlideAuthoringTarget`
  - required user-visible behavior: candidate 下新插入的图片/视频/Component/Runtime 可命中、可选中；不得另起第二套 hitId 持久化
  - focused test proving lane side: tests/unit/v9SlideContentCommands.test.ts（证明层已写入 scene Native/component/runtime 且带稳定 layerItemId）
  - exact wiring requested: 插入成功后用返回 selection 的 `layerItemId` 做 hit/select。图片/视频是 `kind: 'native'`；Component `kind: 'component'`；Runtime `kind: 'runtime'`。本任务不改 Phaser。
  - risk if omitted: 数据已在 V9 scene 中，画布仍点不到新元素
  - status: open
  ```
  ```
  INTEGRATION_REQUEST
  - requester task: R2-D
  - target stage integrator: R2-Z
  - target hotspot file: src/renderer/ui/Workspace.tsx、PropertiesTab / AutomationTab 接线、src/renderer/phaser/elementAnimationPreviewBus.ts（R2-Z 可改总线接线；本任务未改该文件）
  - exported symbol / callback: slideSimpleEntrancePreviewRequest、setSlideSimpleEntranceAnimation、readSlideSceneInteractions、upsertSlideInteractionRule
  - required user-visible behavior: candidate 下简洁「出现动画」与专业互动规则可预览；预览载荷为 `{ action: NodeMotionAction, delayMs }`，与现有 `requestNodeMotionPreview` / `nodeAdapterAnimation` 相同。默认 V8 继续走现有 store 路径，禁止 candidate UI no-op。
  - focused test proving lane side: tests/unit/v9SlideContentCommands.test.ts（简单出现动画写出 `node.enter` + slide/left/420/80）；tests/unit/nodeAdapterAnimation.test.ts（V8 adapter 预览合同未改）
  - exact wiring requested: R2-Z 在 candidate 会话把 `slideSimpleEntrancePreviewRequest(session, layerItemId)` 交给 `requestNodeMotionPreview(action, delayMs)`。插入后命中见上条 R2-B 请求。命令目前是 session 纯函数，需 `writeSession` 或 seam apply 写回 candidate；不要双写 V8 project。
  - risk if omitted: 动画数据能保存但不能预览；或误把 V8 MediaTab 接到 V9
  - status: open
  ```
- DECISION_REQUESTS: 无
- remaining risks / untested full checks:
  - 未跑 `npm run typecheck` / `npm test` / `npm run build` / E2E / 视觉回归（R8）
  - 未把内容命令挂到 `SlideCandidateBackend` 方法表（R2-A 冻结接口未扩；测试直接调纯函数）
  - 批量媒体网格 `layoutMediaBatchNodes` 未迁（属 MediaTab/R3-B；本任务只闭合连续单次插入错开）
  - 命名状态下插入会写 `visible: false` + override `visible: true`，定向测试未覆盖该分支
  - global/surface 内容写入仍拒绝（R3）
- rollback point: 删除产品 worktree 中 `src/renderer/course/v9SlideContentCommands.ts` 与 `tests/unit/v9SlideContentCommands.test.ts`；其他 lane 文件保持不动；基线仍为 `f272756`。
- execution state: lane_candidate
- integration state: pending
- quality state: unverified

## 错开合同（V8 `offsetDefaultInsertion`）

导出：`SLIDE_DEFAULT_INSERTION_COLUMNS = 6`、`SLIDE_DEFAULT_INSERTION_OFFSET = 20`、`offsetDefaultSlideInsertion`。

- `existingItemCount` = 当前 **scene.layerItems.length**（插入前）
- 未给显式 `x`/`y`：`slot = count % 24`；`x += (slot % 6) * 20`；`y += floor(slot / 6) * 20`
- 显式 `x` 或 `y`：不错开
- 默认几何来自 V8 `createTextNode` / `createImageNode(assetId, w, h)`（含 640×480 缩放）/ `createVideoNode`
- 新层 `order` 取当前 scene 最大 order+1，并避开 global/surface 已占用的统一 order；不把新 scene 项叠到 global 之上

## 命令列表

均接受 `SlideAuthoringSession`，返回 `SlideCommandResult`；成功时一次 revision/history；identity no-op 不写 history。`scope !== 'scene'` → `wrong-owner`。locked → `locked`。

| 命令 | 作用 |
|---|---|
| `addSlideTextLayer` | scene Native 文字，带 V8 错开 |
| `addSlideImageLayer` | scene Native 图片，引用已有 `assets[assetId]` |
| `addSlideVideoLayer` | scene Native 视频 |
| `addSlideComponentLayer` | scene Component instance（包须已嵌入；manifest 可选，用于 default/preset） |
| `addSlideRuntimeLayer` | scene Runtime；默认 surface-v1 / API 3 / DOM |
| `replaceSlideMediaAsset` | 替换图片/视频 `assetId`（类型必须匹配） |
| `updateSlideNativeLayerContent` | 写 crop/fit/cropX/cropY 及视频播放等 nativeData |
| `updateSlideComponentProps` | 整份 props |
| `applySlideComponentVariant` | `applyComponentVariant` |
| `applySlideComponentPreset` | `resolveComponentPresetProps` |
| `updateSlideComponentNestedContent` | `setComponentPropValue` 路径（如 `content.title`） |
| `updateSlideRuntimeContentValue` | `runtime.content.values[key]` |
| `updateSlideRuntimeAsset` | `runtime.assets[key] = { assetId }` |
| `updateSlideRuntimeDefinition` | source/enabled/content/assets |
| `setSlideSimpleEntranceAnimation` | 写/清 `simple_entrance_*`；有专业 `node.enter` 时拒绝 |
| `upsertSlideInteractionRule` / `removeSlideInteractionRule` | 专业 automation 数据 |
| `slideSimpleEntrancePreviewRequest` | 只读 `{ action, delayMs }`，供 R2-Z 交给预览总线 |

只读：`readSlideNativeLayer` / `readSlideComponentLayer` / `readSlideRuntimeLayer` / `readSlideSimpleEntranceAnimation` / `readSlideSceneInteractions` / `makeSlideAuthoringTarget`。
