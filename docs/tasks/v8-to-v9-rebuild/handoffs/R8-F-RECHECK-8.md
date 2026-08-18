HANDOFF
- task: R8-F-RECHECK-8
- planning pack path: `C:\Users\74755\Documents\HTML课件编辑器\docs\tasks\v8-to-v9-rebuild`
- product worktree / branch / baseline SHA: `C:\Users\74755\Documents\HTML课件编辑器-v8-to-v9-rebuild` / `codex/v8-to-v9-rebuild` / `f27275658c6dfaa12f2ce35cd9368dcdebe99451`
- outcome: 只在产品 worktree 运行一次 `npm run test:e2e`（含 `pretest:e2e`）。**exit 1。** 墙钟 **242875 ms**（`00:04:02.875`）。Playwright：**2 passed / 2 failed / 0 skipped / 23 did not run**（27 条，1 worker）。**第一条失败**是 `componentCatalogMatrix.spec.ts` serial 第 2 条「目录 UI 按需嵌入、编辑/重开/缩略图/Player，并真实导出 HTML、网页包、PDF、PPTX」（3.1m）：PPTX slide XML 含「互动组件」与「互动组件静态快照」，**不含**「静态导出提示」。同文件第 1 条仍绿。随后 1 worker 进入 `editor.spec.ts`，第 1 条「简洁模式…试运行」也红（21.7s）；同 describe serial 余 22 条未跑。`render-host-benchmark` 仍绿。R8-FIX-E2E-EXPORT **不要回滚、不要重开**。「Runtime API 2 / Component API 4 导出」本轮 **did not run**，协调者**不要**把 `R8F-RUNTIME-EXPORT-01` 标 verified。SLIDE-PREVIEW-COMP / SCENE-LABEL / GLOBAL-LAYER-POS / GLOBAL-TEXT / COMP-* / TEXT-TXN / IMPORT / SCENE-LAYER / SELECT-TAB / FIX-E2E **必须保留**。未改任何产品源码/测试。未 skip。未 commit。未另跑 `build:desktop` / `npm test` / typecheck / `verify`。未领取 R8-G/H/Z。未宣称 art/accepted，未宣称项目级 engineering candidate。Electron 槽已释放。
- owned files changed:
  - 产品 worktree 源码：无（只读）
  - 产品 worktree 生成：`pretest:e2e` 刷新 `dist-*` / examples / fixtures（未 commit）；失败附件在默认 `test-results/`（未 commit）
  - 计划侧：本 HANDOFF；`00_INDEX.md` 本行状态
- donor files/functions consulted:
  - [`handoffs/R8-F-RECHECK-7.md`](R8-F-RECHECK-7.md)、[`handoffs/R8-FIX-E2E-EXPORT.md`](R8-FIX-E2E-EXPORT.md)
  - `10_R8_FINAL_FULL_GATE.md` §11.6
  - 产品 `package.json` `"test:e2e"`；`playwright.config.ts` `workers: 1`
  - 只读定位：`tests/e2e/componentCatalogMatrix.spec.ts:551` / `:815`；`App.tsx` `handleExportPptx` 纯 Slide → `buildPptx`；`buildPptx.addPptxWarnings` 在 `warnings.length === 0` 时不写「静态导出提示」
- focused validation command:
  ```
  npm run test:e2e
  ```
  工作目录：产品 worktree。Windows PowerShell。`VITE_DEV_SERVER_URL` unset。未再单独跑 `build:desktop`。未合成 `verify`。未另开手工 App。未抢 `:5173`。e2e 使用 spec 内临时 `--user-data-dir`（`electron-profile-${pid}`）。
