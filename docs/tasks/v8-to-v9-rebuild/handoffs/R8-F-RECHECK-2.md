HANDOFF
- task: R8-F-RECHECK-2
- planning pack path: `C:\Users\74755\Documents\HTML课件编辑器\docs\tasks\v8-to-v9-rebuild`
- product worktree / branch / baseline SHA: `C:\Users\74755\Documents\HTML课件编辑器-v8-to-v9-rebuild` / `codex/v8-to-v9-rebuild` / `f27275658c6dfaa12f2ce35cd9368dcdebe99451`
- outcome: 只在产品 worktree 运行一次 `npm run test:e2e`（含 `pretest:e2e`）。**exit 1。** 墙钟 **392594 ms**（`00:06:32.594`）。Playwright：**7 passed / 1 failed / 0 skipped / 19 did not run**（27 条，1 worker）。上一轮红的「Player 与编辑交互层」本轮全量绿（58.3s）。FIX-E2E 三条（目录 UI、简洁模式试运行、CoursePlayer 宿主）全量仍绿。新红在 `editor.spec.ts` serial 第 7 条「统一画布：场景/全局运行时文字与图片可原位编辑并往返」，其后 19 条未跑。未改任何产品源码/测试。未 skip。未 commit。未另跑 `build:desktop` / `npm test` / typecheck / `verify`。未领取 R8-G/H/Z。未宣称 art/accepted，未宣称项目级 engineering candidate。Electron 槽已释放。
- owned files changed:
  - 产品 worktree 源码：无（只读）
  - 产品 worktree 生成：`pretest:e2e` 刷新 `dist-*` / examples / fixtures（未 commit）；失败附件在默认 `test-results/`（未 commit）
  - 计划侧：本 HANDOFF；`00_INDEX.md` 本行状态
- donor files/functions consulted:
  - [`handoffs/R8-F-RECHECK.md`](R8-F-RECHECK.md)、[`handoffs/R8-FIX-SELECT-TAB.md`](R8-FIX-SELECT-TAB.md)、[`handoffs/R8-FIX-SCENE-LAYER.md`](R8-FIX-SCENE-LAYER.md)、[`handoffs/R8-FIX-AUTHORING-MODAL.md`](R8-FIX-AUTHORING-MODAL.md)
  - `10_R8_FINAL_FULL_GATE.md` §11.6
  - 产品 `package.json` `"test:e2e"`；`playwright.config.ts` `workers: 1`
  - 只读定位：`tests/e2e/editor.spec.ts:1047` 打开 `examples/sample-project.h5lesson` 克隆；`App.tsx` `v8ImportPending` ConfirmDialog（`需要显式导入旧版工程` / `导入为当前课程工程`）+ `CopyableSummaryDialog`（`旧版工程导入报告` / `完成`）；catalog 已有 `confirmLegacyCourseImport`
- focused validation command:
  ```
  npm run test:e2e
  ```
  工作目录：产品 worktree。Windows PowerShell。未再单独跑 `build:desktop`。未合成 `verify`。未另开手工 App。未抢 `:5173`。e2e 使用 spec 内临时 `--user-data-dir`。
