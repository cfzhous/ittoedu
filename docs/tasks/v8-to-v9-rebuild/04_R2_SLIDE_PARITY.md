# R2 — 同一 V8 UI 下完成 V9-backed Slide 等价候选

> 状态：`R2-Z lane_candidate`；Gate 未闭合（verified/冒烟延至 R3-Z）；默认产品真相仍是 V8
> 默认产品真相：仍是 V8
> 阶段原则：并行 lane 只产出窄内核；R2-Z 当阶段立即接入真实 V8 UI，不把接线积压到最终阶段

## 1. 阶段可见结果

通过内部测试/开发注入选择 V9 candidate backend 时，教师看到的仍是同一套 V8 App、Workspace、ScenePanel、RightSidebar、Media/Components/Automation 界面；Slide 的 scene/state、选择、变换、文字、公式、媒体、组件、Runtime、动画、互动、图层、属性、剪贴板、Delete、history、保存和 Player 与 V8 行为等价。

R2 结束仍不得切换默认 backend；global/surface、声音和控制器必须等 R3 完成。

## 2. 任务与依赖

| ID | 任务 | 独占写入 | 可并行 | 依赖 |
|---|---|---|---|---|
| R2-A | Slide domain、scene/state、selection/history 基础 | `src/renderer/course/v9SlideVerticalSlice.ts`、`slideEditorCommands.ts`、`slideEditorView.ts` | 否 | R1-Z |
| R2-SEAM | 在 V8 store/App 下建立最薄 Slide backend 接缝 | App/store 与一个窄 backend port；默认仍是 V8 | 否 | R2-A |
| R2-B | 画布命中、选择、变换与 viewport bridge | `workspaceSlideAuthoring.ts`、`stageViewportTransform.ts`、必要 Phaser bridge | R2-C/D/E | R2-SEAM |
| R2-C | 文字、公式、IME 与选区级格式事务 | 新的 V9 content edit bridge、Text/Formula 窄组件与测试 | R2-B/D/E | R2-SEAM |
| R2-D | 图片/视频/Component/Runtime/动画内容适配 | 新的 Slide content commands/adapters 与测试 | R2-B/C/E | R2-SEAM |
| R2-E | scene 图层、动作路由、剪贴板、Delete、互动 | scene-only action/layer/clipboard/interaction 模块与测试 | R2-B/C/D | R2-SEAM |
| R2-Z | 中央接入 V8 App/store/Workspace/sidebars | 本阶段中央热点 | 否 | R2-B/C/D/E |

并行 B–E 不得依赖彼此尚未导出的未来符号。公共输入只使用 R2-A 已冻结的 snapshot、command result、target token 与 history 接口。

## 3. R2-A — Slide domain 基础

### 3.1 独占路径

- `src/renderer/course/v9SlideVerticalSlice.ts`
- `src/renderer/course/slideEditorCommands.ts`
- `src/renderer/course/slideEditorView.ts`
- 对应最多两个测试

### 3.2 冻结接口

必须先定义并在 HANDOFF 写清：

- `SlideAuthoringSnapshot`：session/location/surface/scene/state/scope/selection/revision；
- `SlideAuthoringTarget`：稳定 `authoringAddress`；
- `SlideCommandResult`：`ok/reason/nextSession/historyEntry/selection`；
- scene/state 激活、新增、复制、重命名、排序、删除；
- 一次 command 只产生一次 revision/history；
- locked、stale revision、错误 owner 的统一拒绝语义。

### 3.3 必须闭合

- 当前 Slide surface 新增 scene，不创建隐藏 surface，不影响其他 location；
- base state 与命名状态 override 语义正确；
- scene/state/scope 切换终止旧编辑会话并清空陈旧 selection；
- selection 和命令只操作 V9，不从 V8 project 或 Player 反建；
- global/surface owner 在本任务只可读取/保留，不擅自实现。

### 3.4 最轻量验证

```powershell
npx vitest run tests/unit/v9SlideDomain.test.ts
git diff --check -- src/renderer/course/v9SlideVerticalSlice.ts src/renderer/course/slideEditorCommands.ts src/renderer/course/slideEditorView.ts tests/unit/v9SlideDomain.test.ts
```

`v9SlideDomain.test.ts` 由本任务新建，从 donor 大测试中只摘 scene/state/selection/history 的最小断言。测试记录必须注明使用 V9 fixture，只证明 domain，不证明真实 Workspace。

## 4. R2-SEAM — 最薄 backend 接缝

### 4.1 独占热点

