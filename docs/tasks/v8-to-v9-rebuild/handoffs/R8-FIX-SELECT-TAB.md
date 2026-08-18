HANDOFF
- task: R8-FIX-SELECT-TAB
- planning pack path: `C:\Users\74755\Documents\HTML课件编辑器\docs\tasks\v8-to-v9-rebuild`
- product worktree / branch / baseline SHA: `C:\Users\74755\Documents\HTML课件编辑器-v8-to-v9-rebuild` / `codex/v8-to-v9-rebuild` / `f27275658c6dfaa12f2ce35cd9368dcdebe99451`
- outcome: 产品最短刀：画布 `selectLayers` 成功且选中非空时 `setActiveTab('properties')`，与 `selectNode` 对齐；空选保持当前 tab。未在 `persistCandidateResult` 里见选中就切 tab。未改双击、`Workspace` preview `useEffect` / React key / blob URL。A 定向绿。跟切了同文件 `editor.spec.ts` 的 add-content-primary、图层计数（filter 控制器）、整课预览 overlay。未 skip，未新建 §5 spec，未退回 blob iframe，未把 `add-content-primary` 改回 `add-scene`。未 commit。未领取 R8-G。A 绿 → `lane_candidate`。不是 art/accepted。不是项目级 engineering candidate。
- owned files changed (product worktree):
  - `src/renderer/ui/workspaceSlideAuthoring.ts`（脏树上本就未入 HEAD；本轮补 `revealPropertiesAfterSelectLayers`）
  - `tests/e2e/editor.spec.ts`
  计划侧：本 HANDOFF；`00_INDEX.md` 本行。
  **未改**：`src/renderer/store/editorStore.ts` persist 本体、`Workspace.tsx` capture / preview、默认 backend。
- donor files/functions consulted:
  - [`handoffs/R8-F-RECHECK.md`](R8-F-RECHECK.md) 首错与只读定位
  - `editorStore.ts` `selectNode` / `selectNodes`（选中非空切 `properties`）vs `persistCandidateResult`（只写 `selectedNodeIds`）
  - `Workspace.tsx` `onPointerDownCapture` → `slideAuthoring.pointerDown`（`stopPropagation`，Phaser `onNodeSelected` 不到）
  - `AddCourseContentMenu.tsx` `data-testid="add-content-primary"`
  - `App.tsx` `course-preview-overlay` / `course-preview-host`
  - `componentCatalogMatrix.spec.ts` 图层 filter 控制器、整课预览 overlay
- donor 舍弃部分:
  - 每次 `persistCandidateResult` 只要 `selectionIds.length > 0` 就切 tab（会把教师从图层/媒体拽走）
  - 改双击路径（已走 `store.selectNode`）
  - 为绿把 A 断言改成只查图层选中
  - 藏教师控制器；退回 blob 试运行 iframe；产品 testid 改回 `add-scene`
  - 改 `Workspace.tsx` preview / capture
- focused validation command:
  ```
  npx playwright test tests/e2e/editor.spec.ts -g "Player 与编辑交互层"
  git diff --check -- src/renderer/ui/workspaceSlideAuthoring.ts tests/e2e/editor.spec.ts
  ```
  A 绿后跟切 B，另跑：
  ```
  npx playwright test tests/e2e/editor.spec.ts -g "流程 1：场景新增"
  npx playwright test tests/e2e/editor.spec.ts -g "流程 3：节点层级"
  ```
  工作目录：产品 worktree。Windows PowerShell。A 前 `npm run build:renderer`（只重建 renderer，未跑 `build:desktop`）。`VITE_DEV_SERVER_URL` unset，未抢 `:5173`（仍为 PID 19296）。`--user-data-dir` 用 spec 已有临时 profile。未另开手工 App。未跑全量 `test:e2e` / `verify` / typecheck / `npm test`。
- validation result: Playwright 1.61.1。**A「Player 与编辑交互层」1 passed（59.1s / 1.0m）**。`git diff --check` 对 `editor.spec.ts` 无输出、exit 0。跟切后定向：**流程 1 红**（见下）；**流程 3 过了 authored 计数，红在拖排序**。Electron 槽已释放。
- validation entry / fixture / backend:
  - entry: Electron 编辑器（spec `launchEditor`）
  - fixture: 空白 Course Project V9
  - backend: 默认 `v9-slide-candidate`；未切回 V8
- validation proves / does not prove:
  - proves: 平移后点文字中心，「属性」tab `aria-selected=true`；空选路径仍通（该条后半拖移/适合窗口也过）
  - does not prove: 全量 `npm run test:e2e`（留给下一轮 R8-F-RECHECK）；流程 1 删除场景；流程 3 图层拖排序；整课预览 overlay 定向未跑到（未再跑流程 4 / 控制器预览）
- narrow UI smoke, if authorized: 未授权手工窗口。
- INTEGRATION_REQUESTS:
  ```
  INTEGRATION_REQUEST
  - requester task: R8-FIX-SELECT-TAB
  - target stage integrator: 协调者（账本 / 下一轮 R8-F-RECHECK）
  - target hotspot file: artifacts/FINAL_GATE_REPORT.md 行 R8F-SELECT-01
  - exported symbol / callback: workspaceSlideAuthoring revealPropertiesAfterSelectLayers → store.setActiveTab('properties')
  - required user-visible behavior: 画布点选（及框选命中）打开属性；空选不切 tab
  - focused test proving lane side: editor.spec「Player 与编辑交互层」1 绿
  - exact wiring requested: 将 R8F-SELECT-01 标为 implemented；全量 e2e 由下一轮 R8-F-RECHECK 关闭为 verified。不要领取 R8-G。
  - risk if omitted: 协调者仍按属性 tab 红分类该条
  - status: implemented
  ```
- DECISION_REQUESTS: 无。
- remaining risks / untested full checks:
  - 未跑：全量 `npm run test:e2e`、`typecheck`、`npm test`、`build:desktop`、三视口、17 项体验、`verify`
  - 流程 1：产品课树是 `[data-testid^="scene-item-"]`，已跟切；**ScenePanel 没有「删除场景」按钮**（store 有 `deleteScene`，UI 未挂）。下一轮全量仍可能在删除步红
  - 流程 3：`authoredLayerRows` 计数已过；`moveSortableUp` 把矩形拖成「全课 · 全部页面」（统一图层 owner 投放），名称反序断言红
  - 整课预览：spec 已改为 overlay/host；SlidePublishedAdapter 不渲染教师控制器，原独立窗拖控制器断言已改成 overlay 翻页。该条本轮未再跑
  - `workspaceSlideAuthoring.ts` 在产品 HEAD 上仍是 untracked（重建脏树既有）；回滚需还原该文件本轮函数，不能只 `git checkout`
- rollback point: 产品 HEAD 仍为 `f27275658c6dfaa12f2ce35cd9368dcdebe99451`。回退本 lane：还原 `workspaceSlideAuthoring.ts` 的 `revealPropertiesAfterSelectLayers` 三处调用；还原 `tests/e2e/editor.spec.ts` 本轮 diff。
- execution state: `lane_candidate`
- integration state: `pending`（A 定向 e2e 绿；全量 e2e 待下一轮 R8-F-RECHECK）
- quality state: `unverified`