- validation result: **blocked。** `NPM_TEST_E2E_EXIT:1`。`NPM_TEST_E2E_MS:392594`（`00:06:32.594`）。Playwright 摘要：`1 failed` / `19 did not run` / `7 passed (6.3m)`。Playwright **1.61.1**。

  ### 开始前环境（产品 worktree，跑命令前）

  | 项 | 值 |
  |---|---|
  | `git branch --show-current` | `codex/v8-to-v9-rebuild` |
  | `git rev-parse HEAD` | `f27275658c6dfaa12f2ce35cd9368dcdebe99451` |
  | `node --version` | `v24.14.0` |
  | `npm --version` | `11.9.0` |
  | `git status --short` | 脏树未提交 R6–R8 改动，含 FIX-E2E / SELECT-TAB / SCENE-LAYER。本任务未触碰源码/测试。 |
  | Electron 槽 | 无 `electron.exe`。未另开手工 App。跑完后仍无。 |
  | `:5173` | `127.0.0.1:5173` LISTENING PID **19296**（产品 worktree 残留 Vite）。本任务未杀、未占用。跑完后仍为同一 PID。连入方是 Cursor PID 5184，不是手工 App。 |
  | `:5174` / `:5175` | 空闲。 |

  ### 命令结果

  | # | 段 | 是否到达 | exit | 耗时 | 首个错误 |
  |---|---|---|---|---|---|
  | pretest | `build:player` → examples → lesson-demo → render-benchmark → catalog-matrix → `build:renderer` → `build:electron` | **是** | 链式继续 | 含在墙钟内；player Vite **1.44s**；renderer Vite **3.05s** | 无。仅 WARN：player `inlineDynamicImports`；renderer chunk > 500 kB |
  | 整条 | `npm run test:e2e` | 是 | **1** | **392594 ms** | 见下表一条失败 |
  | Playwright | `Running 27 tests using 1 worker` | 是 | 1 | 报告 **6.3m** | 1 failed |

  | 计数 | 值 |
  |---|---|
  | passed | **7** |
  | failed | **1** |
  | skipped（`test.skip` 命中） | **0** |
  | did not run | **19**（`editor.spec.ts` `test.describe.serial`：第 7 条失败后同 describe 剩余未执行；`render-host-benchmark` 在另一文件仍跑完） |
  | 合计 | **27** |

  绿的 7 条：

  1. `componentCatalogMatrix.spec.ts` › 生成物的单 HTML 与网页包离线运行…（16.2s）
  2. `componentCatalogMatrix.spec.ts` › **目录 UI** 按需嵌入、编辑/重开/缩略图/Player，并真实导出…（**2.8m**）← FIX-E2E 原失败，全量仍绿
  3. `editor.spec.ts` › **简洁模式完成文字**、透明度、左起竖排与出现动画试运行（33.0s）← FIX-E2E 原失败，全量仍绿
  4. `editor.spec.ts` › 专业模式创建、复制、排序规则并修改受控运行时（25.5s）
  5. `editor.spec.ts` › **当前位置试运行：CoursePlayer 宿主**可见且可互动（21.8s）← FIX-E2E 定向绿，全量仍绿
  6. `editor.spec.ts` › **Player 与编辑交互层**在 100%、150% 和重置后保持同位（**58.3s**）← R8-F-RECHECK 原失败；SELECT-TAB 后**本轮全量绿**
  7. `render-host-benchmark.spec.ts` › Project V8 五种渲染路径可离线互动…（18.8s）

  「流程 1」「流程 3」因 serial 中止 **本轮未跑到**（SCENE-LAYER 定向绿不能外推到全量）。「流程 9」同样未跑到。

- validation entry / fixture / backend:
  - entry: 仓库默认 `playwright test`（`tests/e2e/` 三个 spec）
  - fixture: pretest 生成 photosynthesis lesson、render-host-benchmark HTML、component-catalog V8 矩阵；editor `beforeAll` 从 `examples/sample-project.h5lesson`（**schemaVersion 8**）克隆 `global-runtime-authoring.h5lesson`；其余 editor 自建临时 `.h5lesson` / Electron `--user-data-dir`
  - backend: 成熟 V8 App 表面 + Course Project V9 默认真相（CUT 后）；打开 V8 必须显式导入；catalog/render-host 夹具仍是 Project V8 离线物
- validation proves / does not prove:
  - proves: 当前脏树上 **一次** `npm run test:e2e` 跑完且 **exit 1**；SELECT-TAB 的交互层同位在全量里绿；FIX-E2E 三条原失败全量仍绿；新失败标题与首错如下
  - does not prove: 未执行的 19 条 editor 路径、三视口、17 项体验、typecheck、Vitest、教师验收。自动化不得宣称 art/accepted，也不得宣称项目级 engineering candidate。
