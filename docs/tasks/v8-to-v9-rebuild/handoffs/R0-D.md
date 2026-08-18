HANDOFF
- task: R0-D
- planning pack path: `C:\Users\74755\Documents\HTML课件编辑器\docs\tasks\v8-to-v9-rebuild`
- product worktree / branch / baseline SHA: `C:\Users\74755\Documents\HTML课件编辑器-v8-to-v9-rebuild` / `codex/v8-to-v9-rebuild` / `f27275658c6dfaa12f2ce35cd9368dcdebe99451`
- outcome: 已闭合宿主 AppData 隔离与 V8 路径上的 V9 格式探测。重建会话默认 userData 改为 `ittoedu-courseware-editor-v8-rebuild`，不再与 V9 供体共享 `ittoedu-courseware-editor`。打开 / archive / recovery 对 schemaVersion 9 或 `locations`/`surfaces`/`globalLayerItems`/`startLocationId` 结构一律拒绝，给出可行动中文错误（当前主干仍是 V8，请等待显式迁移入口）。未改 App/store/Workspace/UI，未移植 V9 产品代码，未实现 V8→V9 迁移。未重启已在跑的 Electron。
- owned files changed:
  - 产品 worktree：`src/main/applicationIdentity.ts`、`src/renderer/project/openProject.ts`、`src/renderer/project/projectArchive.ts`、`src/renderer/project/recoveryWriteCoordinator.ts`
  - 产品 worktree 测试：`tests/unit/projectArchive.test.ts`、`tests/unit/recoveryWriteCoordinator.test.ts`；另锁步更新已有 `tests/unit/applicationIdentity.test.ts`（未纳入本任务定向 Vitest 命令）
  - 未改：`src/main/index.ts`、`src/main/createWindow.ts`、`src/preload/index.ts`（当前 Electron 43 / Node 24 已能跑 V8，无需宿主前移）
- donor files/functions consulted: 只读 `src/renderer/project/courseProjectArchive.ts`（`declaredSchemaVersion` / `readCourseProject` 的版本分流）、`src/main/projectPersistence.ts`（V9 recovery peek，禁止整文件覆盖）、`src/shared/courseProjectTypes.ts`（V9 字段：`locations` / `surfaces` / `globalLayerItems` / `startLocationId`）。未整文件覆盖，未带回 CourseStudio / controlled UI。
- focused validation command:
  ```
  npx vitest run tests/unit/projectArchive.test.ts tests/unit/recoveryWriteCoordinator.test.ts
  git diff --check -- src/main src/preload src/renderer/project tests/unit/projectArchive.test.ts tests/unit/recoveryWriteCoordinator.test.ts
  ```
- validation result: Vitest 2 files / 34 tests passed，exit 0，约 29s。`git diff --check` 无输出、exit 0。未跑 `applicationIdentity.test.ts`（见下）。未跑 typecheck / 全量 test / build / E2E / 视觉回归。
- validation entry / fixture / backend:
  - entry 1：`openProjectArchive` ← `readProjectDocument` / `isCourseProjectV9Document`
    - fixture/backend：内存 ZIP + 合成 Course Project V9 `project.json`（`schemaVersion: 9` 以及省略版本但含 `locations`/`surfaces`/`globalLayerItems`/`startLocationId`）；对照仍用 V8 `createProject` archive
    - proves：V8 打开路径识别 V9 schema/字段并抛出「这是 V9 工程，当前无法打开」，suggestion 含「显式迁移」；不按 V8 schema 恢复
    - does_not_prove：未接真实「打开工程」对话框、Workspace、保存重开或 Player
  - entry 2：`RecoveryWriteCoordinator.drain` ← `rejectCourseProjectV9Recovery`
    - fixture/backend：合成 V9 snapshot + V9 ZIP bytes
    - proves：V9 snapshot/archive 不会写入 V8 recovery；`onError` 收到同一可行动中文错误
    - does_not_prove：未接 `desktopAPI.readRecoveryProject`、未接真实 App 启动恢复对话框、未证明共享磁盘上旧 recovery 文件已被删除
- narrow UI smoke, if authorized: 未授权。未重启已在跑的 `npm run dev` / Electron。
- INTEGRATION_REQUESTS: 无
- DECISION_REQUESTS: 无
- remaining risks / untested full checks:
  - **当前仍在跑的 Electron 仍占用共享 AppData** `C:\Users\74755\AppData\Roaming\ittoedu-courseware-editor`。隔离要等下次启动且 main 重新编译（`predev` / `build:electron`）后才生效。本任务未杀进程、未 rebuild Electron。
  - 共享目录里已有 V9 最近工程（`examples/course-project-v9/...`）。隔离生效后重建会话不再读取该目录；目录本身未删除。
  - 显式 `--user-data-dir` 仍优先生效（e2e/工具需要）。若有人把该参数指回共享目录，隔离会被绕过。
  - 若有人把 V9 `recovery.h5lesson` 拷进新隔离目录，启动仍可能弹出恢复对话框；确认恢复时会走 `openProjectArchiveAsync` 并显示 V9 错误，不会按 V8 结构覆盖。`projectPersistence.ts` 不在本任务可写范围，主进程读 recovery 仍只做 ZIP 完整性检查。
  - 未跑 typecheck / 全量 Vitest / build / E2E / 视觉回归（留给 R8）。
  - `tests/unit/applicationIdentity.test.ts` 已锁步改为断言 `ittoedu-courseware-editor-v8-rebuild`，但未纳入本任务定向命令。
- rollback point: 丢弃产品 worktree 中上述 7 个文件的未提交改动；隔离目录 `AppData\Roaming\ittoedu-courseware-editor-v8-rebuild` 若已创建可手工删除。不回退 R0-A worktree 本身。
- execution state: lane_candidate
- integration state: n/a
- quality state: engineering_candidate
- canonical product worktree: `C:\Users\74755\Documents\HTML课件编辑器-v8-to-v9-rebuild`
- exact baseline SHA: `f27275658c6dfaa12f2ce35cd9368dcdebe99451`
- launch command/result: 沿用 R0-A 的 `npm run dev`；本任务未重启。隔离对**下一次**编译并启动的 Electron 生效。
- V8 capability inventory summary: 未做，属 R0-B
- baseline screenshots/video locations: 未采集，属 R0-B
- format/recovery isolation result:
  - 默认 userData 名：`ittoedu-courseware-editor-v8-rebuild`（仅 `applicationIdentity.ts`，不改 `constants.ts` 公共产品名）
  - V9 `.h5lesson` / archive / recovery snapshot：拒绝并提示等待显式迁移，不 silent fail、不假成功、不按 V8 覆盖
  - 当前运行中会话：仍共享旧 AppData，直到重启
- teacher decision: 待 R0-G
