# R0-C 源码路径、提交关系与 V9 供体矩阵

> owner：R0-C
> 日期：2026-08-17
> 产品 worktree（只读）：`C:\Users\74755\Documents\HTML课件编辑器-v8-to-v9-rebuild` / `codex/v8-to-v9-rebuild` @ `f27275658c6dfaa12f2ce35cd9368dcdebe99451`
> 计划/供体目录（只读源码）：`C:\Users\74755\Documents\HTML课件编辑器` / `codex/v9-editor-v8-base` @ `475503498323f50ddd3d8cc4a62ec2a8e67681e8`
> 方法：`git ls-tree` / `git show` / `git merge-base --is-ancestor` / `rg`；未跑 npm / test / typecheck / build / e2e；未改产品源码
> 质量用语：本文件是资格审计，不是 `engineering candidate` / `art candidate` / `accepted`

本矩阵给后续 lane 提供**当前真实路径**。不得把 `14890bb`、`3e41ec0`、`e2e34aa`、`bffbf95` 或当前 V9 HEAD 写成成熟 V8 基线。产品主干只登记 `f272756`。

## 0. 提交身份（完整 SHA）

| 角色 | 完整 SHA | 短 SHA | 事实 |
|---|---|---|---|
| **成熟 V8 候选产品基线** | `f27275658c6dfaa12f2ce35cd9368dcdebe99451` | `f272756` | `3e41ec0` 的直接父提交；`main.tsx` 直接渲染 `App`；无 `ProductApp` / `CourseStudio` / `courseProject*` |
| 二级 V8 对照 | `79c821f49b537c29330c58610b1a38e5ab44ee26` | `79c821f` | `f272756` 资格失败时才二分；不是默认主干 |
| V9 早期协议引入 | `3e41ec058627d38c4b9f5439b454cc72331e1485` | `3e41ec0` | parent = `f272756`；首次大规模 V9 重建；默认 `ProductApp` → Course Studio V9 |
| **行为地图（不是基线）** | `14890bb76d5743189114f0ff2d42c85a5aa8a4a2` | `14890bb` | `3e41ec0` 之后 7 个 first-parent 提交；默认 ProductApp 走 V9 |
| V9 Slide 手势/history 接线供体 | `636164114ea46a72671acf4851236ff9f0ce7bf8` | `6361641` | 改 `App.tsx` 热点；只摘测试与命令语义，不整文件覆盖 App |
| V9 集成树快照 | `e2e34aa29ddb72abb2c691e414a4d8f461f35b2c` | `e2e34aa` | **提交本身只改计划文档**；树内已有 Slide/Flow/Spatial/Player 集成文件，作只读快照 |
| 失败 checkpoint（反例） | `bffbf9514edcabff5b55588778ed06b4114c8691` | `bffbf95` | 引入 lifecycle / location / global-layer 等内核，同时带失败 UI 接线 |
| 当前失败 HEAD（反例） | `475503498323f50ddd3d8cc4a62ec2a8e67681e8` | `4755034` | `bffbf95` 之后合入根目录；只作逐文件供体与反例，不整串重放 |

祖先关系（已用 `git merge-base --is-ancestor` 验证，exit 0 = 是祖先）：

```text
79c821f → … → f272756 → 3e41ec0 → … → 14890bb
                              ↘ … → 62cd1a4 → … → 6361641 → … → e2e34aa → … → bffbf95 → 4755034
```

`f272756` 是 `3e41ec0` 的 parent（`git log -1 --format='%P' 3e41ec0`）。`14890bb` 在 `3e41ec0` **之后**，因此绝不能当 V8 产品主干。

---

## 1. `f272756` 真实当前路径

下列路径均用产品 worktree 文件存在性 + `git ls-tree -r --name-only f272756` 对过。`f272756` **没有** `ProductApp.tsx`、`CourseStudioApp.tsx`、`courseProject*`、`publishedCourse*`、`v9Slide*`、`FlowWorkspace`、`SpatialWorkspace`、`src/player/surfaces/`。

### 1.1 入口与壳

| 职责 | 真实路径 | 当前事实 |
|---|---|---|
| Renderer 入口 | `src/renderer/main.tsx` | `createRoot` 直接渲染 `<App />`，无路由 |
| 产品 App | `src/renderer/App.tsx` | 成熟 V8 壳；导入 `Workspace` / `RightSidebar` |
| 全局样式 | `src/renderer/styles/globals.css`、`src/renderer/styles/variables.css` | 中央热点 |
| 错误边界 | `src/renderer/ui/AppErrorBoundary.tsx` | 入口包裹 |
| Electron main | `src/main/index.ts`、`src/main/createWindow.ts`、`src/main/ipc.ts`、`src/main/projectPersistence.ts` | R0-D 宿主/隔离范围 |
| Preload | `src/preload/index.ts`、`src/preload/desktop-api.d.ts` | 同上 |

启动：产品 worktree 根目录 `npm run dev`（`package.json` 同时有 `start` = `build:desktop && electron .`）。R0-A 已用 `dev` 拉起。本任务未再启动。

### 1.2 Store

| 职责 | 真实路径 | 关键导出 |
|---|---|---|
| 编辑会话 | `src/renderer/store/editorStore.ts` | `useEditorStore`、`SidebarTab`（`elements/components/layers/properties/automation/developer`）、`EditingScope`（`scene/global`）、`selectActiveScene` / `selectEditingNodes` / `selectSelectedNode(s)` |
| History helper | `src/renderer/store/history.ts` | V8 history 实现 |

无 `slideBackendPort.ts`（R2-SEAM 才可新建）。无 V9 session。

### 1.3 Workspace 与画布链

| 职责 | 真实路径 |
|---|---|
| 作者画布 | `src/renderer/ui/Workspace.tsx` |
| Viewport 变换 | `src/renderer/authoring/stageViewportTransform.ts`（**基线已有**，R2 不要另猜目录） |
| Phaser 桥 | `src/renderer/phaser/EditorPhaserBridge.ts`、`EditorScene.ts`、`SelectionOverlay.ts`、`createEditorGame.ts` |
| 节点适配 | `src/renderer/phaser/adapters/NodeAdapter.ts`、`ProxyNodeAdapter.ts` |
| 动画预览总线 | `src/renderer/phaser/elementAnimationPreviewBus.ts` |
| 就地文字 | `src/renderer/ui/TextEditOverlay.tsx`、`CanvasPlainTextEditor.tsx` |
| 公式 | `src/renderer/ui/FormulaAuthoringEditor.tsx`、`FormulaEditDialog.tsx` |

