# P7 图层树中的全局控制器

> 依赖：无  
> 并行：可与 P1 分树；与 T5 抢 `NodesTab.tsx`，禁止同时改  
> 合同变化：无  
> 车道：P

## 目标

打开「图层」时，教师不会把全局控制器当成当前场景/世界里的普通物件。控制器仍是一份全局图层，可从「共享内容 → 全局层」或图层「全局」分组到达。不启动 V10。

## 允许修改

```text
src/renderer/ui/NodesTab.tsx
tests/unit/v9GlobalLayerUiAdapter.test.tsx    （只改分组断言，不改适配边界）
```

T5 若后做：只改 import，必须保留本任务的分组/过滤。不要把控制器写入 scene `layerItems`。

## 工作项

1. `groupedVisualRows`：教师控制器不出现在「场景 / 本页 / 世界」分组。
2. 「全局」分组可以保留一条，标签继续「全课、不可下沉」；或折叠到已有 `global-layer-entry`，图层列表不再重复。二选一，不要两处重复且可拖进场景。
3. 禁止跨 owner 把控制器 drop 进场景（现有 `isForeignTeacherControllerDrop` 保持或收紧）。
4. 不改统一图层存储，不改 `globalLayerItems` 合同。

## 最小验证

只跑：

```powershell
npx vitest run tests/unit/v9GlobalLayerUiAdapter.test.tsx
```

然后 `git diff --check`。

## Gate

- Spatial/Flow/Slide 打开图层，「场景」或「世界」列表没有全局控制器。
- 全局层入口仍能选中、编辑、删除控制器（最后一份控制器的现有产品规则不变）。

## 下游

T5 不得回退分组。T6 课例只看教师是否还混淆「场景物件」与「全课控件」。
