HANDOFF
- task: R8-F-RECHECK-9
- planning pack path: `C:\Users\74755\Documents\HTML课件编辑器\docs\tasks\v8-to-v9-rebuild`
- product worktree / branch / baseline SHA: `C:\Users\74755\Documents\HTML课件编辑器-v8-to-v9-rebuild` / `codex/v8-to-v9-rebuild` / `f27275658c6dfaa12f2ce35cd9368dcdebe99451`
- outcome: 只在产品 worktree 运行一次 `npm run test:e2e`（含 `pretest:e2e`）。**exit 1。** 墙钟 **900750 ms**（`00:15:00.750`）。Playwright：**18 passed / 1 failed / 0 skipped / 8 did not run**（27 条，1 worker）。「目录 UI」本轮全量绿（3.3m）；协调者**可将** `R8F-CATALOG-PPTX-01` 标 verified（本任务不改账本）。「Runtime API 2 / Component API 4 导出」本轮**已跑且绿**（53.7s）；协调者**可将** `R8F-RUNTIME-EXPORT-01` 标 verified（本任务不改账本）。R8-FIX-CATALOG-PPTX **不要回滚、不要重开**。R8-FIX-E2E-EXPORT **不要回滚**。RECHECK-8 第二条「简洁模式…试运行」本轮全量绿（32.8s），**不要重开**。**第一条失败**是 `editor.spec.ts` serial「流程 5：Presenter 在单 HTML 与网页包均可离线翻页」（1.2m）：打开导出单 HTML 后 `playerSceneIndex` 期望 `0`，收到 `null`（`window.__H5_LESSON_PLAYER__` 未挂）。同 describe 其后 8 条未跑。`render-host-benchmark` 仍绿。必须保留：E2E-EXPORT V9 夹具与纯 Slide `buildPptx` 切流；SLIDE-PREVIEW-COMP；SCENE-LABEL；GLOBAL-*；COMP-*；TEXT-TXN；IMPORT；SCENE-LAYER；SELECT-TAB；FIX-E2E；CATALOG-PPTX。未改任何产品源码/测试。未 skip。未 commit。未另跑 `build:desktop` / `npm test` / typecheck / `verify`。未领取 R8-G/H/Z。未宣称 art/accepted，未宣称项目级 engineering candidate。Electron 槽已释放。
- owned files changed:
  - 产品 worktree 源码：无（只读）
  - 产品 worktree 生成：`pretest:e2e` 刷新 `dist-*` / examples / fixtures（未 commit）；失败附件在默认 `test-results/`（未 commit）
  - 计划侧：本 HANDOFF；`00_INDEX.md` 本行状态
- donor files/functions consulted:
  - [`handoffs/R8-F-RECHECK-8.md`](R8-F-RECHECK-8.md)、[`handoffs/R8-FIX-CATALOG-PPTX.md`](R8-FIX-CATALOG-PPTX.md)
  - `10_R8_FINAL_FULL_GATE.md` §11.6
  - 产品 `package.json` `"test:e2e"`；`playwright.config.ts` `workers: 1`
  - 只读定位：`tests/e2e/editor.spec.ts:2169` / `:2266` / `:354` / `:342`；`App.tsx` `buildHtml` → `buildPublishedCourseStandaloneHtml`（`#course-root`）；`src/player/index.ts` `bootstrapPublishedCourse` 走 `createPublishedCourseSession`，**不**写 `window.__H5_LESSON_PLAYER__`
- focused validation command:
  ```
  npm run test:e2e
  ```
  工作目录：产品 worktree。Windows PowerShell。`VITE_DEV_SERVER_URL` unset。未再单独跑 `build:desktop`。未合成 `verify`。未另开手工 App。未抢 `:5173`。e2e 使用 spec 内临时 `--user-data-dir`（`electron-profile-${pid}`）。
