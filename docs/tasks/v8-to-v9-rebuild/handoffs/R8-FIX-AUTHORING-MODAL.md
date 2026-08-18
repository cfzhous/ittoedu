HANDOFF
- task: R8-FIX-AUTHORING-MODAL
- planning pack path: `C:\Users\74755\Documents\HTML课件编辑器\docs\tasks\v8-to-v9-rebuild`
- product worktree / branch / baseline SHA: `C:\Users\74755\Documents\HTML课件编辑器-v8-to-v9-rebuild` / `codex/v8-to-v9-rebuild` / `f27275658c6dfaa12f2ce35cd9368dcdebe99451`
- outcome: Authoring runner 打开 V8 `.h5lesson` 后会点「导入为当前课程工程」，关掉导入报告，再导出。该文件 **3/3 绿**。未改 `editorStore.ts` / `Workspace.tsx` / `ScenePanel.tsx`。未把默认 backend 改回 V8。未 commit。未领取 R8-E。未宣称 art/accepted 或项目级 engineering candidate。
- owned files changed:
  - 产品 worktree：
    - `scripts/run-courseware-authoring.ts`（`openProject` 确认 V8 显式导入；放弃未保存走已 mock 的 `showMessageBox`；整课预览优先截 `course-preview-overlay`；HTML 截图同时认 `.slide-published-adapter`）
    - `src/renderer/App.tsx`（仅 `handleExportPdf`：没有 `pdf-html` 时不要把混合打印 HTML 交给 `printToPDF`，回退现有场景光栅）
    - `src/player/index.ts` / `src/player/global.d.ts`（V9 单 HTML 的 `__H5_COURSE_PAYLOAD__` + `#course-root` 启动 Published Course 会话）
  - 计划侧：本 HANDOFF；`00_INDEX.md` 本行
  - 为让 Electron 读到上述产品改动，跑过 `npm run build:player` 与 `npm run build:renderer`（不是 `build:desktop`）。`dist-*` 若被 gitignore 则无 tracked diff。
- donor files/functions consulted:
  - [`handoffs/R8-D-RECHECK.md`](R8-D-RECHECK.md)（失败：`export-menu-trigger` 被 `modal-backdrop` 挡）
  - `App.tsx` `v8ImportPending` ConfirmDialog（`需要显式导入旧版工程` / `导入为当前课程工程`）与随后的 `CopyableSummaryDialog`（`旧版工程导入报告` / `完成`）
  - `openDefaultCourseProjectAsync`：V8 → pending import，不会静默打开
  - `handlePreview`：有 Course Project 时开应用内 overlay，不再 `openPreview` 新窗口
  - `buildCoursePrintArtifacts`：无 `captureSlideScene` 时 slide 页不进 `pdf-html`，只有 `flow-print-html`（无 `.page` img）
- focused validation command:
  ```
  npx vitest run tests/unit/coursewareAuthoringRunner.test.ts
  git diff --check -- scripts/run-courseware-authoring.ts src/renderer/App.tsx src/player/index.ts src/player/global.d.ts
  ```
  工作目录：产品 worktree。Windows PowerShell。未跑全量 `npm test` / typecheck / verify / `build:desktop`。未另开手工 Electron（仅该 Vitest 自己 spawn）。`:5174` 仍被既有 node 占用，未抢。
- validation result: Vitest v4.1.10。**1 file / 3 tests passed**，210.81s。`git diff --check` 无输出、exit 0。
- validation entry / fixture / backend:
  - entry: `scripts/run-courseware-authoring.ts` via `tests/unit/coursewareAuthoringRunner.test.ts`（tsx + Playwright Electron，`--user-data-dir` 临时 profile）
  - fixture: `createProjectArchive` 的 **V8** `.h5lesson`（技能路径要求显式导入；runner 仍校验 `schemaVersion === 8`）
  - backend: CUT 后默认 Course Project V9；打开 V8 必须确认导入
