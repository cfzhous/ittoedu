HANDOFF
- task: R8-A
- planning pack path: `C:\Users\74755\Documents\HTML课件编辑器\docs\tasks\v8-to-v9-rebuild`
- product worktree / branch / baseline SHA: `C:\Users\74755\Documents\HTML课件编辑器-v8-to-v9-rebuild` / `codex/v8-to-v9-rebuild` / `f27275658c6dfaa12f2ce35cd9368dcdebe99451`
- outcome: 编辑态窗口证明 **未关闭** `PRE-R8-01`。协调者去掉 Workspace `locationId:generation` key 的部分已生效：`data-testid=canvas-stage` 在单击当前页、单击画布空白、插入文字、切到第二场景再点回第一场景后 **同一 DOM 节点**（`data-r8a-identity` 未丢）。但步骤 2–4 仍会整页闪「正在准备编辑画布 / 隔离页面已连接，正在启动 Player…」。失败 **不是** React remount Phaser 宿主，本任务按授权 **未改** `src/**`。未 commit。未领取 R8-B/C/D/E/F。Electron 与 Vite `:5176` 已关掉；未杀 `:5174`。
- owned files changed:
  产品 worktree（gitignore `output/`，不要提交二进制）：
  - `output/r8-a-smoke/run-smoke.cjs`
  - `output/r8-a-smoke/evidence.json`
  - `output/r8-a-smoke/01-initial-edit-canvas.png` … `05-add-scene-and-switch.png`、`99-final.png`
  计划侧：本 HANDOFF。未改账本（协调者改）。
- donor files/functions consulted:
  - `10_R8` §11.2、`artifacts/R6_R8_EXECUTION_PLAYBOOK.md`、`handoffs/R7-GATE.md`、`R7-Z.md`、`R5-Z.md`
  - 只读：`Workspace.tsx`（无 host `key`；`previewRebuildKey` + iframe bootstrap 盖层文案）、`activateCourseLocation` / `persistCandidateResult` / `activateSlideScene`、`courseAuthoringSession.ts`（同 location 不涨 generation）
  - 冒烟打法：`output/r7-z-smoke/run-smoke.cjs`
- focused validation command:
  ```
  npx vite --config vite.renderer.config.ts --host 127.0.0.1 --port 5176 --strictPort
  node output/r8-a-smoke/run-smoke.cjs
  git diff --check
  ```
  无 Vitest。无 `VITE_V9_CANDIDATE_SMOKE`。`--user-data-dir=output/r8-a-smoke/electron-profile`。
- validation result: `evidence.passed=false`。`git diff --check` 无输出（本任务未改 `src/`）。Vite `http://127.0.0.1:5176` + Playwright `_electron.launch`（`--remote-debugging-port=9349`）。
- validation entry / fixture / backend:
  - entry: 成熟 V8 `App` / `Workspace` Slide 编辑画布；课树 `scene-item-*`；`add-content-primary`；`canvas-stage`；`text-edit-overlay`
  - fixture: 默认空白 V9 Slide（fresh `--user-data-dir`）
  - backend: Course Project V9 + 隔离 iframe Player（authoring hostMode）
- validation proves / does not prove:
  - proves: 首次载入后盖层可消失且默认是「编辑状态」不是试运行；**Phaser 宿主 `canvas-stage` 不因单击/切场景被 React remount**；同 location 单击与画布单击仍会换隔离 Player 的 blob `src` 并闪启动盖层；双击路径被该闪盖层打断，未打开 `text-edit-overlay`（文字已插入并选中）
  - does not prove: 未跑 typecheck / 全量 test / build / E2E / 视觉回归；未证明 Flow/Spatial；未修 `persistCandidateResult` / preview `useEffect`
- narrow UI smoke, if authorized: **做成，Gate 失败。** 证据 `output/r8-a-smoke/`。检测方法：给 `canvas-stage` 与 iframe 打 `data-r8a-identity`；盖层用 `MutationObserver` 抓 `.runtime-preview-loading` 文案。

