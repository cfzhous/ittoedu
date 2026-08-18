# P6 课程树删除、跨组调整、新增文案

> 状态：**已合入，禁止重做**。

> 依赖：无  
> 并行：UI 可与 P1 分树。Store 接线避开 T3 / P2 正在改 `editorStore` 的窗口  
> 合同变化：无（新 command 不改判别器）  
> 车道：P

## 目标

能删除流式讲义整页、能删除混合课里的整组演示/流式/无限画布（最后一处课程位置仍拒绝）。能把第二组的演示页面挪到第一组。主按钮不再把流式/无限画布叫做「新增页面」。

## 允许修改

```text
src/renderer/ui/ScenePanel.tsx
src/renderer/ui/AddCourseContentMenu.tsx
src/renderer/course/courseLocationCommands.ts
src/renderer/course/courseEditorLayout.ts     （仅当主按钮 action 文案需要）
src/renderer/store/editorStore.ts             （只暴露 deleteCourseSurface / 跨组命令包装）
tests/unit/courseTreeReorder.test.ts          （新建或扩 planCourseTreeReorder 测试）
tests/unit/courseLocationCommands.test.ts     （若已有则扩删除/迁移，仍算本任务的第二文件上限）
```

不要改图层树（P7）、不要改 `canvasMode`（P2）。

## 工作项

1. `PRIMARY_LABELS`：`flow-page` →「新增流式讲义」；`spatial-page` →「新增无限画布」；`slide-page` →「新增演示页面」。`scene` 保持「新建场景」。下拉文案已正确则不要改坏。
2. `ScenePanel`：`flow-page` / `slide-page` / `spatial-page` 提供删除，走已有 `deleteCourseSurface`。最后一处 location 禁用并说明原因。
3. 不要对 `flow-block` 调 `deleteCourseLocation` 来删整页（会抛「请通过 Flow 编辑器删除标题块」）。
4. 新增 command：把 `slide-scene` location 迁到另一 `type: 'slide'` 的 surface（更新 `surfaceId`、scene 数组、locations 顺序、print plan 引用）。拒绝迁到 Flow/Spatial。Flow 块跨讲义迁移本任务不做，除非与演示页同一套 API 且测试已覆盖。
5. `planCourseTreeReorder`：允许演示场景 drop 到另一 `slide-page` 组，生成迁移 plan，而不是 `parentKey` 不同就 `null`。整组排序仍用 `reorderCourseSurfaces`。

## 最小验证

只跑：

```powershell
npx vitest run tests/unit/courseTreeReorder.test.ts
```

若删除断言放在 `courseLocationCommands` 测试里，可再加那 **一个** 文件。然后 `git diff --check`。

## Gate

- Flow 课程树能删整本讲义（非最后一课）。
- Mixed 能删掉一整组演示/流式/无限画布。
- 能把第二组场景拖进第一组，保存后 surface 归属正确。
- 流式/无限画布主按钮文案不再是「新增页面」。

## 下游

T6 真人：建三组 → 挪一页 → 删一组 → 撤销/重开。
