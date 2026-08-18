HANDOFF
- task: R8-F-RECHECK-12
- planning pack path: `C:\Users\74755\Documents\HTML课件编辑器\docs\tasks\v8-to-v9-rebuild`
- product worktree / branch / baseline SHA: `C:\Users\74755\Documents\HTML课件编辑器-v8-to-v9-rebuild` / `codex/v8-to-v9-rebuild` / `f27275658c6dfaa12f2ce35cd9368dcdebe99451`
- outcome: 只在产品 worktree 运行一次 `npm run test:e2e`（含 `pretest:e2e`）。**exit 1。** 墙钟 **1264175 ms**（`00:21:04.175`）。Playwright：**22 passed / 2 failed / 0 skipped / 3 did not run**（27 条，1 worker）。「里程碑闭环：简洁模式…试运行」本轮全量绿（33.5s）；协调者**可将** `R8F-SIMPLE-FADE-01` 标 verified（本任务不改账本）。不要回滚 R8-FIX-SIMPLE-FADE。「补充流程：图片导入、替换与工程往返」本轮全量绿（1.4m）；协调者**可将** `R8F-IMAGE-ASPECT-01` 标 verified。不要回滚 R8-FIX-IMAGE-ASPECT。R8-FIX-PRESENTER-HTML / CATALOG-PPTX / E2E-EXPORT **不要回滚**。**第一条失败**是 `editor.spec.ts` serial「流程 8：字体与局部富文本在内容编辑后保持同步」（58.4s）：局部格式 overlay 已关后，属性栏 `.form-textarea` 30s 内未出现。同 describe 其后 3 条未跑。第二条（另一文件，不派本刀）`render-host-benchmark` 因本机 Chromium headless shell 可执行文件缺失 19ms 即红；**不要预修、不要 skip、不要 `npx playwright install`**。必须保留：SIMPLE-FADE；IMAGE-ASPECT；PRESENTER-HTML；CATALOG-PPTX；E2E-EXPORT；SLIDE-PREVIEW-COMP；SCENE-LABEL；GLOBAL-*；COMP-*；TEXT-TXN；IMPORT；SCENE-LAYER；SELECT-TAB；FIX-E2E。未改任何产品源码/测试。未 skip。未 commit。未另跑 `build:desktop` / `npm test` / typecheck / `verify`。未领取 R8-G/H/Z。未宣称 art/accepted，未宣称项目级 engineering candidate。Electron 槽已释放。
- owned files changed:
  - 产品 worktree 源码：无（只读）
  - 产品 worktree 生成：`pretest:e2e` 刷新 `dist-*` / examples / fixtures（未 commit）；失败附件在默认 `test-results/`（未 commit）
  - 计划侧：本 HANDOFF；`00_INDEX.md` 本行状态
- donor files/functions consulted:
  - [`handoffs/R8-F-RECHECK-11.md`](R8-F-RECHECK-11.md)、[`handoffs/R8-FIX-SIMPLE-FADE.md`](R8-FIX-SIMPLE-FADE.md)
  - `10_R8_FINAL_FULL_GATE.md` §11.6
  - 产品 `package.json` `"test:e2e"`；`playwright.config.ts` `workers: 1`
  - 只读定位：`tests/e2e/editor.spec.ts:2694` / `:2726`；overlay `Control+Enter` 后 `toHaveCount(0)` 已过；`.form-textarea` 来自 `PropertiesTab.tsx` `TextContentTextarea`（`label="文字内容"`），仅 `node.type === 'text'` 时渲染
- focused validation command:
  ```
  npm run test:e2e
  ```
  工作目录：产品 worktree。Windows PowerShell。`VITE_DEV_SERVER_URL` unset。未再单独跑 `build:desktop`。未合成 `verify`。未另开手工 App。未抢 `:5173`。e2e 使用 spec 内临时 `--user-data-dir`（`electron-profile-${pid}`）。
