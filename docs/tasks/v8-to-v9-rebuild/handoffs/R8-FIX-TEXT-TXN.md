HANDOFF
- task: R8-FIX-TEXT-TXN
- planning pack path: `C:\Users\74755\Documents\HTML课件编辑器\docs\tasks\v8-to-v9-rebuild`
- product worktree / branch / baseline SHA: `C:\Users\74755\Documents\HTML课件编辑器-v8-to-v9-rebuild` / `codex/v8-to-v9-rebuild` / `f27275658c6dfaa12f2ce35cd9368dcdebe99451`
- outcome: V9 `beginTextEdit` 已有 `v9ContentEdit` 且 source 或 nodeId 变化时，先 `commitTextEdit()`（内部 `commitV9SlideContentEdit` + `clearContentEdit`），再按新 source 开会话；同 node + 同 source no-op。Spatial 同入口同样先 commit。画布 overlay 草稿与属性栏 fill 成为两步 history，撤销回到画布草稿。未改 e2e 断言、未 skip、未改 `PropertiesTab` / `TextEditOverlay` / persist / LASTSCENE / Workspace preview / 默认 backend / `App.tsx`。未 commit。未领取 R8-G。定向绿 → `lane_candidate`。不是 art/accepted。不是项目级 engineering candidate。
- owned files changed (product worktree):
  - `src/renderer/store/editorStore.ts`（仅 `beginTextEdit`：V9/Spatial 换 source 先 commit；同 node+source 早退；commit 后用新 backend/session 开会话与投影）
  - `tests/unit/editorStore.test.ts`（新增「canvas draft → beginTextEdit properties → undo 回到草稿」；同 source no-op）
  计划侧：本 HANDOFF；`00_INDEX.md` 本行。
  **未改**：`tests/e2e/editor.spec.ts` 该条断言、`PropertiesTab.tsx`、`TextEditOverlay.tsx`、`App.tsx`、默认 backend。
- donor files/functions consulted:
  - [`handoffs/R8-F-RECHECK-3.md`](R8-F-RECHECK-3.md) 首错：撤销后 `textbox[name=文字内容]` 期望「画布编辑中的草稿」，收到「双击编辑文字」
  - V8 `beginTextEdit`（同函数后段）：同 node+source 返回原 state；否则 `commitTextEditSessionState` 再开会话
  - `commitTextEdit()` / `commitV9SlideContentEdit` / `commitSpatialWorldContentEdit`（已有，未新框架）
  - `PropertiesTab.tsx` `TextContentTextarea.onBegin` → `beginTextEdit(id, 'properties')`（只读；blur 仍走既有 `onCommit`）
- donor 舍弃部分:
  - 改 e2e 断言为「双击编辑文字」或 skip
  - 在 `PropertiesTab` 绕过 history / 手工 `commitV9SlideContentEdit`
  - 改 `TextEditOverlay` 交互
  - 新事务框架、改 persist / LASTSCENE / Workspace preview / 默认 backend / `App.tsx`
  - 重开 FIX-E2E / SELECT-TAB / SCENE-LAYER / IMPORT
- focused validation command:
  ```
  npx vitest run tests/unit/editorStore.test.ts
  npm run build:renderer
  npx playwright test tests/e2e/editor.spec.ts -g "文字编辑事务"
  git diff --check -- src/renderer/store/editorStore.ts tests/unit/editorStore.test.ts
  ```
  工作目录：产品 worktree。Windows PowerShell。A 前 `npm run build:renderer`（未跑 `build:desktop`）。`VITE_DEV_SERVER_URL` unset，未抢 `:5173`（仍为 PID 19296）。`--user-data-dir` 用 spec 已有 `electron-profile-${pid}`。未另开手工 App。未跑全量 `test:e2e` / `verify` / typecheck / `npm test`。
