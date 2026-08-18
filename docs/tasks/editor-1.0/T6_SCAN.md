# T6-scan 禁止项棘轮（白名单债务）

> 状态：**可领取**  
> 并行：可与 P5-persist、T6-docs、T1-D、T1-A0 分树  
> 合同变化：否  
> 工人先读：[02_WORKER.md](02_WORKER.md)

## 一句话

加一个只读源码字符串的 Vitest：正式 `src/` 里不得**新增**禁止项。当前尚未清掉的名字放进白名单，测试必须列出完整路径。不要在本任务删除这些名字。

## 允许修改

```text
tests/unit/editor10ForbiddenTokens.test.ts
docs/tasks/editor-1.0/T6_SCAN_HANDOFF.md
```

## 禁止

- 改任何 `src/**` 去「修」命中。命中了就加白名单并在 HANDOFF 写明属于 T1-B / T3-aliases。
- 扫 `tests/`、`docs/`、`node_modules/`、`dist*`。
- 改 Schema、CI、合同文档。
- 运行 `npm test` / typecheck / e2e / `build:desktop`。

## 禁止项

扫描 `src/**/*.{ts,tsx}` 文本：

```text
v9-slide-candidate
V8SlideBackend
V8_SLIDE_BACKEND
migrateProjectV8ToCourseProjectV9
build-project-v8-courseware
导入旧版工程
legacy-runtime-v2
legacy-whole-canvas
isV9SlideCandidateBackend
selectSlideCandidateBackend
executeSlideCandidateCommand
```

`schemaVersion: 8` / `PROJECT_SCHEMA_VERSION` **不要**当失败：那是历史 V8 形状常量，T1-C/T6 冻结另处理。

## 逐步算法

1. 新建 `tests/unit/editor10ForbiddenTokens.test.ts`。
2. 用 `fs` + 递归读 `src/`（跳过 `src/**/node_modules` 若无则忽略）。
3. 对每个禁止字符串：收集 `相对路径:行号`。
4. 维护 `WHITELIST: Record<token, string[]>`，路径用正斜杠，必须是本任务执行时真实命中的文件。
5. 断言：每个命中文件要么在该 token 的白名单里，要么失败。白名单里的路径必须仍然命中（防止白名单腐烂）。
6. 当前预期（以你跑一次扫描为准，不要抄错文件）：
   - `legacy-runtime-v2` / `legacy-whole-canvas`：types/schema/model、published*、`editorStore.ts` 新建工程处等（T1-B）
   - `isV9SlideCandidateBackend` / `selectSlideCandidateBackend` / `executeSlideCandidateCommand`：`slideBackendPort.ts`、`editorStore.ts`（T3-aliases，等 P5-persist）
   - `v9-slide-candidate` / `V8SlideBackend`：若 `src/` 已无命中，白名单为空数组
7. **不要**因为想绿而改生产代码。

## 最小验证

```powershell
npx vitest run tests/unit/editor10ForbiddenTokens.test.ts
```

然后 `git diff --check`。

## 完成判定

- [ ] 新测试通过
- [ ] 未改 `src/`
- [ ] 已 push `cursor/t6-scan-de5c`
- [ ] 有 `T6_SCAN_HANDOFF.md`，列出每个 token 的白名单文件

## 下游

T1-B、T3-aliases 清掉名字后，从白名单删除对应路径，测试应变红直到代码先绿。
