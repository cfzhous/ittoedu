HANDOFF
- task: R8-F-RECHECK-5
- planning pack path: `C:\Users\74755\Documents\HTML课件编辑器\docs\tasks\v8-to-v9-rebuild`
- product worktree / branch / baseline SHA: `C:\Users\74755\Documents\HTML课件编辑器-v8-to-v9-rebuild` / `codex/v8-to-v9-rebuild` / `f27275658c6dfaa12f2ce35cd9368dcdebe99451`
- outcome: 只在产品 worktree 运行一次 `npm run test:e2e`（含 `pretest:e2e`）。**exit 1。** 墙钟 **634031 ms**（`00:10:34.031`）。Playwright：**14 passed / 1 failed / 0 skipped / 12 did not run**（27 条，1 worker）。R8-FIX-COMP-XFORM / R8-FIX-COMP-DBLCLICK 的「流程 4：组件导入、保存重开与预览交互」本轮全量绿（40.7s）。Workspace V9 双击 fall-through **未回滚**。R8-F-RECHECK-4 已关条目本轮仍绿。新红在 `editor.spec.ts` serial 第 14 条「V8 全局层：原生元素、双击文字、保存重开与跨场景可见性」，其后 12 条未跑。未改任何产品源码/测试。未 skip。未 commit。未另跑 `build:desktop` / `npm test` / typecheck / `verify`。未领取 R8-G/H/Z。未宣称 art/accepted，未宣称项目级 engineering candidate。Electron 槽已释放。
- owned files changed:
  - 产品 worktree 源码：无（只读）
  - 产品 worktree 生成：`pretest:e2e` 刷新 `dist-*` / examples / fixtures（未 commit）；失败附件在默认 `test-results/`（未 commit）
  - 计划侧：本 HANDOFF；`00_INDEX.md` 本行状态
- donor files/functions consulted:
  - [`handoffs/R8-F-RECHECK-4.md`](R8-F-RECHECK-4.md)、[`handoffs/R8-FIX-COMP-XFORM.md`](R8-FIX-COMP-XFORM.md)、[`handoffs/R8-FIX-COMP-DBLCLICK.md`](R8-FIX-COMP-DBLCLICK.md)
  - `10_R8_FINAL_FULL_GATE.md` §11.6
  - 产品 `package.json` `"test:e2e"`；`playwright.config.ts` `workers: 1`
  - 只读定位：`tests/e2e/editor.spec.ts:1710` / `:1739`；`v9SlideContentEdit.ts` `locateEditableNative`；`editorStore.ts` `beginTextEdit` V9 失败回退；`withV9ContentDraft`；`projectV9EditingNodes`
- focused validation command:
  ```
  npm run test:e2e
  ```
  工作目录：产品 worktree。Windows PowerShell。`VITE_DEV_SERVER_URL` unset。未再单独跑 `build:desktop`。未合成 `verify`。未另开手工 App。未抢 `:5173`。e2e 使用 spec 内临时 `--user-data-dir`。
