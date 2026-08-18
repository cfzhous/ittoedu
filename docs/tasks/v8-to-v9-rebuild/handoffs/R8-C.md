HANDOFF
- task: R8-C
- planning pack path: `C:\Users\74755\Documents\HTML课件编辑器\docs\tasks\v8-to-v9-rebuild`
- product worktree / branch / baseline SHA: `C:\Users\74755\Documents\HTML课件编辑器-v8-to-v9-rebuild` / `codex/v8-to-v9-rebuild` / `f27275658c6dfaa12f2ce35cd9368dcdebe99451`
- outcome: Wave 8a 机器 Gate（capabilities + typecheck）**未绿**。未改任何产品源码、未 commit、未跑 `npm test` / `build` / `test:e2e` / `verify` / Electron。未领取 R8-D/E。未改 `FINAL_GATE_REPORT.md`。typecheck 90 条错误分布在 27 个文件，**不含** `ScenePanel.tsx`，因此未按 R8-B 半截语法等待 180 秒重跑。owner **不是** R8-B。
- owned files changed:
  - 产品 worktree：无
  - 计划侧：本 HANDOFF
- donor files/functions consulted:
  - `10_R8_FINAL_FULL_GATE.md` §11.4
  - `00_INDEX.md`、`01_SHARED_EXECUTION_CONTRACT.md`
  - `scripts/generate-ai-capabilities.ts` `checkAiCapabilityArtifacts`
  - `package.json` scripts：`check:ai-capabilities`、`typecheck`（`tsc --noEmit && tsc -p tsconfig.electron.json --noEmit && tsc -p tsconfig.e2e.json --noEmit`）
- focused validation command:
  ```
  npm run check:ai-capabilities
  npm run typecheck
  ```
  工作目录：产品 worktree。Windows PowerShell。两条命令按顺序单独运行，未合并成 `npm run verify`。
- validation result:

  ### 开始前环境（产品 worktree，跑命令前）

  | 项 | 值 |
  |---|---|
  | `git branch --show-current` | `codex/v8-to-v9-rebuild` |
  | `git rev-parse HEAD` | `f27275658c6dfaa12f2ce35cd9368dcdebe99451` |
  | `node --version` | `v24.14.0` |
  | `npm --version` | `11.9.0` |
  | `git status --short` | 见文末「开始前 git status」；工作树含未提交 R6–R8 改动。`ScenePanel.tsx` 当时已是 `M`（R8-B 并行中）。 |

  ### 命令结果

  | # | 命令 | exit code | 耗时 | stdout/stderr 第一条错误 |
  |---|---|---|---|---|
  | 1 | `npm run check:ai-capabilities` | **1** | **3838 ms** | `来源溯源证据过期 generation-evidence.json` |
  | 2 | `npm run typecheck` | **1** | **2240 ms** | `src/player/surfaces/flow/flowRuntimeToc.ts(71,36): error TS2339: Property 'blockId' does not exist on type 'CourseLocation'.` |

  `check:ai-capabilities` 完整失败块：

  ```
  AI 能力清单生成检查失败：
  - 来源溯源证据过期 generation-evidence.json
  请运行 npm run generate:ai-capabilities 后重试。
  ```

  检查逻辑：内存中重新生成后，除 `generation-evidence.json` 外其余能力 JSON 字节与磁盘一致；只有溯源证据文件本身过期。R8-C **未**运行 `npm run generate:ai-capabilities`（会写产品 worktree `artifacts/ai-capabilities/`，超出本任务只写 HANDOFF 的授权）。

  `typecheck` 在链式第一个 `tsc --noEmit` 处失败，因此 **`tsconfig.electron.json` 与 `tsconfig.e2e.json` 未执行**。

  typecheck 计数（同命令再跑一次仅用于归类，仍 exit 1；`ScenePanel` 匹配 0 行）：**90** 条 `error TS`，**27** 个文件。按文件：

  | 条数 | 文件 |
  |---:|---|
  | 20 | `src/renderer/store/editorStore.ts` |
  | 13 | `tests/unit/v9SlideTextTransaction.test.ts` |
  | 7 | `src/renderer/ui/Workspace.tsx` |
  | 6 | `tests/unit/flowSharedAuthoringAdapters.test.tsx` |
  | 6 | `tests/unit/courseTreeView.test.ts` |
  | 4 | `tests/unit/v9SlideProductIntegration.test.tsx` |
  | 3 | `tests/unit/v9MediaAudioCommands.test.ts` |
  | 2 | `src/renderer/ui/PropertiesTab.tsx` |
  | 2 | `tests/unit/flowProductIntegration.test.tsx` |
  | 2 | `tests/unit/spatialEditorCommands.test.ts` |
  | 2 | `tests/unit/flowEditorCommands.test.ts` |
  | 2 | `src/player/surfaces/spatial/spatialRuntimeSession.ts` |
  | 2 | `src/renderer/course/flowSharedAuthoringAdapters.ts` |
  | 2 | `src/renderer/course/flowDocumentModel.ts` |
  | 2 | `src/renderer/course/flowEditorCommands.ts` |
  | 2 | `src/renderer/export/course/buildCoursePptx.ts` |
  | 2 | `src/renderer/course/flowEditorView.ts` |
  | 2 | `src/renderer/export/course/buildCoursePrintArtifacts.ts` |
  | 1 | `tests/unit/spatialWorkspaceAuthoring.test.ts` |
  | 1 | `tests/unit/v9GlobalLayerUiAdapter.test.tsx` |
  | 1 | `src/player/surfaces/publishedDynamicHosts.ts` |
  | 1 | `src/player/surfaces/flow/flowRuntimeToc.ts` |
  | 1 | `src/renderer/export/course/flowPrintPlan.ts` |
  | 1 | `src/renderer/ui/NodesTab.tsx` |
  | 1 | `tests/unit/flowEditorView.test.ts` |
  | 1 | `tests/unit/flowSurfaceHost.test.ts` |
  | 1 | `src/renderer/ui/FlowWorkspace.tsx` |

  R8-B 竞态：错误**不只**在 `ScenePanel.tsx`，也不是半截语法。`ScenePanel.tsx` **0** 条。未等待 180 秒，未把 owner 记为 R8-B。

