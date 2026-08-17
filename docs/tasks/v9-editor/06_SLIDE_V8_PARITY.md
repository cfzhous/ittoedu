# T05 — Slide 编辑表面对齐 V8

> Wave：2，可与 T06–T09 并行
> 依赖：T02 动作合同、T03 创建/布局合同、T04 UI 原语
> 排除：全局层/教师控制台/声音由 T06；中央接线由 T10

## 1. 可见结果

默认 V9 Slide 路径具备不低于 V8 的高频编辑能力：场景与状态、单选/多选/框选、拖动、八向缩放、旋转、方向键、缩放/平移、Delete、剪贴板、画布文字/公式编辑、媒体替换、锁定约束和可靠 history。

## 2. 独占文件

- `src/renderer/course/v9SlideVerticalSlice.ts`
- `src/renderer/course/slideEditorCommands.ts`
- `src/renderer/course/slideEditorView.ts`
- `src/renderer/ui/workspaceSlideAuthoring.ts`
- `src/renderer/authoring/stageViewportTransform.ts`
- `src/renderer/phaser/**`
- 上述模块直接对应的 Slide/Phaser 单测

不修改 `Workspace.tsx`、App/store、NodesTab、PropertiesTab、ScenePanel、全局 CSS、Player 或 T09B 独占的项目/资源事务。T08 若需要 viewport 合同变化，双方以 T05 为文件 owner，通过消息/交付记录协调；媒体资产底层变更提交给 T09B。

## 3. 必须闭合

### 3.1 场景与画面状态

- scene 新增、复制、重命名、排序、删除；不可破坏最后 location。
- 基础画面与命名状态 override 语义保持 V9；新增/删除/恢复覆盖只产生一次 history。
- scene/state 切换结束当前合法编辑事务，不提交陈旧回调。

### 3.2 选择与变换

- 单选、多选、框选和图层选择使用同一稳定地址。
- 对象、选择框与八向手柄共享 viewport transform；缩放/平移后仍对齐。
- resize 的视觉方向与数据方向一致，pointermove 实时，pointerup 单次提交。
- 旋转、方向键微调、Shift 加速、锁定拒绝和撤销/重做可复现。

### 3.3 Delete 与剪贴板

- 接入 T02 adapter：多选原子删除；命名状态对继承项执行当前状态隐藏，本状态新增项结构删除。
- 输入框、contenteditable、文字/公式编辑会话中不误删元素。
- copy/cut/paste/duplicate 生成新稳定 ID，并清理或改写层级/互动引用。

### 3.4 文字、公式与媒体

- 修复“画布双击编辑，离开后内容失效”：提交目标基于稳定 `authoringAddress` 与 revision，不依赖临时投影对象。
- 画布与属性栏写同一 V9 字段；IME、blur/Enter/Ctrl+Enter、取消和外部 selection 变化有明确边界。
- 保留富文本、竖排、自适应宽度、缩放下编辑和公式双击入口。
- 图片/视频/组件/Runtime 的普通可替换内容保持可命中；媒体专属写操作通过命令，不从 Player 反建项目。

## 4. 明确不做

- 不实现教师控制台或 global/surface authoring UI。
- 不修改 V8 contract/baseline 来适配回归。
- 不重建第二 Workspace 或从 Phaser proxy 保存工程。
- 不扩张 Focusky 级时间线/镜头能力。

## 5. 最小验证

最多运行以下四组中的相关文件，不扩大为全量：

```powershell
npx vitest run tests/unit/v9SlideVerticalSlice.test.ts tests/unit/slideEditorCommands.test.ts
npx vitest run tests/unit/workspaceSlideAuthoring.test.ts tests/unit/stageViewportTransform.test.ts
npx vitest run tests/unit/v9SlideLayerRegression.test.ts tests/unit/workspaceNodeTransformCompletion.test.ts
npx vitest run tests/unit/formulaEditorBridge.test.ts tests/unit/textRuns.test.ts
git diff --check -- src/renderer/course/v9SlideVerticalSlice.ts src/renderer/course/slideEditorCommands.ts src/renderer/course/slideEditorView.ts src/renderer/ui/workspaceSlideAuthoring.ts src/renderer/authoring/stageViewportTransform.ts src/renderer/phaser
```

每个子改动只跑最相关的一组；lane 收尾最多合并跑上述已触及组。禁止 typecheck、build、全量 test/E2E/visual。

## 6. 验收与交付