- validation result: **blocked。** `NPM_TEST_E2E_EXIT:1`。`NPM_TEST_E2E_MS:634031`（`00:10:34.031`）。Playwright 摘要：`1 failed` / `12 did not run` / `14 passed (10.4m)`。Playwright **1.61.1**。

  ### 开始前环境（产品 worktree，跑命令前）

  | 项 | 值 |
  |---|---|
  | `git branch --show-current` | `codex/v8-to-v9-rebuild` |
  | `git rev-parse HEAD` | `f27275658c6dfaa12f2ce35cd9368dcdebe99451` |
  | `node --version` | `v24.14.0` |
  | `npm --version` | `11.9.0` |
  | `git status --short` | 脏树未提交 R6–R8 改动，含 COMP-DBLCLICK / COMP-XFORM。本任务未触碰源码/测试。 |
  | Electron 槽 | 无 `electron.exe`。未另开手工 App。跑完后仍无。 |
  | `:5173` | `127.0.0.1:5173` LISTENING PID **19296**（产品 worktree 残留 Vite）。本任务未杀、未占用。跑完后仍为同一 PID。 |
  | `:5174` / `:5175` | 空闲。 |

  ### 命令结果

  | # | 段 | 是否到达 | exit | 耗时 | 首个错误 |
  |---|---|---|---|---|---|
  | pretest | `build:player` → examples → lesson-demo → render-benchmark → catalog-matrix → `build:renderer` → `build:electron` | **是** | 链式继续 | 含在墙钟内；player Vite **1.38s**；renderer Vite **2.53s** | 无。仅 WARN：player `inlineDynamicImports`；renderer chunk > 500 kB |
  | 整条 | `npm run test:e2e` | 是 | **1** | **634031 ms** | 见下表一条失败 |
  | Playwright | `Running 27 tests using 1 worker` | 是 | 1 | 报告 **10.4m** | 1 failed |

  | 计数 | 值 |
  |---|---|
  | passed | **14** |
  | failed | **1** |
  | skipped（`test.skip` 命中） | **0** |
  | did not run | **12**（`editor.spec.ts` `test.describe.serial`：第 14 条失败后同 describe 剩余未执行；`render-host-benchmark` 在另一文件仍跑完） |
  | 合计 | **27** |

  绿的 14 条：

  1. `componentCatalogMatrix.spec.ts` › 生成物的单 HTML 与网页包离线运行四组件、状态覆盖和 100 次压力翻页（5.9s）
  2. `componentCatalogMatrix.spec.ts` › **目录 UI** 按需嵌入、编辑/重开/缩略图/Player，并真实导出 HTML、网页包、PDF、PPTX（**2.8m**）← FIX-E2E，全量仍绿
  3. `editor.spec.ts` › **简洁模式完成文字**、透明度、左起竖排与出现动画试运行（33.0s）← FIX-E2E，全量仍绿
  4. `editor.spec.ts` › 专业模式创建、复制、排序规则并修改受控运行时（25.6s）
  5. `editor.spec.ts` › **当前位置试运行：CoursePlayer 宿主**可见且可互动（25.8s）← FIX-E2E，全量仍绿
  6. `editor.spec.ts` › **Player 与编辑交互层**在 100%、150% 和重置后保持同位（**1.0m**）← SELECT-TAB，全量仍绿
  7. `editor.spec.ts` › **统一画布：场景/全局运行时文字与图片可原位编辑并往返**（**50.4s**）← IMPORT，全量仍绿
  8. `editor.spec.ts` › **流程 1：场景新增、排序与删除**（9.9s）← SCENE-LAYER，全量仍绿
  9. `editor.spec.ts` › 流程 2：中文文本、位置、样式与工程往返（34.9s）
  10. `editor.spec.ts` › **文字编辑事务：resize、属性栏、切换节点、字体、IME 与撤销**（**55.2s**）← TEXT-TXN，全量仍绿
  11. `editor.spec.ts` › **P0：画布真实双击可持续输入、失焦单次提交且 Escape 取消**（**20.6s**）← 场景原生文字 overlay 仍绿
  12. `editor.spec.ts` › **流程 3：节点层级排序与撤销**（**39.8s**）← SCENE-LAYER，全量仍绿
  13. `editor.spec.ts` › **流程 4：组件导入、保存重开与预览交互**（**40.7s**）← COMP-DBLCLICK + COMP-XFORM；**本轮全量绿**
  14. `render-host-benchmark.spec.ts` › Project V8 五种渲染路径可离线互动且反复切换不泄漏宿主（21.7s）

