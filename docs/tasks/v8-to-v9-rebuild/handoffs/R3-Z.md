HANDOFF
- task: R3-Z
- planning pack path: `C:\Users\74755\Documents\HTML课件编辑器\docs\tasks\v8-to-v9-rebuild`
- product worktree / branch / baseline SHA: `C:\Users\74755\Documents\HTML课件编辑器-v8-to-v9-rebuild` / `codex/v8-to-v9-rebuild` / `f27275658c6dfaa12f2ce35cd9368dcdebe99451`
- outcome: 在同一套 V8 App / store / Workspace / ScenePanel / Nodes / Properties / MediaTab 下串行接入 R3-A/B/C/D。candidate 有效图层显示走 R3-D 投影，写入走 R3-A；媒体走 R3-B sidecar；控制器 pointer 先问 R3-C overlay，命中不走 scene transform。成功 command 后 `persistCandidateResult` `set`（含 sidecar 历史与缓存的 effective-layer 投影）。默认 backend 仍是 `{ kind: 'v8' }`；未建 CourseStudio、未加用户可见 V8/V9 切换、`?editor-backend=` 或默认新建/打开/保存切 V9。未宣称 V9 编辑器可用。未开始 R3-G / R3-CUT。未 commit。本阶段 execution 为 `lane_candidate`（真实 UI 冒烟受阻，不能升 engineering candidate）。
- owned files changed (product worktree):
  - `src/renderer/App.tsx`（candidate 导入：V8 工厂 + `dedupeCourseMediaImports` + `importV9CandidateMedia`；默认 V8 `commitMediaBatchImport` / `importSounds` 不变）
  - `src/renderer/store/editorStore.ts`（图层/媒体/控制器 command → candidate history + sidecar undo；`projectCandidatePreviewDocument` 仅预览派生；candidate zip 仅注入会话；缓存 `slideCandidateEffectiveLayers`）
  - `src/renderer/ui/Workspace.tsx`（pointer 先 `createV9TeacherControllerAuthoringController`；overlay 选框+八向；试运行 payload 用派生 V8 文档含 V9 global；未注入继续 Phaser）
  - `src/renderer/ui/NodesTab.tsx`（candidate 显示 `visualFrontToBackRows(unifiedRows)` 来源/影响；拖排/跨 owner 交给 store）
  - `src/renderer/ui/PropertiesTab.tsx`（逐 location `visibility.mode + locationIds`；控制器 `teacherControllerPropertiesPreview`）
  - `src/renderer/ui/MediaTab.tsx`（`selectMediaAssets` / sidecar bytes；同一套内嵌库）
  - `src/renderer/ui/ScenePanel.tsx`（candidate 全局元素计数来自 `globalLayerItems`）
  - `src/renderer/styles/globals.css`（来源标签与控制器 overlay；非粉色矩形）
  - `tests/unit/v9GlobalLayerUiAdapter.test.tsx`（新建）
  - `tests/unit/v9MediaTabAdapter.test.tsx`（新建）
  - **未改** `RightSidebar.tsx`（仍经 ElementsTab 内嵌同一 MediaTab）
  计划侧：本 HANDOFF。未改账本（协调者改）。
- donor files/functions consulted:
  - `05_R3` §7、`01_SHARED_EXECUTION_CONTRACT`、`00_INDEX`、`handoffs/R2-GATE.md` / `R2-Z.md` / `R3-A.md` / `R3-B.md` / `R3-C.md` / `R3-D.md`
  - `artifacts/INTEGRATION_LEDGER.md` 中 target=R3-Z 且 open 的请求
  - R3-A `reorderEffectiveLayerItems` / `patchEffectiveLayerItem` / `setGlobalLayerVisibleAtLocation` / `moveEffectiveLayerOwner`
  - R3-B `dedupeCourseMediaImports` / `importCourseMediaAssets` / `addCourseLibraryMediaToCanvas` / `importCourseSounds`
  - R3-C `createV9TeacherControllerAuthoringController` / `teacherControllerPropertiesPreview` / `commitTeacherControllerAuthoringFrame`
  - R3-D `projectEffectiveLayers` / `visualFrontToBackRows` / `scopeTokenForSelectingRow` / `commandTargetFromRow`
  - R1-B `courseProjectArchive`（仅 candidate 会话）
  - R2-Z `persistCandidateResult` / `injectV9SlideCandidateBackend`
