HANDOFF
- task: R1-B
- planning pack path: `C:\Users\74755\Documents\HTML课件编辑器\docs\tasks\v8-to-v9-rebuild`
- product worktree / branch / baseline SHA: `C:\Users\74755\Documents\HTML课件编辑器-v8-to-v9-rebuild` / `codex/v8-to-v9-rebuild` / `f27275658c6dfaa12f2ce35cd9368dcdebe99451`
- outcome: 在产品 worktree 新建 V9 archive encode/decode/validate、格式探测与显式 V8→V9 纯迁移。未改默认 V8 打开/保存路径，未改 App/store/UI，未改 R0-D 与 R1-A 文件。V9 zip 走 `openCourseProjectArchive`；V8 zip 由 `openProjectArchive` 解码后再显式迁移。定向两文件 Vitest 与 owned-path diff check 通过。本 lane 为 integration candidate；未接默认产品导入，未宣称 art/accepted。未 commit。
- owned files changed (product worktree, new):
  - `src/renderer/project/courseProjectArchive.ts`
  - `src/renderer/project/courseProjectLifecycle.ts`
  - `src/renderer/project/courseProjectMigration.ts`
  - `tests/unit/courseProjectArchive.test.ts`
  - `tests/unit/courseProjectMigration.test.ts`
  计划侧：本 HANDOFF。
- donor files/functions consulted:
  - 骨架：`git show 4755034:src/renderer/project/courseProjectArchive.ts`（`createCourseProjectArchive` / `openCourseProjectArchive` / asset+component manifest / `importProjectV8ArchiveAsCourseProject`）
  - 函数级：`inspectCourseProjectArchiveIdentity`（`4755034` / `bffbf95`）
  - 纯 recovery/dirty：`git show 4755034:src/renderer/project/courseProjectLifecycle.ts`
  - 断言意图：`tests/unit/courseStateAndArchive.test.ts` round-trip / 显式迁移；`tests/unit/courseProjectProtocol.test.ts` 的 `CourseProjectV8ImportReport` 形状
  - 模型：R1-A `migrateProjectV8ToCourseProjectV9`（只调用，不改 model）
  - V8 解码：现有 `openProjectArchive` / `createProjectArchive`（只 import）
- donor 舍弃部分:
  - 整串 cherry-pick `3e41ec0` / `4755034`
  - `courseStateAndArchive.test.ts` 对 `v9SlideVerticalSlice` / dirty session / App 的接线
  - HEAD `courseProjectProtocol.test.ts` 整文件（依赖 location commands / saveCourseProject）
  - CourseStudio / ProductApp / 默认打开对话框 / IPC
- focused validation command:
  ```
  npx vitest run tests/unit/courseProjectArchive.test.ts tests/unit/courseProjectMigration.test.ts
  git diff --check -- src/renderer/project/courseProjectArchive.ts src/renderer/project/courseProjectLifecycle.ts src/renderer/project/courseProjectMigration.ts tests/unit/courseProjectArchive.test.ts tests/unit/courseProjectMigration.test.ts
  ```
- validation result: Vitest 2 files / 4 tests passed，1.57s。`git diff --check` 无输出、exit 0。
- validation entry / fixture / backend:
  - entry: `createCourseProjectArchive` / `openCourseProjectArchive` / `detectCourseProjectArchiveFormat` / `migrateProjectV8DocumentToCourseProjectV9` / `importProjectV8ArchiveAsCourseProject`
  - fixture: 内存 ZIP；`createProject({ includeDefaultController: false, controls: 'none' })` 加素材与组件的 V8 archive；由其显式迁移得到 V9 archive
  - backend: V9 candidate archive 纯函数；默认产品仍为 V8 `openProjectArchive` / V8 `App`
- validation proves / does not prove:
  - proves: V9 encode/decode/validate 与 asset/component manifest round-trip；探测区分 V8 / V9 / 损坏 / 不支持版本；`openCourseProjectArchive` 拒绝 V8（要求显式迁移）；R0-D 的 V8 `openProjectArchive` 拒绝 V9 zip；迁移报告不静默丢场景/节点/素材/组件；多版本组件冲突抛错且不改源 zip
  - does not prove: 未接真实打开对话框、Workspace、保存重开、recovery IPC、Player；未跑 typecheck/build/E2E/视觉