- validation result: **blocked。** `NPM_TEST_E2E_EXIT:1`。`NPM_TEST_E2E_MS:1264175`（`00:21:04.175`）。Playwright 摘要：`2 failed` / `3 did not run` / `22 passed (20.9m)`。Playwright **1.61.1**。

  ### 开始前环境（产品 worktree，跑命令前）

  | 项 | 值 |
  |---|---|
  | `git branch --show-current` | `codex/v8-to-v9-rebuild` |
  | `git rev-parse HEAD` | `f27275658c6dfaa12f2ce35cd9368dcdebe99451` |
  | `node --version` | `v24.14.0` |
  | `npm --version` | `11.9.0` |
  | `git status --short` | 脏树未提交 R6–R8 改动，含 SIMPLE-FADE（`editorStore.ts`）/ IMAGE-ASPECT（`stageViewportTransform.ts` / `workspaceSlideAuthoring.ts`）/ PRESENTER-HTML / CATALOG-PPTX / E2E-EXPORT / SLIDE-PREVIEW-COMP / SCENE-LABEL / GLOBAL-* / COMP-* / TEXT-TXN / IMPORT / SCENE-LAYER / SELECT-TAB / FIX-E2E。本任务未触碰源码/测试。 |
  | Electron 槽 | 无 `electron.exe`。未另开手工 App。跑完后仍无。 |
  | `:5173` | 无 LISTENING。本任务未杀、未占用。跑完后仍无 LISTENING。 |
  | `:5174` / `:5175` | 空闲。 |

  ### 命令结果

  | # | 段 | 是否到达 | exit | 耗时 | 首个错误 |
  |---|---|---|---|---|---|
  | pretest | `build:player` → examples → lesson-demo → render-benchmark → catalog-matrix → `build:renderer` → `build:electron` | **是** | 链式继续 | 含在墙钟内；player Vite **1.33s**；renderer Vite **2.52s** | 无。仅 WARN：player `inlineDynamicImports`；renderer chunk > 500 kB |
  | 整条 | `npm run test:e2e` | 是 | **1** | **1264175 ms** | 见下「第一条失败」 |
  | Playwright | `Running 27 tests using 1 worker` | 是 | 1 | 报告 **20.9m** | 2 failed |

  | 计数 | 值 |
  |---|---|
  | passed | **22** |
  | failed | **2** |
  | skipped（`test.skip` 命中） | **0** |
  | did not run | **3**（`editor.spec.ts` `test.describe.serial`：流程 8 失败后同 describe 剩余 3 条未执行；catalog 2 条全绿；`render-host-benchmark` 在另一文件仍跑到并红） |
  | 合计 | **27** |

  绿的 22 条：

  1. `componentCatalogMatrix.spec.ts` › 生成物的单 HTML 与网页包离线运行四组件、状态覆盖和 100 次压力翻页（5.6s）
  2. `componentCatalogMatrix.spec.ts` › **目录 UI** 按需嵌入、编辑/重开/缩略图/Player，并真实导出 HTML、网页包、PDF、PPTX（**2.9m**）← 全量仍绿；不要回滚 CATALOG-PPTX
  3. `editor.spec.ts` › **里程碑闭环：简洁模式完成文字、透明度、左起竖排与出现动画试运行**（**33.5s**）← 本轮全量绿；可将 `R8F-SIMPLE-FADE-01` 标 verified
  4. `editor.spec.ts` › 里程碑闭环：专业模式创建、复制、排序规则并修改受控运行时（34.2s）
  5. `editor.spec.ts` › 当前位置试运行：CoursePlayer 宿主可见且可互动（21.8s）
  6. `editor.spec.ts` › Player 与编辑交互层在 100%、150% 和重置后保持同位（57.8s）
  7. `editor.spec.ts` › 统一画布：场景/全局运行时文字与图片可原位编辑并往返（48.6s）
  8. `editor.spec.ts` › 流程 1：场景新增、排序与删除（9.8s）
  9. `editor.spec.ts` › 流程 2：中文文本、位置、样式与工程往返（34.7s）
  10. `editor.spec.ts` › 文字编辑事务：resize、属性栏、切换节点、字体、IME 与撤销（55.4s）
  11. `editor.spec.ts` › P0：画布真实双击可持续输入、失焦单次提交且 Escape 取消（25.4s）
  12. `editor.spec.ts` › 流程 3：节点层级排序与撤销（40.4s）
  13. `editor.spec.ts` › 流程 4：组件导入、保存重开与预览交互（43.9s）
  14. `editor.spec.ts` › V8 全局层：原生元素、双击文字、保存重开与跨场景可见性（1.4m）
  15. `editor.spec.ts` › Component API 4 全局组件：组件范围、全部文案、保存重开与预览可见性（1.1m）
  16. `editor.spec.ts` › Runtime API 2 / Component API 4 导出：等待 DOM 运行时后生成 PDF，并在 PPTX 保留动态层、全局 visibility 与原生文字（55.3s）
  17. `editor.spec.ts` › 整课预览：后台教师控制器可拖动、键盘细移并保持会话位置（30.0s）
  18. `editor.spec.ts` › 流程 5：Presenter 在单 HTML 与网页包均可离线翻页（1.1m）
  19. `editor.spec.ts` › 媒体批量与连续插入：排布、入库、页签和单次撤销（58.2s）
  20. `editor.spec.ts` › **补充流程：图片导入、替换与工程往返**（**1.4m**）← 本轮全量绿；可将 `R8F-IMAGE-ASPECT-01` 标 verified
  21. `editor.spec.ts` › 流程 6：箭头、大括号与多选对齐（1.5m）
  22. `editor.spec.ts` › 流程 7：两页课件导出 PDF 与 PPTX（1.2m）

  红的 2 条（本轮实际跑到）：

  1. **第一条：** `editor.spec.ts` › **流程 8：字体与局部富文本在内容编辑后保持同步**（**58.4s**）← 详见下方
  2. `render-host-benchmark.spec.ts` › Project V8 五种渲染路径可离线互动且反复切换不泄漏宿主（19ms）← 本轮也红；**不要预修**；详见「第二条（已跑，不派本刀）」