- validation result: **blocked。** `NPM_TEST_E2E_EXIT:1`。`NPM_TEST_E2E_MS:242875`（`00:04:02.875`）。Playwright 摘要：`2 failed` / `23 did not run` / `2 passed (3.8m)`。Playwright **1.61.1**。

  ### 开始前环境（产品 worktree，跑命令前）

  | 项 | 值 |
  |---|---|
  | `git branch --show-current` | `codex/v8-to-v9-rebuild` |
  | `git rev-parse HEAD` | `f27275658c6dfaa12f2ce35cd9368dcdebe99451` |
  | `node --version` | `v24.14.0` |
  | `npm --version` | `11.9.0` |
  | `git status --short` | 脏树未提交 R6–R8 改动，含 SLIDE-PREVIEW-COMP / GLOBAL-SCENE-LABEL / GLOBAL-LAYER-POS / GLOBAL-TEXT / COMP-* / TEXT-TXN / IMPORT / SCENE-LAYER / SELECT-TAB / FIX-E2E / **R8-FIX-E2E-EXPORT**。本任务未触碰源码/测试。 |
  | Electron 槽 | 无 `electron.exe`。未另开手工 App。跑完后仍无。 |
  | `:5173` | 无 LISTENING。仅见 Cursor 网络进程对已关闭 5173 的 `SYN_SENT`。本任务未杀、未占用。跑完后仍无 LISTENING。 |
  | `:5174` / `:5175` | 空闲。 |

  ### 命令结果

  | # | 段 | 是否到达 | exit | 耗时 | 首个错误 |
  |---|---|---|---|---|---|
  | pretest | `build:player` → examples → lesson-demo → render-benchmark → catalog-matrix → `build:renderer` → `build:electron` | **是** | 链式继续 | 含在墙钟内；player Vite **1.32s**；renderer Vite **2.52s** | 无。仅 WARN：player `inlineDynamicImports`；renderer chunk > 500 kB |
  | 整条 | `npm run test:e2e` | 是 | **1** | **242875 ms** | 见下「第一条失败」 |
  | Playwright | `Running 27 tests using 1 worker` | 是 | 1 | 报告 **3.8m** | 2 failed |

  | 计数 | 值 |
  |---|---|
  | passed | **2** |
  | failed | **2** |
  | skipped（`test.skip` 命中） | **0** |
  | did not run | **23**（`editor.spec.ts` `test.describe.serial`：简洁模式失败后同 describe 剩余 22 条未执行；catalog serial 只有 2 条，第 1 绿第 2 红，该文件无剩余；`render-host-benchmark` 在另一文件仍跑完） |
  | 合计 | **27** |

  绿的 2 条：

  1. `componentCatalogMatrix.spec.ts` › 生成物的单 HTML 与网页包离线运行四组件、状态覆盖和 100 次压力翻页（6.6s）
  2. `render-host-benchmark.spec.ts` › Project V8 五种渲染路径可离线互动且反复切换不泄漏宿主（14.9s）

  红的 2 条（本轮实际跑到）：

  1. **第一条：** `componentCatalogMatrix.spec.ts` › **目录 UI** 按需嵌入、编辑/重开/缩略图/Player，并真实导出 HTML、网页包、PDF、PPTX（**3.1m**）← 详见下方
  2. `editor.spec.ts` › **简洁模式完成文字**、透明度、左起竖排与出现动画试运行（21.7s）← 本轮也红；**不要预修**；详见「第二条（已跑，不派本刀）」

- validation entry / fixture / backend:
  - entry: 仓库默认 `playwright test`（`tests/e2e/` 三个 spec）
  - fixture: pretest 生成 photosynthesis lesson、render-host-benchmark HTML、component-catalog V8 矩阵；目录 UI 条在 Electron 编辑器内嵌组件并 `export-pptx`；editor `beforeAll` 从 `examples/sample-project.h5lesson`（schema 8）克隆
  - backend: 成熟 V8 App 表面 + Course Project V9 默认真相（CUT 后）；打开 V8 必须显式导入；catalog/render-host 夹具仍是 Project V8 离线物；纯 Slide PPTX 现走 `projectCandidatePreviewDocument` → `buildPptx`（R8-FIX-E2E-EXPORT，**不要回滚**）
- validation proves / does not prove:
  - proves: 当前脏树上 **一次** `npm run test:e2e` 跑完且 **exit 1**；第一条失败标题与首错如下；catalog 离线 HTML/网页包条仍绿；render-host-benchmark 仍绿
  - does not prove: 未执行的 23 条 editor 路径（含 Runtime/Component 导出、整课预览、流程 5–9）；三视口、17 项体验、typecheck、Vitest、教师验收。自动化不得宣称 art/accepted，也不得宣称项目级 engineering candidate。不得把 `R8F-RUNTIME-EXPORT-01` 标 verified。
