# P1 运行态视频与教师控制器

> 依赖：T0 已把工作区控制器/图层补丁从混杂 diff 里分离  
> 并行：可与 P3、P6、P7、T2、T4 分树；与 P4 抢 `SpatialSurfaceHost.ts` 时先做本任务  
> 合同变化：无  
> 车道：P

## 目标

当前位置试运行和整课预览里：全局控制器可拖、按钮可执行（只改会话）；Slide / Flow 浮层 / Spatial 世界的视频能播。不把试运行打回 Phaser `PlayerApp`。

## 允许修改

```text
src/player/surfaces/slide/SlidePublishedAdapter.ts
src/player/surfaces/flow/FlowSurfaceHost.ts
src/player/surfaces/spatial/SpatialSurfaceHost.ts
src/player/surfaces/publishedDynamicHosts.ts
src/player/teacherControllerDom.ts          （仅命中/坐标，不改布局协议）
src/renderer/ui/coursePlayerTryRun.ts
src/renderer/ui/flowLocationTryRun.ts
src/renderer/ui/spatialLocationTryRun.ts
tests/unit/slidePublishedAdapter.test.ts    （若已有则扩；否则新建一个宿主测试）
tests/unit/flowSurfaceHost.test.ts          （同上，1 个文件即可）
```

不要改 `courseProjectSchema.ts`、`editorStore` 激活路径（那是 P2）、不要重写 `Workspace.tsx` 手势。

## 工作项

1. Slide / Flow 宿主在 `onSessionChange` 把 controller `offset` 写回 DOM（Spatial 已有 `#applyRecord`，对齐即可）。
2. Flow 运行浮层改为相对舞台定位，去掉铺满窗口的 `position: fixed; inset: 0`（或等价地限制在 host 内）。
3. Slide CSS `scale` 下，控制器 hit-test 使用逻辑 1280×720，而不是被变换打偏的 client 盒。
4. `createPublishedCourseSession` 已接 `navigate` → Mixed navigator；当前位置 `mountFlowLocationTryRun` / `mountSpatialLocationTryRun` 同样传入课程导航或 `executeTeacherControllerAction`。`playback.controls === 'none'` 时仍不挂控制器。
5. `SlidePublishedAdapter.appendLayerNode` 增加 `video`（`<video controls>` + `resolveAsset`）。Flow `renderStaticOverlayItem` 增加 video。Spatial `createWorldItem` 增加 video；image 的 `href` 为空时不要挂空 SVG image 冒充完成。
6. 不要改编辑态 `TeacherControllerAuthoringChrome` 的 inert 合同。

## 最小验证

只跑本任务新建或扩展的 **一个** 宿主测试文件，例如：

```powershell
npx vitest run tests/unit/slidePublishedAdapter.test.ts
```

若该文件不存在，本任务创建它并只跑它。然后 `git diff --check`。

不要跑 Player 全量、e2e、desktop build。

## Gate

- 整课预览与当前位置试运行：拖控制器画面跟着动（会话 offset，不写工程）。
- 下一页 / 上一页 / 跳转在 Mixed 会话内生效。
- Slide 层、Flow 浮层、Spatial 世界能出现可播 `<video>`（有 asset URL 时）。
- 未改 Schema，未改 `canvasMode` 激活逻辑。

## 下游

P2 依赖本任务才能验收「跳转后控制器仍可用」。P4 若本任务已改 Spatial 视频，则 P4 只做编辑态与选中框。
