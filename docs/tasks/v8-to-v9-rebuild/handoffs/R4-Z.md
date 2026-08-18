HANDOFF
- task: R4-Z
- planning pack path: `C:\Users\74755\Documents\HTML课件编辑器\docs\tasks\v8-to-v9-rebuild`
- product worktree / branch / baseline SHA: `C:\Users\74755\Documents\HTML课件编辑器-v8-to-v9-rebuild` / `codex/v8-to-v9-rebuild` / `f27275658c6dfaa12f2ce35cd9368dcdebe99451`
- outcome: 把强文本 Flow **接到成熟 V8 App**，并完成一次真实 Electron 窗口冒烟。Flow 是 Workspace 第三分支（`spatialSession` → Spatial；`flowSession` → Flow；否则 Slide），没有覆盖 Spatial。顶栏新建下拉增加「空白流式讲义」；Ctrl+N / 主新建仍是 Slide。Flow location 渲染 `FlowWorkspace`（readingWidth 760 连续稿纸，无 Phaser 1280×720，无 SceneStateStrip）。课程树 `listFlowCourseTreePages` 只含页面 + heading/section。图层只 overlay；Delete 走 `executeFlowSharedDelete` / `executeFlowDelete`。稿纸 `onProjectChange` 一次 history；编辑期间 `focus:'text'` 回传；离开文本焦点会提交草稿；Undo 尊重 IME。Properties 调 `formatFlowAuthoringTextStyle`，无整段正文框。MediaTab 默认文中块；组件默认浮层；左栏全局层 `enterFlowGlobalAuthoring`。当前位置试运行 `new FlowSurfaceHost(publishedV2, { locationId, initialTocOpen: false })` + `mount`/`activate`，方案 1 目录默认收起、fixed 贴边三角。未改 `PlayerApp.ts`、未拆 Spatial、未开始 R5-Z/R6/R7。未 commit。不宣称 art/accepted。
- owned files changed (product worktree):
  - `src/renderer/App.tsx`（`onNewFlow`、Flow 时隐藏 SceneStateStrip、Delete 对 Flow 走共享删除、Ctrl+N 仍 Slide）
  - `src/renderer/store/editorStore.ts`（flow session、command persist、新建/保存重开、媒体/组件/图层/全局、`addImageNodes`/`addVideoNodes` 在 Flow 返回插入结果以免误报层容量）
  - `src/renderer/ui/Workspace.tsx`（第三分支 `FlowLocationWorkspace`；Spatial 分支保留）
  - `src/renderer/ui/flowLocationTryRun.ts`（新建；试运行 host，避免测试 import Phaser）
  - `src/renderer/ui/FlowWorkspace.tsx`（`onTextEditChange`；离开 `focus:'text'` 时提交草稿而不是丢弃）
  - `src/renderer/ui/ScenePanel.tsx`（`FlowSceneTree`；Spatial「本页镜头」保留）
  - `src/renderer/ui/TopToolbar.tsx`（「空白流式讲义」`data-testid="new-flow-project"`；保留 `new-spatial-project`）
  - `src/renderer/ui/PropertiesTab.tsx`（Flow 块属性走 `formatFlowAuthoringTextStyle`，无「文字内容」框）
  - `src/renderer/ui/NodesTab.tsx`（Flow 走 overlay 投影）
  - `src/renderer/ui/MediaTab.tsx`（默认 `insertFlowLibraryMedia` 文中块；Alt/菜单浮层；失败展示 reason）
  - `src/renderer/styles/globals.css`（`.workspace--flow`、试运行 host、课程树）
  - `src/renderer/project/createFlowCourseProject.ts`（空白 Flow 工厂；默认新建仍是 Slide）
  - `tests/unit/flowProductIntegration.test.tsx`
  - `tests/unit/flowUnifiedLayerEntry.test.tsx`
  计划侧：本 HANDOFF；账本十条 R4*-R4Z 标 implemented。未改 `RightSidebar.tsx`（经现有页签）。未改 `PlayerApp.ts` / `src/player/surfaces/spatial/**`。
