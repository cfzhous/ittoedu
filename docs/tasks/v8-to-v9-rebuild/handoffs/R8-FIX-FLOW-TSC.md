HANDOFF
- task: R8-FIX-FLOW-TSC
- planning pack path: `C:\Users\74755\Documents\HTML课件编辑器\docs\tasks\v8-to-v9-rebuild`
- product worktree / branch / baseline SHA: `C:\Users\74755\Documents\HTML课件编辑器-v8-to-v9-rebuild` / `codex/v8-to-v9-rebuild` / `f27275658c6dfaa12f2ce35cd9368dcdebe99451`
- outcome: 关闭 Flow 簇 typecheck。R8-C 记录的该簇 23 条 `error TS`（含首错 `flowRuntimeToc.ts` `blockId`）在授权路径上现为 **0**。根因是 `Array.filter(kind === 'flow-block')` 不能把 `CourseLocation` 收窄到带 `blockId` 的成员；已改为 `if (location.kind === 'flow-block')` 循环或 `isFlowCourseBlockLocation` type guard，无 `as any`。未改运行时稿纸/命令语义。未碰 `ScenePanel.tsx` / `editorStore.ts` / `Workspace.tsx` / `App.tsx`，未改 `add-flow-page` testid。未 commit。未领取 R8-E。未宣称全仓库 typecheck 已绿，未宣称 art/accepted。
- owned files changed:
  - 产品 worktree：
    - `src/player/surfaces/flow/flowRuntimeToc.ts`
    - `src/renderer/course/flowDocumentModel.ts`（新增 `isFlowCourseBlockLocation`）
    - `src/renderer/course/flowEditorCommands.ts`
    - `src/renderer/course/flowEditorView.ts`
    - `src/renderer/course/flowSharedAuthoringAdapters.ts`
    - `src/renderer/ui/FlowWorkspace.tsx`
    - `src/renderer/export/course/flowPrintPlan.ts`
    - `tests/unit/flowEditorCommands.test.ts`
    - `tests/unit/flowEditorView.test.ts`
    - `tests/unit/flowProductIntegration.test.tsx`
    - `tests/unit/flowSharedAuthoringAdapters.test.tsx`
    - `tests/unit/flowSurfaceHost.test.ts`
  - 计划侧：本 HANDOFF
- donor files/functions consulted:
  - `handoffs/R8-C.md`、`handoffs/R8-C-TRIAGE.md`（`R8-FIX-FLOW` 文件簇与首错）
  - `src/shared/courseProjectTypes.ts` `CourseLocation`
  - `src/player/surfaces/flow/flowModel.ts` `resolveFlowLocation`（`if (location?.kind === 'flow-block')` 收窄先例）
  - `src/renderer/authoring/flowTextEdit.ts` `flowFormulaBlockToAuthoringNode`（只读；DeepReadonly AST 不兼容）
- focused validation command:
  ```
  npx tsc --noEmit --pretty false
  npx vitest run tests/unit/flowRuntimeToc.test.ts tests/unit/flowEditorCommands.test.ts
  git add -N -- <owned files>
  git diff --check -- <owned files>
  git reset -- <owned files>
  ```
  工作目录：产品 worktree。Windows PowerShell。tsc 只用来 rg/过滤本簇路径，**不是**全仓库 typecheck 已绿。未跑 `npm run typecheck` / `npm test` / `build:desktop` / `verify`。
- validation result:

  ### 开始前环境（产品 worktree）

  | 项 | 值 |
  |---|---|
  | `git branch --show-current` | `codex/v8-to-v9-rebuild` |
  | `git rev-parse HEAD` | `f27275658c6dfaa12f2ce35cd9368dcdebe99451` |
  | `git status --short` | 脏树含其他 lane 未提交改动；本簇文件当时均为 `??` |

  ### 修复后

  | # | 命令 | exit | 结果 |
  |---|---|---|---|
  | 1 | `npx tsc --noEmit --pretty false` 再过滤本簇文件名 | tsc 本身仍因其他文件失败；过滤后本簇 **0** 条 | 仓库仍余 **57** 条 `error TS`（非本簇） |
  | 2 | `npx vitest run tests/unit/flowRuntimeToc.test.ts tests/unit/flowEditorCommands.test.ts` | **0** | 2 files / **13** tests passed；2.40s |
  | 3 | `git diff --check -- <owned files>`（先 `git add -N`，后 `git reset`） | **0** | 无 whitespace 输出；owned 文件回到 `??` |

