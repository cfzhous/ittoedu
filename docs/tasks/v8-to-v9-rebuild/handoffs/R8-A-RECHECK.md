HANDOFF
- task: R8-A-RECHECK
- planning pack path: `C:\Users\74755\Documents\HTML课件编辑器\docs\tasks\v8-to-v9-rebuild`
- product worktree / branch / baseline SHA: `C:\Users\74755\Documents\HTML课件编辑器-v8-to-v9-rebuild` / `codex/v8-to-v9-rebuild` / `f27275658c6dfaa12f2ce35cd9368dcdebe99451`
- outcome: 窗口复验 **通过** `PRE-R8-01` 的冒烟判定（`evidence.passed=true`）。R8-FIX-PREVIEW 的结构指纹生效：默认空白 V9 Slide、fresh profile 下，单击课树当前页、单击画布空白、插入标题后双击 **不再** 闪「正在准备编辑画布 / 隔离页面已连接，正在启动 Player… / 正在载入隔离 Player…」，隔离 iframe **blob `src` 不换**，`canvas-stage` 同一 DOM 节点。主按钮新场景再点回场景 1：允许短暂同步；宿主 identity 未因 React remount 丢失。未改 `src/**`。未加回 `locationId:generation` key。未把 `PRE-R8-01` 标 verified（协调者改账本）。未宣称 art/accepted。未 commit。未领取 R8-E/F。Electron 与 Vite `:5176` 已停；未杀 `:5174`。
- owned files changed:
  产品 worktree（gitignore `output/`，不要提交二进制）：
  - `output/r8-a-recheck/run-smoke.cjs`
  - `output/r8-a-recheck/evidence.json`（`passed=true`）
  - `output/r8-a-recheck/01-initial-edit-canvas.png` … `06-optional-drag-scene.png`、`99-final.png`、`vite.log`
  - 过程归档（不覆盖 `output/r8-a-smoke/`）：`evidence-run1.json`、`evidence-run2-hmr.json`、`run1-*.png`、`run2-*.png`、`vite-run2.log`
  计划侧：本 HANDOFF。未改账本。
- donor files/functions consulted:
  - [`handoffs/R8-A.md`](R8-A.md)、[`handoffs/R8-FIX-PREVIEW.md`](R8-FIX-PREVIEW.md)、`10_R8` §11.2
  - 只读改编：`output/r8-a-smoke/run-smoke.cjs`（identity 标记、MutationObserver 抓 `.runtime-preview-loading`、8s `app.close` 超时）
  - 只读：`Workspace.tsx` / `workspaceSlidePreviewRebuild.ts`（不写）
- focused validation command:
  ```
  npx vite --config vite.renderer.config.ts --host 127.0.0.1 --port 5176 --strictPort
  node output/r8-a-recheck/run-smoke.cjs
  git diff --check
  ```
  工作目录：产品 worktree。无 Vitest。无 `VITE_V9_CANDIDATE_SMOKE`。`--user-data-dir=output/r8-a-recheck/electron-profile`。Playwright `_electron.launch`（`--remote-debugging-port=9351`）。
- validation result: `evidence.passed=true`。`git diff --check` 无输出（本任务未改 `src/`）。Vite `http://127.0.0.1:5176` 由冒烟脚本拉起并在结束时关掉。`:5174` 全程仍 LISTENING（pid 19432），未杀。
- validation entry / fixture / backend:
  - entry: 成熟 V8 `App` / `Workspace` Slide 编辑画布；课树 `scene-item-*`；`add-content-primary`；`canvas-stage`；`text-edit-overlay`
  - fixture: 默认空白 V9 Slide（fresh `--user-data-dir`）
  - backend: Course Project V9 + 隔离 iframe Player（authoring hostMode）
- validation proves / does not prove:
  - proves: 首次载入后启动层消失且为「编辑状态」；单击当前页与单击画布空白不闪启动层、blob `src` 不变、`canvas-stage` 同一节点；插入标题后的隔离 Player 重建可结束后，双击打开 `text-edit-overlay` 且双击过程 blob 不变、无启动层；切场景再点回宿主节点不因 React remount 更换
  - does_not_prove: 未跑 typecheck / 全量 test / build / E2E / 三视口 / 17 项体验；未证明 Flow/Spatial；未把账本 `PRE-R8-01` 标 verified
- narrow UI smoke, if authorized: **做成，Gate 通过。** 证据 `output/r8-a-recheck/`。检测方法同 R8-A：`data-r8a-identity` + MutationObserver；本复验额外比较 iframe blob `src`。

