# V8 → V9 重建共享执行合同

> 适用范围：`docs/tasks/v8-to-v9-rebuild/` 下全部任务
> 目标：让多个 AI 在同一产品 worktree 中安全并行，同时把中间验证压到最轻量

## 1. 产品不变量

1. 最终协议是 Course Project V9、Published Course V2、Runtime API 2/3、Component API 4。
2. 迁移期间产品表面始终是成熟 V8 `App`、Workspace 和原 UI；不得出现用户可见双编辑器。
3. R3-CUT 前默认工程真相是 V8；R3-CUT 后默认工程真相是 V9。任一会话只写一种格式，禁止双写。
4. 默认 backend 切换前，第 6 节 V8 保护清单和根计划 §0.4 六点反馈必须全部通过。
5. 不新增持久化 `projectMode`；Pure/Mixed 从真实 locations/surfaces 推导。
6. `globalLayerItems`、`surfaceLayerItems`、逐 location 可见性和教师控制器继续存在；控制器是 global owner，不伪装成 scene item。
7. Flow 普通 block 不进入通用 z-order 图层；Spatial 复用 V8 元素内核，只增加 world/camera/path/relation。
8. 当前不新增可见 AI、Provider、聊天、Patch、V10、重型时间线或无当前消费者的框架。

## 2. 真相与供体优先级

执行时按以下顺序判断：

1. 用户当前明确要求与 `AGENTS.md`；
2. 根目录唯一计划；
3. 活动产品 worktree 的实际源码、Schema 和可复现 UI；
4. 本任务包；
5. `PROJECT_COGNITION_INDEX.md`；
6. donor 提交、旧任务、旧截图和旧测试结论。

供体只允许按文件、函数或测试逐项阅读和摘取。禁止整体 cherry-pick `3e41ec0`、`e2e34aa`、`bffbf95`、`4755034` 或其他大集成提交。

## 3. 工作区与 Git 安全

- 每次开始先运行 `git status --short`、`git branch --show-current`、`git rev-parse HEAD`。
- 只在 R0 登记的唯一产品 worktree 修改产品源码；当前 V9 根目录只作计划/供体时必须明确标注。
- 已有修改默认属于用户或其他 lane。遇到授权路径重叠，停止并通知协调者。
- 不使用 `git reset --hard`、批量 checkout、递归删除、自动 clean 或覆盖式同步。
- 不整串 cherry-pick，不把 donor 整文件覆盖到 V8 UI 热点。
- 除非用户或协调者明确要求，不 commit、不 push、不开 PR。
- 不修改 `dist-*`、`output/`、`test-results/` 或生成课程文件。

任务包可能暂时位于计划工作区而产品代码位于新 worktree。执行者必须在 HANDOFF 同时记录 `planning pack path` 与 `product worktree path`，所有源码命令显式以产品 worktree 为工作目录。

## 4. 文件所有权与并行纪律

- 一个 AI 一次只领取一个任务 ID。
- “独占路径”表示从任务开始到 HANDOFF 期间只有该任务可写。R6 起以 [`artifacts/R6_R8_EXECUTION_PLAYBOOK.md`](artifacts/R6_R8_EXECUTION_PLAYBOOK.md) 的名单为准；历史供体文件名（如 `PublishedCourseApp.ts`、整份 `flowDocx.ts`）不得当成必须重写的独占权。
- `git diff --check` 只跟本任务实际改过的文件；禁止 `-- src/renderer/ui`、`-- src/renderer/course`、`-- src/player`、`-- src/shared`、`-- src/renderer/export` 这类整目录扫描。
- 中央热点只能由阶段 `*-Z`/`R3-CUT` 修改；其他 lane 只读并提交集成请求。
- 若实现必须改共享合同文件，先提交 `DECISION_REQUEST` 或 `INTEGRATION_REQUEST`，不能顺手扩大所有权。
- 新文件必须位于任务授权目录，并服务当前纵切；不得借新文件建立通用 service、adapter framework、plugin layer 或第二套 UI。
- 阶段集成者按 HANDOFF 顺序接线，不重写已通过的 lane 内核。

## 5. 实施纪律

- 先重现目标缺口，再修改；不能因为 donor 已有同名函数就判定可直接复用。
- 保持 V8 组件 props、用户行为和选择语义，优先在 store/command/persistence 下方替换实现。
- 一次用户动作只产生一次 command/history/revision；pointermove 只预览，pointerup 单次提交。
- selection、异步提交和作者目标使用稳定 `authoringAddress`；临时 `hitId` 不得持久化。
- 画布、图层和属性面板必须指向同一 owner/item；锁定项可选择查看，但写操作统一拒绝。
- 不用 no-op、假成功、disabled、隐藏入口、占位卡片或改测试期望宣称完成。
- 失败返回可理解原因；不得吞掉命令结果或静默迁移/删除数据。

## 6. R0–R7 最轻量验证预算

每个任务的默认预算只有：

