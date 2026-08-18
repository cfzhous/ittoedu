HANDOFF
- task: R4-B
- planning pack path: `C:\Users\74755\Documents\HTML课件编辑器\docs\tasks\v8-to-v9-rebuild`
- product worktree / branch / baseline SHA: `C:\Users\74755\Documents\HTML课件编辑器-v8-to-v9-rebuild` / `codex/v8-to-v9-rebuild` / `f27275658c6dfaa12f2ce35cd9368dcdebe99451`
- outcome: 在产品 worktree 落地 **强文本 Flow 稿纸 + 文字/选区 bridge + block 上下文工具**。单击选 block、双击 / 已选后 Enter / 再点文本都走同一 `applyFlowTextEditGesture` → `enterFlowTextEditing`。就地编辑是 contenteditable caret/选区，不是单行改正文框。IME composing 不提交；提交只写 R4-A `executeFlowEditorCommand('apply-text')` / `applyFlowCommittedText` 的 `text` + 可选 `TextRun[]`。选区粗体/斜体/颜色/下划线/删除线/着重/高亮与属性栏共用 `formatFlowAuthoringTextStyle`。公式双击打开 V8 `FormulaEditDialog`，不走 runs。上下文工具挂在当前 block 内顶部或正下方，`mousedown preventDefault` 不抢焦。稿纸按 `layout.readingWidth` 纵向滚动，不是 1280×720 舞台。未改 App/store/Workspace/ScenePanel/RightSidebar/MediaTab/PropertiesTab/NodesTab/TopToolbar，未新建 FlowElementsTab/FlowPropertiesTab，未把 `FlowWorkspace` import 进 `Workspace.tsx`，未开始 R4-C/D/Z，未 commit。本 lane 为 integration candidate，不是 art/accepted，**不宣称 Flow 编辑器已可用**。
- owned files changed (product worktree, new):
  - `src/renderer/ui/FlowWorkspace.tsx`（单一文档稿纸；导出 `FlowWorkspace`、`FlowInlineRichTextEditor`）
  - `src/renderer/authoring/flowTextEdit.ts`（文字事务 / 选区 format bridge）
  - `src/renderer/ui/FlowBlockContextToolbar.tsx`（block 内上下文工具，不进 RightSidebar）
  - `tests/unit/flowInlineTextEditor.test.tsx`
  - `tests/unit/flowWorkspace.test.tsx`
  计划侧：本 HANDOFF。未改账本 / `00_INDEX.md` / UI 热点 / R4-A 四文件 / `v9SlideContentEdit.ts` / `spatialWorldAuthoring.ts`。
- donor files/functions consulted:
  - `git show 4755034:src/renderer/ui/FlowWorkspace.tsx`（block 命中、稿纸滚动、overlay 卡片骨架）
  - `git show 4755034:tests/unit/flowWorkspace.test.tsx`（block 类型渲染意图）
  - 产品 V8 `TextEditOverlay.tsx`（contenteditable HTML ↔ runs、IME composing/blur defer、工具条 `preventDefault`、粗体/斜体/下划线/删除线/着重/高亮/颜色/清除格式）
  - 产品 R2-C `v9SlideContentEdit.ts`（只读对照：composing / commit / cancel / defer、选区 `applyTextRunStyle`；**未改该文件**）
  - R4-A `executeFlowEditorCommand` / `applyFlowCommittedText` / `enterFlowTextEditing` / `selectFlowEditorBlocks` / `formatFlowEditorBlock`
  - V8 `FormulaEditDialog` / `FormulaAuthoringEditor`（公式双击）
  - R4-DESIGN 合同 C2/C4/C11、§7、§11
- donor 舍弃部分:
  - 供体 `FlowInlineTextEditor` 的 **textarea 整段改正文** 与 `onPatchBlock` 第二份草稿
  - `FlowPropertiesTab` / `FlowBlockPatch` / `FlowStructuralCommand` 弱面板类型
  - `FlowElementsTab`、把 paragraph 画成图层行、1280×720 舞台度量
  - 未把 `TextEditOverlay` 或 `v9SlideContentEdit.ts` 改成 Flow 共用实现
- focused validation command:
  ```
  npx vitest run tests/unit/flowInlineTextEditor.test.tsx tests/unit/flowWorkspace.test.tsx
  git diff --check -- src/renderer/ui/FlowWorkspace.tsx src/renderer/authoring/flowTextEdit.ts src/renderer/ui/FlowBlockContextToolbar.tsx tests/unit/flowInlineTextEditor.test.tsx tests/unit/flowWorkspace.test.tsx
  ```
