HANDOFF
- task: R8-D-RECHECK
- planning pack path: `C:\Users\74755\Documents\HTML课件编辑器\docs\tasks\v8-to-v9-rebuild`
- product worktree / branch / baseline SHA: `C:\Users\74755\Documents\HTML课件编辑器-v8-to-v9-rebuild` / `codex/v8-to-v9-rebuild` / `f27275658c6dfaa12f2ce35cd9368dcdebe99451`
- outcome: Wave 8a 全量 Vitest **仍未绿**。只在产品 worktree 运行一次 `npm test`（`vitest run`）。未改任何产品源码或测试，未 commit，未领取 R8-E，未跑 `npm run verify` / typecheck / build / `test:e2e`。未把失败改成跳过。相对初跑 R8-D（187 文件 / 1107 测试，29 文件 / 77 测试红）已大幅收敛；本轮 **189 文件 / 1118 测试，2 文件 / 2 测试红**。
- owned files changed:
  - 产品 worktree：无（只读；`npm test` 未留下需提交的产品 diff）
  - 计划侧：本 HANDOFF；`00_INDEX.md` 本行状态
- donor files/functions consulted:
  - `10_R8_FINAL_FULL_GATE.md` §11.5
  - `00_INDEX.md`、`01_SHARED_EXECUTION_CONTRACT.md`
  - [`handoffs/R8-D.md`](R8-D.md)、[`handoffs/R8-D-TRIAGE.md`](R8-D-TRIAGE.md)
  - [`handoffs/R8-FIX-CUT-TESTS.md`](R8-FIX-CUT-TESTS.md)、[`handoffs/R8-FIX-R6-TESTID.md`](R8-FIX-R6-TESTID.md)、[`handoffs/R8-FIX-STORE.md`](R8-FIX-STORE.md)、[`handoffs/R8-FIX-STORE-REST.md`](R8-FIX-STORE-REST.md)
  - 产品 `package.json` `"test": "vitest run"`
  - 只读定位：`editorStore.deleteScene`、`runV9DocumentMutation`、`deleteSlideScene`（`课件至少需要一张幻灯片`）、`scripts/run-courseware-authoring.ts` `exportHtml`、`App.tsx` `v8ImportPending` ConfirmDialog
- focused validation command:
  ```
  npm test
  ```
  工作目录：产品 worktree。Windows PowerShell。未加 `--watch`。未跑 typecheck / build / e2e / `npm run verify` / `build:desktop`。未额外开 Electron 窗口（`coursewareAuthoringRunner` 单测自己 spawn 的除外）。
- validation result: **blocked。** Vitest v4.1.10。exit code **1**。

  | 项 | 初跑 R8-D | 本轮 R8-D-RECHECK |
  |---|---:|---:|
  | 通过的文件 | 158 | **187** |
  | 失败的文件 | 29 | **2** |
  | 文件合计 | 187 | **189** |
  | 通过的测试 | 1030 | **1116** |
  | 失败的测试 | 77 | **2** |
  | 测试合计 | 1107 | **1118** |
  | Duration | 69.12s | **66.05s** |
  | Start at | 22:06:07 | **23:38:45** |
  | Vitest exit | 终端 footer 曾记 0（仍按红处理） | **1**（与 2 failed 一致） |

  文件合计 +2、测试合计 +11：相对初跑新增了测试文件（含 R8-B `tests/unit/scenePanelReorder.test.tsx` 等），本任务未清点每一个新增文件名。新增文件未出现在失败表中。

- preflight (开始前，产品 worktree):
  - `git branch --show-current`: `codex/v8-to-v9-rebuild`
  - `git rev-parse HEAD`: `f27275658c6dfaa12f2ce35cd9368dcdebe99451`
  - `node --version`: `v24.14.0`
  - `npm --version`: `11.9.0`
  - `git status --short`: 脏树约 144 行未提交 R6–R8 改动（含 `editorStore.ts`、`ScenePanel.tsx`、`Workspace.tsx` 等）。本任务未触碰。`tests/unit/editorStore.test.ts` 在跑测前已有他 lane 未提交 diff（本任务未改该文件）。

