# T1-C 审计 Course Project V9 顶层字段

> 状态：**可领取**（本轮冻结收口；必须在重开 T6 全量之前）  
> 并行：可与 [T1-A](T1_A_MOVE.md)、[T6-tc-tests](T6_TC_TESTS.md) 分树  
> 合同变化：仅当发现无产品语义的顶层预埋字段才删；当前 `courseProjectDocumentSchema` 已是 `.strict()`，默认只加测试与文档  
> 工人先读：[02_WORKER.md](02_WORKER.md)

## 一句话

核对 `CourseProjectDocument` 顶层只有当前产品字段；禁止把 `PROJECT_SCHEMA_VERSION = 8` 当成可打开工程版本；不要为 AI/协作预埋自由 JSON。

## 允许修改

```text
src/shared/constants.ts
tests/unit/courseProjectTopLevelFields.test.ts
docs/contracts/COURSE_PROJECT_V9.md
docs/tasks/editor-1.0/T1_C_HANDOFF.md
```

仅当审计发现**顶层**确实有无产品语义的预埋字段（例如 `projectMode`、自由 `z.record` 工程根）时，才允许改：

```text
src/shared/courseProjectTypes.ts
src/shared/courseProjectSchema.ts
artifacts/contracts/**
```

改 schema 必须 `npm run generate:contracts`。不要改 `nativeData` / `componentProps`（那是演示态图层覆盖，不是顶层预埋）。

## 禁止

- 把 `PROJECT_SCHEMA_VERSION` 改成 `9`。它是历史 V8 形状常量，留在 `constants.ts`。
- 删除 `createProject.ts` 或把 V8 工厂改成写 9（空白工程早已走 V9 构造器）。
- 弱化 `.strict()`、加入 `.passthrough()` / 顶层 `z.unknown()`。
- 新增 `projectMode`、Hash、Evidence、可见 AI 字段。
- 改 Runtime 判别器、搬 `src/shared/contracts/**`（那是 T1-A）。
- 改 `tests/unit/courseProjectCoreContract.test.ts`（T6-tc-tests 在改）。
- 运行全量 test / typecheck / e2e / desktop。
- 打 tag、宣称已发布。

## 逐步算法

1. 读 `CourseProjectDocument` 与 `courseProjectDocumentSchema`（约 `courseProjectTypes.ts` 463 行、`courseProjectSchema.ts` 1166 行）。当前顶层应为：

```text
schemaVersion, id, revision, title, createdAt, updatedAt,
assets, componentPackages, designTokens, media, playback,
courseState, navigationGuards, locations, startLocationId,
globalLayerItems, globalInteractions, surfaces, mixedPrintPlan?
```

2. 确认 schema 是 `.strict()`，没有顶层 `.passthrough()`。`strictExistingSchema` 用的 `z.unknown().transform` 是为了拒未知字段，**保留**。
3. `layerItemOverrideSchema` 的 `nativeData` / `componentProps` 是演示页状态覆盖，**不是**顶层预埋，不要删。
4. `src/shared/constants.ts`：给 `PROJECT_SCHEMA_VERSION` 加一行注释：历史 Project V8 形状常量，当前可打开工程版本是 `COURSE_PROJECT_SCHEMA_VERSION`（9）。**不要改数值。**
5. 新建 `tests/unit/courseProjectTopLevelFields.test.ts`：
   - 一份最小合法 V9 工程 `safeParse` 成功。
   - 顶层多一个 `projectMode` 或 `aiHandoff` 字段 → 失败。
   - `schemaVersion: 8` 的对象 → 失败。
   - `expect(PROJECT_SCHEMA_VERSION).toBe(8)` 且 `expect(COURSE_PROJECT_SCHEMA_VERSION).toBe(9)`，并断言二者不相等。
   最小工程可抄 `courseProjectCoreContract.test.ts` 的 `minimalSlideProject`，不要改那个文件。
6. `docs/contracts/COURSE_PROJECT_V9.md` 增加一小节「顶层字段」：列出上面那张表，写明没有 `projectMode`，当前版本常量是 `COURSE_PROJECT_SCHEMA_VERSION`。权威路径若 T1-A 尚未合入，仍可写 `courseProjectTypes.ts`。
7. 若顶层已经干净：HANDOFF 写「无删除；已加未知字段测试与常量注释」。不要为了交差去删 `mixedPrintPlan`。

## 最小验证（只跑本卡新测，禁止全量）

```powershell
npx vitest run tests/unit/courseProjectTopLevelFields.test.ts
git diff --check
```

不要跑 `npm test`、`npm run typecheck`、e2e、desktop。不要跑 `courseProjectRoundTrip.test.ts`，除非你真的改了 schema/夹具。  
若动了 schema：再跑 `npm run generate:contracts && npm run check:contracts`（仅此条，因为契约输入变了）。

## 完成判定

- [ ] 顶层字段有测试拒绝未知键
- [ ] `PROJECT_SCHEMA_VERSION` 仍为 8，且注释标明不是当前工程版本
- [ ] 已 push `cursor/t1-c-audit-de5c`
- [ ] 有 `T1_C_HANDOFF.md`

## 下游

与 T1-A、T6-tc-tests 一并合入后重开 T6 全量。
