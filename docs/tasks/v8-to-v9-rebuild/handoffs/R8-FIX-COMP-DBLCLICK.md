HANDOFF
- task: R8-FIX-COMP-DBLCLICK
- planning pack path: `C:\Users\74755\Documents\HTML课件编辑器\docs\tasks\v8-to-v9-rebuild`
- product worktree / branch / baseline SHA: `C:\Users\74755\Documents\HTML课件编辑器-v8-to-v9-rebuild` / `codex/v8-to-v9-rebuild` / `f27275658c6dfaa12f2ce35cd9368dcdebe99451`
- outcome: 只改产品 `src/renderer/ui/Workspace.tsx` 的 `onDoubleClickCapture` V9 分支。命中 text/formula 仍 `selectNode` + `beginTextEdit`（formula 仍开 dialog）后 return；命中其他图层（含 component）或未命中图层不再 `return`，落到已有 `canvasAuthoringHitAtClientPoint` → `beginComponentTextEdit` / `beginRuntimeTextEdit` / `replaceRuntimeAsset`。未把 component 从 `listSlideWorkspaceHitTargets` / `layerTargets` 拿掉。未改断言、未 skip、未改 `CanvasPlainTextEditor` / `componentTextEditSession` / persist / 默认 backend / `App.tsx` / preview `useEffect`。未藏教师控制器。未 commit。未领取 R8-G。定向命令仍红 → `blocked`。不是 art/accepted。不是项目级 engineering candidate。
- owned files changed (product worktree):
  - `src/renderer/ui/Workspace.tsx`（仅 `onDoubleClickCapture` 的 `v9-slide-candidate` 早退：text/formula 保持原路径；其余与未命中 fall through）
  计划侧：本 HANDOFF；`00_INDEX.md` 本行。
  **未改**：`tests/e2e/editor.spec.ts`、「流程 4」断言、`editorStore.ts` persist、默认 backend、`App.tsx`、`CanvasPlainTextEditor`、`componentTextEditSession`、preview key、blob iframe、教师控制器可见性。
- donor files/functions consulted:
  - [`handoffs/R8-F-RECHECK-4.md`](R8-F-RECHECK-4.md) 首错：`designPoint(470, 252)` `mouse.dblclick` 后 `canvas-plain-text-editor` 10s 不可见
  - `Workspace.tsx` 已有 `beginComponentTextEdit`、`canvasAuthoringHitAtClientPoint`、overlay 按钮 `onClick={() => beginComponentTextEdit(target)}`
  - 只读：`listSlideWorkspaceHitTargets` / `layerTargets`（含 component）；`writableNativeTransforms` / `nativeFrames`（本轮未改）
- donor 舍弃部分:
  - 改 spec 为点 overlay 按钮或 `press('Enter')` / skip
  - 从 `listSlideWorkspaceHitTargets` / `layerTargets` 拿掉 component
  - 改 `CanvasPlainTextEditor` / `componentTextEditSession` 合同绕过双击
  - 扩大刀到 `workspaceSlideAuthoring.ts` `nativeFrames` / `transformNativeLayers` 以修拖拽
  - 重开 FIX-E2E / SELECT-TAB / SCENE-LAYER / IMPORT / TEXT-TXN
  - 改 persist / LASTSCENE / Workspace preview / 默认 backend / `App.tsx`
- focused validation command:
  ```
  npm run build:renderer
  npx playwright test tests/e2e/editor.spec.ts -g "流程 4：组件导入"
  git diff --check -- src/renderer/ui/Workspace.tsx
  ```
  工作目录：产品 worktree。Windows PowerShell。A 前 `npm run build:renderer`（未跑 `build:desktop`）。`VITE_DEV_SERVER_URL` unset，未抢 `:5173`（仍为 PID 19296）。`--user-data-dir` 用 spec 已有 `e2eUserDataPath`。未另开手工 App。未跑全量 `test:e2e` / `verify` / typecheck / `npm test`。