- narrow UI smoke, if authorized: 未授权。未另开手工窗口。本任务就是全量现有 e2e。
- INTEGRATION_REQUESTS: 无。本任务不写源码。失败回派见下。「Runtime API 2 / Component API 4 导出」本轮 **未跑**，不要把 `R8F-RUNTIME-EXPORT-01` 标 `verified`。
- DECISION_REQUESTS: 无。
- remaining risks / untested full checks:
  - 未跑：`check:ai-capabilities`、`typecheck`、`npm test`、三视口、17 项体验、`npm run verify` / `verify:full`、`build:desktop`（本任务禁止再跑）
  - `editor.spec.ts` 22 条因 serial 中止未跑（另加 catalog 无剩余）
  - 「Runtime API 2 / Component API 4 导出」未跑；不要据此关闭 EXPORT 账本
  - 点名、本轮 **没有新失败证据** 的后续：见下「点名风险本轮未踩到」
  - `v9GlobalLayerUiAdapter` 有一条 reorder/controller-move 单测可能红（早退不设 errorMessage）。本任务不跑 Vitest、不修它
  - 现有 e2e **没有** Flow / Spatial / Mixed / 七组合 / V8 显式导入拒绝 / DOCX 规格。本任务不为缺口新建 spec
  - 未领取 R8-G
- rollback point: 产品 HEAD 仍为 `f27275658c6dfaa12f2ce35cd9368dcdebe99451`。R8-F-RECHECK-8 无产品源码改动可回滚。`test-results/` 与 `dist-*` 未 commit。**不要回滚** R8-FIX-E2E-EXPORT / SLIDE-PREVIEW-COMP / GLOBAL-SCENE-LABEL / GLOBAL-LAYER-POS / GLOBAL-TEXT / COMP-* / TEXT-TXN / IMPORT / SCENE-LAYER / SELECT-TAB / FIX-E2E。
- execution state: `blocked`
- integration state: `n/a`
- quality state: `unverified`

## 第一条失败 spec（标题 + 首错）

### 1. `tests/e2e/componentCatalogMatrix.spec.ts:551`

**标题：** Component Catalog V8 四组件全矩阵 › 目录 UI 按需嵌入、编辑/重开/缩略图/Player，并真实导出 HTML、网页包、PDF、PPTX

**耗时：** 3.1m（`test.setTimeout(480_000)`）；已启动 Electron；HTML / 网页包 / PDF 断言已过；死在 PPTX 字符串

**file:line：** `tests/e2e/componentCatalogMatrix.spec.ts:815`

**期望：** 每个 `ppt/slides/slideN.xml` 含子串 `"静态导出提示"`（同循环已要求含 `"互动组件"`，该项已满足）

**收到：** 含 `"互动组件"`，**不含** `"静态导出提示"`。slide XML 有原生标题文字（如 `语文朗读标注 · com.ittoedu.language.reading-annotation@1.1.0`）和图片 `descr="…（互动组件静态快照）"`。快照已进 PPTX，警告横幅未写出。

**首错：**

```
Error: expect(received).toContain(expected) // indexOf

Expected substring: "静态导出提示"
Received string:    "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>·
... <a:t>语文朗读标注 · com.ittoedu.language.reading-annotation@1.1.0</a:t> ...
<p:pic> ... name=\"矩阵组件 01 · 语文朗读标注 · matrix_component_01\" descr=\"矩阵组件 01 · 语文朗读标注（互动组件静态快照）\" ...
```

断言：

```
813 |         const xml = new TextDecoder().decode(pptx[slidePath])
814 |         expect(xml).toContain('互动组件')
  > 815 |         expect(xml).toContain('静态导出提示')
          |                     ^
```

**只读定位：** R8-FIX-E2E-EXPORT 让纯 Slide `handleExportPptx` 走 `projectCandidatePreviewDocument` → `buildPptx`（`App.tsx` `:1139`–`:1175`）。`buildPptx.addPptxWarnings`（`:159`–`:162`）在 `warnings.length === 0` 时直接 return，不写 `静态导出提示：…`。本条组件快照成功，因此没有警告条。不要回滚 EXPORT 的 V9 夹具 parse / 纯 Slide `buildPptx` 切流。不要 skip。不要改 `editor.spec.ts`。不要静默打开 V8。

不要回滚 SLIDE-PREVIEW-COMP 的 component/runtime 可见后备。不要回滚 GLOBAL-SCENE-LABEL 勾选框 `scene.name`。不要回滚 GLOBAL-LAYER-POS / GLOBAL-TEXT / COMP-* / TEXT-TXN / IMPORT / SCENE-LAYER / SELECT-TAB / FIX-E2E。

**窄复跑（owner 用，不要全量 e2e）：**

```
npx playwright test tests/e2e/componentCatalogMatrix.spec.ts -g "目录 UI"
```

**附件（未 commit）：**

- `test-results/componentCatalogMatrix-Com-81985-yer，并真实导出-HTML、网页包、PDF、PPTX/error-context.md`
- 同目录 `trace.zip`