- validation entry / fixture / backend:
  - entry: 仓库默认 `vitest run`（unit + integration；含 Agent Kit / V8 技能测试）
  - fixture: 各测试自带；authoring runner 夹具仍用 `createProjectArchive` 写 V8 `.h5lesson`
  - backend: 成熟 V8 App + Course Project V9 candidate（CUT 后默认 `v9-slide-candidate`）
- validation proves / does not prove:
  - proves: 当前脏树上全量 Vitest 跑完；CUT-TESTS / R6-TESTID / STORE 优先 6 / STORE-REST 余力 6 / 顺手 3 文件在全量中保持绿；初跑 29 红文件中 **28 已绿**；下表 2 文件仍红。
  - does not prove: typecheck（并行 R8-C-RECHECK-2）、desktop build、Playwright 产品 e2e、三视口、17 项体验、教师验收。自动化不得宣称 art/accepted，也不得宣称项目级 engineering candidate。
- narrow UI smoke, if authorized: 未授权。未做。
- INTEGRATION_REQUESTS: 无（Gate 只记录回派，不接线）。
- DECISION_REQUESTS: 无。
- remaining risks / untested full checks:
  - 未跑：`npm run check:ai-capabilities`、`npm run typecheck`、`npm run build` / `build:desktop`、`npm run test:e2e`、三视口视觉、17 项体验、`npm run verify`。
  - `coursewareAuthoringRunner` 本轮自己 spawn 了 Electron（该文件 48796ms）；占用结束后本任务未另开窗口。
- rollback point: 产品 HEAD 仍为 `f27275658c6dfaa12f2ce35cd9368dcdebe99451`；R8-D-RECHECK 无产品改动可回滚。
- execution state: `blocked`
- integration state: `n/a`
- quality state: `unverified`

## 失败文件完整列表（2）

| 路径 | 失败条数 | 文件内测试数 | 首条断言摘要 |
|---|---:|---:|---|
| `tests/unit/editorStore.test.ts` | **1** | 62（1 failed） | `scene operations > never deletes the final scene and does not create a no-op history entry` — `expect(history.past).toHaveLength(0)`：**expected 0, received 1**（`deleteScene` 返回 `false`、scenes 仍为 1，但写入了一条 past）。`editorStore.test.ts:165` |
| `tests/unit/coursewareAuthoringRunner.test.ts` | **1** | 3（1 failed） | `trusted courseware authoring runner > runs a real native text Editor round trip from an external cwd and rejects a forged receipt` — `locator.click: Timeout 30000ms exceeded`；`getByTestId('export-menu-trigger')` 已解析，被 `<div role="presentation" class="modal-backdrop">` 拦截。该用例 43841ms |

## 初跑点名的 3 个 STORE-REST 未修候选

| 文件 | 本轮 |
|---|---|
| `tests/unit/coursewareAuthoringRunner.test.ts` | **仍红 1/3。** 初跑两条红：`rejects output aliases…`（当时 5000ms timeout）**已绿**；`runs a real native text Editor round trip…` **仍红**（同一 `modal-backdrop` 挡 `export-menu-trigger`）。第 3 条 `canonicalizes only format-owned timestamps…` 绿。 |
| `tests/unit/projectV8CoursewareSkill.test.ts` | **全绿**（不在失败表；初跑 5000ms timeout 已消失） |
| `tests/unit/projectV8CoursewareEndToEnd.test.ts` | **全绿**（不在失败表；初跑 `Capability evidence is stale` 已消失，与 R8-FIX-CAP 一致） |

## 仍红分簇（回派）

### 簇 1 — STORE / `deleteScene` 末场景仍写 history（**新红**，初跑 29 文件里没有）

- 文件：`tests/unit/editorStore.test.ts`（1）
- 建议 owner：**R8-FIX-STORE-LASTSCENE**（或 STORE 第三刀）。独占 `src/renderer/store/editorStore.ts` 的 `deleteScene`。
- 只读定位：V8 路径是 `if (state.project.scenes.length <= 1) return false` 且不 `commit`。V9 路径先无条件 `runV9DocumentMutation`（改 global `include` visibility），再 `persistCandidateResult(live.deleteScene(…))`。`deleteSlideScene` 在 `surface.scenes.length <= 1` 时抛 `课件至少需要一张幻灯片`，所以场景没删掉、返回 `false`，但前面的 mutation 已经 `historyEntry: true`。
- 授权建议：只改 `deleteScene` 早退（末场景 / 找不到 id 时不要 `runV9DocumentMutation`）。不要把默认 backend 改回 V8；不要重写 `activateCourseLocation`；不要碰 `Workspace.tsx` / `App.tsx` / 课树拖排。
- 定向验证：`npx vitest run tests/unit/editorStore.test.ts`。禁止全量 `npm test` / `verify`。不要为绿而跳过该断言。

