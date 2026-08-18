HANDOFF
- task: R8-F-RECHECK-11
- planning pack path: `C:\Users\74755\Documents\HTML课件编辑器\docs\tasks\v8-to-v9-rebuild`
- product worktree / branch / baseline SHA: `C:\Users\74755\Documents\HTML课件编辑器-v8-to-v9-rebuild` / `codex/v8-to-v9-rebuild` / `f27275658c6dfaa12f2ce35cd9368dcdebe99451`
- outcome: 只在产品 worktree 运行一次 `npm run test:e2e`（含 `pretest:e2e`）。Playwright **1 failed**。墙钟 **227553 ms**（`00:03:47.553`）。Playwright：**3 passed / 1 failed / 0 skipped / 23 did not run**（27 条，1 worker）。「目录 UI」本轮全量仍绿（2.9m）。**「补充流程：图片导入」本轮未跑**（serial 死在更早的「简洁模式」）；协调者**不要**将 `R8F-IMAGE-ASPECT-01` 标 verified。R8-FIX-IMAGE-ASPECT **不要回滚、不要重开**（本轮无该条失败证据）。R8-FIX-PRESENTER-HTML / CATALOG-PPTX / E2E-EXPORT **不要回滚**。**第一条失败**是 `editor.spec.ts` serial「里程碑闭环：简洁模式完成文字、透明度、左起竖排与出现动画试运行」（21.6s）：点「预览」后 2s 内文字 motion `alpha` 未降到 `stableMotionFrame.alpha * 0.9` 以下；期望 `< 0`，收到 `1`。同 describe 其后 23 条未跑。`render-host-benchmark` 仍绿。必须保留：IMAGE-ASPECT；PRESENTER-HTML；CATALOG-PPTX；E2E-EXPORT；SLIDE-PREVIEW-COMP；SCENE-LABEL；GLOBAL-*；COMP-*；TEXT-TXN；IMPORT；SCENE-LAYER；SELECT-TAB；FIX-E2E。未改任何产品源码/测试。未 skip。未 commit。未另跑 `build:desktop` / `npm test` / typecheck / `verify`。未领取 R8-G/H/Z。未宣称 art/accepted，未宣称项目级 engineering candidate。Electron 槽已释放。
- owned files changed:
  - 产品 worktree 源码：无（只读）
  - 产品 worktree 生成：`pretest:e2e` 刷新 `dist-*` / examples / fixtures（未 commit）；失败附件在默认 `test-results/`（未 commit）
  - 计划侧：本 HANDOFF；`00_INDEX.md` 本行状态
- donor files/functions consulted:
  - [`handoffs/R8-F-RECHECK-10.md`](R8-F-RECHECK-10.md)、[`handoffs/R8-FIX-IMAGE-ASPECT.md`](R8-FIX-IMAGE-ASPECT.md)
  - `10_R8_FINAL_FULL_GATE.md` §11.6
  - 产品 `package.json` `"test:e2e"`；`playwright.config.ts` `workers: 1`
  - 只读定位：`tests/e2e/editor.spec.ts:817` / `:886`；点「淡入」后点「预览」；`readTextMotionFrame` 读 `__H5_LESSON_PLAYER__.playerScene.renderedNodes` text 的 `motionRoot ?? root`；poll `alpha ?? 1` `toBeLessThan(stable.alpha * 0.9)` timeout 2000ms
- focused validation command:
  ```
  npm run test:e2e
  ```
  工作目录：产品 worktree。Windows PowerShell。`VITE_DEV_SERVER_URL` unset。未再单独跑 `build:desktop`。未合成 `verify`。未另开手工 App。未抢 `:5173`。e2e 使用 spec 内临时 `--user-data-dir`（`electron-profile-${pid}`）。
