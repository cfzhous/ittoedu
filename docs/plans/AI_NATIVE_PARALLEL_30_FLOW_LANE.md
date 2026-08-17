# FLOW lane：Flow 就地文本与轻量结构编辑

> LANE_ID: FLOW
> OWNER_SCOPE: P4
> START_BASELINE: P2-G
> EXECUTION_ORDER: C1 -> C2 -> C-G
> TEST_POLICY: 每包只跑 1–3 个精确 Vitest 文件；不跑 typecheck/build/E2E/全量测试
> APP_POLICY: 本 lane 不直接修改 `App.tsx` 或 `Workspace.tsx`；接线交给最终集成

执行 AI 开始前必须先读 [并行执行索引](AI_NATIVE_PARALLEL_00_INDEX.md) 与 [共享合同](AI_NATIVE_PARALLEL_05_SHARED_CONTRACT.md)。本 lane 的目标是让教师直接在 Flow 正文中修改高频文字，并让现有结构操作不干扰文字输入。它不建设富文本编辑器、Word 排版能力或新的文档模型。

## 1. 文件归属

### 独占生产文件

- `src/renderer/ui/FlowWorkspace.tsx`
- `src/renderer/ui/FlowOutlinePanel.tsx`
- `src/renderer/ui/FlowPropertiesTab.tsx`

### 允许修改的测试

- `tests/unit/flowWorkspace.test.tsx`
- `tests/unit/flowStructuralEntry.test.tsx`

### 只读参考

- `src/renderer/App.tsx`：只定位 `v9FlowAuthoring` 和现有 `updateCourseFlowBlock` / `applyCourseFlowStructuralCommand` 接线点
- `src/renderer/ui/Workspace.tsx`：只定位 `WorkspaceFlowAuthoringInput` 和 `<FlowWorkspace>` 透传点
- `src/renderer/course/flowEditorView.ts`
- `src/renderer/store/editorStore.ts`
- `tests/unit/flowEditorCommands.test.ts`
- `tests/unit/flowUnifiedLayerEntry.test.tsx`

### 禁止修改

- `src/renderer/App.tsx`
- `src/renderer/ui/Workspace.tsx`
- Store、Schema、Course Project 类型、history、IPC、Player、export、全局样式
- 其他 lane 的生产文件和测试

如实现必须改禁止文件，提交 `INTEGRATION_REQUEST` 后停止该部分；不得自行越界。

## 2. 共用实现合同

1. Course Project V9 Flow block 是唯一内容真相；不得保存编辑专用副本。
2. 编辑期间仅在 React 组件内保存 `{ target, original, draft, composing }`；不得写 Store、工程或持久化状态。
3. 一次 blur 或 `Ctrl+Enter` 最多调用一次正式 callback；由最终 App adapter 把这一次 callback 映射为一次 Store 命令，因此一次提交只能产生一次 history 和一次 revision。
4. `Escape` 恢复原文并退出；随后发生的 blur 不得再次提交。内容完全未变化时不得调用 callback。
5. `compositionstart` 到 `compositionend` 期间，Enter、Escape、Delete、Backspace、`Ctrl/Cmd+D` 和 `Alt+Arrow` 都不得提交、取消或触发结构命令。
6. `readOnly` 或外部 `editingUnavailableReason` 存在时不得进入编辑。当前 FlowBlock Schema 没有 block-level `locked`，不得为了“锁定”新增字段；未来若上游有锁定信息，只通过现有只读/不可用输入表达。
7. 不引入 `contentEditable` 框架、富文本依赖、Markdown parser、通用 command bus、第二 history 或隐藏 textarea 状态机。
8. 表格单元格、公式、媒体、组件、代码和复杂 callout 不纳入本 lane。

## 3. TASK_ID: C1 — heading / paragraph 就地文本

> STATUS: READY
> DEPENDS_ON: P2-G
> PARALLELISM: 可与 LAYOUT、AI-BOUNDARY、RELEASE 并行；本任务内部串行

### 可见结果

教师双击 heading/paragraph，或先选中后按 Enter，即可在原正文位置编辑；blur 或 `Ctrl+Enter` 提交，Escape 取消。

### 允许文件

- `src/renderer/ui/FlowWorkspace.tsx`
- `tests/unit/flowWorkspace.test.tsx`

### 禁止文件

- 本 lane 其余文件暂不修改
- `App.tsx`、`Workspace.tsx` 及 §1 的全部禁止文件

### 实施步骤

1. 先在 `flowWorkspace.test.tsx` 增加最小交互断言，再实现。
2. 在 `FlowWorkspaceProps` 增加窄 callback，推荐形状为：

   ```ts
   readonly onPatchBlock?: (
     blockId: string,
     patch: { type?: 'heading' | 'paragraph' | 'quote'; text?: string },
   ) => void
   readonly editingUnavailableReason?: string
   ```

   若复用 `FlowPropertiesTab` 已有 `FlowBlockPatch`，只能 type-only import，不得复制一份范围更大的 patch 协议。
