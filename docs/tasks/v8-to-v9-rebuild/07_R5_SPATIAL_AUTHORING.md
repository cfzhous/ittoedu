# R5 — 复用 Slide 元素内核的 Spatial 无限画布

> 状态：`engineering candidate for this stage`；合同 [`artifacts/R5_SPATIAL_UI_CONTRACT.md`](artifacts/R5_SPATIAL_UI_CONTRACT.md)
> R5-Z 已交付并释放壳层热点锁。R4-Z 已领取。二者完成后才进入 R6。
> 设计 Gate：合同已 coordinator-proposed freeze（G1–G4）。本阶段窗口纵切已做成；不是 art/accepted。

## 1. 阶段可见结果

教师能从用户可见入口创建空白 Spatial 页面，在无限世界中使用与 Slide 一致的文字、公式、图形、图片、视频、Component、Runtime、选择、八向变换、图层、属性、媒体、动画和控制器。Spatial 只增加 world 坐标、pan/zoom、camera、path、relation 与 semantic zoom。

禁止复制一套弱化的 Spatial inspector/属性/矩形控制器；普通元素编辑必须复用 R2/R3 的成熟内核。

## 2. 任务与依赖

| ID | 任务 | 独占写入 | 可并行 | 依赖 |
|---|---|---|---|---|
| R5-DESIGN | Spatial 编辑/运行 UI 合同与教师确认 | 设计说明/图，不改产品代码 | 可与 R3、R4-DESIGN | R2-Z |
| R5-A | world/camera model 与命令 | spatial editor/camera view/commands 与测试 | 否 | R3-CUT；R5-DESIGN 确认 |
| R5-B | R2 元素内核的 world transform/authoring adapter | Spatial world adapter、viewport bridge 与测试 | R5-C/D | R5-A |
| R5-C | path/relation/semantic zoom | path/relation commands、轻量专用面板与测试 | R5-B/D | R5-A |
| R5-D | Spatial Player host 与 viewport/global controller | player spatial host/model 与测试 | R5-B/C | R5-A |
| R5-Z | Spatial 中央接线与真实产品冒烟 | App/store/Workspace/ScenePanel/RightSidebar/TopToolbar 热点 | 不与 R4-Z 并行 | R5-B/C/D |

## 3. R5-DESIGN — 先确认 UI

### 3.1 必须产出

编辑态与运行态设计图/高保真说明，标出：

- 无 1280×720 页面边界的无限 world；
- 与 Slide 一致的缩放条、选择框、八向手柄和真实控制器；
- 左栏“本页镜头”与课程树、全局层的关系；
- 默认页面/场景属性中的镜头调度入口；
- path/relation 的渐进披露位置；
- 共享 MediaTab、Components、Properties、Nodes、Animation/Interaction 入口；
- world 元素与 viewport/global 控件的坐标边界。

### 3.2 禁止

- 不以当前弱化 Spatial inspector、粉色矩形或独立缩放控件作为合同；
- 不把有限 Slide 坐标直接扩大成伪无限画布；
- 不复制第二套元素属性、媒体、组件、图层或控制器；
- 未确认前不实现。

### 3.3 Gate

合同已写入 [`artifacts/R5_SPATIAL_UI_CONTRACT.md`](artifacts/R5_SPATIAL_UI_CONTRACT.md)。与旧 `V9_EDITOR_UI_SPATIAL_REFERENCE.png` 及弱化 Spatial 面板冲突以合同覆盖表为准。G1–G4 已由协调者拍板。R5-A 在 R3-CUT 之后 `READY`；实现不得使用粉色矩形控制器、独立缩放条或 `SpatialLayerInspector`。

## 4. R5-A — World、camera 与命令

### 4.1 独占路径

- `src/renderer/course/spatialEditorCommands.ts`
- `src/renderer/course/spatialEditorView.ts`
- `src/renderer/course/spatialCameraCommands.ts`
- Spatial 纯 model/helper 与对应最多两个测试

### 4.2 冻结接口

- world item 与 viewport/global item 的显式坐标空间；
- camera frame、active camera、pan/zoom session；
- stable authoring address、selection、history/revision；
- insert/update/transform/delete/camera commands；
- 不依赖未来 path/relation 符号的基础 snapshot。

### 4.3 必须闭合

- world 坐标允许负值和大范围，不裁回 1280×720；
- camera frame 与运行镜头顺序是项目数据，临时 pan/zoom 是会话数据；
- pointer/keyboard/history 语义与 Slide 一致；
- global/controller 属于 viewport，不随 world pan/zoom；
- 不修改 App/store/Workspace 热点。

### 4.4 最轻量验证

```powershell
npx vitest run tests/unit/spatialEditorCommands.test.ts tests/unit/spatialCameraCommands.test.ts
git diff --check -- src/renderer/course/spatialEditorCommands.ts src/renderer/course/spatialEditorView.ts src/renderer/course/spatialCameraCommands.ts tests/unit/spatialEditorCommands.test.ts tests/unit/spatialCameraCommands.test.ts
```

## 5. R5-B — 共享元素内核与 world transform

### 5.1 独占路径

- `src/renderer/authoring/spatialWorldAuthoring.ts`
- Spatial 专用 world-to-screen transform helper
- 必要的 Phaser bridge 窄扩展，需先确认不与其他任务占用
- 对应最多两个测试