- validation entry / fixture / backend:
  - entry: 仓库默认 `playwright test`（`tests/e2e/` 三个 spec）
  - fixture: pretest 生成 photosynthesis lesson、render-host-benchmark HTML、component-catalog V8 矩阵；editor `beforeAll` 从 `examples/sample-project.h5lesson`（schema 8）克隆；流程 4 用 `examples/sample-counter.h5component`；本失败条用 `global-layer-entry` + `add-text` 自建全局原生文字；其余 editor 自建临时 `.h5lesson` / Electron `--user-data-dir`
  - backend: 成熟 V8 App 表面 + Course Project V9 默认真相（CUT 后）；打开 V8 必须显式导入；catalog/render-host 夹具仍是 Project V8 离线物
- validation proves / does not prove:
  - proves: 当前脏树上 **一次** `npm run test:e2e` 跑完且 **exit 1**；「流程 4」全量绿；RECHECK-4 已关条目仍绿；新失败标题与首错如下
  - does not prove: 未执行的 12 条 editor 路径、三视口、17 项体验、typecheck、Vitest、教师验收。自动化不得宣称 art/accepted，也不得宣称项目级 engineering candidate。
- narrow UI smoke, if authorized: 未授权。未另开手工窗口。本任务就是全量现有 e2e。
- INTEGRATION_REQUESTS: 无。本任务不写源码。失败回派见下。「流程 4」本轮全量 e2e 已绿，协调者可将 `R8F-COMP-XFORM-01` / `R8F-COMP-DBL-01`（DBLCLICK HANDOFF 写作 `R8F-COMP-DBLCLICK-01`）标 `verified`；本任务不改账本。
- DECISION_REQUESTS: 无。
- remaining risks / untested full checks:
  - 未跑：`check:ai-capabilities`、`typecheck`、`npm test`、三视口、17 项体验、`npm run verify` / `verify:full`、`build:desktop`（本任务禁止再跑）
  - `editor.spec.ts` 12 条因 serial 中止未跑
  - IMPORT 点名、本轮 **没有新失败证据** 的后续：见下「点名风险本轮未踩到」
  - 现有 e2e **没有** Flow / Spatial / Mixed / 七组合 / V8 显式导入拒绝 / DOCX 规格。本任务不为缺口新建 spec
  - 未领取 R8-G
- rollback point: 产品 HEAD 仍为 `f27275658c6dfaa12f2ce35cd9368dcdebe99451`。R8-F-RECHECK-5 无产品源码改动可回滚。`test-results/` 与 `dist-*` 未 commit。不要回滚 COMP-DBLCLICK / COMP-XFORM。
- execution state: `blocked`
- integration state: `n/a`
- quality state: `unverified`

## 失败 spec（标题 + 首错）

### 1. `tests/e2e/editor.spec.ts:1710`

**标题：** 互动课件编辑器 1.0 / Project V8 收敛 › V8 全局层：原生元素、双击文字、保存重开与跨场景可见性

**耗时：** 22.9s

**首错：**

```
Error: expect(locator).toHaveValue(expected) failed

Locator:  getByRole('textbox', { name: '文字内容' })
Expected: "全课程统一标题"
Received: "双击编辑文字"
Timeout:  10000ms
Error: expect(locator).toHaveValue(expected) failed
    22 × locator resolved to <textarea aria-label="文字内容" class="form-textarea">双击编辑文字</textarea>
           - unexpected value "双击编辑文字"
at tests/e2e/editor.spec.ts:1739
```

测试已过：`global-layer-entry`、元素页 `add-text`、画布中心 `page.mouse.dblclick`、`text-edit-overlay` **已聚焦**（`:1736` `toBeFocused()` 通过）。随后 `Control+A` + `insertText('全课程统一标题')`。失败在属性栏「文字内容」10s 内仍为默认「双击编辑文字」。未跑到保存重开、跨场景可见性、整课预览 overlay。

**只读定位：** 场景 P0 同套 overlay + `insertText` 本轮全量绿，因为 `beginV9SlideContentEdit` → `locateEditableNative` 要求 `session.scope === 'scene'`（`v9SlideContentEdit.ts:289-291`），草稿进 `v9ContentEdit`，`withV9ContentDraft` 把 `draft.text` 投影到属性栏。