- donor 舍弃部分:
  - CourseStudio / `?editor-backend=` / 用户可见 backend 切换
  - 默认 V8 新建/打开/保存改写成 V9
  - 双写 V8 `project.assets` / `assetFiles`
  - Flow/Spatial 实现；第二套图层/媒体/控制器 UI；粉色矩形
  - 为冒烟增加任何教师可见注入入口
  - R3-G / R3-CUT
- focused validation command:
  ```
  npx vitest run tests/unit/v9GlobalLayerUiAdapter.test.tsx tests/unit/v9MediaTabAdapter.test.tsx
  git diff --check -- src/renderer/App.tsx src/renderer/store/editorStore.ts src/renderer/ui src/renderer/styles/globals.css
  ```
- validation result: Vitest 2 files / 7 tests passed，3.08s。`git diff --check` 无输出、exit 0（新测试文件先 `git add -N` 再 check，随后 `git reset`，仍为 untracked）。
- validation entry / fixture / backend:
  - entry: 真实 `NodesTab` / `PropertiesTab` / `MediaTab`；`injectV9SlideCandidateBackend`；`createV9TeacherControllerAuthoringController` 西向 resize；`exportV9SlideCandidateArchive` / `reopenV9SlideCandidateArchive`
  - fixture: 内存 V9 Slide（三 location、global 横幅+教师控制器、scene 文字）；V8 `createImageAssetImport` / `createMediaAssetImport` 小字节
  - backend: 默认 V8 `ProjectDocument`；candidate 仅为测试注入的 in-memory session。未改默认 open/save。
- validation proves / does not prove:
  - proves: 默认 `kind === 'v8'`；注入后 NodesTab 用来源行且 scene-only 无伪装控制器；owner 内拖排一次 history；跨 owner 搬控制器失败并展示 `CONTROLLER_MOVE_REASON`；逐 location 显隐写 `locationIds` 不改 `startLocationId`/顺序；Properties 控制器 layout 与规范框相同；pointerup 西向 resize 一次 history；MediaTab 导入图片/声音、sidecar 入画布、undo 保留 sidecar、candidate zip 重开；不双写 V8 `assetFiles`
  - does not prove: 未接真实 Electron/Phaser 窗口；未证明默认产品保存已是 V9 zip；未跑 typecheck/build/E2E/视觉；DOM `TeacherControllerDom` 未在生产实例化
