HANDOFF
- task: R8-F-RECHECK
- planning pack path: `C:\Users\74755\Documents\HTML课件编辑器\docs\tasks\v8-to-v9-rebuild`
- product worktree / branch / baseline SHA: `C:\Users\74755\Documents\HTML课件编辑器-v8-to-v9-rebuild` / `codex/v8-to-v9-rebuild` / `f27275658c6dfaa12f2ce35cd9368dcdebe99451`
- outcome: 只在产品 worktree 运行一次 `npm run test:e2e`（含 `pretest:e2e`）。**exit 1。** 墙钟 **373159 ms**（`00:06:13.159`）。Playwright：**6 passed / 1 failed / 0 skipped / 20 did not run**（27 条，1 worker）。R8-FIX-E2E 的两条原失败在全量里仍绿（catalog「目录 UI」2.7m；editor「简洁模式完成文字」34.9s；另「CoursePlayer 宿主」21.8s 也绿）。新红在 `editor.spec.ts` serial 第 4 条「Player 与编辑交互层…」，其后 20 条未跑。未改任何产品源码/测试。未 skip。未 commit。未另跑 `build:desktop` / `npm test` / typecheck / `verify`。未领取 R8-G/H/Z。未宣称 art/accepted，未宣称项目级 engineering candidate。Electron 槽已释放。
- owned files changed:
  - 产品 worktree 源码：无（只读）
  - 产品 worktree 生成：`pretest:e2e` 刷新 `dist-*` / examples / fixtures（未 commit）；失败附件在默认 `test-results/`（未 commit）
  - 计划侧：本 HANDOFF；`00_INDEX.md` 本行状态
- donor files/functions consulted:
  - [`handoffs/R8-F.md`](R8-F.md)、[`handoffs/R8-FIX-E2E.md`](R8-FIX-E2E.md)
  - `10_R8_FINAL_FULL_GATE.md` §11.6
  - 产品 `package.json` `"test:e2e"`；`playwright.config.ts` `workers: 1`
  - 只读定位：`Workspace.tsx` `onPointerDownCapture`；`workspaceSlideAuthoring.ts` `pointerDown` → `selectLayers`；`editorStore.ts` `persistCandidateResult`（不写 `activeTab`）vs `selectNode`（会切 `properties`）；`AddCourseContentMenu.tsx` `data-testid="add-content-primary"` / `data-alias-testid="add-scene"`；`App.tsx` `course-preview-overlay`
- focused validation command:
  ```
  npm run test:e2e
  ```
  工作目录：产品 worktree。Windows PowerShell。未再单独跑 `build:desktop`。未合成 `verify`。未另开手工 App。未抢 `:5173`。e2e 使用 spec 内临时 `--user-data-dir`。
- validation result: **blocked。** `NPM_TEST_E2E_EXIT:1`。`NPM_TEST_E2E_MS:373159`（`00:06:13.159`）。Playwright 摘要：`1 failed` / `20 did not run` / `6 passed (5.4m)`。

  ### 开始前环境（产品 worktree，跑命令前）

  | 项 | 值 |
  |---|---|
  | `git branch --show-current` | `codex/v8-to-v9-rebuild` |
  | `git rev-parse HEAD` | `f27275658c6dfaa12f2ce35cd9368dcdebe99451` |
  | `node --version` | `v24.14.0` |
  | `npm --version` | `11.9.0` |
  | `git status --short` | 脏树未提交 R6–R8 改动，含 FIX-E2E 的两个 spec。本任务未触碰源码/测试。 |
  | Electron 槽 | 无 `electron.exe`。未另开手工 App。跑完后仍无。 |
  | `:5173` | `127.0.0.1:5173` LISTENING PID **19296**（产品 worktree 残留 Vite）。本任务未杀、未占用。跑完后仍为同一 PID。 |
  | `:5174` / `:5175` | 空闲。 |

  ### 命令结果

  | # | 段 | 是否到达 | exit | 耗时 | 首个错误 |
  |---|---|---|---|---|---|
  | pretest | `build:player` → examples → lesson-demo → render-benchmark → catalog-matrix → `build:renderer` → `build:electron` | **是** | 链式继续 | 含在墙钟内；player Vite 3.03s；renderer Vite 6.59s | 无。仅 WARN：player `inlineDynamicImports`；renderer chunk > 500 kB |
  | 整条 | `npm run test:e2e` | 是 | **1** | **373159 ms** | 见下表一条失败 |
  | Playwright | `Running 27 tests using 1 worker` | 是 | 1 | 报告 **5.4m** | 1 failed |

  | 计数 | 值 |
  |---|---|
  | passed | **6** |
  | failed | **1** |
  | skipped（`test.skip` 命中） | **0** |
  | did not run | **20**（`editor.spec.ts` `test.describe.serial`：第 4 条失败后同 describe 剩余未执行；`render-host-benchmark` 在另一文件仍跑完） |
  | 合计 | **27** |

  绿的 6 条：

  1. `componentCatalogMatrix.spec.ts` › 生成物的单 HTML 与网页包离线运行…（6.7s）
  2. `componentCatalogMatrix.spec.ts` › **目录 UI** 按需嵌入、编辑/重开/缩略图/Player，并真实导出…（**2.7m**）← R8-F 原失败 1，FIX-E2E 跟切后全量仍绿
  3. `editor.spec.ts` › **简洁模式完成文字**、透明度、左起竖排与出现动画试运行（34.9s）← R8-F 原失败 2，全量仍绿
  4. `editor.spec.ts` › 专业模式创建、复制、排序规则并修改受控运行时（33.9s）
  5. `editor.spec.ts` › **当前位置试运行：CoursePlayer 宿主**可见且可互动（21.8s）← FIX-E2E 定向绿，全量仍绿
  6. `render-host-benchmark.spec.ts` › Project V8 五种渲染路径可离线互动…（17.1s）

  「流程 9」因 serial 中止 **本轮未跑到**（FIX-E2E 定向绿不能外推到全量）。