- validation result: **blocked。** Playwright `1 failed`。`NPM_TEST_E2E_MS:227553`（`00:03:47.553`）。Playwright 摘要：`1 failed` / `23 did not run` / `3 passed (3.6m)`。Playwright **1.61.1**。

  ### 开始前环境（产品 worktree，跑命令前）

  | 项 | 值 |
  |---|---|
  | `git branch --show-current` | `codex/v8-to-v9-rebuild` |
  | `git rev-parse HEAD` | `f27275658c6dfaa12f2ce35cd9368dcdebe99451` |
  | `node --version` | `v24.14.0` |
  | `npm --version` | `11.9.0` |
  | `git status --short` | 脏树未提交 R6–R8 改动，含 IMAGE-ASPECT（`stageViewportTransform.ts` / `workspaceSlideAuthoring.ts`）/ PRESENTER-HTML / CATALOG-PPTX / E2E-EXPORT / SLIDE-PREVIEW-COMP / SCENE-LABEL / GLOBAL-* / COMP-* / TEXT-TXN / IMPORT / SCENE-LAYER / SELECT-TAB / FIX-E2E。本任务未触碰源码/测试。 |
  | Electron 槽 | 无 `electron.exe`。未另开手工 App。跑完后仍无。 |
  | `:5173` | 无 LISTENING。仅见无关进程对已关闭 5173 的 `SYN_SENT`。本任务未杀、未占用。跑完后仍无 LISTENING。 |
  | `:5174` / `:5175` | 空闲。 |

  ### 命令结果

  | # | 段 | 是否到达 | exit | 耗时 | 首个错误 |
  |---|---|---|---|---|---|
  | pretest | `build:player` → examples → lesson-demo → render-benchmark → catalog-matrix → `build:renderer` → `build:electron` | **是** | 链式继续 | 含在墙钟内；player Vite **1.27s**；renderer Vite **2.41s** | 无。仅 WARN：player `inlineDynamicImports`；renderer chunk > 500 kB |
  | 整条 | `npm run test:e2e` | 是 | Playwright **1 failed**（按失败记 blocked） | **227553 ms** | 见下「第一条失败」 |
  | Playwright | `Running 27 tests using 1 worker` | 是 | 1 failed | 报告 **3.6m** | 1 failed |

  | 计数 | 值 |
  |---|---|
  | passed | **3** |
  | failed | **1** |
  | skipped（`test.skip` 命中） | **0** |
  | did not run | **23**（`editor.spec.ts` `test.describe.serial`：简洁模式失败后同 describe 剩余 23 条未执行；catalog 2 条全绿；`render-host-benchmark` 在另一文件仍跑完） |
  | 合计 | **27** |

  绿的 3 条：

  1. `componentCatalogMatrix.spec.ts` › 生成物的单 HTML 与网页包离线运行四组件、状态覆盖和 100 次压力翻页（4.9s）
  2. `componentCatalogMatrix.spec.ts` › **目录 UI** 按需嵌入、编辑/重开/缩略图/Player，并真实导出 HTML、网页包、PDF、PPTX（**2.9m**）← 全量仍绿；不要回滚 CATALOG-PPTX
  3. `render-host-benchmark.spec.ts` › Project V8 五种渲染路径可离线互动且反复切换不泄漏宿主（15.2s）

  红的 1 条：

  1. **第一条（唯一）：** `editor.spec.ts` › **里程碑闭环：简洁模式完成文字、透明度、左起竖排与出现动画试运行**（**21.6s**）← 详见下方

- validation entry / fixture / backend:
  - entry: 仓库默认 `playwright test`（`tests/e2e/` 三个 spec）
  - fixture: pretest 生成 photosynthesis lesson、render-host-benchmark HTML、component-catalog V8 矩阵；editor `beforeAll` 从 `examples/sample-project.h5lesson`（schema 8）克隆；简洁模式条 `launchEditor({ mode: 'simple' })`，添加文字后改透明度/竖排/淡入并点「预览」
  - backend: 成熟 V8 App 表面 + Course Project V9 默认真相（CUT 后）；打开 V8 必须显式导入；catalog/render-host 夹具仍是 Project V8 离线物
