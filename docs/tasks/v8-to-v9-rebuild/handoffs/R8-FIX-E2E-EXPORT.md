HANDOFF
- task: R8-FIX-E2E-EXPORT
- planning pack path: `C:\Users\74755\Documents\HTML课件编辑器\docs\tasks\v8-to-v9-rebuild`
- product worktree / branch / baseline SHA: `C:\Users\74755\Documents\HTML课件编辑器-v8-to-v9-rebuild` / `codex/v8-to-v9-rebuild` / `f27275658c6dfaa12f2ce35cd9368dcdebe99451`
- outcome: 首派 [R8-FIX-E2E-EXPORT](ae05145d-d66f-4f58-a453-6cae3be6a388) `resource_exhausted`，产品文件未动。本刀在产品 worktree 完成：导出条夹具跟切 Course Project V9；纯 Slide PPTX 走已有 `projectCandidatePreviewDocument` → `buildPptx`（保留 DOM 运行时快照与全局 visibility）。定向「Component API 4 全局组件」+「Runtime API 2 / Component API 4 导出」**2 passed（2.0m；导出条 53.8s）**。未 skip、未改 PPTX 字符串断言、未静默打开 V8。未回滚 SLIDE-PREVIEW-COMP / SCENE-LABEL / GLOBAL-* / COMP-* / TEXT-TXN / IMPORT。未 commit。未领取 R8-G。定向整条绿 → `lane_candidate`。不是 art/accepted。不是项目级 engineering candidate。
- owned files changed (product worktree):
  - `tests/e2e/editor.spec.ts`（本条 parse/写入改 `courseProjectDocumentSchema`；全局/场景 `kind: 'runtime'` + 场景 native text；`globalObjectName` = `` `${label} · ${layerItemId}` ``）
  - `src/renderer/App.tsx`（`isSlideOnlyCourseProject`；`handleExportPptx`：纯 Slide 且有 V9 preview 时走 `buildPptx`，Mixed/Flow/Spatial 仍 `buildCoursePptx`）
  计划侧：本 HANDOFF；`00_INDEX.md` 本行。
  **未改**：`editor.spec.ts` 其余 serial 条、`componentCatalogMatrix.spec.ts`、Player compositor、`publishedDynamicHosts.ts`、schema。
- donor files/functions consulted:
  - [`handoffs/R8-F-RECHECK-7.md`](R8-F-RECHECK-7.md) `:1911` ZodError
  - [`handoffs/R8-FIX-E2E-IMPORT.md`](R8-FIX-E2E-IMPORT.md)
  - `editorStore.makeRuntimeLayerItem` / `runtimeDocumentToCourseRuntime` / `projectCandidatePreviewDocument` / `attachProjectedRuntimes`
  - `buildPptx` / `renderPptxRuntimeSnapshots`
- donor 舍弃部分:
  - skip / 放宽 PPTX 字符串 / 静默打开 V8
  - 抄 donor 899 行 compositor / `SurfaceRuntimeAuthoring`
  - 预修「整课预览：后台教师控制器…」
  - 把 Mixed PPTX 改成 V8 `buildPptx`（会丢掉 Flow/Spatial 页）
- focused validation command:
  ```
  npm run build:renderer
  npx playwright test tests/e2e/editor.spec.ts -g "Component API 4 全局组件|Runtime API 2 / Component API 4 导出"
  git diff --check -- tests/e2e/editor.spec.ts src/renderer/App.tsx
  ```
  工作目录：产品 worktree。Windows PowerShell。`VITE_DEV_SERVER_URL` unset。未跑 `build:desktop` / 全量 e2e / `verify` / typecheck / `npm test`。`--user-data-dir` 用 spec 已有 `electron-profile-${pid}`。未另开手工 App。单独 `-g` 导出条会因 `beforeAll` 清掉上一刀 zip（ENOENT）；必须与「Component API 4 全局组件」一起跑。
- validation result:

  | # | 命令 | exit | 结果 |
  |---|---|---:|---|
  | 1 | `npm run build:renderer` | 0 | vite 4.16s；写入 `dist-renderer/` |
  | 2 | 上列 Playwright `-g` 两条 | 0 | **2 passed（2.0m）**；全局组件 1.1m；导出条 **53.8s** |
  | 3 | `git diff --check --` 上列 2 路径 | 0 | 无输出 |

  Electron 槽已释放。
- validation entry / fixture / backend:
  - entry: Electron 编辑器（spec `launchEditor`）→ PDF/PPTX 预检 → `handleExportPdf` / `handleExportPptx`
  - fixture: 上一刀保存的 V9 `global-component-roundtrip.h5lesson`，本条注入全局/场景 DOM runtime 与 native text 后另存 `runtime-api2-export.h5lesson`
  - backend: 默认 Course Project V9；打开该 zip 无导入对话框
- validation proves / does not prove:
  - proves: V9 夹具可打开；PDF 生成；PPTX 含原生文字、全局/场景实际播放器快照 objectName、include 仅场景 2 的全局组件名
  - does not prove: 全量 `npm run test:e2e`（留给下一轮 R8-F-RECHECK）；Mixed PPTX；typecheck；全量 Vitest
- narrow UI smoke, if authorized: 未授权手工窗口。
- INTEGRATION_REQUESTS:
  ```
  INTEGRATION_REQUEST
  - requester task: R8-FIX-E2E-EXPORT
  - target stage integrator: 协调者（账本 / 下一轮 R8-F-RECHECK）
  - id: R8F-RUNTIME-EXPORT-01
  - target hotspot file: artifacts/FINAL_GATE_REPORT.md 行 R8F-RUNTIME-EXPORT-01
  - exported symbol / callback: App.handleExportPptx 纯 Slide → buildPptx
  - required user-visible behavior: 等待 DOM 运行时后 PDF；PPTX 保留动态层、全局 visibility、原生文字；打开 V8 仍须显式导入
  - focused test proving lane side: editor.spec「Runtime API 2 / Component API 4 导出」1 绿（本轮与全局组件条一起 2 passed）
  - exact wiring requested: 将 R8F-RUNTIME-EXPORT-01 标为 implemented；全量 e2e 由下一轮 R8-F-RECHECK 关闭为 verified。不要领取 R8-G。
  - risk if omitted: 协调者仍按 :1911 ZodError 分类这条
  - status: implemented
  ```
- DECISION_REQUESTS: 无。
- remaining risks / untested full checks:
  - 未跑：全量 `npm run test:e2e`、`typecheck`、`npm test`、`build:desktop`、三视口、17 项体验、`verify`
  - 下一条 serial「整课预览：后台教师控制器…」本轮未跑，不要预修
  - Mixed/Flow/Spatial 仍走无 capture 的 `buildCoursePptx`（R8-G/H 才覆盖）
  - 未领取 R8-G
- rollback point: 产品 HEAD 仍为 `f27275658c6dfaa12f2ce35cd9368dcdebe99451`。回退本 lane：还原 `tests/e2e/editor.spec.ts` 本条与 `src/renderer/App.tsx` `handleExportPptx`。不要回滚 SLIDE-PREVIEW-COMP 等前刀。
- execution state: `lane_candidate`
- integration state: `pending`（定向 e2e 绿；全量 e2e 待下一轮 R8-F-RECHECK）
- quality state: `unverified`

禁止用语核对：未写 `art candidate` / `accepted`；未把本任务标成项目级 `engineering candidate`；未领取 R8-G。
