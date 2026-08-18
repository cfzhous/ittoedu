# Q4 流式讲义稿纸图片基础编辑

> 状态：**可领取**  
> 症状：Q0 #4  
> 车道：Q  
> 合同变化：无  
> 工人先读：[02_WORKER.md](02_WORKER.md)、[Q0_FIX_PLAN.md](Q0_FIX_PLAN.md)

## 一句话

选中 Flow `media` 块后，属性面板可改 alt、caption、`layout`，可替换已有图片/视频素材，可删除。看见图片已由 P3 完成。**不做**环绕、浮动、z-order 当图层。

## Git

分支：`cursor/q4-flow-image-edit-489b`  
HANDOFF：`docs/tasks/editor-1.0/Q4_HANDOFF.md`

## 允许修改

```text
src/renderer/ui/PropertiesTab.tsx          只扩 FlowBlockProperties；禁止改 Slide/Spatial 属性段
src/renderer/ui/FlowWorkspace.tsx          只扩 type==='media' 稿纸块与可选块级工具条；禁止改 overlay 手势
src/renderer/course/flowEditorCommands.ts  仅当 updateFlowEditorBlock 不够用时加「替换 media assetId」纯函数
src/renderer/ui/MediaTab.tsx               仅当必须复用选文件；不要改 Slide 插入
tests/unit/flowWorkspaceMedia.test.tsx     扩，不要删 P3 可见性断言
docs/tasks/editor-1.0/Q4_HANDOFF.md
```

## 禁止

- `editorStore.ts`（用已有 `applyFlowCommand` / `insertFlowLibraryMedia` / `formatFlowBlock`）。
- `FlowSurfaceHost.ts`、环绕 CSS、把 media 块当 `layerItems`。
- 回退 P3 的 `<img src>` / `<video src>` blob。
- 音频块假装成图片编辑。

## 基线

- `FlowBlockProperties`（`PropertiesTab.tsx` 约 2115）只有标题级别、列表、选区粗斜体。`media` 无 UI。
- `updateFlowEditorBlock(document, target, patch | fn)` 已存在（`flowEditorCommands.ts` 约 214）。
- `insertFlowLibraryMedia` 会 **新插入** 一块，不是替换当前块。替换必须改当前 `assetId`，或先写 `replaceFlowEditorMediaAsset` 再 `applyFlowCommand`。
- 稿纸 `FlowMediaBlock.layout`: `'content-width' | 'wide' | 'full-width'`。编辑态 `data-flow-media-layout` 已输出。
- 删除：块工具条已有 `type: 'delete'`；确认 media 选中时删除可用。不够就在属性面板加「删除此块」走同一命令。

`applyFlowCommand` 在 PropertiesTab：`const applyFlowCommand = useEditorStore((s) => s.applyFlowCommand)`。target 用 `flowBlockTargetFromSelection(session.selection)`（从 `flowEditorSlice` import，与现有 format 路径一致）。

## 逐步算法

### A. 命令（仅当 Object.assign 不够）

若直接 `updateFlowEditorBlock(..., { assetId, altText, caption, layout })` 能更新 media 块，**不要**新函数。

若替换素材需要校验 `project.assets[id].kind`：

```ts
export function replaceFlowMediaBlockAsset(
  document, target, assetId, options?
): FlowCommandResult
```

- `staleOrGlobal` 与其它 Flow 命令相同。
- 找不到块 / 不是 `type==='media'` → fail。
- asset 不存在或 kind 与 `mediaKind` 不符（image 块不能换成 audio）→ fail。
- 成功：写 `assetId`，保留 layout/caption；可选清错误 alt。

### B. 属性面板

`FlowBlockProperties` 在 `block.type === 'media'` 时增加 section `data-testid="flow-media-properties"`：

1. 只读：当前 `mediaKind`、文件名（从 `session.history.present.assets[block.assetId]`）。
2. `BufferedInput` alt（`altText ?? ''`）。
3. `BufferedInput` caption。
4. `SelectField` layout 三档，中文标签：正文宽 / 较宽 / 全宽。
5. 按钮「替换素材」：`data-testid="flow-replace-media"`。  
   打开文件选择（可复用 MediaTab/App 已有 `input type=file` 模式）。**不要**新 IPC。  
   若商店没有「导入并返回 assetId」的现成 action：用 `insertFlowLibraryMedia` 会多插一块——禁止。应：  
   - 调用现有 `importV9CandidateMedia` 仅当它不插入节点；或  
   - 属性面板 `onChange` 文件 → 工人若发现必须改 `editorStore` → **停手写 HANDOFF**，先落地 alt/caption/layout/delete。  
   父代理再补替换接线。优先路径：工程里已有素材时用下拉选择 `assetId`（`Object.values(assets).filter(kind===mediaKind)`）+ `updateFlowEditorBlock`。这不需要新 store 方法。
6. 删除按钮走已有 `formatFlowBlock`/`applyFlowCommand(delete...)`。看 `FlowBlockContextToolbar` 的 delete 如何 dispatch，抄同一条。

### C. 稿纸选中态

`FlowWorkspace.tsx` `case 'media'`：选中时加 `data-flow-media-selected="true"`（已有 block 选中 class 则复用）。不要新的拖缩放框（稿纸不是画布）。不要改 overlay。

### D. 测试

扩 `flowWorkspaceMedia.test.tsx`：

1. 选中 image media 块后，若测试能挂 PropertiesTab 则断言 `flow-media-properties`。若 Properties 不在该文件的 render 树，则单测 `updateFlowEditorBlock` / `replaceFlowMediaBlockAsset`：改 alt、layout、assetId，稿纸 rerender 后 `img[data-flow-asset-id]` 为新 id。
2. P3：无 src 占位不得回归；有 sidecar bytes 仍有 `src`。
3. 不测环绕。

可另建 `tests/unit/flowMediaBlockEdit.test.ts` 若不想把 Properties 塞进 workspace 测试（仍算「本任务测试文件」，最多 **两个** 测试文件）。

## 最小验证

```powershell
npx vitest run tests/unit/flowWorkspaceMedia.test.tsx
```

若新建了第二个测试文件，只再跑那一个。`git diff --check`。

## Gate

- 选中图片块能改 alt/caption/layout 并写入 V9。
- 用库内已有同 kind 素材能换 `assetId`。
- 环绕未实现，文档不要宣称已实现。
- P3 可见性断言仍绿。

## 停手

必须改 `editorStore.ts` / `App.tsx` 才能选本地文件 → 停。先交库内素材替换 + 字段编辑。
