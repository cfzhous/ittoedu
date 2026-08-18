# T1-B 切换生产写入并删除旧 Runtime 判别器

> 状态：**已合入，禁止重做**  
> 并行：已结束。下游 [T6](T6_FREEZE.md)  

> 合同变化：是  
> 工人先读：[02_WORKER.md](02_WORKER.md)

## 一句话

把生产写入和 T0 夹具切到 `'canvas-runtime'`（API 2）与 `'surface-runtime'`（API 3），然后从 Schema / 类型 / 合同快照里**删除** `'legacy-runtime-v2'`、`'legacy-whole-canvas'`、`'surface-v1'`。两种持久化格式不得长期共存。不重写 RuntimeHost，不改教师 UI。

## 允许修改

```text
src/shared/courseProjectTypes.ts
src/shared/courseProjectSchema.ts
src/shared/publishedCourseTypes.ts
src/shared/publishedCourseSchema.ts
src/shared/courseProjectModel.ts
src/renderer/store/editorStore.ts
src/renderer/course/spatialEditorCommands.ts
src/renderer/course/v9SlideContentCommands.ts
src/renderer/course/flowSharedAuthoringAdapters.ts
scripts/validate-project.ts
tests/fixtures/course-project-v9/sources.ts
tests/fixtures/course-project-v9/README.md
tests/fixtures/course-project-v9/*.h5lesson
tests/fixtures/course-project-v9/build.ts
tests/unit/courseProjectCoreContract.test.ts
tests/unit/courseProjectRoundTrip.test.ts
tests/unit/editor10ForbiddenTokens.test.ts
tests/unit/validateProject.test.ts
tests/unit/buildPublishedCourseV2.test.ts
tests/unit/v9SlideContentCommands.test.ts
tests/unit/v9SlideActionCommands.test.ts
tests/unit/spatialWorkspaceAuthoring.test.ts
tests/unit/aiCapabilities.test.ts
tests/unit/v9SlideViewportAdapter.test.ts
tests/e2e/editor.spec.ts
docs/contracts/COURSE_PROJECT_V9.md
docs/tasks/editor-1.0/T0_BASELINE.md
docs/tasks/editor-1.0/T1_B_HANDOFF.md
artifacts/contracts/**
```

改 schema 后必须跑 `npm run generate:contracts`。夹具改 `sources.ts` 后必须跑 `npx tsx tests/fixtures/course-project-v9/build.ts` 再生 `.h5lesson`。不要手写巨大 JSON。

## 禁止

- 改 `App.tsx`、`Workspace.tsx`、图层树 UI、画布色、P8 组件挂载。
- 重写 RuntimeHost / Player。
- 恢复 V8 导入 UI。不要删除 `migrateProjectV8ToCourseProjectV9` 这个函数名（扫描白名单仍允许它存在）。
- 新增 `projectMode`、改 `PROJECT_SCHEMA_VERSION = 8`。
- 运行 `npm test` / typecheck / e2e / `build:desktop`。
- 把 Runtime API 3 的宿主协议文档（`surfaceRuntimeTypes.ts`、`artifacts/ai-capabilities/**`）一并改名，除非该文件的 TypeScript 类型就是 `CourseRuntimeDefinition.protocol` 因而编不过。那种情况只改类型用到的字面量，不要扩散生成 AI capabilities JSON。
- 同一提交里又改教师可感知 UI。

## 规定形状（删除旧值之后）

```ts
protocol: 'canvas-runtime' | 'surface-runtime'
```

| protocol | runtimeApiVersion | renderMode | frame |
|---|---|---|---|
| `canvas-runtime` | 2 | `'phaser' \| 'dom' \| 'hybrid'` | `{ mode: 'absolute', x: 0, y: 0, width: 1280, height: 720 }` |
| `surface-runtime` | 3 | `'dom'` | `{ mode: 'absolute', ... }` |

`LayerFrame.mode` 只保留 `'absolute'`。Published 对应 enum **必须同步**。

`scripts/validate-project.ts` 的 `collectProtocolIssues` 必须把 **新** 判别器视为合法。当前脚本只把 `surface-v1` + API 3 与 `legacy-runtime-v2` + API 2 当成支持协议，**不**接受 `canvas-runtime`；不改这一段，新夹具会在校验里被误杀。

## 两个 commit（必须拆开）

### Commit 1 — 只切换写入（旧 enum 仍合法）

