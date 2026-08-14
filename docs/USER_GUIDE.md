# 用户指南

## 启动与项目

在仓库根目录运行 `npm install`，随后用 `npm run dev` 开发启动，或用 `npm run start` 构建并启动桌面版。

当前新建项目使用 Course Project V9。工程可以包含 Slide、Flow 和 Spatial 2D surface，并通过统一目录组成 Mixed 课程。打开旧 V8 `.h5lesson` 时走显式迁移；迁移结果应另存为 V9，不继续把 V8 当作新工程模板。

项目保存的是可编辑内容、素材、组件包、稳定 ID、课程状态声明与导航配置。网页发布物是单向交付结果，不能替代项目归档。

## 选择合适的 surface

- 需要固定投影画面、逐页讲解、公式与精确构图时用 Slide。
- 需要连续阅读、长文结构、表格、引用、语义分页或 DOCX 时用 Flow。
- 需要在二维关系空间中平移、缩放、比较位置或沿镜头探索时用 Spatial 2D。
- 一门课确实需要多种表达时再组成 Mixed；不要为了展示功能而混用。

surface 是内容布局方式，不是教学模板。讲解、探究、练习、讨论、实验、模拟或游戏化呈现都可在合适的 surface 中自由设计。

## 统一图层

Slide 与 Spatial 画面中的 Native、Runtime、Component、全局项和教师控制器都在同一图层关系中。通过图层列表调整前后顺序，不使用 `underlay` / `overlay` 两套特殊平面。

稳定文字、公式、图片、视频、形状和常用教师控制尽量使用 Native。Runtime 适合一次性的复杂动态机制；Component 适合真正需要跨课例复用、参数化和版本管理的能力。复杂并不自动意味着应该做组件。

图层项的 `layerItemId` 在保存重开后保持稳定。删除、复制、重排和 Undo/Redo 应通过编辑器操作完成，不直接手改归档内部 JSON。

## 试运行后继续编辑

“当前位置试运行”使用编辑器内同一个 Player 实例。发生点击、拖拽、作答、动画或状态变化后切回检查/编辑，画面应停留在当前可见状态，便于点选和调整。

当前画面只是会话检查点：

- 不自动改写项目初始状态；
- 不把学生答案当作作者默认值；
- 再次播放可从已定义检查点或初始状态开始；
- Slide 中只有显式点击“保存为命名复核态”才持久化当前可结构化的背景、图层顺序、几何、透明度与显隐；这些状态可切换、重命名、设为初始或删除。Runtime/Component 内部的不可表达临时状态仍只属于当前会话，不会被伪装成已保存状态。

音频、视频和动态宿主在检查模式暂停副作用，恢复播放时继续使用同一会话；离开或删除 surface 时释放资源。

## 画布点选与 AI 修改

Native 文字和图片可直接选中。Runtime/Component 中的可见文字必须提供命中目标，普通可替换图片应提供命中目标；未公开的内部装饰仍作为载体内部实现处理。双击画布目标会选择其具体作者字段，文字、图片、公式、教师控制器和已公开关键参数通过右侧作者控件修改；无法公开结构化字段的内部机制仍是源码级修改，不能伪装成可视化编辑。

一次命中包含两种身份：

- `hitId`：当前 Player 会话中的命中记录，只用于调试与视觉反馈；
- `authoringAddress`：由 project/surface/scene(or world)/carrier/layer item/field 组成的稳定作者地址。

使用“复制 AI 稳定引用”时，编辑器同时带上当前 `projectRevision`。把该引用和修改要求交给 AI，可以只替换目标文字、图片或属性。若教师已经做了其它修改，旧 revision 的 Patch 会被拒绝；重新点选和复制即可，不能让 AI 猜测覆盖。

AI 返回 Patch JSON 后，工程仍在编辑器中打开时使用“应用 AI Patch”，修改会进入当前事务并可 Undo/Redo。也可以让 Codex 从终端读取当前选择：

```powershell
npm run current:course-selection
```

只有工程已经关闭时才使用磁盘 Patch；该命令会先验证临时工程，再原子替换 `.h5lesson` 并重新生成默认 `course.html`：

```powershell
npm run patch:course-project -- --project <project.h5lesson> --patch <patch.json>
```

磁盘命令发现同一工程仍在 Course Studio 中打开时会拒绝覆盖，而不会绕过未保存修改。

## 课程状态与导航

项目可以声明有限类型的课程状态、严格条件与动作，以及普通导航守卫。适合尝试次数、是否完成、检查点、结果揭示和重启等可解释逻辑；不接受任意表达式作为第二套程序。

普通目录、前后翻页和深链接遵守导航守卫。作者检查与静态捕获可以使用明确的旁路入口，避免为了导出而伪造学生完成状态。重启清理会话状态并回到项目定义的起点。

## 导出与复核

- 单 HTML：适合拷贝和离线打开，包含运行所需资源。
- 网页包：资源分文件，复制时必须保持目录结构。
- PDF：Slide 捕获稳定画面；Flow 使用真实分页；Spatial 使用总览/镜头；Mixed 按打印计划组合。
- DOCX：用于 Flow 的可继续编辑语义文档，互动会以说明或静态结果表达。
- PPTX：用于 Slide 静态兼容，不保留浏览器互动。

导出前检查内容、图层、命中、字体、公式、素材、交互关键状态和静态差异。自动测试通过只说明工程检查成立（`engineering candidate`）；投影可读性、课堂节奏和视觉品质仍需真实画面复核，教师明确确认前不得称为 `accepted`。

## 与 Codex 协作

教学策划使用 `$orchestrate-courseware`。它直接读取材料，并维护：

- `01-teaching-plan.md`
- `02-presentation-script.md`

教师可直接在 Codex 中打开和修改 Markdown。材料越完整，问题越少；只有主题时可以通过多轮提问补足高影响决策。两份文件确认后，使用干净的 `$build-courseware-project` 从文件重新开始构建，不把长聊天摘要当成事实源。

Builder 会按需查询 `agent-kit/capabilities/index.json`，先验证最高风险片段，再增量构建。教师手工修改项目后，后续 AI 应使用稳定地址做局部 Patch，而不是整课重生。

仓库中的 `examples/course-project-v9/` 提供三种差异明显的工程样例，用于验证 Slide、Flow、Spatial 2D、Mixed、保存重开与离线发布。它们是工程回归样例，不是强制教学模板，也不代表已经由教师验收。

本地安装两个 Skill：

```powershell
npm run install:courseware-skills
```

安装不需要 Hash 或审批状态；若要审查教学决策，直接审阅两份 Markdown。

## 故障恢复

- 项目不能打开：保留原文件，先看明确的 Schema/归档错误；旧 V8 应走显式迁移。
- 画布项无法点选：检查图层可见性、锁定和载体是否公开作者目标，不用临时 `hitId` 手工猜路径。
- AI Patch 冲突：重新打开当前项目、重新点选并复制引用。
- 试运行返回初态：确认使用的是编辑器托管 Player 的检查模式，而不是重新创建预览 iframe。
- 离线 HTML 缺资源：重新从项目发布，确认素材和组件包已嵌入；不要依赖相邻仓库或绝对磁盘路径。
- Runtime/Component 遮住公式或控制器：在统一图层列表调整顺序，并检查载体根元素没有建立脱离宿主的顶层覆盖层。

仓库维护者可运行 `npm run verify:clean-windows` 做本机隔离验证；GitHub Actions 还会在全新的 `windows-latest` checkout 上执行同一门禁。
