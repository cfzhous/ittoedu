HANDOFF
- task: R7-Z
- planning pack path: `C:\Users\74755\Documents\HTML课件编辑器\docs\tasks\v8-to-v9-rebuild`
- product worktree / branch / baseline SHA: `C:\Users\74755\Documents\HTML课件编辑器-v8-to-v9-rebuild` / `codex/v8-to-v9-rebuild` / `f27275658c6dfaa12f2ce35cd9368dcdebe99451`
- outcome: 将 R7-A/B/C/D 接到成熟 V8 App：recovery 仅 `offer` 弹现有恢复框；整课预览与 Slide 试运行挂 `createPublishedCourseSession`；导出菜单对 V9 工程走 Published V2 生产者并真实写文件。一次 Electron 冒烟做成（另存 + Slide 试运行 `next()` 切到 Flow + 一个 HTML）。未改 PlayerApp / FlowSurfaceHost / SpatialSurfaceHost 内部 / R6 课树 / `flowDocx.ts` / location try-run 文件。未改 `editorStore.ts`。未 commit。未开始 R8。
- owned files changed (product worktree):
  - `src/renderer/App.tsx`（recovery offer；整课预览 overlay；V9 HTML/网页包/PPTX/PDF/DOCX 生产者）
  - `src/renderer/ui/Workspace.tsx`（Slide 试运行 CoursePlayer + 上一/下一 chrome；保留 Flow/Spatial location host）
  - `src/renderer/ui/TopToolbar.tsx`（导出菜单增加 DOCX）
  - `src/renderer/ui/coursePlayerTryRun.ts`（新建：`mountPublishedCourseTryRun`）
  - `src/renderer/export/course/index.ts`（re-export R7-C/D）
  - `src/main/ipc.ts` / `src/main/fileDialogs.ts` / `src/preload/index.ts` / `src/shared/ipcTypes.ts`（`peekProjectArchive`；`exportBinary` 扩 `docx`）
  - `tests/unit/exportMenuUi.test.tsx`（五格式 + V9 HTML V2 标记）
  计划侧：本 HANDOFF；`artifacts/INTEGRATION_LEDGER.md`；`00_INDEX.md` / `09_R7` 状态行
- donor files/functions consulted:
  - playbook §0、§3.6；`09_R7` 第 8 节；共享合同
  - `handoffs/R7-A.md`、`R7-B.md`、`R7-C.md`、`R7-D.md`、`R6-Z.md`、`R6-GATE.md`
  - `shouldOfferCourseProjectRecovery` / `inspectCourseProjectArchiveIdentity`
  - `createPublishedCourseSession` / `buildPublishedCourseStandaloneHtml` / `buildCoursePptx` / `buildCoursePrintArtifacts` / `buildFlowDocx`
- focused validation command:
  ```
  npx vitest run tests/unit/exportMenuUi.test.tsx tests/unit/projectPersistence.test.ts
  git add -N src/renderer/ui/coursePlayerTryRun.ts src/renderer/export/course/index.ts
  git diff --check -- src/renderer/App.tsx src/renderer/store/editorStore.ts src/renderer/ui/Workspace.tsx src/renderer/ui/TopToolbar.tsx src/renderer/ui/coursePlayerTryRun.ts src/renderer/export/course/index.ts src/main/ipc.ts src/main/fileDialogs.ts src/preload/index.ts src/shared/ipcTypes.ts tests/unit/exportMenuUi.test.tsx
  git reset
  ```
- validation result: Vitest 2 files / 17 tests passed。`git diff --check` 无输出、exit 0。随后 `git reset`。
- validation entry / fixture / backend:
  - entry: `shouldOfferCourseProjectRecovery`；`mountPublishedCourseTryRun` / `createPublishedCourseSession`；`buildPublishedCourseStandaloneHtml`；TopToolbar `export-docx`；`desktopAPI.exportHtml` / `saveProject`
  - fixture: 默认 V9 Slide → 下拉 Flow+Spatial；in-memory V9 + Electron 真实窗口
  - backend: 成熟 V8 App + Course Project V9 + Published Course V2
- validation proves / does not prove:
  - proves: 导出菜单含 HTML/网页包/PPTX/PDF/DOCX；V9 单 HTML 生产者含 `window.__H5_COURSE_PAYLOAD__` 且无 `.course-nav`；recovery 读写仍仅 V9（既有 persistence 测试）；冒烟另存 zip、Slide CoursePlayer `next()` 切到 Flow host、Flow/Spatial 当前位置试运行不是 HTML iframe、HTML 真实写到 `output/r7-z-smoke/r7-z-course.html`
  - does not prove: 未跑 typecheck/build/E2E/视觉；未为 PPTX/PDF/DOCX 各写一次文件；fresh profile 未弹出 recovery offer；未接 `SurfaceRuntimeAuthoringBridge`（`R7E-R7Z-01` 保持 open）
