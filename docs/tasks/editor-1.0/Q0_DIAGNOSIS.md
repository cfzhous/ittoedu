# Q0 教师回归缺陷定位（2026-08-18）

> 状态：定位完成。不是再做一遍 P1–P8。  
> 产物：本文件 + [Q0_FIX_PLAN.md](Q0_FIX_PLAN.md) + Q1–Q5 任务卡。  
> 父代理合入；工人只领一张 Q 卡。

P1 / P3 / P4 / P7 已合入 `main`，但教师仍看到 7 类问题。根因是**接线不完整或故意的 scope 切换**，不是“再写一套画布”。

## 症状 → 源码事实

### 1. 演示页点击全局控制器会跳到全局层

**复现：** 编辑演示页面（`editingScope === 'scene'`）时点击画布上的教师控制器。

**机制：**

1. `Workspace.tsx` 的 `onPointerDownCapture` 先走 `createV9TeacherControllerAuthoringController().pointerDown`。该 kernel **不检查** `session.scope`，命中后带 `target` 返回。
2. `controllerGestureConsumed(overlay, preview, target)` 为真时调用 `store.selectNode(layerItemId)`。
3. `editorStore.selectNode`（slide-authoring 分支）用 `scopeTokenForSelectingRow`：全局 owner → `setScope('global')`。
4. `Workspace` 把 Phaser `document` 换成只有 `globalLayer` 的 `__editor_global_layer__`，画布标签变成「全局层」。左栏 `global-layer-entry` 高亮。

无限画布同类：`spatialWorldAuthoring.ts` 命中 `coordinateSpace === 'viewport'` 时调用 `ensureGlobalScope`，清空世界选择。

总纲已写：**编辑态控制器 inert，运行态可拖可点、只改会话。** 当前编辑态并不 inert。

### 2. 全局层文字 / 图片不能拖、不能改大小

**机制（Slide）：**

- `workspaceSlideAuthoring.ts` `nativeFrames()` **只收集 `layer.source === 'scene'`**。
- `writableNativeTransforms()` 因此对全局选择永远是 `[]`。
- `transformSlideNativeLayers` 在 `session.scope !== 'scene'` 时直接 `SLIDE_REJECT_WRONG_OWNER`。
- `transformSelectedSlideNativeLayers` 拒绝 `layer.source !== 'scene'`。
- V9 backend 存在时 Phaser `onNodeMoveEnd` / `onNodeResizeEnd` **被丢掉**，变换只能走上述 kernel。

教师控制器有单独的 `commitTeacherControllerAuthoringFrame`；普通全局 Native **没有**对等的 frame 写入。

`updateSlideNativeLayerContent` 经 `requireUnlockedSceneLayer` 要求 scene scope，全局文字属性同样写不进去。

无限画布 HUD 非控制器物件：`writableViewportTransforms` 在 `scope === 'global'` 时可用；世界物件在误入全局 scope 后不可变（与症状 1 叠加成“时好时坏”）。

### 3. 文字格式在试运行 / 预览无效

编辑态 iframe 走 Phaser `renderTextNodeCanvas`（`src/shared/textLayout.ts`），**node.style + runs** 都会画。

试运行 / 整课预览走 CoursePlayer：

| 宿主 | 现状 |
|---|---|
| `SlidePublishedAdapter.applyNativeTextStyle` | 只用 `data.style`，`textContent = data.text`，**丢弃 runs** |
| `SpatialSurfaceHost` SVG `<text>` | 只用 fill / font-size / font-family，无粗斜体、无 runs |
| `FlowSurfaceHost.appendRichText` | **已**用 `flowRichTextSegments`，本项不改 Flow 正文 |

属性面板改 `style` 若能写入 V9，试运行应能看到字号/颜色；工具栏改 **runs** 则 Slide/Spatial 试运行一定看不见。

### 4. 流式讲义不能编辑图片

P3 只保证稿纸 `<img src=blob>` 能看见。`FlowBlockProperties` 对 `type === 'media'` **没有任何**替换、alt、caption、layout 控件。`updateFlowEditorBlock` 已存在，只是没接到 UI。环绕排版本轮不做。

### 5. 场景图层里仍有全局控制器

`groupedVisualRows` 已把控制器从「场景 / 本页 / 世界」挪到「全局」分组，但：

- 编辑演示页时图层树仍列出控制器（`v9GlobalLayerUiAdapter` 断言如此）。
- 画布仍能点中控制器（症状 1），所以教师仍觉得“场景图层里有控制器”。

目标：场景/世界编辑时图层树**不出现**控制器；只有点左栏「全局层」后才列出。画布上控制器可见但 inert。

### 6. 无限画布插入视频有时失败；成功后试运行也不能播

**插入失败（时好时坏）：** `addSpatialWorldVideoLayer` 调用 `requireWorldScope`。若刚点过控制器而 `session.scope === 'global'`，插入抛错。`addVideoNode` 空间分支把 `expectedRevision: present.revision` 传给可能已改写过 assets 的 session，偶发 `stale-revision`。

**试运行不能播（稳定缺陷）：**

1. `SlidePublishedAdapter` 有 `resolveAsset ?? payload.assets[id].url`。`SpatialSurfaceHost.#resolveAsset` **只有** `options.resolveAsset`，没有 payload 回退。
2. `mountSpatialLocationTryRun` **不传** `resolveAsset`。Mixed 整课预览经 `SpatialPublishedAdapter` 会传，所以“有时能看见”。
3. 世界视频画在 **带 camera transform 的 SVG `foreignObject` 里**。Chromium/Electron 对变换后的 SVG 内 `<video>` 经常不解码。即使 URL 正确也不能播。

### 7. 稳定性 / 时好时坏

不是再做一次 Store 大拆（总纲禁止）。本轮能消掉的竞态：

- 误入全局 scope 后世界插入/变换全部失败。
- Spatial 当前位置试运行与整课预览两条宿主接线不一致。
- 过期 `expectedRevision` 被 `persistSpatialResult` 写成 `errorMessage`（英文 `stale-revision`），教师以为“没反应”。

不做：全量会话重挂治理、拆 `editorStore.ts` / `Workspace.tsx`。

## 不在本轮

- Flow 图文环绕 / 复杂排版。
- 把 Phaser `PlayerApp` 接回 Mixed 试运行。
- V10 统一图层、每页复制控制器、改 V9 判别器。
- 宣称 `accepted` / `art candidate`。
