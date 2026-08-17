# 互动课件编辑器

这是一个面向教师的可编辑互动课件桌面编辑器。当前主线以 Course Project V9 为工程真相，在同一项目中支持 Slide、Flow、Spatial 2D 与 Mixed 课程；网页发布使用 Published Course V2。V8 仅保留显式导入迁移和必要兼容测试，不再是 AI 新建课件的默认路线。

长期开发范围和完成定义只看 [根目录唯一计划](COURSEWARE_DEVELOPMENT_PLAN.md)。新 Agent 可从 [项目认知索引](PROJECT_COGNITION_INDEX.md) 进入真实代码；当前可用能力仍以源码、Schema 与 [Agent Kit 能力卡](agent-kit/capabilities/index.json) 为准。

当前仓库状态是 `engineering candidate`（集成候选）：并行收敛（LAYOUT/SHELL/FLOW/AI-BOUNDARY/RELEASE）与窄集成（I1）已通过定向验证，保存重开、发布与导出有 E1 机器断言（38/38）；最终全量 Gate（Z1）与真实视觉/互动复核（Z2）仍待执行。`art candidate` 只适用于已经过真实画面与关键交互复核的具体课例；`accepted` 必须由教师明确确认，当前不作此声明。

## 快速开始

要求 Windows、Node.js 与 npm。

```powershell
npm install
npm run dev
```

构建并启动桌面版：

```powershell
npm run start
```

`npm run prestart` 会把仓库内两个薄 Skill 安装到当前用户的 `%USERPROFILE%\.agents\skills`。也可手动运行：

```powershell
npm run install:courseware-skills
```

安装器只管理 `orchestrate-courseware` 与 `build-courseware-project` 两个明确目录，并清理同一安装根下的旧 `build-project-v8-courseware` / `build-project-v7-courseware` 目录；不会扫描或删除其它 Skill，也不维护 Hash 或安装状态机。

## 当前产品模型

- `CourseProjectDocument` / Schema V9：可编辑项目、素材、组件包、课程状态、导航和多个 surface 的唯一事实源。
- `slide`：固定 1280×720 场景，Native、Runtime、Component 与教师控制器共同进入一个显式图层顺序。
- `flow`：标题、段落、列表、引用、媒体、表格、公式、代码、提示块、章节和组件组成的语义长文。
- `spatial-2d`：二维世界、相机、镜头书签与语义缩放；不是通用 3D 编辑器。
- `mixed`：通过统一 location、目录、深链接、进度和课程状态连接多种 surface。
- 教师控制器：始终只有 `project.globalLayerItems` 中一个全局副本，可从任意 Slide/Flow/Spatial 当前页点选修改并全课生效，不复制到 scene/surface/world。
- `PublishedCourseV2Payload`：面向 Player 的单向发布数据，不可作为编辑项目重新导入。

V9 不公开 `underlay` / `overlay`。全局、surface、scene/world 中的所有可视项以稳定 `layerItemId` 和显式 `order` 合成；选择、播放、保存与导出必须遵循同一顺序。Flow 的语义块仍是文档流，surface/global 视觉项在文档上方的统一覆盖层内排序，不与段落逐项交错。显式 V8 迁移保留单平面 Runtime；无法无损表达的旧双平面 Hybrid 会被拒绝，而不是静默改变层级。

## AI-native 与无降级表面边界

- 编辑器保持低学习成本和克制的默认界面，但 V8 已经可用的编辑能力是 V9 迁移底线；低频能力可以渐进披露，不能以“轻量”为理由删除或禁用。
- 普通教师保留点选、拖缩、就地改字、增删排序、少量高频属性、撤销/保存/试运行/导出；跨页批量、复杂互动和动态机制优先由 AI 完成。
- 纯 Slide、纯 Flow、纯 Spatial 与 Mixed 的界面从现有 `locations` / `surfaces` 自动推导，不新增工程形态字段；新建工程和课程结构必须直接提供三类 surface 的创建入口，不能只靠外部导入形成。
- V9 的 global/surface 共享层继续供编辑器、引擎和发布使用；在统一有效图层达到完整 ownership-aware 操作等价前，保留 V8 表面的全局与 surface 共享作者入口，不启动 V10 迁移。
- 详细取舍、当前缺口和执行顺序以 [根目录唯一计划](COURSEWARE_DEVELOPMENT_PLAN.md) 为准。

## 编辑与外部 AI 协作边界

Native 承担稳定文字、公式、图片、视频、形状和常用控制；一次性复杂动态机制用 Runtime；只有确有跨课例复用价值时才用 Component。

Runtime/Component 中当前可见文字必须可命中，普通可替换图片应可命中。画布命中产生会话 `hitId`，跨保存定位使用稳定 `authoringAddress`。为未来外部协作预留的纯接口按稳定 `authoringAddress` + 当前 `projectRevision` 构造字段上下文；过期 revision 会被拒绝，避免覆盖教师后续修改。

