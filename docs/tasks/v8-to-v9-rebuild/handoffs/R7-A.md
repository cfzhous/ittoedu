HANDOFF
- task: R7-A
- planning pack path: `C:\Users\74755\Documents\HTML课件编辑器\docs\tasks\v8-to-v9-rebuild`
- product worktree / branch / baseline SHA: `C:\Users\74755\Documents\HTML课件编辑器-v8-to-v9-rebuild` / `codex/v8-to-v9-rebuild` / `f27275658c6dfaa12f2ce35cd9368dcdebe99451`
- outcome: 开工盘点确认 CUT 默认打开/保存与 AppData 隔离已闭合；唯一 persistence 缺口为 `readRecoveryProject` / `writeRecoveryProject` 未校验 Course Project schemaVersion，V8/未来版本 recovery 字节仍可能被读出。已在 main 层用 fflate 浅探 `project.json` 并拒绝非 V9（读层清除、写层抛错）。新增 `projectFormatIsolation.test.ts`；更新 persistence 测试 fixture 为合法 V9 zip。未改 App/store/壳层/ipc。未 commit。未开始 R7-B/C/D/E/Z、R6、R8。
- owned files changed (product worktree):
  - `src/main/projectPersistence.ts`（新增 `classifyRecoveryArchive` / 读写 V9-only 校验）
  - `tests/unit/projectPersistence.test.ts`（recovery 用例改用 V9 fixture）
  - `tests/unit/projectFormatIsolation.test.ts`（新建：V8/未来版本读拒、写拒、AppData 名、lifecycle offer 探针）
  计划侧：本 HANDOFF。
- donor files/functions consulted:
  - 只读 `courseProjectArchive.ts` 中 `detectCourseProjectArchiveFormat` / `inspectCourseProjectArchiveIdentity` 语义（main 不 import renderer）
  - 只读 `courseProjectLifecycle.ts` 中 `shouldOfferCourseProjectRecovery`（已存在，未改）
  - 只读 `applicationIdentity.ts`（`ittoedu-courseware-editor-v8-rebuild` 已闭合）
  - 只读 `App.tsx` recovery 启动路径（确认未调用 `shouldOfferCourseProjectRecovery`）
- focused validation command:
  ```
  npx vitest run tests/unit/projectPersistence.test.ts tests/unit/projectFormatIsolation.test.ts
  git add -N src/main/projectPersistence.ts tests/unit/projectPersistence.test.ts tests/unit/projectFormatIsolation.test.ts
  git diff --check -- src/main/projectPersistence.ts tests/unit/projectPersistence.test.ts tests/unit/projectFormatIsolation.test.ts
  git reset
  ```
- validation result: Vitest 2 files / 12 tests passed。`git diff --check` 无输出、exit 0。
- validation entry / fixture / backend:
  - entry: `writeRecoveryProject` / `readRecoveryProject`；`shouldOfferCourseProjectRecovery`；`REBUILD_USER_DATA_DIRECTORY_NAME`
  - fixture: V8 `createProjectArchive`；V9 `createCourseProjectArchive(createBlankCourseProject())`；未来 schemaVersion 10 zip；损坏 zip
  - backend: main persistence + renderer lifecycle 纯函数；未接 App recovery 对话框 / IPC 新字段
- validation proves / does not prove:
  - proves: recovery 读写仅接受 V9；V8/未来版本读层返回 null 并清除；写层 `RECOVERY_LEGACY_FORMAT` / `RECOVERY_UNSUPPORTED_VERSION`；AppData 目录名与共享产品隔离；lifecycle 对 V8 返回 `ignore-legacy-default`、较新 V9 recovery 可 `offer`；原子写入/哈希降级/最近 12 项等既有 persistence 行为仍绿
  - does not prove: App 是否在启动时调用 `shouldOfferCourseProjectRecovery`（R7-Z）；recent 打开路径的 V8/V9 分流（CUT `openDefaultCourseProject` 已有，本任务未改）；真实 Electron 恢复弹窗；`R1B-R7A-01 verified`（留 R7-Z 窗口）
- narrow UI smoke, if authorized: 未授权；未启动 App。
- INTEGRATION_REQUESTS:
  ```
  INTEGRATION_REQUEST
  - requester task: R7-A
  - target stage integrator: R7-Z
  - target hotspot file: src/renderer/App.tsx（recovery 启动 effect + ConfirmDialog）
  - exported symbol / callback: shouldOfferCourseProjectRecovery；inspectCourseProjectArchiveIdentity；detectCourseProjectArchiveFormat
  - required user-visible behavior: 读取 `readRecoveryProject()` 后，对 bytes 取 identity；若 offer 为 `ignore-legacy-default` 或 `ignore-stale-official` 则静默 `clearRecoveryProject` 且不弹恢复框；仅 `offer` 时显示现有恢复对话框。main 读层已拒 V8/未来版本，App 侧仍需对 V9 official 副本做 stale 判定。
  - focused test proving lane side: tests/unit/projectFormatIsolation.test.ts（lifecycle offer）；tests/unit/projectPersistence.test.ts（V9-only recovery）；tests/unit/courseProjectArchive.test.ts（shouldOfferCourseProjectRecovery V8 ignore）
  - exact wiring requested: 在 listRecentProjects/readRecoveryProject Promise 回调中，recovery 非 null 时调用 shouldOfferCourseProjectRecovery({ recovery: inspectCourseProjectArchiveIdentity(recovery.bytes), official: projectPath ? inspectOfficialFromDisk(projectPath) : null })；非 offer 则 clearRecoveryProject + setRecoveryDecisionComplete(true)；不要改 main persistence 已闭合的 V9-only 读层
  - risk if omitted: V9 recovery 与较新 official 仍可能误弹恢复框；lifecycle stale-official 规则未生效；R1B-R7A-01 无法 verified
  - status: open
  ```
- DECISION_REQUESTS: 无
- remaining risks / untested full checks:
  - 未跑 typecheck / 全量 test / build / E2E / 视觉（R8）
  - recent 打开仍走 fileDialogs + renderer open 路径；V8 显式导入分流未在本任务重测（CUT 已有测试）
  - `R1B-R7A-01` 账本项：persistence 读层已补，App 接线待 R7-Z 后标 verified
- rollback point: 还原产品 worktree 中上述 3 个文件；删除 `tests/unit/projectFormatIsolation.test.ts`。基线仍为 `f272756`。
- execution state: lane_candidate
- integration state: pending
- quality state: unverified

## 盘点闭合表（2026-08-17）

| 项 | 盘点前 | R7-A 后 |
|---|---|---|
| 默认 V9 打开/保存 / CUT 导入分流 | 已闭合 | 未改 |
| AppData `ittoedu-courseware-editor-v8-rebuild` | 已闭合 | 测到 |
| 损坏 zip / 伪 zip recovery | 已闭合 | 未改 |
| recovery 仅 V9（读/写） | **缺口** | **已补** |
| `shouldOfferCourseProjectRecovery` 实现 | 已存在 | 未改 |
| App 调用 recovery offer | **缺口** | 留 R7-Z |
| 原子写入失败不损坏旧文件 | 已有 `atomicWrite` + 测试 | 未改 |
| ipc / ipcTypes 新字段 | 不需要 | 未改 |
