HANDOFF
- task: R8-FIX-GLOBAL-TEXT
- planning pack path: `C:\Users\74755\Documents\HTML课件编辑器\docs\tasks\v8-to-v9-rebuild`
- product worktree / branch / baseline SHA: `C:\Users\74755\Documents\HTML课件编辑器-v8-to-v9-rebuild` / `codex/v8-to-v9-rebuild` / `f27275658c6dfaa12f2ce35cd9368dcdebe99451`
- outcome: 已放开 V9 全局 native text/formula 的 `locateEditableNative`，`writeNativeContent` 写入 `globalLayerItems`（surface 同步写 `surfaceLayerItems`，无 named-state）。`beginTextEdit` 在 V9 backend 下全局 text 失败不再静默回退 V8 `textEditSession`。定向 e2e 已越过原首错 `:1739`（属性栏「文字内容」收到「全课程统一标题」，overlay 关闭）。整条仍红：新首错 `:1743` `getByLabel('图层位置')` 30s 超时。未 skip、未改断言、未改 `editor.spec.ts`、未静默打开 V8。未 commit。未领取 R8-G。未宣称 art/accepted。不是项目级 engineering candidate。定向未整条绿 → `blocked`。
- owned files changed (product worktree):
  - `src/renderer/authoring/v9SlideContentEdit.ts`（`locateEditableNative`：`session.scope === layer.source` 即允许 scene/global/surface 的 native text/formula；仍拒 locked / 非 text·formula / teacher-controller。`writeNativeContent`：global → `globalLayerItems[].item`；surface → `surfaceLayerItems[].item`；scene 含 named-state override 保持原路径）
  - `src/renderer/store/editorStore.ts`（仅 `beginTextEdit`：V9 backend 且 `editingScope === 'global'` 时 begin 失败报 reason，不建 V8 `textEditSession`。换 source/node 仍先 `commitTextEdit()`）
  - `tests/unit/v9SlideTextTransaction.test.ts`（新增 `global-banner` begin/update/commit 写入 `globalLayerItems`；scene 上 begin 再 `setSlideEditingScope(..., 'global')` 再 commit 的 stale generation **未改**）
  计划侧：本 HANDOFF；`00_INDEX.md` 本行与状态条。
  **未改**：`tests/e2e/editor.spec.ts`、`Workspace.tsx` 双击刀、「流程 4」、`nativeFrames`、默认 backend、`App.tsx`、persist、LASTSCENE、教师控制器全局路径、`PropertiesTab.tsx`、`requireSceneScope`。
- donor files/functions consulted:
  - [`handoffs/R8-F-RECHECK-5.md`](R8-F-RECHECK-5.md) 原首错：`:1739` overlay 已聚焦；`Control+A` + `insertText('全课程统一标题')` 后属性栏 10s 仍「双击编辑文字」
  - `locateEditableNative` / `writeNativeContent` / `resolveWritableScene`（同文件）
  - `editorStore.beginTextEdit` V9 失败回退 V8 `textEditSession`（约 `:4700-4736`）
  - `withV9ContentDraft` / `projectV9EditingNodes`（只读；scene P0 同套 overlay）
  - `CandidateGlobalLayerSettings`（只读；新首错归因）
- donor 舍弃部分:
  - 改 e2e 断言 / skip / 只填属性栏 / 静默打开 V8
  - 全局放开 `requireSceneScope`
  - 把 stale generation 改绿成「可跨 scope 提交 scene 草稿」
  - 改 `Workspace.tsx` 双击刀、`nativeFrames`、教师控制器进文字事务
  - 在 `PropertiesTab` 预修「图层位置」/ underlay·overlay（热点，且 V9 `globalLayerItems` 无该字段；投影写死 `layer: 'overlay'`）
  - 预修 Component API 4 全局组件或导出条
  - 重开 COMP-DBLCLICK / COMP-XFORM / TEXT-TXN / IMPORT / SCENE-LAYER / SELECT-TAB / FIX-E2E
- focused validation command:
  ```
  npx vitest run tests/unit/v9SlideTextTransaction.test.ts
  npm run build:renderer
  npx playwright test tests/e2e/editor.spec.ts -g "V8 全局层"
  git diff --check -- src/renderer/authoring/v9SlideContentEdit.ts src/renderer/store/editorStore.ts tests/unit/v9SlideTextTransaction.test.ts
  ```
  工作目录：产品 worktree。Windows PowerShell。A 前 `npm run build:renderer`（未跑 `build:desktop`）。`VITE_DEV_SERVER_URL` unset，未抢 `:5173`（仍为 PID 19296）。`--user-data-dir` 用 spec 已有 `electron-profile-${pid}`。未另开手工 App。未跑全量 `test:e2e` / `verify` / typecheck / `npm test`。
