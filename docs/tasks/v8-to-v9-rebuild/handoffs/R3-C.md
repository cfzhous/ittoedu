HANDOFF
- task: R3-C
- planning pack path: `C:\Users\74755\Documents\HTML课件编辑器\docs\tasks\v8-to-v9-rebuild`
- product worktree / branch / baseline SHA: `C:\Users\74755\Documents\HTML课件编辑器-v8-to-v9-rebuild` / `codex/v8-to-v9-rebuild` / `f27275658c6dfaa12f2ce35cd9368dcdebe99451`
- outcome: 教师控制器作者内容、选择框、八向手柄、属性预览、试运行与 Published Player 共用同一规范几何。作者态 pointer 经已有 `stageViewportTransform`（`clientToWorld` / `clientDeltaToWorld` / `resizeWorldFrameFromHandle` / `stageSelectionOverlayGeometry`）换算，没有第二套坐标。pointermove 只预览，pointerup 经 `applySlideCandidateCommand` → `commitTeacherControllerAuthoringFrame` 单次写入 global owner 的 frame（禁止走 scene `transformNativeLayers`）。默认 V8（无 candidate）返回 `{ kind: 'v8' }`，不假成功。编辑态 inert；试运行/Player 只改会话；折叠与主题仍走 `createTeacherControllerLayout`。未改 Workspace / Properties / Nodes / App / store / MediaTab。未 commit。未开始 R3-Z。本 lane 为 integration candidate。
- owned files changed (product worktree):
  - `src/shared/teacherControllerLayout.ts`（导出 layout source；规范框=选框；八向常量；hit target；作者动作集含上一/下一/目录/重播/声音/全屏，收起为 chrome）
  - `src/shared/teacherControllerConsistency.ts`（保持 V8 delivery 不变量；补 V9 global controller 识别/恢复/显隐，控制器必须是 global owner）
  - `src/player/teacherControllerRuntimeSession.ts`（RuntimeNode、stage CSS 指针换算、CSS 缩放局部点、runtime 过滤「定位/试运行」、hit bounds）
  - `src/player/teacherControllerDom.ts`（新建：从 HEAD/4755034 摘几何与完整控件 DOM；**修正**供体用 controller container 当 stage 的失败 adapter，改为 `getRenderedStageBounds` = 1280×720 舞台 CSS 尺寸）
  - `src/player/renderTeacherController.ts`（预览/Player 用 runtime 按钮过滤；编辑态仍画完整 layout 且 inert；Phaser 拖动仍用 canvas bounds，与 stage 1:1）
  - `src/renderer/authoring/v9TeacherControllerAuthoring.ts`（新建作者态 bridge）
  - `tests/unit/teacherControllerLayout.test.ts`（补几何合同）
  - `tests/unit/teacherControllerRuntimeSession.test.ts`（补 stage 指针、runtime 过滤、作者态 preview/commit/V8 回退/拒绝 scene owner）
  计划侧：本 HANDOFF。保留任务卡建议的两个测试文件，在其中证明 authoring bridge，未新建第三测试文件。
- donor files/functions consulted:
  - `git show 4755034:src/player/teacherControllerDom.ts` 与计划仓库 HEAD 同文件：布局 DOM、折叠/按钮/session、local hit
  - HEAD `teacherControllerLayout.ts`：`teacherControllerContentRect` / `SelectionChrome` / 作者动作集（**未**迁 `TeacherControllerViewTransform`）
  - HEAD `teacherControllerRuntimeSession.ts`：`TeacherControllerRuntimeNode`、`runtimeTeacherControllerButtons`、`teacherControllerHitBounds`
  - HEAD `teacherControllerConsistency.ts`：V9 `isCourseTeacherControllerLayerItem` / restore / synchronize
  - R2-B：`stageViewportTransform`、`resizeWorldFrameFromHandle`、`stageSelectionOverlayGeometry`、`workspaceSlideAuthoring` 的 preview/commit 与 V8 fallback 模式
  - HEAD `globalLayerCommands.ts`：`commitGlobalControllerTransform` 只读对照（未写入 R3-A 独占文件）