- validation entry / fixture / backend:
  - entry: 仓库默认 `playwright test`（`tests/e2e/` 三个 spec）
  - fixture: pretest 生成 photosynthesis lesson、render-host-benchmark HTML、component-catalog V8 矩阵；editor `beforeAll` 从 `examples/sample-project.h5lesson`（schema 8）克隆；简洁模式条 `launchEditor({ mode: 'simple' })`；流程 8 默认专业模式添加文字后改字体/局部格式再填 `.form-textarea`
  - backend: 成熟 V8 App 表面 + Course Project V9 默认真相（CUT 后）；打开 V8 必须显式导入；catalog/render-host 夹具仍是 Project V8 离线物
- validation proves / does not prove:
  - proves: 当前脏树上 **一次** `npm run test:e2e` 跑完且 **exit 1**；简洁模式与图片导入全量绿；第一条失败标题与首错如下
  - does not prove: 未执行的 3 条 editor 路径（流程 8B、流程 9、课例验收）；三视口、17 项体验、typecheck、Vitest、教师验收。自动化不得宣称 art/accepted，也不得宣称项目级 engineering candidate。
- narrow UI smoke, if authorized: 未授权。未另开手工窗口。本任务就是全量现有 e2e。
- INTEGRATION_REQUESTS: 无。本任务不写源码。失败回派见下。协调者可将 `R8F-SIMPLE-FADE-01` 与 `R8F-IMAGE-ASPECT-01` 标 `verified`。本任务不改账本。
- DECISION_REQUESTS: 无。
- remaining risks / untested full checks:
  - 未跑：`check:ai-capabilities`、`typecheck`、`npm test`、三视口、17 项体验、`npm run verify` / `verify:full`、`build:desktop`（本任务禁止再跑）
  - `editor.spec.ts` 3 条因 serial 中止未跑：流程 8B、流程 9、课例验收
  - 第二条 `render-host-benchmark` 本轮环境红（Chromium headless shell 缺失）；不要预修、不要当本刀
  - `v9GlobalLayerUiAdapter` 有一条 reorder/controller-move 单测可能红。本任务不跑 Vitest、不修它
  - 现有 e2e **没有** Flow / Spatial / Mixed / 七组合 / V8 显式导入拒绝 / DOCX 规格。本任务不为缺口新建 spec
  - 未领取 R8-G