编辑器托管的 Player 可以在同一实例中从试运行切回检查/编辑，保留当前交互画面。该画面是会话检查点，不会自动变成项目默认答案；只有教师显式保存的命名状态才进入工程。

**当前版本编辑器内没有可见 AI**：没有复制引用、Clipboard、Patch 文件选择或应用、聊天、模型、Provider 或网络调用；只保留未挂载的纯接口 `courseAiHandoff` / `courseAiPatch`（internal/reserved），不在任何产品界面可达。磁盘 Patch 命令仍可在工程已关闭时原子更新 `.h5lesson` 和默认 HTML；工程仍处于打开状态时命令会拒绝覆盖。命令通过选择桥判断编辑器是否打开，而当前编辑器没有生产写入方，实际使用以人工确认工程已关闭为准。

工程已关闭时运行（revision 保护的原子 Patch）：

```powershell
npm run patch:course-project -- --project <project.h5lesson> --patch <patch.json>
```

## AI 创作路径

仓库只保留两个薄 Skill：

1. [orchestrate-courseware](.agents/skills/orchestrate-courseware/SKILL.md) 读取教师材料，形成自由结构的 `01-teaching-plan.md` 与 `02-presentation-script.md`。
2. [build-courseware-project](.agents/skills/build-courseware-project/SKILL.md) 从两份确认文件冷启动，通过 [Courseware Agent Kit](agent-kit/) 查询能力、做高风险纵切、装配 V9 项目、局部 Patch 和验证。

Skill 不规定课型、场景数、教学模板或视觉风格，也不使用 Hash、签名、审批状态机、候选等级或 Evidence 清单。质量要求落在内容正确性、可编辑性、真实 Player、保存重开、导出和独立体验 QA 上。

能力检索示例：

```powershell
node agent-kit/bin/courseware-agent-kit.mjs capabilities --index agent-kit/capabilities/index.json --query "长文 公式 DOCX"
```

## 导出

- 单 HTML / 网页包：保留当前 Player 所需的互动、媒体、Runtime 和 Component；执行代码会到达浏览器，不构成 DRM。
- PDF：使用 surface-aware 打印输入；Flow 是语义分页，Spatial 由总览/镜头定义，Mixed 按打印计划组合。
- DOCX：由 Flow 语义块映射，不是长截图；统一覆盖图层以按顺序的 Native/动态后备章节输出，不静默丢弃。
- PPTX：面向 Slide 的静态兼容输出。动态内容应报告静态化、后备或省略，不假装保留互动。

## 常用命令

| 命令 | 用途 |
| --- | --- |
| `npm run dev` | 开发模式启动 Renderer 与 Electron |
| `npm run typecheck` | 检查产品、Electron 与 E2E 类型 |
| `npm test` | 当前单元/集成测试与 Agent Kit 测试 |
| `npm run test:compat` | 必要的 V8 / PublishedLesson V1 / Runtime API 2 / Component API 4 兼容测试 |
| `npm run test:e2e` | 构建课例并运行 V9 默认边界、控制器/健康、Trial Run 与真实 Mixed 课程 Electron E2E；不属于默认快速验证 |
| `npm run check:ai-capabilities` | 只读检查短 V9 能力卡、来源和版本 |
| `npm run generate:ai-capabilities` | 规范化能力卡 JSON 后再检查 |
| `npm run current:course-selection` | 读取选择桥中记录的稳定引用（保留命令；当前编辑器没有生产写入方，写入方为已不可达的 Course Studio donor） |
| `npm run patch:course-project -- --project <file> --patch <json>` | 对已关闭的 V9 工程执行 revision 保护的原子 Patch，并重发默认 HTML |
| `npm run build:course-cases` | 用 Agent Kit 构建并验证三个差异课例 |
| `npm run verify:course-cases` | 在已有 Player bundle 上只读验证三课例定义与交付闭环 |
| `npm run build:desktop` | 构建 Player、Renderer 与 Electron |
| `npm run verify` | 当前默认验证：能力卡、类型、单元/集成、Agent Kit 与桌面构建 |
| `npm run verify:full` | 默认验证后再运行显式 Electron E2E |
| `npm run verify:clean-windows` | 在隔离临时根验证 Skill 安装、冷 Agent Kit、V9 归档移动重开和无网络单 HTML |

## 文档

- [用户指南](docs/USER_GUIDE.md)
- [Course Project V9](docs/COURSE_PROJECT_V9.md)
- [AI 创作与 Agent Kit](docs/AI_COURSEWARE_AUTHORING.md)
- [Runtime 作者边界](docs/RUNTIME_AUTHORING.md)
- [Component API 4 作者边界](docs/COMPONENT_AUTHORING.md)
- [文档导航](docs/README.md)

评估稿和旧里程碑记录是决策输入，不是当前操作入口；已整合结论只看根目录唯一计划。

`.github/workflows/clean-windows.yml` 会在 GitHub 的全新 `windows-latest` checkout 上执行 `npm ci`、默认验证与 clean-Windows 门禁；本地隔离通过不冒充另一台机器的人工作业。
