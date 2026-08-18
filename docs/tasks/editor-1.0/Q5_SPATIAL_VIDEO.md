# Q5 无限画布视频：插入不误伤 + 试运行真能播

> 状态：**可领取**  
> 症状：Q0 #6、#7（Spatial 部分）  
> 车道：Q  
> 合同变化：无  
> 工人先读：[02_WORKER.md](02_WORKER.md)、[Q0_FIX_PLAN.md](Q0_FIX_PLAN.md)

## 一句话

`SpatialSurfaceHost` 必须能从 Published `assets[].url` 解析视频；世界视频用 **HTML `<video controls>`** 跟相机变换，禁止依赖带 SVG transform 的 `foreignObject`。当前位置试运行与 Mixed 宿主同一套解析。插入命令在缺 asset 元数据时先写入 assets，世界 scope 才能插入。

## Git

分支：`cursor/q5-spatial-video-489b`  
HANDOFF：`docs/tasks/editor-1.0/Q5_HANDOFF.md`

## 允许修改

```text
src/player/surfaces/spatial/SpatialSurfaceHost.ts
src/renderer/ui/spatialLocationTryRun.ts
src/renderer/course/spatialEditorCommands.ts     仅 addSpatialWorldVideoLayer / requireAsset 相邻
tests/unit/spatialSurfaceHost.test.ts
tests/unit/spatialLocationTryRun.test.ts         若已有则扩；没有则新建这一个
docs/tasks/editor-1.0/Q5_HANDOFF.md
```

## 禁止

- `editorStore.ts`（`addVideoNode` 由父代理补。你把 command 层修好）。
- `Workspace.tsx`。
- 改路径/关系 SVG、P8 组件挂载、画布底色。
- 接 Phaser `PlayerApp`。

## 基线

- `SpatialSurfaceHost.#resolveAsset`（约 550）= `options.resolveAsset?.(id)`，无 payload 回退。
- `fromPublishedCourse`（约 320）把 `options` 传入，但 `mountSpatialLocationTryRun` **不传** `resolveAsset`。
- `createWorldItem` 视频：SVG `foreignObject` + `<video src>`。世界组有 `spatialWorldGroupTransform`（SVG transform）。Electron 里这经常不播放。
- Mixed：`SpatialPublishedAdapter` **会**传 `resolveAsset`。所以整课预览与当前位置试运行行为不一致。
- `addSpatialWorldVideoLayer`：`requireWorldScope` + `requireAsset(..., 'video')`。scope 为 global 时失败。

## 逐步算法

### A. resolveAsset 永远有 Published 回退

1. `SpatialSurfaceHost` 保存 `PublishedCourseV2Payload['assets']` 或 `resolveAsset` 闭包。  
   `fromPublishedCourse(course, ...)`：

   ```ts
   resolveAsset: options.resolveAsset
     ?? ((assetId) => course.assets[assetId]?.url)
   ```

   构造函数若只拿到 `PublishedSpatialRuntimeInput`、没有 course.assets：允许 options 缺省为 `undefined`，但 `fromPublishedCourse` 必须接上。

2. `#resolveAsset`：`this.#options.resolveAsset?.(id) ?? this.#publishedAssets?.[id]?.url`。

3. `mountSpatialLocationTryRun`：`buildPublishedCourseV2Payload` 之后把  
   `(assetId) => published.assets[assetId]?.url` 传入 `fromPublishedCourse` 的 options（即使 Host 已有回退，这里也要显式传，避免第二条路径再漏）。

### B. 世界视频改为 HTML 层

1. mount 时在 SVG 旁增加 `div.spatial-world-html`（`data-testid="spatial-world-html"`），`position:absolute; inset:0; pointer-events:none`。子元素 `pointer-events:auto`。
2. `#updateWorldTransform` 除 SVG 外，给该 div 写 **CSS** transform，语义对齐 `spatialWorldGroupTransform`：  
   `translate(viewportWidth/2px, viewportHeight/2px) scale(zoom) translate(-xpx, -ypx)`  
   `transform-origin: 0 0`。不要把 HTML 放进 SVG。
3. `createWorldItem` 的 video 分支：不要 foreignObject。改为返回标记或让 `#createRecord` 对 video 走 HTML：  
   `position:absolute; left:frame.x; top:frame.y; width; height;` 内 `<video controls playsInline preload="metadata" src=url>`。  
   `object-fit: contain`。无 url 时不要挂空标签冒充完成（可省略节点）。
4. image 保持 SVG（本卡不要重写图片）。
5. destroy/reconcile 时删掉对应 HTML 节点，避免泄漏。

### C. 插入命令更硬

`addSpatialWorldVideoLayer`：

1. 保持 `requireWorldScope`（全球层插入视频不是本卡；Q1 会减少误入 global）。
2. 若 `assets[assetId]` 缺失：不要扔「找不到素材」除非调用方不可能补。本卡允许函数增加可选 `asset?: AssetMeta` 参数；没有 meta 仍 fail。
3. `requireAsset` kind 必须是 `video`。若 kind 是 image → 明确 fail 字符串，不要空 catch。
4. 不要改 `expectedRevision` 协议。

### D. 测试

`spatialSurfaceHost.test.ts`：

1. `fromPublishedCourse` **不传** `resolveAsset`，payload.assets 里有 video data URL 或 `https://example.test/clip.mp4`：mount 后 `container.querySelector('video')` 的 src 等于该 url。现在应失败，修完必须过。
2. 该 `video` **不是** `svg foreignObject` 的后代（`closest('foreignObject')` 为 null）。
3. 保留现有 controller / image 断言。

若新建 `spatialLocationTryRun.test.ts`：对最小 V9 spatial project + sidecar bytes 调 `mountSpatialLocationTryRun`，断言出现 `<video>`。注意 jsdom 可能没有真实解码；只断言元素与 src。

## 最小验证

```powershell
npx vitest run tests/unit/spatialSurfaceHost.test.ts
```

若新建 try-run 测试文件，只再跑它。`git diff --check`。

## Gate

- 当前位置试运行：有 published URL 就能看到可控件视频。
- 视频不在变换后的 SVG foreignObject 里。
- Mixed 路径不回退（仍传 resolveAsset 时行为不变）。
- 未改 editorStore。

## 停手

必须改 `Workspace.tsx` 才能挂 HTML 层 → 停。HTML 层应在 Host.mount 内部完成。  
必须改 `addVideoNode` 才能过插入 → 写 HANDOFF，列出要改的函数名，不要改 store。