- validation entry / fixture / backend:
  - entry: `buildFlowSurfaceToc` / `syncFlowCourseLocations` / `executeFlowEditorCommand` / `insertFlowSharedMedia`；单测入口 `tests/unit/flowRuntimeToc.test.ts`、`tests/unit/flowEditorCommands.test.ts`
  - fixture: 产品 worktree 当前脏树（HEAD `f272756` + 未提交 R6–R8）；Flow 单测自带空白页/讲义 fixture
  - backend: Course Project V9；Published locations 与 `CourseLocation` 同联合类型，filter 后仍需 narrowing
- validation proves / does not prove:
  - proves: 授权 Flow 源文件与对应 `tests/unit/flow*` 在当前 tsc 输出中不再出现；TOC 与 editor commands 定向单测 13 项绿；本任务 diff 无 whitespace 错误；无 `as any`
  - does_not_prove: 全仓库 `npm run typecheck`（仍有 57 条其他文件错误，electron/e2e tsconfig 未跑）、其余 Flow 单测运行时、全量 Vitest、`build`/`build:desktop`、E2E、视觉、体验、教师验收
- narrow UI smoke, if authorized: 未授权，未做。
- INTEGRATION_REQUESTS:
  ```
  INTEGRATION_REQUEST
  - requester task: R8-FIX-FLOW-TSC
  - target stage integrator: coordinator / R8-C-RECHECK
  - target hotspot file: n/a（本簇无壳层热点）
  - exported symbol / callback: `isFlowCourseBlockLocation`
  - required user-visible behavior: 无新教师可见行为。Flow 稿纸、insert/paste 无选区、音频不进浮层、印刷不含 runtime TOC 的运行时判断保持原语义。
  - focused test proving lane side: `npx vitest run tests/unit/flowRuntimeToc.test.ts tests/unit/flowEditorCommands.test.ts` 13 passed；tsc 过滤本簇路径 0 错
  - exact wiring requested: 将 R8-C 回派的 Flow 簇标 `implemented`。不要改 `ScenePanel`/`editorStore`/`Workspace`/`App` 来“帮”本项。簇交齐后再派一次 R8-C-RECHECK 全量 tsc。
  - risk if omitted: R8-C 仍把首错记在 `flowRuntimeToc.ts`，尽管该路径已收窄
  - status: implemented
  ```
- DECISION_REQUESTS: 无
- remaining risks / untested full checks:
  - 未跑 `npm run typecheck` 全链（renderer tsc 仍有 57 条非本簇错误；`tsconfig.electron.json` / `tsconfig.e2e.json` 未到达）
  - 未跑 `tests/unit/flowEditorView.test.ts` / `flowSharedAuthoringAdapters.test.tsx` / `flowProductIntegration.test.tsx` / `flowSurfaceHost.test.ts`（只修了类型，预算内只跑了指定两个文件）
  - 未跑全量 `npm test`（R8-D）、`build:desktop`（R8-E，未领取）、`test:e2e`、三视口、17 项体验、`npm run verify`
  - 未启动 Electron
- rollback point: 还原上列 12 个产品文件。HEAD 仍为 `f27275658c6dfaa12f2ce35cd9368dcdebe99451`。未 commit。
- execution state: lane_candidate
- integration state: pending
- quality state: unverified

禁止用语核对：未写 `art candidate` / `accepted`；未把本任务标成项目级 `engineering candidate`；未领取 R8-E。