- narrow UI smoke, if authorized: 未授权。未另开手工窗口。本任务就是全量现有 e2e。
- INTEGRATION_REQUESTS: 无。本任务不写源码。失败回派见下。
- DECISION_REQUESTS: 无。
- remaining risks / untested full checks:
  - 未跑：`check:ai-capabilities`、`typecheck`、`npm test`、三视口、17 项体验、`npm run verify` / `verify:full`、`build:desktop`（本任务禁止再跑）
  - `editor.spec.ts` 19 条因 serial 中止未跑
  - 任务卡点名、本轮 **没有新证据** 的后续：整课预览 overlay、漏改 `add-scene`、未 filter 控制器的 `.node-item`。只读核对见下「已知风险本轮未踩到」
  - 现有 e2e **没有** Flow / Spatial / Mixed / 七组合 / V8 显式导入拒绝 / DOCX 规格。本任务不为缺口新建 spec
  - 未领取 R8-G
- rollback point: 产品 HEAD 仍为 `f27275658c6dfaa12f2ce35cd9368dcdebe99451`。R8-F-RECHECK-2 无产品源码改动可回滚。`test-results/` 与 `dist-*` 未 commit。
- execution state: `blocked`
- integration state: `n/a`
- quality state: `unverified`

## 失败 spec（标题 + 首错）

### 1. `tests/e2e/editor.spec.ts:1047`

**标题：** 互动课件编辑器 1.0 / Project V8 收敛 › 统一画布：场景/全局运行时文字与图片可原位编辑并往返

**耗时：** 35.7s

**首错：**

```
TimeoutError: locator.click: Timeout 30000ms exceeded.
Call log:
  - waiting for getByTestId('global-layer-entry')
    - locator resolved to <button … class="global-layer-entry" data-testid="global-layer-entry">
  - attempting click action
    - <div role="presentation" class="modal-backdrop">…</div> intercepts pointer events
at tests/e2e/editor.spec.ts:1055
```

测试已过：`launchEditor`、`patchDialogs` 把打开路径指到 `global-runtime-authoring.h5lesson`、点「打开工程（Ctrl+O）」。失败在立刻点 `global-layer-entry`：按钮已在 DOM，被 `modal-backdrop` 挡住。

**只读定位：** `beforeAll` 把 pretest 生成的 `examples/sample-project.h5lesson` 解包改 runtime 后写回夹具。该示例 **`schemaVersion: 8`**。CUT 后 `App.tsx` 打开 V8 会挂 `v8ImportPending`，渲染 `ConfirmDialog`（`title="需要显式导入旧版工程"`，`confirmLabel="导入为当前课程工程"`，外层 `class="modal-backdrop"`）。确认后还有 `CopyableSummaryDialog`（`旧版工程导入报告` / `完成`），同样是 `modal-backdrop`。`editor.spec.ts` **没有** catalog 已有的 `confirmLegacyCourseImport`。产品拒绝静默打开 V8 是合同，不是回归。

同一条后半仍读 V8 形状 `project.scenes?.[0]?.runtime` / `project.globalRuntime`。若只关对话框不跟切保存断言，同一测试会二次红。

**窄复跑（owner 用，不要全量 e2e）：**

```
npx playwright test tests/e2e/editor.spec.ts -g "统一画布：场景/全局运行时"
```

**附件（未 commit）：**

- `test-results/editor-互动课件编辑器-1-0-Project-V8-收敛-统一画布：场景-全局运行时文字与图片可原位编辑并往返/error-context.md`
- 同目录 `trace.zip`

因 `test.describe.serial`，本失败还导致同文件其余 19 条 **did not run**（流程 1–9、全局层、全局组件、控制器预览、媒体/图片、导出、课例验收）。

## 已知风险本轮未踩到（不要当本轮实锤）

