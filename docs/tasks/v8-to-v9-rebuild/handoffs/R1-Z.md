HANDOFF
- task: R1-Z
- planning pack path: `C:\Users\74755\Documents\HTML课件编辑器\docs\tasks\v8-to-v9-rebuild`
- product worktree / branch / baseline SHA: `C:\Users\74755\Documents\HTML课件编辑器-v8-to-v9-rebuild` / `codex/v8-to-v9-rebuild` / `f27275658c6dfaa12f2ce35cd9368dcdebe99451`
- outcome: 纯协议 round-trip Gate 通过。最小 V9 Slide fixture 完成 Schema validate → `createCourseProjectArchive` → `openCourseProjectArchive` → Schema validate → `buildPublishedCourseV2Payload` → `publishedCourseV2Schema` parse。最小 V8 fixture（`createProject({ includeDefaultController: false, controls: 'none' })` 加一枚图片资源）经 `migrateProjectV8DocumentToCourseProjectV9` 与 `importProjectV8ArchiveAsCourseProject` 得到可审查迁移报告且 V9 validate。未改 App/store/UI，未 commit，未把 V9 接到默认产品，未启动 App / Player。本任务不把整个 R1 标 DONE。
- owned files changed (product worktree, new):
  - `tests/unit/courseProjectRoundTrip.test.ts`
  - `tests/unit/v8ToV9Migration.test.ts`
  计划侧：本 HANDOFF。未改 R1-A/B/C/D 源码。未新建 `tests/unit/fixtures/`。
- donor files/functions consulted:
  - R1-A/B/C/D HANDOFF 导出符号与夹具形状
  - 产品 worktree：`courseProjectDocumentSchema`、`makeAuthoringAddress`、`createCourseProjectArchive` / `openCourseProjectArchive` / `detectCourseProjectArchiveFormat`、`migrateProjectV8DocumentToCourseProjectV9` / `importProjectV8ArchiveAsCourseProject`、`buildPublishedCourseV2Payload`、`publishedCourseV2Schema`
  - 夹具意图摘自 `tests/unit/courseProjectCoreContract.test.ts`、`courseProjectArchive.test.ts`、`courseProjectMigration.test.ts`、`buildPublishedCourseV2.test.ts`（未整文件复制）
- donor 舍弃部分:
  - 整串 cherry-pick；HEAD 大测试 `courseProjectProtocol.test.ts` / `courseStateAndArchive.test.ts` / `coursePublishPipeline.test.ts`
  - App / store / Workspace / Player hosts / 默认打开保存接线
  - 未重跑 R1-A/B/C/D 定向测试（验证预算只有本任务两个文件）
- focused validation command:
  ```
  npx vitest run tests/unit/courseProjectRoundTrip.test.ts tests/unit/v8ToV9Migration.test.ts
  git diff --check -- tests/unit/courseProjectRoundTrip.test.ts tests/unit/v8ToV9Migration.test.ts
  ```
- validation result: Vitest 2 files / 2 tests passed，1.76s。`git diff --check` 无输出、exit 0。
- validation entry / fixture / backend:
  - entry: `courseProjectDocumentSchema`、`createCourseProjectArchive`、`openCourseProjectArchive`、`detectCourseProjectArchiveFormat`、`buildPublishedCourseV2Payload`、`publishedCourseV2Schema`、`makeAuthoringAddress`、`migrateProjectV8DocumentToCourseProjectV9`、`importProjectV8ArchiveAsCourseProject`
  - fixture: 内存最小 V9（1 Slide surface / 1 location / 1 native text / 1 global item / 1 image asset bytes）；内存最小 V8（`createProject({ includeDefaultController: false, controls: 'none' })` + 一枚 PNG-like 资源）
  - backend: 纯协议/archive/producer；默认产品仍为 V8 `openProjectArchive` / `saveProject` / V8 `App`
- validation proves / does not prove:
  - proves: 最小 V9 可独立完成 validate → archive → reopen → validate → Published V2 parse；`authoringAddress` 跨 reopen 稳定且不含 hitId；最小 V8 显式迁移报告不丢场景/节点/素材，源 zip/文档不被改写；V8 zip 被 `openCourseProjectArchive` 拒绝（要求显式迁移）
  - does not prove: 未接 Workspace/MediaTab/Player；未接默认打开/保存/导出按钮；未重测 Flow 富文本（见下节，引用 R1-A）；未跑 typecheck/build/E2E/视觉
