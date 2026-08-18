HANDOFF
- task: R8-F
- planning pack path: `C:\Users\74755\Documents\HTML课件编辑器\docs\tasks\v8-to-v9-rebuild`
- product worktree / branch / baseline SHA: `C:\Users\74755\Documents\HTML课件编辑器-v8-to-v9-rebuild` / `codex/v8-to-v9-rebuild` / `f27275658c6dfaa12f2ce35cd9368dcdebe99451`
- outcome: 只在产品 worktree 运行一次 `npm run test:e2e`（`pretest:e2e` 构建 player/examples/fixtures/renderer/electron，然后 `playwright test`）。**exit 1。** 墙钟 **129250 ms**（`00:02:09.250`）。Playwright：**2 passed / 2 failed / 0 skipped / 23 did not run**（27 条，1 worker）。未改任何产品源码/测试，未新建 spec，未 skip、未放宽断言。未 commit。未另跑 `build:desktop` / `npm test` / typecheck / `verify`。未领取 R8-G/H/Z。未宣称 art/accepted，未宣称项目级 engineering candidate。Electron 槽已释放。`:5174` 仍为 PID **19432**（未杀、未占用）。
- owned files changed:
  - 产品 worktree 源码：无（只读）
  - 产品 worktree 生成：`pretest:e2e` 刷新 `dist-*` / examples / fixtures（未 commit）；失败附件在默认 `test-results/`（未 commit）
  - 计划侧：本 HANDOFF；`00_INDEX.md` 本行状态
- donor files/functions consulted:
  - `10_R8_FINAL_FULL_GATE.md` §5、§11.6
  - `00_INDEX.md`、`01_SHARED_EXECUTION_CONTRACT.md`
  - [`handoffs/R8-E.md`](R8-E.md)
  - 产品 `package.json` `"test:e2e": "playwright test"`；`playwright.config.ts` `workers: 1`、`fullyParallel: false`
  - 现有 spec：`tests/e2e/editor.spec.ts`、`tests/e2e/componentCatalogMatrix.spec.ts`、`tests/e2e/render-host-benchmark.spec.ts`
  - 只读定位：`Workspace.tsx` `useCoursePlayerTryRun`；`NodesTab.tsx` `unifiedRows` → `.node-item`
- focused validation command:
  ```
  npm run test:e2e
  ```
  工作目录：产品 worktree。Windows PowerShell。未再单独跑 `build:desktop`。未合成 `verify`。未另开手工 App。未抢 `:5174`。e2e 使用 spec 内临时 `--user-data-dir`。
- validation result: **blocked。** `NPM_TEST_E2E_EXIT:1`。`NPM_TEST_E2E_MS:129250`（`00:02:09.250`）。Playwright 摘要：`2 failed` / `23 did not run` / `2 passed (1.9m)`。

  ### 开始前环境（产品 worktree，跑命令前）

  | 项 | 值 |
  |---|---|
  | `git branch --show-current` | `codex/v8-to-v9-rebuild` |
  | `git rev-parse HEAD` | `f27275658c6dfaa12f2ce35cd9368dcdebe99451` |
  | `node --version` | `v24.14.0` |
  | `npm --version` | `11.9.0` |
  | `git status --short` | 脏树未提交 R6–R8 改动。本任务未触碰源码。 |
  | Electron 槽 | 无 `electron.exe`。未另开手工 App。 |
  | `:5174` | `127.0.0.1:5174` LISTENING PID **19432**（残留 Vite）。本任务未杀、未占用。跑完后仍为同一 PID。 |
  | `:5173` / `:5175` | 另有残留 Vite；e2e 走构建产物 + 临时 profile，未抢这些端口。 |

  ### 命令结果

  | # | 段 | 是否到达 | exit | 耗时 | 首个错误 |
  |---|---|---|---|---|---|
  | pretest | `build:player` → examples → lesson-demo → render-benchmark → catalog-matrix → `build:renderer` → `build:electron` | **是** | 链式继续 | 含在墙钟内；player Vite 1.32s；renderer Vite 2.49s | 无。仅 WARN：player `inlineDynamicImports`；renderer chunk > 500 kB |
  | 整条 | `npm run test:e2e` | 是 | **1** | **129250 ms** | 见下表两条失败 |
  | Playwright | `Running 27 tests using 1 worker` | 是 | 1 | 报告 **1.9m** | 2 failed |

  | 计数 | 值 |
  |---|---|
  | passed | **2** |
  | failed | **2** |
  | skipped（`test.skip` 命中） | **0**（catalog fixture skip 未触发；矩阵夹具已由 pretest 生成） |
  | did not run | **23**（`editor.spec.ts` `test.describe.serial`：第 1 条失败后同 describe 剩余未执行） |
  | 合计 | **27** |

  绿的 2 条都是 **Chromium 离线 HTML**，不是 Electron 编辑器默认路径：

  1. `componentCatalogMatrix.spec.ts` › 生成物的单 HTML 与网页包离线运行四组件、状态覆盖和 100 次压力翻页（5.0s）
  2. `render-host-benchmark.spec.ts` › Project V8 五种渲染路径可离线互动且反复切换不泄漏宿主（20.5s）

  实际拉起 Electron 的两条都红。`editor.spec.ts` 其余 23 条因此 **本轮没有跑到**。