- validation entry / fixture / backend:
  - entry: `scripts/generate-ai-capabilities.ts --check`；`tsc --noEmit`（electron/e2e 项目未到达）
  - fixture: 产品 worktree 当前脏树（HEAD `f272756` + 未提交 R6–R8）
  - backend: Course Project V9 默认工程真相；本任务只读、不接线
- validation proves / does not prove:
  - proves: **当前工作树 capabilities 清单与 TypeScript 均未绿**（capabilities：仅 `generation-evidence.json` 过期；typecheck：renderer/player/tests 90 错，electron/e2e tsc 未跑）
  - does_not_prove: Vitest、`build`/`build:desktop`、E2E、视觉、体验、教师验收、electron/e2e TypeScript、刷新后的能力清单是否会绿
- narrow UI smoke, if authorized: 未授权，未做。
- INTEGRATION_REQUESTS: 无。R8-C 不写源码、不接线。失败回派见 remaining risks（不是热点接线单）。
- DECISION_REQUESTS: 无。
- remaining risks / untested full checks:

  ### 失败记录（供 R8 §8 回派）

  1. **命令** `npm run check:ai-capabilities`
     - 首个错误：`来源溯源证据过期 generation-evidence.json`
     - 复现：产品 worktree 根目录跑该命令
     - owner：**不是 R8-B**。建议协调者另派窄任务只跑 `npm run generate:ai-capabilities`（写 `artifacts/ai-capabilities/`），然后由 R8 复跑本 Gate。R8-C 不得代跑。
     - 影响：方式 A 聚合 `verify` 的第一环；Agent Kit 清单门禁
     - 跨 lane：否（生成物维护）

  2. **命令** `npm run typecheck`
     - 首个错误：`src/player/surfaces/flow/flowRuntimeToc.ts(71,36): error TS2339: Property 'blockId' does not exist on type 'CourseLocation'.`
     - 复现：产品 worktree 根目录跑该命令；filter 后仍访问 `location.blockId`，联合类型未收窄
     - owner：**不是 R8-B**。R0–R7 政策禁止全量 typecheck，错误是跨 lane 累积。热点集中：`editorStore.ts`（20，中央热点）、`Workspace.tsx`（7）、Flow/Spatial/export/player 与对应单测。回派后 owner 只跑窄测试，不要借失败跑 `verify`。
     - 影响：工程 candidate 机器 Gate；`tsc --noEmit` 不过则 electron/e2e typecheck 未知
     - 跨 lane：是

  ### 本任务未跑（留给其他 R8 子任务）

  - R8-D：`npm test`（Vitest）
  - R8-E：`npm run build:desktop`
  - R8-F：`npm run test:e2e`
  - R8-G：三视口视觉
  - R8-H：17 项真实体验
  - `tsconfig.electron.json` / `tsconfig.e2e.json` typecheck（本命令因第一段 tsc 失败未到达）
  - 完整 `npm run verify`

