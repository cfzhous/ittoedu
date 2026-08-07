# 互动课件创作入口

涉及互动课件的策划解读、制作、生成或验收时，必须使用仓库权威 Skill [orchestrate-courseware](.agents/skills/orchestrate-courseware/SKILL.md)，并完整阅读 [通用创作编排规范](docs/AI_COURSEWARE_ORCHESTRATION.md)，先把上下文、人类决策、教学设计、教学内容规格、教学呈现脚本和必要的视觉方向落入独立课例档案并取得逐阶段批准。聊天记录或压缩摘要不得充当唯一交接真相。

取得哈希有效的 `implementation-ready` 交接记录后，必须改用 [build-project-v7-courseware](.agents/skills/build-project-v7-courseware/SKILL.md)，再完整阅读 [Project V7 创作与接入规范](docs/AI_COURSEWARE_AUTHORING.md) 进入实现。涉及编辑器的场景状态、运行时/组件关系、缩略图、编辑/运行画布、Project Schema、组件设计或导出语义时，同样必须阅读后者。交接无效、内容缺失或脚本无法追溯时不得从聊天或既有实现自行补写，应返回相应编排阶段。

通用编排规范负责跨学科的设计收敛、人类门禁、结果验收和复用治理；Project V7 规范负责当前 PPT 兼容模式的工程承载、可编辑边界、运行时/组件、生命周期和导出。不得把尚未开发的创作模式写成当前生成能力。修改实现后，应同步核对 README、用户指南、运行时/组件指南、开发验收基线和示例说明，避免文档继续描述已经淘汰的数据模型或工作流。