- donor files/functions consulted:
  - `06_R4_FLOW_AUTHORING.md` §8、`artifacts/R4_FLOW_UI_CONTRACT.md` C1–C12
  - `handoffs/R4-A.md`–`R4-D.md`、`handoffs/R5-Z.md`（第三分支接法）
  - `01_SHARED_EXECUTION_CONTRACT.md`
  - R4-B `FlowWorkspace` / `formatFlowAuthoringTextStyle`；R4-C `insertFlowSharedMedia` / `enterFlowGlobalAuthoring` / `executeFlowSharedDelete`；R4-D `FlowSurfaceHost`
  - 产品 `createSpatialCourseProject.ts`、`spatialLocationTryRun.ts`、Slide Workspace 试运行开关
- donor 舍弃部分:
  - `FlowElementsTab` / `FlowPropertiesTab` / 整段改正文框
  - 把 paragraph 画进课程树或图层
  - 把默认新建改成 Flow
  - 工程内「主按钮+下拉三类 surface」（R6）
  - `PlayerApp.ts` / 全课 iframe（`R3CUT-R7B-01`）
  - 回退 Spatial 接线 / 改 `src/player/surfaces/spatial/**`
  - `VITE_V9_CANDIDATE_SMOKE` / `?editor-backend=` / 注入菜单 / CourseStudio
- focused validation command:
  ```
  npx vitest run tests/unit/flowProductIntegration.test.tsx tests/unit/flowUnifiedLayerEntry.test.tsx
  git diff --check -- src/renderer/App.tsx src/renderer/store/editorStore.ts src/renderer/ui/Workspace.tsx src/renderer/ui/ScenePanel.tsx src/renderer/ui/TopToolbar.tsx src/renderer/ui/PropertiesTab.tsx src/renderer/ui/NodesTab.tsx src/renderer/ui/MediaTab.tsx src/renderer/ui/FlowWorkspace.tsx src/renderer/styles/globals.css tests/unit/flowProductIntegration.test.tsx tests/unit/flowUnifiedLayerEntry.test.tsx
  ```
  新文件先 `git add -N` 再 check，随后 `git reset`。禁止 typecheck/build/全量。不要对整个 `src/renderer/ui` 做 diff check。
- validation result: Vitest 2 files / 10 tests passed。`git diff --check` 无输出、exit 0。真实窗口冒烟 **做成**（见下）。
- validation entry / fixture / backend:
  - entry: 成熟 V8 `App`；CUT 后默认 V9。Flow location → `FlowLocationWorkspace`；Spatial location 仍走 `SpatialLocationWorkspace`；Slide location 仍走原 Phaser/iframe 路径
  - fixture: 顶栏「空白流式讲义」冷启动；保存 `flow-roundtrip.h5lesson`（gitignore `output/r4-z-smoke/`）
  - backend: `flowSession` + Course Project V9 `flow`；当前位置试运行 `FlowSurfaceHost` + Published Course V2
- validation proves / does not prove:
  - proves: 默认新建仍是 Slide；可见入口可建空白 Flow 且 Spatial 入口仍在；稿纸 readingWidth 760 不是 1280×720；无 Phaser stage / 无「本页镜头」；树=页面+heading，paragraph 不上树；图层只有教师控制器与组件浮层，文中图不进图层；就地编辑+属性粗体无正文框；全局层可进并关「当前页显示」；保存重开 schemaVersion 9 / surface.type=flow / 标题仍在；试运行 `.flow-surface-host`，目录 `aria-label=打开目录` 且 `position:fixed; left:0`
  - does not prove: 未跑 typecheck/build/E2E/视觉回归；整课顶栏预览仍可能走 `buildStandaloneHtml`（R7）；IME 组合过程未在窗口逐步证明（代码路径尊重 composing）；不是 art/accepted
