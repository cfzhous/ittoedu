# T08 — Spatial 无限画布作者与运行纵切

> Wave：2，可与 T05–T07/T09 并行
> 依赖：T02/T03/T04
> 当前门槛：可靠轻量作者能力；不要求本轮达到 Focusky 全功能

## 1. 可见结果

教师可从空白 Spatial 页面开始，在真实无限画布上创建和编辑文字、图形、公式、图片、Runtime/Component 等世界元素，并管理镜头、路径、关系、semantic zoom、图层和试运行。世界内容与屏幕 UI 坐标严格分离。

## 2. 独占文件

- `src/renderer/course/spatialEditorCommands.ts`
- `src/renderer/course/spatialEditorView.ts`
- `src/renderer/course/spatialCameraCommands.ts`
- `src/renderer/course/spatialPathCommands.ts`
- `src/renderer/ui/SpatialWorkspace.tsx`
- `src/renderer/ui/SpatialCameraPanel.tsx`
- `src/renderer/ui/SpatialLayerInspector.tsx`
- `src/renderer/ui/SpatialPathEditor.tsx`
- `src/renderer/ui/spatialWorkspaceAuthoring.ts`
- `src/player/surfaces/spatial/**`
- 对应 `spatial*` 单测

不修改共享 `stageViewportTransform.ts`（T05 owner）、Workspace、App/store、ScenePanel、RightSidebar、PublishedCourseApp 或导出。

## 3. 作者态合同

### 3.1 世界元素

- 新增、选择、多选、拖动、八向缩放、旋转、复制、Delete、锁定、隐藏、owner 内排序。
- 文字/公式可编辑，图片/组件/Runtime 可命中；稳定地址跨保存有效。
- selection chrome 以 viewport 尺寸绘制但准确包围 world item；缩放时手柄/UI chrome 不随世界缩小。

### 3.2 视口与镜头

- 平移/缩放中心稳定，支持负坐标、小地图、适配与重置。
- camera frame 新增、重命名、排序、删除、设首页、从当前视口捕获；镜头切换不被 effect 重置回 home。
- 左栏只把页面与“本页镜头”做父子树；坐标和缩放参数不塞进导航。

### 3.3 路径、关系与语义缩放

- path/relation/label 在编辑器和 Spatial host 中真实渲染。
- 删除 world item/frame/path/relation 时级联维护引用或明确阻止。
- semantic zoom 规则可编辑并有确定命中顺序。
- Player 路径播放与当前 camera/session 一致，作者态不执行导航动作。

### 3.4 全局内容

- global controller/overlay 是 viewport 层，不随 world pan/zoom。
- 选择全局层不创建 camera 或 world item；实际接线由 T06/T10。

## 4. 远期边界

本任务为 Focusky 级扩张保留 Runtime/Component 和相机路径接口，但不新增完整时间线、复杂转场面板、批量 AI patch 或原生化所有动态效果。不得用远期目标拖延当前 CRUD、坐标和保存闭环。

## 5. 最小验证

```powershell
npx vitest run tests/unit/spatialEditorCommands.test.ts tests/unit/spatialEditorView.test.ts
npx vitest run tests/unit/spatialWorkspaceAuthoring.test.ts tests/unit/spatialCameraCommands.test.ts
npx vitest run tests/unit/spatialPathCommands.test.ts tests/unit/spatialPathPipeline.test.ts
npx vitest run tests/unit/spatialSurfaceHost.test.ts tests/unit/spatialSurfaceHostCtrl.test.ts
git diff --check -- src/renderer/course/spatialEditorCommands.ts src/renderer/course/spatialEditorView.ts src/renderer/course/spatialCameraCommands.ts src/renderer/course/spatialPathCommands.ts src/renderer/ui/SpatialWorkspace.tsx src/renderer/ui/SpatialCameraPanel.tsx src/renderer/ui/SpatialLayerInspector.tsx src/renderer/ui/SpatialPathEditor.tsx src/renderer/ui/spatialWorkspaceAuthoring.ts src/player/surfaces/spatial
```

每次只跑触及组。禁止 typecheck、build、全量 test/E2E/visual。

## 6. 验收

- 世界/viewport 坐标无混用，缩放后选择框和控制器仍正确。
- 镜头、路径、关系删除没有悬空引用。
- 空白 Spatial 可完成基本课件，不依赖导入样例。
- Player host 对同一数据给出一致镜头/关系/路径结果。
- 跨 surface Player、store 与 shell 接线以请求交给 T09/T10。

