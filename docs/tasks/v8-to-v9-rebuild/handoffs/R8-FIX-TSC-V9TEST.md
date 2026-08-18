HANDOFF
- task: R8-FIX-TSC-V9TEST
- planning pack path: `C:\Users\74755\Documents\HTML课件编辑器\docs\tasks\v8-to-v9-rebuild`
- product worktree / branch / baseline SHA: `C:\Users\74755\Documents\HTML课件编辑器-v8-to-v9-rebuild` / `codex/v8-to-v9-rebuild` / `f27275658c6dfaa12f2ce35cd9368dcdebe99451`
- outcome: 清掉 R8-FIX-TSC-TABS 交卷后仍挂在授权 V9 测试上的 **21** 条 `tsc --noEmit` 错误（`v9SlideTextTransaction.test.ts` 13、`v9SlideProductIntegration.test.tsx` 4、`v9MediaAudioCommands.test.ts` 3、`v9GlobalLayerUiAdapter.test.tsx` 1）。全部用合法 narrowing / type predicate，未用 `as any`，未删断言，未把默认 backend 改回 V8。`v9MediaTabAdapter.test.tsx` / `v9SlideBackendSelection.test.ts` / `v9SlideViewportAdapter.test.ts` 本轮 tsc 未列出，未改。未改任何 `src/**`。未领取 R8-E。未 commit。
- owned files changed:
  - 产品 worktree：
    - `tests/unit/v9SlideTextTransaction.test.ts`（`isNativeTextLayerItem` / `isNativeFormulaLayerItem` 收窄 `content.data`）
    - `tests/unit/v9SlideProductIntegration.test.tsx`（`kind === 'v9-slide-candidate'` 后再读 `command` / `targets`）
    - `tests/unit/v9MediaAudioCommands.test.ts`（`requireNativeLayer` 后再读 `content`）
    - `tests/unit/v9GlobalLayerUiAdapter.test.tsx`（`nativeType === 'teacher-controller'` 后再交给 layout preview）
  - 计划侧：本 HANDOFF；`00_INDEX.md` 本行状态改为 `lane_candidate`
  - **未改**：`src/**`（含 `editorStore.ts`、`Workspace.tsx`、`PropertiesTab.tsx`、`NodesTab.tsx`、`ScenePanel.tsx`、`App.tsx`）；`assetTransactions` / `mediaTab` / `globalEditorStore` / `globalLayerUi` / `presenterSettingsUi` / component* / formula*；`v9MediaTabAdapter.test.tsx`、`v9SlideBackendSelection.test.ts`、`v9SlideViewportAdapter.test.ts`
- donor files/functions consulted:
  - `isCourseTeacherControllerLayerItem`（`teacherControllerConsistency.ts`；只读模式）
  - `NativeLayerItem` / `NativeElementContent` / `LayerItem`（`courseProjectTypes.ts`）
  - `SlideWorkspaceAuthoringResult`（`workspaceSlideAuthoring.ts`）
  - `teacherControllerPropertiesPreview` / `TeacherControllerLayoutSource`
  - [`R8-FIX-CUT-TESTS.md`](R8-FIX-CUT-TESTS.md)、[`R8-FIX-TSC-TABS.md`](R8-FIX-TSC-TABS.md)、[`R8-C-TRIAGE.md`](R8-C-TRIAGE.md)
- focused validation command:
  ```
  npx tsc --noEmit --pretty false
  npx vitest run tests/unit/v9SlideTextTransaction.test.ts tests/unit/v9SlideProductIntegration.test.tsx tests/unit/v9MediaAudioCommands.test.ts tests/unit/v9GlobalLayerUiAdapter.test.tsx
  git add -N -- tests/unit/v9SlideTextTransaction.test.ts tests/unit/v9SlideProductIntegration.test.tsx tests/unit/v9MediaAudioCommands.test.ts tests/unit/v9GlobalLayerUiAdapter.test.tsx
  git diff --check -- tests/unit/v9SlideTextTransaction.test.ts tests/unit/v9SlideProductIntegration.test.tsx tests/unit/v9MediaAudioCommands.test.ts tests/unit/v9GlobalLayerUiAdapter.test.tsx
  git reset -- tests/unit/v9SlideTextTransaction.test.ts tests/unit/v9SlideProductIntegration.test.tsx tests/unit/v9MediaAudioCommands.test.ts tests/unit/v9GlobalLayerUiAdapter.test.tsx
  ```
  工作目录：产品 worktree。Windows PowerShell。`tsc` 只用来确认本任务文件不再出现，**不是**全仓库 Gate。本簇是类型余量，Vitest 列出全部改过的 4 个文件。
