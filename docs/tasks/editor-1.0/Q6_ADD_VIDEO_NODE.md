# Q6 · Spatial 工具栏 `addVideoNode` 走真实 session + `asset`

> 状态：**可领取**  
> 症状：Q0 #6 工具栏插入仍偶发失败（Q5 已修好命令与 HTML 播放）  
> 车道：Q 接线  
> 合同变化：无  
> 工人先读：[02_WORKER.md](02_WORKER.md)、本卡。禁止重做 Q1–Q5。

## 一句话

`editorStore.addVideoNode` 的 **spatial 早退** 必须把真实 `spatialSession` 和 `input.asset` 交给已存在的 `addSpatialWorldVideoLayer`。禁止再造一份只改了 `assets` 的假 session。

## Git

1. 不要在 `/workspace` 或别人的 worktree 上改。只用本 worker 的 isolated worktree。
2. `git fetch origin cursor/editor-q-stability-489b`
3. 从 **`origin/cursor/editor-q-stability-489b`** 建 `cursor/q6-add-video-node-489b`
4. 每逻辑步一次 commit。push。**禁止开 PR。**
5. 写 `docs/tasks/editor-1.0/Q6_HANDOFF.md`

## 允许修改

```text
src/renderer/store/editorStore.ts          仅 addVideoNode 内 spatial 早退（约 6400–6426）
tests/unit/spatialAddVideoNode.test.ts     新建
docs/tasks/editor-1.0/Q6_HANDOFF.md        新建
```

## 禁止

- 改 `addVideoNode` 的 Flow / Slide 分支。
- 改 `addImageNode`（同类假 session，**不是本卡**）。
- 改 `spatialEditorCommands.ts`、`SpatialSurfaceHost.ts`、`App.tsx`、e2e、`package.json`。
- `npm test` / typecheck / e2e / Playwright。
- 对 `editorStore.ts` 做 **无 offset 的整文件 Read**（约 9k 行；Q4/Q5 工人因此空转）。

## 基线（以源码为准，约行 6400）

```ts
addVideoNode(asset, bytes, x, y) {
  const spatial = get().spatialSession
  if (spatial) {
    const sidecar = get().slideCandidateSidecar ?? emptyCourseAssetSidecar()
    const files = { ...sidecar.files, [asset.id]: bytes.slice() }
    const present = spatial.history.present
    const withAsset = present.assets[asset.id]
      ? spatial
      : {
          ...spatial,
          history: {
            ...spatial.history,
            present: {
              ...present,
              assets: { ...present.assets, [asset.id]: structuredClone(asset) },
            },
          },
        }
    persistSpatialResult(addSpatialWorldVideoLayer(withAsset, {
      assetId: asset.id,
      ...(typeof x === 'number' ? { x } : {}),
      ...(typeof y === 'number' ? { y } : {}),
    }, { expectedRevision: present.revision }), {
      sidecar: freezeCourseAssetSidecar(files),
      statusMessage: '已添加视频',
    })
    return
  }
```

假 `withAsset` 与 store 里的 `spatialSession` 不是同一对象。Q5 已让命令在缺 `assets[id]` 时用可选 `asset?: AssetMeta` 写入，但 **store 没传 `asset`**。

只读（Grep + 局部 Read，不要改）：

- `src/renderer/course/spatialEditorCommands.ts` `addSpatialWorldVideoLayer`（约 675–715）与 `AddSpatialWorldVideoLayerInput.asset?: AssetMeta`（约 516–521）
- `persistSpatialResult` 是 `createEditorStore` **内部闭包**（约 3010），不要改它，调用方式与现在一致

## `editorStore.ts` 读法

1. `rg -n "addVideoNode\\(asset, bytes, x, y\\)" src/renderer/store/editorStore.ts`
2. `Read` **offset = 该行号减 2，limit = 45**
3. `StrReplace` 只替换 spatial 早退那一块（从 `if (spatial) {` 到该分支的 `return;`）

## 逐步算法

把 spatial 早退改成（语义必须等价，不要重排 sidecar / persist 顺序）：

