HANDOFF
- task: R8-F-RECHECK-7
- planning pack path: `C:\Users\74755\Documents\HTML课件编辑器\docs\tasks\v8-to-v9-rebuild`
- product worktree / branch / baseline SHA: `C:\Users\74755\Documents\HTML课件编辑器-v8-to-v9-rebuild` / `codex/v8-to-v9-rebuild` / `f27275658c6dfaa12f2ce35cd9368dcdebe99451`
- outcome: 只在产品 worktree 运行一次 `npm run test:e2e`（含 `pretest:e2e`）。**exit 1。** 墙钟 **744246 ms**（`00:12:24.246`）。Playwright：**16 passed / 1 failed / 0 skipped / 10 did not run**（27 条，1 worker）。R8-FIX-SLIDE-PREVIEW-COMP / R8-FIX-GLOBAL-SCENE-LABEL 的「Component API 4 全局组件：组件范围、全部文案、保存重开与预览可见性」本轮全量绿（1.1m）。`SlidePublishedAdapter` component/runtime 可见后备与勾选框 `scene.name` **未回滚**。GLOBAL-LAYER-POS / GLOBAL-TEXT 必须保留。R8-F-RECHECK-6 已关条目本轮仍绿。新红在 `editor.spec.ts` serial 第 16 条「Runtime API 2 / Component API 4 导出：等待 DOM 运行时后生成 PDF，并在 PPTX 保留动态层、全局 visibility 与原生文字」，其后 10 条未跑。未改任何产品源码/测试。未 skip。未 commit。未另跑 `build:desktop` / `npm test` / typecheck / `verify`。未领取 R8-G/H/Z。未宣称 art/accepted，未宣称项目级 engineering candidate。Electron 槽已释放。
- owned files changed:
  - 产品 worktree 源码：无（只读）
  - 产品 worktree 生成：`pretest:e2e` 刷新 `dist-*` / examples / fixtures（未 commit）；失败附件在默认 `test-results/`（未 commit）
  - 计划侧：本 HANDOFF；`00_INDEX.md` 本行状态
- donor files/functions consulted:
  - [`handoffs/R8-F-RECHECK-6.md`](R8-F-RECHECK-6.md)、[`handoffs/R8-FIX-SLIDE-PREVIEW-COMP.md`](R8-FIX-SLIDE-PREVIEW-COMP.md)、[`handoffs/R8-FIX-GLOBAL-SCENE-LABEL.md`](R8-FIX-GLOBAL-SCENE-LABEL.md)
  - `10_R8_FINAL_FULL_GATE.md` §11.6
  - 产品 `package.json` `"test:e2e"`；`playwright.config.ts` `workers: 1`
  - 只读定位：`tests/e2e/editor.spec.ts:1904` / `:1911`；`globalComponentProjectPath` 由上一刀「Component API 4 全局组件」以 V9 保存；本条仍 `projectDocumentSchema.parse`（V8 `schemaVersion` 8）
- focused validation command:
  ```
  npm run test:e2e
  ```
  工作目录：产品 worktree。Windows PowerShell。`VITE_DEV_SERVER_URL` unset。未再单独跑 `build:desktop`。未合成 `verify`。未另开手工 App。未抢 `:5173`。e2e 使用 spec 内临时 `--user-data-dir`（`electron-profile-${pid}`）。