- validation proves / does not prove:
  - proves: 从外部 cwd 跑真实 Editor round-trip：显式导入 V8、四种 UI 导出、画布改文字、保存重开、overlay Player 与导出 HTML 画面变化；伪造 receipt 在 `--verify-report` 被拒；observation override 仍在启动 Electron 前以 code 2 失败
  - does_not_prove: 未跑全量 `npm test`、typecheck、`build:desktop`、e2e、三视口、17 项体验、教师验收
- narrow UI smoke, if authorized: 未授权手工窗口。仅该文件 Vitest spawn 的 Electron。
- 根因与最短刀（已确认）:
  1. **导入对话框（原失败）**：`openProject` 只等已可见的默认 V9 canvas，不点「导入为当前课程工程」；`modal-backdrop` 挡住导出。Runner 现在等对话框、确认导入、点「完成」关掉报告。
  2. **PDF**：导入后走 V9 `buildCoursePrintArtifacts`，无 slide 快照时把混合打印 HTML 送给只认 `.page` 图的 `printToPDF`。Runner 改不了产品导出；`handleExportPdf` 在没有 `pdf-html` 时回退场景光栅。
  3. **整课预览**：V9 用应用内 overlay，不再开新窗口。Runner `previewScreenshot` 截 `.slide-published-adapter` 并点「关闭预览」。
  4. **导出 HTML**：V9 单 HTML 写 `__H5_COURSE_PAYLOAD__` + `#course-root`，旧 IIFE 只启动 `__H5_LESSON_PAYLOAD__`。补了 Course 会话 bootstrap，截图同时认 adapter。
- INTEGRATION_REQUESTS:
  ```
  INTEGRATION_REQUEST
  - requester task: R8-FIX-AUTHORING-MODAL
  - target stage integrator: coordinator / R8-D-RECHECK-2
  - id: R8D-AUTHORING-01
  - target hotspot file: `scripts/run-courseware-authoring.ts`；`App.tsx` `handleExportPdf`；`src/player/index.ts` bootstrap
  - exported symbol / callback: `openProject` / `confirmV8ImportIfPrompted` / `previewScreenshot`
  - required user-visible behavior: 打开 V8 必须确认「导入为当前课程工程」，不得静默打开；导入后可导出；Slide PDF 无快照时仍能打出页面图
  - focused test proving lane side: `npx vitest run tests/unit/coursewareAuthoringRunner.test.ts` 3 passed
  - exact wiring requested: 将 R8D-AUTHORING-01 标为 implemented / verified。全量复验留给 R8-D-RECHECK-2。不要本任务领 R8-E。
  - risk if omitted: 全量 Gate 仍把 authoring 1/3 红当成 open
  - status: implemented
  ```
- DECISION_REQUESTS: 无
- remaining risks / untested full checks:
  - 未跑全量 `npm test`（R8-D-RECHECK-2）、typecheck、`build:desktop`（R8-E，未领取）、e2e、三视口、17 项体验、`npm run verify`
  - `App.tsx` 工作树上另有他 lane 大 diff；本任务只动了 `handleExportPdf` 的 `pdf-html` 回退。V9 PDF 仍无 `captureSlideScene`，Slide 页走光栅回退
  - 本机 `:5174` 仍被 PID 19432 node 占用（未抢）
- rollback point: 还原 `scripts/run-courseware-authoring.ts`、`src/player/index.ts`、`src/player/global.d.ts`；把 `handleExportPdf` 的 `pdf-html ?? flow-print-html` 分支加回去。HEAD 仍为 `f27275658c6dfaa12f2ce35cd9368dcdebe99451`。未 commit。
- execution state: lane_candidate
- integration state: pending
- quality state: unverified

禁止用语核对：未写 `art candidate` / `accepted`；未把本任务标成项目级 `engineering candidate`；未领取 R8-E。
