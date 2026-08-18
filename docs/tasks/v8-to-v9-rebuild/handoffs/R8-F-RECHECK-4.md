HANDOFF
- task: R8-F-RECHECK-4
- planning pack path: `C:\Users\74755\Documents\HTML课件编辑器\docs\tasks\v8-to-v9-rebuild`
- product worktree / branch / baseline SHA: `C:\Users\74755\Documents\HTML课件编辑器-v8-to-v9-rebuild` / `codex/v8-to-v9-rebuild` / `f27275658c6dfaa12f2ce35cd9368dcdebe99451`
- outcome: 只在产品 worktree 运行一次 `npm run test:e2e`（含 `pretest:e2e`）。**exit 1。** 墙钟 **593913 ms**（`00:09:53.913`）。Playwright：**13 passed / 1 failed / 0 skipped / 13 did not run**（27 条，1 worker）。R8-FIX-TEXT-TXN 的「文字编辑事务」本轮全量绿（45.6s）。「P0：画布真实双击…」本轮全量绿（27.9s）。「流程 3：节点层级排序与撤销」本轮全量绿（39.5s）。FIX-E2E 三条、SELECT-TAB 交互层、SCENE-LAYER「流程 1」、IMPORT「统一画布」全量仍绿。新红在 `editor.spec.ts` serial 第 13 条「流程 4：组件导入、保存重开与预览交互」，其后 13 条未跑。IMPORT 点名的「Runtime API 2 / Component API 4 导出」与整课预览 overlay **本轮仍未跑到**，原样记录、未修。未改任何产品源码/测试。未 skip。未 commit。未另跑 `build:desktop` / `npm test` / typecheck / `verify`。未领取 R8-G/H/Z。未宣称 art/accepted，未宣称项目级 engineering candidate。Electron 槽已释放。
- owned files changed:
  - 产品 worktree 源码：无（只读）
  - 产品 worktree 生成：`pretest:e2e` 刷新 `dist-*` / examples / fixtures（未 commit）；失败附件在默认 `test-results/`（未 commit）
  - 计划侧：本 HANDOFF；`00_INDEX.md` 本行状态
- donor files/functions consulted:
  - [`handoffs/R8-F-RECHECK-3.md`](R8-F-RECHECK-3.md)、[`handoffs/R8-FIX-TEXT-TXN.md`](R8-FIX-TEXT-TXN.md)
  - `10_R8_FINAL_FULL_GATE.md` §11.6
  - 产品 `package.json` `"test:e2e"`；`playwright.config.ts` `workers: 1`
  - 只读定位：`tests/e2e/editor.spec.ts:1598` / `:1643`；`Workspace.tsx` `onDoubleClickCapture` V9 分支 vs `canvasAuthoringHitAtClientPoint` / `beginComponentTextEdit`；`CanvasPlainTextEditor.tsx`；`componentTextEditSession.ts`
- focused validation command:
  ```
  npm run test:e2e
  ```
  工作目录：产品 worktree。Windows PowerShell。`VITE_DEV_SERVER_URL` unset。未再单独跑 `build:desktop`。未合成 `verify`。未另开手工 App。未抢 `:5173`。e2e 使用 spec 内临时 `--user-data-dir`。