- validation result: **blocked。** `NPM_TEST_E2E_EXIT:1`。`NPM_TEST_E2E_MS:744246`（`00:12:24.246`）。Playwright 摘要：`1 failed` / `10 did not run` / `16 passed (12.2m)`。Playwright **1.61.1**。

  ### 开始前环境（产品 worktree，跑命令前）

  | 项 | 值 |
  |---|---|
  | `git branch --show-current` | `codex/v8-to-v9-rebuild` |
  | `git rev-parse HEAD` | `f27275658c6dfaa12f2ce35cd9368dcdebe99451` |
  | `node --version` | `v24.14.0` |
  | `npm --version` | `11.9.0` |
  | `git status --short` | 脏树未提交 R6–R8 改动，含 SLIDE-PREVIEW-COMP / GLOBAL-SCENE-LABEL / GLOBAL-LAYER-POS / GLOBAL-TEXT。本任务未触碰源码/测试。 |
  | Electron 槽 | 无 `electron.exe`。未另开手工 App。跑完后仍无。 |
  | `:5173` | `127.0.0.1:5173` LISTENING PID **19296**（`node.exe`，产品 worktree 残留 Vite）。本任务未杀、未占用。跑完后仍为同一 PID。 |
  | `:5174` / `:5175` | 空闲。 |

  ### 命令结果

  | # | 段 | 是否到达 | exit | 耗时 | 首个错误 |
  |---|---|---|---|---|---|
  | pretest | `build:player` → examples → lesson-demo → render-benchmark → catalog-matrix → `build:renderer` → `build:electron` | **是** | 链式继续 | 含在墙钟内；player Vite **1.49s**；renderer Vite **2.18s** | 无。仅 WARN：player `inlineDynamicImports`；renderer chunk > 500 kB |
  | 整条 | `npm run test:e2e` | 是 | **1** | **744246 ms** | 见下表一条失败 |
  | Playwright | `Running 27 tests using 1 worker` | 是 | 1 | 报告 **12.2m** | 1 failed |

  | 计数 | 值 |
  |---|---|
  | passed | **16** |
  | failed | **1** |
  | skipped（`test.skip` 命中） | **0** |
  | did not run | **10**（`editor.spec.ts` `test.describe.serial`：第 16 条失败后同 describe 剩余未执行；`render-host-benchmark` 在另一文件仍跑完） |
  | 合计 | **27** |

  绿的 16 条：

  1. `componentCatalogMatrix.spec.ts` › 生成物的单 HTML 与网页包离线运行四组件、状态覆盖和 100 次压力翻页（4.7s）
  2. `componentCatalogMatrix.spec.ts` › **目录 UI** 按需嵌入、编辑/重开/缩略图/Player，并真实导出 HTML、网页包、PDF、PPTX（**2.7m**）← FIX-E2E，全量仍绿
  3. `editor.spec.ts` › **简洁模式完成文字**、透明度、左起竖排与出现动画试运行（32.7s）← FIX-E2E，全量仍绿
  4. `editor.spec.ts` › 专业模式创建、复制、排序规则并修改受控运行时（33.5s）
  5. `editor.spec.ts` › **当前位置试运行：CoursePlayer 宿主**可见且可互动（21.7s）← FIX-E2E，全量仍绿
  6. `editor.spec.ts` › **Player 与编辑交互层**在 100%、150% 和重置后保持同位（**59.3s**）← SELECT-TAB，全量仍绿
  7. `editor.spec.ts` › **统一画布：场景/全局运行时文字与图片可原位编辑并往返**（**1.0m**）← IMPORT，全量仍绿
  8. `editor.spec.ts` › **流程 1：场景新增、排序与删除**（14.2s）← SCENE-LAYER，全量仍绿
  9. `editor.spec.ts` › 流程 2：中文文本、位置、样式与工程往返（34.8s）
  10. `editor.spec.ts` › **文字编辑事务：resize、属性栏、切换节点、字体、IME 与撤销**（**45.7s**）← TEXT-TXN，全量仍绿
  11. `editor.spec.ts` › **P0：画布真实双击可持续输入、失焦单次提交且 Escape 取消**（**19.8s**）← 场景原生文字 overlay 仍绿
  12. `editor.spec.ts` › **流程 3：节点层级排序与撤销**（**39.6s**）← SCENE-LAYER，全量仍绿
  13. `editor.spec.ts` › **流程 4：组件导入、保存重开与预览交互**（**40.8s**）← COMP-DBLCLICK + COMP-XFORM，全量仍绿
  14. `editor.spec.ts` › **V8 全局层：原生元素、双击文字、保存重开与跨场景可见性**（**1.3m**）← GLOBAL-TEXT + GLOBAL-LAYER-POS，全量仍绿
  15. `editor.spec.ts` › **Component API 4 全局组件：组件范围、全部文案、保存重开与预览可见性**（**1.1m**）← GLOBAL-SCENE-LABEL + SLIDE-PREVIEW-COMP；**本轮全量绿**
  16. `render-host-benchmark.spec.ts` › Project V8 五种渲染路径可离线互动且反复切换不泄漏宿主（19.7s）