- donor 舍弃部分:
  - `TeacherControllerViewTransform` / `viewDeltaToCanonical` / `mapTeacherControllerRect`（第二套坐标，违反 R2-B viewport 合同）
  - DOM `logicalDragDelta(..., container.getBoundingClientRect(), canvas)`（把控制器自身 CSS 框当 stage，快速拖动会放大漂移）
  - CourseStudio 控制器面板
  - 改 Workspace / Properties / Nodes / Phaser 热点
  - 把控制器降级成粉色矩形或独立弱化控件
- focused validation command:
  ```
  npx vitest run tests/unit/teacherControllerLayout.test.ts tests/unit/teacherControllerRuntimeSession.test.ts
  git diff --check -- src/shared/teacherControllerLayout.ts src/shared/teacherControllerConsistency.ts src/player/teacherControllerDom.ts src/player/teacherControllerRuntimeSession.ts src/player/renderTeacherController.ts src/renderer/authoring/v9TeacherControllerAuthoring.ts tests/unit/teacherControllerLayout.test.ts tests/unit/teacherControllerRuntimeSession.test.ts
  ```
- validation result: Vitest 2 files / 22 tests passed，1.68s。`git diff --check` 无输出、exit 0（对新文件先 `git add -N` 再 check，随后 `git reset`，新文件仍为 untracked）。
- validation entry / fixture / backend:
  - entry: `createTeacherControllerLayout`、`teacherControllerContentRect` / `teacherControllerSelectionChrome`、`teacherControllerOverlayGeometry`、`teacherControllerGestureFrame`、`resizeWorldFrameFromHandle`、`createStageViewportTransform`、`teacherControllerStagePointerDelta`、`runtimeTeacherControllerButtons`、`createV9TeacherControllerAuthoringController`、`commitTeacherControllerAuthoringFrame`、`selectSlideCandidateBackend`、`applySlideCandidateCommand`
  - fixture: V8 `createTeacherControllerNode`；内存 V9 Slide（`globalLayerItems` 上的 teacher-controller，另有 scene Native 文字；scene 内伪装 controller 被拒绝）
  - backend: 默认 V8 store；candidate 仅测试 `injectV9SlideCandidateBackend`。合成 pointer，无 Phaser / Workspace / Player。
- validation proves / does not prove:
  - proves: 内容框=选框=overlay.selectionBox，八向手柄与对象共用 `stageViewportTransform`；zoom=2 时西向 40 CSS px = 世界 20 px 且原点左移；preview 几何 === commit；慢/快/斜向 move 用 start+current world，不累积漂移；pointermove 不升 revision，pointerup 一次 `historyEntry`；控制器写入 `globalLayerItems`，scene 内同类型 id 返回 `wrong-owner`；无 candidate 时 `{ kind: 'v8' }` 且不 ok；作者结果 `inert: true` / `source: 'global'`；runtime 去掉「定位」「试运行」；stage CSS 映射 ≠ 控制器自身框映射
  - does not prove: 未接真实 Workspace / Properties / Nodes / 试运行 iframe / Published Player；未改 V8 Phaser 拖动手势；DOM Player 宿主尚未接线 `getRenderedStageBounds`；未跑 typecheck/build/E2E/视觉