- validation entry / fixture / backend:
  - entry: 仓库默认 `playwright test`（`tests/e2e/` 三个 spec）
  - fixture: pretest 生成 photosynthesis lesson、render-host-benchmark HTML、component-catalog V8 矩阵；editor 自建临时 `.h5lesson` / Electron `--user-data-dir`
  - backend: 成熟 V8 App 表面 + Course Project V9 默认工程真相（CUT 后）；catalog/render-host 夹具仍是 Project V8 离线物
- validation proves / does not prove:
  - proves: 当前脏树上 **一次** `npm run test:e2e` 跑完且 **exit 1**；pretest 构建段到达；27 条里 2 绿 2 红 23 未跑；失败首错如下
  - does not prove: 未执行的 23 条 editor 路径、三视口、17 项体验、typecheck、Vitest、教师验收。自动化不得宣称 art/accepted，也不得宣称项目级 engineering candidate。
- narrow UI smoke, if authorized: 未授权。未另开手工窗口。本任务就是全量现有 e2e。
- INTEGRATION_REQUESTS: 无新请求。本任务不写源码。失败回派见下。
- DECISION_REQUESTS: 无。
- remaining risks / untested full checks:
  - 未跑：`check:ai-capabilities`、`typecheck`、`npm test`、三视口、17 项体验、`npm run verify` / `verify:full`、`build:desktop`（本任务禁止再跑）
  - `editor.spec.ts` 23 条因 serial 中止未跑。其中「流程 8B / 流程 9」仍断言保存/recovery `schemaVersion === 8`，在 V9 默认真相下 **下一轮全量很可能再红**（本轮没有证据，只作风险）
  - 现有 e2e **没有** Flow / Spatial / Mixed / 七组合 / V8 显式导入拒绝 / DOCX 规格（见 §5 对照表）。本任务不为缺口新建 spec
  - 未领取 R8-G
- rollback point: 产品 HEAD 仍为 `f27275658c6dfaa12f2ce35cd9368dcdebe99451`。R8-F 无产品源码改动可回滚。`test-results/` 与 `dist-*` 未 commit。
- execution state: `blocked`
- integration state: `n/a`
- quality state: `unverified`

## 失败 spec（标题 + 首错 + 建议 owner）

### 1. `tests/e2e/componentCatalogMatrix.spec.ts:521`

**标题：** Component Catalog V8 四组件全矩阵 › 目录 UI 按需嵌入、编辑/重开/缩略图/Player，并真实导出 HTML、网页包、PDF、PPTX

**耗时：** 42.2s

**首错：**

```
Error: expect(locator).toHaveCount(expected) failed
Locator:  locator('.node-item')
Expected: 4
Received: 5
Timeout:  10000ms
at tests/e2e/componentCatalogMatrix.spec.ts:599
```

测试在组件库加入 4 个包后切到「图层」tab，断言 `.node-item` 等于 `expectedPackageCount`（4）。实际稳定解析为 **5**。

**只读定位：** V9 candidate 下 `NodesTab` 用 `selectEffectiveLayerProjection().unifiedRows` 渲染 `.node-item`。空白工程默认有 **教师控制器**（编辑器 a11y：`全局层（全课） 1 个元素`）。4 个 scene 组件 + 1 个控制器 = 5。不是 timeout 抖动。