- rollback point: 产品 HEAD 仍为 `f27275658c6dfaa12f2ce35cd9368dcdebe99451`。R8-F-RECHECK-12 无产品源码改动可回滚。`test-results/` 与 `dist-*` 未 commit。**不要回滚** R8-FIX-SIMPLE-FADE / R8-FIX-IMAGE-ASPECT / R8-FIX-PRESENTER-HTML / R8-FIX-CATALOG-PPTX / R8-FIX-E2E-EXPORT / SLIDE-PREVIEW-COMP / GLOBAL-SCENE-LABEL / GLOBAL-LAYER-POS / GLOBAL-TEXT / COMP-* / TEXT-TXN / IMPORT / SCENE-LAYER / SELECT-TAB / FIX-E2E。
- execution state: `blocked`
- integration state: `n/a`
- quality state: `unverified`

## 第一条失败 spec（标题 + 首错）

### 1. `tests/e2e/editor.spec.ts:2694`

**标题：** 互动课件编辑器 1.0 / Project V8 收敛 › 流程 8：字体与局部富文本在内容编辑后保持同步

**耗时：** 58.4s；添加文字、属性栏字体 KaiTi、加粗、「编辑局部文字格式」、局部加粗/删除线/着重号/高亮、`Control+Enter` 关闭 overlay（`toHaveCount(0)` 已过）均已过；死在随后 `.form-textarea`.fill

**file:line：** `tests/e2e/editor.spec.ts:2726`

**期望：** `page.locator('.form-textarea')` 在默认 30s 内可 `fill('双击编辑文字！')`

**收到：** `TimeoutError: locator.fill: Timeout 30000ms exceeded.` Call log：`waiting for locator('.form-textarea')`

**首错：**

```
TimeoutError: locator.fill: Timeout 30000ms exceeded.
Call log:
  - waiting for locator('.form-textarea')
```

断言：

```
2725 |       const content = page.locator('.form-textarea')
  > 2726 |       await content.fill('双击编辑文字！')
         |                     ^
```

**只读定位：** overlay 关闭后属性栏 30s 内没有 `.form-textarea`。该类名只出现在 `PropertiesTab.tsx` 的 `TextContentTextarea`（`aria-label`/`label`「文字内容」），且仅当选中 `node.type === 'text'` 时渲染。可能是 Control+Enter 提交后选中丢失或属性面板不再投影文本节点。不要 skip。不要放宽 timeout。不要改 spec 去点 overlay 代替 `.form-textarea`。不要预修流程 8B / 流程 9 / 课例验收 / render-host-benchmark。不要回滚 SIMPLE-FADE / IMAGE-ASPECT / PRESENTER-HTML / CATALOG-PPTX / EXPORT。

不要回滚 SLIDE-PREVIEW-COMP / SCENE-LABEL / GLOBAL-* / COMP-* / TEXT-TXN / IMPORT / SCENE-LAYER / SELECT-TAB / FIX-E2E。

**窄复跑（owner 用，不要全量 e2e）：**

```
npx playwright test tests/e2e/editor.spec.ts -g "流程 8：字体与局部富文本"
```

**附件（未 commit）：**

- `test-results/editor-互动课件编辑器-1-0-Project-V8-收敛-流程-8：字体与局部富文本在内容编辑后保持同步/error-context.md`
- 同目录 `trace.zip`

