HANDOFF
- task: R8-FIX-CATALOG-PPTX
- planning pack path: `C:\Users\74755\Documents\HTML课件编辑器\docs\tasks\v8-to-v9-rebuild`
- product worktree / branch / baseline SHA: `C:\Users\74755\Documents\HTML课件编辑器-v8-to-v9-rebuild` / `codex/v8-to-v9-rebuild` / `f27275658c6dfaa12f2ce35cd9368dcdebe99451`
- outcome: 纯 Slide `buildPptx` 在互动组件快照成功、`warnings` 为空时补教师可见「静态导出提示」横幅（objectName `导出差异说明`，**不是** `静态导出警告`）。未撤回组件快照，未回滚 R8-FIX-E2E-EXPORT 夹具/切流。未改 catalog spec。未预修简洁模式 `:886`。定向「目录 UI」**1 passed（3.0m）**。`runtimeExport.test.ts` 10 passed。未 commit。未领取 R8-G。定向绿 → `lane_candidate`。不是 art/accepted。不是项目级 engineering candidate。不要把 `R8F-RUNTIME-EXPORT-01` 标 verified。
- owned files changed (product worktree):
  - `src/renderer/export/buildPptx.ts`（`sceneHasVisibleExternalComponent` / `addSuccessfulComponentStaticHint`；scene 循环在 `addPptxWarnings` 之后、无警告且有可见 external-component 时写提示）
  计划侧：本 HANDOFF；`00_INDEX.md` 本行。
  **未改**：`tests/e2e/componentCatalogMatrix.spec.ts`、`editor.spec.ts`、`App.tsx` handleExportPptx 切流。
- donor files/functions consulted:
  - [`handoffs/R8-F-RECHECK-8.md`](R8-F-RECHECK-8.md) `:815` 缺「静态导出提示」
  - `buildCoursePptx.addWarningNote`（`静态导出提示：` + objectName `导出差异说明`）
  - 现有 `addPptxWarnings`（失败路径仍用 objectName `静态导出警告`）
- donor 舍弃部分:
  - 回滚 EXPORT 的纯 Slide `buildPptx` 切流
  - 删 catalog `"静态导出提示"` 断言 / skip
  - 成功路径也写 objectName `静态导出警告`（会打红导出条 `not.toContain('静态导出警告')`）
  - 预修简洁模式 alpha
- focused validation command:
  ```
  npx vitest run tests/unit/runtimeExport.test.ts
  npm run build:renderer
  npx playwright test tests/e2e/componentCatalogMatrix.spec.ts -g "目录 UI"
  git diff --check -- src/renderer/export/buildPptx.ts
  ```
  工作目录：产品 worktree。Windows PowerShell。`VITE_DEV_SERVER_URL` unset。未跑全量 e2e / `verify` / typecheck / `build:desktop`。未另开手工 App。
- validation result:

  | # | 命令 | exit | 结果 |
  |---|---|---:|---|
  | 1 | `npx vitest run tests/unit/runtimeExport.test.ts` | 0 | **1 file / 10 tests passed**；26.96s |
  | 2 | `npm run build:renderer` | 0 | vite 2.63s |
  | 3 | Playwright `-g "目录 UI"` | 0 | **1 passed（3.0m）**；原 `:815` 已过 |
  | 4 | `git diff --check -- src/renderer/export/buildPptx.ts` | 0 | 无输出 |

  Electron 槽已释放。
- validation entry / fixture / backend:
  - entry: Electron 编辑器目录 UI → `export-pptx` → `buildPptx`
  - fixture: pretest 已有 component-catalog 矩阵（本刀未重跑 pretest）
  - backend: 默认 Course Project V9；纯 Slide 仍走 EXPORT 的 `buildPptx`
- validation proves / does not prove:
  - proves: 目录 UI PPTX 每页含「互动组件」与「静态导出提示」；失败路径 unit 仍含 objectName `静态导出警告`
  - does not prove: 全量 `npm run test:e2e`；简洁模式 `:886`；Runtime/Component 导出全量；typecheck
- narrow UI smoke, if authorized: 未授权手工窗口。
- INTEGRATION_REQUESTS:
  ```
  INTEGRATION_REQUEST
  - requester task: R8-FIX-CATALOG-PPTX
  - target stage integrator: 协调者（账本 / 下一轮 R8-F-RECHECK）
  - id: R8F-CATALOG-PPTX-01
  - target hotspot file: artifacts/FINAL_GATE_REPORT.md 行 R8F-CATALOG-PPTX-01
  - exported symbol / callback: buildPptx.addSuccessfulComponentStaticHint
  - required user-visible behavior: 互动组件静态快照成功时 PPTX 仍有「静态导出提示」；失败横幅仍用「静态导出警告」
  - focused test proving lane side: componentCatalogMatrix「目录 UI」1 绿
  - exact wiring requested: 将 R8F-CATALOG-PPTX-01 标为 implemented；全量 e2e 由下一轮 R8-F-RECHECK 关闭。不要领取 R8-G。不要把 R8F-RUNTIME-EXPORT-01 标 verified（RECHECK-8 未跑导出条）。
  - risk if omitted: 协调者仍按 :815 缺提示分类这条
  - status: implemented
  ```
- DECISION_REQUESTS: 无。
- remaining risks / untested full checks:
  - 未跑全量 e2e。RECHECK-8 第二条「简洁模式」`:886` alpha 有证据，**本刀未修**，下一轮全量可能仍红
  - Runtime/Component 导出全量未跑
  - 未领取 R8-G
- rollback point: 产品 HEAD 仍为 `f27275658c6dfaa12f2ce35cd9368dcdebe99451`。回退本 lane：还原 `src/renderer/export/buildPptx.ts` 本刀新增 hint。不要回滚 EXPORT。
- execution state: `lane_candidate`
- integration state: `pending`
- quality state: `unverified`

禁止用语核对：未写 `art candidate` / `accepted`；未把本任务标成项目级 `engineering candidate`；未领取 R8-G。
