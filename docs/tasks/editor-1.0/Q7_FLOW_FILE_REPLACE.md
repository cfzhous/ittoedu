# Q7 · 讲义纸面媒体：本地文件替换

> 状态：**可领取**  
> 症状：Q0 #4 的磁盘文件缺口（Q4 已做库内同 kind 替换 / alt / caption / layout / 删除）  
> 车道：Q 接线  
> 合同变化：无  
> 工人先读：[02_WORKER.md](02_WORKER.md)、本卡。禁止重做 Q4。

## 一句话

新增一条 Flow **纯函数**命令：把新 `AssetMeta` 写入 `document.assets` 并改当前 media 块 `assetId`。属性面板增加隐藏 `input[type=file]`，经已有 `applyFlowCommand(..., { sidecar })` 写入字节。不改 `editorStore.ts` / `App.tsx`。

## Git

1. 不要在 `/workspace` 或别人的 worktree 上改。
2. `git fetch origin cursor/editor-q-stability-489b`
3. 从 **`origin/cursor/editor-q-stability-489b`** 建 `cursor/q7-flow-file-replace-489b`
4. commit + push。**禁止开 PR。**
5. 写 `docs/tasks/editor-1.0/Q7_HANDOFF.md`

## 允许修改

```text
src/renderer/course/flowEditorCommands.ts   新增并导出 importAndReplaceFlowMediaBlock；可加 AssetMeta import
src/renderer/ui/PropertiesTab.tsx           仅 function FlowMediaBlockProperties（约 2128–2204）
tests/unit/flowMediaBlockEdit.test.ts       追加用例，不要删 Q4 用例
docs/tasks/editor-1.0/Q7_HANDOFF.md         新建
```

## 禁止

- `editorStore.ts`、`App.tsx`、`MediaTab.tsx`、`FlowWorkspace.tsx`、Spatial / Slide 命令、e2e、`package.json`
- 改 `replaceFlowMediaBlockAsset` 的库内语义（无 `assets[id]` 时仍失败）
- wrap / float / 环绕
- 对 `PropertiesTab.tsx` 做 **无 offset 的整文件 Read**（Q4 工人因此空转）
- `npm test` / typecheck / e2e

## 基线（只读确认）

Flow 命令吃的是 **`CourseProjectDocument` + `FlowEditorBlockTarget`**，不是 session。不要发明 `beginFlowCommand`。

现有替换（约 239）只改 `assetId`，要求 `document.assets[assetId]` 已存在。磁盘新文件必须先写入 `assets`。

`applyFlowCommand(result, extra?)` 已接受 `{ sidecar?: CourseAssetSidecar }`（`editorStore.ts` 约 1649）。失败时写 `errorMessage`。

工厂（`src/renderer/project/assetManager.ts`）：

```ts
createImageAssetImport({ name, mimeType, bytes }, options?): { meta: AssetMeta, bytes }
createMediaAssetImport({ name, mimeType, bytes }, kind: 'audio' | 'video', metadata: { duration: number }, options?)
```

`duration: 0` 合法（`< 0` 才拒绝）。UI 不要调用 `readMediaMetadata`（依赖 DOM 解码，测试环境会炸）。

`freezeCourseAssetSidecar` 在 `src/renderer/project/v9AssetAdapter.ts`。

`PropertiesTab.tsx` 定位：`rg -n "function FlowMediaBlockProperties" src/renderer/ui/PropertiesTab.tsx`，然后 `Read` offset+limit≈90。现有 import 已有 `replaceFlowMediaBlockAsset`、`updateFlowEditorBlock`、`flowBlockTargetFromSelection`、`useEditorStore`。

## 逐步算法 — 命令

紧挨 `replaceFlowMediaBlockAsset` 之后新增并导出：

```ts
export function importAndReplaceFlowMediaBlock(
  document: CourseProjectDocument,
  target: FlowEditorBlockTarget,
  asset: AssetMeta,
  options: FlowCommandOptions = {},
): FlowCommandResult
```

