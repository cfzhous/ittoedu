# T2 删除 V8 导入

> 依赖：T1  
> 可与 T3、T4 分树并行；同一 worktree 内先于 T3  
> 合同变化：打开路径只接受 V9  
> 已锁定：删除导入，不密封保留

## 目标

产品打开/保存/恢复默认只处理 Course Project V9。教师看不到「导入旧版工程」。空白工程不再先造 V8 再迁移。

## 允许修改

```text
src/renderer/project/courseProjectArchive.ts
src/renderer/project/createCourseProject.ts
src/renderer/project/courseProjectMigration.ts   （删除）
src/renderer/project/courseProjectLifecycle.ts
src/renderer/project/validateProjectArchive.ts
src/main/projectPersistence.ts
src/renderer/App.tsx                            （只删导入对话框/v8ImportPending）
scripts/run-courseware-authoring.ts             （去掉显式导入对话框）
tests/unit/courseProjectArchive.test.ts
tests/unit/courseProjectMigration.test.ts
tests/fixtures/courseware-v8/**                 （通用行为迁到 V9 夹具后再删）
tests/e2e/**                                    （只删/改「显式导入」断言；不要为此跑全量 e2e）
```

`editorStore.ts` 只允许删除 V8 打开/recovery 分支，不要在本任务重命名 backend。

## 工作项

1. `createBlankCourseProject` / `createCourseProject` 直接构造 V9，删除 `migrateProjectV8ToCourseProjectV9(createProject())`。
2. 删除 `courseProjectMigration.ts` 及仅服务迁移的错误类型。
3. Archive 规则：

```text
schemaVersion === 9   → 打开
其他整数版本          → unsupported
缺少版本或损坏        → corrupted
```

不再根据 `scenes` / `locations` 猜测 V8。

4. 删除「需要显式导入旧版工程」对话框与 `v8ImportPending`。
5. Recovery 只写、只恢复 V9；`schemaVersion === 8` 的 recovery 视为 ignore/unsupported。
6. 把 import 测试里的保存/导出/恢复行为迁到 `tests/fixtures/course-project-v9/`，再删除仅服务 V8 打开的 helper 与夹具。

## 最小验证

只跑：

```powershell
npx vitest run tests/unit/courseProjectArchive.test.ts tests/unit/courseProjectMigration.test.ts
```

不要跑 e2e（T6 才跑）。不要跑全量 Vitest。

## Gate

- 打开非 9 的 `.h5lesson` 得到明确拒绝，不进入可保存会话。
- 空白工程与 recovery 无 V8 字段。
- 正式产品源码中不再有用户可达的导入 UI。

## 下游

T6 扫描 `schemaVersion: 8`、`migrateProjectV8`、`导入旧版工程`。T3 不要回加 V8 backend。
