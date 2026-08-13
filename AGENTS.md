# 互动课件创作路由

- 教学需求、课例设计、内容闭合、呈现脚本、必要的视觉方向和哈希审批，使用仓库机器执行权威 [orchestrate-courseware](.agents/skills/orchestrate-courseware/SKILL.md)。它按 `fast | standard | high-risk` 选择最薄充分路径；`request_user_input` 可用时直接调用。学科专有要求优先由用户材料、学科 Skill 或本次提示词补充，不堆入通用流程。
- 只有课例经 V2 校验器派生出当前有效的 `implementation-ready` 后，才使用仓库机器执行权威 [build-project-v8-courseware](.agents/skills/build-project-v8-courseware/SKILL.md) 选择载体、维护 Authoring Inventory、构建或局部 Patch、验证 Project V8 并交付证据。内容、批准或 Capability 失效时返回编排，不从聊天摘要、旧工程或模板补写。
- [通用创作编排规范](docs/AI_COURSEWARE_ORCHESTRATION.md) 与 [当前创作与接入规范](docs/AI_COURSEWARE_AUTHORING.md) 是供人类审阅和工程维护的背景/设计说明；AI 按 Skill 路由并只加载任务所需章节，不以完整阅读两份长文作为每次创作的前置门禁。

当前生成协议仅为固定 1280×720 的 PPT 兼容模式：Project V8 / Runtime API 2 / Runtime Authoring 1 / Component API 4。不得伪造尚未发布的长文、无限画布、混合表面或其他 Project 字段；自动化管线最多给出 `engineering candidate`，`art candidate` 还需真实视觉/互动证据，`accepted` 必须来自明确的人类验收。
