# T0 冻结基线

> 依赖：无  
> 并行：否  
> 合同变化：无

## 目标

任何 Schema 改动前，固定可工作的工程和行为，并收口工作区里已有的教师可感知补丁。

## 允许修改

- Git tag / 分支说明（执行时）
- `tests/fixtures/course-project-v9/**`（新建永久夹具）
- 仅当用户明确要求提交时：工作区已有的控制台/图层/流式补丁（`Workspace.tsx`、`FlowWorkspace.tsx`、`NodesTab.tsx`、`spatialWorldAuthoring.ts` 等）
- 本任务 HANDOFF

不要在本任务改 `courseProjectSchema.ts`、删除导入 UI、或重命名 backend。

## 工作项

1. 工作区若仍有控制台选中/拖缩放、Published 控制台、图层分组、流式工具条等未提交补丁：先单独提交或由教师明确丢弃。不要和 Schema 提交混在一起。
2. 在收口后的提交上打 tag：`pre-v9-contract-freeze`。
3. 开分支：`refactor/v9-contract-freeze`（若尚未存在）。
4. 建立 `tests/fixtures/course-project-v9/`，整理现有样例，不要只放空文件。至少覆盖：

- Slide Native
- Slide Presentation State
- Global Layer（含教师控制器）
- Canvas Runtime
- Surface Runtime
- Component
- Flow
- Spatial
- Mixed
- 多素材

夹具必须是当前可打开的 V9 archive，不是 schema 8。

## 最小验证

只跑：

```powershell
npx vitest run tests/unit/courseProjectRoundTrip.test.ts
```

然后对本任务 diff：`git diff --check`。

不要跑 typecheck、全量 Vitest、e2e、desktop build。

## Gate

- 夹具可被 round-trip 测试打开。
- Tag 可随时恢复。
- 教师可感知补丁已从「未提交混杂状态」中分离。

## 下游

完成后才能开始 T1。T2–T4 等 T1。