`f272756` **没有** `src/renderer/ui/workspaceSlideAuthoring.ts`（该文件首次出现于供体 `f00c01b`，R2-B 可独占新建/摘取）。

### 1.4 Sidebars 与教师可见面板

`RightSidebar` 顶级页签**没有**独立 Media 页。媒体/声音在 **Elements 内嵌 `MediaTab`**（`embedded`）。

| 职责 | 真实路径 |
|---|---|
| 顶栏 | `src/renderer/ui/TopToolbar.tsx` |
| 场景栏 | `src/renderer/ui/ScenePanel.tsx` |
| 状态条 | `src/renderer/ui/SceneStateStrip.tsx` |
| 右栏壳 | `src/renderer/ui/RightSidebar.tsx` |
| 元素（内嵌媒体） | `src/renderer/ui/ElementsTab.tsx` → `MediaTab` |
| 媒体/声音库 | `src/renderer/ui/MediaTab.tsx` |
| 图层 | `src/renderer/ui/NodesTab.tsx` |
| 属性 | `src/renderer/ui/PropertiesTab.tsx` |
| 互动与动画 | `src/renderer/ui/AutomationTab.tsx`、`SimpleEntranceAnimationEditor.tsx`、`InteractionEditor.tsx` |
| 组件 | `src/renderer/ui/ComponentsTab.tsx`、`ComponentPropertiesEditor.tsx` |
| 开发 | `src/renderer/ui/DeveloperTab.tsx`、`RuntimeContentEditor.tsx` |
| 缩略图 | `src/renderer/ui/SceneThumbnail.tsx`、`sceneThumbnailComposition.ts` |
| 导出对话框 | `src/renderer/ui/ExportPreflightDialog.tsx`、`ExportSizeWarningDialog.tsx` |
| 控制器相关 UI | `src/renderer/ui/PresenterSettingsEditor.tsx`；属性页 `ensureTeacherController` / `controller-consistency-notice`（`f272756` 相对 `79c821f` 新增） |

简洁模式页签：元素 / 图层 / 属性。专业模式另加：组件 / 互动与动画 / 开发。

### 1.5 Project 生命周期（V8）

| 职责 | 真实路径 | 关键导出 |
|---|---|---|
| 新建 | `src/renderer/project/createProject.ts` | `createProject`；无控制器时必须 `controls: 'none'`（`f272756` 收紧） |
| 打开 | `src/renderer/project/openProject.ts` | V8 `.h5lesson` |
| 保存 | `src/renderer/project/saveProject.ts` | |
| Archive | `src/renderer/project/projectArchive.ts` | `createProjectArchive` / `openProjectArchive` |
| 校验 | `src/renderer/project/validateProjectArchive.ts` | |
| Recovery | `src/renderer/project/recoveryWriteCoordinator.ts` | |
| 资源 | `src/renderer/project/assetManager.ts`、`mediaBatch.ts`、`blobUrlRegistry.ts`、`archivePath.ts` | |
| Schema/类型 | `src/shared/projectSchema.ts`、`projectTypes.ts` | V8 `ProjectDocument` |
| 健康检查 | `src/shared/projectHealth.ts`、`src/renderer/ui/ProjectHealthPanel.tsx`、`src/renderer/diagnostics/*` | |

无 `courseProjectArchive.ts` / `courseProjectLifecycle.ts`。

### 1.6 Player 与 V8 发布

V8 Player 入口是 `PlayerApp` / `publishedLesson`，**不是** `PublishedCourseApp`。

| 职责 | 真实路径 |
|---|---|
| Player 入口 | `src/player/index.ts` → `startPlayer` / `bootstrapPlayer` / `PlayerApp` |
| 场景运行 | `src/player/PlayerApp.ts`、`PlayerScene.ts`、`PlayerPresenterInput.ts` |
| 互动/状态 | `src/player/InteractionEngine.ts`、`CourseEventBus.ts`、`CourseStateStore.ts`、`CourseRuntimeKernel.ts` |
| 音频 | `src/player/AudioManager.ts` |
| 控制器运行 | `src/player/renderTeacherController.ts`、`teacherControllerRuntimeSession.ts`、`TeacherEscapeControls.ts` |
| 全局可见性 | `src/player/globalLayerVisibility.ts` |
| V8 发布 payload | `src/shared/publishedLessonTypes.ts`、`src/player/publishedLesson.ts`、`src/player/payload.ts` |
| 证据（`f272756` 新增） | `src/player/HostEvidenceRecorder.ts` |

`f272756` **没有** `src/player/teacherControllerDom.ts`（HEAD 才有，R3-C 可摘取几何，不带回失败 adapter）。

### 1.7 Export（V8）

全部在 `src/renderer/export/`，**没有** `export/course/`：

- `buildExportPayload.ts`、`buildPublishedLesson.ts`、`buildStandaloneHtml.ts`、`buildWebPackage.ts`
- `buildPptx.ts`、`pptxImages.ts`、`pptxShared.ts`、`pptxTextAndShape.ts`
- `renderSceneImages.ts`、`renderPptxComponentSnapshots.ts`、`renderPptxRuntimeSnapshots.ts`
- `playerCapture.ts`、`loadPlayerBundle.ts`、`exportPreflight.ts`、`exportSize.ts`、`exportPayloadSupport.ts`、`base64.ts`

试运行预览：`src/renderer/preview/runtimePreview*.ts`。

### 1.8 Runtime / Component（V8 已具备 API 2 / API 4）