1. **一条定向 Vitest 命令**，最多两个测试文件；如果任务纯文档/审计，可不跑测试。
2. **一次 diff check**：`git diff --check -- <owned paths>`。
3. **阶段集成任务的一个真实 UI 冒烟**，只操作当前纵切，不形成全套回归。R6-Z = 一次 Mixed 课；R7-Z = 一次保存 + 一个 HTML。禁止为七组合、四种导出或三视口各开 Electron。

若活动 worktree 尚不存在任务卡建议的测试文件，执行者应先确认 donor 中是否有可迁移的窄测试；没有则新增一个最小测试。不得用全目录测试代替。

R0–R7 一律禁止：

```text
npm run typecheck
npm test
npm run build
npm run build:desktop
npm run prepare:e2e
npm run test:e2e
npm run verify
npm run verify:full
npm run verify:editor-preservation
npm run verify:editor-preservation:visual
npx playwright test
npx vitest run            # 未显式列出 1–2 个文件时
全量/三视口截图或视觉基线重捕
```

例外只有：

- `R0-A` 为确认真实 V8 可启动，可运行一次实际存在的 `npm run dev` 或 `npm run start`；
- 各阶段 `*-Z` 可复用已经运行的 dev 会话完成一个窄 UI 冒烟，不得顺带跑完整清单；
- `R8-FINAL` 已拆成 R8-A–H/Z；每个子任务只跑 `10_R8` §11 写出的那一条命令。R8-C 可 `typecheck`，R8-D 可 `npm test`，R8-E 可 `build:desktop`，R8-F 可 `test:e2e`。禁止任何子任务改跑完整 `npm run verify`。

测试失败若源于尚未接线的其他 lane，记录集成请求；不得越权修改热点或放宽断言。

每条定向测试在 HANDOFF 中还必须写明：

- `entry`：测试调用的真实入口；
- `fixture/backend`：V8、V9 candidate 或 Published V2；
- `proves`：本测试能证明什么；
- `does_not_prove`：例如“未接真实 Workspace/MediaTab/Player”。

## 7. 阶段 Gate 与状态用语

- lane 定向测试通过：`integration candidate`。
- 阶段中央接线并完成窄 UI 冒烟：`engineering candidate for this stage`。
- 全量机器 Gate 通过：项目级 `engineering candidate`。
- 真实视觉/互动清单通过：`art candidate`。
- 只有教师明确确认：`accepted`。

中间任务不得使用 `art candidate` 或 `accepted`。自动化不能替代教师确认。

执行状态、集成状态和质量状态必须分开记录：

- execution：`not_ready / ready / in_progress / lane_candidate / blocked`；
- integration：`n/a / pending / integrated / verified`；
- quality：`unverified / engineering_candidate / art_candidate / accepted`。

`INTEGRATION_REQUEST` 只能按 `open → implemented → integrated → verified` 关闭。`returned`、`documented`、`known limitation` 都不是关闭状态。只有教师明确修改范围才能标 `waived`，且根计划 §0.4 六点和 V8 保护清单不得豁免。

## 8. 停止条件

出现以下任一情况立即停止并报告：

- 需要付费工具、外部凭据、发布、破坏性操作或新增重大依赖；
- 需要 Schema V10、架构重写、第二 App/store/Workspace 或删除 V8 能力；
- 当前授权文件有无法安全合并的用户/其他 lane 改动；
- 任务必须修改未授权中央热点才能证明 lane 内合同；
- 根计划、教师确认、Schema 和可复现源码给出无法消解的冲突；
- R0-G 或 R3-G 所需教师确认尚未获得。

## 9. 请求模板

### 9.1 INTEGRATION_REQUEST

```md
INTEGRATION_REQUEST
- requester task:
- target stage integrator:
- target hotspot file:
- exported symbol / callback:
- required user-visible behavior:
- focused test proving lane side:
- exact wiring requested:
- risk if omitted:
- status: open | implemented | integrated | verified | waived-by-teacher
```

### 9.2 DECISION_REQUEST

```md
DECISION_REQUEST
- requester task:
- conflicting facts:
- affected requirement/Gate:
- options with trade-offs:
- recommended shortest sufficient option:
- work safely completed before stopping:
```

## 10. HANDOFF 模板

```md
HANDOFF
- task:
- planning pack path:
- product worktree / branch / baseline SHA:
- outcome:
- owned files changed:
- donor files/functions consulted:
- focused validation command:
- validation result:
- validation entry / fixture / backend:
- validation proves / does not prove:
- narrow UI smoke, if authorized:
- INTEGRATION_REQUESTS:
- DECISION_REQUESTS:
- remaining risks / untested full checks:
- rollback point:
- execution state:
- integration state:
- quality state:
```

HANDOFF 必须如实列出未运行的 typecheck、build、E2E 和视觉回归。R0–R7 把这些留给 R8 子任务；R8-* 只列出**自己没跑**的集合。