- validation result:

  | # | 命令 | exit | 结果 |
  |---|---|---:|---|
  | 1 | `npm run build:renderer` | 0 | vite 2.25s；写入 `dist-renderer/` |
  | 2 | `npx playwright test tests/e2e/editor.spec.ts -g "流程 4：组件导入"` | **1** | Playwright 1.61.1。**1 failed（22.0s）**。原 `canvas-plain-text-editor` 断言已越过；新首错见下 |
  | 3 | `git diff --check -- src/renderer/ui/Workspace.tsx` | 0 | 无输出 |

  Electron 槽已释放。`:5173` 仍为同一 PID。

  ### 新首错（本轮验证命令）

  `tests/e2e/editor.spec.ts:1598`「流程 4：组件导入、保存重开与预览交互」

  ```
  Error: expect(received).toBeGreaterThan(expected)

  Expected: > 400
  Received:   400

    1661 |       const movedX = Number(await commonNodeField(page, 'X').inputValue())
    1662 |       const movedY = Number(await commonNodeField(page, 'Y').inputValue())
  > 1663 |       expect(movedX).toBeGreaterThan(400)
  ```

  本轮已过（故原 R8-F-RECHECK-4 双击缺口已关闭）：导入 sample-counter、点组件卡、图层 1 行、属性栏填标题/数值、overlay 按钮出现、`designPoint(470, 252)` `mouse.dblclick` 后 `canvas-plain-text-editor` 可见、填「画布内积分器」、Enter、编辑器卸载、属性栏标题变为「画布内积分器」。失败在随后画布拖拽：X 仍为默认 400。

  只读定位（**未改**）：V9 `pointerDownCapture` 已把手势交给 `slideAuthoring.pointerDown`。`writableNativeTransforms` ← `nativeFrames()` 只收 `layer.source === 'scene' && layer.item.kind === 'native'`，component 进不了 move gesture，`transformNativeLayers` 也不会写组件 frame。overlay `.canvas-authoring-target` 是 `pointer-events: none`，不是挡拖拽的原因。本任务授权只改 `onDoubleClickCapture`，未扩大到 `workspaceSlideAuthoring.ts`。
- validation entry / fixture / backend:
  - entry: Electron 编辑器（spec `launchEditor`）；`Workspace` `onDoubleClickCapture` → `canvasAuthoringHitAtClientPoint` → `beginComponentTextEdit`
  - fixture: `examples/sample-counter.h5component`；空白 Course Project V9
  - backend: 默认 `v9-slide-candidate`；未切回 V8
- validation proves / does not prove:
  - proves: 画布坐标双击组件矩形会挂载 `CanvasPlainTextEditor` 并写回属性栏；V9 text/formula 双击路径未改写法（仍先命中图层再 `beginTextEdit`）
  - does not prove: 组件画布拖拽/缩放；全量 `npm run test:e2e`（留给下一轮 R8-F-RECHECK）；P0 原生文字双击本轮未重跑；typecheck；全量 Vitest；`build:desktop`
- narrow UI smoke, if authorized: 未授权手工窗口。本任务只跑上列定向 Playwright。
- INTEGRATION_REQUESTS:
  ```
  INTEGRATION_REQUEST
  - requester task: R8-FIX-COMP-DBLCLICK
  - target stage integrator: 协调者（账本 / 下一 FIX / 下一轮 R8-F-RECHECK）
  - id: R8F-COMP-DBLCLICK-01
  - target hotspot file: src/renderer/ui/Workspace.tsx onDoubleClickCapture
  - exported symbol / callback: V9 非 text/formula（及未命中图层）fall through → canvasAuthoringHitAtClientPoint
  - required user-visible behavior: 画布双击组件 overlay 目标打开 CanvasPlainTextEditor；无 overlay 目标不要 begin；text/formula 仍走 beginTextEdit
  - focused test proving lane side: 流程 4 已越过 canvas-plain-text-editor；整条仍红在拖拽 X
  - exact wiring requested: 原 RECHECK-4 双击缺口视为已落地。不要把本 diff 回滚。下一刀应另开任务修 V9 组件 frame 变换（nativeFrames / transformNativeLayers），不要改「流程 4」断言。不要领取 R8-G。全量 e2e 仍由下一轮 R8-F-RECHECK。
  - risk if omitted: 回滚本刀会让流程 4 再次卡在 canvas-plain-text-editor
  - status: implemented-but-blocked-by-later-assert
  ```
- DECISION_REQUESTS: 无。
- remaining risks / untested full checks:
  - 未跑：全量 `npm run test:e2e`、`typecheck`、`npm test`、`build:desktop`、三视口、17 项体验、`verify`
  - 流程 4 仍红：组件拖拽 X 不变（`nativeFrames` 排除 component）。本 lane 未修
  - 双击控制器与组件 overlay 重叠时，仍以 `canvasAuthoringHitAtClientPoint` 为准；无 overlay 目标不会 `beginComponentTextEdit`
  - `Workspace.tsx` 是重建脏树共享热点；回滚本 lane 只还原 `onDoubleClickCapture` V9 早退，不能整文件 checkout
  - 未领取 R8-G
- rollback point: 产品 HEAD 仍为 `f27275658c6dfaa12f2ce35cd9368dcdebe99451`。回退本 lane：把 `onDoubleClickCapture` 的 V9 分支恢复为「任意图层命中（或 `if (!hit) return`）后一律 return」。不要整文件还原 `Workspace.tsx`。
- execution state: `blocked`
- integration state: `pending`（双击文字已落地；整条「流程 4」仍红；全量 e2e 待下一轮 R8-F-RECHECK）
- quality state: `unverified`

禁止用语核对：未写 `art candidate` / `accepted`；未把本任务标成项目级 `engineering candidate`；未领取 R8-G。