- `src/renderer/store/editorStore.ts`
- `src/renderer/App.tsx`
- 可新增一个窄的 `src/renderer/store/slideBackendPort.ts`
- 只有确实无法建立 seam 时才触及 `Workspace.tsx`
- `tests/unit/v9SlideBackendSelection.test.ts`

### 4.2 必须闭合

- 保持现有 V8 selector/action 形状和默认行为；
- 只为 Slide authoring 定义读取 snapshot、执行 command、保存 candidate 的最小 port，不建通用 backend framework；
- V9 candidate 只能由测试/开发注入启用，不出现用户可见切换、第二 App 或第二侧栏；
- 一个会话只持有一个 backend，不双写；
- 未实现能力继续使用默认 V8 产品路径，不在 candidate UI 放 no-op；
- 为 R2-B/C/D/E 冻结输入/输出和集成请求目标。

### 4.3 最轻量验证

```powershell
npx vitest run tests/unit/v9SlideBackendSelection.test.ts
git diff --check -- src/renderer/store/editorStore.ts src/renderer/store/slideBackendPort.ts src/renderer/App.tsx tests/unit/v9SlideBackendSelection.test.ts
```

测试只证明 backend 互斥和默认 V8，不证明任何 V9 UI 能力。

## 5. R2-B — 命中、选择、变换与 viewport

### 5.1 独占路径

- `src/renderer/ui/workspaceSlideAuthoring.ts`（可由任务新增）
- `src/renderer/authoring/stageViewportTransform.ts`
- `src/renderer/phaser/EditorPhaserBridge.ts`
- `src/renderer/phaser/EditorScene.ts`
- 必要且窄的 Phaser adapter/测试

不修改 `Workspace.tsx`。

### 5.2 必须闭合

- 单选、多选、框选、图层选择使用同一稳定目标；
- 对象、选择框、旋转柄、八向手柄共用 stage/viewport transform；
- zoom/pan 后几何一致，pointermove 预览、pointerup 单次提交；
- 西/北方向 resize 正确移动原点，不只支持右/下；
- 图片、视频、Component、Runtime 普通可替换内容可命中；
- locked item 可选看，不可写。

### 5.3 最轻量验证

```powershell
npx vitest run tests/unit/v9SlideViewportAdapter.test.ts tests/unit/stageViewportTransform.test.ts
git diff --check -- src/renderer/ui/workspaceSlideAuthoring.ts src/renderer/authoring/stageViewportTransform.ts src/renderer/phaser tests/unit/v9SlideViewportAdapter.test.ts tests/unit/stageViewportTransform.test.ts
```

## 6. R2-C — 文字、公式、IME 与局部格式

### 6.1 独占路径

- 新建 `src/renderer/authoring/v9SlideContentEdit.ts` 或当前最窄等价模块
- `src/renderer/ui/CanvasPlainTextEditor.tsx`、`TextEditOverlay.tsx`、Formula 编辑组件，仅在复用需要时修改
- 对应最多两个测试

不修改 Workspace、PropertiesTab、editorStore。

### 6.2 必须闭合

- 双击文字/公式以 `authoringAddress + revision + generation` 开会话；
- IME composing 不被 Enter/blur 提前提交；
- Enter/Ctrl+Enter/blur/Escape 和外部 selection 切换有明确 commit/cancel；
- 画布与属性面板最终写同一 V9 text/runs/ast 字段；
- 选区级粗体、斜体、颜色等局部格式真实改变 runs，不退化成整段；
- scene/state/scope 切换拒绝陈旧回调；
- 竖排、自适应宽度、公式入口等 V8 行为不丢失。

### 6.3 最轻量验证

```powershell
npx vitest run tests/unit/v9SlideTextTransaction.test.ts tests/unit/textRuns.test.ts
git diff --check -- src/renderer/authoring src/renderer/ui/CanvasPlainTextEditor.tsx src/renderer/ui/TextEditOverlay.tsx src/renderer/ui/FormulaAuthoringEditor.tsx src/renderer/ui/FormulaEditDialog.tsx tests/unit/v9SlideTextTransaction.test.ts tests/unit/textRuns.test.ts
```

## 7. R2-D — 媒体、组件、Runtime 与动画

### 7.1 独占路径

- 新建或迁入的 `src/renderer/course/v9SlideContentCommands.ts`
- Slide 专用 media/component/runtime/animation adapter，不修改通用 UI 热点
- `src/renderer/phaser/elementAnimationPreviewBus.ts` 仅在必要时
- 对应最多两个测试

### 7.2 必须闭合

