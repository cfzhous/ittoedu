阅读模块，理解模块目标、设计原则与边界。
只根据文件名机械定位并阅读 .workflow/outbox 下本模块对应的impl task card draft：只允许读取文件名包含 `--impl--{模块代码}--` 且以 `.md` 结尾的文件；
不得通过内容搜索扩大范围。
按照顺序逐个 review 这些task card draft是否可执行、范围是否清晰、与模块目标是否一致。
将 review 结论与优化建议写入 .workflow/review/module-review--{subject-id}.md，subject-id 为模块编号。
强 agent 会结合代码库和模块文档自行探索实现细节，不需要在task文档里过度规定文件及步骤，重点是 task card 是否合理，其余实现细节交给执行 agent 自行判断，不要过度规定。