- validation entry / fixture / backend:
  - entry: 仓库默认 `playwright test`（`tests/e2e/` 三个 spec）
  - fixture: pretest 生成 photosynthesis lesson、render-host-benchmark HTML、component-catalog V8 矩阵；editor `beforeAll` 从 `examples/sample-project.h5lesson`（schema 8）克隆；本失败条读上一刀写入的 `globalComponentProjectPath`（`global-component-roundtrip.h5lesson`）；「Component API 4 全局组件」用 `globalComponentPath`（`com.example.global-nav`）+ `global-layer-entry` 后保存该 zip；其余 editor 自建临时 `.h5lesson` / Electron `--user-data-dir`
  - backend: 成熟 V8 App 表面 + Course Project V9 默认真相（CUT 后）；打开 V8 必须显式导入；catalog/render-host 夹具仍是 Project V8 离线物
- validation proves / does not prove:
  - proves: 当前脏树上 **一次** `npm run test:e2e` 跑完且 **exit 1**；「Component API 4 全局组件」全量绿；RECHECK-6 已关条目仍绿；新失败标题与首错如下
  - does not prove: 未执行的 10 条 editor 路径、三视口、17 项体验、typecheck、Vitest、教师验收。自动化不得宣称 art/accepted，也不得宣称项目级 engineering candidate。
- narrow UI smoke, if authorized: 未授权。未另开手工窗口。本任务就是全量现有 e2e。
- INTEGRATION_REQUESTS: 无。本任务不写源码。失败回派见下。「Component API 4 全局组件」本轮全量 e2e 已绿，协调者可将 `R8F-GLOBAL-PREVIEW-VIS-01` / `R8F-GLOBAL-SCENE-LABEL-01` 标 `verified`；本任务不改账本。
- DECISION_REQUESTS: 无。
- remaining risks / untested full checks:
  - 未跑：`check:ai-capabilities`、`typecheck`、`npm test`、三视口、17 项体验、`npm run verify` / `verify:full`、`build:desktop`（本任务禁止再跑）
  - `editor.spec.ts` 10 条因 serial 中止未跑
  - 点名、本轮 **没有新失败证据** 的后续：见下「点名风险本轮未踩到」
  - `v9GlobalLayerUiAdapter` 有一条 reorder/controller-move 单测可能红（早退不设 errorMessage）。本任务不跑 Vitest、不修它
  - 现有 e2e **没有** Flow / Spatial / Mixed / 七组合 / V8 显式导入拒绝 / DOCX 规格。本任务不为缺口新建 spec
  - 未领取 R8-G
- rollback point: 产品 HEAD 仍为 `f27275658c6dfaa12f2ce35cd9368dcdebe99451`。R8-F-RECHECK-7 无产品源码改动可回滚。`test-results/` 与 `dist-*` 未 commit。不要回滚 SLIDE-PREVIEW-COMP / GLOBAL-SCENE-LABEL / GLOBAL-LAYER-POS / GLOBAL-TEXT。
- execution state: `blocked`
- integration state: `n/a`
- quality state: `unverified`

## 失败 spec（标题 + 首错）

### 1. `tests/e2e/editor.spec.ts:1904`

**标题：** 互动课件编辑器 1.0 / Project V8 收敛 › Runtime API 2 / Component API 4 导出：等待 DOM 运行时后生成 PDF，并在 PPTX 保留动态层、全局 visibility 与原生文字

**耗时：** 6ms（`test.setTimeout(90_000)`）；未启动 Electron

**file:line：** `tests/e2e/editor.spec.ts:1911`

**期望：** `projectDocumentSchema.parse(...)` 得到 Project V8 文档（`schemaVersion` **8**；`canvas` object；`scenes` array；`globalLayer` array）

**收到：** `ZodError`。输入是 Course Project V9 zip（上一刀「Component API 4 全局组件」保存的 `global-component-roundtrip.h5lesson`）：`schemaVersion` 不是 8；`canvas` / `scenes` / `globalLayer` 为 `undefined`；顶层出现 V9 键 `revision`、`courseState`、`navigationGuards`、`locations`、`startLocationId`、`globalLayerItems`、`surfaces`。

**首错：**

