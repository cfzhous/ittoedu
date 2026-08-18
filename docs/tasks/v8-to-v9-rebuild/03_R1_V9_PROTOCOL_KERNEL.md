# R1 — 引入 V9 协议与交付内核，不改变默认 V8 产品

> 状态：协议 Gate 通过（`engineering candidate for this stage`）；未宣称 V9 编辑器可用；R2-A 已解锁
> 阶段约束：只增加纯合同、纯命令、archive/producer fixture；不得修改默认 App/store/UI/backend

## 1. 阶段结果

R1 结束时，活动产品 worktree 同时具备：

- Course Project V9 类型、Schema、纯模型与稳定 `authoringAddress`；
- Published Course V2 类型、Schema 与最小 producer；
- V9 archive round-trip 和独立 V8→V9 纯迁移函数；
- Runtime API 2/3、Component API 4 与 V8 既有能力的兼容合同；
- 一个不经过默认编辑器的最小 V9 fixture，可完成 validate → archive → reopen → publish。

默认启动、V8 store、V8 保存和 V8 Player 不得因 R1 发生用户可见变化。

## 2. 任务与并行关系

| ID | 任务 | 独占写入 | 可并行 | 依赖 |
|---|---|---|---|---|
| R1-A | V9/Published 基础类型、Schema、model、authoringAddress | `src/shared/courseProject*`、`publishedCourse*`、`authoringAddress.ts`、`surfaceRuntimeTypes.ts` | 否 | R0-G |
| R1-B | V9 archive、纯迁移与格式探测 | `src/renderer/project/courseProject*` 和对应测试 | R1-C、R1-D | R1-A |
| R1-C | Published V2 producer 与最小 Player fixture | `src/renderer/export/course/buildPublishedCourse.ts`、独立 V2 fixture/测试 | R1-B、R1-D | R1-A |
| R1-D | Runtime 2/3 与 Component 4 兼容合同 | shared/player/components 的窄协议文件与测试 | R1-B、R1-C | R1-A |
| R1-Z | 独立协议 round-trip 集成 | 只写最小 fixture/测试，不碰 UI | 否 | R1-B/C/D |

## 3. R1-A — V9 与 Published 基础合同

### 3.1 独占路径

- `src/shared/courseProjectTypes.ts`
- `src/shared/courseProjectSchema.ts`
- `src/shared/courseProjectModel.ts`
- `src/shared/publishedCourseTypes.ts`
- `src/shared/publishedCourseSchema.ts`
- `src/shared/authoringAddress.ts`
- `src/shared/surfaceRuntimeTypes.ts`
- 对应窄测试

### 3.2 实施步骤

1. 从 `3e41ec0..e2e34aa` 和当前 HEAD 逐文件审计上述纯模块，不整串重放。
2. 保留 V8 `projectTypes/projectSchema` 作为迁移来源，不重命名、不删除。
3. 引入 Course Project V9 的 locations/surfaces/global/surface/scene/state owner、资源引用和稳定顺序。
4. 在同一 V9 版本内补齐向后兼容的 Flow 富文本承载：heading/paragraph/quote/list/table 等文字内容保留 plain-text fallback，同时可保存与 V8 `TextRun[]` 等价的选区级 runs/结构；旧 V9 纯字符串工程必须仍可读取，R4 不得自行再改 Schema。
5. 引入 Published Course V2 合同，但不接现有产品 Player。
6. `authoringAddress` 必须跨保存稳定；临时 hit target 只作会话命中。
7. 不新增 `projectMode`，不启动 V10，不加入可见 AI 字段或工作流。

### 3.3 最轻量验证

```powershell
npx vitest run tests/unit/courseProjectCoreContract.test.ts tests/unit/authoringAddress.test.ts
git diff --check -- src/shared tests/unit/courseProjectCoreContract.test.ts tests/unit/authoringAddress.test.ts
```

`courseProjectCoreContract.test.ts` 由本任务新建，只摘取 strict schema、Flow plain-text/runs 双向读取和一个最小 model round-trip；不要直接运行跨 R1/R6/R7 的大 `courseProjectProtocol.test.ts`。

## 4. R1-B — Archive、格式探测与纯迁移

### 4.1 独占路径

- `src/renderer/project/courseProjectArchive.ts`
- `src/renderer/project/courseProjectLifecycle.ts`（若纯生命周期确有必要）
- 新建的 V8→V9 纯转换模块
- 对应最多两个测试

不得修改 App/store/main IPC 或默认 V8 open/save 路径。

### 4.2 必须闭合

