HANDOFF
- task: R2-B
- planning pack path: `C:\Users\74755\Documents\HTML课件编辑器\docs\tasks\v8-to-v9-rebuild`
- product worktree / branch / baseline SHA: `C:\Users\74755\Documents\HTML课件编辑器-v8-to-v9-rebuild` / `codex/v8-to-v9-rebuild` / `f27275658c6dfaa12f2ce35cd9368dcdebe99451`
- outcome: 在产品 worktree 新建 Slide 画布命中/选择/变换内核，并窄扩 viewport 与 Phaser adapter。单选/多选/框选/图层选择都经 `makeAuthoringAddress` 得到同一 `SlideAuthoringTarget`，不持久化 `hitId`。对象、选择框、旋转柄、八向手柄共用 `stageViewportTransform`。pointermove 只预览，pointerup 经 `runSlideCandidateCommand` → `transformNativeLayers` 单次提交。西/北 resize 移动原点。图片/视频/Component/Runtime 在 adapter 层可命中。locked 可选看，调用 transform 返回 `locked`。`selectSlideCandidateBackend === null` 时返回 `{ kind: 'v8', reason: 'not-v9-slide-candidate' }`，不 no-op 假成功。未改 App/store/Workspace/sidebars，未 commit，未宣称 V9 编辑器可用。本 lane 为 integration candidate。
- owned files changed (product worktree):
  - `src/renderer/ui/workspaceSlideAuthoring.ts`（新建）
  - `src/renderer/phaser/v9SlideHitAdapter.ts`（新建，窄 adapter）
  - `src/renderer/authoring/stageViewportTransform.ts`（窄扩：overlay 几何、西/北 resize、旋转柄）
  - `src/renderer/phaser/EditorPhaserBridge.ts`（re-export adapter；`pointerToSlideWorld`）
  - `src/renderer/phaser/EditorScene.ts`（群组 resize 改用 `resizeWorldFrameFromHandle`）
  - `tests/unit/v9SlideViewportAdapter.test.ts`（新建）
  - `tests/unit/stageViewportTransform.test.ts`（补 overlay / 西/北 resize 断言）
  计划侧：本 HANDOFF。未改 App.tsx、editorStore.ts、Workspace.tsx、NodesTab、PropertiesTab、R2-A course 三文件、elementAnimationPreviewBus.ts。
- donor files/functions consulted:
  - 计划仓库 `src/renderer/authoring/stageViewportTransform.ts`：`stageSelectionOverlayGeometry`、`resizeWorldFrameFromHandle`、`stageOverlayCssTransform`（按函数摘取并补旋转柄）
  - `f00c01b` / 计划仓库 `workspaceSlideAuthoring.ts`：只读「单 backend、默认 V8 不合并」意图；**未**整文件迁入（供体已混入 IME/文字事务与 Player preview 重建，属 R2-C / R2-Z）
  - 产品 `EditorScene.previewGroupResize` / `SelectionOverlay`：八向手柄与旋转柄世界坐标、西/北移动原点
  - R2-A/SEAM：`createSlideCandidateBackend`、`makeSlideAuthoringTarget`、`selectSlideCandidateBackend`、`runSlideCandidateCommand`
- donor 舍弃部分:
  - 供体 `workspaceSlideAuthoring.ts` 的 IME / `beginWorkspaceTextEditSession` / preview Project 重建（R2-C / R2-Z）
  - 改 `Workspace.tsx` 接线（R2-Z）
  - `?editor-backend=`、第二 App、第二 store
  - Component/Runtime 的 transform 写命令（仍走 R2-A Native-only `transformSlideNativeLayers`；本任务只证明可命中）
- focused validation command:
  ```
  npx vitest run tests/unit/v9SlideViewportAdapter.test.ts tests/unit/stageViewportTransform.test.ts
  git diff --check -- src/renderer/ui/workspaceSlideAuthoring.ts src/renderer/authoring/stageViewportTransform.ts src/renderer/phaser/EditorPhaserBridge.ts src/renderer/phaser/EditorScene.ts tests/unit/v9SlideViewportAdapter.test.ts tests/unit/stageViewportTransform.test.ts
  ```
