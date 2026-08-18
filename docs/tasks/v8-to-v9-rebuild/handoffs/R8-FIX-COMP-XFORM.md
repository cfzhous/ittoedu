HANDOFF
- task: R8-FIX-COMP-XFORM
- planning pack path: `C:\Users\74755\Documents\HTML课件编辑器\docs\tasks\v8-to-v9-rebuild`
- product worktree / branch / baseline SHA: `C:\Users\74755\Documents\HTML课件编辑器-v8-to-v9-rebuild` / `codex/v8-to-v9-rebuild` / `f27275658c6dfaa12f2ce35cd9368dcdebe99451`
- outcome: V9 画布 `nativeFrames` 现收录 `source === 'scene'` 且 `kind === native | component | runtime` 的 frame；`transformSelectedSlideNativeLayers` 对这三类写 `frame`/`rotation`（含 named-state override）。教师控制器仍走 global，不进这条 scene 变换。未改命令名、未新框架、未回滚 `Workspace.tsx` 双击刀、未改 e2e 断言。未 commit。未领取 R8-G。定向整条「流程 4」绿 → `lane_candidate`。不是 art/accepted。不是项目级 engineering candidate。
- owned files changed (product worktree):
  - `src/renderer/ui/workspaceSlideAuthoring.ts`（仅 `nativeFrames`：scene 上 native/component/runtime 进 writable 变换）
  - `src/renderer/course/slideEditorCommands.ts`（`transformSelectedSlideNativeLayers` 允许上述三类写 frame/rotation；仍拒绝非 scene、不可见、锁定、选择外 id）
  - `tests/unit/v9SlideDomain.test.ts`（新增「选中 scene component 后 transformSlideNativeLayers 改 frame」；未改共享 fixture 的既有图层）
  计划侧：本 HANDOFF；`00_INDEX.md` 本行与状态条。
  **未改**：`tests/e2e/editor.spec.ts`、「流程 4」断言、`Workspace.tsx` 双击路径、preview `useEffect` / React key / blob 试运行、`App.tsx`、persist、LASTSCENE、默认 backend、教师控制器全局路径。
- donor files/functions consulted:
  - [`handoffs/R8-FIX-COMP-DBLCLICK.md`](R8-FIX-COMP-DBLCLICK.md) 首错：拖拽后 X 仍 400；双击写「画布内积分器」已过
  - `LayerItemBase.frame` / `rotation`（native、component、runtime 共用）
  - `adaptV9SlideLayerItemHit`：component/runtime 已 `writable`
  - `v9TeacherControllerAuthoring`：只读，未并进 scene 变换
- donor 舍弃部分:
  - 改 spec / skip / 把双击改成点 overlay
  - 回滚 `Workspace.tsx` 双击刀
  - 新变换框架或改命令名 `transformNativeLayers`
  - 把教师控制器并进 scene `nativeFrames`
  - 重开 FIX-E2E / SELECT-TAB / SCENE-LAYER / IMPORT / TEXT-TXN
  - 改 persist / LASTSCENE / Workspace preview / 默认 backend / `App.tsx`
- focused validation command:
  ```
  npx vitest run tests/unit/v9SlideDomain.test.ts
  npm run build:renderer
  npx playwright test tests/e2e/editor.spec.ts -g "流程 4：组件导入"
  git diff --check -- src/renderer/ui/workspaceSlideAuthoring.ts src/renderer/course/slideEditorCommands.ts tests/unit/v9SlideDomain.test.ts
  ```
  工作目录：产品 worktree。Windows PowerShell。A 前 `npm run build:renderer`（未跑 `build:desktop`）。`VITE_DEV_SERVER_URL` unset，未抢 `:5173`（仍为 PID 19296）。`--user-data-dir` 用 spec 已有 `electron-profile-${pid}`。未另开手工 App。未跑全量 `test:e2e` / `verify` / typecheck / `npm test`。
