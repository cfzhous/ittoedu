# P5 画布默认白、可改颜色

> 工人先读：[02_WORKER.md](02_WORKER.md)

本卡两段。**禁止**一个 commit 既改 CSS 又改 Schema。T1 字段与 CSS 必须分开（CSS 已分开并合入）。

---

## P5-CSS（已合入，禁止重做）

已在集成分支：

- `.workspace--spatial .canvas-viewport` 默认白
- `derivedV8ProjectFromSpatial` 的场景底目前是字面量 `'#ffffff'`（还没读 V9 字段）
- `tests/unit/spatialCanvasBackground.test.ts` 用 `resolveCourseSurfaceBackgroundColor`

不要再把 CSS 改回 `#111318`。

---

## P5-persist（未合入，可领取）

> 依赖：T1 E 已合入（`backgroundColor?`）；**必须等 P8 合入后再改宿主**（同改 `FlowSurfaceHost` / `SpatialSurfaceHost` / `FlowWorkspace` / Spatial `Workspace`）  
> 并行：否（相对 P8）  
> 合同变化：无  
> 车道：P

### 一句话

教师能在属性里改 Spatial/Flow 画布颜色，值写入已有可选字段；编辑视口与试运行宿主读同一字段。缺省与旧工程 = `#ffffff`。打开时不得把缺省写成黑再保存。

### 基线

- 类型：`SpatialSurfaceDocument.backgroundColor?`、`FlowSurfaceDocument.backgroundColor?`
- 读取：`resolveCourseSurfaceBackgroundColor` / `DEFAULT_COURSE_SURFACE_BACKGROUND_COLOR`（`src/shared/courseProjectModel.ts`）
- Slide 场景 `backgroundColor` 已有属性 `ColorInput id="scene-background"`（`PropertiesTab.tsx` 约 2321）→ **不要改语义、不要改 id**
- Spatial 属性：`SpatialPageProperties`（约 1999）现在没有画布色
- Flow 属性：`FlowPageProperties`（约 2065）现在没有稿纸色
- `spatialEditorCommands.ts` **没有** 改 surface `backgroundColor` 的 command
- 宿主 SVG/文章背景还没读该字段

### 允许修改

```text
src/renderer/ui/PropertiesTab.tsx              只给 SpatialPageProperties / FlowPageProperties 加 ColorInput
src/renderer/ui/Workspace.tsx                  只改 Spatial 视口 style 背景读取文档；禁止改手势/试运行启动
src/renderer/ui/FlowWorkspace.tsx              只改稿纸/页铬背景读取 surface.backgroundColor
src/renderer/store/editorStore.ts              只改 derivedV8ProjectFromSpatial 的 backgroundColor 来源（用 resolveCourseSurfaceBackgroundColor），禁止再写死 #111318
src/player/surfaces/spatial/SpatialSurfaceHost.ts  只改舞台/SVG 底色
src/player/surfaces/flow/FlowSurfaceHost.ts        只改文章/舞台背景，禁止改组件/视频/控制器
src/renderer/course/spatialEditorCommands.ts   新增 updateSpatialSurfaceBackgroundColor
src/renderer/course/flowEditorCommands.ts      或 flowDocumentModel.ts：新增 updateFlowSurfaceBackgroundColor（二选一，HANDOFF 写明）
src/renderer/store/editorStore.ts              若必须薄封装 runSpatialCommand / applyFlowCommand，只加这两个 setter，禁止改 backend
tests/unit/spatialCanvasBackground.test.ts     扩展：改色后文档字段在、缺省不写入黑
docs/tasks/editor-1.0/P5_HANDOFF.md
```

不要改 `courseProjectTypes.ts` / schema。

### 规定 command 形状

```ts
updateSpatialSurfaceBackgroundColor(session, backgroundColor: string)
updateFlowSurfaceBackgroundColor(session, backgroundColor: string)
```

- 合法 CSS 色（与现有 `ColorInput` 一致）写入 surface 字段，bump revision。
- 空 / 非法 → 拒绝或忽略，不要写成 `#111318`。
- **不要**在打开工程时把 `undefined` 规范成写回磁盘的 `'#ffffff'`（读取用 resolve；持久化保持 omitted = 白）。

### 属性 UI

- Spatial：`data-testid="spatial-canvas-background"`，label `画布背景色`
- Flow：`data-testid="flow-paper-background"`，label `稿纸背景色`
- 使用已有 `ColorInput` 组件，不要新设计器。

### 宿主

- Spatial 运行 SVG 根 fill = `resolveCourseSurfaceBackgroundColor(surface.backgroundColor)`
- Flow 运行文章/舞台背景同样
- 编辑视口同样
- 试运行 chrome 若仍是深色边框可以保留；**画布内容区**必须跟字段走

### 最小验证

```powershell
npx vitest run tests/unit/spatialCanvasBackground.test.ts
```

然后 `git diff --check`。

断言至少包括：

1. 省略字段 → resolve 为 `#ffffff`，打开后字段仍是 `undefined`（不要脏写）。
2. 调用 update command 后字段等于给定色，再 round-trip 命令结果里还在。
3. `derivedV8ProjectFromSpatial` 的 `scenes[0].backgroundColor` 等于 resolve 后的值。

### 完成判定

- [ ] 属性可改 Spatial/Flow 色并写入 V9 可选字段
- [ ] 缺省白，旧工程不因打开被存成黑
- [ ] 编辑与宿主同色
- [ ] Slide 场景色控件未改语义
- [ ] 已 push `cursor/p5-canvas-persist-de5c`
- [ ] 有 `P5_HANDOFF.md`

### 下游

T6 三种表面新建课例截图对照。
