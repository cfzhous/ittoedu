# T10 — 中央接线、Mixed 自适应与统一输入

> Wave：3（串行）
> 依赖：T02–T09B HANDOFF 全部到齐
> 职责：只做热点接线与窄冲突修复，不重写 lane 功能

## 1. 独占热点

- `src/renderer/App.tsx`
- `src/renderer/store/editorStore.ts`
- `src/renderer/ui/Workspace.tsx`
- `src/renderer/ui/ScenePanel.tsx`
- `src/renderer/ui/RightSidebar.tsx`
- `src/renderer/ui/TopToolbar.tsx`
- `src/renderer/styles/globals.css`
- 上述接线直接对应的 App/shell/store/workspace 单测

只有本任务可以处理 Wave 1/2 的 `INTEGRATION_REQUEST`。若请求实际上缺少 lane 内功能，退回原 owner，不在热点中临时实现第二套逻辑。

## 2. 集成顺序

1. 核对 T02–T09B 所有 HANDOFF 的 baseline、导出符号、最小测试和未决风险。
2. 先接 store 的 V9 command wrapper 与稳定 selection/session；不保留隐藏 V8 写路径。
3. 接课程结构与布局推导，再接左栏全局层固定分区和三类页面树。
4. 接 Slide/Flow/Spatial Workspace 与右栏能力，保证切 location 时事务完整。
5. 接有效图层、属性、媒体、右键菜单和 T02 动作路由。
6. 最后接全局 keydown/contextmenu、试运行、保存/重开和 Mixed Player 入口。
7. 只在所有行为正确后做最小 CSS 收敛，对照根目录 UI 参考图。

## 3. 必须成立的 UI

### 3.1 左栏

- 四态均固定显示“共享内容 → 全局层（全课）”，与页面树有分隔。
- 纯 Slide 是紧凑缩略图；纯 Flow 是页面—标题目录；纯 Spatial 是页面—镜头；Mixed 是统一课程树。
- 全局层不是 location，不改变 active location、课程顺序或 Pure/Mixed。
- 新增内容始终可创建 Slide、Flow、Spatial；不依赖导入。

### 3.2 工作区与右栏

- active location 决定中央 surface、元素/图层/属性、快捷键和当前位置试运行。
- 切换前提交/取消当前编辑事务，清空上一 surface 的临时 selection/hover/draft，不串页。
- 选择 global scope 时当前 location 只作预览上下文；命令 owner、图层与属性同步切 global。
- 图层紧凑单行，右键、Delete、复制、排序、锁定、隐藏等入口调用同一动作。

### 3.3 输入与控制器

- Delete/Backspace 在非文本焦点跨 Slide/Flow/Spatial/global 工作；文字编辑时不误删元素。
- 鼠标右键、Shift+F10/Menu、工具按钮和图层菜单结果一致。
- 控制器 selection chrome、八向 resize、属性折叠和试运行使用同一配置；删除“定位控制器”。
- 声音导入/管理入口可达，不显示“暂不能管理”。

## 4. 保存、历史与错误

- 选择 location/global scope 不写 history 或 dirty。
- 新增/删除/排序/转换各自一次原子 history。
- 保存/重开后从项目重新推导 layout，结果一致。
- 命令失败显示具体原因，不吞返回值。
- V8 只在显式导入路径出现，默认保存/发布只写 V9。

## 5. 最小验证

中央集成仍不运行全量。按实际接线分组运行：

```powershell
npx vitest run tests/unit/editorStoreV9Ownership.test.ts tests/unit/multiSurfaceStoreClosure.test.ts
npx vitest run tests/unit/editorShellMultiSurface.test.tsx tests/unit/scenePanelSurfaceNav.test.tsx
npx vitest run tests/unit/workspaceCourseLocationGate.test.tsx tests/unit/rightSidebarDocumentControl.test.tsx
npx vitest run tests/unit/courseAuthoringControls.test.tsx tests/unit/editorShellCollapse.test.tsx
git diff --check -- src/renderer/App.tsx src/renderer/store/editorStore.ts src/renderer/ui/Workspace.tsx src/renderer/ui/ScenePanel.tsx src/renderer/ui/RightSidebar.tsx src/renderer/ui/TopToolbar.tsx src/renderer/styles/globals.css
```

禁止 typecheck、build、全量 test、Playwright/Electron 和 preservation visual。跨类型错误可用编辑器/单测定位，最终类型检查由 T12 统一运行。

## 6. 验收

- T02–T09B 所有 `INTEGRATION_REQUEST` 已闭合或有明确退回记录。
- 七种 surface 组合能由 store/view model 正确推导。
- UI 与修订后的四张参考图一致，尤其是全局层固定入口、Flow 层级和控制器动作。
- 无第二 App/Shell/Store、无持久化 mode、无可见 AI。
- 只可标记 `integration candidate`，不能宣称完整通过。

