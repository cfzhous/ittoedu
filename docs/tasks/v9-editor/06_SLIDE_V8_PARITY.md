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

尚未执行。
