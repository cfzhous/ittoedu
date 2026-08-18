# P4 Spatial 选中框、编辑媒体、试运行媒体

> 依赖：与 P1 抢 `SpatialSurfaceHost.ts` 时先 P1  
> 并行：编辑态文件可与 P1 分树，合入前 rebase host  
> 合同变化：无  
> 车道：P

## 目标

无限画布编辑：旋转时选中框（或盒）跟着转；图片继续显示；视频可见可编。试运行：图片与视频可见（视频可播若 P1 已接线，否则本任务补 `createWorldItem`）。

## 允许修改

```text
src/renderer/ui/Workspace.tsx                 （只改 SpatialLocationWorkspace / SpatialSelectionOverlay）
src/renderer/authoring/stageViewportTransform.ts
src/player/surfaces/spatial/SpatialSurfaceHost.ts   （仅当 P1 未改 world video/image）
src/renderer/styles/globals.css               （只改 spatial-world-item / selection overlay，不在本任务改画布底色）
tests/unit/spatialWorldViewTransform.test.ts
```

不要改 `canvasMode`（P2）、不要改 Spatial `backgroundColor` 字段（T1/P5）。

## 工作项

1. `stageSelectionOverlayGeometry`：单选时 `selectionBox` 跟 `rotation` 走（盒旋转或画旋转边框），手柄已按旋转计算则保持。
2. `SpatialSelectionOverlay` 把旋转应用到框，而不是轴对齐 `left/top/width/height`。
3. 世界层与 HUD：`video` 走封面或 `<video>`，不要落到 `node.name`。
4. 试运行 `createWorldItem`：image 必须有有效 `href`；video 挂可播元素或明确封面，禁止空 SVG image。
5. 世界与 HUD 坐标空间分离保持不变。

## 最小验证

只跑：

```powershell
npx vitest run tests/unit/spatialWorldViewTransform.test.ts
```

若几何断言不够，只再扩这一个文件。然后 `git diff --check`。

## Gate

- 旋转图片时框跟着重绘。
- 编辑态能看见视频物件。
- 试运行能看见已解析的图片；视频不再是空白标签块。

## 下游

P5 改画布底色时不要覆盖本任务的 overlay CSS。
