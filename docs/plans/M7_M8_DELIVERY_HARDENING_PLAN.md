# M7–M8：Mixed、发布与最终收敛

> PARENT: [`COURSEWARE_DEVELOPMENT_PLAN.md`](../../COURSEWARE_DEVELOPMENT_PLAN.md)
> PREREQUISITE: M5 与 M6 Gate
> STATUS: pending
> OUTCOME: 混合课程、五类导出、文档能力和最终产品合同一致

## 1. M7：Mixed 与发布

### M7-A：跨表面课程导航

- Slide、Flow、Spatial 共用 CourseLocation、state、guard 和教师控制器动作。
- previous/next/go/picker 跨表面只执行一次，不由 SurfaceHost 与 Published App 双执行。
- replay 与 restart 的作用域明确。
- 完全关闭重开后 startLocation、引用、guard 和跨表面 target 保持一致。

### M7-B：Published Course V2 整课 Player

- 同一 producer 输出被 Preview、Trial、HTML 和网页包消费。
- SurfaceHost 切换时销毁旧互动、Runtime、Component、媒体和输入订阅。
- `playback.controls: canvas | none` 被严格执行。
- HTML/网页包不生成 `.course-nav` 或画布外“上一页/下一页”底栏。
- 普通错误不泄露内部 ID、API 方法、文件路径或协议分层。

### M7-C：五类真实导出

M7-B 集成后，五类导出按格式并行派发（每格式一个任务单元，owns 各自导出链）。每类至少完成一个代表性 Mixed 样例：

1. 单 HTML。
2. 网页包。
3. PDF。
4. PPTX。
5. DOCX。

要求：

- HTML/网页包保留真实互动和资源。
- PDF 使用明确的打印计划和视觉降级，不静默丢页。
- PPTX 保持可用版式和必要静态 fallback。
- DOCX 保留 Flow 的语义结构、标题、表格、公式和媒体说明。
- 导出前统一校验 archive、引用、组件包和资源二进制。
- 不以“文件已生成”替代真实打开、页面数量和代表性视觉检查。

### M7 Gate

一个 Mixed 工程完成跨表面运行、保存重开和五类导出。只保留一个代表性整课 Electron/HTML 流程，各导出用最小文件级或渲染级验证，不为每种格式重复整套编辑流程。

## 2. M8：最终收敛

M8-A、M8-B、M8-C 在 M7 Gate 后并行派发（owns 分别为旧路线断开、产品语言、文档与能力卡）；M8-D 在三者集成后最后单独运行。

### M8-A：删除不可达旧路线

- ProductApp 只渲染原 App。
- 默认新建、编辑、保存、恢复和发布只使用 Course Project V9。
- V8 只保留显式导入迁移和必要兼容测试。
- 断开 CourseStudioApp、CourseSurfaceCanvas、V9EditorShell、旧顶层协议和不可达占位入口。
- 只删除确认无消费者的兼容层；不做无关命名、格式或架构美化。

### M8-B：产品语言与可达能力

- 普通教师 UI 不出现 V8/V9/Surface/Native/Runtime/Component 等协议词。
- 所有可达按钮真实工作；未支持能力必须局部禁用或移除，不能点击无效。
- 顶栏、左栏、中央、状态条、右栏、缩放和底部状态在三档窗口成立。
- 教师控制器在 Slide/Flow/Spatial 与 Mixed 中行为一致。

### M8-C：文档、Skill 与能力卡

同步：

- `docs/USER_GUIDE.md`
- `docs/COURSE_PROJECT_V9.md`
- `docs/RUNTIME_AUTHORING.md`
- `docs/COMPONENT_AUTHORING.md`
- `.agents/skills/orchestrate-courseware/SKILL.md`
- `.agents/skills/build-courseware-project/SKILL.md`
- `agent-kit/capabilities/index.json`
- 示例工程和发布产物说明

能力卡只声明正式产品可达且有最小证据的能力。Builder 不得继续依赖已废弃绕行。

### M8-D：最终验证与结果等级

只运行一次根计划 L4 集合。最终报告分别给出：

- Pipeline status：类型、测试、构建、保存重开、Player、导出。
- Outcome status：实际 UI、互动和代表性课例质量。

可使用 `unusable`、`placeholder`、`engineering candidate`、`art candidate`、`accepted`。没有教师明确验收时，最高只能报告 `art candidate`。

## 3. 最终完成定义

以下事实同时成立才可关闭计划：

1. 原 App 是唯一产品入口，原核心 UI 文件仍在正式调用链。
2. Course Project V9 是唯一默认工程真相，V8 只作显式迁移。
3. Slide、Flow、Spatial、Mixed 均可编辑、试运行、保存重开和发布。
4. Published Course V2、Runtime 2/3、Component 4 与五类导出有真实样例。
5. 无画布外旧导航、无第二壳、无隐藏双写、无普通教师协议词。
6. 文档、Skill、能力卡与可达产品一致。

## 4. 明确不做

- 不为了最终清理引入新框架或重排全仓库。
- 不通过更新 golden、降低阈值、扩大 mask 或测试专用入口掩盖壳层差异。
- 不重复运行已经在同一 SHA 上成功的全量 Gate。
- 不把自动化通过描述成教师已经接受产品。