- narrow UI smoke, if authorized: **做成。** Vite `http://127.0.0.1:5175` + Playwright `_electron.launch`（`--user-data-dir=output/r7-z-smoke/electron-profile`，`--remote-debugging-port=9348`）。无 `VITE_V9_CANDIDATE_SMOKE`。证据：`output/r7-z-smoke/`（`01`–`08` 截图、`r7-z-smoke.h5lesson` 2296 bytes、`r7-z-course.html` 1 700 583 bytes、`evidence.json`、`run-smoke.cjs`）。`evidence.passed=true`。切页：`slide:project_…` → `surface-flow-…`。HTML 含 `window.__H5_COURSE_PAYLOAD__`，无 `.course-nav`。
- INTEGRATION_REQUESTS:
  ```
  INTEGRATION_REQUEST
  - requester task: R7-A
  - target stage integrator: R7-Z
  - id: R7A-R7Z-01
  - status: integrated
  - suggested next: verified（代码已接；fresh profile 未弹出 offer 框，`recoveryDiscarded=false`）
  ```
  ```
  INTEGRATION_REQUEST
  - requester task: R7-B
  - target stage integrator: R7-Z
  - id: R7B-R7Z-01
  - status: verified
  ```
  ```
  INTEGRATION_REQUEST
  - requester task: R7-B
  - target stage integrator: R7-Z
  - id: R3CUT-R7B-01
  - status: verified
  ```
  ```
  INTEGRATION_REQUEST
  - requester task: R6-Z
  - target stage integrator: R7-Z
  - id: R6Z-R7B-01
  - status: verified
  - notes: Slide 试运行 chrome `course-try-run-next/previous` → `session.next()/previous()`；整课预览 overlay 同样接线。未改 PlayerApp。
  ```
  ```
  INTEGRATION_REQUEST
  - requester task: R7-C
  - target stage integrator: R7-Z
  - id: R7C-R7Z-01
  - status: verified
  ```
  ```
  INTEGRATION_REQUEST
  - requester task: R7-D
  - target stage integrator: R7-Z
  - id: R7D-R7Z-01
  - status: integrated
  - suggested next: verified（菜单与生产者已接；HUD 默认不进 PPTX/PDF/DOCX；本阶段只冒烟一个 HTML）
  ```
  ```
  INTEGRATION_REQUEST
  - requester task: R4-D
  - target stage integrator: R7-Z
  - id: R4D-R7-01
  - status: integrated
  - suggested next: verified（DOCX 菜单项 + `buildFlowDocx`；无 Flow 时 disabled）
  ```
  ```
  INTEGRATION_REQUEST
  - requester task: R7-E
  - target stage integrator: R7-Z
  - id: R7E-R7Z-01
  - status: open
  - notes: non-blocking。`publishedDynamicHosts` 只有 Slide adapter / Flow / Spatial 现有 host，没有 Surface Runtime V1 宿主可薄接 `SurfaceRuntimeAuthoringBridge`。不要为它重写 R7-B。
  ```
- DECISION_REQUESTS: 无
- remaining risks / untested full checks:
  - 未跑 `npm run typecheck` / build / 全量 test / E2E / 视觉回归（R8）
  - PPTX/PDF/DOCX 未在窗口各写一次文件
  - recovery `offer` 弹窗未在 fresh profile 出现；`peekProjectArchive` 仅在 official path 存在时调用
  - 切 Flow/Spatial 编辑会话时控制台有 `Cannot resume a context that has been closed`（AudioContext；未改 host 内部，未阻断冒烟）
  - `R7E-R7Z-01` 仍 open
- rollback point: 还原上述壳层/ipc 文件；删除 `src/renderer/ui/coursePlayerTryRun.ts`
- execution state: engineering candidate for this stage
- integration state: pending（上列 blocking 项 integrated 或 verified；`R7E-R7Z-01` open）
- quality state: unverified

## 热点接线摘要

| 入口 | 行为 |
|---|---|
| 启动 recovery | `readRecoveryProject` → `inspectCourseProjectArchiveIdentity` → `shouldOfferCourseProjectRecovery`；仅 `offer` 弹框；`ignore-*` 则 `clearRecoveryProject` |
| 整课预览 | V9：in-app overlay 挂 CoursePlayer；V8：仍 `openPreview({ html })` |
| Slide 当前位置试运行 | `mountPublishedCourseTryRun`；chrome 上一/下一 |
| Flow/Spatial 当前位置试运行 | 仍 `mountFlowLocationTryRun` / `mountSpatialLocationTryRun` |
| V9 单 HTML / 网页包 | `buildPublishedCourseStandaloneHtml` / `buildPublishedCourseWebPackageAsync`；预检合并 `collectCoursePackageExportPreflight` |
| V9 PPTX / PDF / DOCX | `buildCoursePptx` / `buildCoursePrintArtifacts` pdf-html + 现有 `exportPdf` / `buildFlowDocx`；HUD 默认不进文件 |
| V8 显式导入工程 | 仍走旧 `buildStandaloneHtml` / `buildPptx` / `buildWebPackageFromProjectAsync` |