- validation result: **blocked。** `NPM_TEST_E2E_EXIT:1`。`NPM_TEST_E2E_MS:593913`（`00:09:53.913`）。Playwright 摘要：`1 failed` / `13 did not run` / `13 passed (9.7m)`。Playwright **1.61.1**。

  ### 开始前环境（产品 worktree，跑命令前）

  | 项 | 值 |
  |---|---|
  | `git branch --show-current` | `codex/v8-to-v9-rebuild` |
  | `git rev-parse HEAD` | `f27275658c6dfaa12f2ce35cd9368dcdebe99451` |
  | `node --version` | `v24.14.0` |
  | `npm --version` | `11.9.0` |
  | `git status --short` | 脏树未提交 R6–R8 改动，含 FIX-E2E / SELECT-TAB / SCENE-LAYER / IMPORT / TEXT-TXN。本任务未触碰源码/测试。 |
  | Electron 槽 | 无 `electron.exe`。未另开手工 App。跑完后仍无。 |
  | `:5173` | `127.0.0.1:5173` LISTENING PID **19296**（产品 worktree 残留 Vite）。本任务未杀、未占用。跑完后仍为同一 PID。 |
  | `:5174` / `:5175` | 空闲。 |

  ### 命令结果

  | # | 段 | 是否到达 | exit | 耗时 | 首个错误 |
  |---|---|---|---|---|---|
  | pretest | `build:player` → examples → lesson-demo → render-benchmark → catalog-matrix → `build:renderer` → `build:electron` | **是** | 链式继续 | 含在墙钟内；player Vite **1.41s**；renderer Vite **2.56s** | 无。仅 WARN：player `inlineDynamicImports`；renderer chunk > 500 kB |
  | 整条 | `npm run test:e2e` | 是 | **1** | **593913 ms** | 见下表一条失败 |
  | Playwright | `Running 27 tests using 1 worker` | 是 | 1 | 报告 **9.7m** | 1 failed |

  | 计数 | 值 |
  |---|---|
  | passed | **13** |
  | failed | **1** |
  | skipped（`test.skip` 命中） | **0** |
  | did not run | **13**（`editor.spec.ts` `test.describe.serial`：第 13 条失败后同 describe 剩余未执行；`render-host-benchmark` 在另一文件仍跑完） |
  | 合计 | **27** |

  绿的 13 条：

  1. `componentCatalogMatrix.spec.ts` › 生成物的单 HTML 与网页包离线运行…（6.8s）
  2. `componentCatalogMatrix.spec.ts` › **目录 UI** 按需嵌入、编辑/重开/缩略图/Player，并真实导出…（**2.9m**）← FIX-E2E，全量仍绿
  3. `editor.spec.ts` › **简洁模式完成文字**、透明度、左起竖排与出现动画试运行（37.5s）← FIX-E2E，全量仍绿
  4. `editor.spec.ts` › 专业模式创建、复制、排序规则并修改受控运行时（34.1s）
  5. `editor.spec.ts` › **当前位置试运行：CoursePlayer 宿主**可见且可互动（21.9s）← FIX-E2E，全量仍绿
  6. `editor.spec.ts` › **Player 与编辑交互层**在 100%、150% 和重置后保持同位（**53.7s**）← SELECT-TAB，全量仍绿
  7. `editor.spec.ts` › **统一画布：场景/全局运行时文字与图片可原位编辑并往返**（**50.1s**）← IMPORT，全量仍绿
  8. `editor.spec.ts` › **流程 1：场景新增、排序与删除**（9.3s）← SCENE-LAYER，全量仍绿
  9. `editor.spec.ts` › 流程 2：中文文本、位置、样式与工程往返（34.5s）
  10. `editor.spec.ts` › **文字编辑事务：resize、属性栏、切换节点、字体、IME 与撤销**（**45.6s**）← R8-F-RECHECK-3 原失败；TEXT-TXN 后**本轮全量绿**
  11. `editor.spec.ts` › **P0：画布真实双击可持续输入、失焦单次提交且 Escape 取消**（**27.9s**）← RECHECK-3 点名下一条；**本轮全量绿**
  12. `editor.spec.ts` › **流程 3：节点层级排序与撤销**（**39.5s**）← SCENE-LAYER 定向绿，**本轮全量也绿**
  13. `render-host-benchmark.spec.ts` › Project V8 五种渲染路径可离线互动…（19.1s）

- validation entry / fixture / backend:
  - entry: 仓库默认 `playwright test`（`tests/e2e/` 三个 spec）
  - fixture: pretest 生成 photosynthesis lesson、render-host-benchmark HTML、component-catalog V8 矩阵；editor `beforeAll` 从 `examples/sample-project.h5lesson`（schema 8）克隆 `global-runtime-authoring.h5lesson`；流程 4 用 `examples/sample-counter.h5component`；其余 editor 自建临时 `.h5lesson` / Electron `--user-data-dir`
  - backend: 成熟 V8 App 表面 + Course Project V9 默认真相（CUT 后）；打开 V8 必须显式导入；catalog/render-host 夹具仍是 Project V8 离线物
- validation proves / does not prove:
  - proves: 当前脏树上 **一次** `npm run test:e2e` 跑完且 **exit 1**；TEXT-TXN「文字编辑事务」全量绿；P0 双击与流程 3 全量绿；FIX-E2E 三条、SELECT-TAB 交互层、SCENE-LAYER「流程 1」、IMPORT「统一画布」全量仍绿；新失败标题与首错如下
  - does not prove: 未执行的 13 条 editor 路径、三视口、17 项体验、typecheck、Vitest、教师验收。自动化不得宣称 art/accepted，也不得宣称项目级 engineering candidate。
