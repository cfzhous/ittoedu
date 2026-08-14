# 当前能力路由

只在需要定位或解释当前产品能力时读取本文件。

- 机器权威：`<editor-root>/agent-kit/capabilities/index.json`。
- 按需检索：`node <editor-root>/agent-kit/bin/courseware-agent-kit.mjs capabilities --index <index> --query "<need>"`。
- 短卡片只用于收敛可用选项；决定实现前打开卡片指向的 Schema、文档或源码入口。
- 先核对 `protocols`、载体状态、作者边界、导出行为、限制和组件 release blockers。
- Capability Index 未声明的功能视为不可用；计划、旧示例和旧 Skill 不能补足它。
- 组件必须满足当前 availability、许可、维护者和质量门槛；否则回退为课例本地模块或停止。
- Agent Kit 的 CourseProject 是构建输入合同，不是产品持久化 Schema；只有当前产品编译器输出的 Project 才是工程真相。
- Flow、Spatial 2D、Mixed 或下一版协议只能在当前索引与编译器同时发布后使用。
