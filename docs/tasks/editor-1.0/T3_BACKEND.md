# T3 删除双后端与 candidate

> 依赖：T1  
> 可与 T2、T4 分树并行；同一 worktree 内接在 T2 之后  
> 合同变化：无（命名与分支收口）  
> 教师手感：必须不变

## 目标

产品只持有一份 V9 文档、一种 Slide 作者后端。去掉 `V8SlideBackend` 与 `v9-slide-candidate` 产品语义。

## 允许修改

```text
src/renderer/store/slideBackendPort.ts
src/renderer/store/editorStore.ts          （只改 backend kind / candidate 分支）
src/renderer/store/v9SlideUiProjection.ts
src/renderer/course/v9SlideVerticalSlice.ts
src/renderer/course/v9SlideUiProjection.ts （若存在）
tests/unit/v9SlideBackendSelection.test.ts
tests/unit/v9SlideViewportAdapter.test.ts  （只改 kind 断言，不改手势语义）
```

重命名与行为修改分开提交：

```text
SlideCandidateBackend       → SlideAuthoringBackend
createSlideCandidateBackend → createSlideAuthoringBackend
v9SlideVerticalSlice.ts     → slideAuthoringBackend.ts
v9SlideUiProjection.ts      → slideEditorProjection.ts
v9-slide-candidate          → slide-authoring（或等价正式名）
```

## 工作项

1. 删除或坍缩 `V8SlideBackend`、`V8_SLIDE_BACKEND`、`SLIDE_BACKEND_DUAL_WRITE_REFUSED`、`getSlideBackendKind()` 的 `v8` 臂。
2. Store 始终持有一份 V9 文档，不再维护「是否 candidate」。
3. 删除仅用于防双写的错误与测试，换成「唯一文档事务」测试。
4. Flow / Spatial session 已直接持有 V9，不要再绕回 V8 backend。
5. 不要重写 Workspace 手势。
6. 不要在本任务改 `activateCourseLocation` 的 `canvasMode` 策略（那是 P2）。若必须动激活函数，只改 backend kind 符号。

## 最小验证

只跑：

```powershell
npx vitest run tests/unit/v9SlideBackendSelection.test.ts
```

若本任务改了 viewport adapter 的 kind 字面量，可再加：

```powershell
npx vitest run tests/unit/v9SlideViewportAdapter.test.ts
```

不要跑全量、typecheck、e2e。

## Gate

- 产品后端一种。
- 无 V8/V9 backend 选择。
- 无双写拒绝分支。

## 下游

T5 在正式后端名上建 Read Model。P2 若尚未做，接在本任务之后改 `canvasMode` 保留逻辑。T6 扫描 `V8SlideBackend`、`v9-slide-candidate`。