- validation result: **blocked。** `NPM_TEST_E2E_EXIT:1`。`NPM_TEST_E2E_MS:900750`（`00:15:00.750`）。Playwright 摘要：`1 failed` / `8 did not run` / `18 passed (14.8m)`。Playwright **1.61.1**。

  ### 开始前环境（产品 worktree，跑命令前）

  | 项 | 值 |
  |---|---|
  | `git branch --show-current` | `codex/v8-to-v9-rebuild` |
  | `git rev-parse HEAD` | `f27275658c6dfaa12f2ce35cd9368dcdebe99451` |
  | `node --version` | `v24.14.0` |
  | `npm --version` | `11.9.0` |
  | `git status --short` | 脏树未提交 R6–R8 改动，含 CATALOG-PPTX / E2E-EXPORT / SLIDE-PREVIEW-COMP / SCENE-LABEL / GLOBAL-* / COMP-* / TEXT-TXN / IMPORT / SCENE-LAYER / SELECT-TAB / FIX-E2E。本任务未触碰源码/测试。 |
  | Electron 槽 | 无 `electron.exe`。未另开手工 App。跑完后仍无。 |
  | `:5173` | 无 LISTENING。本任务未杀、未占用。跑完后仍无 LISTENING。 |
  | `:5174` / `:5175` | 空闲。 |

  ### 命令结果

  | # | 段 | 是否到达 | exit | 耗时 | 首个错误 |
  |---|---|---|---|---|---|
  | pretest | `build:player` → examples → lesson-demo → render-benchmark → catalog-matrix → `build:renderer` → `build:electron` | **是** | 链式继续 | 含在墙钟内；player Vite **1.42s**；renderer Vite **2.83s** | 无。仅 WARN：player `inlineDynamicImports`；renderer chunk > 500 kB |
  | 整条 | `npm run test:e2e` | 是 | **1** | **900750 ms** | 见下「第一条失败」 |
  | Playwright | `Running 27 tests using 1 worker` | 是 | 1 | 报告 **14.8m** | 1 failed |

  | 计数 | 值 |
  |---|---|
  | passed | **18** |
  | failed | **1** |
  | skipped（`test.skip` 命中） | **0** |
  | did not run | **8**（`editor.spec.ts` `test.describe.serial`：流程 5 失败后同 describe 剩余 8 条未执行；catalog 2 条全绿；`render-host-benchmark` 在另一文件仍跑完） |
  | 合计 | **27** |

  绿的 18 条：

  1. `componentCatalogMatrix.spec.ts` › 生成物的单 HTML 与网页包离线运行四组件、状态覆盖和 100 次压力翻页（5.1s）
  2. `componentCatalogMatrix.spec.ts` › **目录 UI** 按需嵌入、编辑/重开/缩略图/Player，并真实导出 HTML、网页包、PDF、PPTX（**3.3m**）← 全量绿；可将 `R8F-CATALOG-PPTX-01` 标 verified
  3. `editor.spec.ts` › 里程碑闭环：**简洁模式**完成文字、透明度、左起竖排与出现动画试运行（32.8s）← RECHECK-8 第二条本轮绿，不要重开
  4. `editor.spec.ts` › 里程碑闭环：专业模式创建、复制、排序规则并修改受控运行时（33.5s）
  5. `editor.spec.ts` › 当前位置试运行：CoursePlayer 宿主可见且可互动（21.5s）
  6. `editor.spec.ts` › Player 与编辑交互层在 100%、150% 和重置后保持同位（57.8s）
  7. `editor.spec.ts` › 统一画布：场景/全局运行时文字与图片可原位编辑并往返（48.4s）
  8. `editor.spec.ts` › 流程 1：场景新增、排序与删除（11.4s）
  9. `editor.spec.ts` › 流程 2：中文文本、位置、样式与工程往返（27.4s）
  10. `editor.spec.ts` › 文字编辑事务：resize、属性栏、切换节点、字体、IME 与撤销（53.8s）
  11. `editor.spec.ts` › P0：画布真实双击可持续输入、失焦单次提交且 Escape 取消（19.9s）
  12. `editor.spec.ts` › 流程 3：节点层级排序与撤销（31.6s）
  13. `editor.spec.ts` › 流程 4：组件导入、保存重开与预览交互（40.5s）
  14. `editor.spec.ts` › V8 全局层：原生元素、双击文字、保存重开与跨场景可见性（1.3m）
  15. `editor.spec.ts` › Component API 4 全局组件：组件范围、全部文案、保存重开与预览可见性（1.1m）
  16. `editor.spec.ts` › **Runtime API 2 / Component API 4 导出**：等待 DOM 运行时后生成 PDF，并在 PPTX 保留动态层、全局 visibility 与原生文字（**53.7s**）← 本轮已跑且绿；可将 `R8F-RUNTIME-EXPORT-01` 标 verified
  17. `editor.spec.ts` › 整课预览：后台教师控制器可拖动、键盘细移并保持会话位置（21.6s）
  18. `render-host-benchmark.spec.ts` › Project V8 五种渲染路径可离线互动且反复切换不泄漏宿主（15.1s）

  红的 1 条：

  1. **第一条（唯一）：** `editor.spec.ts` › **流程 5：Presenter 在单 HTML 与网页包均可离线翻页**（**1.2m**）← 详见下方

