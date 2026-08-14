# AI 创作与 Courseware Agent Kit

## 唯一工作流

AI 创作只有两个职责明确的入口：

1. [`orchestrate-courseware`](../.agents/skills/orchestrate-courseware/SKILL.md) 把材料整理为教师可审阅的 `01-teaching-plan.md` 和 `02-presentation-script.md`。
2. [`build-courseware-project`](../.agents/skills/build-courseware-project/SKILL.md) 从两份确认文件冷启动，查询当前能力，构建或局部修改 Course Project V9。

聊天摘要、旧工程、旧课例和模板都不能补写缺失的教学事实。教师直接修改 Markdown 后，下一步重新读取文件。单人本地工作流不维护 Review Scope Hash、签名、批准状态、候选等级或 Evidence manifest。

## 上下文策略

编排阶段负责教学目的、内容闭合、课堂过程、呈现状态和教师可感知取舍，不决定代码载体。材料充分时可以一次起草并合并确认；材料不足时持续询问真正会改变目标、正确性、课堂实施或评价的选择。

构建阶段优先使用不继承长聊天的干净 Coordinator，只获得两份当前 Markdown、原始材料路径、编辑器/Agent Kit 入口和仍有效的额外约束。Coordinator 是权威项目的唯一写入者；只有边界清楚的模块才交给 Worker，Worker 只交付独立模块或建议 Patch。

## Agent Kit

[`agent-kit/`](../agent-kit/) 提供小型语义 SDK、构建图、能力搜索、微型 rig、V9 产品编译器和 revision 保护的局部 Patch。它降低重复手写，不提供教学模板，也不是第二套持久化 Project DSL。

查询当前能力：

```powershell
node agent-kit/bin/courseware-agent-kit.mjs capabilities `
  --index agent-kit/capabilities/index.json `
  --query "需要的行为或表面"
```

准备构建工作区：

```powershell
node agent-kit/bin/courseware-agent-kit.mjs scaffold `
  --workspace <workspace> --id <id> --title <title> `
  --plan <01-teaching-plan.md> --script <02-presentation-script.md> `
  --capabilities <agent-kit/capabilities/index.json>
```

`graph` 检查依赖与输出冲突，`assemble` 确定性装配，`rig` 隔离验证一个低层机制，`validate` 检查工作区或语义输入，`patch` 通过 revision 与稳定地址替换一个作者字段。

编辑器内点选会发布当前工程路径、revision、稳定地址和字段值。Codex 可只读获取当前选择；工程保持打开时使用编辑器的“应用 AI Patch”进入 Undo/Redo，工程关闭后才允许磁盘 CLI 原子修改归档并重发默认 HTML：

```powershell
npm run current:course-selection
npm run patch:course-project -- --project <project.h5lesson> --patch <patch.json>
```

磁盘 CLI 遇到正在打开的同一工程、过期 revision、失效地址或类型不匹配时必须拒绝，不能猜测或覆盖。

## 载体原则

- Native：稳定文字、公式、图片、视频、形状、常用控制和需要高可编辑性的内容。
- Runtime：一次性复杂动态机制；作为普通模块构建，不在生成脚本中内联巨型源码。
- Component：确有跨课例复用、参数化、版本管理和独立维护价值的能力。

使用满足效果所需的最少黑箱。Runtime/Component 中当前可见文字必须、普通可替换图片应当公开稳定作者目标。所有载体都进入统一图层，不能用私有顶层 DOM 压住原生内容或教师控制器。

## 构建顺序

1. 校验两份教学文件是否足以实现；会改变教师体验的缺口返回编排。
2. 按需检索短能力卡并打开其源码/Schema 入口，不通读整库。
3. 选择最可能推翻载体、视觉、互动、编辑或导出的最小真实片段。
4. 先用真实内容、真实 Player、真实作者目标与真实保存路径完成纵切。
5. 纵切成立后增量装配；每次只运行受影响的最小验证。
6. 使用稳定 ID，教师手工编辑后改用局部 Patch，不全量重生。
7. 构建完整项目、发布物和脚本要求的导出，再由干净上下文做只读体验 QA。
8. 成功后只保留两份教学 Markdown、项目、默认 HTML 和用户要求的交付物；清理构建图、任务、rig、截图和中间报告。

## 当前协议边界

- Course Project Schema V9；V8 只显式迁移。
- Published Course V2；发布数据不可回导为作者工程。
- Slide、Flow、Spatial 2D 和 Mixed。
- Runtime 兼容当前 Runtime API 2/3 定义；Component API 4。
- 统一图层；无公开 underlay/overlay。
- 有限声明式课程状态与普通导航守卫；无任意表达式。
- `hitId` 是会话身份；`authoringAddress` 是稳定作者地址；Patch 必须携带当前 revision。

机器能力入口是 [`agent-kit/capabilities/index.json`](../agent-kit/capabilities/index.json)。它是小型路由卡，不复制完整 Schema、组件 catalog、测试证据或历史计划。`npm run check:ai-capabilities` 检查卡片格式、版本、来源存在性和退役工作流词汇。

[`examples/course-project-v9/`](../examples/course-project-v9/) 中的三个差异课例由同一 Agent Kit 路线构建，覆盖 Slide、Flow、Spatial 2D、Mixed、Runtime API 3 与 Component API 4。`npm run build:course-cases` 重建并验证它们，`npm run verify:course-cases` 在已有 Player bundle 上只读复核；样例是工程回归与路线对照，不是页面模板，也不冒充教师验收。

## 质量门禁

工程门禁包括 Schema、类型、构建图、保存重开、Undo/Redo、真实 Player、关键状态、作者命中、离线闭包、导出差异与局部失败隔离。

作者门禁包括内容正确、层级清楚、投影可读、交互反馈完整、教师控制可达、静态输出没有误导、键盘/焦点/缩放/无障碍可用。测试绿色不能替代真实视觉和课堂操作复核。

状态必须严格分层：自动化与工程审阅最多给出 `engineering candidate`；经过真实画面和关键互动复核的具体课例才可称 `art candidate`；`accepted` 只能来自教师实际创建、修改、授课式操作后的明确确认。仓库、Skill 或模型不得自行提升等级。

遇到以下情况应停止而不是静默降级：教学文件冲突；当前能力无法满足已确认体验；动态载体关键内容不可编辑；稳定地址或 revision 已失效；真实 Player、保存重开或交付格式没有证据。