不新建通用 Spatial Properties/Elements/Media/Components 面板，不修改 Workspace。

### 5.2 必须闭合

- R2 的 Native/Component/Runtime 命中、选择、拖动、八向 resize、旋转、文字/公式双击可在 world 坐标复用；
- 图片/视频/组件/Runtime 可插入、命中、选择和编辑属性；
- 选择框与对象经过同一 world-to-screen transform；
- 缩放只改变视图，不用 inverse-scale 修补控制器；
- Slide 的 zoom chrome、选择/控制器视觉合同保持；
- pointer 与 double-click 不走冲突事件路径。

### 5.3 最轻量验证

```powershell
npx vitest run tests/unit/spatialWorkspaceAuthoring.test.ts tests/unit/stageViewportTransform.test.ts
git diff --check -- src/renderer/authoring src/renderer/phaser tests/unit/spatialWorkspaceAuthoring.test.ts tests/unit/stageViewportTransform.test.ts
```

## 6. R5-C — Path、relation 与 semantic zoom

### 6.1 独占路径

- `src/renderer/course/spatialPathCommands.ts`
- relation/semantic zoom 纯模块
- `src/renderer/ui/SpatialCameraPanel.tsx`、`SpatialPathEditor.tsx` 等确属 Spatial 的轻量专用控件
- 对应最多两个测试

不得创建 `SpatialLayerInspector` 或替代通用 PropertiesTab。

### 6.2 必须闭合

- path/camera/relation 使用稳定 item/frame ID；
- 删除/复制 item 后引用清理或阻止原因明确；
- camera 调度与 path 播放顺序可保存、撤销、重开；
- semantic zoom 只影响可见/细节策略，不破坏数据或选择；
- 专用控件渐进披露，不顶替普通元素属性。

### 6.3 最轻量验证

```powershell
npx vitest run tests/unit/spatialPathCommands.test.ts tests/unit/spatialPathPipeline.test.ts
git diff --check -- src/renderer/course/spatialPathCommands.ts src/renderer/ui/SpatialCameraPanel.tsx src/renderer/ui/SpatialPathEditor.tsx tests/unit/spatialPathCommands.test.ts tests/unit/spatialPathPipeline.test.ts
```

## 7. R5-D — Player host 与 viewport/global 控件

### 7.1 独占路径

- `src/player/surfaces/spatial/spatialModel.ts`
- `src/player/surfaces/spatial/SpatialSurfaceHost.ts`
- Spatial 运行会话 helper
- 对应最多两个测试

### 7.2 必须闭合

- Player 从 Published V2 读取 world/camera/path/relation；
- camera 运行不回写工程；
- global/controller/audio/课程 UI 固定 viewport，不随 world 变换；
- 教师控制器使用 R3 真实 DOM/geometry，不降级成矩形；
- 当前 location 逐项显隐生效；
- 离开/重进 location 不泄漏 camera session。

### 7.3 最轻量验证

```powershell
npx vitest run tests/unit/spatialSurfaceHost.test.ts tests/unit/spatialSurfaceHostCtrl.test.ts
git diff --check -- src/player/surfaces/spatial tests/unit/spatialSurfaceHost.test.ts tests/unit/spatialSurfaceHostCtrl.test.ts
```

## 8. R5-Z — Spatial 中央接线

### 8.1 独占热点

- `src/renderer/App.tsx`
- `src/renderer/store/editorStore.ts`
- `src/renderer/ui/Workspace.tsx`
- `ScenePanel.tsx`、`RightSidebar.tsx`、`TopToolbar.tsx`
- 共享 Elements/Media/Components/Properties/Nodes/Animation 的必要窄接线
- `src/renderer/styles/globals.css`（必要时）

R5-Z 与 R4-Z 必须串行。

### 8.2 接线步骤

1. 关闭 R5-B/C/D blocking 集成请求。
2. 新建工程入口可创建空白 Spatial；统一新增菜单留给 R6。
3. Workspace 复用 R2 元素内核，通过 world adapter 切坐标，不渲染第二个弱画布。
4. 左栏提供“本页镜头”和全局层；右栏普通元素属性不被 camera/path 面板替代。
5. MediaTab、Components、Animation/Interaction、controller 与 Slide 同源。
6. 保存重开和试运行使用真实 SpatialSurfaceHost。

### 8.3 最轻量验证

```powershell
npx vitest run tests/unit/spatialProductIntegration.test.tsx tests/unit/spatialCameraSession.test.tsx
git diff --check -- src/renderer/App.tsx src/renderer/store/editorStore.ts src/renderer/ui src/renderer/styles/globals.css
```

只做一次真实 UI 冒烟：空白 Spatial → 插入文字/图片/组件 → 双击文字 → 八向变换 → 新建两个镜头和一条 path/relation → 进入全局层 → 保存重开 → 试运行。确认缩放条、选择框与控制器样式同 Slide。

## 9. R5 Gate

- 教师确认的 UI 合同已实现；
- 可从空白完成上述纵切；
- 普通元素能力不低于 Slide；
- world 与 viewport/global 坐标严格分离；
- 媒体、组件、属性、动画和 global scope 真实可用；
- 未运行全量测试/build/E2E/visual。

R5 完成后等待 R4-Z；二者都完成才进入 R6。