- rollback point: 产品 worktree HEAD 仍为 `f27275658c6dfaa12f2ce35cd9368dcdebe99451`。R8-C 未改产品文件；无需回滚。
- execution state: `blocked`
- integration state: `n/a`
- quality state: `unverified`

禁止用语核对：未写 `art candidate` / `accepted`；未把本任务标成项目级 `engineering candidate`。

---

## 开始前 git status --short

产品 worktree `C:\Users\74755\Documents\HTML课件编辑器-v8-to-v9-rebuild`，跑 Gate 命令之前：

```
 M src/main/applicationIdentity.ts
 M src/main/fileDialogs.ts
 M src/main/ipc.ts
 M src/main/projectPersistence.ts
 M src/player/AudioManager.ts
 M src/player/renderTeacherController.ts
 M src/player/teacherControllerRuntimeSession.ts
 M src/preload/index.ts
 M src/renderer/App.tsx
 M src/renderer/authoring/stageViewportTransform.ts
 M src/renderer/phaser/EditorPhaserBridge.ts
 M src/renderer/phaser/EditorScene.ts
 M src/renderer/project/assetManager.ts
 M src/renderer/project/mediaBatch.ts
 M src/renderer/project/openProject.ts
 M src/renderer/project/projectArchive.ts
 M src/renderer/store/editorStore.ts
 M src/renderer/styles/globals.css
 M src/renderer/ui/MediaTab.tsx
 M src/renderer/ui/NodesTab.tsx
 M src/renderer/ui/PropertiesTab.tsx
 M src/renderer/ui/ScenePanel.tsx
 M src/renderer/ui/TopToolbar.tsx
 M src/renderer/ui/Workspace.tsx
 M src/renderer/vite-env.d.ts
 M src/shared/ipcTypes.ts
 M src/shared/teacherControllerConsistency.ts
 M src/shared/teacherControllerLayout.ts
 M src/shared/textRuns.ts
 M tests/unit/applicationIdentity.test.ts
 M tests/unit/componentProtocolV4.test.ts
 M tests/unit/editorStore.test.ts
 M tests/unit/exportMenuUi.test.tsx
 M tests/unit/playerHostActions.test.ts
 M tests/unit/projectArchive.test.ts
 M tests/unit/projectPersistence.test.ts
 M tests/unit/recoveryWriteCoordinator.test.ts
 M tests/unit/runtimeHostV2.test.ts
 M tests/unit/stageViewportTransform.test.ts
 M tests/unit/teacherControllerLayout.test.ts
 M tests/unit/teacherControllerRuntimeSession.test.ts
 M tests/unit/textRuns.test.ts
?? src/player/SurfaceRuntimeAuthoring.ts
?? src/player/surfaces/
?? src/player/teacherControllerDom.ts
?? src/renderer/authoring/courseAuthoringScope.ts
?? src/renderer/authoring/courseAuthoringSession.ts
?? src/renderer/authoring/flowOverlayAuthoring.ts
?? src/renderer/authoring/flowTextEdit.ts
?? src/renderer/authoring/spatialWorldAuthoring.ts
?? src/renderer/authoring/v9SlideContentEdit.ts
?? src/renderer/authoring/v9TeacherControllerAuthoring.ts
?? src/renderer/course/
?? src/renderer/dev/
?? src/renderer/export/course/
?? src/renderer/phaser/v9SlideHitAdapter.ts
?? src/renderer/phaser/v9SpatialHitAdapter.ts
?? src/renderer/project/courseProjectArchive.ts
?? src/renderer/project/courseProjectIo.ts
?? src/renderer/project/courseProjectLifecycle.ts
?? src/renderer/project/courseProjectMigration.ts
?? src/renderer/project/createCourseProject.ts
?? src/renderer/project/createFlowCourseProject.ts
?? src/renderer/project/createSpatialCourseProject.ts
?? src/renderer/project/v9AssetAdapter.ts
?? src/renderer/store/slideBackendPort.ts
?? src/renderer/store/v9SlideUiProjection.ts
?? src/renderer/ui/AddCourseContentMenu.tsx
?? src/renderer/ui/FlowBlockContextToolbar.tsx
?? src/renderer/ui/FlowWorkspace.tsx
?? src/renderer/ui/SpatialCameraPanel.tsx
?? src/renderer/ui/SpatialPathEditor.tsx
?? src/renderer/ui/coursePlayerTryRun.ts
?? src/renderer/ui/flowLocationTryRun.ts
?? src/renderer/ui/spatialLocationTryRun.ts
?? src/renderer/ui/workspaceSlideAuthoring.ts
?? src/shared/authoringAddress.ts
?? src/shared/courseProjectModel.ts
?? src/shared/courseProjectSchema.ts
?? src/shared/courseProjectTypes.ts
?? src/shared/publishedCourseSchema.ts
?? src/shared/publishedCourseTypes.ts
?? src/shared/surfaceRuntimeTypes.ts
?? tests/unit/authoringAddress.test.ts
?? tests/unit/buildPublishedCourseV2.test.ts
?? tests/unit/courseAuthoringSession.test.ts
?? tests/unit/courseEditorLayout.test.ts
?? tests/unit/courseLocationCommands.test.ts
?? tests/unit/coursePackageExport.test.ts
?? tests/unit/coursePptxExport.test.ts
?? tests/unit/coursePrintArtifacts.test.ts
?? tests/unit/courseProjectArchive.test.ts
?? tests/unit/courseProjectCoreContract.test.ts
?? tests/unit/courseProjectMigration.test.ts
?? tests/unit/courseProjectRoundTrip.test.ts
?? tests/unit/courseTreeView.test.ts
?? tests/unit/editorActionRouting.test.ts
?? tests/unit/effectiveLayerCommands.test.ts
?? tests/unit/effectiveLayerProjection.test.ts
?? tests/unit/flowEditorCommands.test.ts
?? tests/unit/flowEditorView.test.ts
?? tests/unit/flowInlineTextEditor.test.tsx
?? tests/unit/flowProductIntegration.test.tsx
?? tests/unit/flowRuntimeToc.test.ts
?? tests/unit/flowSharedAuthoringAdapters.test.tsx
?? tests/unit/flowSurfaceHost.test.ts
?? tests/unit/flowUnifiedLayerEntry.test.tsx
?? tests/unit/flowUnifiedLayers.test.tsx
?? tests/unit/flowWorkspace.test.tsx
?? tests/unit/projectFormatIsolation.test.ts
?? tests/unit/publishedCourseNavigation.test.ts
?? tests/unit/publishedCourseProtocol.test.ts
?? tests/unit/spatialCameraCommands.test.ts
?? tests/unit/spatialCameraSession.test.tsx
?? tests/unit/spatialEditorCommands.test.ts
?? tests/unit/spatialPathCommands.test.ts
?? tests/unit/spatialPathPipeline.test.ts
?? tests/unit/spatialProductIntegration.test.tsx
?? tests/unit/spatialSurfaceHost.test.ts
?? tests/unit/spatialSurfaceHostCtrl.test.ts
?? tests/unit/spatialWorkspaceAuthoring.test.ts
?? tests/unit/spatialWorldViewTransform.test.ts
?? tests/unit/surfaceRuntimeAuthoring.test.ts
?? tests/unit/v8ToV9Migration.test.ts
?? tests/unit/v9GlobalLayerUiAdapter.test.tsx
?? tests/unit/v9MediaAudioCommands.test.ts
?? tests/unit/v9MediaTabAdapter.test.tsx
?? tests/unit/v9SlideActionCommands.test.ts
?? tests/unit/v9SlideBackendSelection.test.ts
?? tests/unit/v9SlideContentCommands.test.ts
?? tests/unit/v9SlideDomain.test.ts
?? tests/unit/v9SlideProductIntegration.test.tsx
?? tests/unit/v9SlideTextTransaction.test.ts
?? tests/unit/v9SlideViewportAdapter.test.ts
```