- narrow UI smoke, if authorized: 未授权；未启动 App。
- INTEGRATION_REQUESTS:
  ```
  INTEGRATION_REQUEST
  - requester task: R3-C
  - target stage integrator: R3-Z
  - target hotspot file: src/renderer/ui/Workspace.tsx（本任务不改）
  - exported symbol / callback: createV9TeacherControllerAuthoringController、teacherControllerOverlayGeometry、teacherControllerGestureFrame、commitTeacherControllerAuthoringFrame、applySlideCandidateCommand
  - required user-visible behavior: 教师仍只看到成熟 V8 Workspace。V9 candidate 内部注入。禁止用户可见 V8/V9 切换。未注入时必须继续现有 V8 Phaser 控制器路径，不得放 no-op 或粉色矩形。candidate 下控制器内容、选择框、八向手柄必须走同一 overlay 几何；pointermove 跟手预览，pointerup 单次 history。
  - focused test proving lane side: tests/unit/teacherControllerLayout.test.ts；tests/unit/teacherControllerRuntimeSession.test.ts
  - exact wiring requested: 见下方「R3-Z：Workspace / Properties / Player 应如何调用」。
  - risk if omitted: candidate 画布继续把控制器当 scene Native 交给 transformNativeLayers（wrong-owner 或双写）；选框与内容分离；快速/斜向拖动漂移；默认 V8 被劫持成空操作
  - status: open
  ```
  ```
  INTEGRATION_REQUEST
  - requester task: R3-C
  - target stage integrator: R3-Z
  - target hotspot file: src/renderer/ui/PropertiesTab.tsx（本任务不改）
  - exported symbol / callback: teacherControllerPropertiesPreview、createTeacherControllerLayout
  - required user-visible behavior: 属性预览宽度/高度/按钮排布与画布规范框相同。手势预览期间用 preview frame 调同一 layout，不要另做一套控件示意图。
  - focused test proving lane side: tests/unit/teacherControllerLayout.test.ts（properties preview === createTeacherControllerLayout）
  - exact wiring requested: 选中 global controller 时 `teacherControllerPropertiesPreview(data, frame)`；frame 取 overlay 当前 preview 或 committed frame。
  - risk if omitted: 属性里看到的尺寸/按钮与画布、Player 不一致
  - status: open
  ```
  ```
  INTEGRATION_REQUEST
  - requester task: R3-C
  - target stage integrator: R3-Z
  - target hotspot file: 试运行 iframe / Published Player 宿主（本任务不改 Player 壳）
  - exported symbol / callback: createTeacherControllerLayout、TeacherControllerDom、teacherControllerDomNode、getRenderedStageBounds、renderTeacherController
  - required user-visible behavior: 试运行与 Published Player 使用同一 layout（标题、进度、上一/下一/目录/重播/声音/全屏、收起）。编辑态 inert；播放只改 session offset/collapse，不写工程。折叠状态与主题（palette）与作者态一致。DOM 指针必须传舞台 CSS 尺寸，禁止用控制器自身 getBoundingClientRect。
  - focused test proving lane side: tests/unit/teacherControllerRuntimeSession.test.ts（stage 映射与 runtime 按钮过滤）
  - exact wiring requested: Phaser 路径保持现有 `renderTeacherController`。未来 DOM surface 用 `TeacherControllerDom` + `getRenderedStageBounds: () => stage.getBoundingClientRect()`（1280×720 舞台，不是控制器框）。
  - risk if omitted: Player 拖动按控制器宽度放大 delta，选框/实体分离
  - status: open
  ```
- DECISION_REQUESTS: 无
- remaining risks / untested full checks:
  - 未跑 `npm run typecheck` / `npm test` / `npm run build` / E2E / 视觉回归（R8）
  - `commitTeacherControllerAuthoringFrame` 写 `history.present.globalLayerItems`，需 R3-Z 用已有 `applySlideCandidateCommand` 落 session（lane 测试已通过注入 candidate 证明）。R3-A 的 `commitGlobalControllerTransform` 若随后提供，应委托同一 frame 几何，不要第二套 resize。
  - Spatial 合同常量 `TEACHER_CONTROLLER_SPATIAL_LAYER = 'viewport'`：R5 必须把控制器放在 viewport overlay 上，传入的 `StageViewportTransform` 是该 overlay 的矩阵，不是 world camera。
  - 旋转控制器的 resize 仍用轴对齐 `resizeWorldFrameFromHandle`（与 R2-B 相同限制）。
- rollback point: 还原产品 worktree 中 `teacherControllerLayout.ts`、`teacherControllerConsistency.ts`、`teacherControllerRuntimeSession.ts`、`renderTeacherController.ts`、两个测试文件的本任务 diff；删除 `src/player/teacherControllerDom.ts`、`src/renderer/authoring/v9TeacherControllerAuthoring.ts`。其他 lane 文件保持不动。基线仍为 `f272756`。
- execution state: lane_candidate
- integration state: pending
- quality state: unverified

