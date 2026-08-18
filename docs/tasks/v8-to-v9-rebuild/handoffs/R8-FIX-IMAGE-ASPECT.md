HANDOFF
- task: R8-FIX-IMAGE-ASPECT
- planning pack path: `C:\Users\74755\Documents\HTML课件编辑器\docs\tasks\v8-to-v9-rebuild`
- product worktree / branch / baseline SHA: `C:\Users\74755\Documents\HTML课件编辑器-v8-to-v9-rebuild` / `codex/v8-to-v9-rebuild` / `f27275658c6dfaa12f2ce35cd9368dcdebe99451`
- outcome: V9 Slide overlay 单选拉伸在图片 `preserveAspectRatio`（及视频）时按 V8 EditorScene 规则均匀缩放，东向只改宽时回写高并纵向居中。未放宽 e2e `toBeCloseTo(..., 2)`。未 skip。未改 editor.spec。文字西/北拉伸仍不锁比。定向「图片导入」**1 passed（1.2m）**，含替换与保存重开后半段。未 commit。未领取 R8-G。定向绿 → `lane_candidate`。不是 art/accepted。不是项目级 engineering candidate。不要把 `R8F-IMAGE-ASPECT-01` 标 verified（等全量 RECHECK）。
- owned files changed (product worktree):
  - `src/renderer/authoring/stageViewportTransform.ts`（`resizeWorldFrameFromHandlePreservingAspect`）
  - `src/renderer/ui/workspaceSlideAuthoring.ts`（单选 `previewResize` 读 native image/video 锁比）
  - `tests/unit/stageViewportTransform.test.ts`（东向 1:1 锁比）
  - `tests/unit/v9SlideViewportAdapter.test.ts`（`preserveAspectRatio: true` 的 image 西向期望改为等比）
  计划侧：本 HANDOFF；`00_INDEX.md` 本行；账本 `R8F-IMAGE-ASPECT-01` → implemented。`R8F-PRESENTER-HTML-01` 已由协调者标 verified。
- donor files/functions consulted:
  - [`handoffs/R8-F-RECHECK-10.md`](R8-F-RECHECK-10.md) `:2467` 比值 1 → 1.22
  - `src/renderer/phaser/EditorScene.ts` `previewSingleResize` preserve 分支
  - V8 `editorStore.normalizeNodeGeometry`（属性栏只改宽时回写高；本刀是画布手柄路径）
- donor 舍弃部分:
  - skip / 放宽 `:2467`
  - 把默认 `preserveAspectRatio` 改成 false
  - 回滚 PRESENTER-HTML / CATALOG-PPTX / EXPORT
  - 预修流程 6–9
- focused validation command:
  ```
  npx vitest run tests/unit/stageViewportTransform.test.ts tests/unit/v9SlideViewportAdapter.test.ts
  npm run build:renderer
  npx playwright test tests/e2e/editor.spec.ts -g "图片导入"
  git diff --check -- src/renderer/authoring/stageViewportTransform.ts src/renderer/ui/workspaceSlideAuthoring.ts tests/unit/stageViewportTransform.test.ts tests/unit/v9SlideViewportAdapter.test.ts
  ```
  工作目录：产品 worktree。Windows PowerShell。`VITE_DEV_SERVER_URL` unset。未跑全量 e2e / `verify` / typecheck / `build:desktop`。未另开手工 App。
- validation result:

  | # | 命令 | exit | 结果 |
  |---|---|---:|---|
  | 1 | 上列 Vitest 两文件 | 0 | **2 files / 33 tests passed** |
  | 2 | `npm run build:renderer` | 0 | vite 2.90s |
  | 3 | Playwright `-g "图片导入"` | 0 | **1 passed（1.2m）**；原 `:2467` 已过，替换/往返也跑完 |
  | 4 | `git diff --check`（上列 4 路径） | 0 | 无输出 |

  Electron 槽已释放。
- validation entry / fixture / backend:
  - entry: Electron 添加图片 → 属性栏「保持宽高比」已勾选 → 画布东向手柄 +70px
  - fixture: e2e 现有第一张图 / 替换图
  - backend: 默认 Course Project V9；拉伸走 `createSlideWorkspaceAuthoringController` overlay，不走 V8 `updateNode`
- validation proves / does not prove:
  - proves: 勾选保持宽高比时东向拉伸锁比；替换/裁剪/羽化/翻转/保存重开在该定向条内已过
  - does not prove: 全量 `npm run test:e2e`；流程 6–9；Shift 临时锁比；组件 manifest 锁比
- narrow UI smoke, if authorized: 未授权手工窗口。
- INTEGRATION_REQUESTS:
  ```
  INTEGRATION_REQUEST
  - requester task: R8-FIX-IMAGE-ASPECT
  - target stage integrator: 协调者（账本 / 下一轮 R8-F-RECHECK）
  - id: R8F-IMAGE-ASPECT-01
  - target hotspot file: artifacts/FINAL_GATE_REPORT.md 行 R8F-IMAGE-ASPECT-01
  - exported symbol / callback: resizeWorldFrameFromHandlePreservingAspect；workspaceSlideAuthoring.previewResize
  - required user-visible behavior: 图片勾选「保持宽高比」时东向拉伸高度跟着变
  - focused test proving lane side: editor.spec「图片导入」1 绿（1.2m）；两文件 33 unit 绿
  - exact wiring requested: 将 R8F-IMAGE-ASPECT-01 标为 implemented；全量 e2e 由 R8-F-RECHECK-11 关闭。不要领取 R8-G。不要把本行标 verified。
  - risk if omitted: 协调者仍按 :2467 比值 1.22 分类这条
  - status: implemented
  ```
- DECISION_REQUESTS: 无。
- remaining risks / untested full checks:
  - 未跑全量 e2e。serial 其后：流程 6–9、课例验收
  - 多选拉伸仍不锁比（与 V8 组拉伸默认一致）
  - 未领取 R8-G
- rollback point: 产品 HEAD 仍为 `f27275658c6dfaa12f2ce35cd9368dcdebe99451`。回退本 lane：还原上列 4 个产品/测试文件。不要回滚 PRESENTER-HTML / EXPORT / CATALOG-PPTX。
- execution state: `lane_candidate`
- integration state: `pending`
- quality state: `unverified`

禁止用语核对：未写 `art candidate` / `accepted`；未把本任务标成项目级 `engineering candidate`；未领取 R8-G。