### 簇 2 — Authoring runner Electron：`modal-backdrop` 挡导出（初跑同因，范围已缩小）

- 文件：`tests/unit/coursewareAuthoringRunner.test.ts`（1）
- 建议 owner：**R8-FIX-AUTHORING-MODAL**。需要 **Electron 槽**（与 R8-E/F/G/H 互斥）。不改测试期望、不 `force` click、不 skip。
- 只读定位：runner `openProject` 点「打开工程」后只等 `[data-testid="canvas-stage"] canvas`；夹具是 `createProjectArchive` 的 **V8** `.h5lesson`。CUT 后打开 V8 会弹出 `v8ImportPending` ConfirmDialog（`class="modal-backdrop"`）。默认新建 V9 画布可能已经 visible，runner 不会点「导入为当前课程工程」，随后 `exportHtml` 点 `export-menu-trigger` 被挡。此为假设，修复者应先确认对话框文案，再选最短刀：runner 确认显式导入，或夹具改为当前 V9 包。不要把产品切回默默打开 V8。
- 定向验证：`npx vitest run tests/unit/coursewareAuthoringRunner.test.ts`（该文件会 spawn Electron）。禁止 `npm run verify`。

## 建议下一刀（给协调者）

1. **先派簇 1**（无窗口，改 `editorStore.deleteScene` 早退）。STORE-REST 已释 `editorStore` 锁。
2. **并行或随后派簇 2**（占 Electron；等 A 槽空闲，不要和 R8-E 重叠）。
3. 两刀 HANDOFF 后 **再派一次 R8-D-RECHECK-2** 全量 `npm test`。未全绿前不要领 R8-E。
4. 不要回派 R8-B / R6-TESTID / CUT-TESTS / CAP：对应初跑红文件本轮全绿。不要把失败改成 skip。

## 初跑 29 红文件本轮去向

初跑 29 个失败文件中 **28 已绿**；唯一仍红的初跑文件是 `coursewareAuthoringRunner.test.ts`（且由 2 条红收成 1 条）。**新红 1 文件**：`editorStore.test.ts`。

已绿（按初跑分簇，便于关单）：

- R2：`componentCatalogV8Matrix`、`componentTextEditSession`、`componentPackageManagement`、`designTokens`、`developerMode`、`editorFormattingUi`、`formulaNode`、`formulaNodeUi`、`imageSafeAreas`、`sceneStateUi`、`simpleEditorMode`、`textEmphasis`、`v9SlideBackendSelection`、`v9SlideProductIntegration`、`v9SlideTextTransaction`、`v9SlideViewportAdapter`
- R3：`assetTransactions`、`batchMediaAndInsertion`、`globalEditorStore`、`globalLayerUi`、`mediaTab`、`presenterSettingsUi`、`v9GlobalLayerUiAdapter`、`v9MediaTabAdapter`
- R6：`flowProductIntegration`
- R7：`recoveryWriteCoordinator`、`projectV8CoursewareEndToEnd`、`projectV8CoursewareSkill`
- R4 / R5 / R8-B：初跑无失败文件；本轮仍无这些簇的失败。`scenePanelReorder` 未出现在失败表。

## 未跑集合（R8-D-RECHECK 授权外）

- typecheck / `check:ai-capabilities`（R8-C / R8-C-RECHECK-2）
- `build` / `build:desktop`（R8-E）
- `test:e2e` / Playwright 产品路径（R8-F）
- 三视口视觉（R8-G）
- 17 项真实体验（R8-H）
- `npm run verify` / `verify:full`（任何 R8 子任务均禁止）
- 未写 `artifacts/FINAL_GATE_REPORT.md`（R8-Z）

R8-D-RECHECK 不领取 R8-E。机器全绿才能进入项目级 `engineering candidate`；本任务不是。quality 保持 `unverified`。禁止 art/accepted。