| 步 | 结果 | 证据 |
|---|---|---|
| 01 初始编辑画布 | 通过。编辑状态；启动层消失 | `01-initial-edit-canvas.png` |
| 02 单击课树当前页 | 通过。无盖层；blob `src` 未换；`sameStageNode=true` | `02-click-current-page.png` |
| 03 单击画布空白 | 通过。`elementFromPoint` = `CANVAS`/`canvas-stage`；0 节点未变；无盖层；blob 未换 | `03-click-canvas-blank.png` |
| 04 插入标题后双击 | 通过。插入允许重建；双击无盖层、blob 未换；`text-edit-overlay` 可见 | `04-double-click-text.png` |
| 05 主按钮新场景再点回 | 通过。切页允许换 blob；`canvas-stage` identity 仍为 `r8a-70bc9b32-…` | `05-add-scene-and-switch.png` |
| 06 可选 PRE-R8-02 | 不挡 PRE-R8-01。同一父级 slide-scene grip 拖排后顺序对调 | `06-optional-drag-scene.png` |

- INTEGRATION_REQUESTS:
  ```
  INTEGRATION_REQUEST
  - requester task: R8-A-RECHECK
  - target stage integrator: coordinator
  - id: PRE-R8-01
  - target hotspot file: `src/renderer/ui/Workspace.tsx`（Slide 隔离 Player preview effect / `buildSlidePreviewRebuildKey`）
  - exported symbol / callback: `buildSlidePreviewRebuildKey`
  - required user-visible behavior: 编辑态单击当前页、单击画布空白、双击文字不得整页盖上隔离 Player 启动层；切场景仍允许短暂 loading
  - focused test proving lane side: `output/r8-a-recheck/evidence.json`（`passed=true`；步骤 02–04 `overlayVisible=false`、`blobSrcChanged=false`、`sameStageNode=true`；步骤 04 `textEditOpen=true`）
  - exact wiring requested: 不要加回 `locationId:generation` React key。窗口证据已绿；请协调者把账本 `PRE-R8-01` 从 implemented 改为 verified。本任务不改账本。
  - risk if omitted: 账本仍写窗口未复验
  - status: implemented
  ```
  ```
  INTEGRATION_REQUEST
  - requester task: R8-A-RECHECK
  - target stage integrator: coordinator
  - id: PRE-R8-02
  - target hotspot file: `src/renderer/ui/ScenePanel.tsx`
  - exported symbol / callback: `planCourseTreeReorder` / grip `drag-handle`
  - required user-visible behavior: 课树同一父级 slide-scene 可拖排
  - focused test proving lane side: `output/r8-a-recheck/evidence.json` `optional[0]`（`moved=true`；`scene_e591ItS6…` 与 `scene-dAKZRoaBI3` 对调）
  - exact wiring requested: 可选窗口探测已能动。未改 ScenePanel。不挡 PRE-R8-01。是否标 verified 由协调者决定。
  - risk if omitted: 仅缺账本窗口勾
  - status: implemented
  ```
- DECISION_REQUESTS: 无。不要由本任务开始 R8-E/F。
- remaining risks / untested full checks:
  - 未跑 `npm run typecheck` / `npm test` / `npm run build` / `npm run build:desktop` / `npm run test:e2e` / 三视口 / 17 项体验 / `npm run verify`（R8-C/D/E/F/G/H；禁止本 lane 跑）
  - 通过跑：`editorStoreQuietMsBeforeLaunch≈207s`；`hmr.editorStoreHmr=false`；`pageReloads=[]`。`vite.log` 在 Electron 关掉后（22:54:10，`completedAt` 22:54:07 之后）仍出现一行 `page reload src/renderer/store/editorStore.ts`（R8-FIX-STORE）；未因此改 src
  - 中间失败归档：`evidence-run1.json` 步骤 03 点逻辑坐标 (96,80) 误插入标题（随后 overlay/blob 变化是增节点合法重建）；`evidence-run2-hmr.json` 被 5 次 `editorStore.ts` page reload 打断步骤 04–05。通过跑把空白点击改为 `canvas-stage` 内部 (320,200) 且 `elementFromPoint` 确认为画布
  - 未证明顶层 page 拖排；可选 06 只拖了同一 Slide 页下两个 scene
- rollback point: 删除 `output/r8-a-recheck/` 与本 HANDOFF。产品 `src/` 无本任务 diff。基线仍为 `f272756`。未覆盖 `output/r8-a-smoke/`。
- execution state: lane_candidate
- integration state: pending（窗口证据已绿；`PRE-R8-01` verified 由协调者改账本）
- quality state: unverified

禁止用语核对：未写 `art candidate` / `accepted`；未把本任务标成项目级 `engineering candidate`；未自行把 `PRE-R8-01` 标 verified。
