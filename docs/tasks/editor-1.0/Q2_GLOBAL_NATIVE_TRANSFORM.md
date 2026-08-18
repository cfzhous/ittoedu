# Q2 全局层 Native 可拖、可缩放、可写内容

> 状态：**可领取**  
> 症状：Q0 #2；全局文字属性写不进 V9  
> 车道：Q  
> 合同变化：无  
> 工人先读：[02_WORKER.md](02_WORKER.md)、[Q0_FIX_PLAN.md](Q0_FIX_PLAN.md)

## 一句话

在 `editingScope === 'global'` 时，Slide 画布对**非控制器**全局 Native（text / image / video / shape）走与场景相同的拖、缩放、旋转，并写入 `globalLayerItems[].item.frame`。属性面板的 style/text 写入同一 owner。教师控制器仍禁止走本命令。

## Git

分支：`cursor/q2-global-native-transform-489b`  
HANDOFF：`docs/tasks/editor-1.0/Q2_HANDOFF.md`

## 允许修改

```text
src/renderer/ui/workspaceSlideAuthoring.ts
src/renderer/course/slideEditorCommands.ts
src/renderer/course/slideAuthoringBackend.ts
src/renderer/course/v9SlideContentCommands.ts
tests/unit/v9SlideViewportAdapter.test.ts
docs/tasks/editor-1.0/Q2_HANDOFF.md
```

## 禁止

- `v9TeacherControllerAuthoring.ts`、`commitTeacherControllerAuthoringFrame`。
- `Workspace.tsx`、`editorStore.ts`、Phaser `EditorScene`。
- 把全局物件写进 `scene.layerItems`。
- 改 Schema / Published 类型。

## 基线

- `transformSlideNativeLayers`（`slideAuthoringBackend.ts` 约 819）在 `scope !== 'scene'` 时 reject。
- `nativeFrames()`（`workspaceSlideAuthoring.ts` 约 150）`if (layer.source !== 'scene') continue`。
- `transformSelectedSlideNativeLayers` 拒绝 `layer.source !== 'scene'`。
- `updateSlideNativeLayerContent` → `requireUnlockedSceneLayer` → 全局文字改不了。

## 逐步算法

### A. 变换命令接受当前 owner

`slideEditorCommands.ts` `transformSelectedSlideNativeLayers`：

1. 增加参数或从 session 传入 `scope: 'scene' | 'global'`。不要新造 `projectMode`。
2. 校验 `layer.source === scope`（global 选择不得改 scene 层，反之亦然）。
3. 若任一层 `nativeType === 'teacher-controller'`：抛 `SLIDE_REJECT_WRONG_OWNER`（文案可沿用「教师控制器不由本命令编辑」）。
4. `scope === 'scene'`：保持现有写入 `scene.layerItems` / 命名状态 override。
5. `scope === 'global'`：在 `commitSlideProjectMutation` 里对 `draft.globalLayerItems` 按 `layerItemId` 写 `frame` + `rotation`。不要碰 `visibility`。不要写 scene override。

`slideAuthoringBackend.ts` `transformSlideNativeLayers`：

- 允许 `session.scope === 'scene' || session.scope === 'global'`。
- 把 `session.scope` 传给上面的函数。
- `surface` scope 本卡不实现；若遇到，仍 reject（不要假装成功）。

### B. 画布 kernel 收集当前 scope 的 frame

`workspaceSlideAuthoring.ts`：

1. `nativeFrames`：收集 `layer.source === session.scope` 的 native/component/runtime frame。**排除** `nativeType === 'teacher-controller'`。
2. `layerTargets` 已按 `session.scope` 过滤，保持。
3. `writableNativeTransforms` 无需改逻辑，会自动拿到全局 frame。
4. 不要在 kernel 里 `setScope`。

### C. 全局 Native 内容补丁

`v9SlideContentCommands.ts`：

1. 抽出或并列 `requireUnlockedOwnedLayer(session, layerItemId)`：  
   - `session.scope` 必须等于该层 `source`。  
   - scene 行为与现在 `requireUnlockedSceneLayer` 相同。  
   - global：在 `globalLayerItems` 找到 item；locked 拒绝；teacher-controller 拒绝。
2. `updateSlideNativeLayerContent` 用 owned 版本。global 写入 `entry.item.content.data`（已有 `mergeCourseNativeData`）和 `label`。
3. 现有 scene 测试不得弱化。

### D. 测试（只扩 `v9SlideViewportAdapter.test.ts`）

夹具里已有 `globalLayerItems: [scoped(nativeText('global-banner', ...))]`。

1. `setScope('global')`，`selectLayers(['global-banner'])`。
2. `pointerDown` 在 banner 中心 + `pointerMove` 偏移 20px + `pointerUp`。
3. 断言 `history.present.globalLayerItems` 中该条 `frame.x/y` 变了；`scenes[0].layerItems` 未变。
4. 再测 resize 手柄（用现有 `stageResizeHandleWorldPoint`）。
5. 选中 teacher-controller（若夹具没有则 `scoped` 加一条）调用 `transformNativeLayers`：必须 `ok === false` 且 reason 为 wrong-owner。
6. `updateSlideNativeLayerContent` 在 global scope 改 `nativeData.style.bold`：全局 item 更新，scene 文字不变。

不要渲染 Workspace。不要跑 Player。

## 最小验证

```powershell
npx vitest run tests/unit/v9SlideViewportAdapter.test.ts
npx vitest run tests/unit/v9SlideContentCommands.test.ts
```

第二条仅当改了 `v9SlideContentCommands.ts`。然后 `git diff --check`。

## Gate

- 全局文字/图片在 global scope 可拖可缩放并写入 V9。
- 控制器不能走 `transformNativeLayers`。
- scene 变换回归不红。
- 未改 Schema。

## 停手

需要改 `Workspace.tsx` 才能看到选框 → 停。选框应已由 `overlayForSelection` + 现有 Workspace overlay 消费 `preview`。不要自己改 Workspace。