- validation entry / fixture / backend:
  - entry: 仓库默认 `playwright test`（`tests/e2e/` 三个 spec）
  - fixture: pretest 生成 photosynthesis lesson、render-host-benchmark HTML、component-catalog V8 矩阵；editor 自建临时 `.h5lesson` / Electron `--user-data-dir`
  - backend: 成熟 V8 App 表面 + Course Project V9 默认真相（CUT 后）；catalog/render-host 夹具仍是 Project V8 离线物
- validation proves / does not prove:
  - proves: 当前脏树上 **一次** `npm run test:e2e` 跑完且 **exit 1**；FIX-E2E 两条原失败在全量里仍绿；新失败标题与首错如下
  - does not prove: 未执行的 20 条 editor 路径、三视口、17 项体验、typecheck、Vitest、教师验收。自动化不得宣称 art/accepted，也不得宣称项目级 engineering candidate。
- narrow UI smoke, if authorized: 未授权。未另开手工窗口。本任务就是全量现有 e2e。
- INTEGRATION_REQUESTS: 无。本任务不写源码。失败回派见下。
- DECISION_REQUESTS: 无。
- remaining risks / untested full checks:
  - 未跑：`check:ai-capabilities`、`typecheck`、`npm test`、三视口、17 项体验、`npm run verify` / `verify:full`、`build:desktop`（本任务禁止再跑）
  - `editor.spec.ts` 20 条因 serial 中止未跑。FIX-E2E 已提示、本轮 **没有新证据** 但仍很可能红的后续刀见「建议下一刀」
  - 现有 e2e **没有** Flow / Spatial / Mixed / 七组合 / V8 显式导入拒绝 / DOCX 规格。本任务不为缺口新建 spec
  - 未领取 R8-G
- rollback point: 产品 HEAD 仍为 `f27275658c6dfaa12f2ce35cd9368dcdebe99451`。R8-F-RECHECK 无产品源码改动可回滚。`test-results/` 与 `dist-*` 未 commit。
- execution state: `blocked`
- integration state: `n/a`
- quality state: `unverified`

## 失败 spec（标题 + 首错）

### 1. `tests/e2e/editor.spec.ts:893`

**标题：** 互动课件编辑器 1.0 / Project V8 收敛 › Player 与编辑交互层在 100%、150% 和重置后保持同位

**耗时：** 41.9s

**首错：**

```
Error: expect(locator).toHaveAttribute(expected) failed
Locator:  getByRole('tab', { name: '属性' })
Expected: "true"
Received: "false"
Timeout:  10000ms
at tests/e2e/editor.spec.ts:986
```

测试已过：blob `.runtime-preview-frame`、插入文字、100%/150% 对齐、中键平移、点空白后 `.node-item--selected` 为 0。失败在平移后点文字中心，断言自动切到「属性」tab。

**只读定位：** V9 candidate 下 `Workspace.onPointerDownCapture` 走 `slideAuthoring.pointerDown` → `runSlideCandidateCommand(selectLayers)` → `persistCandidateResult`。该 persist **更新 `selectedNodeIds`，不写 `activeTab`**。`selectNode` / `selectNodes` 在选中非空时会 `activeTab: 'properties'`，但 capture 已 `stopPropagation`，Phaser `onNodeSelected` 到不了。点空白能取消选中，说明指针路径通；首错是 tab 没切，不能从本轮证明文字没命中。次因：教师控制器 `pointerDown` 先于 slide authoring，重叠时会吞手势。