## 7. 交付记录

HANDOFF
- task: T10
- baseline SHA / worktree: `e2e34aa29ddb72abb2c691e414a4d8f461f35b2c` / `output/worktrees/v9-parity-reconstruction`
- outcome: 只在七个热点做中央接线。Store 用 T03 三个 blank command 与 `addCoursePage` 包一次 history；location / global scope 只改 session。左栏四态固定「共享内容 → 全局层（全课）」+ 三类新增内容，不使用 `hideSharedLayerEntries`。Workspace 按 location remount，透传 Flow 就地编辑、Spatial viewport overlay，并把 Runtime hit zone / 文字会话键 / 舞台 CSS 接到 T05。右栏挂 T04 有效图层、设计 token、声音导入与恢复教师控制器。App 用 T02 路由键盘/右键，试运行走 Published Player，保存只写 V9，V8 只走显式导入并展示 report。未新增 `projectMode`、可见 AI 或第二 App。未在热点里重写 lane 命令。
- files changed:
  - `src/renderer/App.tsx`
  - `src/renderer/store/editorStore.ts`
  - `src/renderer/ui/Workspace.tsx`
  - `src/renderer/ui/ScenePanel.tsx`
  - `src/renderer/ui/RightSidebar.tsx`
  - `src/renderer/ui/TopToolbar.tsx`
  - `src/renderer/styles/globals.css`
  - `tests/unit/editorStoreV9Ownership.test.ts`
  - `tests/unit/multiSurfaceStoreClosure.test.ts`
  - `tests/unit/scenePanelSurfaceNav.test.tsx`
  - `tests/unit/editorShellCollapse.test.tsx`（新增）
  - 本文件交付记录
- focused validation commands:
  - `npx vitest run tests/unit/editorStoreV9Ownership.test.ts tests/unit/multiSurfaceStoreClosure.test.ts`
  - `npx vitest run tests/unit/editorShellMultiSurface.test.tsx tests/unit/scenePanelSurfaceNav.test.tsx`
  - `npx vitest run tests/unit/workspaceCourseLocationGate.test.tsx tests/unit/rightSidebarDocumentControl.test.tsx`
  - `npx vitest run tests/unit/courseAuthoringControls.test.tsx tests/unit/editorShellCollapse.test.tsx`
  - `git diff --check -- src/renderer/App.tsx src/renderer/store/editorStore.ts src/renderer/ui/Workspace.tsx src/renderer/ui/ScenePanel.tsx src/renderer/ui/RightSidebar.tsx src/renderer/ui/TopToolbar.tsx src/renderer/styles/globals.css`
- results: 8 files / 39 tests passed；`git diff --check` 无输出。未跑 typecheck / build / 全量 test / E2E。未提交。
- INTEGRATION_REQUESTS:

已闭合
- T02→T10 App：`createLiveEditorSelectionSnapshot` + `interpretEditorEntry` + `routeEditorAction`；文本焦点不拦截 Ctrl+A/C/X/V/D 与 Delete；失败 `reason` 进 `setError`；Escape 只关菜单，不再清空选择。
- T02→T10 壳层：窗口 `contextmenu` / Shift+F10 / Menu 打开瞬间 `captureEditorMenuSnapshot`，`EditorContextMenu` 回传同一 snapshot。
- T02→T10 store：global / surface adapter 只转调 T05/T06/T07/T08 命令，返回 `{ ok, reason }`。
- T03→T10 store：`createBlankSlideCourse` / `createBlankFlowCourse` / `createBlankSpatialCourse`；`addCoursePage`；`deleteCourseLocation`；`reorderCoursePages`；`selectCourseLocation` / `selectGlobalLayerScope` 不写 history。`addCourseSurface` 委托 `addCoursePage`。
- T03→T10 ScenePanel：`courseStructure` 先共享内容再页面树；纯 Slide compact 缩略；Flow/Spatial/Mixed 用 T03 树；`unavailable` 安全不可用；三项新增内容始终可见。
- T04→T10 App：受控 `EditorContextMenu` + `toEditorContextMenuActions`；不把菜单写入 store。
- T04→T10 RightSidebar：有 `effectiveLayers` 时渲染 `EffectiveLayerList`。
- T04→T10 store/globals：未新增菜单 store 字段；图层/右键样式仍在 `editorActions.css`。
- T05→T10 store：Slide adapter → `executeSlideEditorAction` 并回写 clipboard；画布文字 → `createV9SlideTextEditSessionKey` / `commitV9SlideTextEdit`；全局控制器 pointerup → `commitGlobalControllerTransform`。
- T05→T10 Workspace：`createEditorGame({ fixedLogicalSize: true })`；`stageOverlayCssTransform`；`runtimeHitTargets` 映射进 `loadScene`；双击捕获文字会话键，切换 location 后陈旧提交失败。
- T06→T10 ScenePanel：四态固定全局层入口，只切 authoring owner。
- T06→T10 RightSidebar/App：`createEffectiveLayerListHandlers` / `listEffectiveLayerCommandItems`；声音导入走 `importCourseSounds`；「恢复教师控制器」；无「定位控制器」。
- T07→T10 store：`executeFlowEditorAction`；copy 后自持 `flowActionClipboard`；非锚点 list/table 插入不再要求新 location；`selectCourseFlowBlock` 用 `selectFlowEditorBlocks` 且 location 保持锚点。
- T07→T10 Workspace/ScenePanel/RightSidebar：透传 `onPatchBlock` / `onStructuralCommand`；左栏只用 T03 树，不挂 `FlowOutlinePanel`。
- T07→T10 globals：最小 `.flow-inline-editor` 宽度。
- T08→T10 store/Workspace：`executeSpatialEditorAction`；`viewportOverlays` / `onSelectViewportLayer` 不创建 world/camera；`onCommitEdit` 传入 `editText` / `editFormulaAccessibleText`。
- T09→T10 App：顶栏与当前位置试运行挂 `buildPublishedCourseStandaloneHtml`；Flow DOCX 用 `uniqueFlowDocxFilename`。
- T09A→T10 App/RightSidebar：去掉 V9 `M4-COMP` 替换短路；专业页签 Components/Automation/Developer 保持可达；属性页下挂 `DesignTokensEditor`。
- T09B→T10 App/store：`saveCourseProjectAsync`；V8 只走「导入旧版工程」并展示 report；恢复拒绝静默 V8；`resolveCloseDirtyState`；`inspectCourseProjectHealth` 并入工程检查；恢复 schedule 用 `courseProjectRecoveryRevision`。
- T09A/T09B→T10 App/store：V9 替换选择器校验同一 packageId 后调用 `replaceCourseComponentPackage`；一次 `commitCourseHistory` 写回 `project` / `componentFiles` / `packageData`。失败抛出命令的 `UserFacingError`，不再提示「缺少替换命令」。

退回
- requester: T09A / T10 → target owner: T05
  - 缺失 `addCourseRuntimeLayer`。开发工作台不造假创建入口。
- requester: T09A → target owner: T09A
  - `PropertiesTab` 的 V9 `documentControl` 仍无 designTokens 字段。T10 只在 RightSidebar 属性页下挂 `DesignTokensEditor`，不改 PropertiesTab。
- requester: T09A → target owner: T07 / T08
  - Flow / Spatial 插入入口消费 `application/x-courseware-element` 仍属各 lane 独占 UI。
- requester: T06 → target owner: T05
  - Slide 路径仍可能抛「全局层暂不能调整顺序」。排序必须走 T06 `applyEffectiveLayerReorder`，不在 store 复制第二套排序。
- requester: T06 → target owner: T06
  - 全局层 paste / 非拖放层级移动没有命令。adapter 返回具体 reason，不自造。
- requester: T04 → target owner: T04 / 各 Workspace 文件 owner
  - `FlowWorkspace.tsx` / `SpatialWorkspace.tsx` 不是 T10 独占。壳层用窗口 `contextmenu` 接到同一菜单，未在那两个文件内嵌第二份菜单 DOM。
- requester: T09B → target owner: T09B
  - `ProjectHealthPanel.tsx` 不是 T10 独占。T10 已在 App 把 `inspectCourseProjectHealth` 合并进现有工程检查结果。
- requester: T09 → target owner: T09
  - Flow host `courseProgressSource`、Spatial `suspend()` 卸 document 指针属 Player lane（T07/T08 已回派修补，T10 不改 host）。

- visual/manual evidence: 无编辑器实机截图；未对照四张 UI 参考图做像素验收。证明来自上述 39 条单测。
- remaining risks:
  - V9 公式双击仍可能落到旧 V8 `FormulaEditDialog` 路径；文字会话已走 T05 key。
  - 控制器 pointermove 预览仍用 Phaser 本地 overlay，未把每次 move 改写成 `previewGlobalControllerTransform`；pointerup 单选全局控制器已走 T06 commit。
  - 关闭脏状态的 IPC 只有 discard/cancel，没有 in-dialog save；`resolveCloseDirtyState('save')` 未接到桌面对话框。
  - `shouldMarkCourseProjectDirty` 作为策略函数未被到处调用：dirty 由 `isV9SlideVerticalSliceDirty`（history vs snapshot）推导，选择不 commit 即不 dirty。
  - T07 `executeFlowEditorAction` 未实现 paste/cut；store 自持 clipboard，粘贴失败会给具体 reason。
  - 未做真实视觉/互动复核，不能称 art candidate。
- status: integration candidate