## 7. 交付记录

HANDOFF
- task: T08
- baseline SHA / worktree: `e2e34aa29ddb72abb2c691e414a4d8f461f35b2c` / `output/worktrees/v9-parity-reconstruction`
- outcome: 在 e2e34aa Spatial 纵切上闭合世界元素 CRUD/变换/锁定隐藏/owner 内排序、viewport 选择框与手柄、镜头 session（切换不被 home effect 重置）、path/relation/label 真渲染、删除级联引用，以及 `executeSpatialEditorAction(actionId, snapshot, context) → {ok, reason}`。全局教师控制器留在 viewport 层，不随 world pan/zoom，也不走 inverse-scale。选择全局层不会创建 camera 或 world item。Player host 已暴露 `audioChangeSource` / `courseProgressSource` / `createSpatialPlayerSessionSources`，PublishedCourseApp 接线留给 T09。
- files changed:
  - `src/renderer/course/spatialEditorCommands.ts`（世界删除级联、复制/锁定/隐藏/排序/文字公式/媒体替换、`executeSpatialEditorAction`、`createSpatialEditorActionAdapter`）
  - `src/renderer/course/spatialEditorView.ts`（viewport overlay 投影、semantic zoom 命中顺序、稳定 authoringAddress）
  - `src/renderer/ui/spatialWorkspaceAuthoring.ts`（fit/reset session camera）
  - `src/renderer/ui/SpatialWorkspace.tsx`（viewport overlay、关系标签、文字/公式就地编辑、适配视图、恒定手柄尺寸）
  - `src/player/surfaces/spatial/SpatialSurfaceHost.ts`（关系标签；`createSpatialPlayerSessionSources`）
  - 对应 `spatial*` 单测
  - 未改：`spatialCameraCommands.ts`、`spatialPathCommands.ts`、`SpatialCameraPanel.tsx`、`SpatialLayerInspector.tsx`、`SpatialPathEditor.tsx`（基线已满足镜头/路径/属性合同）
- focused validation commands:
  - `npx vitest run tests/unit/spatialEditorCommands.test.ts tests/unit/spatialEditorView.test.ts`
  - `npx vitest run tests/unit/spatialWorkspaceAuthoring.test.ts tests/unit/spatialCameraCommands.test.ts`
  - `npx vitest run tests/unit/spatialPathCommands.test.ts tests/unit/spatialPathPipeline.test.ts`
  - `npx vitest run tests/unit/spatialSurfaceHost.test.ts tests/unit/spatialSurfaceHostCtrl.test.ts`
  - `git diff --check -- src/renderer/course/spatialEditorCommands.ts src/renderer/course/spatialEditorView.ts src/renderer/course/spatialCameraCommands.ts src/renderer/course/spatialPathCommands.ts src/renderer/ui/SpatialWorkspace.tsx src/renderer/ui/SpatialCameraPanel.tsx src/renderer/ui/SpatialLayerInspector.tsx src/renderer/ui/SpatialPathEditor.tsx src/renderer/ui/spatialWorkspaceAuthoring.ts src/player/surfaces/spatial`
- results: 8 files / 58 tests passed；`git diff --check` 无输出。未跑 typecheck / build / 全量 test / E2E。
- INTEGRATION_REQUESTS:

```md
INTEGRATION_REQUEST
- requester: T08
- target owner: T10
- target file: src/renderer/store/editorStore.ts
- exported symbol / callback: executeSpatialEditorAction；createSpatialEditorActionAdapter
- required behavior: Spatial 的 surface adapter 转调 executeSpatialEditorAction(actionId, snapshot, { history, sessionCamera, viewportSize, clipboard, now, onViewportChange, onRequestEdit })，把返回的 {ok, reason} 原样交给 routeEditorAction；若 ok 且 history 变化则一次 commit。fit/reset-view/focus 只改 session camera，不写 project。选择 owner===global 时不要走本 adapter 的 delete/copy 创建世界元素或镜头。
- focused test that proves the lane side: tests/unit/spatialEditorCommands.test.ts（executeSpatialEditorAction 覆盖 delete/copy/duplicate/lock/hide/focus/fit/reset-view；全局层拒绝创建 world/camera）
- risk if omitted: 键盘/右键 Delete 与复制仍到不了 Spatial 命令。

INTEGRATION_REQUEST
- requester: T08
- target owner: T10
- target file: src/renderer/ui/Workspace.tsx
- exported symbol / callback: SpatialWorkspace；buildSpatialViewportOverlays；buildSpatialEditorView
- required behavior: 用 buildSpatialEditorView + buildSpatialViewportOverlays 把全局/surface 教师控制器交给 viewportOverlays。onSelect 只处理 world ids；onSelectViewportLayer 只切换 global/surface selection，禁止因此 add camera 或 world item。onCommitEdit 走 executeSpatialEditorAction('edit-text'|'edit-formula', …, { editText | editFormulaAccessibleText })。onCameraChange 只更新 session，不写 camera.home。镜头面板「从当前画面添加 / 设为首页」分别调用 addSpatialEditorCameraFrame / setSpatialCameraHome。
- focused test that proves the lane side: tests/unit/spatialWorkspaceAuthoring.test.ts（overlay 在 world group 外；选择 overlay 不创建 world/camera；frame 切换不被 home rerender 重置）
- risk if omitted: 控制器会重新掉进世界变换，或选全局层误造镜头。

INTEGRATION_REQUEST
- requester: T08
- target owner: T09
- target file: src/renderer/ui/PublishedCourseApp.tsx（T09 独占）
- exported symbol / callback: SpatialSurfaceHost；createSpatialPlayerSessionSources；SpatialAudioChangeSource；SpatialCourseProgressSource
- required behavior: 挂载 Spatial host 时传入 createSpatialPlayerSessionSources({ audioChangeSource: courseEventBus, courseProgressSource: { getLocations, getCurrentLocationId, getStateLabel } })，以及 globalLayerItems、initialLocationId、executeTeacherControllerAction。镜头/路径/关系已由 host 从同一 V9 surface 文档渲染，不要另造一份运行时数据。
- focused test that proves the lane side: tests/unit/spatialSurfaceHostCtrl.test.ts（audio:change 与 progress source；createSpatialPlayerSessionSources 原样转发）
- risk if omitted: Player 控制器静音/进度与作者数据分叉。

INTEGRATION_REQUEST
- requester: T08
- target owner: T05
- target file: src/renderer/authoring/stageViewportTransform.ts
- exported symbol / callback: STAGE_VIEWPORT_WIDTH / STAGE_VIEWPORT_HEIGHT（只作缺省 viewport 尺寸）
- required behavior: 无需改 T05 文件。Spatial 无限画布继续使用 spatialModel 的 camera.x/y/zoom + viewport，不套用 1280×720 Slide affine，不用 inverse-scale 补偿控制器。T08 仅在 T10 未传入 viewportSize 时用 STAGE_VIEWPORT_* 作为 fit/reset 回退尺寸。若 T05 日后要把「屏幕矩形」抽成跨 surface 合同，请另开消息，不要把 Slide stage 强加给 Spatial。
- focused test that proves the lane side: tests/unit/spatialWorkspaceAuthoring.test.ts（screenControlRect / 手柄 9px 不随 zoom 缩小）
- risk if omitted: 无；缺合同已按 Spatial camera 闭合。
```
- visual/manual evidence: 无 UI 热点改动；未跑 E2E / 视觉门禁。
- remaining risks: App/store/Workspace/PublishedCourseApp 未接线前，教师仍看不到本纵切入口。左栏镜头树已由 T03 输出「本页镜头」且不含坐标，T10 接 ScenePanel 时不得把 x/y/zoom 塞进导航。Focusky 级时间线/复杂转场仍属远期，本轮未做。
- status: engineering candidate

HANDOFF (T09 回派修补)
- task: T08
- baseline SHA / worktree: `e2e34aa29ddb72abb2c691e414a4d8f461f35b2c` / `output/worktrees/v9-parity-reconstruction`
- outcome: `SpatialSurfaceHost.suspend()` 卸掉 document `pointermove`/`pointerup` 并清空 `#drag`；`activate`/`resume` 按需重新挂上。`#handlePointerMove` / `#handlePointerUp` 在 `#active===false` 时直接 return。Mixed 切走后 document 拖动不再改 camera。
- files changed:
  - `src/player/surfaces/spatial/SpatialSurfaceHost.ts`
  - `tests/unit/spatialSurfaceHost.test.ts`
- focused validation commands:
  - `npx vitest run tests/unit/spatialSurfaceHost.test.ts tests/unit/spatialSurfaceHostCtrl.test.ts`
- results: 2 files / 10 tests passed。未改 PublishedCourseApp / App / store。未提交。
- INTEGRATION_REQUESTS: 无新增。
- visual/manual evidence: 无。
- remaining risks: 无。
- status: engineering candidate

