只阅读模块文档，按照模块文档中task拆分建议，将文档拆分成给 agent CLI 执行的tasks。

结合对模块本身的理解，将其中的task 拆分成task card放入.workflow/outbox 中.

文件名格式为 xxx--000--impl--{module 3 digits code}--{task name}.md，其中xxx为当前outbox中按照001 002 顺序追加为下一个task的序号。

开头声明：
”使用.workflow/skills/skill--task-impl.md skill，阅读 .workflow/docs/context.md"

要求"先阅读模块文件要求，只关注当前task"。强 agent 会结合代码库和模块文档自行探索实现细节，不需要在task文档里过度规定文件及步骤，所以要在开发目标的完整性、开发内容的容易踩坑、容易出现设计错误或者开发问题的部分根据业界经验进行充分考虑。关注task card的实现内容，通用的执行task的要求有skill--task-impl.md实现。


task card 结构：
开头声明
目标
要读的文件（起码包含模块设计文档）
may_modify
设计注意与常见踩坑
验收命令
DoD