- narrow UI smoke, if authorized: 未授权；未启动 App。
- INTEGRATION_REQUESTS:
  ```
  INTEGRATION_REQUEST
  - requester task: R1-B
  - target stage integrator: R7-A / R7-Z
  - target hotspot file: src/renderer/project/openProject.ts、后续 App 打开/导入入口（R1 不得改）
  - exported symbol / callback: detectCourseProjectArchiveFormat、openCourseProjectArchive、importProjectV8ArchiveAsCourseProject、shouldOfferCourseProjectRecovery
  - required user-visible behavior: 默认打开仍走 V8，直到 cutover；V9 zip 不得送进 openProjectArchive；显式“导入旧版”才调用 importProjectV8ArchiveAsCourseProject，并展示 report.warnings / notes
  - focused test proving lane side: tests/unit/courseProjectArchive.test.ts、tests/unit/courseProjectMigration.test.ts
  - exact wiring requested: R1 不接线。R7 用探测结果分流；V9 → openCourseProjectArchive；V8 普通打开仍拒绝或保持 V8 路径；仅显式导入走迁移。
  - risk if omitted: V9 协议包存在但产品无法打开 V9；或错误地把 V9 zip 交给已拒绝 V9 的 V8 open
  - status: open
  ```
- DECISION_REQUESTS: 无
- remaining risks / untested full checks: 未跑 `npm run typecheck` / `npm test` / `npm run build` / E2E / 视觉回归（R8）。Async archive API 已摘取但本定向测试未覆盖。`createCourseProjectArchiveAsync` / `openCourseProjectArchiveAsync` 留给 R7。并行 lane 已出现 `src/renderer/export/course/` 与 R1-D 测试改动，本任务未触碰。
- rollback point: 删除产品 worktree 中上述 5 个未跟踪文件；R0-D / R1-A / 其他 lane 文件保持不动；基线仍为 `f272756`。
- execution state: lane_candidate
- integration state: n/a
- quality state: unverified

## 导出符号（给 R1-Z / R7）

`src/renderer/project/courseProjectArchive.ts`:
- `createCourseProjectArchive` / `createCourseProjectArchiveAsync`
- `openCourseProjectArchive` / `openCourseProjectArchiveAsync`
- `inspectCourseProjectArchiveIdentity`
- `detectCourseProjectArchiveFormat`
- `importProjectV8ArchiveAsCourseProject` / `importProjectV8ArchiveAsCourseProjectAsync`
- `migrateProjectV8ArchiveToCourseProjectV9`
- types: `CourseProjectArchiveData`、`CourseProjectArchiveIdentity`、`CourseProjectArchiveFormatKind`、`CourseProjectArchiveFormatProbe`、`CourseProjectV8ImportResult`、`CreateCourseProjectArchiveOptions`、`UnsupportedCourseProjectVersionError`
- re-export: `CourseProjectV8ImportReport`

`src/renderer/project/courseProjectMigration.ts`:
- `migrateProjectV8DocumentToCourseProjectV9`（显式纯函数，内部调用 R1-A `migrateProjectV8ToCourseProjectV9`）
- `buildCourseProjectV8ImportReport`
- types: `CourseProjectV8ImportReport`、`CourseProjectV8MigrationResult`

`src/renderer/project/courseProjectLifecycle.ts`（纯数据，未接 IPC/App）:
- `shouldMarkCourseProjectDirty`、`resolveCloseDirtyState`、`shouldOfferCourseProjectRecovery`、`courseProjectRecoveryRevision`、`isCourseProjectRevisionDirty`

## 格式探测

`detectCourseProjectArchiveFormat(bytes)` 先 peek `project.json`，再按顺序分类：

1. 空文件 / 解压失败 / 缺 `project.json` / JSON 无效 → `kind: 'corrupted'`
2. `schemaVersion === 9` → `kind: 'v9'`
3. `schemaVersion === 8` → `kind: 'v8'`（普通 `openCourseProjectArchive` 拒绝，要求显式迁移）
4. 其他整数版本 → `kind: 'unsupported'`
5. 未声明版本但同时有 `locations`+`surfaces` → `kind: 'v9'`
6. 未声明版本但有 `scenes` → `kind: 'v8'`
7. 其余 → `kind: 'corrupted'`

`inspectCourseProjectArchiveIdentity` 只返回 identity（recovery peek），不分类。

## 迁移报告字段

`CourseProjectV8ImportReport`:
- `sourceFormat: 'legacy-course'`
- `targetFormat: 'current-course'`
- `projectId` / `title`
- `surfaceCount` / `locationCount` / `assetCount` / `componentPackageCount`
- `droppedFields: readonly string[]`（场景/节点/素材/组件/全局层缺失路径；完整迁移为空）
- `warnings`（数量不一致或 `droppedFields` 非空时写入，不静默丢字段）
- `notes`（含“另存为新文件，原文件不会被改写”）