- validation proves / does not prove:
  - proves: 当前脏树上 **一次** `npm run test:e2e` 跑完且 Playwright **1 failed**；目录 UI 全量仍绿；第一条失败标题与首错如下；图片导入条本轮**未执行**
  - does not prove: 未执行的 23 条 editor 路径（含图片导入、流程 1–9、导出条、流程 5、全局层、全局组件、媒体批量）；IMAGE-ASPECT 全量；三视口、17 项体验、typecheck、Vitest、教师验收。自动化不得宣称 art/accepted，也不得宣称项目级 engineering candidate。
- narrow UI smoke, if authorized: 未授权。未另开手工窗口。本任务就是全量现有 e2e。
- INTEGRATION_REQUESTS: 无。本任务不写源码。失败回派见下。**不要**将 `R8F-IMAGE-ASPECT-01` 标 `verified`（图片导入未跑）。本任务不改账本。
- DECISION_REQUESTS: 无。
- remaining risks / untested full checks:
  - 未跑：`check:ai-capabilities`、`typecheck`、`npm test`、三视口、17 项体验、`npm run verify` / `verify:full`、`build:desktop`（本任务禁止再跑）
  - `editor.spec.ts` 23 条因 serial 中止未跑，**含「图片导入」**
  - RECHECK-10 已绿的简洁模式 / 导出条 / 流程 1–5 / 全局层 / 全局组件 / 媒体批量本轮除目录 UI 外均未重跑。不要因未跑而回滚那些刀。不要预修图片导入。
  - `v9GlobalLayerUiAdapter` 有一条 reorder/controller-move 单测可能红。本任务不跑 Vitest、不修它
  - 现有 e2e **没有** Flow / Spatial / Mixed / 七组合 / V8 显式导入拒绝 / DOCX 规格。本任务不为缺口新建 spec
  - 未领取 R8-G
- rollback point: 产品 HEAD 仍为 `f27275658c6dfaa12f2ce35cd9368dcdebe99451`。R8-F-RECHECK-11 无产品源码改动可回滚。`test-results/` 与 `dist-*` 未 commit。**不要回滚** R8-FIX-IMAGE-ASPECT / R8-FIX-PRESENTER-HTML / R8-FIX-CATALOG-PPTX / R8-FIX-E2E-EXPORT / SLIDE-PREVIEW-COMP / GLOBAL-SCENE-LABEL / GLOBAL-LAYER-POS / GLOBAL-TEXT / COMP-* / TEXT-TXN / IMPORT / SCENE-LAYER / SELECT-TAB / FIX-E2E。
- execution state: `blocked`
- integration state: `n/a`
- quality state: `unverified`

## 第一条失败 spec（标题 + 首错）

### 1. `tests/e2e/editor.spec.ts:817`

**标题：** 互动课件编辑器 1.0 / Project V8 收敛 › 里程碑闭环：简洁模式完成文字、透明度、左起竖排与出现动画试运行

**耗时：** 21.6s；元素/媒体简洁入口、添加文字、透明度 50%、字体列表、竖排高度 260、「淡入」`aria-pressed`、blob Player iframe 均已过；死在点「预览」后的 alpha poll

**file:line：** `tests/e2e/editor.spec.ts:886`

**期望：** `(await readTextMotionFrame())?.alpha ?? 1` `toBeLessThan(stableMotionFrame.alpha * 0.9)`，timeout 2000ms。Playwright 打印 **Expected: `< 0`**（即本次采到的 `stableMotionFrame.alpha * 0.9` 为 0）

**收到：** **`1`**。Call Log：`Timeout 2000ms exceeded while waiting on the predicate`

**首错：**

```
Error: expect(received).toBeLessThan(expected)

Expected: < 0
Received:   1

Call Log:
- Timeout 2000ms exceeded while waiting on the predicate
```

断言：

```
883 |       await expect.poll(async () => (await readTextMotionFrame())?.alpha ?? 1, {
884 |         timeout: 2_000,
885 |         intervals: [20, 30, 50],
  > 886 |       }).toBeLessThan(stableMotionFrame.alpha * 0.9)
          |          ^
```

