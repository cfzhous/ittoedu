HANDOFF
- task: R8-FIX-GLOBAL-LAYER-POS
- planning pack path: `C:\Users\74755\Documents\HTML课件编辑器\docs\tasks\v8-to-v9-rebuild`
- product worktree / branch / baseline SHA: `C:\Users\74755\Documents\HTML课件编辑器-v8-to-v9-rebuild` / `codex/v8-to-v9-rebuild` / `f27275658c6dfaa12f2ce35cd9368dcdebe99451`
- outcome: `CandidateGlobalLayerSettings` 已恢复与 V8 同标签的「图层位置」underlay/overlay 与 Slide 下「场景可见范围」；图层位置读写映射到 `item.order`（相对当前 slide surface 全部 scene.layerItems；无 scene items 时 underlay 占文档最低 order）。`updateGlobalLayerSettings` V9 分支 `patch.layer` 不再 no-op。定向 e2e「V8 全局层」**1 passed（1.4m）**。未 skip、未改 `editor.spec.ts`、未回滚 GLOBAL-TEXT、未宣称 schema 有 underlay 字段。未 commit。未领取 R8-G。未宣称 art/accepted。不是项目级 engineering candidate。定向整条绿 → `lane_candidate`。
- owned files changed (product worktree):
  - `src/renderer/ui/PropertiesTab.tsx`（`CandidateGlobalLayerSettings`：补「图层位置」SelectField；Slide location 用「场景可见范围」+ 全部/仅所选/除所选场景外；checkbox 仍用 `location.label`；保留「当前页显示」与 `data-testid="global-layer-settings"`）
  - `src/renderer/course/globalLayerCommands.ts`（新增 `setGlobalLayerScenePlane` / `readGlobalLayerScenePlane` / `collectSlideSurfaceSceneOrders`；写 underlay 用 `shiftCourseLayerOrdersAtOrAbove` 放到全部 scene orders 之下；写 overlay 放到 scene 与其余 item 之上；不写入 `scene.layerItems`、不加 `layer` 字段）
  - `src/renderer/store/editorStore.ts`（`updateGlobalLayerSettings` V9：`patch.layer` 走 `setGlobalLayerScenePlane`；`patch.visibility` 仍走 `setCandidateGlobalLayerLocationVisibility`。另：`importV9CandidateMedia` 在 `editingScope === 'global'` 且 add image/video 时改走已有 `addImageNode`/`addVideoNode`，否则 `placeMediaItems` 因 `session.scope !== 'scene'` 拒写，定向条加图后保存只有 3 个全局项）
  - `tests/unit/globalLayerUi.test.tsx`（Slide 文案「场景可见范围」；新增 underlay order 映射用例）
  - `tests/unit/v9GlobalLayerUiAdapter.test.tsx`（`getByLabelText('场景可见范围')`；断言「图层位置」存在）
  计划侧：本 HANDOFF；`00_INDEX.md` 本行与状态条。
  **未改**：`tests/e2e/editor.spec.ts`、`App.tsx`、`Workspace.tsx`、Course Project schema、`globalLayerItems` 新字段、默认 backend、教师控制器专用路径、GLOBAL-TEXT 的 content edit 刀、COMP-DBLCLICK / COMP-XFORM / TEXT-TXN / IMPORT / SCENE-LAYER / SELECT-TAB / FIX-E2E。
- donor files/functions consulted:
  - V8 `GlobalLayerSettings`（同文件：`label="图层位置"` / `场景可见范围` / checkbox `scene.name`）
  - `allocateCourseLayerOrder` / `shiftCourseLayerOrdersAtOrAbove` / `setGlobalLayerLocationVisibility`
  - `migrateProjectV8ToCourseProjectV9`（underlay 低 order、overlay 高于 scene items）
  - `placeMediaItems`（`session.scope !== 'scene'` → `SLIDE_REJECT_WRONG_OWNER`）
- donor 舍弃部分:
  - 给 `ScopedLayerItem` 加 `layer` 字段或改 schema
  - 改 e2e 断言 / skip / 预修「Component API 4 全局组件」
  - 回滚 GLOBAL-TEXT `locateEditableNative` / `writeNativeContent` / 全局 begin
  - 改 `App.tsx` 导入拦截；改 checkbox 为 `surface.title · scene.name`
- focused validation command:
  ```
  npx vitest run tests/unit/globalLayerUi.test.tsx tests/unit/v9GlobalLayerUiAdapter.test.tsx
  npm run build:renderer
  npx playwright test tests/e2e/editor.spec.ts -g "V8 全局层"
  git diff --check -- src/renderer/ui/PropertiesTab.tsx src/renderer/store/editorStore.ts src/renderer/course/globalLayerCommands.ts tests/unit/globalLayerUi.test.tsx tests/unit/v9GlobalLayerUiAdapter.test.tsx
  ```
  工作目录：产品 worktree。Windows PowerShell。A 前 `npm run build:renderer`（未跑 `build:desktop`）。`VITE_DEV_SERVER_URL` unset，未抢 `:5173`（仍为 PID 19296）。`--user-data-dir` 用 spec 已有 `electron-profile-${pid}`。未另开手工 App。未跑全量 `test:e2e` / `verify` / typecheck / `npm test`。