因 catalog `test.describe.serial` 只有 2 条，本失败没有同文件剩余未跑。1 worker 随后进入 `editor.spec.ts`。

## 第二条失败（已跑；不要预修）

本任务按规则只把 **第一条** 回派。下面只记录已发生证据，不建议本轮顺手修。

### 2. `tests/e2e/editor.spec.ts:817`

**标题：** 互动课件编辑器 1.0 / Project V8 收敛 › 里程碑闭环：简洁模式完成文字、透明度、左起竖排与出现动画试运行

**耗时：** 21.7s

**file:line：** `tests/e2e/editor.spec.ts:886`

**期望：** 点「预览」后文字 `alpha` `< stableMotionFrame.alpha * 0.9`（poll 2s）

**收到：** `1`（`toBeLessThan` 的 expected 打印为 `< 0`，即当时 `stableMotionFrame.alpha * 0.9` 为 0；received 仍为 1）。Timeout 2000ms。

R8-F-RECHECK-7 该条全量绿（32.7s）。本轮新证据。不要重开 FIX-E2E 整刀。不要预修。等第一条目录 UI 清零后再全量。

**附件（未 commit）：**

- `test-results/editor-互动课件编辑器-1-0-Project-7355a-环：简洁模式完成文字、透明度、左起竖排与出现动画试运行/error-context.md`
- 同目录 `trace.zip`

因 `test.describe.serial`，本失败还导致同文件其余 **22** 条 **did not run**。

## 上一轮点名、本轮证据变化

| 条 | 本轮证据 |
|---|---|
| 「目录 UI…导出 HTML、网页包、PDF、PPTX」 | **本轮全量红**（3.1m）。RECHECK-7 曾绿。新红在 PPTX `"静态导出提示"`。不要回滚 EXPORT；不要当无新证据。 |
| 「简洁模式…试运行」 | **本轮也红**（21.7s，`:886` alpha）。RECHECK-7 曾绿。有证据但 **不要预修**。 |
| CoursePlayer 宿主；Player 与编辑交互层；统一画布；流程 1–4；文字编辑事务；P0 双击；V8 全局层；Component API 4 全局组件；Runtime/Component 导出 | **未跑**（serial 停在简洁模式）。不要当本轮实锤重开那些刀。 |
| render-host-benchmark；catalog 离线 HTML/网页包 | 全量仍绿。不要重开 |

## 点名风险本轮未踩到（不要当本轮实锤）

因 serial 停在简洁模式，**没有新失败证据**。原样记录：

| 风险 | 本轮证据 | 只读现状 |
|---|---|---|
| 「Runtime API 2 / Component API 4 导出」 | **未跑** | EXPORT 定向曾绿（53.8s）。全量未复验。**不要**标 `R8F-RUNTIME-EXPORT-01` verified |
| 整课预览 overlay（`course-preview-host`，不是新窗口） | **未跑** | spec 已有 `openCoursePreviewOverlay`。无新证据，不要预修 |

不要因为本轮没跑到就重开 SELECT-TAB / SCENE-LAYER / IMPORT / TEXT-TXN / COMP-DBLCLICK / COMP-XFORM / GLOBAL-TEXT / GLOBAL-LAYER-POS / GLOBAL-SCENE-LABEL / SLIDE-PREVIEW-COMP / FIX-E2E-EXPORT。

## 未跑标题（23）

`editor.spec.ts` serial，简洁模式失败后：

1. 里程碑闭环：专业模式创建、复制、排序规则并修改受控运行时
2. 当前位置试运行：CoursePlayer 宿主可见且可互动
3. Player 与编辑交互层在 100%、150% 和重置后保持同位
4. 统一画布：场景/全局运行时文字与图片可原位编辑并往返
5. 流程 1：场景新增、排序与删除
6. 流程 2：中文文本、位置、样式与工程往返
7. 文字编辑事务：resize、属性栏、切换节点、字体、IME 与撤销
8. P0：画布真实双击可持续输入、失焦单次提交且 Escape 取消
9. 流程 3：节点层级排序与撤销
10. 流程 4：组件导入、保存重开与预览交互
11. V8 全局层：原生元素、双击文字、保存重开与跨场景可见性
12. Component API 4 全局组件：组件范围、全部文案、保存重开与预览可见性
13. Runtime API 2 / Component API 4 导出：等待 DOM 运行时后生成 PDF，并在 PPTX 保留动态层、全局 visibility 与原生文字
14. 整课预览：后台教师控制器可拖动、键盘细移并保持会话位置
15. 流程 5：Presenter 在单 HTML 与网页包均可离线翻页
16. 媒体批量与连续插入：排布、入库、页签和单次撤销
17. 补充流程：图片导入、替换与工程往返
18. 流程 6：箭头、大括号与多选对齐
19. 流程 7：两页课件导出 PDF 与 PPTX
20. 流程 8：字体与局部富文本在内容编辑后保持同步
21. 流程 8B：V8 着重号与语义公式跨表面导出证据
22. 流程 9：未保存课件自动恢复
23. 课例验收：三页光合作用课例可离线互动

