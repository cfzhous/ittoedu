# P5 HANDOFF
- 范围：P5-persist，实现 Spatial/Flow 画布与稿纸背景色在 Properties 属性面板中编辑、通过 command 更新、持久化到 SurfaceDocument.backgroundColor 可选字段，并在编辑视口 (Workspace / FlowWorkspace)、试运行宿主 (SpatialSurfaceHost / FlowSurfaceHost) 以及 V8 场景投影 (derivedV8ProjectFromSpatial) 中通过 resolveCourseSurfaceBackgroundColor 统一读取。缺省/旧工程保持 `#ffffff`，打开时不脏写。
- 合同是否变化：否
- 分支 / SHA：cursor/p5-canvas-persist-de5c / a58d1ccb7cbe2be4dd5e49c88e5f32b72cc51683
- 允许列表外改动（必须空，除非重命名机械 import）：无
- 最小验证命令与结果：`npx vitest run tests/unit/spatialCanvasBackground.test.ts` (4 passed, 1.46s)，`git diff --check` 通过
- 未验证（交给 T6）：桌面端与三表面课例视觉截图对照
- 停下来的原因（若有）：无
- 下游：T6 三种表面新建课例截图对照