1. `runtimeDocumentToCourseRuntime` / `makeRuntimeLayerItem`（`editorStore.ts` ≈ 478–509）：`protocol: 'canvas-runtime'`，`frame.mode: 'absolute'`（仍 0,0,1280,720）。
2. `migrateRuntime`（`courseProjectModel.ts` ≈ 552–577）：同样改为 `canvas-runtime` + absolute frame。这是内存迁移写入，不是导入 UI。
3. 三处 `defaultSurfaceRuntime()`：`spatialEditorCommands.ts`、`v9SlideContentCommands.ts`、`flowSharedAuthoringAdapters.ts` 改为 `protocol: 'surface-runtime'`。`source` 字符串里的 `protocol: "surface-v1"` 一并改成 `"surface-runtime"`。
4. `tests/fixtures/course-project-v9/sources.ts`：`canvas-runtime` 夹具写 `canvas-runtime` + absolute；`surface-runtime` 夹具写 `surface-runtime`。然后 `npx tsx tests/fixtures/course-project-v9/build.ts`。
5. `courseProjectRoundTrip.test.ts` 断言改成新字面量（不要再期望 `legacy-*` / 夹具里的 `surface-v1`）。
6. 其它允许列表里的单测 / `tests/e2e/editor.spec.ts`：凡是**构造新工程或夹具形状**的 `legacy-runtime-v2` / `legacy-whole-canvas` / 生产用 `surface-v1`，改成新值。
7. `scripts/validate-project.ts` `collectProtocolIssues`：新协议合法。Commit 1 **先保留**旧协议分支，避免半截状态。`collectMigrationMarkerIssues` 可先留着（它拒绝的是旧字面量，与新夹具不冲突）。
8. 本 commit **不要**从 schema enum 删除旧值，**不要**清空扫描白名单。

### Commit 2 — 删除旧判别器

1. types + 两份 schema：protocol 只留 `'canvas-runtime' | 'surface-runtime'`；`LayerFrame.mode` 只留 `'absolute'`。删掉 `legacy-whole-canvas` 的 superRefine 配对（旧值已不存在）。保留「`surface-runtime` 必须 `renderMode === 'dom'`」和「`canvas-runtime` 必须 API 2 / `surface-runtime` 必须 API 3」。
2. `npm run generate:contracts`。
3. `courseProjectCoreContract.test.ts`：删掉依赖旧字面量仍成功的用例；保留 T1-B1 的新判别器成功 / 错误配对失败。`makeRuntimeProject` 不再需要 `legacy-whole-canvas` 参数。
4. `validateProject.test.ts`：删除旧 enum 后，带 `legacy-runtime-v2` 的 TypeScript 对象编不过。不要为了保用例而把旧值留在类型里。改成对**未类型化** JSON/archive 断言 `schema.valid === false`，或删掉仅服务旧字面量的 migration-marker 用例，改断言 schema 拒绝非法 protocol。
5. `collectMigrationMarkerIssues` / `collectProtocolIssues`：去掉已删除字面量，避免 TypeScript 报错。
6. `tests/unit/editor10ForbiddenTokens.test.ts`：`legacy-runtime-v2` 与 `legacy-whole-canvas` 的白名单必须变成 `[]`（src 中不得再出现）。若 `src/` 仍命中，回到允许列表改写入，不要把新文件加进白名单。
7. `docs/contracts/COURSE_PROJECT_V9.md` 与夹具 README / `T0_BASELINE.md`：改成「当前持久化已是 `canvas-runtime` / `surface-runtime`」。不要写 Editor 1.0 已发布。

## 最小验证

```powershell
npx vitest run tests/unit/courseProjectCoreContract.test.ts tests/unit/courseProjectRoundTrip.test.ts tests/unit/editor10ForbiddenTokens.test.ts tests/unit/validateProject.test.ts
npm run check:contracts
git diff --check
```

若改了命令单测，再加：

```powershell
npx vitest run tests/unit/v9SlideContentCommands.test.ts tests/unit/spatialWorkspaceAuthoring.test.ts tests/unit/buildPublishedCourseV2.test.ts
```

不要跑全量、typecheck、e2e。

## 完成判定

- [ ] 两个 commit：先切换写入，再删旧 enum
- [ ] 新工程与 T0 夹具不再持久化 `legacy-*` / `surface-v1`
- [ ] 合同快照已再生且 `--check` 通过
- [ ] 扫描白名单里这两个 token 为空
- [ ] 未改 RuntimeHost / 教师 UI
- [ ] 已 push `cursor/t1-b-switch-de5c`
- [ ] 有 `T1_B_HANDOFF.md`

## 下游

T6 冻结切片：全量 typecheck / test / e2e / desktop；扫描不再给这两个 token 开口。