- validation result:

  | # | 命令 | exit | 结果 |
  |---|---|---:|---|
  | 1 | `npx vitest run tests/unit/v9SlideDomain.test.ts` | 0 | **1 file / 7 tests passed**；1.73s；Start at 03:51:29 |
  | 2 | `npm run build:renderer` | 0 | vite 2.92s；写入 `dist-renderer/` |
  | 3 | `npx playwright test tests/e2e/editor.spec.ts -g "流程 4：组件导入"` | 0 | Playwright。**1 passed（42.1s / 报告 43.0s）** |
  | 4 | `git diff --check --` 上列 3 个 owned 路径 | 0 | 无输出 |

  Electron 槽已释放。`:5173` 仍为同一 PID。
- validation entry / fixture / backend:
  - entry: V9 `pointerDown` → `writableNativeTransforms` / `transformSelectedSlideNativeLayers`；Electron 编辑器（spec `launchEditor`）
  - fixture: `examples/sample-counter.h5component`；空白 Course Project V9；unit 用独立 scene component 文档
  - backend: 默认 `v9-slide-candidate`；未切回 V8
- validation proves / does not prove:
  - proves: 画布拖拽后 X>400；缩放宽/高变大；保存重开几何仍在；预览交互后半也过；选中 scene component 后 `transformSlideNativeLayers` 写 frame/rotation
  - does not prove: 全量 `npm run test:e2e`（留给下一轮 R8-F-RECHECK）；真实窗口 runtime 缩放；typecheck；全量 Vitest；`build:desktop`
- narrow UI smoke, if authorized: 未授权手工窗口。本任务只跑上列定向 Vitest + Playwright。
- INTEGRATION_REQUESTS:
  ```
  INTEGRATION_REQUEST
  - requester task: R8-FIX-COMP-XFORM
  - target stage integrator: 协调者（账本 / 下一轮 R8-F-RECHECK）
  - id: R8F-COMP-XFORM-01
  - target hotspot file: src/renderer/ui/workspaceSlideAuthoring.ts nativeFrames；src/renderer/course/slideEditorCommands.ts transformSelectedSlideNativeLayers
  - exported symbol / callback: transformNativeLayers 命令名未改；scene native/component/runtime 写 frame
  - required user-visible behavior: 场景外部组件可在画布移动、缩放；保存重开几何仍在
  - focused test proving lane side: editor.spec「流程 4：组件导入」1 绿；v9SlideDomain.test.ts 7 passed
  - exact wiring requested: 将 R8F-COMP-XFORM-01 标为 implemented。不要回滚 R8-FIX-COMP-DBLCLICK 的 Workspace 双击刀。不要领取 R8-G。全量 e2e 由下一轮 R8-F-RECHECK 关闭为 verified。
  - risk if omitted: 协调者仍按拖拽 X=400 分类该条
  - status: implemented
  ```
- DECISION_REQUESTS: 无。
- remaining risks / untested full checks:
  - 未跑：全量 `npm run test:e2e`、`typecheck`、`npm test`、`build:desktop`、三视口、17 项体验、`verify`
  - runtime 已进入同一变换允许列表，但本轮没有独立 runtime 画布 e2e
  - 教师控制器仍必须走 `v9TeacherControllerAuthoring`；误把 global native 标成 scene 才会进这条路径
  - 未领取 R8-G
- rollback point: 产品 HEAD 仍为 `f27275658c6dfaa12f2ce35cd9368dcdebe99451`。回退本 lane：把 `nativeFrames` 恢复为只收 `kind === 'native'`；把 `transformSelectedSlideNativeLayers` 两处 kind 检查恢复为只允许 native；还原 `v9SlideDomain.test.ts` 新增用例与 helper。不要整文件还原 `Workspace.tsx`。
- execution state: `lane_candidate`
- integration state: `pending`（定向「流程 4」绿；全量 e2e 待下一轮 R8-F-RECHECK）
- quality state: `unverified`

禁止用语核对：未写 `art candidate` / `accepted`；未把本任务标成项目级 `engineering candidate`；未领取 R8-G。