```
ZodError: [
  {
    "code": "invalid_value",
    "values": [8],
    "path": ["schemaVersion"],
    "message": "Invalid input: expected 8"
  },
  {
    "expected": "object",
    "code": "invalid_type",
    "path": ["canvas"],
    "message": "Invalid input: expected object, received undefined"
  },
  {
    "expected": "array",
    "code": "invalid_type",
    "path": ["scenes"],
    "message": "Invalid input: expected array, received undefined"
  },
  {
    "expected": "array",
    "code": "invalid_type",
    "path": ["globalLayer"],
    "message": "Invalid input: expected array, received undefined"
  },
  {
    "code": "unrecognized_keys",
    "keys": [
      "revision",
      "courseState",
      "navigationGuards",
      "locations",
      "startLocationId",
      "globalLayerItems",
      "surfaces"
    ],
    "path": [],
    "message": "Unrecognized keys: \"revision\", \"courseState\", \"navigationGuards\", \"locations\", \"startLocationId\", \"globalLayerItems\", \"surfaces\""
  }
]

      1909 |     const projectEntry = sourceArchive['project.json']
      1910 |     if (!projectEntry) throw new Error('Runtime API 2 导出夹具缺少 project.json')
    > 1911 |     const project = projectDocumentSchema.parse(JSON.parse(
           |                                           ^
      1912 |       new TextDecoder().decode(projectEntry),
      1913 |     ) as unknown)
```

测试未跑到：改写 `globalRuntime` / 场景 runtime、写回 zip、打开工程、等 DOM 运行时、导出 PDF/PPTX。失败发生在读上一刀 V9 zip 后立刻用 V8 schema parse。同文件已 import `courseProjectDocumentSchema`，本条仍走 `projectDocumentSchema`。

**只读定位：** serial 上一刀把 V9 工程存到 `globalComponentProjectPath`。本条 `unzipSync(readFileSync(globalComponentProjectPath))` 后用 V8 `projectDocumentSchema` 解析，再准备写 V8 字段 `project.globalRuntime` / `project.scenes[0].runtime` / `project.scenes[0].nodes`。CUT 后默认保存是 V9，不能当 schema 8 打开。跟切应把该夹具当 V9 + 打开时显式导入（若仍喂 V8 zip），不要静默打开 V8。

不要为绿改 `editor.spec.ts` 成 skip / 静默打开 V8。不要回滚 SLIDE-PREVIEW-COMP 的 component/runtime 可见后备。不要回滚 GLOBAL-SCENE-LABEL 勾选框 `scene.name`。不要回滚 GLOBAL-LAYER-POS / GLOBAL-TEXT。

**窄复跑（owner 用，不要全量 e2e）：**

```
npx playwright test tests/e2e/editor.spec.ts -g "Runtime API 2 / Component API 4 导出"
```

注意：该条依赖 serial 上一刀写入的 `global-component-roundtrip.h5lesson`。窄跑前需已有该 V9 zip，或先跑「Component API 4 全局组件」。

**附件（未 commit）：**

- `test-results/editor-互动课件编辑器-1-0-Project-3de91-X-保留动态层、全局-visibility-与原生文字/error-context.md`
- 同目录 `trace.zip`

因 `test.describe.serial`，本失败还导致同文件其余 10 条 **did not run**（整课预览、流程 5–9、媒体/图片、课例验收）。

## 上一轮点名、本轮已绿（不要重开）

| 条 | 本轮证据 |
|---|---|
| 「Component API 4 全局组件：组件范围、全部文案、保存重开与预览可见性」 | **全量绿** 1.1m。不要重开 SLIDE-PREVIEW-COMP / GLOBAL-SCENE-LABEL；`SlidePublishedAdapter` 可见后备 + 勾选框 `scene.name` 必须保留 |
| 「V8 全局层」；目录 UI；简洁模式试运行；CoursePlayer 宿主；Player 与编辑交互层；统一画布；流程 1；流程 2；文字编辑事务；P0 画布真实双击；流程 3；流程 4；render-host-benchmark | 全量仍绿。不要重开 |

## 点名风险本轮未踩到（不要当本轮实锤）

因 serial 停在第 16 条，**没有新失败证据**。原样记录：

| 风险 | 本轮证据 | 只读现状 |
|---|---|---|
| 整课预览 overlay（`course-preview-host`，不是新窗口） | **未跑**（「整课预览：后台教师控制器…」did not run） | spec 已有 `openCoursePreviewOverlay`。上一刀「Component API 4 全局组件」已走过 overlay 且全量绿；本条是另一条「后台教师控制器可拖动…」 |

不要因为本轮没跑到就重开 FIX-E2E / SELECT-TAB / SCENE-LAYER / IMPORT / TEXT-TXN / COMP-DBLCLICK / COMP-XFORM / GLOBAL-TEXT / GLOBAL-LAYER-POS / GLOBAL-SCENE-LABEL / SLIDE-PREVIEW-COMP。

