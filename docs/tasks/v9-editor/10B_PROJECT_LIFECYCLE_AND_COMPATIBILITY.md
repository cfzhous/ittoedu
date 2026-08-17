# T09B — 工程生命周期、恢复与 V8 显式兼容

> Wave：2，可与 T05–T09A 并行
> 目标：V9 新建/打开/保存/恢复完整，V8 只走显式导入迁移

## 1. 可见结果

新建、打开、最近工程、保存、另存为、脏状态、防误关、恢复、资源 sidecar 与错误诊断均以 Course Project V9 为生产真相；V8 文件可显式导入并产生清晰迁移结果，但不会让 store 回落到 V8 编辑后端。

## 2. 独占文件

- `src/renderer/project/**`
- `src/main/projectPersistence.ts`
- 仅与工程文件生命周期直接相关的 main IPC 窄路径（修改前先确认无其他 owner）
- 对应 archive/persistence/recovery/asset 单测

不修改 App/store、Player/export producer、Schema、UI 热点或生成 artifact。App/store 文件对话框接线交给 T10。

## 3. 必须闭合

### 3.1 V9 生命周期

- 三类空白工程经 T03 model 创建后可保存为 V9 archive。
- 打开、另存、最近工程和路径更新不双写旧 V8 project。
- dirty/revision 与一次命令一次 history 一致；纯 selection/location/global scope 切换不变脏。
- 关闭前安全保存/取消/放弃路径明确，失败不误清 dirty。

### 3.2 恢复与原子写

- recovery sidecar、写入协调、窗口关闭和崩溃恢复保持原子。
- 恢复候选有项目 ID/revision/时间验证，不覆盖更新的正式文件。
- 资源二进制、Runtime/Component package 和音视频 sidecar 寻址稳定。

### 3.3 V8 显式导入

- V8 schema/archive 只从明确“导入旧课件”入口读取。
- 迁移产出 V9 工程和可理解报告；不兼容项阻止或告警，不静默丢失。
- 导入后保存只写 V9；最近工程和恢复不把 V8 设为默认 backend。
- V8 compatibility tests 与默认 V9 编辑测试分离。

### 3.4 健康检查

- 检查缺失 surface/location、悬空资源/互动引用、Runtime/Component package、声音引用和 owner 地址。
- 不通过隐藏入口或删功能消除健康问题。

## 4. 不做

- 不启动 V10 或更改 Course Project V9 Schema 语义。
- 不修改导出格式或 Player。
- 不创建第二 store/backend。
- 不重写 main IPC 框架。

## 5. 最小验证

```powershell
npx vitest run tests/unit/projectArchive.test.ts tests/unit/asyncArchive.test.ts
npx vitest run tests/unit/recoveryWriteCoordinator.test.ts tests/unit/projectPersistence.test.ts
npx vitest run tests/unit/assetTransactions.test.ts tests/unit/assetReferences.test.ts
npx vitest run tests/unit/projectV8Schema.test.ts tests/unit/courseProjectProtocol.test.ts
git diff --check -- src/renderer/project src/main/projectPersistence.ts
```

只运行触及组；禁止 typecheck、build、全量 test/E2E/visual，不生成真实发布包。

## 6. 验收

- 默认路径始终是 V9，V8 只能显式导入。
- 保存/恢复失败不会破坏源文件或错误清除 dirty。
- 资源与 package sidecar 在另存/重开后可解析。
- App/store 对话框和关闭流程以 `INTEGRATION_REQUEST` 交给 T10。

## 7. 交付记录

HANDOFF
- task: T09B
- baseline SHA / worktree: `e2e34aa29ddb72abb2c691e414a4d8f461f35b2c` / `output/worktrees/v9-parity-reconstruction`
- outcome: 基线已有 V9 归档打开/保存与显式 V8 导入。本任务补上三类 T03 blank 的 V9 保存入口、导入报告、dirty/revision/关闭契约、恢复身份校验（拒绝 V8 默认 backend、不覆盖更新正式文件）以及课程健康检查。未改 IPC 框架、App/store 或 Schema。
- files changed:
  - `src/renderer/project/courseProjectArchive.ts`（身份窥视、V8 导入报告）
  - `src/renderer/project/saveProject.ts`（`saveCourseProject` / `saveCourseProjectAsync`，只写 V9）
  - `src/renderer/project/courseProjectLifecycle.ts`（新建：dirty/关闭/恢复候选）
  - `src/renderer/project/courseProjectHealthInspect.ts`（新建：缺失 surface/location 与悬空引用）
  - `src/main/projectPersistence.ts`（恢复元数据写入 id/revision/时间；V8 不作为默认恢复；正式文件更新则不提供过期副本）
  - `tests/unit/projectArchive.test.ts`
  - `tests/unit/asyncArchive.test.ts`
  - `tests/unit/recoveryWriteCoordinator.test.ts`
  - `tests/unit/projectPersistence.test.ts`
  - `tests/unit/assetTransactions.test.ts`
  - `tests/unit/assetReferences.test.ts`
  - `tests/unit/projectV8Schema.test.ts`
  - `tests/unit/courseProjectProtocol.test.ts`
- focused validation commands:
  - `npx vitest run tests/unit/projectArchive.test.ts tests/unit/asyncArchive.test.ts`
  - `npx vitest run tests/unit/recoveryWriteCoordinator.test.ts tests/unit/projectPersistence.test.ts`
  - `npx vitest run tests/unit/assetTransactions.test.ts tests/unit/assetReferences.test.ts`
  - `npx vitest run tests/unit/projectV8Schema.test.ts tests/unit/courseProjectProtocol.test.ts`
  - `git diff --check -- src/renderer/project src/main/projectPersistence.ts`