3. 在 `FlowWorkspace` 内维护单一编辑目标。目标至少包含 `blockId` 与 `field: 'text'`；切换到另一块前，先按同一 commit 规则结束当前 draft。
4. heading 仍保持 H1–H6 语义，paragraph 仍保持 P 语义。编辑控件必须有稳定的 `data-flow-inline-editor` 与可访问名称，不能把整篇 Flow 变成一个可编辑区域。
5. 实现双击、选中后 Enter、blur、`Ctrl/Cmd+Enter`、Escape 和 composition 防护。普通 Enter 在 multiline draft 中只换行；不得触发块移动或提交。
6. 提交时比较原始文本与 draft；相同则只退出。不同则恰好调用一次 `onPatchBlock(blockId, { type, text: draft })`。
7. `readOnly`/不可用时保留普通选择与阅读，不呈现可输入控件；需要提示时只使用教师可读文字，不显示内部状态词。
8. 不在本任务接 App。按 §7 生成一条精确接线请求。

### 必须断言

- heading 与 paragraph 两条入口都能进入编辑。
- composition 期间 Enter/Escape 不提交；composition 结束后的 `Ctrl+Enter` 仅提交一次。
- blur 只提交一次；Escape、未变化、readOnly 分别提交零次。
- callback 只包含当前 block ID 与文字 patch，不改变 ID、父级、顺序或其他字段。

### 最小验证

只运行：

```powershell
npx vitest run tests/unit/flowWorkspace.test.tsx
git diff --check -- src/renderer/ui/FlowWorkspace.tsx tests/unit/flowWorkspace.test.tsx
```

禁止补跑 typecheck、build、Playwright、compat 或任意全量命令。

### 验收

- 上述断言和最小验证通过。
- `App.tsx` / `Workspace.tsx` 未被修改。
- 结果只能标记为本包 `engineering candidate`；正式 App 尚未接线。

### 停止条件

- 需要改 Flow 数据结构、Store/history 或新增依赖。
- 无法在不碰 `App.tsx` / `Workspace.tsx` 的情况下产出稳定 props。
- 同一跨模块原因导致定向测试连续失败三次。

## 4. TASK_ID: C2 — quote / list item 与结构操作收敛

> STATUS: DONE
> DEPENDS_ON: C1
> UNBLOCK_WHEN: C1 最小验证通过且 props 合同稳定

### 可见结果

quote 正文和单个 list item 沿用 C1 的就地编辑语义；删除、复制、移动和层级操作只在选中上下文出现，且不会在文字编辑或输入法期间误触发。

### 允许文件

- `src/renderer/ui/FlowWorkspace.tsx`
- `src/renderer/ui/FlowOutlinePanel.tsx`
- `src/renderer/ui/FlowPropertiesTab.tsx`
- `tests/unit/flowWorkspace.test.tsx`
- `tests/unit/flowStructuralEntry.test.tsx`

### 禁止文件

- `App.tsx`、`Workspace.tsx` 及 §1 的全部禁止文件

### 实施步骤

1. 扩展 C1 编辑目标以支持：
   - quote 的 `text`，通过一次 `onPatchBlock` 提交；citation 继续留在右栏。
   - list 的某个稳定 `item.id`，通过一次 `onStructuralCommand({ blockId, kind: 'list.editItem', itemId, text })` 提交。
2. 在 `FlowWorkspaceProps` 增加或复用窄 `onStructuralCommand`；类型必须复用 `FlowPropertiesTab` 的现有 `FlowStructuralCommand`，不得另造结构协议。
3. list 编辑始终按 `item.id` 定位，不按临时数组 index；编辑后 block ID、item ID、父级和顺序不变。
4. Workspace 根级结构快捷键在以下任一条件成立时立即退出：存在 active edit target、`event.isComposing`、内部 composing ref 为真、事件来自 input/textarea/select 或 contenteditable。
5. 保留现有选中块工具条和 Outline 选中项工具条；不要新增常驻大型工具条。按钮调用一次现有 callback，错误父级移动继续由模型层安全拒绝。
6. 为 `FlowPropertiesTab` 增加窄 `inlineTextEditing`（或等价）输入：开启后 heading/paragraph/quote 正文/list item 的重复文字输入改为“请在正文中就地编辑”的轻提示；heading level、quote citation、list ordered、表格/媒体/公式/组件等非就地属性继续保留。
7. 本任务不实现表格单元格、section 标题、callout body、代码或富文本编辑。
8. 不在本任务接 App/Workspace；更新 §7 的接线请求，使两个 callback 和不可用状态一次性透传。

### 必须断言

- quote 和两个不同 list item 按稳定 ID 提交到正确目标，各提交一次。
- composition 和 active edit 状态下 Delete/Backspace、`Ctrl/Cmd+D`、`Alt+Arrow` 均不调用结构 callback。
- 非编辑状态下既有删除/复制/移动快捷键和选中工具条仍工作。
- `FlowPropertiesTab inlineTextEditing` 开启后不再出现重复正文输入，但 citation/level/ordered 等仍可用。
- readOnly 下文字和结构 callback 均为零次。

