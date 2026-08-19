# F1 · 稿纸闲置态画出 text runs

> 状态：**可领取**  
> 症状：F0 #1 属性栏粗体/颜色看起来不生效  
> 车道：F  
> 合同变化：无  
> 工人先读：[02_WORKER.md](02_WORKER.md)、本卡。禁止重做 Q1–Q8 / P1–P8。

## 一句话

`FlowWorkspace` 里 heading / paragraph / quote / list / table 在**非就地编辑**时，用已有 `buildFlowRichTextHtml`（已 escape）画出 `runs`，与试运行同一套样式。就地编辑仍走现有 `richEditor`。

## Git

1. 不要在 `/workspace` 或别人的 worktree 上改。只用本 worker 的 isolated worktree。
2. `git fetch origin cursor/flow-authoring-f-44bf`
3. 从 **`origin/cursor/flow-authoring-f-44bf`** 建 `cursor/f1-flow-paper-runs-44bf`
4. 每逻辑步最多一次 commit。push。**禁止开 PR。**
5. 写 `docs/tasks/editor-1.0/F1_HANDOFF.md`

## 允许修改

```text
src/renderer/ui/FlowWorkspace.tsx          仅闲置态 rich-text 绘制；禁止改 overlay / 公式双击 / media
tests/unit/flowWorkspace.test.tsx          追加 1–2 个用例，不要删现有断言
docs/tasks/editor-1.0/F1_HANDOFF.md        新建
```

## 禁止

- `PropertiesTab.tsx`、`editorStore.ts`、`flowEditorCommands.ts`、`flowTextEdit.ts`、e2e、`package.json`
- 改 `case 'formula' | 'media' | 'code' | 'callout' | 'section' | 'divider'` 的交互
- 改 `openFormula` / `FormulaEditDialog`
- 无 offset 整文件 Read `FlowWorkspace.tsx`（约 1740 行）
- `npm test` / typecheck / e2e
- 同一路径 Read 第二次；全程最多 **8** 次 Read。信息够了立刻改代码，禁止再读确认

## 基线（只读确认，合计 ≤2 次 Read）

1. `rg -n "case 'heading'" src/renderer/ui/FlowWorkspace.tsx` → `Read` offset≈1208 limit≈110。闲置态现在是 `{block.text}` / `{item.text}` / `{rich.text}`。
2. 本卡测试：`Read` `tests/unit/flowWorkspace.test.tsx` offset=89 limit=95。夹具 `p-body` 已有 `runs: [{ start: 0, end: 2, style: { bold: true } }]`、text `阅读任务`。现有「opens the formula editor on double-click」必须保持绿。

`buildFlowRichTextHtml` 已从 `../authoring/flowTextEdit` import（文件顶部约第 45 行）。不要改 import 路径。不要新命令。

## 逐步算法

在 `richEditor` 闭包附近（约 1163，同一 render 函数内）增加局部函数，**不要**新文件：

```tsx
const idleRichText = (text: string, runs: readonly import('../../shared/projectTypes').TextRun[] = []) => (
  <span
    data-flow-idle-rich-text="true"
    dangerouslySetInnerHTML={{ __html: buildFlowRichTextHtml(text, runs) }}
  />
)
```

把闲置分支从纯文本换成 `idleRichText`，编辑分支不动：

| case | 闲置态现在 | 改成 |
|---|---|---|
| `heading` | `{block.text}` | `{idleRichText(block.text, block.runs ?? [])}` |
| `paragraph` | `{block.text}` | `{idleRichText(block.text, block.runs ?? [])}` |
| `quote` 正文 | `<p>{block.text}</p>` | `<p>{idleRichText(block.text, block.runs ?? [])}</p>` |
| `list` `li` | `{item.text}` | `{idleRichText(item.text, item.runs ?? [])}` |
| `table` `td` | `{rich.text}` | `{idleRichText(rich.text, rich.runs ?? [])}` |

`citation` / `caption` / `th` header **不要**改。`editingThis && edit?.kind === 'rich-text'` 仍走 `richEditor(...)`。

## 测试

在 `describe('FlowWorkspace paper')` 追加（不要改旧 it）：

```ts
it('paints idle paragraph runs instead of plain text', () => {
  renderPaper()
  const rich = screen.getByTestId('flow-block-p-body').querySelector('[data-flow-rich-text="true"]')
  expect(rich?.textContent).toBe('阅读任务')
  expect(rich?.querySelector('[data-flow-idle-rich-text="true"]')?.innerHTML).toMatch(/font-weight:\s*700/)
  expect(screen.queryByTestId('flow-inline-editor')).toBeNull()
})
```

可选第二条：对 `h1` 无 runs 的标题，`innerHTML` 不含 `<span`，`textContent` 仍是原标题。旧的双击公式、选中、contenteditable 用例必须绿。

## 最小验证

```bash
npx vitest run tests/unit/flowWorkspace.test.tsx
git diff --check
```

## Gate

- 闲置 `p-body` 能看见 bold run。
- 双击仍进入 `flow-inline-editor`；公式双击仍开 `formula-edit-dialog`。
- 未宣称试运行/Published 有变化。

## 停手

必须改 `flowTextEdit.ts` / `PropertiesTab.tsx` / overlay → 停，写 HANDOFF。

完成后 push `cursor/f1-flow-paper-runs-44bf`。**禁止开 PR。**