| 层 | 真实路径 |
|---|---|
| Runtime 合同 | `src/shared/runtimeTypes.ts`（`RuntimeApiVersion = 2`）、`runtimeSchema.ts` |
| Component 合同 | `src/shared/componentTypes.ts`（`ComponentSchemaVersion = 4`）、`componentSchema.ts`、`componentProps.ts`、`componentCatalog.ts`、`componentCapabilities.ts`、`componentPackageLifecycle.ts`、`componentContentIntegrity.ts` |
| Renderer 包 | `src/renderer/components/ComponentRegistry.ts`、`importComponentPackage.ts`、`componentPackageStore.ts`、`executeComponentRuntime.ts`、`componentLibraryModel.ts`、`componentCatalogStatus.ts` |
| Player host | `src/player/RuntimeHost.ts`、`RuntimeRegistry.ts`、`RuntimeAuthoringTargetRegistry.ts`、`ComponentRegistry.ts`、`ComponentAuthoringTargetRegistry.ts` |
| Authoring session | `src/renderer/authoring/runtimeAuthoringContext.ts`、`runtimeTargetEditSession.ts`、`componentTextEditSession.ts`、`authoringReadiness.ts` |
| Main 扫描 | `src/main/componentCatalogManager.ts`、`componentCatalogScanner.ts` |

`f272756` **没有** `src/shared/surfaceRuntimeTypes.ts`（Runtime API 3 表面合同，`3e41ec0` 引入，R1-D 摘取）。也没有 `src/player/SurfaceRuntimeAuthoring.ts`。

### 1.9 测试入口（V8 保护，R8 才全量跑）

| 类别 | 真实路径 |
|---|---|
| 主 E2E | `tests/e2e/editor.spec.ts` |
| 其他 E2E | `tests/e2e/componentCatalogMatrix.spec.ts`、`render-host-benchmark.spec.ts` |
| Store/画布 | `tests/unit/editorStore.test.ts`、`globalEditorStore.test.ts`、`stageViewportTransform.test.ts`、`editorFormattingUi.test.tsx` |
| 媒体 | `tests/unit/mediaTab.test.tsx` |
| 图层/全局 | `tests/unit/globalLayerUi.test.tsx`、`globalLayerVisibility.test.ts` |
| Archive/recovery | `tests/unit/projectArchive.test.ts`、`recoveryWriteCoordinator.test.ts`、`projectPersistence.test.ts` |
| Runtime/Component | `tests/unit/runtimeHostV2.test.ts`、`playerComponentV4Render.test.ts` |
| 控制器 | `tests/unit/teacherControllerLayout.test.ts`、`teacherControllerActions.test.ts`、`teacherControllerConsistency.test.ts`、`teacherControllerRuntimeSession.test.ts`、`teacherEscapeControls.test.ts` |
| Integration | `tests/integration/componentCatalogV8Matrix.test.ts`、`player-payload.test.ts`、`runtimeRegistry.test.ts` 等 |

`14890bb` 行为地图列出的 12 个受保护 suite 在 `f272756` 均存在（见 §3）；那份地图本身不是基线。

---

## 2. `14890bb` 证据：行为地图，不是代码基线

### 2.1 位于 `3e41ec0` 之后

```text
git rev-parse 14890bb 3e41ec0 f272756
# 14890bb76d5743189114f0ff2d42c85a5aa8a4a2
# 3e41ec058627d38c4b9f5439b454cc72331e1485
# f27275658c6dfaa12f2ce35cd9368dcdebe99451

git log -1 --format='%H %P %s' 3e41ec0
# 3e41ec0… f272756… feat: rebuild courseware authoring around Project V9

git merge-base --is-ancestor 3e41ec0 14890bb   # exit 0
git merge-base --is-ancestor 14890bb 3e41ec0   # exit 1
git merge-base --is-ancestor f272756 14890bb   # exit 0

git log --oneline --first-parent 3e41ec0..14890bb
# 14890bb test(contracts): map protected V8 editor behavior
# 31f936a docs: materialize G03 behavior map wave
# 378c195 test(contracts): freeze V8 editor visual baseline
# 48dd493 docs: materialize G02 visual baseline wave
# 05bdee5 docs: freeze 3e V8 editor engineering baseline
# 1559f0d docs: materialize G01 baseline wave
# 8c7a530 docs: add audited editor convergence plan
# count: git rev-list --count 3e41ec0..14890bb → 7
```

### 2.2 默认 ProductApp 走 V9

`git show 14890bb:src/renderer/main.tsx` 渲染 `<ProductApp />`，不是 `<App />`。

`git show 14890bb:src/renderer/ProductApp.tsx`：

- `initialRoute()` 在无 `?editor=` 时 `return 'course-v9'`
- 默认 `return <CourseStudioApp … />`
- 仅 `?editor=legacy-v8` 才落到 `LegacyApp`

`f272756` 的 `main.tsx` 没有 `ProductApp`。把 `14890bb` 当 V8 基线会启动 Course Studio V9。

### 2.3 地图内容与使用方式

`tests/contracts/v8-behavior-map.json`（`git cat-file -s` ≈ 68 399 bytes）声明：

- `baseline.sourceCommit` = **`3e41ec0`**（V9 重建提交，不是 `f272756`）
- `acceptedParent` = `378c195`（V8 视觉合同采集点，仍在 V9 树、经 ProductApp 隐藏返回按钮）
- 12 个 suite / 151 个静态定义 / 172 个展开用例，disposition 全是 `keep`

受保护 suite 路径（清单参考，须回到 `f272756` 真实文件重建验证）：

1. `tests/unit/editorStore.test.ts`
2. `tests/unit/globalEditorStore.test.ts`
3. `tests/unit/globalLayerUi.test.tsx`
4. `tests/unit/sceneStateUi.test.tsx`
5. `tests/unit/stageViewportTransform.test.ts`
6. `tests/unit/editorFormattingUi.test.tsx`
7. `tests/unit/simpleEditorMode.test.tsx`
8. `tests/unit/developerMode.test.tsx`
9. `tests/unit/mediaTab.test.tsx`
10. `tests/unit/componentPropertiesEditor.test.tsx`
11. `tests/unit/presenterSettingsUi.test.tsx`
12. `tests/unit/interactionEditor.test.tsx`
13. 另列 `tests/e2e/editor.spec.ts`

**登记结论：** `14890bb` = V8 行为/视觉**地图与采集记录**。代码基线仍是 `f272756`。不得 checkout `14890bb` 当产品主干，不得把该提交的绿色测试或视觉 PNG 写成当前 Gate 通过。

---

## 3. `79c821f..f272756` 编辑器相关差异（供 R0-G 判断是否二分）