### 最小验证

只运行：

```powershell
npx vitest run tests/unit/flowWorkspace.test.tsx tests/unit/flowStructuralEntry.test.tsx
git diff --check -- src/renderer/ui/FlowWorkspace.tsx src/renderer/ui/FlowOutlinePanel.tsx src/renderer/ui/FlowPropertiesTab.tsx tests/unit/flowWorkspace.test.tsx tests/unit/flowStructuralEntry.test.tsx
```

### 验收

- 两个精确测试文件通过。
- 未新增持久化 draft、Schema、依赖或常驻大工具条。
- App 未接线前只称 FLOW lane `engineering candidate`。

### 停止条件

- 需要修改结构命令语义、Store、Schema 或全局 CSS 才能成立。
- 需要将表格/代码/公式升级为富编辑才能通过验收。
- 定向失败属于其他 lane 文件。

## 5. TASK_ID: C-G — lane 自检与交付

> STATUS: BLOCKED
> DEPENDS_ON: C2

本包不增加功能、不运行新测试。检查 C1/C2 的最后一次最小测试结果与 diff，确认：

- 只有允许文件被修改。
- 每次文字或结构提交只有一个上游 callback。
- composition、Escape、未变化、readOnly 的零提交语义都有断言。
- 未运行 typecheck/build/E2E/全量测试。
- 已生成下面的最终集成请求。

## 6. 最终集成的窄 App adapter 合同

FLOW 执行 AI 不实现本节，只把它交给 `I1`。最终集成应一次性完成：

1. `WorkspaceFlowAuthoringInput` 增加 `onPatchBlock`、`onStructuralCommand`、`editingUnavailableReason`（或最终稳定的等价字段）。
2. `Workspace.tsx` 只把这些字段与 `interactionDisabled` 透传给 `FlowWorkspace`；不在 Workspace 新建业务状态。
3. `App.tsx` 的 `v9FlowAuthoring`：
   - `onPatchBlock` 通过现有 `runCourseCommand` 恰好调用一次 `updateCourseFlowBlock`。
   - `onStructuralCommand` 通过现有 `runCourseCommand` 恰好调用一次 `applyCourseFlowStructuralCommand`。
   - lifecycle busy/readOnly 只作为不可用输入，不持久化。
4. 右栏的 `FlowPropertiesTab` 在正式 Flow 就地编辑可达时开启 `inlineTextEditing`，不删除复杂属性入口。

不得新增第二 adapter、第二 Store action、批处理、AI 入口或 history 包装。

## 7. 每包交付格式

```text
TASK_ID：C1 / C2 / C-G
状态：DONE / BLOCKED
修改文件：
可见结果：
IME/draft 语义：
单提交证据：callback 次数断言
最小验证：精确命令 + 结果
INTEGRATION_REQUEST（来源任务：C1 + C2，一次性透传两个 callback 与不可用状态）：
  目标文件：src/renderer/ui/Workspace.tsx；src/renderer/App.tsx；必要时 RightSidebar 的既有 Flow props 透传点
  需要的输入（最终稳定 props 类型，C2 已在 FlowWorkspace/FlowPropertiesTab 导出）：
    WorkspaceFlowAuthoringInput 增加：
      onPatchBlock?: (blockId: string, patch: FlowInlineTextPatch) => void
      onStructuralCommand?: (command: FlowStructuralCommand) => void
      editingUnavailableReason?: string
    FlowInlineTextPatch 由 FlowWorkspace 导出（type-only import）：
      { type?: 'heading' | 'paragraph' | 'quote'; text?: string }
    FlowStructuralCommand 复用 FlowPropertiesTab 既有导出（type-only import），不得另造结构协议。
  需要的动作（按 §6 窄透传并复用既有 Store 命令）：
    Workspace.tsx 只把三个字段与 interactionDisabled 透传给 <FlowWorkspace>，不新建业务状态。
    App.tsx 的 v9FlowAuthoring：
      onPatchBlock → runCourseCommand 恰好调用一次 updateCourseFlowBlock(blockId, patch)
      onStructuralCommand → runCourseCommand 恰好调用一次 applyCourseFlowStructuralCommand(command)
      lifecycle busy/readOnly 只作为 editingUnavailableReason 输入，不持久化。
    RightSidebar 在 Flow 就地编辑可达时给 FlowPropertiesTab 开启 inlineTextEditing，不删除复杂属性入口。
  禁止副作用：第二 history、持久化 draft、Schema、IPC、AI、Clipboard、批处理、第二 adapter
  覆盖断言：I1 增加一条正式 App adapter 的单提交定向断言
    （一次 onPatchBlock / onStructuralCommand callback → 恰好一次 Store 命令 → 一次 history/revision）
Pipeline status：engineering candidate / unusable
已知风险：
```

