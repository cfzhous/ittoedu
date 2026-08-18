HANDOFF
- task: R1-A
- planning pack path: `C:\Users\74755\Documents\HTML课件编辑器\docs\tasks\v8-to-v9-rebuild`
- product worktree / branch / baseline SHA: `C:\Users\74755\Documents\HTML课件编辑器-v8-to-v9-rebuild` / `codex/v8-to-v9-rebuild` / `f27275658c6dfaa12f2ce35cd9368dcdebe99451`
- outcome: 在产品 worktree 新建 Course Project V9 / Published Course V2 / `authoringAddress` / Surface Runtime 3 纯协议文件，未改默认 App/store/UI/backend，未碰 R0-D 文件。同一 `schemaVersion` 9 内为 Flow heading/paragraph/quote/list/table 补了可选 V8 `TextRun[]`；旧纯字符串 JSON 仍 validate。定向两文件 Vitest 与 diff check 通过。本 lane 为 integration candidate；未接 Player、未宣称 art/accepted。未 commit。
- owned files changed (product worktree, new):
  - `src/shared/courseProjectTypes.ts`
  - `src/shared/courseProjectSchema.ts`
  - `src/shared/courseProjectModel.ts`
  - `src/shared/publishedCourseTypes.ts`
  - `src/shared/publishedCourseSchema.ts`
  - `src/shared/authoringAddress.ts`
  - `src/shared/surfaceRuntimeTypes.ts`
  - `tests/unit/authoringAddress.test.ts`
  - `tests/unit/courseProjectCoreContract.test.ts`
  计划侧：本 HANDOFF。V8 `projectTypes.ts` / `projectSchema.ts` 未重命名、未删除。
- donor files/functions consulted:
  - 骨架：`git show 3e41ec0` 上列 7 个 `src/shared` 文件 + `tests/unit/authoringAddress.test.ts`
  - 后期纯类型/schema/model 字段：`e2e34aa` 与 `4755034` 对上述协议文件 blob 相同，已收入 Spatial `paths`/`relations`、`mergeCourseNativeData`、`sceneNodeToCourseLayerItem`、`LegacyComponentPackageMigrationConflictError` / `migrateComponentPackages`
  - 断言摘取：`3e41ec0`/`4755034` `tests/unit/courseProjectProtocol.test.ts` 中 strict discriminator、Flow 纯文本 block、migrate 保留 id 的意图；**未整文件迁入**
  - V8 `TextRun`/`TextRunStyle`：产品 worktree `src/shared/projectTypes.ts`（类型复用，不复制第二套）
- donor 舍弃部分:
  - 整串 cherry-pick `3e41ec0` / `e2e34aa` / `4755034`
  - HEAD `courseProjectProtocol.test.ts`（依赖 `courseLocationCommands` / `courseProjectLifecycle` / archive / save）
  - `authoringAddress.test.ts` 对 `@/renderer/authoring/aiSelectionReference` 与 `createProject` 的 AI selection 接线（改成本文件内构造 `AiSelectionReference`）
  - CourseStudio / ProductApp / controlled UI / location commands / lifecycle / archive / producer / Player
  - 持久化 `projectMode`、可见 AI 工作流字段、Schema V10
- focused validation command:
  ```
  npx vitest run tests/unit/courseProjectCoreContract.test.ts tests/unit/authoringAddress.test.ts
  git diff --check -- src/shared tests/unit/courseProjectCoreContract.test.ts tests/unit/authoringAddress.test.ts
  ```
- validation result: Vitest 2 files / 6 tests passed，1.75s。`git diff --check` 无输出、exit 0。
- validation entry / fixture / backend:
  - entry: `courseProjectDocumentSchema` / `flowBlockSchema` / `migrateProjectV8ToCourseProjectV9` / `makeAuthoringAddress`
  - fixture: 测试内最小 Slide V9 JSON；Flow 旧纯文本与带 runs 的 block JSON；`createProject({ includeDefaultController: false, controls: 'none' })` 最小 V8 → V9 migrate
  - backend: 纯共享合同；默认产品仍为 V8 `ProjectDocument` / V8 `App`
- validation proves / does not prove:
  - proves: 最小 V9 strict schema（含拒绝 `projectMode`/未知字段）；Flow 旧纯文本可读；Flow runs 读写与 plain-text fallback；migrate 最小 round-trip；authoringAddress 跨身份稳定且不含临时 hitId
  - does not prove: 未接 Workspace/MediaTab/Player；未跑 archive/open/save；未跑 Published V2 producer；未跑 typecheck/build/E2E/视觉
