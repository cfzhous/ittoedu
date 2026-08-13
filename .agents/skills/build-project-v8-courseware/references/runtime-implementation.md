# Runtime 实现

从 Capability Index 的 Runtime 子合同和当前源码确认版本、字段和宿主能力。Runtime 人工文字只来自 `content.values`，可替换素材只来自 `assets`；源码不得保留第二份最终文案。

为 Runtime 定义输入、语义事件、场景/全局作用域、Authoring Inventory、Replay/Restart、resize、显隐、suspend/resume、capture、destroy、错误隔离和静态后备。复杂判定优先发出语义事件，由声明式规则连接稳定结果；不要让源码和规则重复动作。

一次性复杂整体场景可由 Runtime 主导。若它包含稳定复核态，显式提供确定画面和静态捕获；这不要求把内部每个装饰物拆成节点。

人类编辑后，Runtime 的内容/素材/关键参数通过稳定 binding Patch；不要重新生成整个 Project。