因 `test.describe.serial`，本失败还导致同文件其后 **3** 条 **did not run**。catalog 无剩余。`render-host-benchmark` 仍跑到（见下，本轮环境红）。

## 第二条（已跑，不派本刀）

### `tests/e2e/render-host-benchmark.spec.ts:52`

**标题：** Project V8 五种渲染路径可离线互动且反复切换不泄漏宿主

**耗时：** 19ms

**首错：** `browserType.launch: Executable doesn't exist at C:\Users\74755\AppData\Local\ms-playwright\chromium_headless_shell-1228\chrome-headless-shell-win64\chrome-headless-shell.exe`。提示 `npx playwright install`。

本任务**不修、不 skip、不安装浏览器、不预修**。RECHECK-10/11 该条曾绿。不是第一条失败。

## 上一轮点名、本轮证据变化

| 条 | 本轮证据 |
|---|---|
| 「里程碑闭环：简洁模式…试运行」 | **本轮全量绿**（33.5s）。可将 `R8F-SIMPLE-FADE-01` 标 verified。不要回滚 SIMPLE-FADE。 |
| 「补充流程：图片导入、替换与工程往返」 | **本轮全量绿**（1.4m）。可将 `R8F-IMAGE-ASPECT-01` 标 verified。不要回滚 IMAGE-ASPECT。 |
| 「目录 UI…导出 HTML、网页包、PDF、PPTX」 | **本轮全量绿**（2.9m）。不要回滚 CATALOG-PPTX。 |
| 「流程 5：Presenter…离线翻页」 | **本轮全量绿**（1.1m）。不要回滚 PRESENTER-HTML。 |
| 「Runtime API 2 / Component API 4 导出」 | **本轮全量绿**（55.3s）。不要回滚 EXPORT。 |
| 「流程 8：字体与局部富文本…」 | **本轮全量红**（58.4s）。新首红。按实锤回派。 |
| 专业模式；CoursePlayer；交互层；统一画布；流程 1–4、6–7；文字编辑事务；P0 双击；V8 全局层；Component API 4 全局组件；整课预览；媒体批量 | **本轮全量绿**。不要重开那些刀。 |
| render-host-benchmark | **本轮环境红**（19ms，Chromium 可执行文件缺失）。不要预修、不要当本刀。 |

## 点名风险本轮未踩到（不要当本轮实锤）

| 风险 | 本轮证据 | 只读现状 |
|---|---|---|
| 流程 8B 着重号/公式跨表面导出 | **未跑** | 不要预修 |
| 流程 9 未保存自动恢复 | **未跑** | 不要预修 |
| 课例验收光合作用 | **未跑** | 不要预修 |
| render-host Chromium 缺失 | **已跑且红，但不是第一条** | 不要预修、不要 `playwright install`、不要 skip |

不要因为本轮没跑到就重开 IMAGE-ASPECT / SIMPLE-FADE / PRESENTER-HTML / CATALOG-PPTX / SELECT-TAB / SCENE-LAYER / IMPORT / TEXT-TXN / COMP-DBLCLICK / COMP-XFORM / GLOBAL-TEXT / GLOBAL-LAYER-POS / GLOBAL-SCENE-LABEL / SLIDE-PREVIEW-COMP / FIX-E2E-EXPORT。

## 未跑标题（3）

`editor.spec.ts` serial，流程 8 失败后：

1. 流程 8B：V8 着重号与语义公式跨表面导出证据
2. 流程 9：未保存课件自动恢复
3. 课例验收：三页光合作用课例可离线互动

## 建议下一刀（按文件；本任务不修）

本轮只把 **第一条失败** 回派。不要预修 serial 未跑条。不要预修 render-host-benchmark。不要跑 Vitest 修 `v9GlobalLayerUiAdapter`。不要回滚 SIMPLE-FADE / IMAGE-ASPECT / PRESENTER-HTML / CATALOG-PPTX / EXPORT。

### A. 本轮实锤 — 流程 8 overlay 关闭后无 `.form-textarea`

