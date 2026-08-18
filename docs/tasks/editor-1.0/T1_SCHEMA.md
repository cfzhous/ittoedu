# T1 V9 Schema 最终收口

> 工人先读：[02_WORKER.md](02_WORKER.md)

## 合入状态（先读再动手）

| 分段 | 状态 | 说明 |
|---|---|---|
| **E** 可选 `backgroundColor?` | **已合入，禁止重做** | Spatial/Flow 可选字段；`resolveCourseSurfaceBackgroundColor`；夹具 round-trip 已覆盖 omitted/explicit |
| **A** 抽离 `src/shared/contracts/**` | **暂缓** | 不阻塞 T3/T4/P8。需要大范围移动类型。未领取前不要做。 |
| **B** 删除 `legacy-runtime-v2` / `legacy-whole-canvas` | **阻塞** | T0 夹具 `tests/fixtures/course-project-v9/canvas-runtime.h5lesson` **仍持久化** `legacy-runtime-v2` + `legacy-whole-canvas`。未先改夹具 + round-trip 测试前，禁止删判别器。 |
| **C** 审计顶层字段 | **暂缓** | 与 A 一起。禁止把 `PROJECT_SCHEMA_VERSION` 改成 9。 |
| **D** 合同产物脚本 | **暂缓** | 生成入口可与 A 一起；哈希门禁仍是 T6。 |

当前不要领取 A–D，除非父代理在看板把状态改成「可领取」。

> 依赖：T0（已合入）  
> 并行：E 已完成；A–D 独占合同文件  
> 合同变化：是  
> 教师手感：必须不变

## 目标

让 V9 依赖共享合同，而不是把 `projectSchema.ts` 当工程权威。清掉迁移型 `legacy-*` 持久化判别器。为 T6 的哈希门禁准备生成入口。

## 允许修改

```text
src/shared/courseProjectTypes.ts
src/shared/courseProjectSchema.ts
src/shared/courseProjectModel.ts
src/shared/projectTypes.ts
src/shared/projectSchema.ts
src/shared/constants.ts
src/shared/interactionTypes.ts
src/shared/interactionSchema.ts
src/shared/runtimeTypes.ts
src/shared/runtimeSchema.ts
src/shared/surfaceRuntimeTypes.ts
src/shared/playerAuthoringProtocol.ts
src/shared/contracts/**          （新建）
scripts/generate-contracts.ts   （新建，可先生成不接 CI）
scripts/check-contracts.ts
artifacts/contracts/**          （新建快照；哈希冻结放到 T6）
tests/unit/courseProjectCoreContract.test.ts
tests/unit/courseProjectRoundTrip.test.ts
```

不要改 `App.tsx`、导入 UI、`editorStore` 后端命名、能力索引文案。不要在本任务接线画布颜色 UI（那是 P5）。

## 工作项

### A. 抽离共享稳定协议

建议目录（可按现有风格改名，依赖方向不能反）：

```text
src/shared/contracts/
  native-v1/
  interaction-v1/
  media-v1/
  design-v1/
  component-v4/
  runtime/
  course-project-v9/
  published-course-v2/
```

```text
Course Project V9  →  稳定共享合同  ←  Player / Editor / Export
```

禁止继续：`Course Project V9 → projectSchema.ts 作为工程权威`。

先移动/重命名，不改字段语义。`TextNode` 等可保持原样，但归属共享 Native 合同。Interaction 正式名为 Interaction Protocol V1。旧 UI 需要 `SceneNode` 时，由内部适配器消费共享 Native 合同。

### B. 清理 Runtime 合同

删除持久化中的 `legacy-runtime-v2`、`legacy-whole-canvas`。

建议表达（保留既有 API 数字）：

```ts
type CourseRuntimeDefinition =
  | {
      protocol: 'canvas-runtime'
      runtimeApiVersion: 2
      renderMode: 'dom' | 'phaser' | 'hybrid'
    }
  | {
      protocol: 'surface-runtime'
      runtimeApiVersion: 3
      renderMode: 'dom'
    }
```

Frame 只保留绝对几何。全画布 Runtime 写 `x=0, y=0, width=1280, height=720`。

切换：先加新判别器与转换测试 → 一次性切换生产写入 → 删除旧判别器。不得让两种持久化格式长期共存。不重写 RuntimeHost。

### C. 审计顶层字段

只保留当前产品语义。禁止为 AI、协作或未知需求预埋大块自由 JSON。禁止用 `.passthrough()`、`z.unknown()` 弱化核心合同。

`constants.ts` 的 `PROJECT_SCHEMA_VERSION = 8` 不得再被当成当前工程版本；当前工程版本只来自 `COURSE_PROJECT_SCHEMA_VERSION`。

### D. 合同产物

新增 `artifacts/contracts/*.schema.json` 与 `contract-manifest.json`，以及 `generate:contracts` / `check:contracts`。本任务生成即可；**把哈希门禁接到每个 PR 留给 T6。**

### E. 冻结前最后一次 additive 画布底色

教师要求所有画布默认白、可改色。这不是新判别器、不是 V10。

- `SpatialSurfaceDocument` 增加可选 `backgroundColor?: string`。缺省与读取旧工程视为 `#ffffff`。
- 可选同样加在 `FlowSurfaceDocument` 作为稿纸/页铬底，缺省白。不要因此改 Flow block 模型。
- Slide 场景已有 `backgroundColor`，**不要改名、不要改默认语义**。
- 单独提交，与 A–D 分开。本任务只改类型/Schema/夹具缺省，不改 `globals.css` 或属性栏（P5）。
- 禁止加入 `projectMode` 或其他预埋 JSON。

## 最小验证

只跑：

```powershell
npx vitest run tests/unit/courseProjectCoreContract.test.ts
```

若本任务改了 round-trip 夹具形状，可再加：

```powershell
npx vitest run tests/unit/courseProjectRoundTrip.test.ts
```

不要跑全量、typecheck、e2e。

## Gate（分段）

- **E 已满足**：可选 `backgroundColor` 缺省白，旧工程打开仍白。
- **A 未领取前**：V9 仍可暂时从现有 `courseProjectSchema.ts` 解析；不要假装 contracts 目录已经存在。
- **B 未领取前**：允许夹具继续持久化 `legacy-runtime-v2`。T6 扫描时把夹具列入白名单，而不是在 T6 删判别器。

## 下游

T2 已合入。T3 / T4 / P8 可分树。P5-persist 等 P8。T1-B 必须先改 T0 canvas-runtime 夹具。