- validation result: Vitest 2 files / 12 tests passed。`git diff --check` 无输出、exit 0（对新文件先 `git add -N` 再 check，随后 `git reset`，文件仍为 untracked）。
- validation entry / fixture / backend:
  - entry: `applyFlowTextEditGesture`、`beginFlowTextEdit`、`enterFlowTextEditing`、`commitFlowTextEdit` → `executeFlowEditorCommand({ name: 'apply-text' })`、`formatFlowAuthoringTextStyle` → `executeFlowEditorCommand({ name: 'format' })`、`FlowWorkspace` 单击/双击/Enter、`FlowBlockContextToolbar`、`FormulaEditDialog`
  - fixture: 内存纯 Flow V9（H1 + 带 runs 的段落「春⭐风」/「阅读任务」+ 列表 + 表格 + 公式 + 文中 media + 浮层）
  - backend: 受控 `FlowWorkspace` + 纯函数 bridge；未接 App/Workspace/PropertiesTab/Player
- validation proves / does not prove:
  - proves: 双击/Enter/再点文本同一 `enterFlowTextEditing` 入口；IME composing 挡 commit；提交写 `text`+`runs`；稿纸工具条与 Properties 共用 `formatFlowAuthoringTextStyle`（无选区则整块）；公式双击不走 runs；工具条在 block 内且 mousedown 不改 selection；稿纸 `readingWidth` 760、可滚动、不是 1280×720；无 textarea 改正文
  - does not prove: 未接真实 Workspace/ScenePanel/PropertiesTab/MediaTab/Player；jsdom 无真实 IME 引擎与 caret 点击落点；未跑 typecheck/build/E2E/视觉
- narrow UI smoke, if authorized: 未授权；未启动 App。未开始 R4-C/D/Z。
- INTEGRATION_REQUESTS:
  ```
  INTEGRATION_REQUEST
  - requester task: R4-A
  - target stage integrator: R4-B
  - target hotspot file: src/renderer/ui/FlowWorkspace.tsx、src/renderer/authoring/flowTextEdit.ts
  - exported symbol / callback: executeFlowEditorCommand、applyFlowCommittedText、enterFlowTextEditing、selectFlowEditorBlocks、formatFlowEditorBlock
  - required user-visible behavior: 稿纸单击选 block、双击/已选后 Enter 进入就地编辑；caret/选区粗体斜体颜色与属性栏写同一 text + runs 事务。
  - focused test proving lane side: tests/unit/flowInlineTextEditor.test.tsx（同一 gesture 入口；formatFlowAuthoringTextStyle 与 executeFlowEditorCommand format 同文档）
  - exact wiring requested: R4A-R4B-01 已由本任务消费：双击走 applyFlowTextEditGesture → enterFlowTextEditing；IME 结束后 commitFlowTextEdit → apply-text；选区工具与 Properties 都走 formatFlowAuthoringTextStyle。
  - risk if omitted: （已消费）
  - status: implemented
  ```
  ```
  INTEGRATION_REQUEST
  - requester task: R4-B
  - target stage integrator: R4-Z
  - target hotspot file: src/renderer/ui/Workspace.tsx
  - exported symbol / callback: FlowWorkspace
  - required user-visible behavior: 当前 location 为 Flow 时，中央工作区渲染 FlowWorkspace 连续稿纸（readingWidth 纵向滚动），不渲染 Phaser 1280×720 Slide 舞台，无 Slide 场景状态条。
  - focused test proving lane side: tests/unit/flowWorkspace.test.tsx（data-flow-not-slide-stage、readingWidth 760、overflow auto）
  - exact wiring requested: R4B-R4Z-01。当 active location.kind === 'flow-block'（或当前 surface.type === 'flow'）时渲染 <FlowWorkspace project view selection onProjectChange onSelectionChange />；不要 import 进 Slide 默认路径；不要把 FlowWorkspace 画进固定 1280×720 StageViewport。
  - risk if omitted: 教师打开 Flow 页仍看到幻灯片舞台，合同 C4/§2 中央工作区未替换
  - status: open
  ```
  ```
  INTEGRATION_REQUEST
  - requester task: R4-B
  - target stage integrator: R4-Z
  - target hotspot file: src/renderer/store/editorStore.ts、src/renderer/App.tsx
  - exported symbol / callback: onProjectChange(FlowCommandResult)、onSelectionChange(FlowEditorSelection | null)、commitFlowEditorHistory / undoFlowEditorHistory
  - required user-visible behavior: 稿纸命令的 nextDocument 写入当前 V9 工程并进一次 history；顶栏撤销/重做对已提交文本/格式有效。文本焦点下 composing 中不得 Undo 掉上一结构动作（bridge：resolveFlowTextHistoryAction dirty draft → cancel）。
  - focused test proving lane side: tests/unit/flowInlineTextEditor.test.tsx（commit 一次 history；IME 不提交；dirty undo = cancel draft）
  - exact wiring requested: R4B-R4Z-02。把 FlowWorkspace 的 onProjectChange 接到 V9 session/history（与 R4-A commitFlowEditorHistory 或现有 store 一次 revision）；onSelectionChange 只改 editor selection，不写 history。
  - risk if omitted: 稿纸编辑停留在 React 回调里，保存重开丢失，或 Undo 跳过未提交草稿
  - status: open
  ```
  ```
  INTEGRATION_REQUEST
  - requester task: R4-B
  - target stage integrator: R4-Z
  - target hotspot file: src/renderer/ui/PropertiesTab.tsx
  - exported symbol / callback: formatFlowAuthoringTextStyle、formatFlowAuthoringBlock、commitFlowTextEdit
  - required user-visible behavior: 属性栏对同一选区写同一 text+runs 事务；禁止用单行/多行「正文」框整体替换 text。无选区点粗体/斜体 = 先覆盖该块全部字符再 formatFlowAuthoringTextStyle。结构属性（标题级别、列表有序）走 formatFlowAuthoringBlock。
  - focused test proving lane side: tests/unit/flowInlineTextEditor.test.tsx（Properties 与 executeFlowEditorCommand format 同文档；无 range 时整块 underline）
  - exact wiring requested: R4B-R4Z-03。Flow 页 Properties 调用 formatFlowAuthoringTextStyle({ document, selection, style, edit })；若稿纸正在编辑，传入同一个 FlowTextEditSession，不要另开草稿。不要新建 FlowPropertiesTab。
  - risk if omitted: 属性栏与稿纸各写各的，或退回整段改正文（C2/C11）
  - status: open
  ```