- narrow UI smoke, if authorized: 未授权。未另开手工窗口。本任务就是全量现有 e2e。
- INTEGRATION_REQUESTS: 无。本任务不写源码。失败回派见下。TEXT-TXN 的 `R8F-TEXT-TXN-01` 本轮全量 e2e 已绿该条，协调者可标 `verified`；本任务不改账本。
- DECISION_REQUESTS: 无。
- remaining risks / untested full checks:
  - 未跑：`check:ai-capabilities`、`typecheck`、`npm test`、三视口、17 项体验、`npm run verify` / `verify:full`、`build:desktop`（本任务禁止再跑）
  - `editor.spec.ts` 13 条因 serial 中止未跑
  - IMPORT HANDOFF 已点名、本轮 **没有新失败证据** 的后续：见下「IMPORT 点名风险本轮未踩到」
  - 现有 e2e **没有** Flow / Spatial / Mixed / 七组合 / V8 显式导入拒绝 / DOCX 规格。本任务不为缺口新建 spec
  - 未领取 R8-G
- rollback point: 产品 HEAD 仍为 `f27275658c6dfaa12f2ce35cd9368dcdebe99451`。R8-F-RECHECK-4 无产品源码改动可回滚。`test-results/` 与 `dist-*` 未 commit。
- execution state: `blocked`
- integration state: `n/a`
- quality state: `unverified`

## 失败 spec（标题 + 首错）

### 1. `tests/e2e/editor.spec.ts:1598`

**标题：** 互动课件编辑器 1.0 / Project V8 收敛 › 流程 4：组件导入、保存重开与预览交互

**耗时：** 28.1s

**首错：**

```
Error: expect(locator).toBeVisible() failed

Locator: getByTestId('canvas-plain-text-editor')
Expected: visible
Timeout: 10000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 10000ms
  - waiting for getByTestId('canvas-plain-text-editor')
at tests/e2e/editor.spec.ts:1643
```

测试已过：导入 `sample-counter`、点组件卡、图层 1 行、属性栏填「课堂积分器」/「7」、`getByRole('button', { name: '组件标题，双击编辑组件文字' })` `toHaveCount(1)`。失败在 `designPoint(470, 252)` 的 `page.mouse.dblclick` 之后：`canvas-plain-text-editor` 10s 内未出现。

失败瞬间 a11y 仍有两个 overlay 按钮（「组件标题，双击编辑组件文字」「操作提示，双击编辑组件文字」），属性栏仍是「课堂积分器」/ 初始数值 7，几何仍是 X=400 Y=220 宽=480 高=280。点 (470, 252) 落在该组件矩形内。

**只读定位：** `Workspace.tsx` `onDoubleClickCapture` 在 `slideBackendKind === 'v9-slide-candidate'` 时先 `hitTestV9SlideLayerItems(listSlideWorkspaceHitTargets(), world)`。`layerTargets` 含当前 scope 全部图层（含 component item）。命中后只对 `type === 'text' | 'formula'` 调 `beginTextEdit`，然后 **一律 `return`**，不落到后面的 `canvasAuthoringHitAtClientPoint` → `beginComponentTextEdit`。无 V9 图层命中时也是 `if (!hit) return`，同样到不了组件/Runtime overlay。

因此：原生文字 P0 双击本轮全量绿（走 V9 `beginTextEdit`）；统一画布绿是因为对 overlay 按钮 `focus` + `press('Enter')` 触发按钮 `onClick` → `beginRuntimeTextEdit` / `beginComponentTextEdit`，绕过了这条 capture。流程 4 用画布坐标 `mouse.dblclick`，被 V9 早退吞掉，`CanvasPlainTextEditor` 未挂载。

不要为绿把 spec 改成点 overlay 按钮或 `press('Enter')`。不要 skip。不要静默打开 V8。

**窄复跑（owner 用，不要全量 e2e）：**

```
npx playwright test tests/e2e/editor.spec.ts -g "流程 4：组件导入"
```

**附件（未 commit）：**

- `test-results/editor-互动课件编辑器-1-0-Project-V8-收敛-流程-4：组件导入、保存重开与预览交互/error-context.md`
- 同目录 `trace.zip`

因 `test.describe.serial`，本失败还导致同文件其余 13 条 **did not run**（V8 全局层、全局组件、Runtime/Component 导出、整课预览、流程 5–9、媒体/图片、课例验收）。

## 上一轮点名、本轮已绿（不要重开）

| 条 | 本轮证据 |
|---|---|
| 「文字编辑事务」 | **全量绿** 45.6s。不要重开 TEXT-TXN |
| 「P0：画布真实双击…」 | **全量绿** 27.9s。不要预修原生文字 overlay |
| 「流程 3：节点层级排序与撤销」 | **全量绿** 39.5s。SCENE-LAYER 定向绿已由本轮全量覆盖 |

FIX-E2E / SELECT-TAB / SCENE-LAYER「流程 1」/ IMPORT「统一画布」本轮仍绿。不要重开。

