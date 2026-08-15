只阅读根目录 @design.md 文档。

结合对设计的理解，如果其中包含 module 划分标准，review 这个 module 划分顺序是否合理。
根据你的研究，如果有必要，则优化文档中 module 的顺序，更新进文档。

然后根据 module 数量生成对应数量的 module doc split tasks 用来让 agent 执行 module doc 编写，放入 .workflow/tasks 中。
每一个task 的内容为：
“”“

首先阅读 .workflow/skills/skill--module-doc-split.md。

根据 design.md 开始进行 module {n} 的模块文档拆编写。

”“”

task 名称:
{order}--000--module-doc-split--{subject-id}--module--{executor}.md
{subject-id} 为 00n 递增的模块编号。

