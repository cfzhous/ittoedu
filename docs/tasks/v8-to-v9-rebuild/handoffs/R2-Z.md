HANDOFF
- task: R2-Z
- planning pack path: `C:\Users\74755\Documents\HTML课件编辑器\docs\tasks\v8-to-v9-rebuild`
- product worktree / branch / baseline SHA: `C:\Users\74755\Documents\HTML课件编辑器-v8-to-v9-rebuild` / `codex/v8-to-v9-rebuild` / `f27275658c6dfaa12f2ce35cd9368dcdebe99451`
- outcome: 在同一套 V8 App / store / Workspace / ScenePanel / Nodes / Properties / Elements 下串行接入 V9 Slide candidate。成功 command 后 `set` 缓存 snapshot 与稳定 UI 投影，Zustand 会刷新。默认 backend 仍是 `{ kind: 'v8' }`；candidate 只经 `injectV9SlideCandidateBackend`（测试/开发）。未建 CourseStudio、未加 `?editor-backend=` 或任何用户可见切换，未改 MediaTab，未双写 V8+V9。未宣称 V9 编辑器可用。未 commit。本阶段 execution 为 `lane_candidate`（真实 UI 冒烟受阻，不能升 engineering candidate）。
- owned files changed (product worktree):
  - `src/renderer/App.tsx`（candidate 时 Delete 走 `shouldIgnoreSlideLayerDeleteForFocus`）
  - `src/renderer/store/editorStore.ts`（`persistCandidateResult` / `applySlideCandidateSession` / `applySlideCandidateCommand`；V8 action 在 candidate 时转发；投影缓存）
  - `src/renderer/store/v9SlideUiProjection.ts`（新建：V9 layer → V8 `SceneNode` / `SceneDocument`）
  - `src/renderer/ui/Workspace.tsx`（`createSlideWorkspaceAuthoringController`；未注入继续 Phaser；双击 `beginTextEdit` → 同一 content commit）
  - `src/renderer/ui/ScenePanel.tsx`（`selectSlideSceneList` + snapshot.sceneId）
  - `src/renderer/ui/NodesTab.tsx`（未知 node type 回退图标；锁/隐/删/拖排仍走 store，candidate 时已转发 `executeSlideSceneAction`）
  - `src/renderer/ui/PropertiesTab.tsx`（选区格式 → `commitSlideCandidateTextRunStyle`）
  - `tests/unit/v9SlideProductIntegration.test.tsx`（新建）
  - **未改** `RightSidebar.tsx`、`ElementsTab.tsx`、`MediaTab.tsx`、`globals.css`、`elementAnimationPreviewBus.ts`（插入仍走现有 ElementsTab → store；预览总线只从 store 调用 `requestNodeMotionPreview`）
  计划侧：本 HANDOFF。未改账本。
- donor files/functions consulted:
  - `04_R2_SLIDE_PARITY.md` §9–10、`01_SHARED_EXECUTION_CONTRACT.md`
  - `handoffs/R2-A.md` / `R2-SEAM.md` / `R2-B.md` / `R2-C.md` / `R2-D.md` / `R2-E.md`
  - `artifacts/INTEGRATION_LEDGER.md` 中 target=R2-Z 的 open 请求
  - 产品 `createSlideWorkspaceAuthoringController`、`commitV9SlideContentEdit` / `commitV9SlideTextRunStyle`、`addSlideTextLayer` / `addSlideImageLayer` / `addSlideRuntimeLayer`、`executeSlideSceneAction`、`slideSimpleEntrancePreviewRequest`、`requestNodeMotionPreview`
  - `tests/unit/v9SlideViewportAdapter.test.ts` 西向 resize 手势；`tests/unit/continuousInsertionUi.test.tsx` 真实 NodesTab 点击
- donor 舍弃部分:
  - CourseStudio / `?editor-backend=` / 用户可见 V8↔V9 切换
  - MediaTab 重写、global/controller/audio 完整接线（R3）
  - 为冒烟增加任何教师可见注入入口
  - 平行 candidate UI
