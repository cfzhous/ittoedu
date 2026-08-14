# Course Project V9 真实课例集

这里不是页面模板库。三个课例刻意使用不同的教学组织与表面：

- `parabola-lab`：固定 Slide 中的原生内容、统一图层、参数 Runtime、课程状态与导航守卫；
- `historical-evidence`：以长文阅读为中心的 Flow，包含引用、表格、折叠分节和一个证据归类 Component；
- `ecosystem-mixed`：Slide 提问、Flow 校准概念、Spatial 2D 路径探索组成的 Mixed 课程。

每个课例长期只保留教师可读的两份 Markdown、可编辑 `project.h5lesson` 和自包含 `course.html`。运行时与组件若有跨课例价值，属于正式能力模块，不复制进课例目录。构建时产生的任务图、截图、探针和报告是临时文件。

运行 `npm run build:course-cases` 会先使用 Courseware Agent Kit 的语义 SDK 与产品编译器装配 V9 工程，再通过真实 Schema、归档和 Published Course V2 生成交付文件。`npm run verify:course-cases` 会移动并重开工程、检查离线 HTML 资源闭包、导出语义和课例性能预算。

这些文件只能证明可重复构建的工程候选；具体课例还要经过真实画面与关键互动复核才可称 `art candidate`，教师明确确认前不得称为 `accepted`。通用 3D 在当前课例集中为 **No-Go**：三个任务都没有显示“直接编辑三维空间”是必要条件，Spatial 2D 已足以表达食物网的空间路径；只有后续多个真实课例同时证明 2D 无法满足且教师能控制三维作者流程时才重新立项。Component Publish Units 同样不进入当前主线：现有组件包已能自包含发布，尚无大组件基准证明拆分发布单元能带来足以抵消复杂度的收益。
