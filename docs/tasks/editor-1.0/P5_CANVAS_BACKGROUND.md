# P5 画布默认白、可改颜色

> 依赖：持久化字段等 T1；CSS 默认白可先于 T1  
> 并行：CSS 可与 P4 分树，合入时不要互相覆盖 spatial viewport 背景  
> 合同变化：无（字段在 T1）。本任务只接线  
> 车道：P

## 目标

Slide / Flow / Spatial 编辑与运行画布默认白色。教师可改颜色，值写入 V9（Slide 场景字段；Spatial/Flow 用 T1 的可选 `backgroundColor`，缺省 `#ffffff`）。

## 允许修改

```text
src/renderer/styles/globals.css
src/renderer/ui/Workspace.tsx                 （Spatial 视口背景读取文档）
src/renderer/ui/FlowWorkspace.tsx             （稿纸/页铬读取文档，若 T1 加了 Flow 字段）
src/renderer/ui/PropertiesTab.tsx             （Spatial/Flow 背景色控件；Slide 已有则不要改语义）
src/renderer/store/editorStore.ts             （只改 derivedV8ProjectFromSpatial 的 backgroundColor 来源，禁止再写死 #111318）
src/player/surfaces/spatial/SpatialSurfaceHost.ts
src/player/surfaces/flow/FlowSurfaceHost.ts   （仅文章/舞台背景）
src/renderer/course/spatialEditorCommands.ts  （更新表面 backgroundColor 的 command，若尚无）
tests/unit/spatialCanvasBackground.test.ts    （新建 1 个）
```

T1 未合入时：**禁止**改 `courseProjectTypes.ts`。只把 CSS 从 `#111318` 改为 `#ffffff`，属性面板可以暂缺。

## 工作项

1. `.workspace--spatial .canvas-viewport` 默认白；暗色网点改为在浅底上可读，或随背景亮度切换。
2. `derivedV8ProjectFromSpatial` 读取 V9 字段，缺省 `#ffffff`。
3. T1 字段合入后：属性「画布背景色」写入 Spatial surface；试运行 SVG/host 与编辑视口同一颜色。
4. Slide 继续用场景 `backgroundColor`，默认白，不改字段名。
5. Flow 稿纸保持白；若 T1 给了 Flow 字段，属性可改页铬/稿纸底。
6. 旧工程无该字段视为白，不得在打开时写成黑再保存。

## 最小验证

T1 未合入、只改 CSS 时，只跑现有 round-trip 夹具不作为本任务验证；对本任务 diff：`git diff --check`。并新增或运行：

```powershell
npx vitest run tests/unit/spatialCanvasBackground.test.ts
```

若本阶段还没有测试文件（纯 CSS），在 HANDOFF 写明，T1 合入后的接线提交必须带上该测试。

## Gate

- 新建无限画布看起来是白底。
- 改色后保存重开颜色还在（字段合入后）。
- 没有把底色只写进假 V8 投影。

## 下游

T6 三种表面新建课例截图对照。