- validation result: Vitest 2 files / 31 tests passed，1.88s。`git diff --check` 无输出、exit 0（对新文件先 `git add -N` 再 check，随后 `git reset`，新文件仍为 untracked）。未把 check 扩到整个 phaser 目录。
- validation entry / fixture / backend:
  - entry: `createSlideWorkspaceAuthoringController`、`adaptV9SlideLayerItemHit`、`hitTestV9SlideLayerItems`、`resizeWorldFrameFromHandle`、`stageSelectionOverlayGeometry`、`EditorPhaserBridge.pointerToSlideWorld`、`injectV9SlideCandidateBackend`、`runSlideCandidateCommand` / `transformNativeLayers`、`makeAuthoringAddress`
  - fixture: 内存 V9 Slide（scene Native 文字可写+锁定、image、video、Component、surface-v1 Runtime；surface 共享层；global 层）。测试自行 `injectV9SlideCandidateBackend`。合成 pointer，无 Phaser 游戏循环。
  - backend: 默认 V8 store；candidate 仅为测试注入的 in-memory `SlideCandidateBackend`
- validation proves / does not prove:
  - proves: 默认 V8 时本模块不假成功；单选/加选/框选/图层选择得到同一无 hitId 的 `SlideAuthoringTarget`；对象/选择框/旋转柄/八向手柄共用 viewport transform；zoom=2 后西向拖 40 CSS px = 世界 20px 且原点左移；pointermove 不改 revision，pointerup 一次 `historyEntry`；西/北 resize 移动原点、东/南不移动；image/video/Component/Runtime adapter 可命中；locked 可选中，`transformSelection` 返回 `locked`；Phaser world 指针与 Project 世界 1:1
  - does not prove: 未接真实 Workspace / ScenePanel / NodesTab / Player；未把 V8 Phaser 拖动手势改接到 candidate；未证明 Component/Runtime 的 transform 写命令；未跑 typecheck/build/E2E/视觉
- narrow UI smoke, if authorized: 未授权；未启动 App。
- INTEGRATION_REQUESTS:
  ```
  INTEGRATION_REQUEST
  - requester task: R2-SEAM
  - target stage integrator: R2-B
  - target hotspot file: 禁止改 editorStore.ts / App.tsx / Workspace.tsx
  - exported symbol / callback: selectSlideAuthoringSnapshot、selectSlideCandidateBackend、runSlideCandidateCommand
  - required user-visible behavior: 无。未实现能力继续走默认 V8，禁止 candidate UI no-op。
  - focused test proving lane side: tests/unit/v9SlideViewportAdapter.test.ts
  - exact wiring requested: R2SEAM-R2B-01 已由本任务消费：命中/选择/变换只走 candidate；`selectSlideCandidateBackend === null` 返回 `{ kind: 'v8' }` 且不 ok；测试用 `injectV9SlideCandidateBackend`；未改 store/App/Workspace。
  - risk if omitted: （已消费）
  - status: implemented（lane 侧已满足；待协调者改账本）
  ```
  ```
  INTEGRATION_REQUEST
  - requester task: R2-B
  - target stage integrator: R2-Z
  - target hotspot file: src/renderer/ui/Workspace.tsx（本任务不改）
  - exported symbol / callback: createSlideWorkspaceAuthoringController、resolveSlideWorkspaceAuthoringKind、stageSelectionOverlayGeometry / stageOverlayCssTransform、EditorPhaserBridge.pointerToSlideWorld
  - required user-visible behavior: 教师仍只看到成熟 V8 Workspace。V9 candidate 仅内部注入。禁止用户可见 V8/V9 切换。未注入时必须继续现有 V8 Phaser 路径，不得放 no-op。
  - focused test proving lane side: tests/unit/v9SlideViewportAdapter.test.ts
  - exact wiring requested: 见下方「R2-Z：Workspace 应如何调用 workspaceSlideAuthoring」。
  - risk if omitted: 画布继续只写 V8 project，或 candidate 与 V8 Phaser 双写；西/北 resize 与 zoom 几何在 UI 上仍分叉
  - status: open
  ```
- DECISION_REQUESTS: 无
- remaining risks / untested full checks:
  - 未跑 `npm run typecheck` / `npm test` / `npm run build` / E2E / 视觉回归（R8）
  - 单选旋转物体的局部坐标系西/北 resize 仍以轴对齐 `resizeWorldFrameFromHandle` 为准；带旋转的单选手柄命中已按旋转后世界点计算，但 pointer 拖动按轴对齐框处理。与 V8 `EditorScene.previewSingleResize` 的局部轴不完全相同，R2-Z 若要像素级对齐旋转物体，需在 Workspace 接线时决定是否把 Phaser 单选 resize 也切到同一函数。
  - Component/Runtime 可命中、可选择；写入变换仍被 R2-A `transformSlideNativeLayers` 拒绝（`invalid-target`），留给 R2-D
  - candidate 命令不 `set` store，React 订阅不会因 V9 mutation 刷新（R2SEAM-R2Z-01）