## 几何合同（给 R3-Z）

1. **规范框** = `item.frame` / node `{x,y,width,height}`。`teacherControllerContentRect` === `teacherControllerSelectionChrome`。不得给选框加 padding 或另算 AABB。
2. **Viewport** = 唯一 `createStageViewportTransform`。内容、选框、八向手柄、旋转柄（若画）都经 `teacherControllerOverlayGeometry` → `stageSelectionOverlayGeometry`。禁止 `TeacherControllerViewTransform` 或按控制器 DOM 框换算。
3. **Resize** = `resizeWorldFrameFromHandle`（西/北移动原点）。八向与手柄一致：`STAGE_RESIZE_HANDLE_DIRECTIONS`。
4. **Move** = `currentWorld - startWorld` 加到 start frame。不要在 pointermove 上累加 CSS delta。
5. **History** = pointermove 只改 preview；pointerup 一次 `commitTeacherControllerAuthoringFrame`。locked 可选中，不开始手势。
6. **Owner** = 只写 `project.globalLayerItems`。scene `transformNativeLayers` 会 `wrong-owner`。
7. **Layout / 主题** = `createTeacherControllerLayout(source, frame.width, frame.height)`。作者、属性预览、试运行、Player 同一函数。
8. **动作** = 上一、下一、目录、重播、声音、全屏；收起是 collapse chrome。runtime 去掉「定位」「试运行」。编辑态 `inert: true`，不触发 action。

## R3-Z：Workspace / Properties / Player 应如何调用

本任务不改热点。建议在同一 V8 表面内接入。

### 1. Workspace

```ts
import { createV9TeacherControllerAuthoringController } from '../authoring/v9TeacherControllerAuthoring'
import { createSlideWorkspaceAuthoringController } from './workspaceSlideAuthoring'

const controllerAuthoring = createV9TeacherControllerAuthoringController()
const slideAuthoring = createSlideWorkspaceAuthoringController()
```

每个指针事件：

```ts
const controllerResult = controllerAuthoring.pointerDown({ x: clientX, y: clientY }, viewport)
if (controllerResult.kind === 'v8') {
  // 默认产品：现有 V8 Phaser 控制器路径。不要当作成功。
} else if (controllerResult.overlay && (controllerResult.preview || controllerResult.target)) {
  // 画 controllerResult.overlay（对象+选框+八向）
  // 不要再 emit 到 V8 store 或 slideAuthoring.transformNativeLayers
} else {
  // 未命中控制器：走 slideAuthoring
}
```

`pointerMove` / `pointerUp` 同样先问控制器。`pointerUp` 已在 bridge 内 `applySlideCandidateCommand(commitTeacherControllerAuthoringFrame)`。成功后按 R2-SEAM 刷新订阅（candidate 不 `set` V8 project）。

无 candidate 时三个结果都是 `{ kind: 'v8', reason: 'not-v9-slide-candidate' }`。**candidate 时不得 no-op**：必须画 overlay 并在 pointerup 提交。

### 2. Properties

选中 global controller：`teacherControllerPropertiesPreview(item.content.data, previewFrame ?? item.frame)`。手势中用 `controllerAuthoring.propertiesPreview()`。

### 3. Player / 试运行

- 现有 Phaser：`renderTeacherController`（authoring 时 inert，preview 只改 session）。
- 未来 DOM surface：`new TeacherControllerDom({ ..., getRenderedStageBounds: () => stageEl.getBoundingClientRect(), getInteractive: () => !inspect })`。`getRenderedStageBounds` 必须是舞台，不是控制器节点。

### 4. 禁止

- 用 scene `transformNativeLayers` 写控制器
- candidate 会话里继续把控制器写进 V8 `project.globalLayer`
- 在 `selectSlideCandidateBackend === null` 时画假 V9 overlay 或返回 `ok: true`
- 粉色矩形、独立弱化控件、第二套坐标
