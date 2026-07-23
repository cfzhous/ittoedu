# 生成素材

本目录中的 SVG 由 `scripts/build-runtime-v3-example.ts` 生成，不应直接手改生成文件：

- `learning-orbit.svg` 是可在编辑器中替换的原生图片示例；
- `*-fallback.svg` 是场景缩略图与 PDF/PPTX 静态化示例。

后备画面中的文字从 Project V7 的 `content.values` 派生，不应手工维护第二套文案。修改内容表后重新运行构建脚本。

`staticFallback` 会按“背景 → 全局 underlay 元素 → 全局运行时 underlay → 场景运行时 underlay → 场景节点 → 场景运行时 overlay → 全局 overlay 元素 → 全局运行时 overlay”的固定顺序合成到左侧场景缩略图，但不会执行运行时源码；`runtime-layer` 透明叠加，`full-scene` 在自身层级清除下方合成后铺满画布。已启用却没有后备的运行时显示“运行时”角标。`scene.presentation.thumbnailStateId` 仍决定稳定节点状态，组件缩略图仍由组件 manifest 的 `thumbnail` 提供，缺失时编辑器显示名称后备框。

PDF/PPTX 会先排空 Runtime API 1 通过 `capture.waitUntil()` 登记的有限任务，再尝试捕获实际运行时层；失败或没有可见结果时才使用同一后备。本兼容示例不冒充 Runtime API 2 的 `prepareCapture()`：需要在捕获前主动渲染 Canvas/WebGL 确定帧的新内容，应改用 Runtime API 2，并在生命周期中完成最终绘制与资源清理。
