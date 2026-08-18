# Q1 编辑态教师控制器 inert，场景图层不再列出

> 状态：**可领取**  
> 症状：Q0 #1、#5  
> 车道：Q  
> 合同变化：无  
> 工人先读：[02_WORKER.md](02_WORKER.md)、[Q0_FIX_PLAN.md](Q0_FIX_PLAN.md)

## 一句话

编辑演示页或无限画布**世界**时，点击教师控制器不得 `setScope('global')` / `ensureGlobalScope`。图层树仅在 `editingScope === 'global'` 时列出控制器。运行态接线不动。

## Git

1. 不要在别人的 worktree 上改。
2. `git fetch origin main`
3. 从当前集成分支（含 Q 文档的 HEAD，或 `origin/main` 若文档已合入）建  
   `cursor/q1-controller-inert-489b`
4. 每逻辑步一次 commit。push。**不要开 PR。**
5. 写 `docs/tasks/editor-1.0/Q1_HANDOFF.md`

## 允许修改

```text
src/renderer/authoring/v9TeacherControllerAuthoring.ts
src/renderer/authoring/spatialWorldAuthoring.ts
src/renderer/ui/NodesTab.tsx
tests/unit/v9GlobalLayerUiAdapter.test.tsx
tests/unit/teacherControllerRuntimeSession.test.ts   （仅当必须扩控制器 kernel 断言）
docs/tasks/editor-1.0/Q1_HANDOFF.md
```

## 禁止

- `Workspace.tsx`、`editorStore.ts`、`teacherControllerDom.ts`、任何 Player 宿主。
- 把控制器写入 scene `layerItems`。
- 改 `groupedVisualRows` 的「控制器不得出现在场景/本页/世界」规则；只在 **NodesTab 渲染**时按 `editingScope` 再滤一层。
- 运行态 inert 化（试运行必须仍可点）。

## 基线（不要回退）

- `v9SlideHitAdapter.ts`：scene scope 下 teacher-controller `hittable === false`。保持。
- `TeacherControllerAuthoringChrome`：`pointerEvents: 'none'`、`getInteractive: () => false`。不要改这个文件（不在允许列表）。
- `groupedVisualRows` 纯函数测试继续：控制器只在 `id === 'global'` 分组。

## 逐步算法

### A. Slide 控制器 kernel 在非 global scope 不消费手势

文件：`v9TeacherControllerAuthoring.ts` `pointerDown`（约 443）。

现在：命中后一定带 `target`，Workspace 会 `selectNode`。

改为：

1. `const backend = readCandidate()` 后读 `backend.getSession().scope`。
2. 若 `scope !== 'global'`：`gesture = null`，`preview = null`，返回 `v9Result(backend, options)` **不要**传 `target` / `preview`。这样 `controllerGestureConsumed` 为 false，事件落到 `slideAuthoringRef.pointerDown`。
3. 若 `scope === 'global'`：保持现有 move/resize 手势与 `commitTeacherControllerAuthoringFrame`。
4. `pointerMove` / `pointerUp`：若无 gesture，保持现有空操作。不要在 scene scope 误 commit。

`inert: true` 字段已在结果里，不要删。

### B. Spatial：viewport 上的控制器在世界编辑时当未命中

文件：`spatialWorldAuthoring.ts` `pointerDown`（约 695）。

现在：`hit?.coordinateSpace === 'viewport'` → `ensureGlobalScope` → `selectSpatialLayers`。

改为：

1. 若 `hit.nativeType === 'teacher-controller'` 且 `host.getSession().scope !== 'global'`：不要 `ensureGlobalScope`，不要 select 该 id。继续后面的 world hit / pan 分支（把控制器当穿透）。
2. 其他 viewport HUD（全局文字/图片）保持：命中后 `ensureGlobalScope` 再 select。那是进全局层编辑非控制器物件，符合「左栏全局层」；本卡不改非控制器 HUD。
3. `scope === 'global'` 时控制器仍可 select + `viewport-move` / resize（现有 `writableViewportTransforms`）。

### C. 图层树：场景编辑不列出控制器

文件：`NodesTab.tsx` 的 `NodesTab` 组件，**不要改** `groupedVisualRows` 函数体。

1. `const editingScope = useEditorStore(...)` 已存在。
2. 在 `layerGroups` 用于渲染处：若 `editingScope !== 'global'`，每组 `rows` 再 `filter((row) => !row.isTeacherController)`；过滤后 `rows.length === 0` 的组不要渲染。
3. `groupedVisualRows` 单测保持控制器在「全局」数组里（纯函数）。
4. 改 **render** 测试：`injectCandidate()` 后默认 scene scope 下  
   `screen.queryByTestId('node-item-teacher-controller-main')` 为 null；  
   `layerGroupNodeIds('scene')` 仍不含控制器；  
   `useEditorStore.getState().setEditingScope('global')` 后再 render，控制器出现在 `nodes-layer-group-global`。
5. 现有 `shows unified effective-layer...` 里 `getByTestId('node-source-teacher-controller-main')` 会失败——改成「scene 下 query null，global 下 get」。不要删「场景分组没有控制器」断言。

### D. kernel 单测

在 `v9GlobalLayerUiAdapter.test.tsx` 或 `teacherControllerRuntimeSession.test.ts` 增加：

- 打开 V9 slide session，`scope === 'scene'`，对控制器 frame 中心 `pointerDown`：结果 **没有** `target`（或 `controllerGestureConsumed` 所需的 target/preview 为空）。
- `setScope('global')` 后再 `pointerDown`：有 `target.layerItemId`。

不要起 Phaser，不要渲染 `Workspace`。

## 最小验证

```powershell
npx vitest run tests/unit/v9GlobalLayerUiAdapter.test.tsx
```

若改了 `teacherControllerRuntimeSession.test.ts`，再跑该文件。然后 `git diff --check`。

## Gate

- scene scope 点控制器坐标：kernel 不给 target。
- global scope 仍能拖控制器（现有 authoring 测试不弱化）。
- NodesTab：scene 看不见控制器 icon；`setEditingScope('global')` 后能看见且仍在「全局」分组。
- 未改 Player、未改 Schema。

## 停手

允许列表不够、需要改 `selectNode` / `Workspace.tsx` → 停，写 HANDOFF。不要自己扩大防火墙。