```text
git log --oneline 79c821f..f272756
# f272756 refactor: harden courseware skills and evidence workflow
# 02c0369 docs: document W2 HTML courseware failures   ← 仅一篇问题陈述文档

git diff --name-only 79c821f..f272756 -- src/renderer/App.tsx src/renderer/main.tsx src/renderer/ui/Workspace.tsx src/renderer/ui/MediaTab.tsx src/renderer/ui/RightSidebar.tsx src/renderer/ui/ElementsTab.tsx src/renderer/ui/NodesTab.tsx src/renderer/ui/TopToolbar.tsx src/renderer/ui/ScenePanel.tsx
# （空）App / main / Workspace / MediaTab / 右栏壳 / 元素 / 图层 / 顶栏 / 场景栏 零 diff
```

全范围：130 files / +16672 / −391。其中 `src/`+`tests/`：77 files / +5278 / −226。技能与证据脚本占大部分。

### 3.1 产品源码实际改动（与教师画布相关）

| 文件 | 约略 | 性质 | 二分意义 |
|---|---|---|---|
| `src/renderer/ui/PropertiesTab.tsx` | +73/−部分 | 全局层设置、控制器一致性提示、`ensureTeacherController` | 若 R0-B 发现控制器/全局属性回归，优先看这里 |
| `src/renderer/store/editorStore.ts` | +55 | `updatePlayback` 与控制器显隐同步；删除场景时清理 visibility.sceneIds；`synchronizeTeacherControllerControls` | 若保存后控制器消失或 `controls: none` 行为异常 |
| `src/renderer/project/createProject.ts` | +31 | 无默认控制器必须显式 `controls: 'none'`；canvas 模式必须带控制器 | 若新建工程缺控制器或抛错 |
| `src/shared/projectSchema.ts` | +16 | 与上项配套 | 同上 |
| `src/shared/teacherControllerConsistency.ts` | 新文件 | 控制器交付一致性 | 属性/播放控件耦合 |
| `src/shared/runtimeTypes.ts` | +42 | Runtime evidence API | 画布编辑无关 |
| `src/shared/assessmentEvaluators.ts` | 新文件 | 课例评估 | 画布编辑无关 |
| `src/player/HostEvidenceRecorder.ts` | 新文件 | 运行证据 | Player 证据，非作者画布 |
| `src/player/TeacherEscapeControls.ts` | 新文件 | 播放逃逸控件 | Player |
| `src/player/RuntimeHost.ts` / `PlayerApp.ts` / `CourseRuntimeKernel.ts` 等 | 中等 | Runtime 2 与播放壳 | 试运行/发布；非 MediaTab/Workspace |
| `tests/e2e/editor.spec.ts` | +22/− | 夹具/断言微调 | 不单独构成产品回归 |

### 3.2 给 R0-G 的建议

- **默认不要二分。** 核心壳（App、Workspace、MediaTab、RightSidebar、ScenePanel、main）相对 `79c821f` 未改。
- 仅当 R0-B 在下列点复现严重问题时，才对 `79c821f..f272756` 做**文件级**对照，而不是放弃 `f272756`：PropertiesTab 控制器、新建工程控制器、`updatePlayback`、Player 逃逸/证据。
- 不得因技能脚本、评估测试或文档增量放弃 `f272756`。

---

## 4. V9 能力供体矩阵（按能力）

使用规则：按文件/函数摘取。禁止 cherry-pick `3e41ec0`、`e2e34aa`、`6361641`、`bffbf95`、`4755034` 整串。`e2e34aa` 是**树快照**（该 commit 只改 md），读文件用 `git show e2e34aa:<path>`。