- validation result:

  | # | 命令 | exit | 结果 |
  |---|---|---:|---|
  | 1 | `npx vitest run tests/unit/globalLayerUi.test.tsx tests/unit/v9GlobalLayerUiAdapter.test.tsx` | 1 | **globalLayerUi 5 passed**；adapter **4 passed / 1 failed**（`reorders inside one owner…` 期望 `errorMessage === CONTROLLER_MOVE_REASON`，实为 `null`；`refusesTeacherControllerOwnerMove` 早退不设错误。先于本刀，未改该断言/move 函数） |
  | 2 | `npm run build:renderer` | 0 | vite 2.41s；写入 `dist-renderer/` |
  | 3 | `npx playwright test tests/e2e/editor.spec.ts -g "V8 全局层"` | 0 | Playwright。**1 passed（1.4m）**。原 `:1743` 图层位置已过；保存重开 4 图层、文字「全课程统一标题」、跨场景预览像素差均过 |
  | 4 | `git diff --check --` 上列 5 个 owned 路径 | 0 | 无输出 |

  Electron 槽已释放。`:5173` 仍为同一 PID。
- validation entry / fixture / backend:
  - entry: `CandidateGlobalLayerSettings` + `updateGlobalLayerSettings` V9 + `setGlobalLayerScenePlane`；Electron 编辑器（spec `launchEditor`）
  - fixture: 空白 Course Project V9；e2e 走 `global-layer-entry` + `add-text` + underlay + include「场景 1」+ 图/形状 + 保存重开
  - backend: 默认 `v9-slide-candidate`；未切回 V8
- validation proves / does not prove:
  - proves: 教师仍能把全局元素放到场景内容下方（order）并设仅所选场景；`getByLabel('图层位置'|'场景可见范围'|'场景 1')` 可用；定向「V8 全局层」e2e 绿；全局 add-image 在 V9 写入 `globalLayerItems` 而非被 `placeMediaItems` 拒写
  - does not prove: 全量 `npm run test:e2e`（留给 R8-F-RECHECK）；「Component API 4 全局组件」；typecheck；全量 Vitest；`build:desktop`；adapter 那条 reorder/controller-move 单测
- narrow UI smoke, if authorized: 未授权手工窗口。本任务只跑上列定向 Vitest + Playwright。
- INTEGRATION_REQUESTS:
  ```
  INTEGRATION_REQUEST
  - requester task: R8-FIX-GLOBAL-LAYER-POS
  - target stage integrator: 协调者（账本 / 下一轮 R8-F-RECHECK）
  - id: R8F-GLOBAL-LAYER-POS-01
  - target hotspot file: artifacts/FINAL_GATE_REPORT.md 行 R8F-GLOBAL-LAYER-POS-01
  - exported symbol / callback: setGlobalLayerScenePlane + CandidateGlobalLayerSettings 图层位置/场景可见范围 + updateGlobalLayerSettings(patch.layer)
  - required user-visible behavior: 全局元素属性栏可设 underlay/overlay 与仅所选场景；勾选「场景 1」
  - focused test proving lane side: editor.spec「V8 全局层」1 passed（1.4m）；globalLayerUi 5 passed
  - exact wiring requested: 本刀标 implemented / lane_candidate。全量 e2e 留给 R8-F-RECHECK。不要领取 R8-G。
  - risk if omitted: 协调者仍按 :1743「图层位置」超时分类该条
  - status: implemented
  ```
- DECISION_REQUESTS: 无。
- remaining risks / untested full checks:
  - 未跑：全量 `npm run test:e2e`、`typecheck`、`npm test`、`build:desktop`、三视口、17 项体验、`verify`
  - `v9GlobalLayerUiAdapter` reorder/controller-move 单测仍红（早退不设 `errorMessage`）；未改 move 刀口
  - 「Component API 4 全局组件」未跑（本轮不预修；同一套控件已在）
  - `importV9CandidateMedia` 全局加图路由是本条 e2e 加图所必需，超出原「仅 updateGlobalLayerSettings」字面，但未改 App.tsx
  - `editorStore.ts` / `PropertiesTab.tsx` 是重建脏树共享文件；回滚本 lane 只还原上列函数
  - 未领取 R8-G
- rollback point: 产品 HEAD 仍为 `f27275658c6dfaa12f2ce35cd9368dcdebe99451`。回退本 lane：还原 `CandidateGlobalLayerSettings`；还原 `updateGlobalLayerSettings` V9 与 `importV9CandidateMedia` 全局 add 分支；删除 `setGlobalLayerScenePlane` 及相关 helper；还原两份 unit 文案/新增用例。
- next recommended owner: 协调者派 **R8-F-RECHECK** 跑全量 e2e。不要领取 R8-G。