- validation result:

  | # | 命令 | exit | 结果 |
  |---|---|---:|---|
  | 1 | `npx vitest run tests/unit/v9SlideTextTransaction.test.ts` | 0 | **1 file / 8 tests passed**；2.36s；Start at 04:19:13 |
  | 2 | `npm run build:renderer` | 0 | vite 2.57s；写入 `dist-renderer/` |
  | 3 | `npx playwright test tests/e2e/editor.spec.ts -g "V8 全局层"` | 1 | Playwright。**1 failed（48.1s）**。原 `:1739` 已过；新首错 `:1743` |
  | 4 | `git diff --check --` 上列 3 个 owned 路径 | 0 | 无输出 |

  Electron 槽已释放。`:5173` 仍为同一 PID。

  ### 新首错（禁止改断言；本刀未修）

  `tests/e2e/editor.spec.ts:1710`「V8 全局层：原生元素、双击文字、保存重开与跨场景可见性」
  现首错 `:1743`：`locator.selectOption: Timeout 30000ms exceeded` waiting for `getByLabel('图层位置')`。
  其前已过：`text-edit-overlay` 聚焦 → `Control+A` + `insertText('全课程统一标题')` → 属性栏「文字内容」为「全课程统一标题」→ 点属性栏后 overlay `toHaveCount(0)`。
  归因（只读）：V9 backend 时 `PropertiesTab` 走 `CandidateGlobalLayerSettings`，控件是「当前页显示」「页面可见范围」，没有 V8「图层位置」（underlay/overlay）与「场景可见范围」。V9 `globalLayerItems` 无 underlay/overlay 字段；V8 投影写死 `layer: 'overlay'`。这超出本任务授权刀口（`PropertiesTab` 中央热点；不得改 spec）。
- validation entry / fixture / backend:
  - entry: `beginV9SlideContentEdit` / `commitV9SlideContentEdit` / `useEditorStore.beginTextEdit`；Electron 编辑器（spec `launchEditor`）
  - fixture: 空白 Course Project V9；e2e 走 `global-layer-entry` + `add-text`；单测 `global-banner`
  - backend: 默认 `v9-slide-candidate`；未切回 V8
- validation proves / does not prove:
  - proves: 全局 native text 草稿进入 `v9ContentEdit` 并投影到属性栏；commit 写 `globalLayerItems` 不进 scene；scene→global 换 scope 再 commit 仍 `STALE_GENERATION`；V9 backend 下全局 text 不静默 V8 session
  - does not prove: 整条「V8 全局层」e2e（停在图层位置）；保存重开与跨场景可见性；全量 `npm run test:e2e`；typecheck；全量 Vitest；`build:desktop`
- narrow UI smoke, if authorized: 未授权手工窗口。本任务只跑上列定向 Vitest + Playwright。
- INTEGRATION_REQUESTS:
  ```
  INTEGRATION_REQUEST
  - requester task: R8-FIX-GLOBAL-TEXT
  - target stage integrator: 协调者（账本 / 下一轮 FIX 或 R8-F-RECHECK）
  - id: R8F-GLOBAL-TEXT-01
  - target hotspot file: artifacts/FINAL_GATE_REPORT.md 行 R8F-GLOBAL-TEXT-01
  - exported symbol / callback: locateEditableNative + writeNativeContent(globalLayerItems) + beginTextEdit 全局不回退 V8
  - required user-visible behavior: 全局层双击文字后属性栏「文字内容」跟 overlay 草稿；提交写入 globalLayerItems
  - focused test proving lane side: v9SlideTextTransaction 8 passed（含 global-banner）；e2e 已过 :1739 投影，整条仍红
  - exact wiring requested: 文字事务刀口可标 implemented。整条「V8 全局层」仍 blocked，见 R8F-GLOBAL-LAYER-POS-01。不要领取 R8-G。
  - risk if omitted: 协调者仍按 :1739「双击编辑文字」分类该条
  - status: implemented
  ```
  ```
  INTEGRATION_REQUEST
  - requester task: R8-FIX-GLOBAL-TEXT
  - target stage integrator: 协调者（回派下一 FIX；非本刀）
  - id: R8F-GLOBAL-LAYER-POS-01
  - target hotspot file: src/renderer/ui/PropertiesTab.tsx CandidateGlobalLayerSettings
  - exported symbol / callback: 无本 lane 导出。V8 GlobalLayerSettings 有「图层位置」「场景可见范围」；V9 candidate 没有
  - required user-visible behavior: 全局原生元素属性栏可设 underlay/overlay 与「仅所选场景」并勾选「场景 1」，使 editor.spec「V8 全局层」:1743 起继续
  - focused test proving lane side: 本轮定向 e2e 首错 :1743 getByLabel('图层位置') 30s 超时
  - exact wiring requested: 新 FIX 对齐 V8 标签/语义，或确认 V9 无 underlay 后由协调者决定是否改 spec（本任务禁止改断言）。不要领取 R8-G。
  - risk if omitted: 文字事务已绿的前半会被「图层位置」挡住，全量 e2e 仍停在第 14 条
  - status: open
  ```
- DECISION_REQUESTS: 无。
- remaining risks / untested full checks:
  - 未跑：全量 `npm run test:e2e`、`typecheck`、`npm test`、`build:desktop`、三视口、17 项体验、`verify`
  - 整条「V8 全局层」在「图层位置」处红；其后保存重开、跨场景可见性、加图/形状未跑到
  - surface 写入路径已实现但无 e2e
  - `editorStore.ts` / `v9SlideContentEdit.ts` 是重建脏树共享文件；回滚本 lane 只还原上列函数，不能整文件 checkout
  - 未领取 R8-G
- rollback point: 产品 HEAD 仍为 `f27275658c6dfaa12f2ce35cd9368dcdebe99451`。回退本 lane：还原 `locateEditableNative` / `writeNativeContent` / `resolveWritableScene` 返回值；还原 `beginTextEdit` 的 `editingScope !== 'global'` 守卫；还原 `v9SlideTextTransaction.test.ts` 新增用例与 `SLIDE_REJECT_WRONG_OWNER` import。
- execution state: `blocked`
- integration state: `pending`（文字事务刀口已落地；整条定向 e2e 仍红）
- quality state: `unverified`

禁止用语核对：未写 `art candidate` / `accepted`；未把本任务标成项目级 `engineering candidate`；未领取 R8-G。
