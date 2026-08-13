# Project V8 公式与学科排版

数学含义必须独立于字体捷径保存。Project V8 的一等 `FormulaNode` 是当前默认承载：使用稳定 `formulaId`、完整 `accessibleText`、结构化 `FormulaAstNode` 和明确样式；实现入口读取 Capability Index 指向的当前节点工厂与 Schema。

AST 只使用当前七类：`row | token | operator | fraction | root | script | fenced`。显示分式使用 `fraction`，根式使用 `root`，上下标使用 `script`，围栏使用 `fenced`。禁止用 `½`、`⅓`、`¼`、普通 `1/2` 或截图冒充结构化显示公式。只有获批内容明确要求比例、单位、URL、源码或线性记法时，斜线文本才是正确语义。

向量、矩阵、分段函数、多行对齐等当前 AST 未覆盖结构，可以由 Runtime/Component 确定性绘制，但必须：

- 保存唯一结构化内容源，不把可见公式硬编码为不可追溯绘图命令；
- 在 Authoring Inventory 中登记公式、参数、稳定绑定和真实编辑入口；
- 提供 `accessibleText` 或同等无障碍描述；
- 提供确定的 authoring/capture 画面和静态后备；
- 不宣称支持任意 LaTeX，也不注入不受信任 HTML。

每个 `FORM-*` 至少复核：

1. 获批内容与工程的 `formulaId`、AST、无障碍文本一致；
2. 1280×720 编辑画布与 Player 的基线、分数线、根号、字号、裁切和对比；
3. 保存、关闭、重开以及状态覆盖不改变稳定身份；
4. HTML/网页包/PDF/PPTX 的实际渲染；
5. PPTX 透明图片降级保留 `formulaId`/无障碍元数据，并明确不能在 PowerPoint 内拆分编辑；
6. 公式修改更新同一语义源，没有陈旧截图或第二套字符串后备。

源码扫描只发现已知危险写法，不能代替视觉和学科正确性验收。