1. `staleOrGlobal(document, options)`，与其它 Flow 命令相同。
2. `resolveFlowBlock`；不是 `type === 'media'` → `failCommand('当前块不是媒体块')`。
3. `asset.kind !== found.block.mediaKind` → `failCommand('素材类型与当前块不符')`（与 Q4 同 kind 约束；不要用未导出的 `mediaKindFromAsset`）。
4. `runMutation`：`draft.assets[asset.id] = structuredClone(asset)`，该 media 块 `assetId = asset.id`，保留 alt/caption/layout，`syncFlowCourseLocations`。成功文案可用 `'已替换素材'`。
5. 命令内不要读 File、不要碰 sidecar。

需要 `import type { AssetMeta } from '../../shared/projectTypes'`（或本文件已有的相对路径风格）。

## 逐步算法 — UI（只改 `FlowMediaBlockProperties`）

1. **保留** Q4 库内 `<SelectField>`（`data-testid="flow-replace-media"`）。
2. 增加隐藏 file input + 按钮：

```tsx
<input
  ref={fileInputRef}
  type="file"
  hidden
  data-testid="flow-replace-media-file"
  accept={block.mediaKind === 'image' ? 'image/*' : block.mediaKind === 'video' ? 'video/*' : 'audio/*'}
  onChange={async (event) => { /* 见下 */ }}
/>
<button type="button" className="secondary-button" onClick={() => fileInputRef.current?.click()}>
  从文件替换…
</button>
```

`fileInputRef = useRef<HTMLInputElement>(null)`。`useRef` 已在文件顶 import。

3. `onChange` 算法：

```ts
const file = event.currentTarget.files?.[0]
event.currentTarget.value = ''
if (!file) return
try {
  const bytes = new Uint8Array(await file.arrayBuffer())
  const imported = block.mediaKind === 'image'
    ? createImageAssetImport({
        name: file.name,
        mimeType: file.type || 'image/png',
        bytes,
      })
    : createMediaAssetImport(
        { name: file.name, mimeType: file.type, bytes },
        block.mediaKind,
        { duration: 0 },
      )
  const target = flowBlockTargetFromSelection(document, session.selection)
  const files = useEditorStore.getState().slideCandidateSidecar?.files ?? {}
  applyFlowCommand(
    importAndReplaceFlowMediaBlock(document, target, imported.meta, {
      expectedRevision: document.revision,
    }),
    {
      sidecar: freezeCourseAssetSidecar({
        ...files,
        [imported.meta.id]: imported.bytes,
      }),
    },
  )
} catch (error) {
  useEditorStore.setState({
    errorMessage: error instanceof Error ? error.message : '无法替换素材',
    statusMessage: null,
  })
}
```

4. import：`createImageAssetImport` / `createMediaAssetImport` 从 `../project/assetManager`；`freezeCourseAssetSidecar` 从 `../project/v9AssetAdapter`；`importAndReplaceFlowMediaBlock` 加到现有 `flowEditorCommands` import 列表。
5. 不要新 IPC。工厂抛 `UserFacingError` 时走上面的 `setState`，不要改 store 源文件。

## 逐步算法 — 测试

在 `tests/unit/flowMediaBlockEdit.test.ts` 追加（复制现有 `createMediaEditProject` 夹具）：

1. 成功：新 `AssetMeta` `id: 'asset-from-disk'`，`kind: 'image'`，`byteLength: 4`。  
   `importAndReplaceFlowMediaBlock(project, target, diskAsset)`  
   断言 `ok`、块 `assetId === 'asset-from-disk'`、`nextDocument.assets['asset-from-disk']` 存在、旧 `asset-image` 仍可留在 assets、alt/caption/layout 不变。
2. 负例：对 image 块传入 `kind: 'audio'` 的 meta → `ok === false`，`nextDocument` 为空或未换 id。
3. 负例：对 heading 调用 → `ok === false`（与 Q4 拒绝 heading 一致）。
4. Q4 四个旧用例保持绿。

本卡 **不必** 写 PropertiesTab 的 React 测试。命令覆盖即可。

```bash
npx vitest run tests/unit/flowMediaBlockEdit.test.ts tests/unit/flowWorkspaceMedia.test.tsx
git diff --check
```

`flowWorkspaceMedia.test.tsx` 必须仍绿（P3 blob `src`）。不要改那个文件。

## 停手

- 发现必须改 `editorStore.ts` / `App.tsx` / `FlowWorkspace.tsx` → 停，写 HANDOFF。
- 不要做绕排。

完成后 push `cursor/q7-flow-file-replace-489b`。**禁止开 PR。**