**只读定位：** 点「预览」后 2s 内文字 motion alpha 未降到阈值以下。Expected `< 0` 说明点击前采到的 stable alpha 为 0；Received `1` 与 poll 回退 `?? 1` 一致（预览窗口内可能读不到 text handle）。RECHECK-10 同条全量绿（32.8s）。不要 skip。不要放宽 timeout / `toBeLessThan`。不要预修图片导入 / 流程 6–9。不要回滚 IMAGE-ASPECT / PRESENTER-HTML / CATALOG-PPTX / EXPORT。

不要回滚 SLIDE-PREVIEW-COMP / SCENE-LABEL / GLOBAL-* / COMP-* / TEXT-TXN / IMPORT / SCENE-LAYER / SELECT-TAB / FIX-E2E。

**窄复跑（owner 用，不要全量 e2e）：**

```
npx playwright test tests/e2e/editor.spec.ts -g "简洁模式"
```

**附件（未 commit）：**

- `test-results/editor-互动课件编辑器-1-0-Project-7355a-环：简洁模式完成文字、透明度、左起竖排与出现动画试运行/error-context.md`
- 同目录 `trace.zip`

因 `test.describe.serial`，本失败还导致同文件其后 **23** 条 **did not run**。catalog 无剩余。`render-host-benchmark` 仍跑完。

## 上一轮点名、本轮证据变化

| 条 | 本轮证据 |
|---|---|
| 「补充流程：图片导入、替换与工程往返」 | **本轮未跑**。**不要**将 `R8F-IMAGE-ASPECT-01` 标 verified。不要回滚 IMAGE-ASPECT。 |
| 「目录 UI…导出 HTML、网页包、PDF、PPTX」 | **本轮全量绿**（2.9m）。不要回滚 CATALOG-PPTX。 |
| 「流程 5：Presenter…离线翻页」 | **本轮未跑**。RECHECK-10 已全量绿。不要回滚 PRESENTER-HTML。不要重开。 |
| 「Runtime API 2 / Component API 4 导出」 | **本轮未跑**。不要回滚 EXPORT。 |
| 「里程碑闭环：简洁模式…试运行」 | **本轮全量红**（21.6s）。新首红。RECHECK-10 曾绿（32.8s）。按实锤回派。 |
| 整课预览；流程 1–4；文字编辑事务；P0 双击；V8 全局层；Component API 4 全局组件；媒体批量 | **本轮未跑**。RECHECK-10 已绿。不要因未跑而重开那些刀。 |
| render-host-benchmark；catalog 离线 HTML/网页包 | 全量仍绿。不要重开 |

## 点名风险本轮未踩到（不要当本轮实锤）

因 serial 停在简洁模式，下列**没有新失败证据**。原样记录：

| 风险 | 本轮证据 | 只读现状 |
|---|---|---|
| 图片导入东向拉伸宽高比 | **未跑** | IMAGE-ASPECT 定向曾绿；全量未关闭。不要预修、不要标 verified |
| 图片导入后续：替换 / 保存重开 | **未跑** | 不要预修 |
| 流程 1–9 / 课例验收 / 导出条 / 流程 5 / 全局层 / 全局组件 / 媒体批量 | **未跑** | 无新证据，不要预修 |

不要因为本轮没跑到就重开 IMAGE-ASPECT / PRESENTER-HTML / CATALOG-PPTX / SELECT-TAB / SCENE-LAYER / IMPORT / TEXT-TXN / COMP-DBLCLICK / COMP-XFORM / GLOBAL-TEXT / GLOBAL-LAYER-POS / GLOBAL-SCENE-LABEL / SLIDE-PREVIEW-COMP / FIX-E2E-EXPORT。

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

本轮只把 **第一条失败** 回派。不要预修 serial 未跑条。不要预修图片导入。不要跑 Vitest 修 `v9GlobalLayerUiAdapter`。不要回滚 IMAGE-ASPECT / PRESENTER-HTML / CATALOG-PPTX / EXPORT。