全局层：`global-layer-entry` 后 `session.scope === 'global'`。`layerTargets` 按 `layer.source === session.scope` 收录全局项，所以双击能命中并打开 overlay。但 `locateEditableNative` 对非 scene **直接** `SLIDE_REJECT_WRONG_OWNER`。`editorStore.beginTextEdit`（约 `:4695-4734`）于是回退到 V8 `textEditSession` / `projectWithTextSnapshot`，写的是 V8 `state.project`，**不是** V9 `globalLayerItems`。属性栏读的是 `projectV9EditingNodes` + `withV9ContentDraft`；`v9ContentEdit` 为 null，投影仍是「双击编辑文字」。`v9SlideContentCommands.requireSceneScope`（`:272-275`）同样拒全局。

不要为绿把 spec 改成只改属性栏、也不要 skip、不要静默打开 V8。不要回滚 Workspace V9 双击 fall-through（本条 overlay 已经出现）。

**窄复跑（owner 用，不要全量 e2e）：**

```
npx playwright test tests/e2e/editor.spec.ts -g "V8 全局层"
```

**附件（未 commit）：**

- `test-results/editor-互动课件编辑器-1-0-Project-aa5ad-8-全局层：原生元素、双击文字、保存重开与跨场景可见性/error-context.md`
- 同目录 `trace.zip`

因 `test.describe.serial`，本失败还导致同文件其余 12 条 **did not run**（全局组件、Runtime/Component 导出、整课预览、流程 5–9、媒体/图片、课例验收）。

## 上一轮点名、本轮已绿（不要重开）

| 条 | 本轮证据 |
|---|---|
| 「流程 4：组件导入、保存重开与预览交互」 | **全量绿** 40.7s。不要重开 COMP-DBLCLICK / COMP-XFORM；双击 fall-through 必须保留 |
| 目录 UI；简洁模式试运行；CoursePlayer 宿主；Player 与编辑交互层；统一画布；流程 1；流程 2；文字编辑事务；P0 画布真实双击；流程 3；render-host-benchmark | 全量仍绿。不要重开 |

## 点名风险本轮未踩到（不要当本轮实锤）

因 serial 停在第 14 条，**没有新失败证据**。原样记录：

| 风险 | 本轮证据 | 只读现状 |
|---|---|---|
| `Component API 4 全局组件：组件范围、全部文案、保存重开与预览可见性` | **未跑**（serial 第 15 条 did not run） | 无新证据，不要预修 |
| `Runtime API 2 / Component API 4 导出` 仍可能用 `projectDocumentSchema`（V8）去 parse 上一刀保存的 V9 zip | **未跑**（serial 第 16 条 did not run） | IMPORT 未改那条。若下一轮全量停在那里，跟切该夹具为 V9 + 显式导入，不要静默打开 |
| 整课预览 overlay（`course-preview-host`，不是新窗口） | **未跑**（「整课预览：后台教师控制器…」did not run） | spec 已有 `openCoursePreviewOverlay` |

不要因为本轮没跑到就重开 FIX-E2E / SELECT-TAB / SCENE-LAYER / IMPORT / TEXT-TXN / COMP-DBLCLICK / COMP-XFORM。

## 未跑标题（12）

1. Component API 4 全局组件：组件范围、全部文案、保存重开与预览可见性
2. Runtime API 2 / Component API 4 导出：等待 DOM 运行时后生成 PDF，并在 PPTX 保留动态层、全局 visibility 与原生文字
3. 整课预览：后台教师控制器可拖动、键盘细移并保持会话位置
4. 流程 5：Presenter 在单 HTML 与网页包均可离线翻页
5. 媒体批量与连续插入：排布、入库、页签和单次撤销
6. 补充流程：图片导入、替换与工程往返
7. 流程 6：箭头、大括号与多选对齐
8. 流程 7：两页课件导出 PDF 与 PPTX
9. 流程 8：字体与局部富文本在内容编辑后保持同步
10. 流程 8B：V8 着重号与语义公式跨表面导出证据
11. 流程 9：未保存课件自动恢复
12. 课例验收：三页光合作用课例可离线互动

