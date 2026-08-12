# 文档导航

本文只负责回答“现在应读哪一份文档”。实现、协议或路线发生变化时，优先更新下列权威文档，不再新增同主题的临时计划稿。

## 当前使用

| 目的 | 权威入口 |
|---|---|
| 产品概览、启动、架构与命令 | [根目录 README](../README.md) |
| 教师和课件作者操作 | [用户指南](USER_GUIDE.md) |
| 当前软件路线与后续 W1/W2/W3 | [内部正式版与多表面开发计划](../MULTI_SURFACE_DEVELOPMENT_PLAN.md) |
| AI 实现 Project V8 时的工程合同 | [AI 互动课件创作与接入规范](AI_COURSEWARE_AUTHORING.md) |
| 教学设计、批准与验收编排 | [AI 互动课件通用创作编排规范](AI_COURSEWARE_ORCHESTRATION.md) |
| Runtime API 2 | [场景与全局自由运行时开发指南](RUNTIME_AUTHORING.md) |
| Component API 4 | [互动组件开发指南](COMPONENT_AUTHORING.md) |
| 单 HTML / 网页包发布输入 | [PublishedLesson V1](PUBLISHED_LESSON_V1.md) |
| 机器发现当前契约 | [`artifacts/ai-capabilities/index.json`](../artifacts/ai-capabilities/index.json) |

当前主干只接受 Project V8、Runtime API 2 与 Component API 4。新的 Project V8 实现 Skill 尚未完成，因此 AI 可以完成策划和 `implementation-ready` 交接，但必须暂停在工程生成门禁；归档的 V7 Skill 不能用于当前主干。

## 当前证据与待决策项

| 文档 | 性质 |
|---|---|
| [AI-native 编辑器基建验证记录（2026-08-12）](reviews/AI_NATIVE_EDITOR_FOUNDATION_VERIFICATION_20260812.md) | 最新自动化基线：123 文件 / 777 项 Vitest、隐藏 E2E 27/27；结论为 `engineering candidate` |
| [软件本体验收证据报告（2026-08-11）](reviews/SOFTWARE_CORE_VERIFICATION_20260811.md) | S6 历史证据快照；数字不得替代 2026-08-12 基线 |
| [R0 公式作者编辑技术决策](reviews/FORMULA_AUTHORING_R0_DECISION_20260811.md) | 当前公式输入路线的有效决策记录 |
| [声明式课程状态与导航守卫 RFC](reviews/DECLARATIVE_COURSE_STATE_RFC_20260812.md) | 待人类批准的提案；不是当前 Project V8 能力 |

## 历史与失败证据

- [内部正式版 1.0 里程碑 0 冻结记录](INTERNAL_1_0_MILESTONE_0.md) 解释从归档原型到当前单轨协议的处置依据。
- [AI 互动课件创作 Skill 设计草案](AI_COURSEWARE_SKILL_DESIGN.md) 是 Project V7 Skill V1 的历史设计，只用于后续 V8 Skill 重做时参考。
- [《让运动变成函数》失败课例记录](courseware-pilots/math-motion/ORCHESTRATION_RECORD.md) 保持 `pipeline: passed / outcome: rejected`，不得作为模板或成功案例。
- 更早的 Editor 1.6/1.7、Project V7 开发计划和实现细节由 Git 标签 `internal-prototype-1.7.0` 保存，不在当前主干重复维护。

## 维护规则

1. 当前能力只写入 README、用户指南和对应协议指南。
2. 未来计划只写入根目录开发计划；讨论稿吸收后删除。
3. 一次性技术选择保留为短决策记录；测试结果保留为带日期的证据报告。
4. 历史数字必须标明日期，不得称为“当前基线”。
5. 工作流与 Skill 的当前事实只能写入对应权威规范，不从聊天或旧评审稿补写。
