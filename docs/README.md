# 文档导航

本文只负责回答“现在应读哪一份文档”。实现、协议或路线发生变化时，优先更新下列权威文档，不再新增同主题的临时计划稿。

## 当前使用

| 目的 | 权威入口 |
|---|---|
| 产品概览、启动、架构与命令 | [根目录 README](../README.md) |
| 教师和课件作者操作 | [用户指南](USER_GUIDE.md) |
| 当前软件路线与后续 W1/W2/W3 | [内部正式版与多表面开发计划](../MULTI_SURFACE_DEVELOPMENT_PLAN.md) |
| AI 教学设计、批准与就绪派生 | [`orchestrate-courseware`](../.agents/skills/orchestrate-courseware/SKILL.md) |
| AI 构建、局部 Patch、验证与证据交付 | [`build-project-v8-courseware`](../.agents/skills/build-project-v8-courseware/SKILL.md) |
| 双 Skill 设计、上下文减负与 V1 迁移关系 | [AI 互动课件 Skill 设计与迁移说明](AI_COURSEWARE_SKILL_DESIGN.md) |
| 人类审阅编排背景与设计依据 | [AI 互动课件通用创作编排规范](AI_COURSEWARE_ORCHESTRATION.md) |
| 人类审阅 Project V8 创作与接入背景 | [AI 互动课件创作与接入规范](AI_COURSEWARE_AUTHORING.md) |
| Runtime API 2 | [场景与全局自由运行时开发指南](RUNTIME_AUTHORING.md) |
| Component API 4 | [互动组件开发指南](COMPONENT_AUTHORING.md) |
| 单 HTML / 网页包发布输入 | [PublishedLesson V1](PUBLISHED_LESSON_V1.md) |
| 机器发现当前契约 | [`artifacts/ai-capabilities/index.json`](../artifacts/ai-capabilities/index.json) |
| 无界面自检完整 Project V8 | `npm run --silent validate:project -- <file.h5lesson>` |

当前主干只接受 Project V8、Runtime API 2、Runtime Authoring 1 与 Component API 4。`orchestrate-courseware` 以 `fast | standard | high-risk` 选择最薄充分路径，由 V2 校验器根据当前制品和人类批准哈希派生 `implementation-ready`；随后 `build-project-v8-courseware` 才可使用真实仓库 API 构建、修补和交付证据。归档的 V7 Skill 不能用于当前主干。自动管线最多给出 `engineering candidate`；`art candidate` 需要真实视觉/互动证据，`accepted` 必须来自明确的人类验收。

## 当前证据与待决策项

| 文档 | 性质 |
|---|---|
| [课件工作流 W1 验证记录（2026-08-13）](reviews/COURSEWARE_WORKFLOW_W1_VERIFICATION_20260813.md) | 当前薄编排 V2、V8 Builder、真实性证据、安装迁移与 129/801 自动化基线；不含 W2 人工产品验收 |
| [W3 Windows / 离线可移植性验证记录（2026-08-13）](reviews/W3_WINDOWS_PORTABILITY_VERIFICATION_20260813.md) | 同机隔离目录版/Portable、工程断源移动和离线 HTML/网页包 7/7；仅为 `engineering candidate`，不替代另一台干净 Windows 或 W2/W3 人工验收 |
| [AI-native 编辑器基建验证记录（2026-08-12）](reviews/AI_NATIVE_EDITOR_FOUNDATION_VERIFICATION_20260812.md) | 身份断代前的 P0–P4 基线；其数字只用于历史溯源 |
| [R0 公式作者编辑技术决策](reviews/FORMULA_AUTHORING_R0_DECISION_20260811.md) | 当前公式输入路线的有效决策记录 |
| [声明式课程状态与导航守卫 RFC](reviews/DECLARATIVE_COURSE_STATE_RFC_20260812.md) | 待人类批准的提案；不是当前 Project V8 能力 |
| [Unified Authoring Blueprint RFC](reviews/UNIFIED_AUTHORING_BLUEPRINT_RFC_20260813.md) | 研究提案；不阻塞 V8 Builder MVP，也不是当前产品能力 |
| [产品身份断代与 Headless 自检验证记录](reviews/PRODUCT_IDENTITY_RENAME_VERIFICATION_20260812.md) | 2026-08-12 整体基线：ittoedu 身份、能力门禁、Project V8 自检、127/799、隐藏 E2E 27/27 与制品冒烟 16/16 |
| [组件库收敛验证记录](reviews/COMPONENT_LIBRARY_CONSOLIDATION_VERIFICATION_20260813.md) | 当前组件事实：两项语文组件 + 两项通用视觉容器，画布文字与 2/2 隐藏矩阵 |

## 历史与失败证据

- [内部正式版 1.0 里程碑 0 冻结记录](INTERNAL_1_0_MILESTONE_0.md) 解释从归档原型到当前单轨协议的处置依据。
- 相邻 [`courseware-cases`](../../courseware-cases/README.md) 保存历史课例、脚本、证据和导出；其中 [《让运动变成函数》失败课例记录](../../courseware-cases/high-school/math/math-motion-failure-0/docs/courseware-pilots/math-motion/ORCHESTRATION_RECORD.md) 保持 `pipeline: passed / outcome: rejected`，不得作为模板或成功案例。
- 更早的 Editor 1.6/1.7、Project V7 开发计划和实现细节由 Git 标签 `internal-prototype-1.7.0` 保存，不在当前主干重复维护。

## 维护规则

1. 当前能力只写入 README、用户指南和对应协议指南。
2. 未来计划只写入根目录开发计划；讨论稿吸收后删除。
3. 一次性技术选择保留为短决策记录；测试结果保留为带日期的证据报告。
4. 历史数字必须标明日期，不得称为“当前基线”。
5. 工作流与 Skill 的当前事实只能写入对应权威规范，不从聊天或旧评审稿补写。
