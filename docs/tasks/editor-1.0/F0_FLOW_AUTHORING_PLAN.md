# F0 流式讲义作者界面：开发计划与并行切分

> 执行入口：[00_INDEX.md](00_INDEX.md) 车道 F。  
> 工人协议：[02_WORKER.md](02_WORKER.md) + 本轮 Git 后缀 **`-44bf`**。  
> 来源：本机对话「Flow authoring diagnosis」plan（教师确认后转任务卡）。  
> 合同变化：**无**。不改 Course Project V9 字段、判别器或 `.strict()`。

## 产品行为（修完后教师应看到）

空白流式页仍是「一个 H1 主标题 + 一段 paragraph」。课程树仍只列 heading/section。本轮只补作者界面，复用已有命令。

1. **稿纸闲置态能看见 runs。** 选中段落后点属性栏粗体/斜体/颜色，稿纸立刻画出加粗、斜体、颜色，不必切试运行。就地编辑仍走现有 `richEditor`。
2. **属性栏能改块类型。** heading / paragraph / quote 共用一个「块类型」下拉：段落 / 一级…六级标题；quote 额外显示当前「引用」。选标题走已有 `convert-heading`；选段落走 `convert-paragraph`（最后一条可导航标题仍拒绝，文案：`本页至少需要一个可导航标题`）。
3. **属性栏能编公式。** 选中 `type === 'formula'` 时，右侧出现 `FormulaAuthoringEditor`，点「应用公式」走已有 `commitFlowFormulaAst`。稿纸双击对话框保留。
4. **颜色控件诚实。** 「文字颜色」从当前块 `runs` 读取，不要写死 `#1f2937`。

缩进不是标题层级：`indentFlowEditorBlock` 要求上一项是 `section`，本轮不把它伪装成 Word 大纲。

## 三条根因（不要修成别的）

```text
选中稿纸块
  → 属性栏 FlowBlockProperties
  → formatFlowEditorBlock / formatFlowAuthoringTextStyle
  → V9 blocks.text + runs
  → 稿纸闲置态以前只输出 block.text   ← 教师以为没生效
  → 试运行 appendRichText 已经画 runs
```

1. **格式写入了，稿纸不画。** `formatFlowAuthoringTextStyle` 会把 `runs` 写进工程（`tests/unit/flowProductIntegration.test.tsx` 已断言 heading 的 `runs.bold`）。稿纸 `FlowWorkspace.tsx` 约 1210–1311 闲置态只渲染 `block.text` / `item.text` / `rich.text`。
2. **层级控件只给 heading。** 「标题级别」包在 `block.type === 'heading'`。`convert-heading` / `convert-paragraph` 已存在于 `formatFlowEditorBlock`。稿纸条「转为 H2」不是属性栏。
3. **公式属性栏没有编辑器。** 稿纸双击会 `openFormula` → `FormulaEditDialog`。`FlowBlockProperties` 对公式仍是「改正文请在稿纸里双击」。Slide 侧已有 `FormulaProperties` + `FormulaAuthoringEditor`（`PropertiesTab.tsx` 约 946）可抄结构，提交必须走 Flow 命令，不要 `updateNode`。

## 并行图（文件防火墙）

三张卡无共同「允许修改」的实现文件。父代理在集成分支上已放公式属性栏 **编译桩**，F3 只替换桩的实现。

```text
F1  稿纸闲置态画 runs     FlowWorkspace.tsx + flowWorkspace.test.tsx
F2  块类型 + 颜色诚实     PropertiesTab.tsx 仅 FlowBlockProperties + flowProductIntegration.test.tsx
F3  属性栏公式编辑器      FlowFormulaBlockProperties.tsx + flowFormulaProperties.test.tsx
```

| 卡 | 教师能看见 | 允许热点 | 禁止 |
|---|---|---|---|
| [F1](F1_FLOW_PAPER_RUNS.md) | 闲置稿纸出现粗体/颜色 | `FlowWorkspace.tsx` 仅 heading/paragraph/quote/list/table 闲置态 | overlay、公式双击、media |
| [F2](F2_FLOW_BLOCK_TYPE.md) | 段落可改成 H2；颜色从 runs 读 | `PropertiesTab.tsx` 仅 `FlowBlockProperties` | `FlowMediaBlockProperties`、Slide/Spatial 属性、公式桩实现 |
| [F3](F3_FLOW_FORMULA_PROPS.md) | 选中公式块右侧能编并能 commit | `FlowFormulaBlockProperties.tsx` | `PropertiesTab.tsx`、`FormulaAuthoringEditor.tsx`、`editorStore.ts` |

父代理只合入与复检。工人禁止开 PR。

## 合入顺序

无代码依赖。建议 F1 → F2 → F3，仅便于复检稿纸可见性（F2 写入的 runs 要靠 F1 才能在稿纸上看见）。三卡都从 **同一 docs HEAD** `origin/cursor/flow-authoring-f-44bf` 分 worktree。

## 本轮不做

- 不改 Course Project V9 字段、判别器、`.strict()`。
- 不新做 Word 大纲 / 分节 UI；不让「缩进」去改 heading level。
- 不把 paragraph 推进课程树。
- 不重写 `editorStore.ts` / `Workspace.tsx` / 整页 Flow 编辑器。
- 不做稿纸环绕/浮动。
- 不把就地编辑中的属性栏 `flowTextEdit` 同步回 `FlowWorkspace` 本地 draft（次要，单独开卡）。
- 浮层公式双击与稿纸块分开，本轮不改 overlay。
- 不跑 T6 全量 / e2e / desktop。

## 验证

每卡只跑自己的「最小验证」+ `git diff --check`。禁止 `npm test` / typecheck / e2e。

父代理合入后复跑：

```bash
npx vitest run tests/unit/flowWorkspace.test.tsx tests/unit/flowProductIntegration.test.tsx tests/unit/flowFormulaProperties.test.tsx
git diff --check
```
