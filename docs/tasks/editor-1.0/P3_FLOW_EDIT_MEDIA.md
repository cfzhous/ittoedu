# P3 Flow 编辑态图片与视频

> 依赖：T0 若已改 `FlowWorkspace.tsx`，接在该提交之后  
> 并行：可与 P1 分树（P1 改运行宿主，本任务改编辑稿纸/浮层）  
> 合同变化：无  
> 车道：P

## 目标

Flow 编辑态能看见并选中图片/视频。默认插入仍是稿纸 `document-block`；浮层插入仍是视口 overlay。不把 Flow block 当 z-order 图层。

## 允许修改

```text
src/renderer/ui/FlowWorkspace.tsx
src/renderer/course/flowSharedAuthoringAdapters.ts   （仅当绘制需要资产元数据；不要改 owner 规则）
tests/unit/flowWorkspaceMedia.test.tsx               （新建或扩现有 Flow 编辑测试，1 个文件）
```

不要改 `FlowSurfaceHost`（P1）、不要改课程树删除（P6）。

## 工作项

1. 稿纸 `media` 块：image 使用 sidecar / 已解析 URL 填 `<img src>`，不要只写 `data-flow-asset-id`。
2. 稿纸 video：编辑态用 `<video>` 或封面图，禁止永久「视频占位符」冒充完成。播放以试运行准。
3. 非控制器浮层：image/video 画出来，而不是 `label || '浮层'`。
4. 浮层仍可命中、拖缩放；`pointer-events` 保持「层 none、卡片 auto」。
5. 不把音频塞进 overlay（现有拒绝理由保留）。

## 最小验证

只跑本任务的一个测试文件，例如：

```powershell
npx vitest run tests/unit/flowWorkspaceMedia.test.tsx
```

然后 `git diff --check`。

## Gate

- 插入图片后编辑稿纸能看见图。
- 插入视频后编辑稿纸不是空白占位字（至少封面或 video 元素）。
- 浮层媒体能看见、能选。

## 下游

P1 负责运行态浮层 video。T6 对照同一课例的编辑与试运行。