- rollback point: 还原产品 worktree 中 `stageViewportTransform.ts`、`EditorPhaserBridge.ts`、`EditorScene.ts`、`stageViewportTransform.test.ts` 的本任务 diff；删除 `src/renderer/ui/workspaceSlideAuthoring.ts`、`src/renderer/phaser/v9SlideHitAdapter.ts`、`tests/unit/v9SlideViewportAdapter.test.ts`。其他 lane 文件保持不动。基线仍为 `f272756`。
- execution state: lane_candidate
- integration state: pending
- quality state: unverified

## R2-Z：Workspace 应如何调用 workspaceSlideAuthoring

本任务不改 `Workspace.tsx`。建议 R2-Z 在同一 V8 Workspace 内按下述顺序接入，一次只走一个 backend。

### 1. 创建控制器（组件级，不要绑 App 生命周期 inject）

```ts
import { createSlideWorkspaceAuthoringController } from './workspaceSlideAuthoring'
import {
  selectSlideCandidateBackend,
  useEditorStore,
} from '../store/editorStore'
import { createStageViewportTransform } from '../authoring/stageViewportTransform'

const slideAuthoring = createSlideWorkspaceAuthoringController()
```

`injectV9SlideCandidateBackend` 仍只给测试/开发；不要接到菜单、顶栏或 `?editor-backend=`。

### 2. 每个指针事件先问 candidate，V8 则原路返回

用现有 `stageViewportRef` + `view.zoom` / `view.x` / `view.y` 组成 `StageViewportTransformOptions`（与今天 `createStageViewportTransform` 相同）。

```ts
const viewport = {
  viewport: { x: rect.left, y: rect.top, width: rect.width, height: rect.height },
  zoom: view.zoom,
  pan: { x: view.x, y: view.y },
}

const result = slideAuthoring.pointerDown({ x: clientX, y: clientY, additive }, viewport)
if (result.kind === 'v8') {
  // 默认产品：保持现有 Phaser / Workspace 处理。不要当作成功。
  return
}
// result.kind === 'v9-slide-candidate'
// 使用 result.overlay / result.preview / result.targets
// 不要再 emit 到 V8 store 的 select/transform
```

`pointerMove` / `pointerUp` 同样分支。`pointerMove` 只读 `result.preview` 画预览，不得在 move 里再调 command。`pointerUp` 已在控制器内 `runSlideCandidateCommand(backend => backend.transformNativeLayers(...))`。

Phaser 代理事件若继续使用 `pointer.worldX/worldY`，传入 `{ space: 'world', x: pointer.worldX, y: pointer.worldY }`，或 `bridge.pointerToSlideWorld(pointer)`（1280×720 逻辑坐标已经是 Project 世界；CSS zoom/pan 在 stage stack 上）。

### 3. 图层选择与画布选择共用控制器

NodesTab / 画布都不要各自 `makeAuthoringAddress`。图层点击：

```ts
slideAuthoring.selectFromLayerIds(ids, viewport, additive)
```

与画布命中得到同一 `SlideAuthoringTarget`（`authoringAddress` 来自 `backend.makeTarget` → `makeAuthoringAddress`）。禁止把 Phaser `hitId` 或临时 DOM id 写入 project / history / target。

### 4. overlay 几何

`slideAuthoring.overlayGeometry(viewport)` 或 `stageSelectionOverlayGeometry`：对象、选择框、旋转柄、八向手柄已是同一 transform 下的 client 点。现有 stage stack 的 `left/top` + `scale(stageTransform.scale)` 已与 `createStageViewportTransform` 一致，不要再给手柄乘一次 zoom。

### 5. 成功 command 后刷新订阅

candidate 命令目前只突变闭包，Zustand 不会通知。R2-Z 在 `result.command?.ok` 后需要 `set` 一次（缓存 snapshot），否则画面不刷新。见 R2-SEAM 的 R2SEAM-R2Z-01。不要为此改 V8 `markSaved` / `saveProject`。

### 6. locked 与未实现写入

- locked：可选中；不要开始 move/resize/rotate 手势。若仍调用 `transformSelection`，会 `ok: false, reason: 'locked'`。
- Component / Runtime：adapter 可命中、可选择；不要把它们塞进 `transformNativeLayers`（R2-A 会 `invalid-target`）。内容写入留给 R2-D。

### 7. 禁止

- 改本任务已冻结的 `workspaceSlideAuthoring.ts` 合同去迁就第二套 UI
- candidate 会话里继续把 Phaser `emitTransformsEnd` 写进 V8 `project`
- 在 `selectSlideCandidateBackend === null` 时画假的 V9 overlay 或返回 `ok: true`
