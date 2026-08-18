# T1-A0 共享合同桶（只新建 re-export）

> 状态：**已合入，禁止重做**  
> 并行：可与 P5-persist、T6-docs、T6-scan、T1-D 分树  
> 合同变化：否  
> 工人先读：[02_WORKER.md](02_WORKER.md)

## 一句话

在 `src/shared/contracts/` 建 **只做 re-export** 的入口，证明依赖方向「Player / Editor / Export → 合同桶 → 现有文件」。**不要移动、不要改名、不要改任何现有 import。**

## 允许修改

```text
src/shared/contracts/**
tests/unit/contractsBarrels.test.ts
docs/tasks/editor-1.0/T1_A0_HANDOFF.md
```

## 禁止

- 改 `src/shared/courseProjectTypes.ts` 等现有文件。
- 改任何现有 `import` 路径。
- 改 Schema 判别器。
- 把 `SceneNode` 删掉或搬进合同桶。
- 运行 `npm test` / typecheck / e2e / `build:desktop`。

## 逐步算法

1. 只新建这些文件（内容就是 `export * from '...'`，路径用相对现有文件）：

```text
src/shared/contracts/course-project-v9/index.ts
  → ../../courseProjectTypes
  → ../../courseProjectSchema

src/shared/contracts/published-course-v2/index.ts
  → ../../publishedCourseTypes
  → ../../publishedCourseSchema

src/shared/contracts/component-v4/index.ts
  → ../../componentTypes
  → ../../componentSchema

src/shared/contracts/runtime/index.ts
  → ../../runtimeTypes
  → ../../runtimeSchema
  → ../../surfaceRuntimeTypes

src/shared/contracts/interaction-v1/index.ts
  → ../../interactionTypes
  → ../../interactionSchema

src/shared/contracts/index.ts
  → 再 export 上述五个子目录
```

2. 若某个目标文件不存在，**停**，写 HANDOFF，不要改别的目录去凑。
3. `tests/unit/contractsBarrels.test.ts`：
   - `import { COURSE_PROJECT_SCHEMA_VERSION } from '@/shared/contracts/course-project-v9'`（或 `../../src/shared/contracts/course-project-v9`，与邻测试一致）
   - `expect(COURSE_PROJECT_SCHEMA_VERSION).toBe(9)`
   - 再从 `published-course-v2` import `PUBLISHED_COURSE_VERSION` 或源码里实际导出的常量，断言存在。
4. 不要在桶里写新类型。

## 最小验证

```powershell
npx vitest run tests/unit/contractsBarrels.test.ts
```

然后 `git diff --check`。

## 完成判定

- [ ] 只有新建文件
- [ ] 现有 import 未改
- [ ] 已 push `cursor/t1-contracts-barrels-de5c`
- [ ] 有 `T1_A0_HANDOFF.md`

## 下游

T1-A 真迁移（移动文件 + 改 import）等父代理改看板。本切片不代替 A。