- narrow UI smoke, if authorized: **做成。** 无 `VITE_V9_CANDIDATE_SMOKE`。Vite `http://127.0.0.1:5173` + Playwright `_electron.launch`（`--user-data-dir=output/r4-z-smoke/electron-profile`，`--remote-debugging-port=9346`）。desktopAPI 存在且 frozen。证据：产品 worktree `output/r4-z-smoke/`（gitignore）。
- INTEGRATION_REQUESTS:
  ```
  INTEGRATION_REQUEST
  - requester task: R4-A
  - target stage integrator: R4-Z
  - id: R4A-R4Z-01
  - status: implemented
  - suggested next: verified（真实窗口冒烟：树为「流式讲义 / 本页目录 / 光合作用讲义」，paragraph 不上树；选树不写 history 由定向测试覆盖）
  ```
  ```
  INTEGRATION_REQUEST
  - requester task: R4-A
  - target stage integrator: R4-Z
  - id: R4A-R4Z-02
  - status: implemented
  - suggested next: verified（图层行只有教师控制器与示例计数器浮层；文中图片/段落不进图层）
  ```
  ```
  INTEGRATION_REQUEST
  - requester task: R4-B
  - target stage integrator: R4-Z
  - id: R4B-R4Z-01
  - status: implemented
  - suggested next: verified（FlowWorkspace；readingWidth 760；无 Phaser 1280×720；无 SceneStateStrip）
  ```
  ```
  INTEGRATION_REQUEST
  - requester task: R4-B
  - target stage integrator: R4-Z
  - id: R4B-R4Z-02
  - status: implemented
  - suggested next: verified（标题/段落提交后工程变脏并可保存重开；离开文本焦点提交草稿；composing 不撤由定向测试/代码路径覆盖）
  ```
  ```
  INTEGRATION_REQUEST
  - requester task: R4-B
  - target stage integrator: R4-Z
  - id: R4B-R4Z-03
  - status: implemented
  - suggested next: verified（属性「选区格式」粗体；无「文字内容」框；稿纸上下文工具局部加粗）
  ```
  ```
  INTEGRATION_REQUEST
  - requester task: R4-C
  - target stage integrator: R4-Z
  - id: R4C-R4Z-01
  - status: implemented
  - suggested next: verified（元素「图片」与 MediaTab 默认文中 media block；点选不进图层）
  ```
  ```
  INTEGRATION_REQUEST
  - requester task: R4-C
  - target stage integrator: R4-Z
  - id: R4C-R4Z-02
  - status: implemented
  - suggested next: verified（与 R4A-R4Z-02 同向；冒烟图层无段落文案）
  ```
  ```
  INTEGRATION_REQUEST
  - requester task: R4-C
  - target stage integrator: R4-Z
  - id: R4C-R4Z-03
  - status: implemented
  - suggested next: verified（左栏全局层；画布徽章「全局层 · 视口浮层」；可关当前页显示）
  ```
  ```
  INTEGRATION_REQUEST
  - requester task: R4-C
  - target stage integrator: R4-Z
  - id: R4C-R4Z-04
  - status: implemented
  - suggested next: verified（示例计数器出现在图层为浮层；图形仍走 `insertFlowSharedShape`；Delete 走 `executeFlowSharedDelete`）
  ```
  ```
  INTEGRATION_REQUEST
  - requester task: R4-D
  - target stage integrator: R4-Z
  - id: R4D-R4Z-01
  - status: implemented
  - suggested next: verified for **Workspace 当前位置试运行** only
  - remaining: 整课 iframe / `PlayerApp.ts` 仍属 `R3CUT-R7B-01`，本任务按授权未改
  ```
- DECISION_REQUESTS: 无。不要由本任务开始 R6 / R7。壳层热点锁已释放。
- remaining risks / untested full checks:
  - 未跑 `npm run typecheck` / `npm test` / `npm run build` / E2E / 视觉回归（R8）
  - 教师控制器浮层按 viewport 框叠在稿纸下部，靠近底部的段落点击容易误入全局层（冒烟改为点标题/首段；产品上仍可滚动避开）
  - 顶栏「整课预览」仍可走 `projectCandidatePreviewDocument` → `buildStandaloneHtml`（R7）
  - 窗口冒烟未逐步演示 IME composition 过程
