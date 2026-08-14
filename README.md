# 互动课件编辑器

这是一个面向教师的可编辑互动课件桌面编辑器。产品以 Course Project V9 为唯一工程真相，在同一项目中支持幻灯片、流式讲义、空间画布与混合课程；网页发布使用 Published Course V2。当前没有需要继承的成品旧工程，产品不提供 V8 导入、迁移或旧版编辑器。

长期开发范围和完成定义只看 [根目录唯一计划](COURSEWARE_SKILL_REFACTORING_PLAN.md)。当前可用能力以源码、Schema 与 [Agent Kit 能力卡](agent-kit/capabilities/index.json) 为准。

当前仓库状态是 `engineering candidate`：自动化能够证明协议、构建和交付闭环，但不能代替课堂品质判断。`art candidate` 只适用于已经过真实画面与关键交互复核的具体课例；`accepted` 必须由教师明确确认，当前不作此声明。

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
- `flow`：标题、段落、分层列表、引用、媒体、表格、公式、代码、提示块、嵌套章节和组件组成的语义长文。
- `spatial-2d`：二维世界、关系连线、首页镜头、教学路径、小地图与语义缩放；不是通用 3D 编辑器。
- `mixed`：通过统一 location、目录、深链接、进度和课程状态连接多种 surface。
- `PublishedCourseV2Payload`：面向 Player 的单向发布数据，不可作为编辑项目重新导入。

V9 不公开 `underlay` / `overlay`。全局、surface、scene/world 中的所有可视项以稳定 `layerItemId` 和显式 `order` 合成；选择、播放、保存与导出必须遵循同一顺序。Flow 的语义块仍是文档流，surface/global 视觉项在文档上方的统一覆盖层内排序，不与段落逐项交错。新 Runtime 只使用当前统一图层合同，不保留旧整画布或双平面兼容路径。

## 编辑与 AI 精确修改

Native 承担稳定文字、公式、图片、视频、形状和常用控制；一次性复杂动态机制用 Runtime；只有确有跨课例复用价值时才用 Component。

Runtime/Component 中当前可见文字必须可命中，普通可替换图片应可命中。画布命中产生会话 `hitId`，跨保存定位使用稳定 `authoringAddress`。复制给 AI 的选择引用同时包含当前 `projectRevision`；过期 revision 会被拒绝，避免覆盖教师后续修改。

编辑器托管的 Player 可以在同一实例中从试运行切回检查/编辑，保留当前交互画面。该画面是会话检查点，不会自动变成项目默认答案；只有教师显式保存的命名状态才进入工程。

点选可编辑目标后，可在编辑器中使用“复制 AI 稳定引用”和“应用 AI 修改”。终端也可读取当前选择；关闭工程后，磁盘 Patch 命令会原子更新 `.h5lesson` 和默认 HTML。工程仍在编辑器中打开时，磁盘命令会拒绝覆盖，必须走编辑器事务以保留 Undo/Redo。

```powershell
npm run current:course-selection
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
| `npm run test:protocol` | 快速检查 V9、Published V2、Surface Runtime API 3 与 Component API 4 当前协议 |
| `npm run test:e2e` | 构建三课例并运行 Course Studio V9 与真实 Mixed 课程 Electron E2E；不属于默认快速验证 |
| `npm run check:ai-capabilities` | 只读检查短 V9 能力卡、来源和版本 |
| `npm run generate:ai-capabilities` | 规范化能力卡 JSON 后再检查 |
| `npm run current:course-selection` | 读取当前 Course Studio 点选的稳定 AI 引用 |
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

旧计划、评估稿和里程碑验证记录只由 Git 历史保存，不再作为当前操作入口。

`.github/workflows/clean-windows.yml` 会在 GitHub 的全新 `windows-latest` checkout 上执行 `npm ci`、默认验证与 clean-Windows 门禁；本地隔离通过不冒充另一台机器的人工作业。
