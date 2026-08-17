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

尚未执行。