**建议 owner：** **R3-Z**（把有效图层投影接到 `NodesTab`）。相关：R3-D 投影内核、R3-C 默认控制器。

**窄复跑（owner 用，不要全量 e2e）：**

```
npx playwright test tests/e2e/componentCatalogMatrix.spec.ts -g "目录 UI"
```

**附件（未 commit）：**

- `test-results/componentCatalogMatrix-Com-81985-yer，并真实导出-HTML、网页包、PDF、PPTX/error-context.md`
- 同目录 `trace.zip`（Playwright `retain-on-failure`）

### 2. `tests/e2e/editor.spec.ts:653`

**标题：** 互动课件编辑器 1.0 / Project V8 收敛 › 里程碑闭环：简洁模式完成文字、透明度、左起竖排与出现动画试运行

**耗时：** 45.5s

**首错：**

```
Error: expect(locator).toBeVisible() failed
Locator: locator('iframe[title="当前位置试运行"]').contentFrame().locator('.lesson-canvas-host canvas')
Expected: visible
Timeout: 15000ms
Error: element(s) not found
at tests/e2e/editor.spec.ts:742
```

简洁模式文字/透明度/竖排/淡入预览已经走到「当前位置试运行」点击。error-context a11y：试运行按钮 **[pressed]**，但没有 `iframe[title="当前位置试运行"]`。

**只读定位：** R7-Z 后 `useCoursePlayerTryRun = Boolean(courseDocument && canvasMode === 'run')`。为 true 时 **不渲染** blob iframe（`previewUrl && !useCoursePlayerTryRun`），改挂 `data-testid="course-try-run-host"` 上的 CoursePlayer。现有 spec 仍等 V8 `buildStandaloneHtml` iframe + `.lesson-canvas-host canvas`。

**建议 owner：** **R7-Z**（Slide 试运行改 CoursePlayer / Workspace 预览 DOM）。相关：R7-B 组装；R8-FIX-PREVIEW 只改编辑态隔离 key，不是本条首错。

**窄复跑：**

```
npx playwright test tests/e2e/editor.spec.ts -g "简洁模式完成文字"
```

**附件（未 commit）：**

- `test-results/editor-互动课件编辑器-1-0-Project-7355a-环：简洁模式完成文字、透明度、左起竖排与出现动画试运行/error-context.md`
- 同目录 `trace.zip`

因 `test.describe.serial`，本失败还导致同文件其余 23 条 **did not run**。

## §5 十一条 vs 现有 spec（只报告，未新建文件）

对照 `10_R8_FINAL_FULL_GATE.md` §5。覆盖指 **现有 spec 写了什么**，不是本轮跑绿了什么。本轮 Electron 编辑器路径两条即红，23 条未跑。