- validation entry / fixture / backend:
  - entry: 仓库默认 `playwright test`（`tests/e2e/` 三个 spec）
  - fixture: pretest 生成 photosynthesis lesson、render-host-benchmark HTML、component-catalog V8 矩阵；editor `beforeAll` 从 `examples/sample-project.h5lesson`（schema 8）克隆；流程 5 在 Electron 内新建两页文字后 `export-single-html` / `export-web-package`，再用 Chromium `file://` 打开导出物
  - backend: 成熟 V8 App 表面 + Course Project V9 默认真相（CUT 后）；打开 V8 必须显式导入；catalog/render-host 夹具仍是 Project V8 离线物；V9 工程单 HTML/网页包走 Published Course V2（`#course-root` + `createPublishedCourseSession`）
- validation proves / does not prove:
  - proves: 当前脏树上 **一次** `npm run test:e2e` 跑完且 **exit 1**；目录 UI 全量绿；导出条全量绿；简洁模式全量绿；第一条失败标题与首错如下
  - does not prove: 未执行的 8 条 editor 路径（媒体批量、图片导入、流程 6–9、课例验收）；三视口、17 项体验、typecheck、Vitest、教师验收。自动化不得宣称 art/accepted，也不得宣称项目级 engineering candidate。
- narrow UI smoke, if authorized: 未授权。未另开手工窗口。本任务就是全量现有 e2e。
- INTEGRATION_REQUESTS: 无。本任务不写源码。失败回派见下。目录 UI 全量绿 → 可将 `R8F-CATALOG-PPTX-01` 标 `verified`。导出条本轮全量绿 → 可将 `R8F-RUNTIME-EXPORT-01` 标 `verified`。本任务不改账本。
- DECISION_REQUESTS: 无。
- remaining risks / untested full checks:
  - 未跑：`check:ai-capabilities`、`typecheck`、`npm test`、三视口、17 项体验、`npm run verify` / `verify:full`、`build:desktop`（本任务禁止再跑）
  - `editor.spec.ts` 8 条因 serial 中止未跑
  - 流程 5 在 `:2266` 首红后**未到达** `teacher-escape-controls` / 键盘翻页 / 网页包第二页。`TeacherEscapeControls` 目前只由 `PlayerApp` 挂载，CoursePlayer 会话未用。**不要预修**；等本条清零后再全量
  - `v9GlobalLayerUiAdapter` 有一条 reorder/controller-move 单测可能红。本任务不跑 Vitest、不修它
  - 现有 e2e **没有** Flow / Spatial / Mixed / 七组合 / V8 显式导入拒绝 / DOCX 规格。本任务不为缺口新建 spec
  - 未领取 R8-G
- rollback point: 产品 HEAD 仍为 `f27275658c6dfaa12f2ce35cd9368dcdebe99451`。R8-F-RECHECK-9 无产品源码改动可回滚。`test-results/` 与 `dist-*` 未 commit。**不要回滚** R8-FIX-CATALOG-PPTX / R8-FIX-E2E-EXPORT / SLIDE-PREVIEW-COMP / GLOBAL-SCENE-LABEL / GLOBAL-LAYER-POS / GLOBAL-TEXT / COMP-* / TEXT-TXN / IMPORT / SCENE-LAYER / SELECT-TAB / FIX-E2E。
- execution state: `blocked`
- integration state: `n/a`
- quality state: `unverified`

## 第一条失败 spec（标题 + 首错）

### 1. `tests/e2e/editor.spec.ts:2169`

**标题：** 互动课件编辑器 1.0 / Project V8 收敛 › 流程 5：Presenter 在单 HTML 与网页包均可离线翻页

**耗时：** 1.2m（`test.setTimeout(90_000)`）；Electron 内两页文字、单 HTML / 网页包导出与 PDF/PPTX 预检「返回编辑」已过；死在 Chromium 打开导出单 HTML 后的场景索引轮询

**file:line：** `tests/e2e/editor.spec.ts:354`（由 `:2266` `expectCanvasPlayerScene(exported, 0)` 调用）

**期望：** `playerSceneIndex(page)` 为 **`0`**（`window.__H5_LESSON_PLAYER__.getCurrentSceneIndex()`；poll 10s）

**收到：** **`null`**。Timeout 10000ms。同函数前两步已过：`.lesson-footer` count 0、`.lesson-page-indicator` count 0。

**首错：**

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: 0
Received: null