### A. 本轮实锤 — 简洁模式「预览」淡入 alpha 未降

| 文件 | 建议 |
|---|---|
| 简洁模式出现动画预览路径（`simple-entrance-animation`「预览」→ 统一编辑 Player iframe `__H5_LESSON_PLAYER__` text `motionRoot`/`root`.alpha） | **不要** skip / 不要放宽 `:886` timeout 或 `toBeLessThan` / **不要回滚** IMAGE-ASPECT、PRESENTER-HTML、EXPORT 或 CATALOG-PPTX。点「预览」后 2s 内 alpha 未降；Expected `< 0`，Received `1`。让淡入预览在 2s 内把文字 alpha 降到 stable 的 90% 以下。窄复跑 `-g "简洁模式"`。 |
| `tests/e2e/editor.spec.ts` | **不要**为绿改成 skip 或放宽精度，除非协调者另派测试跟切且教师同意。本任务禁止改 spec。 |

不要为绿 skip。不要重开目录 UI / IMAGE-ASPECT / 流程 5 / 导出条 / Component API 4 全局组件 / V8 全局层 / 流程 4 / 交互层 / 统一画布 / 流程 1 / 文字编辑事务 / P0 双击 / 流程 3 / 整课预览 / 媒体批量。

### B. 未跑、可能下一红（本轮无新证据）

仍在 `tests/e2e/editor.spec.ts` serial。优先等 A 清零后再全量。图片导入本轮无失败证据，不要预修，也不要标 `R8F-IMAGE-ASPECT-01` verified。

## 给协调者

1. R8-F-RECHECK-11 唯一授权命令 Playwright **1 failed**，状态 **`blocked`**。不要领取 R8-G。
2. 「图片导入」本轮 **未跑**。**不要**将 `R8F-IMAGE-ASPECT-01` 标 `verified`。不要回滚 IMAGE-ASPECT。
3. 「目录 UI」本轮仍绿（2.9m）。不要回滚 CATALOG-PPTX。
4. 第一条失败是「简洁模式」淡入预览 alpha：期望 `< 0`，收到 `1`。回派 A。
5. 必须保留：IMAGE-ASPECT 的 `resizeWorldFrameFromHandlePreservingAspect` 与 `previewResize` 锁比；PRESENTER-HTML 的 `#course-root` + `__H5_LESSON_PLAYER__` 桥、作者字号、`.slide-published-adapter` locator、`> 0.05`；CATALOG-PPTX 成功路径「静态导出提示」；EXPORT V9 夹具与纯 Slide `buildPptx`；SLIDE-PREVIEW-COMP 可见后备；SCENE-LABEL `scene.name`；GLOBAL-LAYER-POS / GLOBAL-TEXT；COMP-*；TEXT-TXN；IMPORT；SCENE-LAYER；SELECT-TAB；FIX-E2E。
6. 禁止为绿而 skip / 放宽未授权断言 / 新建 §5 spec / 静默打开 V8。
7. 不要宣称项目级 engineering candidate（留给 R8-Z 在机器全绿后写）。
8. 已知非本轮：`v9GlobalLayerUiAdapter` reorder/controller-move 单测。不要顺手派 Vitest。

## 未跑集合（R8-F-RECHECK-11 授权外）

- `check:ai-capabilities` / `typecheck`（R8-C）
- `npm test`（R8-D）
- `build:desktop`（R8-E 已交；本任务 pretest 自己构建了 player/renderer/electron，未再跑 `build:desktop`）
- 三视口视觉（R8-G）— **未领取**
- 17 项真实体验（R8-H）
- `npm run verify` / `verify:full` / `npm run build`
- 未写 `artifacts/FINAL_GATE_REPORT.md`（R8-Z）

R8-F-RECHECK-11 不领取 R8-G。quality 保持 `unverified`。禁止 art/accepted。禁止项目级 engineering candidate。