**窄复跑（owner 用，不要全量 e2e）：**

```
npx playwright test tests/e2e/editor.spec.ts -g "Player 与编辑交互层"
```

**附件（未 commit）：**

- `test-results/editor-互动课件编辑器-1-0-Project-4ca15-r-与编辑交互层在-100-、150-和重置后保持同位/error-context.md`
- 同目录 `trace.zip`

因 `test.describe.serial`，本失败还导致同文件其余 20 条 **did not run**。

## 建议下一刀（按文件；本任务不修）

本轮只证明了 **一条** 新失败。其余是 FIX-E2E 已提示、本轮未执行的高概率后续。协调者按文件派，各只跑窄 Playwright。

### A. 本轮实锤 — `editor.spec.ts`「Player 与编辑交互层」

| 文件 | 建议 |
|---|---|
| `src/renderer/store/editorStore.ts` | 最短产品刀：`persistCandidateResult` 在 `selectionIds.length > 0` 时与 `selectNode` 一样切 `activeTab: 'properties'`。 |
| `src/renderer/ui/workspaceSlideAuthoring.ts` | 或让画布 `pointerDown` 走 `store.selectNode` 而不是裸 `selectLayers`。 |
| `src/renderer/ui/Workspace.tsx` | capture 路径是唯一入口；不要只改 Phaser `onNodeSelected`。 |
| `tests/e2e/editor.spec.ts` | 仅当协调者允许跟切合同：该条改断言图层选中，不再要求自动切「属性」。会放宽 V8「点选打开属性」。 |

不要为绿 skip。不要退回 blob 试运行 iframe（那两条全量已绿）。

### B. 未跑、高概率下一红（FIX-E2E 已点名）

全部仍在 **`tests/e2e/editor.spec.ts`**。产品 DOM 已变，spec 多处未跟。

| 合同 | spec 现状 | 当前表面（只读） | 建议跟切点 |
|---|---|---|---|
| `.node-item` 不计控制器 | 流程 3 `toHaveCount(2)`（rect+text）；另有 `1`/`0`/`3`/`4` 等 | 默认教师控制器仍在图层 | 与 catalog 一样：计数含控制器，或 filter 掉 `title="teacher-controller"` |
| `add-scene` testid | 流程 1 等 `getByTestId('add-scene')`（约 1239、1647、1756、2001、2173、2626） | 按钮 `data-testid="add-content-primary"`，`add-scene` 只是 `data-alias-testid` | spec 改 `add-content-primary`；不要把产品 testid 退回 `add-scene` |
| 整课预览 `waitForEvent('window')` | 流程 4 / 全局层 / 全局组件 / 控制器预览 / 流程 8B 等 | `App.tsx` 是 `course-preview-overlay` + `course-preview-host`，不是新 Electron 窗 | spec 等 overlay/host，不要等 `window` |

`AddCourseContentMenu.tsx` / `App.tsx` 不是本轮失败的 owner，除非有人要把表面改回独立窗口或 `data-testid="add-scene"`。

## 给协调者

1. R8-F-RECHECK 唯一授权命令 **exit 1**，状态 **`blocked`**。不要领取 R8-G。
2. FIX-E2E 两条原失败（目录 UI、简洁模式试运行）全量仍绿；不要重开那两刀。
3. 先回派 **A**（交互层同位 / 属性 tab）。清零后再全量 `npm run test:e2e`。B 三组很可能在下一轮 serial 里接着红。
4. 禁止为绿而 skip / 放宽未授权断言 / 新建 §5 spec。
5. 不要宣称项目级 engineering candidate（留给 R8-Z 在机器全绿后写）。

## 未跑集合（R8-F-RECHECK 授权外）

- `check:ai-capabilities` / `typecheck`（R8-C）
- `npm test`（R8-D）
- `build:desktop`（R8-E 已交；本任务 pretest 自己构建了 player/renderer/electron，未再跑 `build:desktop`）
- 三视口视觉（R8-G）— **未领取**
- 17 项真实体验（R8-H）
- `npm run verify` / `verify:full` / `npm run build`
- 未写 `artifacts/FINAL_GATE_REPORT.md`（R8-Z）

R8-F-RECHECK 不领取 R8-G。quality 保持 `unverified`。禁止 art/accepted。禁止项目级 engineering candidate。