| 能力 | 首选供体树 | 关键文件 / 函数 | 为什么可复用 | 禁止带回 | 建议定向测试（1–2） |
|---|---|---|---|---|---|
| Schema / model | 引入：`3e41ec0`；读后期字段：`e2e34aa` 或 HEAD **纯模块** | `src/shared/courseProjectTypes.ts`（`COURSE_PROJECT_SCHEMA_VERSION = 9`，locations/surfaces/globalLayerItems）；`courseProjectSchema.ts`（`courseProjectDocumentSchema`、`layerItemSchema`、`flowBlockSchema`）；`courseProjectModel.ts`（`migrateProjectV8ToCourseProjectV9`、`getEffectiveCourseLayerOrder`、`visitCourseProject` / `collectCourseProjectReferences`、`reindexLayerItems`） | 纯合同，不依赖 App。R1-A 独占这些路径 | CourseStudio UI；`projectMode`；把 HEAD 巨型 `courseProjectProtocol.test.ts` 整文件当 R1 测试（它已依赖 `courseLocationCommands` / lifecycle） | **新建** `tests/unit/courseProjectCoreContract.test.ts`（从 protocol 测试摘 schema/model round-trip）；`tests/unit/authoringAddress.test.ts`（`3e41ec0` 已有，可随文件迁） |
| authoringAddress | `3e41ec0` | `src/shared/authoringAddress.ts`：`makeAuthoringAddress`、`AUTHORING_ADDRESS_PROTOCOL_VERSION` | 跨保存稳定地址；V8 无此文件 | `src/renderer/authoring/courseAiHandoff.ts` / `courseAiPatch.ts` / `aiSelectionReference.ts`（未挂载 AI，不得当工作流） | `tests/unit/authoringAddress.test.ts` |
| Archive / 格式探测 / 纯迁移 | 编解码：`3e41ec0`/`e2e34aa`；identity 探测：HEAD/`bffbf95` **函数级** | `src/renderer/project/courseProjectArchive.ts`：`createCourseProjectArchive`、`openCourseProjectArchive`、`importProjectV8ArchiveAsCourseProject`、`migrateProjectV8ArchiveToCourseProjectV9`；HEAD 另有 `inspectCourseProjectArchiveIdentity`（`bffbf95` 引入）。模型侧 `migrateProjectV8ToCourseProjectV9` | 可独立 fixture round-trip；R1-B 独占 archive 新文件 | 改 V8 `openProject.ts` / `projectArchive.ts` 默认路径；静默把 V8 当 V9 打开；整文件覆盖 App IPC | **新建** `tests/unit/courseProjectArchive.test.ts`、`courseProjectMigration.test.ts`（不要直接跑 HEAD protocol 大文件） |
| Lifecycle / recovery 结构 | `bffbf95`/HEAD 纯函数 | `src/renderer/project/courseProjectLifecycle.ts`：`shouldMarkCourseProjectDirty`、`resolveCloseDirtyState`、`shouldOfferCourseProjectRecovery` | R1-B 可测数据结构；R7-A 再接 IPC | 把 HEAD `main.tsx` `createNewCourseProject()` 当默认产品；双写 V8/V9 | 从 protocol 测试摘 recovery 断言，或新建窄测试；R7 再用 `tests/unit/projectPersistence.test.ts` |
| Published V2 producer | `3e41ec0` 引入；`e2e34aa`/HEAD 演进 | `src/renderer/export/course/buildPublishedCourse.ts`：`buildPublishedCourseV2Payload`、`collectPublishedCourseAssetIds`、`collectPublishedCourseComponentKeys`；类型 `publishedCourseTypes.ts`（`PUBLISHED_COURSE_VERSION = 2`）、`publishedCourseSchema.ts`（`publishedCourseV2Schema`）；`export/course/index.ts` | 纯 producer，不从 DOM/Phaser 反建 | 接到现有 V8 `buildPublishedLesson.ts` 默认导出；假渲染未实现的 Flow/Spatial | **新建** `tests/unit/buildPublishedCourseV2.test.ts`；可对照 HEAD `tests/unit/publishedCourseSpatial.test.ts` 但 R1 不要跑 Spatial 全文件 |
| Slide commands / view | 命令核：`49faf23`→`62cd1a4`→`e2e34aa`；手势接线**不要**抄 `6361641` 的 App | `src/renderer/course/slideEditorCommands.ts`（`selectSlideEditorLayers`、`transformSelectedSlideNativeLayers`）；`slideEditorView.ts`；`v9SlideVerticalSlice.ts`（`buildV9SlideWorkspaceSnapshot`、scene/state/history 命令）。HEAD 切片已膨胀并 `import` `courseStudioModel` | history/selection/引用维护已有纵切 | `6361641` 对 `App.tsx` 的 controlled `documentControl`；HEAD `v9SlideVerticalSlice.ts` 整文件当 R1 产物；`CourseStudioApp` | 供体：`tests/unit/slideEditorCommands.test.ts`、`slideEditorView.test.ts`；R2-A 应**新建** `tests/unit/v9SlideDomain.test.ts` 只留 scene/state/selection/history |
| Slide workspace adapter | `f00c01b` / `e2e34aa` | `src/renderer/ui/workspaceSlideAuthoring.ts` | 可选 Slide input，供 R2-B 独占新建 | 第二套 Workspace；改 `Workspace.tsx`（R2-Z 才接） | `tests/unit/workspaceSlideAuthoring.test.ts`（供体）；R2 新建 `v9SlideViewportAdapter.test.ts` + 基线 `stageViewportTransform.test.ts` |
| Flow model/commands/Player | 命令：`b3be117`；快照：`e2e34aa`；TOC：HEAD `flowRuntimeToc.ts` | `flowEditorCommands.ts`（`insertFlowEditorBlock`、`updateFlowEditorBlock`、结构命令）；`flowEditorSlice.ts`；`flowEditorView.ts`（`buildFlowEditorView`）；`src/player/surfaces/flow/FlowSurfaceHost.ts`、`flowModel.ts` | 文档模型与 Player host 可复用 | `FlowElementsTab.tsx`、`FlowPropertiesTab.tsx`、把 paragraph 当通用图层行的 view；`CourseStudioApp` 内 Flow 弱编辑器；HEAD `executeFlowEditorAction` 对 App 的 adapter | `tests/unit/flowEditorCommands.test.ts`、`flowEditorView.test.ts`（R4-A）；Player：`tests/unit/flowSurfaceHost.test.ts`。**不要**以 `flowElementsTab.test.tsx` / `flowPropertiesTab.test.tsx` 为合同 |
| Spatial model/camera/path/Player | 命令：`8fc6e36`；快照：`e2e34aa` | `spatialEditorCommands.ts`、`spatialEditorView.ts`、`spatialCameraCommands.ts`、`spatialPathCommands.ts`；`src/player/surfaces/spatial/SpatialSurfaceHost.ts`、`spatialModel.ts` | world/camera/path/relation 与运行时 | `SpatialLayerInspector.tsx` 替代 Properties；独立弱化元素面板；inverse-scale 控制器；`SpatialWorkspace.tsx` 整套当正式 UI（R5-DESIGN 未确认前不实现产品 UI） | `tests/unit/spatialEditorCommands.test.ts`、`spatialCameraCommands.test.ts`；Player：`spatialSurfaceHost.test.ts`（R5-D，避开 `spatialSurfaceHostCtrl.test.ts` 若含错误坐标） |
| Mixed / 课程结构 | `bffbf95`/HEAD 纯模块 | `courseLocationCommands.ts`、`courseEditorLayout.ts`（`deriveCourseEditorLayout`，**无 `projectMode`**）；树投影迁到新建 `courseTreeView.ts`（不要留在 layout 里与 R6-A 抢文件）；`editorActionRouting.ts`；Player 组装用 `CoursePlayer.ts` + `mixed/MixedCourseNavigator.ts`（R7-B，不要整文件 `PublishedCourseApp`） | locations/surfaces 推导 Pure/Mixed | 持久化四模式字段；HEAD App 里切 Flow/Spatial workspace 的壳层接线；新增 scene 导致旧内容消失的失败实现；七次 Electron 冒烟 | `tests/unit/courseLocationCommands.test.ts`、`courseEditorLayout.test.ts`（R6-A）；`courseTreeView.test.ts`（R6-B） |
| Global / effective layer | `bffbf95`/HEAD 纯命令 | `globalLayerCommands.ts`（`reorderGlobalLayerItems`、`setGlobalLayerVisible`、`restoreDefaultTeacherController`、`commitGlobalControllerTransform`）；`effectiveLayerCommands.ts`（`listEffectiveLayerCommandItems`、`applyEffectiveLayerReorder` 等） | owner 内排序/显隐/锁/复制/删 | 控制器改成 scene item；HEAD NodesTab controlled 分支；“暂不能调整顺序” no-op | `tests/unit/globalLayerCommands.test.ts`、`effectiveLayerCommands.test.ts` + 基线 `globalLayerVisibility.test.ts`（R3-A，R1 不做） |
| Export HTML/包/PPTX/打印 | `3e41ec0` 引入 `export/course/*`；产品已有 V8 `buildPptx.ts` / `buildWebPackage.ts` 与 R4-D `flowDocx.ts` | 优先接现有 V8 导出文件吃 V2；不够再用 `buildCoursePackages.ts`、`buildCoursePptx.ts`、`buildCoursePrintArtifacts.ts`。`flowDocx.ts` **R4-D 已交付，R7-D 只 import** | 与 Published V2 同一 producer 链 | 恢复 `.course-nav`；重写 `flowDocx.ts`；第二套导出菜单；只断言文件存在 | R7-C/D 各最多两个测试；R7-Z 一次 HTML 写文件冒烟 |
| Runtime API 2/3 | V8 基线 API 2：`f272756` `runtimeTypes.ts` / `RuntimeHost.ts`；API 3：`3e41ec0` `surfaceRuntimeTypes.ts`（`SURFACE_RUNTIME_API_VERSION = 3`）、`SurfaceRuntimeAuthoring.ts` | 兼容升级，不新建第二 registry | CourseStudio 动态编辑器；capability-gate 隐藏未迁移入口 | `tests/unit/runtimeHostV2.test.ts`（基线已有）；供体 `tests/unit/surfaceRuntimeV1.test.ts`；R1-D 可新建 `componentProtocolV4.test.ts` 对照（HEAD 已有该文件名） |
| Component API 4 | **V8 基线已是 API 4** | `f272756` 的 `componentTypes.ts` / `componentSchema.ts` / `importComponentPackage.ts` / Player `ComponentRegistry` | 先保持 V8 包合同，再让 V9 layerItem 引用同一 package | 复制 CourseStudio 组件面板；第二套 catalog | `tests/unit/playerComponentV4Render.test.ts`；HEAD `tests/unit/componentProtocolV4.test.ts` |
| 失败 UI / controlled adapters | `bffbf95` / `4755034` **只作反例** | HEAD `App.tsx` `documentControl`；`ElementsTab` `ControlledElementsTabProps`；`PropertiesTab` `ControlledPropertiesTab` / `ControlledPropertiesGate`；`ProductApp`；`CourseStudioApp.tsx`；`CourseSurfaceCanvas.tsx`；`main.tsx` 默认 `createNewCourseProject()` | 用于对照“不要做什么” | **禁止移植** | 无；不要为反例加测试 |