- focused validation command:
  ```
  npx vitest run tests/unit/v9SlideProductIntegration.test.tsx tests/unit/continuousInsertionUi.test.tsx
  git diff --check -- src/renderer/App.tsx src/renderer/store/editorStore.ts src/renderer/ui/Workspace.tsx src/renderer/ui/ScenePanel.tsx src/renderer/ui/RightSidebar.tsx src/renderer/ui/NodesTab.tsx src/renderer/ui/PropertiesTab.tsx src/renderer/ui/ElementsTab.tsx
  ```
- validation result: Vitest 2 files / 8 tests passed，2.30s。`git diff --check` 无输出、exit 0。新文件 `v9SlideUiProjection.ts` 与 `v9SlideProductIntegration.test.tsx` 另 `git add -N` 后 check 亦干净，随后 `git reset`，仍为 untracked。
- validation entry / fixture / backend:
  - entry: 真实 `ElementsTab` / `ScenePanel` / `NodesTab` / `PropertiesTab`；`injectV9SlideCandidateBackend`；`createSlideWorkspaceAuthoringController` 西向 resize；`commitSlideCandidateTextRunStyle`；`undo`；`listSlideWorkspaceHitTargets` + `hitTestV9SlideLayerItems`；`setSimpleEntranceAnimation` → `onElementAnimationPreviewRequested`；`beginTextEdit` 后 `deleteSelectedNodes`
  - fixture: 内存最小 V9 Slide（空 scene + 已有 `asset-photo`）；默认 store 为 `createNewProject()` V8
  - backend: 默认 V8 `ProjectDocument`；candidate 仅为测试注入的 in-memory `SlideCandidateBackend`
- validation proves / does not prove:
  - proves: 默认 `kind === 'v8'` 且 ElementsTab 插入仍写 V8 project；注入后成功 command `set` 刷新订阅且不改 V8 `project`；连续插入两个文本错开 20px；西向 resize 一次 history；属性选区粗体走同一 content commit；Undo 回退粗体；新插入 image/runtime 可被现有 hit adapter 命中且 target 无 `hitId`；简单出现动画预览走现有 motion bus；文字会话中 Delete 不删图层
  - does not prove: 未接真实 Electron/Phaser 窗口；未证明 MediaTab 导入、公式/形状插入、global/surface/controller/audio、保存/重开 archive、Player；`continuousInsertionUi.test.tsx` 仍只覆盖默认 V8 图层点击（见下）
- narrow UI smoke, if authorized: **受阻，未完成。** `npm run dev` 仍在产品 worktree 跑（5173 + Electron）。浏览器打开 Vite 无 `desktopAPI`（已有「未运行在课件编辑器桌面环境」错误）。产品 App 没有、也不得增加用户可见/`?editor-backend=` 注入；向正在跑的默认 V8 会话 `injectV9SlideCandidateBackend` 会拒绝 V8 写入并破坏该会话。因此不能在不改默认入口的前提下做 V9 candidate 冒烟。不要把冒烟记为完成。
- INTEGRATION_REQUESTS:
  ```
  INTEGRATION_REQUEST
  - requester task: R2-SEAM
  - target stage integrator: R2-Z
  - id: R2SEAM-R2Z-01
  - exact wiring requested: 成功 command 后 `set` 刷新订阅
  - status: implemented（`persistCandidateResult` 在成功后重建 backend、缓存 `slideCandidateSnapshot` + `slideCandidateUi` 并 `set`。待协调者改账本为 integrated。未冒烟，不能 verified）
  ```
  ```
  INTEGRATION_REQUEST
  - requester task: R2-C
  - target stage integrator: R2-Z
  - id: R2C-R2Z-01
  - exact wiring requested: 画布双击与属性局部格式 → 同一 `commitV9SlideContentEdit`；`nextSession` 写回
  - status: implemented（Workspace 双击 `beginTextEdit`；PropertiesTab `commitSlideCandidateTextRunStyle` → `commitV9SlideTextRunStyle` → 同一 commit；`persistCandidateResult` 写回 nextSession。待协调者改账本）
  ```
  ```
  INTEGRATION_REQUEST
  - requester task: R2-B
  - target stage integrator: R2-Z
  - id: R2B-R2Z-01
  - exact wiring requested: Workspace 用 `createSlideWorkspaceAuthoringController`；未注入继续 V8 Phaser
  - status: implemented（candidate 指针走 controller；`kind === 'v8'` 立即返回现有 Phaser 路径；Phaser transform-end 在 candidate 时忽略。待协调者改账本）
  ```
  ```
  INTEGRATION_REQUEST
  - requester task: R2-E
  - target stage integrator: R2-Z
  - id: R2E-R2Z-01
  - exact wiring requested: NodesTab/快捷键走 `executeSlideSceneAction`；文字焦点 Delete 不删图层；不新增置顶/置底按钮；clipboard 存在 candidate 旁
  - status: implemented（store 转发 lock/hide/reorder/copy/paste/duplicate/delete；`slideCandidateClipboard` 旁路；App Delete 先 `shouldIgnoreSlideLayerDeleteForFocus`。未新增 z-order 按钮。待协调者改账本）
  ```
  ```
  INTEGRATION_REQUEST
  - requester task: R2-D
  - target stage integrator: R2-Z
  - id: R2D-R2Z-01
  - exact wiring requested: 插入写回 session；`slideSimpleEntrancePreviewRequest` → `requestNodeMotionPreview`；默认 V8 走现有路径
  - status: implemented（`addTextNode` / 已有 asset 的 image/video 走 content commands；`setSimpleEntranceAnimation` 写 V9 后预览。未改 MediaTab。待协调者改账本）
  ```
  ```
  INTEGRATION_REQUEST
  - requester task: R2-D
  - target stage integrator: R2-Z
  - id: R2D-R2B-01
  - exact wiring requested: 新插入 image/video/component/runtime 接到已有 hit adapter
  - status: implemented（插入写回后 `listSlideWorkspaceHitTargets` 读当前 session；测试覆盖 image + runtime 命中。待协调者改账本）
  ```
