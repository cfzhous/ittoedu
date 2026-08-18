# P8 Flow / Spatial 互动组件

> 依赖：P1、P3、P4 已合入（同改 `FlowSurfaceHost` / `SpatialSurfaceHost` / `FlowWorkspace` / Spatial `Workspace`）  
> 并行：否。不要与 P1/P3/P4 同时改这些文件  
> 合同变化：无（仍是 Component API 4）  
> 车道：P  
> 状态：**已入计划（12.3），后续实现。** 正在跑的 P1–P7 子智能体不要改本任务范围。

## 目标

流式讲义与无限画布中的互动组件，在编辑态可看见、可命中、可改属性；在当前位置试运行与整课预览中可交互。包缺失或打印/捕获时才用静态后备。不另造组件运行时，不复制 CourseStudio。

同一 CoursePlayer 路径上，`SlidePublishedAdapter` 目前也只画后备。本任务抽出共用挂载后，Slide 试运行一并接上，避免三种表面三套假完成。

## 允许修改

```text
src/player/ComponentRegistry.ts
src/player/componentHostActions.ts
src/player/surfaces/flow/FlowSurfaceHost.ts
src/player/surfaces/spatial/SpatialSurfaceHost.ts
src/player/surfaces/slide/SlidePublishedAdapter.ts
src/renderer/ui/FlowWorkspace.tsx
src/renderer/ui/Workspace.tsx          （只改 Spatial 世界/HUD 组件绘制与命中，不改 Slide 手势）
src/renderer/course/flowSharedAuthoringAdapters.ts   （仅当挂载需要包元数据）
新建窄宿主 helper（例如 src/player/surfaces/publishedComponentMount.ts）若能避免三处复制
tests/unit/flowSurfaceHost.test.ts
tests/unit/spatialSurfaceHost.test.ts
或新建 tests/unit/publishedComponentMount.test.ts（1–2 个文件上限）
```

不要改 Component API 版本、不要改 V9 判别器、不要重写 `editorStore` 后端。

## 工作项

1. Flow 编辑：`case 'component'` 不再只显示包名；稿纸块挂真实组件或至少带 `src` 的后备图 + 可命中框。浮层组件同样，不要 `label || '浮层'`。
2. Flow 运行：`renderBlockDom` / `renderStaticOverlayItem` 在有包时挂 Component API 4；仅缺包或 capture 时用 `staticFallbackAssetId`。
3. Spatial 编辑：世界与 HUD 的 `external-component` / `kind === 'component'` 挂 HTML 组件层（不要只把组件画进 SVG 矩形）。保持世界/视口坐标分离。
4. Spatial 运行：`createWorldItem` / viewport HUD 同样挂载；SVG 只作世界几何，组件用 HTML overlay 对齐 frame。
5. Slide Published 试运行：把同一 helper 接到 `appendLayerNode` 的 component 分支。
6. 编辑态命中走稳定 `authoringAddress`，属性栏继续用现有 Components/Properties。双击换图/改字沿用 Slide 已有组件 authoring target 协议，能接多少接多少，不要新造第三套 target 模型。
7. 静态后备图必须有真实 URL（sidecar / resolveAsset），禁止无 `src` 的 `<img>`。

## 最小验证

只跑本任务的 1–2 个 Vitest 文件，例如：

```powershell
npx vitest run tests/unit/flowSurfaceHost.test.ts tests/unit/spatialSurfaceHost.test.ts
```

若新建了 `publishedComponentMount.test.ts`，可只跑那一个再加其中一个 host 测试。然后 `git diff --check`。

禁止 `npm test` / typecheck / e2e / `build:desktop`。

## Gate

- Flow 稿纸与浮层：有包时编辑能看见组件，试运行能交互。
- Spatial 世界与 HUD：同上。
- 缺包时显示后备图或明确后备文案，不出现空白盒子冒充完成。
- 未改 Component API 数字，未复制 CourseStudio。

## 下游

T6 课例：三种表面各放一个目录组件，编辑改属性 → 试运行点一下 → 保存重开仍在。
