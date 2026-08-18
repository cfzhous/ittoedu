# T3-aliases 去掉 candidate 别名

> 状态：**必须等待 P5-persist 合入**（抢 `editorStore.ts`）  
> 并行：否，等 P5-persist  
> 合同变化：否  
> 工人先读：[02_WORKER.md](02_WORKER.md)

## 一句话

T3 已把后端 kind 收成 `slide-authoring`，但 `slideBackendPort.ts` / `editorStore.ts` 仍 re-export `isV9SlideCandidateBackend`、`selectSlideCandidateBackend` 等。机械改名，不改 P2 `canvasMode`，不改 P5 画布色。

## 允许修改（领取后）

```text
src/renderer/store/slideBackendPort.ts
src/renderer/store/editorStore.ts          只改 alias import / 调用名，禁止改 persistSpatial / 背景色 / backend 创建
tests/unit/v9SlideBackendSelection.test.ts  若仍断言旧名字
docs/tasks/editor-1.0/T3_ALIASES_HANDOFF.md
```

## 禁止

- 在 P5-persist 未合入时改 `editorStore.ts`。
- 改 `canvasMode`、手势、`derivedV8ProjectFromSpatial` 颜色。
- 运行全量验证。

## 逐步算法（领取后）

1. `slideBackendPort.ts` 删除：`isV9SlideCandidateBackend`、`isSlideCandidateBackend`、`executeSlideCandidateCommand` 别名。
2. `editorStore.ts` 把上述调用全部换成 `isSlideAuthoringBackend` / `selectSlideAuthoringBackend` / `executeSlideAuthoringCommand`。
3. 删除 `export const selectSlideCandidateBackend = selectSlideAuthoringBackend` 及同类 re-export。
4. 保留 `slideCandidateSnapshot` 等**字段名**若已是持久 session 形状、改字段会动存储——**不要改字段名**。只改函数/类型别名。若发现改字段才能绿，停并写 HANDOFF。

## 最小验证

```powershell
npx vitest run tests/unit/v9SlideBackendSelection.test.ts
```

然后 `git diff --check`。

## 下游

T6-scan 白名单去掉这些名字。
