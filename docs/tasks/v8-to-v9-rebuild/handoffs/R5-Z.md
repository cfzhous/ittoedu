HANDOFF
- task: R5-Z
- planning pack path: `C:\Users\74755\Documents\HTML课件编辑器\docs\tasks\v8-to-v9-rebuild`
- product worktree / branch / baseline SHA: `C:\Users\74755\Documents\HTML课件编辑器-v8-to-v9-rebuild` / `codex/v8-to-v9-rebuild` / `f27275658c6dfaa12f2ce35cd9368dcdebe99451`
- outcome: 把 Spatial **接到成熟 V8 App**，并完成一次真实 Electron 窗口冒烟。Spatial location 走 `createSpatialWorldAuthoringController`：world 项/选择框/八向用 `worldTransform`（`fitScale=1`，无 1280×720 白页）；教师控制器与其它 global HUD 用 `viewportTransform`，禁止 inverse-scale。左栏「本页镜头」；空选区页面属性挂镜头调度 + 折叠「路径与关系」「语义缩放」；选中普通文字/图片不挂 SpatialPathEditor；path/relation 不是图层行。当前位置试运行挂 `SpatialSurfaceHost.fromPublishedCourse`，离开 `suspend`、重进 `resume`，不把 editor `sessionCamera` 传回去。顶栏新建下拉可建空白 Spatial；默认新建仍是 Slide。未改 FlowWorkspace / PlayerApp / 用户可见旧版切换。未 commit。未开始 R4-Z / R6 / R7。不宣称 art/accepted。
- owned files changed (product worktree):
  - `src/renderer/App.tsx`（`onNewSpatial`、保存/打开走 `selectActiveCourseProjectDocument`、Spatial 时隐藏 SceneStateStrip）
  - `src/renderer/store/editorStore.ts`（spatial session、command persist、新建/保存重开、文字图片组件/镜头/图层）
  - `src/renderer/ui/Workspace.tsx`（`SpatialLocationWorkspace`；Slide 路径保持；Flow 不接）
  - `src/renderer/ui/spatialLocationTryRun.ts`（新建；试运行 host，避免测试 import Phaser）
  - `src/renderer/ui/ScenePanel.tsx`（本页镜头树）
  - `src/renderer/ui/TopToolbar.tsx`（新建下拉「空白无限画布」）
  - `src/renderer/ui/PropertiesTab.tsx`（页面分段 + graph 选区分段）
  - `src/renderer/ui/NodesTab.tsx`（spatial 走 effective layers）
  - `src/renderer/styles/globals.css`（无限画布点阵、镜头框、11×11 手柄、本页镜头树）
  - `src/renderer/project/createSpatialCourseProject.ts`（新建空白 Spatial 工厂；默认新建仍是 Slide）
  - `tests/unit/spatialProductIntegration.test.tsx`
  - `tests/unit/spatialCameraSession.test.tsx`
  计划侧：本 HANDOFF；账本三条 R5*-R5Z 标 implemented；`00_INDEX.md` / `07_R5` 状态。未改 `RightSidebar.tsx`（经现有页签）。未改 Flow / `src/player/surfaces/spatial/**` 源码（只 import）。
- donor files/functions consulted:
  - `07_R5_SPATIAL_AUTHORING.md` §8、`artifacts/R5_SPATIAL_UI_CONTRACT.md` G1–G4 / §5 / §6 / §14
  - `handoffs/R5-A.md`–`R5-D.md`、`01_SHARED_EXECUTION_CONTRACT.md`
  - R5-B `createSpatialWorldAuthoringController`；R5-C `SpatialCameraPanel` / `SpatialPathEditor` / `setSpatialShowCameraFrames`；R5-D `SpatialSurfaceHost.fromPublishedCourse`
  - 产品 `Workspace.tsx` Slide 试运行开关、`canvas-view-controls`、`TextEditOverlay`、`ElementsTab` / `NodesTab` / `PropertiesTab`
- donor 舍弃部分:
  - `SpatialWorkspace` / `SpatialLayerInspector` / 粉色矩形 / 独立缩放条 / 小地图
  - 把默认新建改成 Spatial
  - 整页替换 RightSidebar；工程内「主按钮+下拉三类 surface」（R6）
  - `PlayerApp.ts` / 全课 iframe（`R3CUT-R7B-01`）
  - `FlowWorkspace` / 任何 `flow*` 新接线（留给 R4-Z）
  - `VITE_V9_CANDIDATE_SMOKE` / `?editor-backend=` / 注入菜单