Call Log:
- Timeout 10000ms exceeded while waiting on the predicate
```

断言：

```
352 |   await expect(page.locator('.lesson-footer')).toHaveCount(0)
353 |   await expect(page.locator('.lesson-page-indicator')).toHaveCount(0)
  > 354 |   await expect.poll(() => playerSceneIndex(page)).toBe(expectedIndex)
          |                                                   ^
```

调用点：

```
2265 |         await exported.goto(pathToFileURL(htmlPath).toString())
2266 |         await expectCanvasPlayerScene(exported, 0)
```

`playerSceneIndex`（`:342`–`:345`）：`window.__H5_LESSON_PLAYER__?.getCurrentSceneIndex() ?? null`

**只读定位：** V9 默认真相下 `App.tsx` `buildHtml` 在 `activeCoursePublishSources()` 有值时走 `buildPublishedCourseStandaloneHtml`：容器是 `#course-root`，内联 `__H5_COURSE_PAYLOAD__`。`src/player/index.ts` `bootstrapPublishedCourse`（`:411`–`:427`）对 `#course-root` 调用 `createPublishedCourseSession(...).mount(root)`，**不**赋值 `window.__H5_LESSON_PLAYER__`（该全局只在旧 `startAndExposePlayer` / `PlayerApp` 路径写入）。因此离线单 HTML 上 `getCurrentSceneIndex` 一直是 `null`。不要 skip。不要改 `editor.spec.ts` 除非协调者另派测试跟切。不要回滚 CATALOG-PPTX 快照提示。不要回滚 EXPORT 的 V9 夹具 / 纯 Slide `buildPptx` 切流。

不要回滚 SLIDE-PREVIEW-COMP / SCENE-LABEL / GLOBAL-* / COMP-* / TEXT-TXN / IMPORT / SCENE-LAYER / SELECT-TAB / FIX-E2E。

**窄复跑（owner 用，不要全量 e2e）：**

```
npx playwright test tests/e2e/editor.spec.ts -g "流程 5"
```

**附件（未 commit）：**

- `test-results/editor-互动课件编辑器-1-0-Project-a5435-resenter-在单-HTML-与网页包均可离线翻页/error-context.md`
- 同目录 `trace.zip`

因 `test.describe.serial`，本失败还导致同文件其后 **8** 条 **did not run**。catalog 无剩余。`render-host-benchmark` 仍跑完。

## 上一轮点名、本轮证据变化

| 条 | 本轮证据 |
|---|---|
| 「目录 UI…导出 HTML、网页包、PDF、PPTX」 | **本轮全量绿**（3.3m）。可将 `R8F-CATALOG-PPTX-01` 标 verified。不要回滚 CATALOG-PPTX。 |
| 「简洁模式…试运行」 | **本轮全量绿**（32.8s）。RECHECK-8 `:886` alpha 本轮未复现。不要重开。 |
| 「Runtime API 2 / Component API 4 导出」 | **本轮全量绿**（53.7s）。可将 `R8F-RUNTIME-EXPORT-01` 标 verified。不要回滚 EXPORT。 |
| 「整课预览：后台教师控制器…」 | **本轮全量绿**（21.6s）。不要预修。 |
| CoursePlayer 宿主；交互层；统一画布；流程 1–4；文字编辑事务；P0 双击；V8 全局层；Component API 4 全局组件 | **本轮全量绿**。不要重开那些刀。 |
| 「流程 5：Presenter…离线翻页」 | **本轮全量红**（1.2m）。新首红。按实锤回派。 |
| render-host-benchmark；catalog 离线 HTML/网页包 | 全量仍绿。不要重开 |

## 点名风险本轮未踩到（不要当本轮实锤）

因 serial 停在流程 5，下列**没有新失败证据**。原样记录：

| 风险 | 本轮证据 | 只读现状 |
|---|---|---|
| 媒体批量 / 图片导入 / 流程 6–9 / 课例验收 | **未跑** | 无新证据，不要预修 |
| 流程 5 后续：`teacher-escape-controls`、键盘翻页、网页包第二页 | **未到达** | `TeacherEscapeControls` 目前只挂在 `PlayerApp`。不要预修 |

不要因为本轮没跑到就重开 SELECT-TAB / SCENE-LAYER / IMPORT / TEXT-TXN / COMP-DBLCLICK / COMP-XFORM / GLOBAL-TEXT / GLOBAL-LAYER-POS / GLOBAL-SCENE-LABEL / SLIDE-PREVIEW-COMP / FIX-E2E-EXPORT / CATALOG-PPTX。

## 未跑标题（8）

`editor.spec.ts` serial，流程 5 失败后：