- validation result:

  ### 开始前环境（产品 worktree）

  | 项 | 值 |
  |---|---|
  | `git branch --show-current` | `codex/v8-to-v9-rebuild` |
  | `git rev-parse HEAD` | `f27275658c6dfaa12f2ce35cd9368dcdebe99451` |
  | `node --version` | `v24.14.0` |
  | `npm --version` | `11.9.0` |
  | `git status --short`（本任务文件） | 四文件均为 `??`（R2/R3 产物 + CUT 断言跟切；本任务只加类型收窄） |

  修复前同一次 `tsc --noEmit --pretty false` 过滤本任务授权路径：**21** 条。全仓当时约 **49** 条。

  ### 逐文件

  | 文件 | 修复前 TS | 修复后 TS | Vitest |
  |---|---:|---:|---|
  | `tests/unit/v9SlideTextTransaction.test.ts` | **13**（`content.data.text/runs/ast/style` 未从 `NativeElementContent` 收窄） | **0** | **7** passed |
  | `tests/unit/v9SlideProductIntegration.test.tsx` | **4**（`command` / `targets` 在 `kind: 'v8'` 分支上不存在） | **0** | **5** passed |
  | `tests/unit/v9MediaAudioCommands.test.ts` | **3**（`LayerItem.content` 在 `ComponentLayerItem` 上不存在） | **0** | **4** passed |
  | `tests/unit/v9GlobalLayerUiAdapter.test.tsx` | **1**（`content.data` 未收窄到 teacher-controller） | **0** | **5** passed |
  | `tests/unit/v9MediaTabAdapter.test.tsx` | tsc 未列出 | 未改 | 未跑 |
  | `tests/unit/v9SlideBackendSelection.test.ts` | tsc 未列出 | 未改 | 未跑 |
  | `tests/unit/v9SlideViewportAdapter.test.ts` | tsc 未列出 | 未改 | 未跑 |

  ### 修复后

  | # | 命令 | exit | 结果 |
  |---|---|---:|---|
  | 1 | `npx tsc --noEmit --pretty false` 过滤上表授权/候选测试路径 | 过滤器无匹配 | 改过的 4 个测试文件 **0** 条 `error TS`。同一次 tsc 仍有 **28** 条：`editorStore.ts` 20、`Workspace.tsx` 7、`slidePreviewRebuildKey.test.ts` 1。**未宣称全仓库已绿**。 |
  | 2 | `npx vitest run` 仅上列 4 个改过的文件 | **0** | 4 files / **21** tests passed，5.53s |
  | 3 | `git diff --check` 仅上列 4 文件 | **0** | 无输出。先 `git add -N`，随后 `git reset --` 这四文件，它们仍为 untracked。 |

  结束后 HEAD 未变，未 commit。

- validation entry / fixture / backend:
  - entry: `beginV9SlideContentEdit` / `commitV9SlideContentEdit`；`createSlideWorkspaceAuthoringController`；`addCourseLibraryMediaToCanvas` / `replaceCourseLayerMedia` / `updateCourseMediaFitCrop`；`teacherControllerPropertiesPreview`
  - fixture: 各文件既有内存 Course Project V9 Slide fixture；CUT 后 `createNewProject` 默认 candidate
  - backend: 未注入时默认 `v9-slide-candidate`；V8 路径只在显式 `clearV9SlideCandidateBackend()` 时证明
- validation proves / does not prove:
  - proves: 上列 4 个测试文件的 typecheck 错误已用合法 narrowing 消失；21 项运行时断言仍过，且默认仍是 V9 candidate
  - does_not_prove: 全仓库 `tsc` / `npm run typecheck`（electron/e2e 项目未作为本任务 Gate）；`editorStore.ts` / `Workspace.tsx` / `slidePreviewRebuildKey.test.ts`；真实 Workspace/MediaTab/Player/Electron
- narrow UI smoke, if authorized: 未授权，未开 App / Electron。
- INTEGRATION_REQUESTS: 无。本任务只修授权测试类型，不接线。
- DECISION_REQUESTS: 无。
- remaining risks / untested full checks:
  - 全仓库 `tsc --noEmit` 仍有 **28** 条：`editorStore.ts` 20（R8-FIX-STORE / 之后 SHELL）、`Workspace.tsx` 7（R8-FIX-PREVIEW / SHELL）、`slidePreviewRebuildKey.test.ts` 1（未授权，未改）。复跑全量 typecheck 归 R8-C-RECHECK。
  - 未跑 `npm run typecheck` 链式 electron/e2e tsconfig、`npm test` 全量、`build:desktop`、E2E、视觉。未领取 R8-E。
- rollback point: 产品 worktree HEAD 仍为 `f272756`。回滚本任务 = 还原上述 4 个测试文件里的 narrowing helper / `kind` 守卫（不要整文件删除，它们含 CUT 默认 V9 断言）。
- execution state: `lane_candidate`
- integration state: `n/a`
- quality state: `unverified`

禁止用语核对：未写 `art candidate` / `accepted`；未把本任务标成项目级 `engineering candidate`。