| # | §5 最低场景 | 现有 spec **覆盖了什么** | 现有 spec **没覆盖什么** |
|---|---|---|---|
| 1 | V9 新建/保存/重开/recovery，V8 显式导入与格式拒绝 | `editor.spec` 流程 2：中文文本保存重开；流程 9：未保存自动恢复（对话框「恢复课件」）。catalog：打开矩阵工程/保存加入结果 | **无** V9 schema 往返断言（流程 8B/9 仍 `schemaVersion === 8`）。**无** V8 显式导入报告、**无** 格式拒绝。新建走默认空白工程，未断言 Course Project V9 文档 |
| 2 | Slide 新增 scene 不丢旧内容，scene/state/history | 流程 1：`add-scene` 到 3 个、拖排、删除；试运行用例会 `新建场景状态` | **无**「新增 scene 后旧 scene 内容仍在」的显式断言。state/history 只在个别流程里顺带 |
| 3 | 多选、框选、八向 resize、旋转、右键、剪贴板、Delete、Undo/Redo | 流程 6：Ctrl 多选 + 对齐；流程 4：组件拖移/resize；流程 3：图层排序+撤销；catalog：图层删除/撤销/重做 | **无**框选、**无**八向手柄、**无**旋转、**无**画布右键菜单、**无**剪贴板复制粘贴、**无** Delete 键。专业模式「复制」是复制规则不是画布剪贴板 |
| 4 | 文字双击、IME、选区级局部格式、公式 | P0 双击编辑；「文字编辑事务」含 IME；流程 8 选区局部加粗/删除线/着重号；流程 8B 公式+着重号跨表面 | 本轮 serial 中止，这些条 **未执行**。无独立「公式编辑对话框」以外的更多公式合同 |
| 5 | 媒体库/声音库、图片/视频、组件、Runtime、动画与互动 | 媒体批量插入；图片导入/替换往返；流程 4 组件导入；Runtime API 2 原位编辑/导出；简洁淡入动画；专业规则复制排序；catalog 四组件矩阵 | 简洁模式只断言「导入声音/视频」按钮可见，**无**声音库试听/删除保护。视频入画布弱。无完整专业动画时间线 |
| 6 | global/surface/scene/state owner、排序、锁定、隐藏和逐 location 可见性 | 「V8 全局层」跨场景显隐；「Component API 4 全局组件」预览可见性 | **无** surface owner、**无**锁定/隐藏作为主路径、**无**逐 location 显隐矩阵。本轮失败 1 说明图层列表已含全局控制器，与「只数 scene 节点」合同冲突 |
| 7 | 教师控制器作者态、快速拖动、Player 会话 | 「整课预览：后台教师控制器可拖动、键盘细移并保持会话位置」 | **无**编辑画布上控制器八向 resize/斜向拖动。该条因 serial **未跑** |
| 8 | Flow 强文本、paragraph 层级、媒体/组件/global、运行目录和文档导出 | **无** | 三个 spec **都没有** Flow 页面、稿纸、paragraph、Flow TOC、DOCX/打印 |
| 9 | Spatial 共享元素内核、camera/path/relation、viewport controller | **无** | 三个 spec **都没有** Spatial 世界、镜头、路径、关系、viewport controller |
| 10 | Pure/Mixed 七组合、统一新增菜单和跨 surface 导航 | 失败 2 的 a11y 偶然出现「新建场景 / 新增其他类型页面」，**没有断言** | **无**七组合表、**无** `add-content-primary` / `add-content-menu` 合同、**无**跨 surface 切页 |
| 11 | Player、HTML/包与文档导出的关键一致性 | 流程 5：单 HTML + 网页包离线翻页；流程 7：PDF/PPTX；catalog：HTML/网页包/PDF/PPTX；Runtime 导出 PDF/PPTX；render-host 五种离线路径（本轮绿） | **无** DOCX、**无**打印。catalog 本轮在图层计数失败，**未跑到** Electron 导出后半段。无「编辑器 Player vs 导出 HTML」对照。试运行 DOM 已离开 iframe（失败 2） |

`editor.spec.ts` describe 标题仍是「Project V8 收敛」；`componentCatalogMatrix` / `render-host-benchmark` 夹具 `schemaVersion: 8`。它们打的是成熟 V8 表面 + 若干 V8 离线物，不是 Flow/Spatial/Mixed 产品路径。

## 给协调者

1. R8-F 唯一授权命令 **exit 1**，状态 **`blocked`**。不要领取 R8-G。
2. 回派两条，各只跑上表窄 Playwright；不要借失败跑 `verify` 或全量 e2e。
   - 图层 `.node-item` 4→5 → **R3-Z**
   - 试运行找不到 iframe canvas → **R7-Z**
3. 禁止为绿而 skip / 放宽断言 / 新建 §5 spec。缺口只记录在上表。
4. serial 中止使 23 条 editor 未跑；blocker 清零后由协调者再派一次完整 `npm run test:e2e`（仍不要本 HANDOFF 去领）。
5. 不要宣称项目级 engineering candidate（留给 R8-Z 在机器全绿后写）。

## 未跑集合（R8-F 授权外）

- `check:ai-capabilities` / `typecheck`（R8-C）
- `npm test`（R8-D）
- `build:desktop`（R8-E 已交；本任务 pretest 自己构建了 player/renderer/electron，未再跑 `build:desktop`）
- 三视口视觉（R8-G）— **未领取**
- 17 项真实体验（R8-H）
- `npm run verify` / `verify:full` / `npm run build`
- 未写 `artifacts/FINAL_GATE_REPORT.md`（R8-Z）

R8-F 不领取 R8-G。quality 保持 `unverified`。禁止 art/accepted。禁止项目级 engineering candidate。