```ts
if (spatial) {
  const sidecar = get().slideCandidateSidecar ?? emptyCourseAssetSidecar()
  const files = { ...sidecar.files, [asset.id]: bytes.slice() }
  persistSpatialResult(addSpatialWorldVideoLayer(spatial, {
    assetId: asset.id,
    asset,
    ...(typeof x === 'number' ? { x } : {}),
    ...(typeof y === 'number' ? { y } : {}),
  }, { expectedRevision: spatial.history.present.revision }), {
    sidecar: freezeCourseAssetSidecar(files),
    statusMessage: '已添加视频',
  })
  return
}
```

要点：

1. **第一个参数是 `spatial`，不是 `withAsset`。** 删除整个 `withAsset` / `present.assets[asset.id] ? spatial : { ... }` 结构。
2. **输入必须带 `asset`**，让命令在同一事务写入 `draft.assets[assetId]`。
3. `expectedRevision` 用 `spatial.history.present.revision`。
4. sidecar 仍写 `slideCandidateSidecar.files`（本仓库没有 `session.assetSidecar`）。
5. 不要在 store 里再包一层 `requireWorldScope`：命令已有。global scope 时命令失败，`persistSpatialResult` 会写 `errorMessage`。
6. 不要改函数签名 `addVideoNode(asset, bytes, x, y)`。

## 最低验收

新建 `tests/unit/spatialAddVideoNode.test.ts`。模式抄 `tests/unit/spatialCanvasBackground.test.ts` 的 `loadCourseProject`：

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import type { AssetMeta } from '@/shared/projectTypes'
import type { SpatialSurfaceDocument } from '@/shared/courseProjectTypes'
import { createBlankSpatialCourseProject } from '@/renderer/project/createSpatialCourseProject'
import { useEditorStore } from '@/renderer/store/editorStore'

beforeEach(() => useEditorStore.getState().createNewProject())
```

用例 1 — 空白 Spatial 工程插入一条世界视频：

1. `loadCourseProject(createBlankSpatialCourseProject({ now: '2026-08-19T00:00:00.000Z' }), null)`
2. 断言 `spatialSession` 非空、`scope === 'world'`
3. 记录 `beforeRevision = spatialSession.history.present.revision`
4. 资产：

```ts
const asset: AssetMeta = {
  id: 'asset-q6-video',
  filename: 'clip.mp4',
  mimeType: 'video/mp4',
  kind: 'video',
  path: 'assets/clip.mp4',
  byteLength: 4,
  width: 640,
  height: 360,
}
const bytes = new Uint8Array([0, 0, 0, 1])
useEditorStore.getState().addVideoNode(asset, bytes)
```

5. 之后断言：
   - `errorMessage === null`
   - `present.assets['asset-q6-video'].kind === 'video'`
   - spatial-2d 表面 `world.layerItems` 里 **恰好 1** 条 `kind === 'native' && content.nativeType === 'video'`，且 `content.data.assetId === 'asset-q6-video'`
   - `[...slideCandidateSidecar.files['asset-q6-video']]` 等于 `[0, 0, 0, 1]`
   - `present.revision === beforeRevision + 1`

用例 2 — 再插一条不同 id：

- `addVideoNode({ ...asset, id: 'asset-q6-video-2', path: 'assets/clip-2.mp4' }, new Uint8Array([2, 2, 2, 2]))`
- 世界视频层 **2** 条；两个 id 都在 `assets` 与 sidecar；revision 再 +1

不要测 Slide 默认工程（那是 `assetTransactions.test.ts` 的路径）。不要为了绿去改命令文件。

```bash
npx vitest run tests/unit/spatialAddVideoNode.test.ts
git diff --check
```

## 停手

- 允许列表不够用（例如必须改 `addSpatialWorldVideoLayer`）→ 停，写 HANDOFF，不要改列表外文件。
- 不要跑 `test:e2e`。

完成后 `git add` 允许文件，commit，`git push -u origin cursor/q6-add-video-node-489b`。**禁止开 PR。**
