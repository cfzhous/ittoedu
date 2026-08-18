HANDOFF
- task: R8-FIX-R6-TESTID
- planning pack path: `C:\Users\74755\Documents\HTML课件编辑器\docs\tasks\v8-to-v9-rebuild`
- product worktree / branch / baseline SHA: `C:\Users\74755\Documents\HTML课件编辑器-v8-to-v9-rebuild` / `codex/v8-to-v9-rebuild` / `f27275658c6dfaa12f2ce35cd9368dcdebe99451`
- outcome: 关闭 `R8D-R6-01`。先复现 `tests/unit/flowProductIntegration.test.tsx` 因 `getByTestId('add-flow-page')` 失败：Flow 课树主按钮冻结为 `data-testid="add-content-primary"`，`add-flow-page` 只在 `data-alias-testid`。Testing Library 只认 `data-testid`。按授权选最小改动：只改该测试去查冻结主按钮 + alias，未改 `AddCourseContentMenu.tsx`，未破坏 `add-content-primary`。未改 `editorStore.ts` / `Workspace.tsx` / `ScenePanel.tsx` / `App`。未 commit。未跑全量 `npm test` / `verify` / Electron。未宣称 art/accepted 或项目级 engineering candidate。
- owned files changed:
  - 产品 worktree：`tests/unit/flowProductIntegration.test.tsx`（该文件本就是 R4/R6 产物、工作树 `??`；本任务只改「课程结构」用例的新增按钮查询）
  - 未改：`src/renderer/ui/AddCourseContentMenu.tsx`（仍 `data-testid="add-content-primary"` + 条件 `data-alias-testid`）
  - 计划侧：本 HANDOFF
- donor files/functions consulted:
  - `src/renderer/ui/AddCourseContentMenu.tsx`：`primaryAlias`（`flow-page` → `add-flow-page`；`scene` → `add-scene`）
  - `artifacts/R6_R8_EXECUTION_PLAYBOOK.md` §2.1（flow 主按钮 `add-content-primary`，可保留 `add-flow-page`）
  - `handoffs/R8-D.md`、`handoffs/R8-D-TRIAGE.md`、`artifacts/FINAL_GATE_REPORT.md`（`R8D-R6-01`）
  - `tests/unit/scenePanelReorder.test.tsx`（已按冻结 `add-content-primary` 查询）
- focused validation command:
  ```
  npx vitest run tests/unit/flowProductIntegration.test.tsx
  git add -N -- tests/unit/flowProductIntegration.test.tsx
  git diff --check -- tests/unit/flowProductIntegration.test.tsx
  git reset -- tests/unit/flowProductIntegration.test.tsx
  ```
  工作目录：产品 worktree。Windows PowerShell。未合并成 `npm test` / `npm run verify`。`git reset` 只撤掉该文件的 intent-to-add，使其回到 `??`；`git diff --cached` 仍为空。
- validation result:

  ### 开始前环境（产品 worktree）

  | 项 | 值 |
  |---|---|
  | `git branch --show-current` | `codex/v8-to-v9-rebuild` |
  | `git rev-parse HEAD` | `f27275658c6dfaa12f2ce35cd9368dcdebe99451` |
  | `git status --short`（owned） | `?? tests/unit/flowProductIntegration.test.tsx`；`?? src/renderer/ui/AddCourseContentMenu.tsx`（本任务未改后者） |

  ### 复现（改前）

  | # | 命令 | exit | 结果 |
  |---|---|---:|---|
  | 0 | `npx vitest run tests/unit/flowProductIntegration.test.tsx` | 1 | 1 file / 5 tests：4 passed，**1 failed**。`shows course tree pages and headings, hides paragraphs, cameras, and slide add-scene` → `Unable to find an element by: [data-testid="add-flow-page"]`。失败 DOM 已有 `data-testid="add-content-primary"` 且 `data-alias-testid="add-flow-page"`。 |

  ### 改后

  | # | 命令 | exit | 结果 |
  |---|---|---:|---|
  | 1 | `npx vitest run tests/unit/flowProductIntegration.test.tsx` | 0 | 1 file / **5 passed**；3.14s |
  | 2 | `git diff --check -- tests/unit/flowProductIntegration.test.tsx`（先 `git add -N`） | 0 | 无输出 |

  测试断言现为：`getByTestId('add-content-primary')` 且 `data-alias-testid === 'add-flow-page'`；`queryByTestId('add-scene')` 仍为 `null`（Flow 主按钮不是 Slide `add-scene`）。

