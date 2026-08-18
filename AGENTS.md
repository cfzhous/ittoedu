# 互动课件创作路由

- 教学主题、教材、教案、题目、课程标准或既有课件先交给仓库内的 [orchestrate-courseware](.agents/skills/orchestrate-courseware/SKILL.md)。它只维护教师可直接阅读和修改的 `01-teaching-plan.md` 与 `02-presentation-script.md`；材料充分时少问，材料稀缺时围绕高影响缺口继续追问。
- 两份当前 Markdown 经教师确认后，使用 [build-courseware-project](.agents/skills/build-courseware-project/SKILL.md)。Builder 从文件冷启动，按需查询 [Agent Kit 能力卡](agent-kit/capabilities/index.json)，先做高风险纵切，再增量装配、局部修复和验证 Course Project V9。
- 通用 Skill 不规定课型、场景数、教学法、页面模板或视觉风格。Native、Runtime 与 Component 是实现载体：稳定内容优先 Native；一次性复杂动态机制用 Runtime；只有确有跨课例复用价值时才使用 Component。
- 本产品是 AI-native 轻量课件编辑器，不是重型手工 PPT、文档、白板或 IDE；“轻量”指默认界面克制、低学习成本和渐进披露，不得删减或禁用 V8 已经可用的编辑能力。高频能力必须直接可达，低频能力可以收进高级面板或右键，但必须可发现、可保存、可撤销。
- 纯 Slide、纯 Flow、纯 Spatial 与 Mixed 的界面从现有 `locations` / `surfaces` 自动推导，不新增持久化 `projectMode` 或“四模式”字段；新建工程和课程结构必须提供三种 surface 的直接创建入口，不能只靠外部导入形成。
- `globalLayerItems` 与 `surfaceLayerItems` 继续作为 V9 引擎和发布能力；全局/共享编辑范围与 Mixed 页面类型正交。在统一有效图层尚未完整支持 ownership-aware 排序、锁定、隐藏、复制和删除前，保留 V8 表面的全局与 surface 共享作者入口，不启动 V10 大迁移。
- 所有 Native、Runtime、Component 与教师控制器都进入统一图层。画布文字必须可命中，普通可替换图片应可命中；临时 `hitId` 不得代替跨保存稳定的 `authoringAddress`。
- 教师工作流不使用 Hash、签名、审批状态机、候选等级或 Evidence 清单。工程仍必须通过当前 Schema、类型、保存重开、真实 Player、导出和体验复核。

当前产品协议是 Course Project V9、Published Course V2、Runtime API 2/3 兼容与 Component API 4。不打开、不导入 V8 `.h5lesson`；非 `schemaVersion: 9` 的工程一律视为不受支持。当前编辑器内没有可见 AI：无复制引用、Clipboard、Patch 应用、聊天、模型、Provider 或网络调用；`courseAiHandoff` / `courseAiPatch` 只是未挂载纯接口（internal/reserved），不得把接口预留宣称成可用工作流，也不得新增调用点。长期开发方向只看根目录 [唯一计划](COURSEWARE_DEVELOPMENT_PLAN.md)（12.5：车道 C 合同冻结 T0–T6，车道 P 教师可见缺陷 P1–P8）。V9 合同说明在 [docs/contracts/](docs/contracts/)。执行任务看 [Editor 1.0 任务包](docs/tasks/editor-1.0/00_INDEX.md)；第三方工人先读 [工人协议](docs/tasks/editor-1.0/02_WORKER.md)。新 Agent 可从 [项目认知索引](PROJECT_COGNITION_INDEX.md) 定位真实入口。当前产品事实以源码、Schema 与能力卡为准。已测通过的 V9 重建已合回 `main` 与仓库根目录：日常启动、构建和验证都在根目录进行。自动化最多证明 `engineering candidate`；具体课例只有经过真实视觉/互动复核才可称 `art candidate`，`accepted` 必须来自教师明确验收。
