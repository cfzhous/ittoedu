HANDOFF
- task: R8-FIX-E2E-IMPORT
- planning pack path: `C:\Users\74755\Documents\HTML课件编辑器\docs\tasks\v8-to-v9-rebuild`
- product worktree / branch / baseline SHA: `C:\Users\74755\Documents\HTML课件编辑器-v8-to-v9-rebuild` / `codex/v8-to-v9-rebuild` / `f27275658c6dfaa12f2ce35cd9368dcdebe99451`
- outcome: 只改 `tests/e2e/editor.spec.ts`。打开 `global-runtime-authoring.h5lesson`（`examples/sample-project.h5lesson` schema 8 克隆）后走完整显式导入，再点 `global-layer-entry`。保存断言跟切到 Course Project V9 `locations` / `surfaces` / runtime layer items / `assetFiles`。导入后另存为新 V9 路径，再打开该路径不再出导入对话框。iframe / `.lesson-runtime-mount` / `data-courseware-edit-key` / `canvas-authoring-target` 跟切后仍绿，未改产品。未 skip。未新建 §5 spec。未 commit。未领取 R8-G。定向 1 绿 → `lane_candidate`。不是 art/accepted。
- owned files changed:
  - 产品 worktree：`tests/e2e/editor.spec.ts`
  - 计划侧：本 HANDOFF；`00_INDEX.md` 本行
  - **未改**：`src/renderer/App.tsx`、`editorStore.ts`、`Workspace.tsx`、默认 backend、`componentCatalogMatrix.spec.ts`
- donor files/functions consulted:
  - [`handoffs/R8-F-RECHECK-2.md`](R8-F-RECHECK-2.md) 首错：`modal-backdrop` 挡住 `global-layer-entry`
  - `tests/e2e/componentCatalogMatrix.spec.ts` `confirmLegacyCourseImport`（只读抄进 editor.spec，未改 catalog）
  - `src/renderer/App.tsx` `v8ImportPending` ConfirmDialog（`需要显式导入旧版工程` / `导入为当前课程工程`）+ `CopyableSummaryDialog`（`旧版工程导入报告` / `完成`）；确认后 `applyCourseArchive(..., null)`，原 V8 不改写
  - `src/shared/courseProjectSchema.ts` `courseProjectDocumentSchema`；`COURSE_PROJECT_SCHEMA_VERSION = 9`
  - `src/shared/courseProjectTypes.ts` `globalLayerItems` / `surfaces` / `locations` / `RuntimeLayerItem`
  - `src/renderer/project/courseProjectArchive.ts` 归档字节按 `project.assets[id].path` 读成 `assetFiles[id]`
- donor 舍弃部分:
  - 为绿去掉 `v8ImportPending` 或静默打开 V8
  - 保存断言继续读 `project.scenes[].runtime` / `project.globalRuntime`
  - 把产品退回 V8 运行时投影迁就 iframe 断言
  - 改 catalog、新建共享 helper 包、skip、新建 §5 spec
- focused validation command:
  ```
  npx playwright test tests/e2e/editor.spec.ts -g "统一画布：场景/全局运行时"
  git diff --check -- tests/e2e/editor.spec.ts
  ```
  工作目录：产品 worktree。Windows PowerShell。未跑 pretest（沿用 R8-F-RECHECK-2 的 `dist-*`，只改 spec）。未抢 `:5173`（仍为 PID 19296）。`--user-data-dir` 用 spec 已有 `electron-profile-${pid}`。未跑全量 `test:e2e` / `verify` / typecheck / `npm test` / `build:desktop`。未另开手工 App。
- validation result: Playwright 1.61.1。**1 passed（56.9s / 报告 58.0s）**。`git diff --check` 无输出、exit 0。Electron 槽已释放。`:5173` 仍为同一 PID。
- validation entry / fixture / backend:
  - entry: Electron 编辑器（spec `launchEditor`）
  - fixture: `beforeAll` 从 `examples/sample-project.h5lesson`（schema 8）克隆 `global-runtime-authoring.h5lesson`；导入后另存 `global-runtime-authoring-imported.h5lesson`（Course Project V9）
  - backend: 默认 Course Project V9；打开 V8 必须显式导入；未切回 V8
- validation proves / does not prove:
  - proves: 打开该 V8 夹具会出现导入对话框并完整确认；确认后可进全局层、原位改运行时文字/图片；另存文件 `schemaVersion === 9`，`locations[0].kind === 'slide-scene'`，slide `surfaces`，全局/场景 `kind: 'runtime'` 的 `content.values.title` 与替换后 `assetFiles` 字节都在；再打开该 V9 路径无导入对话框
  - does not prove: 全量 `npm run test:e2e`（留给下一轮 R8-F-RECHECK）；同文件其余 serial 条
- narrow UI smoke, if authorized: 未授权手工窗口。本任务只跑上列定向 Playwright。
- INTEGRATION_REQUESTS:
  ```
  INTEGRATION_REQUEST
  - requester task: R8-FIX-E2E-IMPORT
  - target stage integrator: 协调者（账本 / 下一轮 R8-F-RECHECK）
  - id: R8F-IMPORT-01
  - target hotspot file: artifacts/FINAL_GATE_REPORT.md 行 R8F-IMPORT-01
  - exported symbol / callback: n/a（仅 spec 跟切）
  - required user-visible behavior: 打开 V8 仍须显式导入；不得静默打开
  - focused test proving lane side: editor.spec「统一画布：场景/全局运行时」1 绿
  - exact wiring requested: 将 R8F-IMPORT-01 标为 implemented；全量 e2e 由下一轮 R8-F-RECHECK 关闭为 verified。不要领取 R8-G。
  - risk if omitted: 协调者仍按 modal-backdrop 首错分类这条
  - status: implemented
  ```
- DECISION_REQUESTS: 无。
- remaining risks / untested full checks:
  - 未跑：全量 `npm run test:e2e`、`typecheck`、`npm test`、`build:desktop`、三视口、17 项体验、`verify`
  - 同文件其余仍 `打开工程` 的用例：新建空白 V9 / 本会话已保存 V9 的重开 **没有**误点导入。本文件仅此一处 `sample-project` schema 8 克隆。
  - 后续 serial 可能红：`Runtime API 2 / Component API 4 导出` 仍用 `projectDocumentSchema`（V8）去 parse 上一刀保存的 V9 `globalComponentProjectPath`，再写成 schema 8 再打开。本任务未改那条（不是 sample-project 克隆）。若全量停在那里，下一刀应跟切该夹具为 V9 + 显式导入，不要静默打开。
  - 现有 e2e 仍没有 Flow / Spatial / Mixed / 七组合 / V8 导入拒绝 / DOCX 规格。本任务不为缺口新建 spec
  - 未领取 R8-G
- rollback point: 产品 HEAD 仍为 `f27275658c6dfaa12f2ce35cd9368dcdebe99451`。回退本 lane：还原 `tests/e2e/editor.spec.ts`。未改产品源码。
- execution state: `lane_candidate`
- integration state: `pending`（定向 e2e 绿；全量 e2e 待下一轮 R8-F-RECHECK）
- quality state: `unverified`

禁止用语核对：未写 `art candidate` / `accepted`；未把本任务标成项目级 `engineering candidate`；未领取 R8-G。
