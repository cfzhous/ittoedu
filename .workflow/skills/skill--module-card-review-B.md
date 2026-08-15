阅读模块，理解模块目标、设计原则与边界。
检查 .workflow/review/module-review--{subject-id}.md（subject-id 为模块编号）这个报告是否合理。
task card 位置：只根据文件名机械定位并阅读 .workflow/outbox 下本模块对应的impl task card draft：只允许读取文件名包含 `--impl--{subject-id}--` 且以 `.md` 结尾的文件；不得通过内容搜索扩大范围。找到对应的task card draft。
强 agent 会结合代码库和模块文档自行探索实现细节，不需要在task文档里过度规定文件及步骤，重点是 task card 是否合理，其余实现细节交给执行 agent 自行判断，不要过度规定。
根据对这个review报告的总结，进行修复，如果有额外的发现，也同样进行修复。
最后将总结追加到review文档之后。