## IMPORT 点名风险本轮未踩到（不要当本轮实锤）

R8-FIX-E2E-IMPORT HANDOFF 点名两项。本轮因 serial 停在第 13 条，**没有新失败证据**。原样记录：

| 风险 | 本轮证据 | 只读现状 |
|---|---|---|
| `Runtime API 2 / Component API 4 导出` 仍可能用 `projectDocumentSchema`（V8）去 parse 上一刀保存的 V9 `globalComponentProjectPath`，再写成 schema 8 再打开 | **未跑**（serial 第 16 条 did not run） | IMPORT 未改那条。若下一轮全量停在那里，跟切该夹具为 V9 + 显式导入，不要静默打开 |
| 整课预览 overlay（spec 已有 helper，serial 后半未跑过） | **未跑**（「整课预览：后台教师控制器…」did not run） | spec 已有 `openCoursePreviewOverlay`（`course-preview-overlay` / `course-preview-host`） |

不要因为本轮没跑到就重开 FIX-E2E / SELECT-TAB / SCENE-LAYER / IMPORT / TEXT-TXN。

## 建议下一刀（按文件；本任务不修）

本轮只证明了 **一条** 新失败。协调者按文件派，只跑窄 Playwright。

### A. 本轮实锤 — `editor.spec.ts`「流程 4」画布双击打不开组件文字编辑器

| 文件 | 建议 |
|---|---|
| `src/renderer/ui/Workspace.tsx` | V9 `onDoubleClickCapture` 在命中非 text/formula 图层、或未命中图层时，不要直接 `return`。应继续 `canvasAuthoringHitAtClientPoint`：`kind === 'component'` → `beginComponentTextEdit`；Runtime text → `beginRuntimeTextEdit`。原生 text/formula 仍走现有 `beginTextEdit`。 |
| `src/renderer/ui/workspaceSlideAuthoring.ts` | 只读核对 `listSlideWorkspaceHitTargets` / `layerTargets` 含 component item；不要为绿把 component 从命中列表拿掉。 |
| `src/renderer/authoring/componentTextEditSession.ts` | overlay 已出现、属性栏已能改标题；优先修 capture 路由。不要先改 session 合同。 |
| `src/renderer/ui/CanvasPlainTextEditor.tsx` | 本轮编辑器未挂载。不要改这个组件来绕过双击。 |
| `tests/e2e/editor.spec.ts` | **不要**改成点 overlay 按钮 / Enter，也不要 skip。窄复跑 `-g "流程 4：组件导入"`。 |

不要为绿 skip。不要重开交互层 / 目录 UI / 简洁模式 / CoursePlayer / 统一画布 / 流程 1 / 文字编辑事务 / P0 双击 / 流程 3。

### B. 未跑、可能下一红（本轮无新证据）

仍在 **`tests/e2e/editor.spec.ts`** serial 第 14–26 条。优先等 A 清零后再全量。若 A 过后下一条红，再按失败标题派，不要预修。

下一条将是「V8 全局层：原生元素、双击文字、保存重开与跨场景可见性」，本轮无证据，不要预修。

IMPORT 点名的 Runtime/Component 导出与整课预览 overlay 仍可能在后半红。

## 给协调者

1. R8-F-RECHECK-4 唯一授权命令 **exit 1**，状态 **`blocked`**。不要领取 R8-G。
2. TEXT-TXN「文字编辑事务」全量已绿；P0 双击、流程 3 全量已绿；FIX-E2E 三条、SELECT-TAB 交互层、SCENE-LAYER「流程 1」、IMPORT「统一画布」全量仍绿。不要重开那些刀。
3. 先回派 **A**（V9 画布双击 capture 把组件/Runtime overlay 让出来）。清零后再全量 `npm run test:e2e`。
4. 禁止为绿而 skip / 放宽未授权断言 / 新建 §5 spec / 静默打开 V8。
5. 不要宣称项目级 engineering candidate（留给 R8-Z 在机器全绿后写）。

## 未跑集合（R8-F-RECHECK-4 授权外）

- `check:ai-capabilities` / `typecheck`（R8-C）
- `npm test`（R8-D）
- `build:desktop`（R8-E 已交；本任务 pretest 自己构建了 player/renderer/electron，未再跑 `build:desktop`）
- 三视口视觉（R8-G）— **未领取**
- 17 项真实体验（R8-H）
- `npm run verify` / `verify:full` / `npm run build`
- 未写 `artifacts/FINAL_GATE_REPORT.md`（R8-Z）

R8-F-RECHECK-4 不领取 R8-G。quality 保持 `unverified`。禁止 art/accepted。禁止项目级 engineering candidate。
