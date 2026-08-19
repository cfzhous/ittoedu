# F2 · 属性栏块类型（段落 / H1–H6）与颜色从 runs 读

> 状态：**可领取**  
> 症状：F0 #2 只有主标题能改层级；颜色写死  
> 车道：F  
> 合同变化：无  
> 工人先读：[02_WORKER.md](02_WORKER.md)、本卡。禁止重做 Q4/Q7 媒体属性。

## 一句话

`FlowBlockProperties` 对 heading / paragraph / quote 提供「块类型」下拉，复用已有 `formatFlowBlock({ kind: 'convert-heading' | 'convert-paragraph' | 'heading-level' })`。`ColorInput` 从当前块 `runs` 读颜色。不要实现公式编辑器（F3 的桩必须保留）。

## Git

1. 不要在 `/workspace` 或别人的 worktree 上改。只用本 worker 的 isolated worktree。
2. `git fetch origin cursor/flow-authoring-f-44bf`
3. 从 **`origin/cursor/flow-authoring-f-44bf`** 建 `cursor/f2-flow-block-type-44bf`
4. commit + push。**禁止开 PR。**
5. 写 `docs/tasks/editor-1.0/F2_HANDOFF.md`

## 允许修改

```text
src/renderer/ui/PropertiesTab.tsx                 仅 function FlowBlockProperties（约 2260–2338）
tests/unit/flowProductIntegration.test.tsx        追加用例，不要删旧用例
docs/tasks/editor-1.0/F2_HANDOFF.md               新建
```

## 禁止

- `FlowWorkspace.tsx`、`editorStore.ts`、`flowEditorCommands.ts`、`FlowFormulaBlockProperties.tsx`、`FlowMediaBlockProperties`、Slide/Spatial 属性段、e2e
- 给 `SelectField` 加新 props（它被整页属性栏共用）
- 把缩进 / `indentFlowEditorBlock` 当层级
- 无 offset 整文件 Read `PropertiesTab.tsx`（约 2690 行）
- `npm test` / typecheck / e2e
- 同一路径 Read 第二次；全程最多 **8** 次 Read。信息够了立刻改代码

## 基线（只读确认，合计 ≤3 次 Read）

1. `rg -n "function FlowBlockProperties" src/renderer/ui/PropertiesTab.tsx` → `Read` offset≈2260 limit≈80。现在只有 `block.type === 'heading'` 才有「标题级别」；颜色 `value="#1f2937"`。
2. `rg -n "kind === 'convert-heading'" src/renderer/course/flowEditorCommands.ts` → `Read` offset≈656 limit≈45。`heading` 上 `convert-heading` 只改 `level`；`paragraph`/`quote` 会换成 heading 并保留 `text`/`runs`。最后一条可导航标题转段落抛 `FLOW_LAST_HEADING_REASON`（`本页至少需要一个可导航标题`）。
3. `Read` `tests/unit/flowProductIntegration.test.tsx` offset=121 limit=35。现有 bold 用例选的是 **heading**，必须保持绿。

`formatFlowBlock` / `formatFlowTextStyle` 已从 store 取。不要改 store。集成分支已有：

```tsx
import { FlowFormulaBlockProperties } from './FlowFormulaBlockProperties'
// ...
{block.type === 'formula' ? <FlowFormulaBlockProperties session={session} /> : null}
```

**这两行必须保留。** 不要改 `FlowFormulaBlockProperties.tsx`。

## 逐步算法 — 块类型

把 `block.type === 'heading'` 的「标题级别」换成：对 `heading | paragraph | quote` 显示同一个 `SelectField`。外层包：

```tsx
<div data-testid="flow-block-type">
```

- `label="块类型"`
- 选项（顺序固定）：

```ts
{ value: 'paragraph', label: '段落' },
{ value: 'quote', label: '引用' },   // 仅当 block.type === 'quote' 时放进 options，避免从段落误选成引用（没有 convert-quote）
{ value: '1', label: '一级标题' },
{ value: '2', label: '二级标题' },
{ value: '3', label: '三级标题' },
{ value: '4', label: '四级标题' },
{ value: '5', label: '五级标题' },
{ value: '6', label: '六级标题' },
```

非 quote 时 **不要**把 `quote` 放进 options。

- `value`：heading → `` `${block.level}` ``；paragraph → `'paragraph'`；quote → `'quote'`
- `onChange`：
  - `'paragraph'` → `formatFlowBlock({ kind: 'convert-paragraph' })`
  - `'1'..'6'` → `formatFlowBlock({ kind: 'convert-heading', level: Number(value) as 1|2|3|4|5|6 })`
  - `'quote'` → no-op（已是引用）

`list` / `media` / `formula` / `code` / `callout` / `section` / `divider` **不要**显示该下拉。列表的「有序列表」ToggleRow 保留。

「改正文请在稿纸里双击…」在 `media` **或** `formula` 时不显示（公式由 F3 段负责）。

## 逐步算法 — 颜色

在 `FlowBlockProperties` 内（函数体内即可）读色：

```ts
function flowRichTextColor(block: typeof block): string {
  if (!('runs' in block) || !Array.isArray(block.runs)) return '#1f2937'
  for (const run of block.runs) {
    if (typeof run.style?.color === 'string' && run.style.color.length > 0) return run.style.color
  }
  return '#1f2937'
}
```

`ColorInput` 的 `value={flowRichTextColor(block)}`，`onChange` 仍 `formatFlowTextStyle({ color })`。粗斜体按钮不要改 `data-testid`。

## 测试

在 `flowProductIntegration.test.tsx` 追加两个 `it`，复制现有 `createNewFlowProject` + 选块 + `render(<PropertiesTab .../>)` 手法：

1. **paragraph → H2：** 选中空白页的 paragraph（不是 heading）。`getByTestId('flow-block-type')` 内 `select` `fireEvent.change(..., { target: { value: '2' } })`。断言该块 `type === 'heading' && level === 2`；`listFlowCourseTreePages(flowDocument())` 的 headings 出现该 `blockId`。旧 heading 仍在。
2. **颜色从 runs 读：** 选中 heading，`formatFlowTextStyle({ color: '#dc2626' })` 或点过 ColorInput 后，重新 render，`getByLabelText('文字颜色')` 的 value 为 `#dc2626`。
3. 旧用例「formats text without a body textarea」+「hides paragraphs」必须绿。不要把 paragraph 推进课程树（转成 H2 之后树里出现的是标题，这是允许的）。

## 最小验证

```bash
npx vitest run tests/unit/flowProductIntegration.test.tsx
git diff --check
```

## Gate

- 选中正文段落能改成二级标题，课程树出现该标题。
- 最后一个可导航标题转段落仍失败（若你加了这条负例更好；不加也可以，命令层已有）。
- 公式桩仍渲染（`flow-formula-properties` 还在）。

## 停手

必须改 `flowEditorCommands.ts` / `editorStore.ts` / `FlowWorkspace.tsx` → 停。没有 convert-quote 不要新造命令。

完成后 push `cursor/f2-flow-block-type-44bf`。**禁止开 PR。**
