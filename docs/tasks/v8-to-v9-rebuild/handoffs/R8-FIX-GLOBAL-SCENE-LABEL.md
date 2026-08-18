HANDOFF
- task: R8-FIX-GLOBAL-SCENE-LABEL
- planning pack path: `C:\Users\74755\Documents\HTML课件编辑器\docs\tasks\v8-to-v9-rebuild`
- product worktree / branch / baseline SHA: `C:\Users\74755\Documents\HTML课件编辑器-v8-to-v9-rebuild` / `codex/v8-to-v9-rebuild` / `f27275658c6dfaa12f2ce35cd9368dcdebe99451`
- outcome: `CandidateGlobalLayerSettings` 勾选框可访问名：Slide `location.kind === 'slide-scene'` 时经 `surface.scenes` 查找 `scene.name`，找不到再回退 `location.label`；Flow/Spatial 仍用 `location.label`。未改 `location.label` 持久化、`courseLocationCommands` / `mutateAddSlideScene`、`editorStore`、schema、`editor.spec.ts`。定向 e2e 已越过原首错 `:1849`（`getByLabel('场景 2', { exact: true }).check()`）。整条仍红：新首错 `:1893` 预览两页截图像素差为 0（期望 > 0.02）。未 skip、未改断言、未少点 `add-content-primary`。未预修导出条 / 整课预览。未回滚 LAYER-POS / GLOBAL-TEXT / COMP-* / TEXT-TXN / IMPORT / SCENE-LAYER / SELECT-TAB / FIX-E2E。未 commit。未领取 R8-G。未宣称 art/accepted。不是项目级 engineering candidate。定向未整条绿 → `blocked`。
- owned files changed (product worktree):
  - `src/renderer/ui/PropertiesTab.tsx`（仅 `CandidateGlobalLayerSettings`：新增同文件 helper `candidateLocationVisibilityLabel`；checkbox `<span>` 改用该 helper。保留 `data-testid={location-visibility-${location.id}}`、图层位置、场景可见范围、当前页显示、visibility 仍写 `locationIds`。未整文件重写）
  计划侧：本 HANDOFF；`00_INDEX.md` 本行与状态条。
  **未改**：`tests/e2e/editor.spec.ts`、`tests/unit/globalLayerUi.test.tsx`、`tests/unit/v9GlobalLayerUiAdapter.test.tsx`（断言不依赖「未命名课件 · 场景 2」）、`courseLocationCommands.ts`、`mutateAddSlideScene`、`editorStore.ts`、Course Project schema、`App.tsx`、`Workspace.tsx`。
- donor files/functions consulted:
  - V8 `GlobalLayerSettings`（同文件：checkbox `<span>{scene.name}</span>`）
  - `mutateAddSlideScene`（只读：`location.label = ${surface.title} · ${scene.name}`，如「未命名课件 · 场景 2」；`scene.name` 仍为「场景 2」）
  - [`handoffs/R8-F-RECHECK-6.md`](R8-F-RECHECK-6.md) 原首错 `:1849`
- donor 舍弃部分:
  - 改新建场景的持久化 `location.label`
  - 把 e2e 断言改成「未命名课件 · 场景 2」/ skip / 少点 `add-content-primary`
  - 预修 `:1893` 预览像素差、导出条、整课预览
  - 改 `v9GlobalLayerUiAdapter` reorder/controller-move
  - 回滚 LAYER-POS 的 `setGlobalLayerScenePlane` / `importV9CandidateMedia` 全局加图，或 GLOBAL-TEXT
- focused validation command:
  ```
  npm run build:renderer
  npx playwright test tests/e2e/editor.spec.ts -g "Component API 4 全局组件"
  git diff --check -- src/renderer/ui/PropertiesTab.tsx
  ```
  工作目录：产品 worktree。Windows PowerShell。A 前 `npm run build:renderer`（未跑 `build:desktop`）。`VITE_DEV_SERVER_URL` unset，未抢 `:5173`（仍为 PID 19296）。`--user-data-dir` 用 spec 已有 `electron-profile-${pid}`。未另开手工 App。未跑全量 `test:e2e` / `verify` / typecheck / `npm test`。未跑 unit（未改 unit 文件）。
- validation result:

  | # | 命令 | exit | 结果 |
  |---|---|---:|---|
  | 1 | `npm run build:renderer` | 0 | vite 2.83s；写入 `dist-renderer/` |
  | 2 | `npx playwright test tests/e2e/editor.spec.ts -g "Component API 4 全局组件"` | 1 | Playwright。**1 failed（1.1m）**。原 `:1849` 已过；新首错 `:1893` |
  | 3 | `git diff --check -- src/renderer/ui/PropertiesTab.tsx` | 0 | 无输出 |

  Electron 槽已释放。`:5173` 仍为同一 PID。

  ### 新首错（禁止改断言；本刀未修）

  `tests/e2e/editor.spec.ts:1819`「Component API 4 全局组件：组件范围、全部文案、保存重开与预览可见性」
  现首错 `:1893`：`expect(await averagePixelDifference(hiddenOnFirst, shownOnSecond)).toBeGreaterThan(0.02)` → Received `0`。
  其前已过：导入 global-nav、`add-content-primary`、`global-layer-entry`、属性栏文案、「图层位置」overlay、「场景可见范围」include、**`getByLabel('场景 2', { exact: true }).check()`**、几何撤销重做、保存重开（图层 2 项、全局标题/下一页/replay 文案）、`openCoursePreviewOverlay`、`course-preview-next`（若有 `data-location-id` 则 poll 已切页）。
  归因（只读，超出本任务授权）：勾选框文案已对齐 `scene.name`，测试进入整课预览 overlay 后两页截图无像素差。可能是 include/`locationIds` 未在 preview 生效，或两页画面相同。本任务禁止改 preview / Player / store / schema / 断言。