- narrow UI smoke, if authorized: 未授权；未启动 App。
- INTEGRATION_REQUESTS: 无（R1-B/C/D 直接 import 本任务新文件；不要改 App）
- DECISION_REQUESTS: 无
- remaining risks / untested full checks: 未跑 `npm run typecheck` / `npm test` / `npm run build` / E2E / 视觉回归（R8）。`deriveCourseProjectAuthoringInventory` 与 `publishedCourseV2Schema` 未纳入本定向测试。V8 `TextRun` 是对 `text` 的样式区间，缺省 `text` 无法从 runs 还原字形，fallback 为 `''`（见下节）。
- rollback point: 删除产品 worktree 中上述 9 个未跟踪文件；R0-D 改动保持不动；基线仍为 `f272756`。
- execution state: lane_candidate
- integration state: n/a
- quality state: unverified

## Flow runs 设计（schemaVersion 9，非 V10）

- 类型：`FlowRichText = { text: string; runs?: TextRun[] }`，`TextRun`/`TextRunStyle` 从 V8 `projectTypes` 导入。
- heading / paragraph / quote：保留必填 `text`，可选 `runs`。
- list items：保留 `text`，可选 `runs`。
- table cells：`Record<string, string | { text: string; runs?: TextRun[] }>`；旧纯字符串 cell 仍 validate，新对象 cell 也 validate。读取后用 `decodeFlowTableCell` 得到一致 `{ text, runs }`。
- Schema：旧无 `runs` JSON 与带 `runs` JSON 均通过；run 区间按 Unicode 码点校验，越界拒绝。
- Fallback 最短充分实现（`normalizeFlowRichText`）:
  - `runs` 缺省：由 `text` 生成整段空样式 run（空字符串则为 `[]`）。
  - `text` 缺省：V8 `TextRun` 不含字形，拼回为 `''`，不能发明正文。
- Published V2 的 Flow `blocks` 复用同一 `flowBlockSchema`，因此自动接受 runs；本任务未接 Player。

## R1-B 可依赖的导出符号

`src/shared/courseProjectTypes.ts`: `COURSE_PROJECT_SCHEMA_VERSION`、`CourseProjectDocument`、`CourseSurfaceDocument`、`CourseLocation`、`LayerItem`、`ScopedLayerItem`、`FlowBlock`、`FlowRichText`、`FlowTableCell`、`FlowListItem`、`SpatialPathDocument`、`SpatialRelationDocument` 及相关 owner 类型。

`src/shared/courseProjectSchema.ts`: `courseProjectDocumentSchema`、`courseSurfaceSchema`、`flowBlockSchema`、`layerItemSchema`、`scopedLayerItemSchema`、`courseLocationSchema`、`authoringProjectVersionSchema`、`mergeCourseNativeData`、`materializeNativeLayerItem`。

`src/shared/courseProjectModel.ts`: `migrateProjectV8ToCourseProjectV9`、`getEffectiveCourseLayerOrder`、`visitCourseProject`、`collectCourseProjectReferences`、`visitCourseProjectReferences`、`reindexLayerItems`、`sceneNodeToCourseLayerItem`、`normalizeFlowRichText`、`decodeFlowTableCell`、`flowPlainTextFallback`、`flowRunsFallback`、`ProjectV8MigrationCompatibilityError`、`LegacyComponentPackageMigrationConflictError`。

`src/shared/publishedCourseTypes.ts`: `PUBLISHED_COURSE_FORMAT`、`PUBLISHED_COURSE_VERSION`、`PublishedCourseV2Payload`。

`src/shared/publishedCourseSchema.ts`: `publishedCourseV2Schema`。

`src/shared/authoringAddress.ts`: `AUTHORING_ADDRESS_PROTOCOL_VERSION`、`makeAuthoringAddress`。`AiSelectionReference` / `CurrentCourseSelection*` / `serializeAiSelectionReference` 仅为 internal 类型，不要接到 App。

`src/shared/surfaceRuntimeTypes.ts`: `SURFACE_RUNTIME_API_VERSION`、`SurfaceRuntimeDefinition`、`SurfaceRuntimeCreateContext`（R1-D 合同；本任务未改 RuntimeHost）。