- focused validation command:
  ```
  npx vitest run tests/unit/spatialProductIntegration.test.tsx tests/unit/spatialCameraSession.test.tsx
  git diff --check -- src/renderer/App.tsx src/renderer/store/editorStore.ts src/renderer/ui/Workspace.tsx src/renderer/ui/ScenePanel.tsx src/renderer/ui/TopToolbar.tsx src/renderer/ui/PropertiesTab.tsx src/renderer/ui/NodesTab.tsx src/renderer/styles/globals.css tests/unit/spatialProductIntegration.test.tsx tests/unit/spatialCameraSession.test.tsx
  ```
  新文件先 `git add -N` 再 check，随后 `git reset`。禁止 typecheck/build/全量。
- validation result: Vitest 2 files / 6 tests passed。`git diff --check` 无输出、exit 0。真实窗口冒烟 **做成**（见下）。
- validation entry / fixture / backend:
  - entry: 成熟 V8 `App`；CUT 后默认 V9。Spatial location → `SpatialLocationWorkspace`；Slide location 仍走原 Phaser/iframe 路径
  - fixture: 顶栏「空白无限画布」冷启动；保存 `spatial-roundtrip.h5lesson`（gitignore `output/r5-z-smoke/`）
  - backend: `spatialSession` + Course Project V9 `spatial-2d`；当前位置试运行 `SpatialSurfaceHost.fromPublishedCourse`
- validation proves / does not prove:
  - proves: 默认新建仍是 Slide；可见入口可建空白 Spatial；无 1280×720 白页；缩放条改 sessionCamera；选择框 `#5b9cff`、11×11 手柄；西向 resize 一次 pointerup 改几何；双击打开 `text-edit-overlay`；两个新镜头旧镜头仍在；path+relation 可保存重开；全局层可进；HUD 不随 world zoom 变屏幕尺寸（100%→120% 宽高不变）；当前位置试运行是 `.spatial-surface[data-world-bounds-mode=infinite]`，无 Slide iframe
  - does not prove: 未跑 typecheck/build/E2E/视觉回归；整课顶栏预览仍可能走 `buildStandaloneHtml`（R7）；try-run 内 component/runtime 仍是 R5-D 占位绘制；HUD 八向拖缩写入未在本冒烟逐步证明；不是 art/accepted
- narrow UI smoke, if authorized: **做成。** 无 `VITE_V9_CANDIDATE_SMOKE`。Vite `http://127.0.0.1:5173` + Playwright `_electron.launch`（`--user-data-dir=output/r5-z-smoke/electron-profile`，`--remote-debugging-port=9345`）。desktopAPI 存在且 frozen。证据：产品 worktree `output/r5-z-smoke/`（gitignore）。
- INTEGRATION_REQUESTS:
  ```
  INTEGRATION_REQUEST
  - requester task: R5-B
  - target stage integrator: R5-Z
  - id: R5B-R5Z-01
  - status: implemented
  - suggested next: verified（真实窗口冒烟已覆盖 world 选择/八向、缩放条、无第二套弱画布）
  ```
  ```
  INTEGRATION_REQUEST
  - requester task: R5-C
  - target stage integrator: R5-Z
  - id: R5C-R5Z-01
  - status: implemented
  - suggested next: verified（本页镜头、页面路径/语义缩放分段、选中文字不挂 PathEditor、path 不进图层；冒烟写入 path+relation 并重开）
  ```
  ```
  INTEGRATION_REQUEST
  - requester task: R5-D
  - target stage integrator: R5-Z
  - id: R5D-R5Z-01
  - status: implemented
  - suggested next: verified for **Workspace 当前位置试运行** only
  - remaining: 整课 iframe / `PlayerApp.ts` 仍属 `R3CUT-R7B-01`，本任务按授权未改
  ```