- 双击文字 → 编辑 → 点击空白 → 再选中，内存投影仍一致；保存/Player 接线由 T10/T09 最终闭合。
- Delete、复制、变换和锁定均通过同一 command/history。
- 控制器/右栏/ScenePanel/快捷键接线以 `INTEGRATION_REQUEST` 提交。
- 状态只能报 `engineering candidate`。

## 7. 交付记录

HANDOFF
- task: T05
- baseline SHA / worktree: `e2e34aa29ddb72abb2c691e414a4d8f461f35b2c` / `output/worktrees/v9-parity-reconstruction`
- outcome: 在现有 `deleteV9SlideLayer` / `duplicateV9SlideLayer` / `updateV9SlideNativeNode` 上扩展，未重写整文件。Slide surface 现提供 `executeSlideEditorAction` 给 T10 adapter：多选一次 history；命名态继承项隐藏、本态新建项结构删除；`snapshot.focus` 为文字/公式会话时拒绝删/剪/重复；copy/cut/paste/duplicate 生成新稳定 ID 并改写互动引用。画布文字提交键是 `authoringAddress + revision + generation`，scene/state/scope 切换结束事务并拒绝陈旧回调。对象、选择框、八向手柄共用 `stageSelectionOverlayGeometry`；Runtime 以 `runtimeHitTargets` 可命中，不写入 SceneNode 列表。未实现教师控制台/global UI，未改 V8 contract/baseline，未建第二 Workspace。
- files changed:
  - `src/renderer/course/v9SlideVerticalSlice.ts`（delete/duplicate 扩展、clipboard、text session、`executeSlideEditorAction`、runtime hit targets）
  - `src/renderer/ui/workspaceSlideAuthoring.ts`（authoringAddress/revision 会话与 IME/blur/Enter 边界）
  - `src/renderer/authoring/stageViewportTransform.ts`（共享 overlay/resize 几何）
  - `src/renderer/phaser/EditorPhaserBridge.ts`、`src/renderer/phaser/EditorScene.ts`（可选 Runtime hit zones）
  - `tests/unit/v9SlideVerticalSlice.test.ts`、`tests/unit/v9SlideLayerRegression.test.ts`、`tests/unit/workspaceSlideAuthoring.test.ts`、`tests/unit/stageViewportTransform.test.ts`
  - 本文件交付记录
  - 未改 `slideEditorCommands.ts` / `slideEditorView.ts`（现有选择/变换合同已够用）
- focused validation commands:
  - `npx vitest run tests/unit/v9SlideVerticalSlice.test.ts tests/unit/slideEditorCommands.test.ts`
  - `npx vitest run tests/unit/workspaceSlideAuthoring.test.ts tests/unit/stageViewportTransform.test.ts`
  - `npx vitest run tests/unit/v9SlideLayerRegression.test.ts tests/unit/workspaceNodeTransformCompletion.test.ts`
  - `npx vitest run tests/unit/formulaEditorBridge.test.ts tests/unit/textRuns.test.ts`
  - `git diff --check -- src/renderer/course/v9SlideVerticalSlice.ts src/renderer/course/slideEditorCommands.ts src/renderer/course/slideEditorView.ts src/renderer/ui/workspaceSlideAuthoring.ts src/renderer/authoring/stageViewportTransform.ts src/renderer/phaser`
- results: 上述已触及组全部通过（slice+commands 40；workspace+viewport 40；layer regression + transform completion 含在 40/9 中分跑；formula+textRuns 9）。`git diff --check` 无输出。未跑 typecheck / build / 全量 test / E2E。中间一次 slice 套件曾被 T07 正在写入的 `flowEditorCommands.ts`/`flowEditorSlice.ts` 首行缺 `i` 挡住，待其恢复后复跑通过。
- INTEGRATION_REQUESTS:

INTEGRATION_REQUEST
- requester: T05
- target owner: T10
- target file: `src/renderer/store/editorStore.ts`
- exported symbol / callback: `executeSlideEditorAction`、`SlideEditorActionContext`、`V9SlideClipboardPayload`
- required behavior: Slide surface adapter 只转调 `executeSlideEditorAction(actionId, snapshot, { session: courseSession, clipboard, now })`，用返回的 `{ ok, reason, session, clipboard }` 写回 store。一次调用必须是一个 history step。`clipboard` 由 store 持有并填入下一 snapshot 的 `constraints.clipboardAvailable`。`owner === 'global'` 不要进这个 adapter。失败 `reason` 必须 `setStatus`。
- focused test that proves the lane side: `tests/unit/v9SlideVerticalSlice.test.ts`（多选一次 revision；文字会话拒绝 delete；paste 新 ID）
- risk if omitted: 键盘/右键仍停在 e2e34aa 单选 Delete，剪贴板不可达。

