# 电磁感应·磁通量实验台组件

该 V4 DOM 组件服务于“预测 → 证据 → 模型 → 方向 → 迁移”的概念重建。器材图不由 CSS 或 Three.js 假造，而是使用包内离线图像；图表、时间指针和可访问控件由 Canvas / DOM 完成。

## 正式素材

- `assets/induction-apparatus-neutral-crop.png`：内置 ImageGen 生成的暖象牙色实验装置。提示词要点：白色棚拍产品摄影，完整不透明铜线圈、右侧指针式检流计、左侧留空的直线导轨，无磁体、无文字、无剪开或透明线圈。最终 neutral 版去掉了表盘中的固定指针，以便运行时叠加实时指针。
- `assets/bar-magnet-cutout.png`：内置 ImageGen 生成并去背裁切的蓝左红右条形磁体，无文字。`S / N` 字母在运行时从 `props.content.common` 叠加，保持可编辑。

实际 `.h5component` 包只收录上述两张正式素材、`manifest.json`、`runtime.js` 和 `thumbnail.png`。色键图、未裁切磁体以及非 neutral 装置图属于生成中间源，不纳入仓库与组件包。

## 位置约束

- 底图裁切尺寸为 `1672 × 585`；线圈左口约为 `x=815`，水平轴中心约为 `y=275`。
- 磁体纵向固定在舞台高度的 `46.8%`，只允许水平拖动。
- 最右停靠位保证磁体右端在线圈左口之前，留有可见物理间隙，不进入、不穿过线圈。

## 构建

主课程生成脚本使用 Vite library IIFE 模式把 `runtime.entry.ts` 打包为无 `import` / `export` / `require` 的 `runtime.js`。组件仅支持 `scene` 作用域，完整实现 `resize / updateProps / setVisible / suspend / resume / prepareCapture / destroy` 生命周期。