### 4.1 供体缺口（R1-A 必须新做，不是复制）

HEAD 与 `3e41ec0` 的 Flow 文字仍是纯字符串：

```ts
export interface FlowParagraphBlock { type: 'paragraph'; text: string }
```

`courseProjectSchema.ts` 中 `flowParagraphBlockSchema` 同样只有 `text: z.string()`。根计划要求 R1-A 在**同一 V9 版本内**补齐向后兼容的选区级 `TextRun[]`（plain-text fallback 仍可读）。这不是从供体整文件可得的能力，不能把当前 HEAD Schema 写成已完成的强文本 Flow 合同。

---

## 5. 分供体记录（提交 → 摘取边界）

### 5.1 `f272756` — 产品主干，不是供体

- **用途：** 保留 App/Workspace/store/UI/Phaser/V8 archive/V8 Player。
- **可复用：** 全部教师可见表面；`stageViewportTransform.ts`；Runtime 2 / Component 4。
- **禁止：** 在 R0 移植任何 V9 文件到此 worktree（本任务未改）。

### 5.2 `3e41ec0` — V9 协议首次引入

- **文件：** `courseProjectTypes/Schema/Model`、`publishedCourseTypes/Schema`、`authoringAddress.ts`、`surfaceRuntimeTypes.ts`、`courseProjectArchive.ts`、`export/course/*`、`PublishedCourseApp.ts`、`player/surfaces/**` 初版、`CourseStudioApp.tsx`（禁）。
- **函数：** `courseProjectDocumentSchema`、`migrateProjectV8ToCourseProjectV9`、`create/openCourseProjectArchive`、`buildPublishedCourseV2Payload`、`makeAuthoringAddress`、`startPublishedCourse`。
- **可复用：** 纯协议与 archive/producer 骨架。
- **禁止：** `ProductApp` 双路由、`CourseStudioApp`、一次 312 文件重建的其余 UI 删除。
- **测试：** `tests/unit/authoringAddress.test.ts`、`tests/unit/courseProjectProtocol.test.ts`（当时较纯；HEAD 版已污染，R1 只摘断言）。

### 5.3 `14890bb` — 行为地图

- **文件：** `tests/contracts/v8-behavior-map.json`、`tests/contracts/v8-shell-baseline/*.png`、`docs/verification/V8_EDITOR_VISUAL_BASELINE_20260814.md`。
- **可复用：** 能力清单与 suite 名单，回到 `f272756` 验证。
- **禁止：** 当代码基线；当视觉 Gate 已通过。
- **测试：** 不要跑该提交的 Vitest 来证明新产品。

### 5.4 `62cd1a4` / `49faf23` / `f00c01b` — Slide 纵切引入点

- `v9SlideVerticalSlice.ts` @ `62cd1a4`
- `slideEditorCommands.ts` @ `49faf23`
- `workspaceSlideAuthoring.ts` @ `f00c01b`
- **可复用：** 早期较窄的 domain/adapter。
- **禁止：** 后续把 slice 胀成 App 后端的提交。
- **测试：** 同期 `tests/unit/v9SlideVerticalSlice.test.ts` 需大幅裁剪后才适合 R2-A。

### 5.5 `6361641` — 手势/属性同步集成（热点提交）

- **改动：** `src/renderer/App.tsx`（global 层进入 controlled 属性编辑）、`PropertiesTab.tsx`、测试 `v9SlideVerticalSlice.test.ts`、`v9SlideMediaLayerSession.test.ts`、`workspaceNodeTransformCompletion.test.ts`、`propertiesTabDocumentControl.test.tsx`。
- **可复用：** 测试里“一次手势一次 history / 属性与画布同步”的断言意图。
- **禁止：** 整文件覆盖产品 `App.tsx` / `PropertiesTab.tsx`。
- **测试：** 只读上述测试，R2-Z 再接线。

### 5.6 `b3be117` / `8fc6e36` — Flow / Spatial 命令引入