## 建议下一刀（按文件；本任务不修）

本轮只把 **第一条失败** 回派。不要预修简洁模式。不要预修 serial 未跑条。不要跑 Vitest 修 `v9GlobalLayerUiAdapter`。不要回滚 EXPORT。

### A. 本轮实锤 — 目录 UI PPTX 缺「静态导出提示」

| 文件 | 建议 |
|---|---|
| `src/renderer/export/buildPptx.ts` 和/或纯 Slide `handleExportPptx` 旁路 | **不要** skip / 不要放宽未授权断言 / 不要静默打开 V8 / **不要回滚** EXPORT 的 V9 夹具与 Runtime 导出切流。目录 UI 导出的纯 Slide PPTX 快照已成功，`addPptxWarnings` 未写「静态导出提示」，而 `componentCatalogMatrix.spec.ts:815` 仍要求该子串。在**不撤回** `buildPptx` 动态层快照的前提下，让该导出路径仍带教师可见的静态导出提示（或与现有断言对齐的等价横幅）。窄复跑 `-g "目录 UI"`。 |
| `tests/e2e/componentCatalogMatrix.spec.ts` | **不要**为绿改成 skip 或删掉 `"静态导出提示"` 断言，除非协调者另派测试跟切且教师同意。本任务禁止改 spec。 |

不要为绿 skip。不要重开 Component API 4 全局组件 / V8 全局层 / 流程 4 / 交互层 / 统一画布 / 流程 1 / 文字编辑事务 / P0 双击 / 流程 3。不要重开 R8-FIX-E2E-EXPORT。

### B. 已跑第二条、不要预修

「简洁模式…试运行」`:886` 本轮有证据，但按规则不派本刀。等 A 清零后再全量 `npm run test:e2e`。若仍红，再按失败标题派。

### C. 未跑、可能下一红（本轮无新证据）

仍在 `tests/e2e/editor.spec.ts` serial。优先等 A 清零后再全量。点名过的「整课预览：后台教师控制器…」本轮无证据，不要预修。

## 给协调者

1. R8-F-RECHECK-8 唯一授权命令 **exit 1**，状态 **`blocked`**。不要领取 R8-G。
2. 「Runtime API 2 / Component API 4 导出」本轮 **did not run**。**不要**将 `R8F-RUNTIME-EXPORT-01` 标 `verified`（本任务不改账本）。
3. 第一条失败是「目录 UI」PPTX 缺「静态导出提示」。回派 A。不要回滚 R8-FIX-E2E-EXPORT。
4. 简洁模式本轮也红，有证据但不要预修。RECHECK-7 已关条目除目录 UI / 简洁模式外本轮未复跑，不要当红。
5. 必须保留：SLIDE-PREVIEW-COMP 可见后备、SCENE-LABEL `scene.name`、GLOBAL-LAYER-POS / GLOBAL-TEXT、COMP-*、TEXT-TXN、IMPORT、SCENE-LAYER、SELECT-TAB、FIX-E2E、EXPORT。
6. 禁止为绿而 skip / 放宽未授权断言 / 新建 §5 spec / 静默打开 V8。
7. 不要宣称项目级 engineering candidate（留给 R8-Z 在机器全绿后写）。
8. 已知非本轮：`v9GlobalLayerUiAdapter` reorder/controller-move 单测。不要顺手派 Vitest。

## 未跑集合（R8-F-RECHECK-8 授权外）

- `check:ai-capabilities` / `typecheck`（R8-C）
- `npm test`（R8-D）
- `build:desktop`（R8-E 已交；本任务 pretest 自己构建了 player/renderer/electron，未再跑 `build:desktop`）
- 三视口视觉（R8-G）— **未领取**
- 17 项真实体验（R8-H）
- `npm run verify` / `verify:full` / `npm run build`
- 未写 `artifacts/FINAL_GATE_REPORT.md`（R8-Z）

R8-F-RECHECK-8 不领取 R8-G。quality 保持 `unverified`。禁止 art/accepted。禁止项目级 engineering candidate。
