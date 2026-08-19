# F3 · 属性栏公式块：FormulaAuthoringEditor + commitFlowFormulaAst

> 状态：**可领取**  
> 症状：F0 #3 选中公式后属性栏不能编  
> 车道：F  
> 合同变化：无  
> 工人先读：[02_WORKER.md](02_WORKER.md)、本卡。禁止重做 Slide `FormulaProperties`。

## 一句话

替换集成分支上的桩 `FlowFormulaBlockProperties`：选中 Flow `formula` 块时挂已有 `FormulaAuthoringEditor`，提交走已有 `commitFlowFormulaAst`。不要改 `PropertiesTab.tsx`（接线已在桩上）。

## Git

1. 不要在 `/workspace` 或别人的 worktree 上改。只用本 worker 的 isolated worktree。
2. `git fetch origin cursor/flow-authoring-f-44bf`
3. 从 **`origin/cursor/flow-authoring-f-44bf`** 建 `cursor/f3-flow-formula-props-44bf`
4. commit + push。**禁止开 PR。**
5. 写 `docs/tasks/editor-1.0/F3_HANDOFF.md`

## 允许修改

```text
src/renderer/ui/FlowFormulaBlockProperties.tsx   替换桩实现；保留 export 名与 props
tests/unit/flowFormulaProperties.test.tsx        新建
docs/tasks/editor-1.0/F3_HANDOFF.md              新建
```

## 禁止

- `PropertiesTab.tsx`、`FlowWorkspace.tsx`、`editorStore.ts`、`FormulaAuthoringEditor.tsx`、`FormulaEditDialog.tsx`、e2e
- `updateNode` / Slide `FormulaProperties` 的 `update({ ast })` 路径
- 无障碍自定义描述、公式字号、公式颜色（那是 Slide 画布节点字段，Flow 块没有）
- `npm test` / typecheck / e2e
- 同一路径 Read 第二次；全程最多 **8** 次 Read。信息够了立刻改代码

## 基线（只读确认，合计 ≤4 次 Read）

1. `Read` `src/renderer/ui/FlowFormulaBlockProperties.tsx` 全文（桩，很短）。
2. `rg -n "export function commitFlowFormulaAst" src/renderer/authoring/flowTextEdit.ts` → `Read` offset≈812 limit≈20。
3. `rg -n "export function flowFormulaBlockToAuthoringNode" src/renderer/authoring/flowTextEdit.ts` → `Read` offset≈197 limit≈25。
4. `Read` `tests/unit/formulaNodeUi.test.tsx` offset=53 limit=55，只抄「改线性输入 + 点应用公式」手法，不要改那个文件。

Slide 的 `FormulaProperties`（`PropertiesTab.tsx` 约 946）**不要 Read 整段去搬无障碍/字号**。Flow 只需要编辑器 + commit。

`applyFlowCommand`：`useEditorStore((s) => s.applyFlowCommand)`。失败时 store 已写 `errorMessage`。

## 逐步算法

替换桩文件，保留：

```ts
export function FlowFormulaBlockProperties({ session }: { session: FlowAuthoringSession })
```

`session` 类型继续从 `../project/createFlowCourseProject` import。

算法：

1. 从 `session.history.present` + `session.selection.selectedBlockId` 取出块。不是 `type === 'formula'` 则 return `null`。
2. `const node = flowFormulaBlockToAuthoringNode(block)`。
3. 渲染：

```tsx
<section className="property-section" data-testid="flow-formula-properties">
  <h3 className="property-title">公式</h3>
  <FormulaAuthoringEditor
    node={node}
    onCommit={(ast, accessibleText) => {
      applyFlowCommand(commitFlowFormulaAst(
        session.history.present,
        session.selection,
        ast,
        accessibleText,
        { expectedRevision: session.history.present.revision },
      ))
    }}
  />
</section>
```

4. import：`FormulaAuthoringEditor` from `./FormulaAuthoringEditor`；`commitFlowFormulaAst`、`flowFormulaBlockToAuthoringNode` from `../authoring/flowTextEdit`；`useEditorStore` from `../store/editorStore`。
5. 不要改稿纸双击对话框。不要在这里 `setFormulaBlockId`。

## 测试（新建文件）

`tests/unit/flowFormulaProperties.test.tsx`：

```ts
beforeEach(() => { useEditorStore.getState().createNewProject() })
```

步骤：

1. `createNewFlowProject()`。
2. `addFormulaNode()`（store 已有 Flow 分支，会 `insertFlowEditorBlock` 一个 formula）。
3. 在 `flowSurface().blocks` 里找到 `type === 'formula'`，用 `selectFlowEditorBlocks` 写回 `flowSession.selection`（`addFormulaNode` 的 Flow 分支可能不改 selection，测试里必须选中该块）。
4. `render(<PropertiesTab onReplaceImage={() => undefined} />)`。
5. 断言 `getByTestId('flow-formula-properties')` 与 `getByTestId('formula-authoring-editor')`。
6. `fireEvent.change(getByRole('textbox', { name: '公式内容（线性输入）' }), { target: { value: 'a+b' } })`，再 `click` `getByRole('button', { name: '应用公式' })`。
7. 断言该 formula 块 `accessibleText` 含 `a` 与 `b`（或 `ast` 为 row/token，不要写死内部序列化细节到脆弱字符串，除非与 `formulaAstToAccessibleText` 对齐）。
8. `queryByTestId('formula-edit-dialog')` 为 null（属性栏不是稿纸对话框）。

不要测 Slide 公式、不要测双击稿纸。

## 最小验证

```bash
npx vitest run tests/unit/flowFormulaProperties.test.tsx
git diff --check
```

## Gate

- 选中公式块出现线性公式编辑器。
- 「应用公式」写入当前 Flow 块 `ast` + `accessibleText`。
- 未改 Schema，未开稿纸对话框。

## 停手

必须改 `PropertiesTab.tsx` / `editorStore.ts` / `FormulaAuthoringEditor.tsx` → 停，写 HANDOFF。

完成后 push `cursor/f3-flow-formula-props-44bf`。**禁止开 PR。**
