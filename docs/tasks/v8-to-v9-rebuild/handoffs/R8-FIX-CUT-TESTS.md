HANDOFF
- task: R8-FIX-CUT-TESTS
- planning pack path: `C:\Users\74755\Documents\HTML课件编辑器\docs\tasks\v8-to-v9-rebuild`
- product worktree / branch / baseline SHA: `C:\Users\74755\Documents\HTML课件编辑器-v8-to-v9-rebuild` / `codex/v8-to-v9-rebuild` / `f27275658c6dfaa12f2ce35cd9368dcdebe99451`
- outcome: 已把 R3-CUT 后仍断言「默认 V8 / 无 candidate」的适配测试改成 CUT 事实：默认 `v9-slide-candidate`，写入走 candidate/V9 document。V8 路径只在显式 `clearV9SlideCandidateBackend()` 或构造 `V8_SLIDE_BACKEND` 时证明。`recoveryWriteCoordinator` 对 V9 恢复包改为断言 `write` 被调用。未改产品默认 backend，未改 `editorStore.ts` / `Workspace.tsx` / `ScenePanel.tsx` / `App.tsx`。未 commit。本 lane 为 `lane_candidate`。不是 art/accepted。
- owned files changed (product worktree):
  - `tests/unit/v9SlideBackendSelection.test.ts`
  - `tests/unit/v9SlideProductIntegration.test.tsx`
  - `tests/unit/v9SlideTextTransaction.test.ts`
  - `tests/unit/v9SlideViewportAdapter.test.ts`
  - `tests/unit/v9GlobalLayerUiAdapter.test.tsx`
  - `tests/unit/v9MediaTabAdapter.test.tsx`
  - `tests/unit/recoveryWriteCoordinator.test.ts`
  计划侧：本 HANDOFF。
  **未改**：`src/renderer/store/editorStore.ts`、`src/renderer/ui/Workspace.tsx`、`src/renderer/ui/ScenePanel.tsx`、`src/renderer/App.tsx`。工作树上这四份仍是其他 lane 的既有 diff。
  **未改**：`tests/unit/projectFormatIsolation.test.ts`（V8/V9 隔离仍由该文件覆盖）、`tests/unit/mediaTab.test.tsx` / `globalEditorStore` / component 等（留给 R8-FIX-STORE）。
- donor files/functions consulted:
  - `handoffs/R8-D.md`、`handoffs/R8-D-TRIAGE.md`、`handoffs/R3-CUT.md`
  - `tests/unit/editorStore.test.ts`（CUT 后默认 `v9-slide-candidate` / schema 9）
  - `src/renderer/store/slideBackendPort.ts` 的 `V8_SLIDE_BACKEND` / `clearV9SlideCandidateBackend`
  - `src/renderer/project/recoveryWriteCoordinator.ts`（coordinator 本身不按 schema 拒写）
  - `tests/unit/projectFormatIsolation.test.ts`（写层只接受 V9 recovery）
- donor 舍弃部分:
  - 把产品默认 backend 改回 V8
  - 用空断言或 `toBeTruthy()` 混绿
  - 删除 `projectFormatIsolation` 的格式隔离用例
  - 改 mediaTab / globalEditorStore / component 等 R8-FIX-STORE 文件
- focused validation command:
  ```
  npx vitest run tests/unit/v9SlideBackendSelection.test.ts tests/unit/v9SlideProductIntegration.test.tsx tests/unit/v9SlideTextTransaction.test.ts tests/unit/v9SlideViewportAdapter.test.ts tests/unit/v9GlobalLayerUiAdapter.test.tsx tests/unit/v9MediaTabAdapter.test.tsx tests/unit/recoveryWriteCoordinator.test.ts
  git diff --check -- tests/unit/v9SlideBackendSelection.test.ts tests/unit/v9SlideProductIntegration.test.tsx tests/unit/v9SlideTextTransaction.test.ts tests/unit/v9SlideViewportAdapter.test.ts tests/unit/v9GlobalLayerUiAdapter.test.tsx tests/unit/v9MediaTabAdapter.test.tsx tests/unit/recoveryWriteCoordinator.test.ts
  ```
  工作目录：产品 worktree。Windows PowerShell。未跑 `npm test` / typecheck / build / e2e / `verify` / Electron。
- validation result: Vitest v4.1.10。**7 files / 34 tests passed**，5.44s。`git diff --check` 无输出、exit 0（对 6 个 untracked 测试先 `git add -N` 再 check，随后 `git reset`，它们仍为 untracked；`recoveryWriteCoordinator.test.ts` 保持已跟踪修改）。
- validation entry / fixture / backend:
  - entry: `useEditorStore.createNewProject` 默认态；`injectV9SlideCandidateBackend` / `clearV9SlideCandidateBackend`；`ElementsTab` / `NodesTab` / `MediaTab` / `createSlideWorkspaceAuthoringController`；`RecoveryWriteCoordinator.schedule`
  - fixture: CUT 默认空白 Course Project V9；各文件原有内存 V9 Slide fixture；V9 zip bytes（`schemaVersion: 9`）
  - backend: 默认 `selectSlideBackendKind === 'v9-slide-candidate'`；V8 路径仅显式 `clearV9SlideCandidateBackend()` 或 `V8_SLIDE_BACKEND`
- validation proves / does not prove:
  - proves: 未注入时默认已是 `v9-slide-candidate`；插入文字/媒体写入 candidate document 与 sidecar；显式切到 V8 后文字/viewport 仍返回 `not-v9-slide-candidate`；V9 恢复包会调用 `write`；全局图层默认画出「有效图层 / 全课」来源标签
  - does not prove: 未跑全量 `npm test`；未证明 `assetTransactions` / `mediaTab.test.tsx` / `globalEditorStore` / component 等 R8-FIX-STORE 簇；未接真实 Electron 打开/保存/恢复文件；未证明 Player
- narrow UI smoke, if authorized: 未授权。未做。
- INTEGRATION_REQUESTS:
  ```
  INTEGRATION_REQUEST
  - requester task: R8-FIX-CUT-TESTS
  - target stage integrator: 协调者（账本 / FINAL_GATE_REPORT）
  - target hotspot file: artifacts/FINAL_GATE_REPORT.md 行 R8D-CUT-01
  - exported symbol / callback: n/a（仅测试跟切）
  - required user-visible behavior: 无产品表面变化
  - focused test proving lane side: 上列 7 个 Vitest 文件 34 绿
  - exact wiring requested: 将 R8D-CUT-01 标为 implemented / verified（测试已跟 CUT；不要再把默认 V9 当成失败）
  - risk if omitted: R8-D 复验仍按「默认 V8 断言」分类
  - status: implemented
  ```
- DECISION_REQUESTS: 无。
- remaining risks / untested full checks:
  - 未跑：`npm run typecheck`、`npm test` 全量、`build:desktop`、`test:e2e`、三视口视觉、17 项体验、`npm run verify`
  - R8-FIX-STORE 仍持有 media/global/component 等失败文件
  - `projectFormatIsolation.test.ts` 未在本任务重跑（按合同保留、未改）
- rollback point: 产品 HEAD 仍为 `f27275658c6dfaa12f2ce35cd9368dcdebe99451`。回退本 lane：还原上列 7 个测试文件。未改产品源码，无产品回滚点。
- execution state: `lane_candidate`
- integration state: `pending`（测试已跟切；账本 R8D-CUT-01 由协调者关闭）
- quality state: `unverified`
