# P8 Flow / Spatial 互动组件交接文档

## 1. 任务范围

- 新建 `src/player/surfaces/publishedComponentMount.ts` 作为统一的 Component API 4 DOM 宿主挂载 helper，提供包解析、UTF-16LE 代码解码、运行时执行、Shadow DOM 隔绝容器、生命周期保护边界、交互/属性同步与后备降级（带真实 URL 的 fallback 图片或明确后备文案）。
- Flow 运行态：`FlowSurfaceHost` 的正文组件块 `renderBlockDom` 与浮层组件 `renderStaticOverlayItem` 在有包时挂载 Component API 4，在缺包或 capture/print 时使用带完整 URL 的静态后备。
- Flow 编辑态：`FlowWorkspace` 正文 `case 'component'` 与浮层卡片在有包时挂载编辑态组件，在缺包时展示带 `src` 的后备图或后备信息框，保留稳定 `authoringAddress` 命中盒，不再显示 `label || '浮层'`。
- Spatial 运行态：`SpatialSurfaceHost` 的世界组件（`createWorldItem` foreignObject）与 HUD 视口组件（`createViewportHud`）在有包时对齐 frame 挂载 Component API 4 并在销毁时释放生命周期，保持世界与视口坐标空间分离。
- Spatial 编辑态：`Workspace.tsx` 的世界层与 HUD 层组件通过 `SpatialComponentItemContent` 挂载编辑态组件或带真实 URL 的后备图，保持世界与视口坐标分离与稳定图层命中。
- Slide Published 试运行：`SlidePublishedAdapter` 在 `appendLayerNode` 的 component 分支接入同一挂载 helper，管理组件实例生命周期并在重新渲染/销毁时释放。
- 修复无 `src` 的 `<img>` 缺陷：所有后备图片均通过 `resolveAsset` / `assetUrls` 获取真实 URL，禁止空 `src`。

## 2. 合同与 Schema 变化

- **无合同/Schema 判别器变化**：继续遵守 Course Project V9、Published Course V2 与 Component API 4。
- 未改动 Component API 版本号、未引入新运行时、未复制 CourseStudio 代码。

## 3. 最小验证结果

执行最小验证命令：
```bash
npx vitest run tests/unit/publishedComponentMount.test.ts tests/unit/flowSurfaceHost.test.ts tests/unit/spatialSurfaceHost.test.ts
```
结果：
- `tests/unit/publishedComponentMount.test.ts` (5 tests passed)
- `tests/unit/flowSurfaceHost.test.ts` (14 tests passed)
- `tests/unit/spatialSurfaceHost.test.ts` (7 tests passed)
- `git diff --check`：无空白或格式异常，校验通过。

## 4. 未验证项

- 桌面端打包与 E2E 视觉复核（按约束留待 T6 统一执行）。
- 复杂第三方多页面/多变体组件的跨表面视觉复核（留待 T6 课例阶段验收）。

## 5. 回滚点

- 分支起始点：`origin/cursor/cloud-agent-1787062947578-owgrj` (`a574adb`)

## 6. 下游依赖

- T6 课例验证：三种表面放置目录组件，编辑态改属性 → 试运行交互 → 保存重开。
