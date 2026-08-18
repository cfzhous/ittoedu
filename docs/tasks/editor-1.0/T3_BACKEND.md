# T3 删除双后端与 candidate

> 状态：**已合入，禁止重做**  
> HANDOFF：[T3_HANDOFF.md](T3_HANDOFF.md)  
> Flow/Spatial 激活时 `slideBackend === null`。T5 跟 `slideAuthoringBackend` / `slideEditorProjection` 命名。  
> 依赖：T1、T2 已合入；**P2 已合入，必须保留**  
> 并行：可与 T4、P8 分树；禁止与 T5 同时改 `editorStore`  
> 合同变化：无  
> 教师手感：必须不变  
> 工人先读：[02_WORKER.md](02_WORKER.md)

## 一句话

产品只持有一份 V9 文档、一种 Slide 作者后端。去掉 `V8SlideBackend` 与 `v9-slide-candidate` 产品语义。**不要重写手势，不要动 P2 的 `canvasMode`。**

## 基线（集成分支上已经是这样）

- `src/renderer/store/slideBackendPort.ts`：`V8SlideBackend.kind === 'v8'`，`SlideCandidateBackend` 来自 `v9SlideVerticalSlice.ts`，kind 字面量 `'v9-slide-candidate'`。
- Flow / Spatial 的 `applyFlowBackend` / `applySpatialBackend` 把 `slideBackend` 设成 `V8_SLIDE_BACKEND`（占位「现在不是 Slide candidate」）。
- P2：三个 `apply*Backend` 已是 `canvasMode: extra.canvasMode ?? 'edit'`；`activateCourseLocation` 在 `state.canvasMode === 'run'` 时传入 `canvasMode: 'run'`。测试：`tests/unit/tryRunLocationMode.test.ts`。
- `loadProject` 仍可能调用 `migrateProjectV8ToCourseProjectV9`（`courseProjectModel.ts`）。**本任务不要删 model 里的函数，不要恢复归档导入 UI。**

## 允许修改

```text
src/renderer/store/slideBackendPort.ts
src/renderer/store/editorStore.ts          只改 backend kind / candidate 分支 / 命名
src/renderer/store/v9SlideUiProjection.ts
src/renderer/course/v9SlideVerticalSlice.ts
src/renderer/course/v9SlideUiProjection.ts  若存在
tests/unit/v9SlideBackendSelection.test.ts
tests/unit/v9SlideViewportAdapter.test.ts  只改 kind 断言
docs/tasks/editor-1.0/T3_HANDOFF.md
```

重命名导致最小验证不能编译时，允许在 **commit 1** 机械更新 import/符号，HANDOFF 列出。禁止借机改 Workspace 手势或 ScenePanel。

## 禁止

- 改 `activateCourseLocation` 的 `canvasMode` 策略（P2）。
- 把 Flow/Spatial 文档再灌进一个假 Slide 后端。
- 删除 `derivedV8ProjectFromSpatial` / `derivedV8ProjectFromFlow`（那是 UI 投影，T5/P5）。
- 改 Schema、Archive 打开规则、能力索引、FlowWorkspace、Published 宿主。
- 一次 commit 里既重命名又删 V8 分支。

## 必须两次 commit

### Commit 1 — 只重命名，行为不变

| 旧 | 新 |
|---|---|
| `SlideCandidateBackend` | `SlideAuthoringBackend` |
| `createSlideCandidateBackend` | `createSlideAuthoringBackend` |
| `v9SlideVerticalSlice.ts` | `slideAuthoringBackend.ts`（git mv） |
| `v9SlideUiProjection.ts` | `slideEditorProjection.ts`（git mv，若该文件在允许列表路径上） |
| `'v9-slide-candidate'` | `'slide-authoring'` |
| `isV9SlideCandidateBackend` | `isSlideAuthoringBackend` |
| `selectSlideCandidateBackend` | `selectSlideAuthoringBackend` |
| `injectV9SlideCandidateBackend` | `injectSlideAuthoringBackend` |
| `clearV9SlideCandidateBackend` | `clearSlideAuthoringBackend` |
| `executeSlideCandidateCommand` | `executeSlideAuthoringCommand` |
| `SLIDE_BACKEND_NOT_CANDIDATE` | `SLIDE_BACKEND_NOT_AUTHORING`（文案可仍说「当前不是 Slide 作者后端」） |

此 commit 之后：`V8_SLIDE_BACKEND` **仍然存在**，Flow/Spatial 仍赋这个占位。测试只改符号，不断言「已经没有 v8」。

跑：`npx vitest run tests/unit/v9SlideBackendSelection.test.ts`

### Commit 2 — 坍缩 V8 占位

1. 删除 `V8SlideBackend`、`V8_SLIDE_BACKEND`、`SLIDE_BACKEND_DUAL_WRITE_REFUSED`。
2. `SlideBackend` 变成 `SlideAuthoringBackend | null`。`getSlideBackendKind` 只返回 `'slide-authoring'` 或等价「无后端」。
3. `applyFlowBackend` / `applySpatialBackend`：`slideBackend: null`（不要 `V8_SLIDE_BACKEND`，也不要 `createSlideAuthoringBackend(flowDocument)`）。
4. 删除「防双写」错误路径与测试；改成「唯一文档事务」：Slide 激活时写 Slide session；Flow 激活时写 Flow session；二者不同时作为可写 Slide 后端存在。
5. Store 始终能从 **当前激活 session** 读到一份 V9 `CourseProjectDocument`（已有 `selectActiveCourseProjectDocument`，不要新造第二份工程）。
6. **核对** 三个 `apply*Backend` 仍是 `canvasMode: extra.canvasMode ?? 'edit'`。若 commit 2 误删，必须加回。
7. 更新 `tests/unit/v9SlideBackendSelection.test.ts`：不再出现 `kind: 'v8'` / `V8_SLIDE_BACKEND`。可保留文件名。

## 最小验证

```powershell
npx vitest run tests/unit/v9SlideBackendSelection.test.ts
```

若改了 viewport adapter 的 kind 字面量：

```powershell
npx vitest run tests/unit/v9SlideViewportAdapter.test.ts
```

**强制附加**（P2 回归，本任务碰了 `editorStore`）：

```powershell
npx vitest run tests/unit/tryRunLocationMode.test.ts
```

然后 `git diff --check`。

## 完成判定

- [ ] 两次 commit，顺序正确
- [ ] 源码无 `v9-slide-candidate`、`V8SlideBackend`、`V8_SLIDE_BACKEND`
- [ ] Flow/Spatial 激活时 `slideBackend === null`
- [ ] `tryRunLocationMode.test.ts` 通过
- [ ] 未改 Workspace 手势
- [ ] 已 push `cursor/t3-single-backend-de5c`
- [ ] 有 `T3_HANDOFF.md`

## 下游

T5 在正式后端名上建 Read Model。T6 扫描 `V8SlideBackend`、`v9-slide-candidate`。