- validation result:

  | # | 命令 | exit | 结果 |
  |---|---|---:|---|
  | 1 | `npx vitest run tests/unit/editorStore.test.ts` | 0 | **1 file / 63 tests passed**；3.91s；Start at 03:19:17 |
  | 2 | `npm run build:renderer` | 0 | vite 2.28s；写入 `dist-renderer/` |
  | 3 | `npx playwright test tests/e2e/editor.spec.ts -g "文字编辑事务"` | 0 | Playwright 1.61.1。**1 passed（48.3s / 报告 49.1s）** |
  | 4 | `git diff --check --` 上列 2 个 owned 路径 | 0 | 无输出 |

  Electron 槽已释放。`:5173` 仍为同一 PID。
- validation entry / fixture / backend:
  - entry: `useEditorStore.beginTextEdit` / `commitTextEdit` / `undo`；Electron 编辑器（spec `launchEditor`）
  - fixture: 空白 Course Project V9；e2e 走 addText → 图层选中 → 编辑局部文字格式 → overlay fill → 属性栏 fill → 撤销
  - backend: 默认 `v9-slide-candidate`；未切回 V8
- validation proves / does not prove:
  - proves: 画布 overlay 草稿在切到属性栏时成为独立 history 步；属性栏 fill 后再撤销回到「画布编辑中的草稿」；同 node+同 source 不重复 commit；该 e2e 条后半（字体、切节点、IME）也过
  - does not prove: 全量 `npm run test:e2e`（留给下一轮 R8-F-RECHECK）；Spatial 真实窗口换 source；typecheck；全量 Vitest；`build:desktop`
- narrow UI smoke, if authorized: 未授权手工窗口。本任务只跑上列定向 Vitest + Playwright。
- INTEGRATION_REQUESTS:
  ```
  INTEGRATION_REQUEST
  - requester task: R8-FIX-TEXT-TXN
  - target stage integrator: 协调者（账本 / 下一轮 R8-F-RECHECK）
  - id: R8F-TEXT-TXN-01
  - target hotspot file: artifacts/FINAL_GATE_REPORT.md 行 R8F-TEXT-TXN-01
  - exported symbol / callback: editorStore beginTextEdit → 换 source/node 先 commitTextEdit
  - required user-visible behavior: 画布 overlay 草稿与属性栏 fill 是两步 history；撤销回到画布草稿
  - focused test proving lane side: editor.spec「文字编辑事务」1 绿；editorStore.test.ts 63 passed
  - exact wiring requested: 将 R8F-TEXT-TXN-01 标为 implemented；全量 e2e 由下一轮 R8-F-RECHECK 关闭为 verified。不要领取 R8-G。
  - risk if omitted: 协调者仍按 undo 落到「双击编辑文字」分类该条
  - status: implemented
  ```
- DECISION_REQUESTS: 无。
- remaining risks / untested full checks:
  - 未跑：全量 `npm run test:e2e`、`typecheck`、`npm test`、`build:desktop`、三视口、17 项体验、`verify`
  - Spatial 同入口已对称先 commit，但本轮没有 Spatial 窗口 e2e
  - `editorStore.ts` 是重建脏树共享热点；回滚本 lane 只还原 `beginTextEdit` 的 commit/no-op，不能整文件 checkout
  - 未领取 R8-G
- rollback point: 产品 HEAD 仍为 `f27275658c6dfaa12f2ce35cd9368dcdebe99451`。回退本 lane：还原 `beginTextEdit` 中 V9/Spatial 换 source 先 `commitTextEdit` 与同 node+source 早退；还原 `tests/unit/editorStore.test.ts` 新增用例。
- execution state: `lane_candidate`
- integration state: `pending`（定向 e2e 绿；全量 e2e 待下一轮 R8-F-RECHECK）
- quality state: `unverified`

禁止用语核对：未写 `art candidate` / `accepted`；未把本任务标成项目级 `engineering candidate`；未领取 R8-G。
