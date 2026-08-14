# 互动课件创作路由

- 教学主题、教材、教案、题目、课程标准或既有课件先交给仓库内的 [orchestrate-courseware](.agents/skills/orchestrate-courseware/SKILL.md)。它只维护教师可直接阅读和修改的 `01-teaching-plan.md` 与 `02-presentation-script.md`；材料充分时少问，材料稀缺时围绕高影响缺口继续追问。
- 两份当前 Markdown 经教师确认后，使用 [build-courseware-project](.agents/skills/build-courseware-project/SKILL.md)。Builder 从文件冷启动，按需查询 [Agent Kit 能力卡](agent-kit/capabilities/index.json)，先做高风险纵切，再增量装配、局部修复和验证 Course Project V9。
- 通用 Skill 不规定课型、场景数、教学法、页面模板或视觉风格。Native、Runtime 与 Component 是实现载体：稳定内容优先 Native；一次性复杂动态机制用 Runtime；只有确有跨课例复用价值时才使用 Component。
- 所有 Native、Runtime、Component 与教师控制器都进入统一图层。画布文字必须可命中，普通可替换图片应可命中；临时 `hitId` 不得代替跨保存稳定的 `authoringAddress`。
- 教师工作流不使用 Hash、签名、审批状态机、候选等级或 Evidence 清单。工程仍必须通过当前 Schema、类型、保存重开、真实 Player、导出和体验复核。

当前产品协议是 Course Project V9、Published Course V2、Runtime API 2/3 兼容与 Component API 4。V8 只作为显式导入迁移和必要兼容测试存在，不得作为新课件默认生成路线。长期开发方向只看根目录 [唯一计划](COURSEWARE_SKILL_REFACTORING_PLAN.md)，当前产品事实以源码、Schema 与能力卡为准。自动化最多证明 `engineering candidate`；具体课例只有经过真实视觉/互动复核才可称 `art candidate`，`accepted` 必须来自教师明确验收。