INTEGRATION_REQUEST
- requester: T05
- target owner: T10
- target file: `src/renderer/ui/Workspace.tsx`
- exported symbol / callback: `createV9SlideTextEditSessionKey`、`commitV9SlideTextEdit`、`commitV9SlideFormulaEdit`、`beginWorkspaceTextEditSession`、`resolveWorkspaceTextEditBoundary`、`v9SlideAuthoringGeneration`
- required behavior: 双击文字/公式用 `authoringAddress + revision + generation` 开会话，不要用临时投影对象身份。IME composing 忽略提交键；blur/Enter/Ctrl+Enter 走 commit；Escape 与外部 selection 走 cancel。scene/state/scope 切换后陈旧回调必须丢弃。画布与属性栏都写 `updateV9SlideNativeNode` 的同一 V9 字段（text+runs / ast+accessibleText）。
- focused test that proves the lane side: `tests/unit/v9SlideVerticalSlice.test.ts`（address+revision 提交；切换后拒绝）；`tests/unit/workspaceSlideAuthoring.test.ts`（IME/blur/Enter 边界）
- risk if omitted: 继续出现“双击编辑后点击空白内容丢失”。

INTEGRATION_REQUEST
- requester: T05
- target owner: T10
- target file: `src/renderer/ui/Workspace.tsx`
- exported symbol / callback: `stageOverlayCssTransform`、`stageSelectionOverlayGeometry`、`resizeWorldFrameFromHandle`、`createEditorGame({ fixedLogicalSize: true })`、`EditorPhaserBridge.loadScene(document, components, hitTargets)`
- required behavior: Player 画布与 Phaser overlay 使用同一个 `createStageViewportTransform` 的 CSS/世界变换。对象、选择框、八向手柄都走 `stageSelectionOverlayGeometry`。pointermove 用 preview，pointerup 只调一次 `transformV9SlideVerticalSlice`。把 `buildV9SlideWorkspaceSnapshot(session).runtimeHitTargets` 映射为 `{ nodeId: layerItemId, ... }` 传给 `loadScene`，使 Runtime 可命中；图片/视频/组件已在 document.nodes 中。媒体替换走 `replaceV9SlideMedia` / `updateV9SlideRuntimeAsset`，不要从 Player 反建项目。
- focused test that proves the lane side: `tests/unit/stageViewportTransform.test.ts`（西向 resize 原点左移、宽增加）
- risk if omitted: 缩放/平移后手柄错位，Runtime 不可点，resize 视觉与数据反向。

INTEGRATION_REQUEST
- requester: T05
- target owner: T10
- target file: `src/renderer/App.tsx`、`src/renderer/ui/ScenePanel.tsx`、`src/renderer/ui/RightSidebar.tsx`、`src/renderer/ui/TopToolbar.tsx`
- exported symbol / callback: `activateV9SlideScene`、`activateV9SlidePresentationState`、`executeSlideEditorAction`、`v9SlideLayerAuthoringAddress`
- required behavior: 场景/状态切换必须调用 T05 activate 命令（会 bump generation 并清空选择）。图层选择、画布选择、属性目标使用同一 `authoringAddress`（`v9SlideLayerAuthoringAddress` 或 T02 snapshot 里的地址）。Delete/Ctrl+C/X/V/D 经 T02 `routeEditorAction` 到达 Slide adapter。属性栏文字提交与画布共用 `updateV9SlideNativeNode`。
- focused test that proves the lane side: `tests/unit/v9SlideVerticalSlice.test.ts`（scene 切换后陈旧文字提交失败）
- risk if omitted: 控制器/右栏/ScenePanel/快捷键与画布选择分叉，切换后仍提交旧文字。

- visual/manual evidence: 无 UI 热点改动；未启动编辑器。
- remaining risks: clipboard 与 authoring generation 不在 `V9SlideVerticalSliceState` 内，T10 必须分别持有 clipboard、并在构造文字会话时读取 `v9SlideAuthoringGeneration(sessionId)`。`replace-media` adapter 只返回“请选择素材后替换”，真正写操作要 T10 打开素材后再调 `replaceV9SlideMedia`。全局层删除/复制仍属 T06。T10 未接线前产品入口仍是 e2e34aa 退化路径。
- status: engineering candidate
