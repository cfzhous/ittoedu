- 阅读根目录的 design.md
- 阅读模块文档
- 阅读 .workflow/review/module-impl-review--{subject-id}.md 的模块实施review 结果，其中 subject-id 为模块编号
- 明确模块目标、设计原则与边界

仅关注本模块的范围，从模块设计的角度，检查 review 报告的准确性。
并且注意：
1. 逐条审计 review 报告中的内容是否判断准确。
2. 是否有遗漏。
3. 是否有过度设计。
4. 是否存在违反设计原则的实现。
5. 对于最终运行是否存在GAP。
6. 除要求的文档与本模块相关的代码仓库的真实代码实现外，不要读取 `.workflow/` 目录下的任何其他内容

## 产出
1. 根据综合评估结果对模块实现进行优化、修正。
2. 将 review 结论与优化结果追加到 .workflow/review/module-impl-review--{subject-id}.md。

## DoD

- [ ] A 的每条发现都有明确的采纳/驳回结论与理由
- [ ] 已采纳的问题已修复，或留诚实接缝并记 `TODO.md`
- [ ] review 文档末尾已追加「B 评估与决策」「修改记录」两节
- [ ] 验收命令通过