- 连续插入新元素沿用 V8 自动错开合同；
- 图片/视频加入 scene 后可命中、选择、替换、裁剪/适配并改属性；
- Component package/instance 的 props、variant、preset、nested content 保留；
- Runtime authoring target 与 asset 引用稳定；
- 简单出现动画与专业自动化数据均可读写、预览、保存和发布；
- 不从 Player/Phaser proxy 反建项目，不发明第二媒体库或组件面板。

### 7.3 最轻量验证

```powershell
npx vitest run tests/unit/v9SlideContentCommands.test.ts tests/unit/nodeAdapterAnimation.test.ts
git diff --check -- src/renderer/course/v9SlideContentCommands.ts src/renderer/phaser/elementAnimationPreviewBus.ts tests/unit/v9SlideContentCommands.test.ts tests/unit/nodeAdapterAnimation.test.ts
```

若文件名不同，最多选择一个内容命令测试和一个 V8 动画保护测试。

## 8. R2-E — 图层、动作、剪贴板、Delete 与互动

### 8.1 独占路径

- `src/renderer/course/v9SlideActionCommands.ts`
- `src/renderer/course/v9SlideClipboard.ts`
- `src/renderer/course/slideInteractionCommands.ts`、`slideInteractionView.ts`
- 对应最多两个测试

不得修改 NodesTab、App、store、Workspace 或 global/surface commands。

### 8.2 必须闭合

- scene/state scope 内的选择、拖排、上/下移、置顶/置底、锁定、隐藏、复制、删除；
- 全选、copy/cut/paste/duplicate 生成新稳定 ID 并重写内部引用；
- 多选动作原子提交；文字/公式/contenteditable 焦点中 Delete 不误删；
- 右键、键盘和工具栏最终调用同一 action ID 与 command；
- 互动引用在复制/删除后保持一致或给出阻止原因；
- global/surface 交给 R3，不返回“成功但未操作”。

### 8.3 最轻量验证

```powershell
npx vitest run tests/unit/v9SlideActionCommands.test.ts tests/unit/editorActionRouting.test.ts
git diff --check -- src/renderer/course tests/unit/v9SlideActionCommands.test.ts tests/unit/editorActionRouting.test.ts
```

## 9. R2-Z — 当阶段中央 UI 接线

### 9.1 独占热点

本任务串行独占：

- `src/renderer/App.tsx`
- `src/renderer/store/editorStore.ts`
- `src/renderer/ui/Workspace.tsx`
- `ScenePanel.tsx`、`RightSidebar.tsx`、`NodesTab.tsx`、`PropertiesTab.tsx`、`ElementsTab.tsx`
- `src/renderer/styles/globals.css`（仅确有必要）

MediaTab、global/controller 完整接线留给 R3；不得建立 `CourseStudioApp` 或用户可见 backend 切换。

### 9.2 接线顺序

1. 审查并关闭 R2-B/C/D/E 的 `INTEGRATION_REQUEST`；blocking 请求不能以“退回”视为关闭。
2. 用内部测试/开发注入让同一 V8 store selector/action 形状读取 V9 Slide candidate；一次会话只选一个 backend。
3. ScenePanel、Workspace、Nodes、Properties、Elements、快捷键和右键共享同一 snapshot/target/action。
4. 画布双击与属性局部格式写同一事务；元素连续插入错开。
5. scene/state/history、保存重开、Player preview 使用 R1/R2 接口；不得双写 V8/V9。
6. 默认用户入口仍选择 V8 backend，V9 candidate 只在内部注入可达。

### 9.3 最轻量验证

选择最能覆盖实际接线的两个测试，优先：

```powershell
npx vitest run tests/unit/v9SlideProductIntegration.test.tsx tests/unit/continuousInsertionUi.test.tsx
git diff --check -- src/renderer/App.tsx src/renderer/store/editorStore.ts src/renderer/ui src/renderer/styles/globals.css
```

随后只做一次真实 V9 candidate UI 冒烟：新增两个元素确认错开 → 双击文字并做选区粗体 → 拖动/西向缩放 → Undo/Redo → 保存/重开 candidate。记录入口、backend 和不能证明的 global/audio/controller 范围。

## 10. R2 Gate

必须成立：

- R2-B/C/D/E 所有 blocking 请求均为 `integrated + verified`；
- V9 candidate 使用真实 V8 UI，不是平行 controlled UI；
- 根计划 §0.4 第 5、6 点在 candidate 的相关部分通过；
- scene/state、选择/history、文字、内容、图层动作不依赖隐藏 V8 project 写入；
- 默认 backend 仍是 V8；
- 未运行全量 typecheck/build/E2E/visual。

通过后只将 R3-A/B/C/D 设为 `READY`。