| 文件 | 建议 |
|---|---|
| 属性栏文本内容 / 选中投影（`PropertiesTab` `TextContentTextarea`；V9 提交 canvas 局部格式后仍保持 text 选中并渲染「文字内容」） | **不要** skip / 不要放宽 `:2726` timeout / **不要**把 fill 改成 overlay。让 Control+Enter 关闭 overlay 后属性栏仍出现 `.form-textarea`。窄复跑 `-g "流程 8：字体与局部富文本"`。 |
| `tests/e2e/editor.spec.ts` | **不要**为绿改成 skip 或换 locator，除非协调者另派测试跟切且教师同意。本任务禁止改 spec。 |

不要为绿 skip。不要重开简洁模式 / 图片导入 / 目录 UI / 流程 5 / 导出条 / Component API 4 全局组件 / V8 全局层 / 流程 4 / 交互层 / 统一画布 / 流程 1–3 / 6–7 / 文字编辑事务 / P0 双击 / 整课预览 / 媒体批量。

### B. 未跑、可能下一红（本轮无新证据）

仍在 `tests/e2e/editor.spec.ts` serial。优先等 A 清零后再全量。不要预修流程 8B / 流程 9 / 课例验收。不要把第二条 Chromium 缺失派成下一刀。

## 给协调者

1. R8-F-RECHECK-12 唯一授权命令 Playwright **2 failed**，状态 **`blocked`**。不要领取 R8-G。
2. 「简洁模式」本轮 **全量绿**（33.5s）。**可将** `R8F-SIMPLE-FADE-01` 标 `verified`。不要回滚 SIMPLE-FADE。
3. 「图片导入」本轮 **全量绿**（1.4m）。**可将** `R8F-IMAGE-ASPECT-01` 标 `verified`。不要回滚 IMAGE-ASPECT。
4. 「目录 UI」本轮仍绿（2.9m）。不要回滚 CATALOG-PPTX。
5. 第一条失败是「流程 8」overlay 关闭后 `.form-textarea` 30s 未出现。回派 A。
6. 第二条 `render-host-benchmark` Chromium 缺失：**不要预修、不要当本刀**。
7. 必须保留：SIMPLE-FADE 的「选淡入不自动播、预览才播」；IMAGE-ASPECT 的 `resizeWorldFrameFromHandlePreservingAspect` 与 `previewResize` 锁比；PRESENTER-HTML 的 `#course-root` + `__H5_LESSON_PLAYER__` 桥、作者字号、`.slide-published-adapter` locator、`> 0.05`；CATALOG-PPTX 成功路径「静态导出提示」；EXPORT V9 夹具与纯 Slide `buildPptx`；SLIDE-PREVIEW-COMP 可见后备；SCENE-LABEL `scene.name`；GLOBAL-LAYER-POS / GLOBAL-TEXT；COMP-*；TEXT-TXN；IMPORT；SCENE-LAYER；SELECT-TAB；FIX-E2E。
8. 禁止为绿而 skip / 放宽未授权断言 / 新建 §5 spec / 静默打开 V8。
9. 不要宣称项目级 engineering candidate（留给 R8-Z 在机器全绿后写）。
10. 已知非本轮：`v9GlobalLayerUiAdapter` reorder/controller-move 单测。不要顺手派 Vitest。

## 未跑集合（R8-F-RECHECK-12 授权外）

- `check:ai-capabilities` / `typecheck`（R8-C）
- `npm test`（R8-D）
- `build:desktop`（R8-E 已交；本任务 pretest 自己构建了 player/renderer/electron，未再跑 `build:desktop`）
- 三视口视觉（R8-G）— **未领取**
- 17 项真实体验（R8-H）
- `npm run verify` / `verify:full` / `npm run build`
- 未写 `artifacts/FINAL_GATE_REPORT.md`（R8-Z）

R8-F-RECHECK-12 不领取 R8-G。quality 保持 `unverified`。禁止 art/accepted。禁止项目级 engineering candidate。