- DECISION_REQUESTS: 无。不要由本任务开始 R4-Z / R6 / R7。
- remaining risks / untested full checks:
  - 未跑 `npm run typecheck` / `npm test` / `npm run build` / E2E / 视觉回归（R8）
  - R5-A `nextWorldOrder` 只看 world items；空白 Spatial 工厂把继承来的 global HUD order 抬到 `100000+`，否则第二个 world 项会与教师控制器 order=1 撞 schema。后续 global 写入若再落到低 order，仍可能冲突
  - 顶栏「整课预览」仍可走 `projectCandidatePreviewDocument` → `buildStandaloneHtml`（R7）
  - try-run 中 component/runtime 未接真实 host（R5-D 已知）
  - Flow location 仍走 Slide Workspace 路径，留给 R4-Z
- rollback point: 还原上述壳层热点与两个测试、删除 `createSpatialCourseProject.ts` / `spatialLocationTryRun.ts`。R5-A/B/C/D lane 文件保持不动。基线仍为 `f272756`。
- execution state: engineering candidate for this stage
- integration state: pending（三条 R5*-R5Z 已 implemented；verified 由协调者改）
- quality state: unverified（窗口纵切证据足够升本阶段 engineering candidate；不是 art/accepted）

## 热点接线

| 热点 | 做法 |
|---|---|
| `App.tsx` | `handleNewSpatial`；保存/打开/恢复用 active Course Project；Spatial 不渲染 `SceneStateStrip` |
| `editorStore.ts` | `createNewSpatialProject` / `runSpatialCommand` / `applySpatialAuthoringSession` / persist + 订阅 `set` |
| `Workspace.tsx` | `spatialSession` → `SpatialLocationWorkspace`，否则原 Slide 路径。**不**接 `FlowWorkspace` |
| `ScenePanel.tsx` | 全局层 → 分隔 → 页面 →「本页镜头」+ `add-spatial-camera` |
| `TopToolbar.tsx` | 新建旁下拉「空白无限画布」`data-testid="new-spatial-project"` |
| `PropertiesTab.tsx` / `NodesTab.tsx` | 现有页签窄接线；未改 `RightSidebar.tsx` |
| `globals.css` | 点阵无限画布、镜头虚线框、11×11 手柄 |

## 冒烟步骤与截图

目录：`C:\Users\74755\Documents\HTML课件编辑器-v8-to-v9-rebuild\output\r5-z-smoke\`

| 步 | 结果 | 证据 |
|---|---|---|
| 1 桌面壳 | 通过。默认 Slide；`desktopAPI` frozen | `01-desktop-shell.png` |
| 2 空白 Spatial | 通过。无 1280×720 标签；视口 `#111318` 点阵；本页镜头「全景」 | `02-blank-spatial.png` |
| 3 插入文字 | 通过。2 个文本 | `03-insert-text.png` |
| 4 双击文字 | 通过。`text-edit-overlay` | `04-text-edit.png` |
| 5 八向 | 通过。西向 resize 宽 400→441.5px，原点左移；手柄 11×11、描边 `#5b9cff` | `05-resize.png` |
| 6 图片+组件 | 通过。示例计数器 | `03b-insert-image-component.png` |
| 7 两镜头+path/relation | 通过。全景仍在；镜头 2/3；path+relation 各 1 | `06-cameras-path.png` |
| 8 全局层+缩放 | 通过。100%→120%；HUD 宽高不变 626.48×44.55 | `07-global-zoom.png` |
| 9 保存重开 | 通过。schemaVersion 9；3 镜头、1 path、1 relation | `08-reopened.png`、`spatial-roundtrip.h5lesson` |
| 10 当前位置试运行 | 通过。`.spatial-surface` infinite；无 Slide stage / iframe | `09-try-run.png`、`evidence.json` |

## 给协调者

- **建议把 `R5B-R5Z-01` / `R5C-R5Z-01` / `R5D-R5Z-01` 升 `verified`。** 真实窗口纵切已做成。`R5D-R5Z-01` 的 verified 范围应限于 **Workspace 当前位置试运行**；整课 iframe 仍是 `R3CUT-R7B-01`。
- 壳层热点锁已释放。R4-Z 可以领取，但 **本执行者未开始 R4-Z**。
- 本阶段 execution：`engineering candidate for this stage`。不要标 art/accepted，也不要宣称「Spatial 编辑器已可用」。