- results: 8 files / 95 tests passed；`git diff --check` 无输出。
- INTEGRATION_REQUESTS:
```md
INTEGRATION_REQUEST
- requester: T09B
- target owner: T10
- target file: src/renderer/App.tsx
- exported symbol / callback: saveCourseProjectAsync；importProjectV8ArchiveAsCourseProjectAsync().report；inspectCourseProjectArchiveIdentity；shouldOfferCourseProjectRecovery
- required behavior: 保存/另存继续只写 V9 archive（可用 saveCourseProjectAsync 统一更新 updatedAt）。普通打开/最近工程只走 openCourseProjectArchiveAsync；V8 必须走“导入旧版工程”，并展示 report.notes/warnings，导入后 path=null、markDirty、不写入最近工程。恢复对话框不要再把 schemaVersion=8 的 sidecar 当默认打开并静默导入；persistence 已对 V8 返回 null。
- focused test that proves the lane side: tests/unit/projectArchive.test.ts（V9 blank + V8 显式导入隔离）
- risk if omitted: 教师仍可能从恢复入口把旧版当成默认工程，或导入后无说明。

INTEGRATION_REQUEST
- requester: T09B
- target owner: T10
- target file: src/renderer/store/editorStore.ts
- exported symbol / callback: resolveCloseDirtyState；shouldMarkCourseProjectDirty；courseProjectRecoveryRevision；isCourseProjectRevisionDirty
- required behavior: 一次文档命令一次 revision/history；selection/location/global-scope 切换不得 dirty、不得写 recovery revision。关闭前：保存成功才清 dirty 并允许关；保存失败或取消必须保持 dirty；放弃才清 dirty 并关闭。自动恢复 schedule 使用 courseProjectRecoveryRevision(project)。
- focused test that proves the lane side: tests/unit/projectArchive.test.ts（dirty/close 契约）与 tests/unit/recoveryWriteCoordinator.test.ts
- risk if omitted: 切页或切全局层会误标脏，或保存失败后窗口当已保存关闭。

INTEGRATION_REQUEST
- requester: T09B
- target owner: T10
- target file: src/renderer/ui/ProjectHealthPanel.tsx
- exported symbol / callback: inspectCourseProjectHealth
- required behavior: 在现有交付检查之外展示 inspectCourseProjectHealth 的缺失页面/位置与悬空素材、声音、组件、互动对象问题；不要用隐藏入口消错。
- focused test that proves the lane side: tests/unit/assetReferences.test.ts（V9 reference health）
- risk if omitted: 教师只能看到笼统“内容不完整”，无法对上缺失 surface/location 或悬空引用。
```
- visual/manual evidence: 无 UI 改动；未跑 E2E / 视觉门禁 / typecheck / build。
- remaining risks: App 仍直接调用 createCourseProjectArchiveAsync 且恢复对话框仍含 V8 回退分支，需 T10 接线。`createProject` 仍是 V8 工厂，仅供显式导入与兼容测试。旧磁盘上的 V8 recovery sidecar 会被读成 null 且不自动删除。
- status: engineering candidate

HANDOFF
- task: T09B（T10 退回：补 `replaceCourseComponentPackage`）
- baseline SHA / worktree: `e2e34aa29ddb72abb2c691e414a4d8f461f35b2c` / `output/worktrees/v9-parity-reconstruction`
- outcome: V9 现可按同一 `packageId` 替换组件包。命令只返回可被 store 包一次 history 的纯结果：更新 sidecar、实例 `version`/`props`（教师已有 props 保留，新 default 补齐）。失败抛 `UserFacingError`，不改调用方 project/sidecar。未改 App/store/UI/Schema，未重写 IPC。
- files changed:
  - `src/renderer/project/courseComponentPackage.ts`（新建：`replaceCourseComponentPackage`）
  - `tests/unit/courseComponentPackage.test.ts`
- focused validation commands:
  - `npx vitest run tests/unit/courseComponentPackage.test.ts`
  - `git diff --check -- src/renderer/project`
- results: 1 file / 2 tests passed；`git diff --check` 无输出。
- INTEGRATION_REQUESTS:
```md
INTEGRATION_REQUEST
- requester: T09B
- target owner: T10
- target file: src/renderer/App.tsx / src/renderer/store/editorStore.ts
- exported symbol / callback: replaceCourseComponentPackage
- required behavior: `courseSession !== null` 时，已打开的替换选择器（`handleReplaceComponent` / catalog update）校验同一 packageId 后调用 `replaceCourseComponentPackage({ project: session.history.present, componentFiles: session.componentFiles, packageId, packageData })`，再用 `commitCourseHistory` 一次写入 `result.project`，并把 `result.componentFiles` / `result.packageData` 写回 session。失败展示 `UserFacingError`，不要再短路成“缺少替换命令”。不要在热点里重写 sidecar 事务。
- focused test that proves the lane side: tests/unit/courseComponentPackage.test.ts（同 ID 替换更新 sidecar+实例；失败不破坏现有实例；结果可被一次 history 包裹）
- risk if omitted: 教师已能打开替换选择器，但 V9 仍无法迁移实例版本，或 store 拆成多次 history / 失败时改坏现有实例。
```
- visual/manual evidence: 无 UI 改动；未跑 E2E / 视觉门禁 / typecheck / build。
- remaining risks: T10 未接线前 App 仍会把 V9 替换短路。V8 `replaceComponentPackage` / `planComponentPackageReplacement` 仍只服务 V8 工程。
- status: engineering candidate

