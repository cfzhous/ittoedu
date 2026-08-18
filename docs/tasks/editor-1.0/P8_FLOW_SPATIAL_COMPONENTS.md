# P8 Flow / Spatial 互动组件

> 状态：**未合入**（可领取；P1/P3/P4 已合入）  
> 并行：**否**。不要与 P5-persist 同时改宿主 / `FlowWorkspace` / Spatial `Workspace`  
> 合同变化：无（仍是 Component API 4）  
> 车道：P  
> 工人先读：[02_WORKER.md](02_WORKER.md)

## 一句话

三种表面的 **Published / 试运行** 以及 Flow/Spatial **编辑预览**，有包时挂 Component API 4；缺包或 capture 才用带真实 `src` 的后备图。不要新造运行时，不要复制 CourseStudio，不要接 Phaser `PlayerApp`。

## 基线（集成分支上已经是这样）

| 位置 | 现状 | 本任务要变成 |
|---|---|---|
| `FlowWorkspace.tsx` `case 'component'`（约 1205） | 包名 + 无 `src` 的 fallback `<img>` | 有包挂载；否则 `<img src=blob或resolve>` |
| `renderFlowOverlayCardContent`（约 370） | 非 image/video 则 `label \|\| '浮层'` | `kind === 'component'` 走同一挂载/后备，禁止「浮层」假完成 |
| `FlowSurfaceHost.ts` `renderBlockDom` `case 'component'`（约 781） | 只画后备图或文字 | 有 `runtime.js` 时 `mountPublishedComponent` |
| `SpatialSurfaceHost.ts` `createWorldItem`（约 179 else） | 浅蓝 SVG 矩形 + packageId | 组件用 HTML overlay 对齐 frame；SVG 只留几何 |
| `SlidePublishedAdapter.ts` `appendLayerNode` `kind === 'component'`（约 238） | 只后备 | 同一 helper |
| Slide **编辑** Player iframe `componentTargets` | 已可用 | **不要改** Slide 编辑手势 |

P3 已给 Flow 图片/视频 blob URL。P1 已给宿主 video + 控制器。不要回退这些。

## 允许修改

```text
src/player/ComponentRegistry.ts                 仅当 helper 需要小改
src/player/componentHostActions.ts              仅当 Published 导航要接已有 host actions
src/player/surfaces/publishedComponentMount.ts  新建（必须）
src/player/surfaces/flow/FlowSurfaceHost.ts     只改 component 分支 + overlay 组件
src/player/surfaces/spatial/SpatialSurfaceHost.ts  只改 component 项；video/text/image 分支不动
src/player/surfaces/slide/SlidePublishedAdapter.ts 只改 appendLayerNode 的 component 分支
src/renderer/ui/FlowWorkspace.tsx               只改 component 稿纸块 + overlay 组件预览
src/renderer/ui/Workspace.tsx                   只改 Spatial 世界/HUD 组件绘制与命中，禁止改 Slide 手势 / course-try-run 启动
src/renderer/course/flowSharedAuthoringAdapters.ts  仅当必须读包元数据
tests/unit/publishedComponentMount.test.ts      新建（必须）
tests/unit/flowSurfaceHost.test.ts              只加 component 断言，不删 P1 用例
docs/tasks/editor-1.0/P8_HANDOFF.md
```

空间编辑绘制在 `Workspace.tsx` 的 `SpatialLocationWorkspace` 世界 `div.spatial-world-item`（约 974）。HUD 同类。不要改 `stageViewportTransform.ts`。

## 禁止

- 改 Component API / V9 判别器 / `editorStore` 后端。
- `import` Phaser `PlayerApp` 或 `src/player/PlayerScene.ts` 到 Flow/Spatial/Published。
- 为组件新建第三套 authoring target 协议。编辑命中用已有 `authoringAddress`。
- 改 P1 控制器 offset、Flow overlay `position`、Slide 1280×720 命中。
- 改 P3 的 image/video blob 逻辑。
- 无 `src` 的 `<img>`。
- 与 P5-persist 抢 `FlowSurfaceHost` 文章背景（你不改背景色）。

## 规定 helper（必须按这个形状，可加字段不可改名乱造）

新建 `src/player/surfaces/publishedComponentMount.ts`：