- narrow UI smoke, if authorized: 未授权；未启动 App。
- INTEGRATION_REQUESTS:
  ```
  INTEGRATION_REQUEST
  - requester task: R1-Z
  - target stage integrator: R2-A
  - target hotspot file: src/renderer/course/v9SlideVerticalSlice.ts（R2-A 新建；本任务不写）
  - exported symbol / callback: CourseProjectDocument、courseProjectDocumentSchema、makeAuthoringAddress
  - required user-visible behavior: 无。R2-A 不得改默认 App/store/UI。SlideAuthoringTarget 只用稳定 authoringAddress，不得持久化 hitId。
  - focused test proving lane side: tests/unit/courseProjectRoundTrip.test.ts
  - exact wiring requested: R2-A 以本 Gate 已证明的 V9 document/schema/address 为唯一工程真相；不要另起并行 schema；不要把 V9 接到默认打开/保存。
  - risk if omitted: R2 另建一套 Slide 模型，后续 SEAM 无法接到已证明的 archive/publish 链
  - status: open
  ```
  ```
  INTEGRATION_REQUEST
  - requester task: R1-B（R1-Z 复核仍 open，本任务不接线）
  - target stage integrator: R7-A / R7-Z
  - target hotspot file: src/renderer/project/openProject.ts、后续 App 打开/导入入口
  - exported symbol / callback: detectCourseProjectArchiveFormat、openCourseProjectArchive、importProjectV8ArchiveAsCourseProject
  - required user-visible behavior: R3-CUT 前默认打开仍走 V8；V9 zip 不得送进 openProjectArchive；仅显式导入才迁移并展示 report
  - focused test proving lane side: tests/unit/courseProjectArchive.test.ts、tests/unit/v8ToV9Migration.test.ts
  - exact wiring requested: 账本 R1B-R7A-01 保持 open。R1-Z 不改 App/open 入口。
  - risk if omitted: V9 协议包存在但产品无法打开 V9；或把 V9 zip 交给已拒绝 V9 的 V8 open
  - status: open
  ```
- DECISION_REQUESTS: 无
- remaining risks / untested full checks:
  - 未跑 `npm run typecheck` / `npm test` / `npm run build` / E2E / 视觉回归（R8）
  - 未重跑 R1-A/B/C/D 定向测试；其 HANDOFF 仍记为 lane_candidate
  - Flow 富文本与旧纯文本兼容未在本任务重复大测（见下节）
  - 默认导出仍走 V8 `buildPublishedLesson.ts`；Published V2 producer 未接产品按钮
- rollback point: 删除产品 worktree 中上述 2 个未跟踪测试文件；R0-D / R1-A/B/C/D 文件保持不动；基线仍为 `f272756`。
- execution state: lane_candidate
- integration state: n/a
- quality state: unverified

## Gate 证据（R1-Z 收集，不把整个 R1 标 DONE）

### 1. Round-trip 测试

`npx vitest run tests/unit/courseProjectRoundTrip.test.ts tests/unit/v8ToV9Migration.test.ts` → 2 files / 2 tests passed。

### 2. Flow 富文本与旧纯文本

本任务未重复大测。R1-A `tests/unit/courseProjectCoreContract.test.ts` 已覆盖：同一 `schemaVersion` 9 内旧纯字符串 Flow JSON 可读；heading/paragraph/quote/list/table 可选 `runs`；`flowBlockSchema` 拒绝越界 run。Published V2 复用同一 `flowBlockSchema`。R4 不得再改 Schema。引用：`handoffs/R1-A.md`。

### 3. 默认 V8 产品壳零 diff

```
git diff --name-only f272756 -- src/renderer/main.tsx src/renderer/App.tsx src/renderer/store/editorStore.ts src/renderer/ui/Workspace.tsx src/renderer/ui/MediaTab.tsx src/renderer/ui/RightSidebar.tsx src/renderer/ui/ScenePanel.tsx src/renderer/ui/TopToolbar.tsx src/renderer/ui/PropertiesTab.tsx src/renderer/ui/ElementsTab.tsx src/renderer/ui/NodesTab.tsx src/renderer/styles/globals.css
```

输出为空。R0-D 的 `applicationIdentity` / V8 `projectArchive` / `openProject.ts` / recovery 改动仍在，不是 R1 UI。

### 4. 无双写

- `App.tsx` 仍 `openProjectArchiveAsync`（V8 `projectArchive`）与 `saveProjectAsync`（V8 `createProjectArchive`）。
- `src/renderer/store` 无 `courseProject` / `publishedCourse` / V9 archive import。
- 默认导出仍 `buildPublishedLessonPayload`；`buildPublishedCourseV2Payload` 只存在于 `src/renderer/export/course/`，未被 App 引用。
- `openCourseProjectArchive` 拒绝 V8 zip；R0-D 的 `openProjectArchive` 拒绝 V9 zip。默认会话只写 V8。

### 5. 交给 R2/R7 的请求只留在账本

本任务不接线。上列两条 `INTEGRATION_REQUEST` 保持 `open`。协调者可将 R2-A 设为 `READY`，但不得宣称 V9 编辑器已可用，也不得在 R2-A 改默认产品壳。