- validation entry / fixture / backend:
  - entry: `ScenePanel` → `AddCourseContentMenu`；`createNewFlowProject()` 后的课树
  - fixture: 内存 Flow 工程（heading + 一段不应上树的 paragraph）；jsdom Vitest
  - backend: 成熟 V8 `ScenePanel` + Course Project V9 Flow session（CUT 后默认 V9）
- validation proves / does not prove:
  - proves: 该文件 5 项定向单测绿；Flow 课树仍能发现工程内主按钮，且 alias 标明本态是加 Flow 页；Slide `add-scene` 不以 `data-testid` 出现；本任务 diff 无 whitespace 错误
  - does_not_prove: 未点主按钮真正 `addCourseFlowPage`；未测 Slide/Spatial/Mixed 的 alias；未跑 typecheck、全量 Vitest、build、E2E、三视口、17 项体验、教师验收
- narrow UI smoke, if authorized: 未授权，未做。未开 Electron。
- INTEGRATION_REQUESTS:
  ```
  INTEGRATION_REQUEST
  - requester task: R8-FIX-R6-TESTID
  - target stage integrator: coordinator / R8-D-RECHECK
  - target hotspot file: n/a（只改测试；未改 AddCourseContentMenu / ScenePanel）
  - exported symbol / callback: n/a
  - required user-visible behavior: 无教师可见行为变化。R6 冻结 `data-testid="add-content-primary"` 必须继续在主按钮上；Flow 时 `data-alias-testid="add-flow-page"` 保留。
  - focused test proving lane side: `npx vitest run tests/unit/flowProductIntegration.test.tsx` 5 passed
  - exact wiring requested: 将 `R8D-R6-01` 标 `implemented`。本文件定向 Vitest 已绿，coordinator 可标 `verified`。不要为绿测试改回主按钮 `data-testid="add-flow-page"`。
  - risk if omitted: 全量 Vitest 仍把本文件记为 R6 testid 失败，尽管查询已对齐冻结合同
  - status: implemented
  ```
- DECISION_REQUESTS: 无
- remaining risks / untested full checks:
  - 未跑 `npm run typecheck`、`npm test`、`npm run build` / `build:desktop`、`npm run test:e2e`、三视口视觉、17 项体验、`npm run verify`
  - 未启动 Electron
  - `AddCourseContentMenu.tsx` 未改；若后续 lane 去掉 `data-alias-testid` 或改掉 `add-content-primary`，本断言会再红
  - `R8-FIX-FLOW-TSC` 也曾把本测试文件列入 owned；本任务只改 testid 查询，未回滚其类型相关改动（若有）
  - 全量 Vitest 其余 28 个失败文件不在本任务范围
- rollback point: 还原产品 worktree `tests/unit/flowProductIntegration.test.tsx` 中 `add-content-primary` / `data-alias-testid` 三行断言为原来的 `getByTestId('add-flow-page')`。HEAD 仍为 `f27275658c6dfaa12f2ce35cd9368dcdebe99451`。未 commit。文件仍为 `??`。
- execution state: lane_candidate
- integration state: pending
- quality state: unverified

禁止用语核对：未写 `art candidate` / `accepted`；未把本任务标成项目级 `engineering candidate`；未领取 R8-E。
