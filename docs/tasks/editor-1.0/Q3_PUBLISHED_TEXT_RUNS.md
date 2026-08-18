# Q3 Slide 试运行 / 预览应用文字 style + runs

> 状态：**可领取**  
> 症状：Q0 #3（Slide；Spatial 文字由 Q5 顺手对齐，本卡不要改 SpatialHost）  
> 车道：Q  
> 合同变化：无  
> 工人先读：[02_WORKER.md](02_WORKER.md)、[Q0_FIX_PLAN.md](Q0_FIX_PLAN.md)

## 一句话

`SlidePublishedAdapter` 绘制 native text 时与 `src/shared/textLayout.ts` 相同：先 node.style，再 runs 覆盖。禁止只用 `textContent = data.text`。

## Git

分支：`cursor/q3-published-text-runs-489b`  
HANDOFF：`docs/tasks/editor-1.0/Q3_HANDOFF.md`

## 允许修改

```text
src/player/surfaces/publishedNativeText.ts          新建（必须）
src/player/surfaces/slide/SlidePublishedAdapter.ts  只改 text 分支
tests/unit/slidePublishedNativeText.test.ts         新建（必须）
docs/tasks/editor-1.0/Q3_HANDOFF.md
```

## 禁止

- `SpatialSurfaceHost.ts`、`FlowSurfaceHost.ts`、`Workspace.tsx`、Schema。
- 改 `applyNativeTextStyle` 的调用方去走 Phaser `renderTextNodeCanvas`。
- 引入 `PlayerScene` / Phaser。

## 基线

`SlidePublishedAdapter.ts` 约 131–154：`applyNativeTextStyle` 设置 wrap 的 font* / color / align，然后 `wrap.textContent = data.text`。

Published `content.data` 类型是 `NativeNodeData<TextNode>`，**含 `runs`**。Producer `publishLayerItem` 已 clone 整份 content。缺陷只在 DOM 绘制。

可复用：`src/player/surfaces/flow/flowModel.ts` 的 `flowRichTextSegments(text, runs)`（不要复制第三份 split 算法）。若为避免 Slide→Flow 怪依赖，把分段调用放在 `publishedNativeText.ts` 里 import `flowRichTextSegments`。

## 逐步算法

### A. 新建 `publishedNativeText.ts`

导出例如：

```ts
export function paintPublishedNativeText(
  wrap: HTMLElement,
  data: Extract<NativeElementContent, { nativeType: 'text' }>['data'],
): void
```

算法：

1. 把现在的 boxSizing / overflow / whiteSpace / writingMode / padding / textAlign / lineHeight / letterSpacing / fontFamily / fontSize 应用到 **wrap**（这些是块级，不是 run）。
2. 清空 wrap（不要先设 textContent）。
3. `const segments = flowRichTextSegments(data.text, data.runs)`。
4. 对每个 segment 建 `span`：  
   - 字重：`segment.style.bold ?? data.style.bold` → 700/400  
   - 斜体、下划线、删除线、颜色、高亮背景、emphasis（可用 `text-emphasis` 或简易 style，不要为 emphasis 新依赖）  
   - `span.textContent = segment.text`
5. 无 runs 或 segments 为空：仍用 node.style 画一整段（与 Flow 空 runs 行为一致）。
6. wrap 级 `fontWeight` 仅作无 runs 时的默认；有 runs 时不要让 wrap 的 400 盖住 span。

不要读工程、不要 fetch 字体文件。

### B. Adapter 接线

`applyNativeTextStyle` 改为调用 `paintPublishedNativeText`。删除 `wrap.textContent = data.text`。

video / image / controller / component 分支一行不改。

### C. 测试

新建 `tests/unit/slidePublishedNativeText.test.ts`（纯函数，不挂 Adapter 也可；若测 Adapter，jsdom + 最小 PublishedLayerItem）。

至少：

1. `style.bold === true`、`runs: []` → wrap 或唯一 span `fontWeight` 为 700。
2. `style.bold === false`、runs 把后半段 `{ bold: true }` → 第二段 span 700，第一段不是。
3. `style.color` 与 run `color` 同时存在时，run 覆盖该段。
4. 文本等于 `data.text` 拼接（不要丢字）。

不要 `npm test` 全量。

## 最小验证

```powershell
npx vitest run tests/unit/slidePublishedNativeText.test.ts
```

然后 `git diff --check`。

## Gate

- 试运行 Slide 能看出局部加粗/颜色（与编辑态 iframe 一致的数据路径）。
- 未改 Spatial/Flow 宿主。
- 未改 Schema。

## 停手

Published 类型里没有 `runs`（与源码冲突时以源码为准；`NativeNodeData<TextNode>` 应有 runs）。若 Adapter 的 text 数据被剥掉 runs，写 HANDOFF，不要改 producer（不在允许列表）。