- DECISION_REQUESTS: 无
- remaining risks / untested full checks:
  - 未跑 `npm run typecheck` / `npm test` / `npm run build` / E2E / 视觉回归（R8）
  - 真实 Electron candidate 冒烟受阻（无用户可见注入入口）
  - 公式/形状/教师控制器插入仍走 V8 `commit`，candidate 下被双写拒绝；公式内容编辑已接线，插入命令属缺口
  - Runtime 无 V8 `SceneNode` 类型，不出现在 NodesTab，但画布 adapter 可命中
  - 图层重命名无 V9 command（NodesTab rename 仍 `updateNode({ name })`，candidate 下仅 native 变换/锁隐被转发）
  - 新媒体导入需要 V9 `assets`（R3 / MediaTab）
  - global / surface / 声音 / 教师控制器完整接线 = R3
  - 接线过程中 Vite HMR 曾因重复 `TextRunStyle` import 使 `useEditorStore` 短暂失败；当前源码已无该重复，默认入口仍是 V8
- rollback point: 还原产品 worktree 中 `App.tsx`、`editorStore.ts`、`Workspace.tsx`、`ScenePanel.tsx`、`NodesTab.tsx`、`PropertiesTab.tsx` 的本任务 diff；删除 `src/renderer/store/v9SlideUiProjection.ts` 与 `tests/unit/v9SlideProductIntegration.test.tsx`。其他 lane 文件保持不动。基线仍为 `f272756`。
- execution state: lane_candidate
- integration state: pending（本任务已接线；账本仍由协调者改为 integrated）
- quality state: unverified

## 默认产品真相

默认 backend 仍是 V8。`injectV9SlideCandidateBackend` 不得绑到 App 生命周期、菜单、顶栏或 URL。未宣称 V9 编辑器可用。

## `continuousInsertionUi.test.tsx` 为何仍跑

该文件只覆盖默认 V8：插入后点 NodesTab 打开属性。它没有 candidate 注入。本任务未改其断言；candidate 连续插入错开放在 `v9SlideProductIntegration.test.tsx`。第二条文件是 V8 保护测试，必须保持绿。

## 建议协调者

- 可将账本中上述 6 条标为 `implemented` → `integrated`（定向 Vitest 已证明接线）。不要标 `verified`：真实 UI 冒烟未做成。
- **可以将 R3-A/B/C/D 设为 READY**（它们不需要默认 backend 切换）。**不要**把 R3-CUT 或「V9 编辑器可用」打开。
- R2 Gate「blocking 均为 integrated + verified」因冒烟受阻而未完全关闭；不要把本阶段写成 engineering/art/accepted。