- DECISION_REQUESTS: 无
- remaining risks / untested full checks:
  - 未跑 `npm run typecheck` / `npm test` / `npm run build` / E2E / 视觉回归（R8）
  - 列表项/表格单元格提交走 `updateFlowEditorBlock` 写嵌套 `text`+`runs`（R4-A `applyFlowCommittedText` 只覆盖 heading/paragraph/quote/code/callout）
  - jsdom 无真实 IME 与指针 caret 落点；公式预览有 canvas getContext 警告，对话框仍打开
  - 浮层卡片仅为 view.overlayLayers 命中壳，插入/八向/嵌入正文属 R4-C
  - 受控 `selection.focus !== 'text'` 时稿纸会收起本地 edit；R4-Z 必须在编辑期间把 text focus selection 传回来
- rollback point: 删除产品 worktree 上述 5 个未跟踪文件。基线仍为 `f272756`。未改热点。
- execution state: lane_candidate
- integration state: pending
- quality state: unverified

## 冻结导出名

### `src/renderer/authoring/flowTextEdit.ts`

| 符号 | 角色 |
|---|---|
| `applyFlowTextEditGesture` | 双击 / Enter / 再点文本的同一入口 → `enterFlowTextEditing` |
| `beginFlowTextEdit` / `beginFlowFormulaEdit` | 开会话；公式拒绝 runs（`FLOW_TEXT_REJECT_FORMULA_RUNS`） |
| `commitFlowTextEdit` | IME 结束后 `executeFlowEditorCommand({ name: 'apply-text' })` |
| `cancelFlowTextEdit` | Escape 丢草稿，不写 history |
| `formatFlowAuthoringTextStyle` | **稿纸工具条与 Properties 共用**；无 edit 时 `executeFlowEditorCommand({ name: 'format' })`；有 edit 时只改会话草稿 |
| `formatFlowAuthoringBlock` | 标题级别 / 转段落 / 列表有序 → `formatFlowEditorBlock` |
| `commitFlowFormulaAst` | 公式对话框提交 ast + accessibleText |
| `resolveFlowTextKeyDown` / `Blur` / `SelectionChange` / `HistoryAction` | composing → ignore/defer；Esc cancel；Ctrl+Enter commit |
| `markFlowTextComposing` / `deferFlowTextAction` / `finishFlowTextComposition` | IME 门闩 |
| `updateFlowTextDraft` / `applyFlowTextEditRunStyle` / `toggleFlowTextEditEmphasis` / `clearFlowTextEditRangeStyle` | 会话内草稿，不写 document |
| `buildFlowRichTextHtml` / `extractFlowRichTextFromEditor` | contenteditable ↔ `text`+`runs` |
| `flowFormulaBlockToAuthoringNode` | Flow formula block → V8 `FormulaEditDialog` node |

拒绝：`composing` / `当前块不能就地编辑文字` / `公式请使用公式编辑器`。

### `src/renderer/ui/FlowWorkspace.tsx`

`FlowWorkspace`、`FlowInlineRichTextEditor`

### `src/renderer/ui/FlowBlockContextToolbar.tsx`

`FlowBlockContextToolbar`、`FlowBlockContextCommand`

## R4-Z 接线（中央工作区）

```tsx
import { FlowWorkspace } from './FlowWorkspace'
import { buildFlowEditorView } from '../course/flowEditorView'

// location.kind === 'flow-block' 时：
<FlowWorkspace
  project={v9Document}
  view={buildFlowEditorView({ project: v9Document, locationId })}
  selection={flowSelection}
  onProjectChange={(result) => { /* commitFlowEditorHistory / 写 session */ }}
  onSelectionChange={setFlowSelection}
/>
// 不要渲染 Phaser Slide 舞台。
```

属性栏：

```ts
formatFlowAuthoringTextStyle({ document, selection, style, edit: currentFlowTextEdit })
```

不要第二份正文输入框。不要 FlowElementsTab / FlowPropertiesTab。
