# P2 Mixed 试运行跨位置保留运行态

> 依赖：建议 P1 已合入（否则只能测 mode 位，测不了跳转后的控制器）  
> 并行：否。独占 `editorStore` 激活路径；与 T3、P6 的 Store 接线互斥  
> 合同变化：无  
> 车道：P

## 目标

混合课在「当前位置试运行」下跳转 location / 表面时，保持 `canvasMode === 'run'`，由 Published session `goToLocation` / 换宿主，而不是卸掉试运行、重开编辑后端。

## 允许修改

```text
src/renderer/store/editorStore.ts     （只改 activateCourseLocation、apply*Backend 的 canvasMode、试运行 session 同步）
src/renderer/ui/Workspace.tsx         （只改 course-try-run 的 goToLocation 订阅，不改手势）
tests/unit/courseAuthoringSession.test.ts   （若已覆盖激活；否则新建一个窄测试）
```

同一 worktree 若 T3 未做：先停，或先 T3 再本任务。不要在本任务重命名 backend。

## 工作项

1. `applyV9Backend` / `applyFlowBackend` / `applySpatialBackend` 不得在「已经是 run、且只是换 location」时写死 `canvasMode: 'edit'`。打开工程、从空白新建仍默认 `edit`。
2. `activateCourseLocation` 跨表面：若当前 `canvasMode === 'run'`，更新课程 session / 文档选择，并让 `course-try-run-host` 或 Flow/Spatial try-run host 跟到新 location；不要为跳转重建整个 authoring backend。
3. 同一 Slide 表面内 `persistCandidateResult(activateScene)` 已不改 mode，保持。
4. `setActivePresentationState(null)` 的旧路径不要把试运行打回编辑。新增/复制演示状态仍可回编辑。
5. 编辑态切位置（`canvasMode === 'edit'`）行为不变。

## 最小验证

只跑：

```powershell
npx vitest run tests/unit/courseAuthoringSession.test.ts
```

若该文件与激活无关，本任务新增一个只断言「run 下 activateCourseLocation 保持 canvasMode」的测试文件，并只跑那一个。然后 `git diff --check`。

## Gate

- Mixed 试运行中点课程树切到另一组/另一类表面，模式开关仍停在「当前位置试运行」。
- 切回「编辑状态」仍可用。
- 未改 Schema 判别器。

## 下游

T6 课例：混合课试运行连续翻页不闪回编辑画布。