## 建议下一刀（按文件；本任务不修）

本轮只证明了 **一条** 新失败。协调者按文件派，只跑窄 Playwright。不要预修下一条。

### A. 本轮实锤 — 全局原生文字双击草稿进不了 V9 投影

| 文件 | 建议 |
|---|---|
| `src/renderer/authoring/v9SlideContentEdit.ts` | `locateEditableNative` 在 `session.scope === 'global'` 且命中 `source === 'global'` 的 native text/formula 时，应允许 begin/update draft，而不是一律 `SLIDE_REJECT_WRONG_OWNER`。教师控制器仍不要走这条。 |
| `src/renderer/course/v9SlideContentCommands.ts` | `requireSceneScope` 目前拒全局。全局原生文字提交应对 `globalLayerItems`，不要写进 scene `layerItems`。 |
| `src/renderer/store/editorStore.ts` | V9 `beginTextEdit` 失败后不要把全局文字悄悄落到 V8 `textEditSession`。属性栏必须读到 `withV9ContentDraft`。 |
| `src/renderer/course/globalLayerCommands.ts` | 只读核对全局 native 写入入口；不要另起一套文字合同。 |
| `src/renderer/authoring/v9TeacherControllerAuthoring.ts` | 本条失败对象是全局原生文字，不是教师控制器。不要把控制器路径并进来「顺便修」。 |
| `src/renderer/ui/Workspace.tsx` | **不要**回滚 COMP-DBLCLICK 的 V9 双击 fall-through。本条 overlay 已经出现。 |
| `tests/e2e/editor.spec.ts` | **不要**改成只填属性栏 / skip。窄复跑 `-g "V8 全局层"`。 |

不要为绿 skip。不要重开流程 4 / 交互层 / 目录 UI / 简洁模式 / CoursePlayer / 统一画布 / 流程 1 / 文字编辑事务 / P0 双击 / 流程 3。

### B. 未跑、可能下一红（本轮无新证据）

仍在 **`tests/e2e/editor.spec.ts`** serial 第 15–26 条。优先等 A 清零后再全量。若 A 过后下一条红，再按失败标题派，不要预修。

下一条将是「Component API 4 全局组件…」，本轮无证据，不要预修。

IMPORT 点名的 Runtime/Component 导出与整课预览 overlay 仍可能在后半红。

## 给协调者

1. R8-F-RECHECK-5 唯一授权命令 **exit 1**，状态 **`blocked`**。不要领取 R8-G。
2. 「流程 4」全量已绿；可将 `R8F-COMP-XFORM-01` / `R8F-COMP-DBL-01` 标 `verified`（本任务不改账本）。COMP-DBLCLICK 的 Workspace 双击刀必须保留。
3. RECHECK-4 已关条目本轮仍绿。不要重开那些刀。
4. 先回派 **A**（V9 全局原生文字内容事务 / 草稿投影）。清零后再全量 `npm run test:e2e`。
5. 禁止为绿而 skip / 放宽未授权断言 / 新建 §5 spec / 静默打开 V8。
6. 不要宣称项目级 engineering candidate（留给 R8-Z 在机器全绿后写）。

## 未跑集合（R8-F-RECHECK-5 授权外）

- `check:ai-capabilities` / `typecheck`（R8-C）
- `npm test`（R8-D）
- `build:desktop`（R8-E 已交；本任务 pretest 自己构建了 player/renderer/electron，未再跑 `build:desktop`）
- 三视口视觉（R8-G）— **未领取**
- 17 项真实体验（R8-H）
- `npm run verify` / `verify:full` / `npm run build`
- 未写 `artifacts/FINAL_GATE_REPORT.md`（R8-Z）

R8-F-RECHECK-5 不领取 R8-G。quality 保持 `unverified`。禁止 art/accepted。禁止项目级 engineering candidate。