- narrow UI smoke, if authorized: **受阻，未完成。** 与 R2-Z 相同：Vite 无 `desktopAPI`；产品 App 没有、也不得增加用户可见/`?editor-backend=` 注入；向正在跑的默认 V8 会话 `injectV9SlideCandidateBackend` 会拒绝 V8 写入并破坏该会话。因此不能在不改默认入口的前提下做三 location 显隐 / 导入 / 八向拖 / 保存重开 / 试运行的真实窗口冒烟。不要把冒烟记为完成，也不要为此加菜单。
- INTEGRATION_REQUESTS:
  ```
  INTEGRATION_REQUEST
  - requester task: R3-D
  - target stage integrator: R3-Z
  - id: R3D-R3Z-01
  - exact wiring requested: NodesTab 显示 projectEffectiveLayers / visualFrontToBackRows(unifiedRows)；选 global 行 scopeTokenForSelectingRow；scene-only 不含伪装控制器
  - status: implemented（NodesTab candidate 用缓存的 R3-D 投影；来源/影响范围在行上；selectNode 经 scopeTokenForSelectingRow 切 global 且不改 location。待协调者改账本为 integrated。未冒烟，不能 verified）
  ```
  ```
  INTEGRATION_REQUEST
  - requester task: R3-A
  - target stage integrator: R3-Z
  - id: R3A-R3Z-01
  - exact wiring requested: 拖排/锁隐/复制删除把 commandTargetFromRow 交给 reorder/patch/duplicate/delete；成功 nextDocument 进 candidate history 再 set。不新增置顶/置底按钮
  - status: implemented（store persistLayerCommand → persistCandidateResult set。未新增 z-order 按钮。待协调者改账本）
  ```
  ```
  INTEGRATION_REQUEST
  - requester task: R3-A
  - target stage integrator: R3-Z
  - id: R3A-R3Z-02
  - exact wiring requested: Properties 逐 location 显隐走 setGlobalLayerVisibleAtLocation / setGlobalLayerLocationVisibility，写 visibility.mode + locationIds，不写 V8 sceneIds；不改 active location
  - status: implemented（CandidateGlobalLayerSettings 写 locationIds；测试断言 startLocationId 与 locations 顺序不变。待协调者改账本）
  ```
  ```
  INTEGRATION_REQUEST
  - requester task: R3-A
  - target stage integrator: R3-Z
  - id: R3A-R3Z-03
  - exact wiring requested: 控制器不可搬 scene；跨 owner 只走 moveEffectiveLayerOwner；失败要展示原因
  - status: implemented（NodesTab 跨 owner 拖放走 moveCandidateLayerOwner；失败 errorMessage = CONTROLLER_MOVE_REASON。待协调者改账本）
  ```
  ```
  INTEGRATION_REQUEST
  - requester task: R3-B
  - target stage integrator: R3-Z
  - id: R3B-R3Z-01
  - exact wiring requested: 同一套 Elements 内嵌 MediaTab；V8 工厂 + dedupeCourseMediaImports 再 import；入画布 addCourseLibraryMediaToCanvas；sidecar 与 nextSession 同进 undo；禁止 candidate MediaTab no-op；禁止双写 V8 assetFiles
  - status: implemented（MediaTab 读 selectMediaAssets/sidecar；App 仅在已注入时走 dedupe + importV9CandidateMedia。待协调者改账本）
  ```
  ```
  INTEGRATION_REQUEST
  - requester task: R3-C
  - target stage integrator: R3-Z
  - id: R3C-R3Z-01
  - exact wiring requested: Workspace 指针先 createV9TeacherControllerAuthoringController；命中则画 overlay，不要 scene transform；未注入继续 V8 Phaser
  - status: implemented（命中控制器不进入 slideAuthoring；kind==='v8' 保持现有 Phaser。待协调者改账本）
  ```
  ```
  INTEGRATION_REQUEST
  - requester task: R3-C
  - target stage integrator: R3-Z
  - id: R3C-R3Z-02
  - exact wiring requested: Properties teacherControllerPropertiesPreview 与画布同一 layout
  - status: implemented（选中 global controller 时用 committed/preview frame 调同一 layout 函数。待协调者改账本）
  ```
  ```
  INTEGRATION_REQUEST
  - requester task: R3-C
  - target stage integrator: R3-Z
  - id: R3C-R3Z-03
  - exact wiring requested: 试运行/Player 同一 layout；DOM 若接线必须传舞台 CSS 尺寸。Phaser 可保持 renderTeacherController
  - status: implemented（试运行 iframe 使用 projectCandidatePreviewDocument 派生的 V8 globalLayer，Phaser 仍 renderTeacherController。生产未实例化 TeacherControllerDom；若未来 DOM 接线，getRenderedStageBounds 必须是 1280×720 舞台，不是控制器框。待协调者改账本）
  ```
- DECISION_REQUESTS: 无。不要立即开始 R3-CUT。
- remaining risks / untested full checks:
  - 未跑 `npm run typecheck` / `npm test` / `npm run build` / E2E / 视觉回归（R8）
  - 真实 candidate UI 冒烟受阻（见上）
  - 默认产品保存/打开仍是 V8 `projectArchive`；candidate zip 只经 `exportV9SlideCandidateArchive` / `reopenV9SlideCandidateArchive`（测试已 round-trip document+sidecar）。不要假装默认产品已切 V9
  - `source:'state'` 只是行标注；存储 owner 仍是 scene（R3-A `LayerOwnerSource`）
  - 公式/形状插入在 candidate 下仍可能走 V8 `commit`（R2-Z 已知缺口，本任务未扩）
- rollback point: 还原产品 worktree 中上述热点与两个新测试文件的本任务 diff。R3-A/B/C/D 文件保持不动。基线仍为 `f272756`。
- execution state: lane_candidate
- integration state: pending（本 HANDOFF 将 8 条 R3-Z 请求标 implemented；协调者改账本为 integrated。未冒烟，不能 verified）
- quality state: unverified
- R2 verified: **保持 integrated，不要升 verified。** 真实 candidate 冒烟未做成。

## 给协调者

- 默认 backend 仍 V8。未宣称 V9 编辑器可用。
- 不要建议立即 R3-CUT，也不要开始 R3-G。
- 8 条 blocking INTEGRATION_REQUEST 均为 implemented，不得用 documented/returned 关闭。
- R2 的 6 条请求继续 integrated，等真实窗口冒烟再谈 verified。