```ts
export type PublishedComponentMountMode = 'edit' | 'playback' | 'capture'

export interface PublishedComponentMountInput {
  container: HTMLElement
  packageId: string
  version?: string
  props: Record<string, unknown>
  /** package files including runtime.js；没有则走后备 */
  files?: Record<string, Uint8Array> | Record<string, string>
  resolveAsset: (assetId: string) => string | undefined
  staticFallbackAssetId?: string
  mode: PublishedComponentMountMode
  hostActions: ReturnType<typeof createPlayerComponentHostActions> | import('../../shared/componentTypes').ComponentHostActions
  authoringAddress?: string
}

export interface PublishedComponentMount {
  destroy(): void
}

export function mountPublishedComponent(input: PublishedComponentMountInput): PublishedComponentMount
```

算法（必须按序，禁止跳过后备）：

1. `mode === 'capture'` **或** 没有可用 `runtime.js` → 只渲染后备：`resolveAsset(staticFallbackAssetId)` 得到 URL，`<img src>` + `alt`；没有 URL 则可见文本 `[组件后备：packageId]`，**不要空白盒**。
2. 否则：`ComponentRegistry.executeRuntime` + `tryCreateComponentLifecycle`（`src/shared/componentLifecycleGuard.ts`）。DOM 组件挂到 `container`。`mode === 'edit'` 时子树 `pointer-events: none`，命中落在带 `data-authoring-address` 的外框。
3. `destroy()` 必须卸掉实例，允许重复挂载。
4. 复用 `createPlayerComponentHostActions`。导航失败返回 `false`，不要抛到 React。

不要复制 `src/player/renderNode.ts` 的 Phaser 分支。DOM 挂载可参考 `src/shared/phaserDomComponentHost.ts` 的「普通 HTML 容器」部分，但目标容器是普通 `HTMLElement`。

## 逐步接线（做完一步再做下一步）

1. 实现 helper + `tests/unit/publishedComponentMount.test.ts`（至少 2 个用例：有 runtime 会 `define`；无 runtime 的 img 有 `src`）。
2. `SlidePublishedAdapter.appendLayerNode` 的 `kind === 'component'` 改调 helper（`mode: 'playback'`；capture 路径若已有则 `mode: 'capture'`）。
3. `FlowSurfaceHost.renderBlockDom` `case 'component'` 与 overlay 组件项同样。
4. `FlowWorkspace`：稿纸 `case 'component'`；`renderFlowOverlayCardContent` 在 `nativeOverlayMedia` 为 null 且 `item.kind === 'component'` 时挂载/后备。包字节从 `useEditorStore.getState().componentPackages` 读，测试可继续只传 `assetFiles`。
5. Spatial **运行**：`createWorldItem` 遇到 `kind === 'component'` 不要走蓝色 rect；在 host 的 HTML overlay 层按 frame 绝对定位挂载。image/video/text/shape 分支一字不改。
6. Spatial **编辑**：`Workspace.tsx` 世界/HUD 的 `external-component` / `kind === 'component'` 同样挂 HTML，不要只画 `node.name || '组件'`。命中保持现有 selection id。

## 最小验证

```powershell
npx vitest run tests/unit/publishedComponentMount.test.ts tests/unit/flowSurfaceHost.test.ts
```

然后 `git diff --check`。

禁止跑 spatial host 以外的全量。若只改了 Spatial 运行分支、helper 测试不够覆盖，可 **额外** 跑 `tests/unit/spatialSurfaceHost.test.ts`，仍然总共不超过两个命令。

## 完成判定

- [ ] 三种 Published/试运行表面：有包可挂载，缺包有 `src` 或可见文案
- [ ] Flow 编辑稿纸+浮层不再用「浮层」冒充组件
- [ ] Spatial 编辑世界/HUD 不是纯 SVG 蓝框冒充组件
- [ ] 未引入 PlayerApp，未改 API 数字
- [ ] 已 push `cursor/p8-flow-spatial-components-de5c`
- [ ] 有 `P8_HANDOFF.md`

## 下游

P5-persist 等本任务合入后再改宿主背景。T6 课例：三表面各放目录组件，编辑改属性 → 试运行点一下 → 保存重开仍在。