- rollback point: 还原上述壳层热点与两个测试、删除 `createFlowCourseProject.ts` / `flowLocationTryRun.ts`。必须保留 R5-Z Spatial 接线。R4-A/B/C/D lane 文件保持不动。基线仍为 `f272756`。
- execution state: engineering candidate for this stage
- integration state: pending（十条 R4*-R4Z 已 implemented；verified 由协调者改）
- quality state: unverified（窗口纵切证据足够升本阶段 engineering candidate；不是 art/accepted）

## 热点接线

| 热点 | 做法 |
|---|---|
| `App.tsx` | `handleNewFlow`；保存/打开/恢复用 active Course Project；Flow 与 Spatial 都不渲染 `SceneStateStrip`；Ctrl+N 仍 Slide |
| `editorStore.ts` | `createNewFlowProject` / `applyFlowCommand` / `applyFlowSelection` / persist + 订阅 `set` |
| `Workspace.tsx` | `spatialSession` → Spatial；否则 `flowSession` → `FlowLocationWorkspace`；否则 Slide。**保留** Spatial |
| `ScenePanel.tsx` | Flow：全局层 → 页面+heading 树 + `add-flow-page`。Spatial：仍「本页镜头」 |
| `TopToolbar.tsx` | 新建旁下拉「空白流式讲义」`new-flow-project`；保留「空白无限画布」 |
| `PropertiesTab.tsx` / `NodesTab.tsx` / `MediaTab.tsx` | 现有页签窄接线；未改 `RightSidebar.tsx` |
| `globals.css` | `.workspace--flow`、试运行 host、Flow 课树 |

## 冒烟步骤与截图

目录：`C:\Users\74755\Documents\HTML课件编辑器-v8-to-v9-rebuild\output\r4-z-smoke\`

| 步 | 结果 | 证据 |
|---|---|---|
| 1 桌面壳 | 通过。默认 Slide；`desktopAPI` frozen；Spatial + Flow 入口都在 | `01-desktop-shell.png` |
| 2 空白 Flow | 通过。`FlowWorkspace`；readingWidth 760；无 Phaser；无「本页镜头」 | `02-blank-flow.png` |
| 3 标题+两段正文 | 通过。树有「光合作用讲义」；paragraph 不上树 | `03-title-paragraphs.png` |
| 4 双击/局部格式 | 通过。属性无正文框；稿纸上下文粗体 + `flow-format-bold` | `04-inplace-format.png` |
| 5 图片+组件 | 通过。文中图；图层=教师控制器+示例计数器 | `05-insert-image-component.png` |
| 6 全局层+当前页隐藏 | 通过。`enterFlowGlobalAuthoring`；关「当前页显示」 | `06-global-hide.png` |
| 7 保存重开 | 通过。schemaVersion 9；surface.type=flow；标题仍在 | `07-reopened.png`、`flow-roundtrip.h5lesson` |
| 8 当前位置试运行 | 通过。`.flow-surface-host`；TOC `打开目录` + `position:fixed`；无 Slide iframe | `08-try-run.png`、`evidence.json` |

## 给协调者

- **建议把上述十条 R4*-R4Z 升 `verified`。** 真实窗口纵切已做成。`R4D-R4Z-01` 的 verified 范围应限于 **Workspace 当前位置试运行**；整课 iframe 仍是 `R3CUT-R7B-01`。
- 壳层热点锁已释放。不要由本 HANDOFF 开始 R6-Z（R6-A/B/C 已在进行且不得碰壳层）。
- 本阶段 execution：`engineering candidate for this stage`。不要标 art/accepted，也不要宣称「Flow 编辑器已可用」。
- Spatial / Slide 接线未回退：`new-spatial-project`、`SpatialLocationWorkspace`、左栏「本页镜头」、默认 Ctrl+N 空白演示仍在。