- Flow：`flowEditorCommands.ts` 等 @ `b3be117`
- Spatial：`spatialEditorCommands.ts` / view @ `8fc6e36`
- **可复用：** 纯命令与 read model。
- **禁止：** 同期或后续的 `FlowElementsTab` / `SpatialLayerInspector` 产品化。
- **测试：** `flowEditorCommands.test.ts`、`spatialEditorCommands.test.ts`。

### 5.7 `e2e34aa` — M5/M6 集成树快照

- **提交内容：** 仅 `COURSEWARE_DEVELOPMENT_PLAN.md` 与 M5/M6 计划文档。
- **树内已有：** Slide/Flow/Spatial 命令与 Workspace 文件、`PublishedCourseApp`、三 SurfaceHost、Flow/Spatial 专用 UI（禁作母体）。
- **可复用：** 对该 SHA `git show` 纯模块，作为“集成后、bffbf95 失败接线前”的对照。
- **禁止：** 把 `e2e34aa` 说成代码变更供体或旧“首选恢复基线”。
- **测试：** 快照内 `flowEditor*.test.ts`、`spatialEditor*.test.ts`、`v9Slide*.test.ts` 按阶段裁剪。

### 5.8 `bffbf95` / `4755034` — 失败 HEAD，函数级供体 + 反例

- **可摘纯模块（R3/R6/R7，不是 R1 默认产品）：** `courseProjectLifecycle.ts`、`inspectCourseProjectArchiveIdentity`、`courseLocationCommands.ts`、`courseEditorLayout.ts`、`globalLayerCommands.ts`、`effectiveLayerCommands.ts`、`editorActionRouting.ts`、`flowRuntimeToc.ts`。
- **反例（禁止带回）：** `main.tsx` 默认 V9 fixture/工程；`ProductApp`；`App.tsx` documentControl / SpatialLayerInspector / Flow-Spatial chrome；`ControlledElements` / `ControlledPropertiesGate`；`CourseStudioApp`；no-op capability gate。
- **测试：** HEAD `courseProjectProtocol.test.ts`（24749 bytes）依赖过宽，R1 禁止原样作为定向测试。

---

## 6. 中央热点（并行 lane 不得直改）

与 `00_INDEX.md` §6 一致；路径已在 `f272756` 对过，**不要改名另起一套**：

- `src/renderer/App.tsx`
- `src/renderer/main.tsx`（及未来唯一产品入口；不得再引入用户可见 `ProductApp` 双编辑器）
- `src/renderer/store/editorStore.ts`
- `src/renderer/ui/Workspace.tsx`
- `src/renderer/ui/ScenePanel.tsx`
- `src/renderer/ui/RightSidebar.tsx`
- `src/renderer/ui/TopToolbar.tsx`
- `src/renderer/ui/NodesTab.tsx`
- `src/renderer/ui/PropertiesTab.tsx`
- `src/renderer/ui/ElementsTab.tsx`
- `src/renderer/ui/MediaTab.tsx`
- `src/renderer/styles/globals.css`

接线规则：lane 只提供窄导出 + 定向测试 + `INTEGRATION_REQUEST`；由该阶段 `*-Z` / `R3-CUT` 串行修改热点。禁止第二 App、第二 Workspace、第二侧栏、长期 controlled 分支。

`6361641`、`e2e34aa` 树、`4755034` 对上述热点的修改一律视为**反例或待 Z 重接**，不是可覆盖母体。

---

## 7. 后续阶段可独占的新模块（避免猜路径）

下列路径在 `f272756` **尚不存在**（除非注明基线已有）。并行 lane 应在这些路径新建或从供体**迁入纯模块**，不要改热点。

### R1（协议内核，默认 V8 产品零 diff）

| 任务 | 独占新/迁入路径 |
|---|---|
| R1-A | `src/shared/courseProjectTypes.ts`、`courseProjectSchema.ts`、`courseProjectModel.ts`、`publishedCourseTypes.ts`、`publishedCourseSchema.ts`、`authoringAddress.ts`、`surfaceRuntimeTypes.ts`；新建 `tests/unit/courseProjectCoreContract.test.ts` |
| R1-B | `src/renderer/project/courseProjectArchive.ts`；可选纯 `courseProjectLifecycle.ts`；V8→V9 纯转换（可放 model 或 archive）；新建 `courseProjectArchive.test.ts`、`courseProjectMigration.test.ts` |
| R1-C | `src/renderer/export/course/buildPublishedCourse.ts`、`index.ts`；新建 `buildPublishedCourseV2.test.ts`（`publishedCourseProtocol.test.ts` 若不存在则新建，勿跑跨阶段大文件） |
| R1-D | `surfaceRuntimeTypes.ts` 已在 A；窄扩 `runtimeTypes.ts` / `runtimeSchema.ts` / `componentTypes.ts` / `componentSchema.ts`；必要时 `src/player/RuntimeHost.ts`、`SurfaceRuntimeAuthoring.ts` 协议边界。**不改** ComponentsTab/DeveloperTab/PropertiesTab |
| R1-Z | 最小 fixture + round-trip 测试；不碰 UI |

### R2（同一 V8 UI 下 V9-backed Slide）

| 任务 | 独占路径 |
|---|---|
| R2-A | `src/renderer/course/v9SlideVerticalSlice.ts`、`slideEditorCommands.ts`、`slideEditorView.ts`；新建 `tests/unit/v9SlideDomain.test.ts` |
| R2-SEAM | 热点：`editorStore.ts`、`App.tsx`；可新建 `src/renderer/store/slideBackendPort.ts`；`tests/unit/v9SlideBackendSelection.test.ts` |
| R2-B | 新建/迁入 `src/renderer/ui/workspaceSlideAuthoring.ts`；**已有** `src/renderer/authoring/stageViewportTransform.ts`；Phaser bridge 窄扩。**不改** `Workspace.tsx` |
| R2-C | 新建 `src/renderer/authoring/v9SlideContentEdit.ts`（或同等窄模块）；仅必要时改 Text/Formula 组件 |
| R2-D | 新建 `src/renderer/course/v9SlideContentCommands.ts` |
| R2-E | 新建 `v9SlideActionCommands.ts`、`v9SlideClipboard.ts`；迁入 `slideInteractionCommands.ts` / `slideInteractionView.ts` |
| R2-Z | 本节全部中央热点 |

### R3