- validation entry / fixture / backend:
  - entry: `CandidateGlobalLayerSettings` checkbox 可访问名；Electron 编辑器（spec `launchEditor`）
  - fixture: 空白 Course Project V9；e2e 走导入 `com.example.global-nav` + `add-content-primary`（`addCourseContent('scene', { title: '场景 2' })`）+ 全局组件 + include「场景 2」
  - backend: 默认 `v9-slide-candidate`；未切回 V8
- validation proves / does not prove:
  - proves: Slide 勾选框可访问名为 `scene.name`「场景 2」，不再是 `location.label`「未命名课件 · 场景 2」；`:1849` `.check()` 可命中；其后几何撤销重做与保存重开文案已执行
  - does not prove: 整条「Component API 4 全局组件」e2e（停在预览像素差）；include 可见性在 preview overlay 中生效；导出条；全量 `npm run test:e2e`；typecheck；全量 Vitest；`build:desktop`
- narrow UI smoke, if authorized: 未授权手工窗口。本任务只跑上列定向 Playwright。
- INTEGRATION_REQUESTS:
  ```
  INTEGRATION_REQUEST
  - requester task: R8-FIX-GLOBAL-SCENE-LABEL
  - target stage integrator: 协调者（账本 / 下一轮 FIX）
  - id: R8F-GLOBAL-SCENE-LABEL-01
  - target hotspot file: src/renderer/ui/PropertiesTab.tsx CandidateGlobalLayerSettings
  - exported symbol / callback: candidateLocationVisibilityLabel（仅 UI 文案；visibility 仍写 locationIds）
  - required user-visible behavior: 全局层「仅所选场景」勾选框对 Slide 显示 scene.name，使 getByLabel('场景 2', { exact: true }) 可命中
  - focused test proving lane side: 定向 e2e 已过 :1849；整条仍红于 :1893
  - exact wiring requested: 勾选框文案刀口可标 implemented。整条「Component API 4 全局组件」仍 blocked，见 R8F-GLOBAL-PREVIEW-VIS-01。不要领取 R8-G。
  - risk if omitted: 协调者仍按 :1849「场景 2」超时分类该条
  - status: implemented
  ```
  ```
  INTEGRATION_REQUEST
  - requester task: R8-FIX-GLOBAL-SCENE-LABEL
  - target stage integrator: 协调者（回派下一 FIX；非本刀）
  - id: R8F-GLOBAL-PREVIEW-VIS-01
  - target hotspot file: 预览 overlay / Player 对 globalLayerItems.visibility.locationIds 的逐 location 显隐（非本任务授权路径）
  - exported symbol / callback: 无本 lane 导出。本刀未改 preview
  - required user-visible behavior: include 仅「场景 2」后，course-preview 第一页与第二页截图应有像素差 > 0.02
  - focused test proving lane side: 本轮定向 e2e 首错 :1893 averagePixelDifference === 0
  - exact wiring requested: 新 FIX 查 preview 是否尊重 locationIds include；禁止改 editor.spec 断言 / skip。不要领取 R8-G。不要预修导出条 / 整课预览专条。
  - risk if omitted: 勾选名已绿的前半会被预览像素差挡住，全量 e2e 仍停在 serial 第 15 条
  - status: open
  ```
- DECISION_REQUESTS: 无。
- remaining risks / untested full checks:
  - 未跑：全量 `npm run test:e2e`、`typecheck`、`npm test`、`build:desktop`、三视口、17 项体验、`verify`
  - 整条「Component API 4 全局组件」在 preview 像素差处红；导出条与其后 11 条未跑
  - 未改 unit；`v9GlobalLayerUiAdapter` reorder/controller-move 仍可能红（本刀未碰）
  - `PropertiesTab.tsx` 是重建脏树共享文件；回滚本 lane 只还原 helper 与 checkbox `<span>`
  - 未领取 R8-G
- rollback point: 产品 HEAD 仍为 `f27275658c6dfaa12f2ce35cd9368dcdebe99451`。回退本 lane：删除 `candidateLocationVisibilityLabel` 及其 import；checkbox `<span>` 还原为 `{location.label}`。
- execution state: `blocked`
- integration state: `pending`（勾选框文案刀口已落地；整条定向 e2e 仍红）
- quality state: `unverified`
- next recommended owner: 协调者派 **R8-FIX** 修 preview overlay 对 `locationIds` include 的逐页显隐（`:1893`）。不要领取 R8-G。全量 e2e 留给该条绿后再派 R8-F-RECHECK。

禁止用语核对：未写 `art candidate` / `accepted`；未把本任务标成项目级 `engineering candidate`；未领取 R8-G。