1. 媒体批量与连续插入：排布、入库、页签和单次撤销
2. 补充流程：图片导入、替换与工程往返
3. 流程 6：箭头、大括号与多选对齐
4. 流程 7：两页课件导出 PDF 与 PPTX
5. 流程 8：字体与局部富文本在内容编辑后保持同步
6. 流程 8B：V8 着重号与语义公式跨表面导出证据
7. 流程 9：未保存课件自动恢复
8. 课例验收：三页光合作用课例可离线互动

## 建议下一刀（按文件；本任务不修）

本轮只把 **第一条失败** 回派。不要预修 serial 未跑条。不要预修未到达的 escape 控件。不要跑 Vitest 修 `v9GlobalLayerUiAdapter`。不要回滚 CATALOG-PPTX / EXPORT。

### A. 本轮实锤 — 流程 5 离线单 HTML 无 `__H5_LESSON_PLAYER__`

| 文件 | 建议 |
|---|---|
| `src/player/index.ts` `bootstrapPublishedCourse` 和/或 `createPublishedCourseSession` / CoursePlayer | **不要** skip / 不要放宽未授权断言 / **不要回滚** EXPORT 或 CATALOG-PPTX。V9 导出单 HTML 走 Published Course V2 `#course-root`，未挂 `window.__H5_LESSON_PLAYER__`，而 `editor.spec.ts:354` 仍用 `getCurrentSceneIndex()` 断言场景 0。在**不撤回** V2 包格式的前提下，让离线 Presenter 对现有断言暴露当前场景索引（或与现有 `playerSceneIndex` 对齐的等价全局）。窄复跑 `-g "流程 5"`。 |
| `tests/e2e/editor.spec.ts` | **不要**为绿改成 skip 或删掉 `playerSceneIndex` / `__H5_LESSON_PLAYER__` 断言，除非协调者另派测试跟切且教师同意。本任务禁止改 spec。 |

不要为绿 skip。不要重开目录 UI / 导出条 / 简洁模式 / Component API 4 全局组件 / V8 全局层 / 流程 4 / 交互层 / 统一画布 / 流程 1 / 文字编辑事务 / P0 双击 / 流程 3 / 整课预览。

### B. 未跑、可能下一红（本轮无新证据）

仍在 `tests/e2e/editor.spec.ts` serial。优先等 A 清零后再全量。流程 5 后续 escape 控件本轮无失败证据，不要预修。

## 给协调者

1. R8-F-RECHECK-9 唯一授权命令 **exit 1**，状态 **`blocked`**。不要领取 R8-G。
2. 「目录 UI」本轮 **全量绿**。**可将** `R8F-CATALOG-PPTX-01` 标 `verified`（本任务不改账本）。不要回滚 CATALOG-PPTX。
3. 「Runtime API 2 / Component API 4 导出」本轮 **已跑且绿**。**可将** `R8F-RUNTIME-EXPORT-01` 标 `verified`（本任务不改账本）。不要回滚 EXPORT。
4. 第一条失败是「流程 5」离线 Presenter `playerSceneIndex` 期望 0 收到 null。回派 A。
5. RECHECK-8 简洁模式 `:886` 本轮绿，不要重开。
6. 必须保留：CATALOG-PPTX 成功路径「静态导出提示」；EXPORT V9 夹具与纯 Slide `buildPptx`；SLIDE-PREVIEW-COMP 可见后备；SCENE-LABEL `scene.name`；GLOBAL-LAYER-POS / GLOBAL-TEXT；COMP-*；TEXT-TXN；IMPORT；SCENE-LAYER；SELECT-TAB；FIX-E2E。
7. 禁止为绿而 skip / 放宽未授权断言 / 新建 §5 spec / 静默打开 V8。
8. 不要宣称项目级 engineering candidate（留给 R8-Z 在机器全绿后写）。
9. 已知非本轮：`v9GlobalLayerUiAdapter` reorder/controller-move 单测。不要顺手派 Vitest。

## 未跑集合（R8-F-RECHECK-9 授权外）

- `check:ai-capabilities` / `typecheck`（R8-C）
- `npm test`（R8-D）
- `build:desktop`（R8-E 已交；本任务 pretest 自己构建了 player/renderer/electron，未再跑 `build:desktop`）
- 三视口视觉（R8-G）— **未领取**
- 17 项真实体验（R8-H）
- `npm run verify` / `verify:full` / `npm run build`
- 未写 `artifacts/FINAL_GATE_REPORT.md`（R8-Z）

R8-F-RECHECK-9 不领取 R8-G。quality 保持 `unverified`。禁止 art/accepted。禁止项目级 engineering candidate。