| 任务 | 独占路径 |
|---|---|
| R3-A | `src/renderer/course/globalLayerCommands.ts`、`effectiveLayerCommands.ts` |
| R3-B | 新建 `src/renderer/course/v9MediaAudioCommands.ts`；V9 窄扩 `assetManager.ts` / `mediaBatch.ts`；必要时 `AudioManager.ts`。**不改** `MediaTab.tsx` |
| R3-C | 基线已有 `teacherControllerLayout.ts`、`teacherControllerConsistency.ts`、`renderTeacherController.ts`、`teacherControllerRuntimeSession.ts`；可迁入 HEAD `teacherControllerDom.ts`（`f272756` 无此文件）；新建作者态 controller bridge |
| R3-D | 新建 `src/renderer/course/effectiveLayerProjection.ts`、`src/renderer/authoring/courseAuthoringScope.ts` |
| R3-Z / R3-CUT | 中央热点 + persistence/入口 |

### R4 / R5（实现等 R3-CUT + 设计确认）

| 任务 | 独占路径 |
|---|---|
| R4-A | `src/renderer/course/flowEditorCommands.ts`、`flowEditorSlice.ts`、`flowEditorView.ts` |
| R4-B | 经设计确认的单一 `src/renderer/ui/FlowWorkspace.tsx`（**不要** FlowElements/Properties 页） |
| R4-C | Flow overlay adapter（新文件，不改 RightSidebar/MediaTab） |
| R4-D | `src/player/surfaces/flow/FlowSurfaceHost.ts`、`flowModel.ts`、`flowRuntimeToc.ts`；`export/course/flowDocx.ts` / print helper |
| R5-A | `spatialEditorCommands.ts`、`spatialEditorView.ts`、`spatialCameraCommands.ts` |
| R5-B | 新建 `src/renderer/authoring/spatialWorldAuthoring.ts`（供体 `spatialWorkspaceAuthoring.ts` 只作对照，默认不把弱化 SpatialWorkspace 当母体） |
| R5-C | `spatialPathCommands.ts`；轻量 `SpatialCameraPanel.tsx` / `SpatialPathEditor.tsx`。**禁止** `SpatialLayerInspector` 替代 Properties |
| R5-D | `SpatialSurfaceHost.ts`、`spatialModel.ts` |
| R4-Z / R5-Z | 壳层热点；二者不得并行改同一热点 |

### R6 / R7

| 任务 | 独占路径 |
|---|---|
| R6-A | `courseLocationCommands.ts`、`courseEditorLayout.ts`（不含树投影） |
| R6-B | 新建 `src/renderer/course/courseTreeView.ts`（不要改 ScenePanel） |
| R6-C | `editorActionRouting.ts`、`editorActionTypes.ts`、`courseAuthoringSession.ts` |
| R6-Z | ScenePanel 主按钮+课树；保留顶栏三类新建工程 |
| R7-A | 只补仍缺的 recovery/recent/损坏拒绝；不要重写 CUT 打开保存 |
| R7-B | 新建 `CoursePlayer.ts`、`mixed/MixedCourseNavigator.ts`、`publishedDynamicHosts.ts`。禁止整文件 `PublishedCourseApp`；禁止改 Flow/Spatial host |
| R7-C | 扩展现有 `buildWebPackage` / `buildStandaloneHtml` / preflight；必要时才新建 `buildCoursePackages.ts`。不要改 `flowDocx.ts` |
| R7-D | 扩展现有 `buildPptx.ts` 或新建 pptx/print 入口；**只调用**已有 `flowDocx.ts` |
| R7-E | `SurfaceRuntimeAuthoring.ts` 等 1–2 个窄文件（不改 V8 插入 UI） |
| R7-Z | 整课预览 + 导出写文件；一次 HTML 冒烟 |

### 基线已有、不要重复发明的模块

- `src/renderer/authoring/stageViewportTransform.ts`
- `src/renderer/ui/MediaTab.tsx`（保持 Elements 内嵌，不改成必须顶级页签）
- V8 `projectArchive.ts` / `openProject.ts` / `PlayerApp.ts` / `buildPublishedLesson.ts`（R3-CUT 前默认产品继续走它们）

---

## 8. 建议 R1-A 首先摘取的文件清单

只读摘取，R0-G 确认前**不要写入产品 worktree**。优先 `git show 3e41ec0:<file>` 建立骨架，再用 `e2e34aa`/HEAD **同文件 diff** 收后期兼容字段（仍只取纯类型/schema/model）。

1. `src/shared/courseProjectTypes.ts`
2. `src/shared/courseProjectSchema.ts`
3. `src/shared/courseProjectModel.ts`（至少 `migrateProjectV8ToCourseProjectV9`、`getEffectiveCourseLayerOrder`、`visitCourseProject` / `collectCourseProjectReferences`）
4. `src/shared/publishedCourseTypes.ts`
5. `src/shared/publishedCourseSchema.ts`
6. `src/shared/authoringAddress.ts`
7. `src/shared/surfaceRuntimeTypes.ts`
8. `tests/unit/authoringAddress.test.ts`（可整文件迁；与 R1-A 验证命令一致）
9. 从 `tests/unit/courseProjectProtocol.test.ts` **手工摘** schema/model/Flow plain-text 读取断言，写入新建 `tests/unit/courseProjectCoreContract.test.ts`；不要迁 HEAD 版整文件（已 import `courseLocationCommands`、`courseProjectLifecycle`）

R1-A 必须在摘取后**扩展** Flow heading/paragraph/quote/list/table 的 runs 承载，并保持旧纯字符串可读。不要启动 Schema V10。

明确不要在 R1-A 摘取：`App.tsx`、`main.tsx`、`editorStore.ts`、`ProductApp.tsx`、`CourseStudioApp.tsx`、`v9SlideVerticalSlice.ts`、任何 `ui/*Tab.tsx`、`courseAi*`。

---

## 9. 本审计未做 / 未宣称

- 未跑 typecheck、全量/定向 Vitest、build、E2E、视觉回归。
- 未启动 App（启动与能力清单交 R0-A/B）。
- 未做格式/recovery 隔离（交 R0-D）。
- 未请求教师确认（交 R0-G）。
- 未把任何供体或当前 HEAD 标为 `engineering candidate`、`art candidate` 或 `accepted`。