任务卡点名三项。本轮因 serial 停在第 7 条，**没有新失败证据**。只读核对现状，供协调者避免重开已跟切的刀：

| 风险 | 本轮证据 | 只读现状 |
|---|---|---|
| 整课预览 overlay | **未跑**（流程 4 / 全局层 / 全局组件 / 控制器预览 / 8B 均 did not run） | spec 已有 `openCoursePreviewOverlay`（`course-preview-overlay` / `course-preview-host`）；`getByTestId('add-scene')` 与 `waitForEvent('window')` 在 `editor.spec.ts` 为 **0** 命中 |
| `getByTestId('add-scene')` 漏改 | **未跑到**流程 1 等 | 现有点击已是 `add-content-primary` |
| `.node-item` 未 filter 控制器 | **未跑到**流程 3 | 已有 `authoredLayerRows` / `teacherControllerLayerRows`；余下 `toHaveCount(4/2/5/2)` 同时断言控制器 1 条，像是含控制器的总数 |

不要因为本轮没跑到就重开 SELECT-TAB / SCENE-LAYER / FIX-E2E。

## 建议下一刀（按文件；本任务不修）

本轮只证明了 **一条** 新失败。协调者按文件派，只跑窄 Playwright。

### A. 本轮实锤 — `editor.spec.ts`「统一画布」V8 显式导入

| 文件 | 建议 |
|---|---|
| `tests/e2e/editor.spec.ts` | 打开 `globalRuntimeAuthoringProjectPath`（及任何仍从 sample-project / schema 8 来的夹具）之后，复用 catalog 的 `confirmLegacyCourseImport`：等 `alertdialog`「需要显式导入旧版工程」→「导入为当前课程工程」→ 关「旧版工程导入报告」「完成」。同一条保存断言从 `scenes[].runtime` / `globalRuntime` 跟切到 V9 locations/surfaces。 |
| `tests/e2e/componentCatalogMatrix.spec.ts` | 只读抄 `confirmLegacyCourseImport`；不要改 catalog。 |
| `src/renderer/App.tsx` | **不要**为绿去掉 `v8ImportPending` 或静默导入 V8。 |

不要为绿 skip。不要把产品 testid 退回 `add-scene`。不要退回独立预览窗。不要重开交互层 / 目录 UI / 简洁模式 / CoursePlayer。

### B. 未跑、可能下一红（本轮无新证据）

仍在 **`tests/e2e/editor.spec.ts`** serial 第 8–26 条。优先等 A 清零后再全量。若 A 过后下一条红，再按失败标题派，不要预修。

流程 1 / 流程 3 的 SCENE-LAYER 定向绿 **不能**代替全量。

## 给协调者

1. R8-F-RECHECK-2 唯一授权命令 **exit 1**，状态 **`blocked`**。不要领取 R8-G。
2. SELECT-TAB 的「Player 与编辑交互层」全量已绿；FIX-E2E 三条全量仍绿。不要重开那些刀。
3. 先回派 **A**（统一画布打开 V8 后确认导入 + 保存断言跟切 V9）。清零后再全量 `npm run test:e2e`。
4. 禁止为绿而 skip / 放宽未授权断言 / 新建 §5 spec / 静默打开 V8。
5. 不要宣称项目级 engineering candidate（留给 R8-Z 在机器全绿后写）。

## 未跑集合（R8-F-RECHECK-2 授权外）

- `check:ai-capabilities` / `typecheck`（R8-C）
- `npm test`（R8-D）
- `build:desktop`（R8-E 已交；本任务 pretest 自己构建了 player/renderer/electron，未再跑 `build:desktop`）
- 三视口视觉（R8-G）— **未领取**
- 17 项真实体验（R8-H）
- `npm run verify` / `verify:full` / `npm run build`
- 未写 `artifacts/FINAL_GATE_REPORT.md`（R8-Z）

R8-F-RECHECK-2 不领取 R8-G。quality 保持 `unverified`。禁止 art/accepted。禁止项目级 engineering candidate。