## 未跑标题（10）

1. 整课预览：后台教师控制器可拖动、键盘细移并保持会话位置
2. 流程 5：Presenter 在单 HTML 与网页包均可离线翻页
3. 媒体批量与连续插入：排布、入库、页签和单次撤销
4. 补充流程：图片导入、替换与工程往返
5. 流程 6：箭头、大括号与多选对齐
6. 流程 7：两页课件导出 PDF 与 PPTX
7. 流程 8：字体与局部富文本在内容编辑后保持同步
8. 流程 8B：V8 着重号与语义公式跨表面导出证据
9. 流程 9：未保存课件自动恢复
10. 课例验收：三页光合作用课例可离线互动

## 建议下一刀（按文件；本任务不修）

本轮只证明了 **一条** 新失败。协调者按文件派，只跑窄 Playwright。不要预修下一条。不要跑 Vitest 修 `v9GlobalLayerUiAdapter`。

### A. 本轮实锤 — Runtime/Component 导出夹具仍用 V8 schema 解析上一刀 V9 zip

| 文件 | 建议 |
|---|---|
| `tests/e2e/editor.spec.ts` | **不要** skip / 不要静默打开 V8 / 不要改断言阈值。本条 `:1911` 把上一刀 V9 `globalComponentProjectPath` 喂给 `projectDocumentSchema`。跟切该夹具为 V9（同文件已有 `courseProjectDocumentSchema`）并在打开 V8 残留时走显式导入。窄复跑 `-g "Runtime API 2 / Component API 4 导出"`。 |
| 导出 / persist 产品路径 | 只在跟切夹具不够、真实导出仍红时再动。本轮 6ms 死在 parse，**没有** PDF/PPTX 产品失败证据。 |

不要为绿 skip。不要重开 Component API 4 全局组件 / V8 全局层 / 流程 4 / 交互层 / 目录 UI / 简洁模式 / CoursePlayer / 统一画布 / 流程 1 / 文字编辑事务 / P0 双击 / 流程 3。

### B. 未跑、可能下一红（本轮无新证据）

仍在 **`tests/e2e/editor.spec.ts`** serial 第 17–26 条。优先等 A 清零后再全量。若 A 过后下一条红，再按失败标题派，不要预修。

下一条将是「整课预览：后台教师控制器…」（`course-preview-host` overlay，不是新窗口），本轮无证据，不要预修。

## 给协调者

1. R8-F-RECHECK-7 唯一授权命令 **exit 1**，状态 **`blocked`**。不要领取 R8-G。
2. 「Component API 4 全局组件」全量已绿；可将 `R8F-GLOBAL-PREVIEW-VIS-01` / `R8F-GLOBAL-SCENE-LABEL-01` 标 `verified`（本任务不改账本）。SLIDE-PREVIEW-COMP 的 component/runtime 可见后备与 GLOBAL-SCENE-LABEL 勾选框 `scene.name` 必须保留。GLOBAL-LAYER-POS / GLOBAL-TEXT 必须保留。
3. RECHECK-6 已关条目本轮仍绿。不要重开那些刀。
4. 先回派 **A**（Runtime/Component 导出夹具跟切 V9 + 显式导入）。清零后再全量 `npm run test:e2e`。
5. 禁止为绿而 skip / 放宽未授权断言 / 新建 §5 spec / 静默打开 V8。
6. 不要宣称项目级 engineering candidate（留给 R8-Z 在机器全绿后写）。
7. 已知非本轮：`v9GlobalLayerUiAdapter` reorder/controller-move 单测。不要顺手派 Vitest。

## 未跑集合（R8-F-RECHECK-7 授权外）

- `check:ai-capabilities` / `typecheck`（R8-C）
- `npm test`（R8-D）
- `build:desktop`（R8-E 已交；本任务 pretest 自己构建了 player/renderer/electron，未再跑 `build:desktop`）
- 三视口视觉（R8-G）— **未领取**
- 17 项真实体验（R8-H）
- `npm run verify` / `verify:full` / `npm run build`
- 未写 `artifacts/FINAL_GATE_REPORT.md`（R8-Z）

R8-F-RECHECK-7 不领取 R8-G。quality 保持 `unverified`。禁止 art/accepted。禁止项目级 engineering candidate。