- V9 archive encode/decode/validate/asset manifest round-trip；
- 格式探测能区分 V8、V9、损坏文件和不支持版本；
- V8→V9 转换是显式纯函数，返回迁移报告，不静默丢字段；
- recovery/sidecar 所需数据结构可独立测试，但不切换默认产品；
- 错误包含可理解原因和拒绝策略。

### 4.3 最轻量验证

```powershell
npx vitest run tests/unit/courseProjectArchive.test.ts tests/unit/courseProjectMigration.test.ts
git diff --check -- src/renderer/project tests/unit/courseProjectArchive.test.ts tests/unit/courseProjectMigration.test.ts
```

测试文件可由本任务新增；只覆盖一个 round-trip 和一个拒绝/迁移报告场景。

## 5. R1-C — Published V2 producer 与独立 fixture

### 5.1 独占路径

- `src/renderer/export/course/buildPublishedCourse.ts`
- `src/renderer/export/course/index.ts`
- 独立 V2 fixture/测试
- 为编译 producer 必需且不改变默认 Player 的纯 helper

### 5.2 必须闭合

- 从最小 V9 工程生成 Published V2；
- 保留 global/surface/scene/state ownership、location 顺序和资源引用；
- producer 不从 DOM、Phaser proxy 或 Player 反建项目；
- 暂未实现的 Flow/Spatial 数据必须原样、可验证地保留，不能假渲染成功；
- 默认 V8 publish/export 路径保持不变。

### 5.3 最轻量验证

```powershell
npx vitest run tests/unit/buildPublishedCourseV2.test.ts tests/unit/publishedCourseProtocol.test.ts
git diff --check -- src/renderer/export/course tests/unit/buildPublishedCourseV2.test.ts tests/unit/publishedCourseProtocol.test.ts
```

## 6. R1-D — Runtime/Component 兼容合同

### 6.1 独占路径

- `src/shared/runtimeTypes.ts`、`runtimeSchema.ts` 及必要兼容 helper
- `src/shared/componentTypes.ts`、`componentSchema.ts` 及必要兼容 helper
- `src/player/RuntimeHost.ts`、`SurfaceRuntimeAuthoring.ts` 的纯协议边界（仅确有必要）
- `src/renderer/components/**` 中与协议加载直接相关的窄文件
- 对应测试

不得改 ComponentsTab、DeveloperTab、PropertiesTab 或默认 V8 插入工作流。

### 6.2 必须闭合

- Runtime API 2 继续兼容，API 3 所需 surface/viewport 上下文可表达；
- Component API 4 的 package、props、variant、preset、nested content 与事件合同不回退；
- 包和资源仍可被 V8 路径读取；
- authoring target 使用稳定地址；
- 不创建第二套 registry 或长期 adapter framework。

### 6.3 最轻量验证

```powershell
npx vitest run tests/unit/runtimeHostV2.test.ts tests/unit/componentProtocolV4.test.ts
git diff --check -- src/shared src/player/RuntimeHost.ts src/player/SurfaceRuntimeAuthoring.ts src/renderer/components tests/unit/runtimeHostV2.test.ts tests/unit/componentProtocolV4.test.ts
```

## 7. R1-Z — 纯协议 round-trip Gate

### 7.1 执行

1. 构造一个最小 V9 fixture：一个 Slide surface、一个 location、一个 native text、一个 global item、一个资源引用。
2. 执行 Schema validate → archive encode/decode → Schema validate → Published V2 producer → Published Schema validate。
3. 再用一个最小 V8 fixture执行显式转换，检查迁移报告和 V9 validate。
4. 确认默认 `main.tsx`、App、store、Workspace、MediaTab、sidebars 没有被 R1 修改。

### 7.2 最轻量验证

```powershell
npx vitest run tests/unit/courseProjectRoundTrip.test.ts tests/unit/v8ToV9Migration.test.ts
git diff --check -- src/shared src/renderer/project src/renderer/export/course tests/unit/courseProjectRoundTrip.test.ts tests/unit/v8ToV9Migration.test.ts
```

本 Gate 不启动完整 App，不运行 build/typecheck/E2E。

## 8. R1 Gate

必须同时成立：

- V9、Published、Runtime/Component 窄测试通过；
- Flow 富文本与旧纯文本兼容结构已经在单一 Schema owner 冻结；
- 默认 V8 产品文件零用户可见 diff；
- V8 与 V9 没有双写；
- V9 round-trip 与最小 publish 独立成立；
- 所有 donor 来源和舍弃内容写入 HANDOFF；
- 所有跨阶段需求只以 `INTEGRATION_REQUEST` 交给 R2/R7。

满足后只把 R2-A 设为 `READY`，不能宣称 V9 编辑器已可用。