| 步 | 结果 | 证据 |
|---|---|---|
| 01 初始编辑画布 | 通过。编辑状态；截图前无盖层 | `01-initial-edit-canvas.png` |
| 02 单击课树当前页 | **失败。** 盖层闪「正在准备编辑画布」「隔离页面已连接，正在启动 Player…」；`canvas-stage` 与 iframe **节点**稳定，iframe **blob src 已换** | `02-click-current-page.png` |
| 03 单击画布空白 | **失败。** 同样闪盖层；宿主节点稳定，blob src 再换 | `03-click-canvas-blank.png` |
| 04 插入标题后双击 | **失败。** 插入后文字「双击编辑文字」已在画布且被选中；双击窗口内再次闪盖层，`text-edit-overlay` 未出现 | `04-double-click-text.png` |
| 05 主按钮新场景再点回 | 通过（切页允许短暂同步）。两场景仍在；点回场景 1 后 `canvas-stage` identity 仍是同一 token | `05-add-scene-and-switch.png` |

- INTEGRATION_REQUESTS:
  ```
  INTEGRATION_REQUEST
  - requester task: R8-A
  - target stage integrator: coordinator / 原 Workspace owner
  - id: PRE-R8-01
  - target hotspot file: `src/renderer/ui/Workspace.tsx`（preview `useEffect` / `previewRebuildKey`）；`src/renderer/store/editorStore.ts`（`activateCourseLocation` → `persistCandidateResult`）
  - exported symbol / callback: `activateCourseLocation`；`persistCandidateResult`；`activateSlideScene`
  - required user-visible behavior: 编辑态单击当前页、单击画布空白、双击文字不得整页盖上隔离 Player 启动层
  - focused test proving lane side: `output/r8-a-smoke/evidence.json`（`passed=false`；步骤 02–04 `overlayVisible=true`；`sameStageNode=true`）
  - exact wiring requested: 不要再加回 `locationId:generation` React key。同 location `activateSlideScene` 已是 no-op 时不要 `persistCandidateResult` 换新 `project`/`componentPackages` 身份；Workspace 隔离 Player 的重建不要绑在这些引用身份上。单击空白/选中文字同样不要换 blob URL。
  - risk if omitted: 教师仍看到编辑画布闪黑/启动层；双击进文字编辑不可靠
  - status: implemented
  ```
- DECISION_REQUESTS: 无。不要由本任务开始 R8-E/F。
- remaining risks / untested full checks:
  - 未跑 `npm run typecheck` / `npm test` / `npm run build` / E2E / 三视口（R8-C/D/E/F/G）
  - 只读根因（供协调者，本 lane 未改代码）：`activateCourseLocation` 对已激活 `slide-scene` 仍 `persistCandidateResult(live.activateScene(...))`；`persistCandidateResult` 每次 `set({ project: derivedV8ProjectFromBackend(...), componentPackages: Object.fromEntries(...) })`。`SlideLocationWorkspace` 的 preview `useEffect` 依赖 `componentPackages` 与 `previewRebuildKey`（后者 `useMemo` 依赖 `project`），于是 **同一宿主节点上换 iframe blob URL 并 `setPreviewFeedback(loading)`**。这不是 Workspace 三个宿主的 React `key` remount。
  - 冒烟结束 `app.close()` 曾挂起约 5 分钟，已杀掉本 lane Electron；脚本已加 8s close 超时。Vite `:5176` 已停。
  - 冒烟期间 Vite HMR 看到 `ScenePanel.tsx` / `editorStore.ts`（R8-B 并行）；本任务未写那些文件。
- rollback point: 删除 `output/r8-a-smoke/` 与本 HANDOFF。产品 `src/` 无本任务 diff。基线仍为 `f272756`。
- execution state: blocked
- integration state: pending（`PRE-R8-01` 保持 `implemented`，窗口未 verified）
- quality state: unverified
