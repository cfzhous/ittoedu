# 互动课件编辑器

这是一个面向教师的可编辑互动课件桌面编辑器。当前主线以 Course Project V9 为工程真相，在同一项目中支持 Slide、Flow、Spatial 2D 与 Mixed 课程；网页发布使用 Published Course V2。V8 只从「导入旧版工程」进入，并产出带报告的 V9 工程，不再是新建或日常打开的默认格式。

正式入口是 `ProductApp` → `App`。纯 Slide / 纯 Flow / 纯 Spatial / Mixed 由现有 `locations` / `surfaces` 推导，不保存 `projectMode`。四态左栏固定提供「共享内容 → 全局层（全课）」；`globalLayerItems` 与 `surfaceLayerItems` 仍是引擎和作者能力。

长期开发范围和完成定义只看 [根目录唯一计划](COURSEWARE_DEVELOPMENT_PLAN.md)。新 Agent 可从 [项目认知索引](PROJECT_COGNITION_INDEX.md) 进入真实代码；当前可用能力以源码、Schema 与 [Agent Kit 能力卡](agent-kit/capabilities/index.json) 为准。

当前仓库状态是 T12 `engineering candidate`。T01–T12 已在 `codex/v9-parity-reconstruction` 完成并合回本仓库根目录；根目录 `npm run dev` / `npm run start` 打开的就是这一版。自动化已通过 `verify:full`、V9 Playwright 与课例校验。`art candidate` 只适用于已经过真实画面与关键交互复核的具体课例；`accepted` 必须由教师明确确认。体验步骤与已知缺口见 [最终体验清单](docs/tasks/v9-editor/artifacts/FINAL_EXPERIENCE_CHECKLIST.md) 与 [T12 Gate 报告](docs/tasks/v9-editor/13_FINAL_FULL_GATE.md)。

当前编辑器内没有可见 AI：正式表面不提供复制引用、应用 Patch、聊天、模型、Provider 或网络调用。`courseAiHandoff` / `courseAiPatch` 是 internal/reserved、未挂载。Focusky 级镜头化演示和自动结构编辑是远期方向，不是现有能力。

## 快速开始

要求 Windows、Node.js 与 npm。在**仓库根目录**执行（不要在 `output/worktrees/` 里启动，除非你明确要打开旧检出）：

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
- 新建菜单提供空白演示、空白流式、空白无限画布；左栏「新增内容」同样可加三类页面。
- `slide`：固定 1280×720 场景，Native、Runtime、Component 与教师控制器共同进入一个显式图层顺序。
- `flow`：标题、段落、列表、引用、媒体、表格、公式、代码、提示块、章节和组件组成的语义长文。左栏页面是父节点，只有可导航标题/章节是子节点。
- `spatial-2d`：二维世界、相机、镜头书签与语义缩放；不是通用 3D 编辑器，也不是 Focusky 级镜头套件。
- Mixed：同一课程树按 location 顺序混排上述表面，由数据推导，不是第四个持久化模式。
- 全局层：左栏固定入口，只切换 authoring scope，不参与课程顺序或四态推导。
- `PublishedCourseV2Payload`：面向 Player 的单向发布数据，不可作为编辑项目重新导入。

V9 不公开 `underlay` / `overlay`。全局、surface、scene/world 中的所有可视项以稳定 `layerItemId` 和显式 `order` 合成；选择、播放、保存与导出必须遵循同一顺序。Flow 的语义块仍是文档流，surface/global 视觉项在文档上方的统一覆盖层内排序，不与段落逐项交错。显式 V8 迁移保留单平面 Runtime；无法无损表达的旧双平面 Hybrid 会被拒绝，而不是静默改变层级。

高频手工能力（右键、Delete/Backspace、剪贴板、就地文字、图层排序/锁定/隐藏、声音、媒体、教师控制台）必须可发现。当前已知未闭合项见体验清单 §0：没有 `addCourseRuntimeLayer`；全局层非拖放上/下移仍拒绝；纯 Slide 紧凑左栏缺可见「共享内容 / 全课」标题。Flow cut/paste 与全局 paste 已接线，但 T12 未做实机勾选。

## 作者目标与外部构建

Native 承担稳定文字、公式、图片、视频、形状和常用控制；一次性复杂动态机制用 Runtime（协议 2/3）；只有确有跨课例复用价值时才用 Component API 4。

Runtime/Component 中当前可见文字必须可命中，普通可替换图片应可命中。画布命中产生会话 `hitId`，跨保存定位使用稳定 `authoringAddress`。过期 `projectRevision` 必须拒绝，不能覆盖教师后续修改。

编辑器托管的 Player 可以在同一实例中从试运行切回检查/编辑，保留当前交互画面。该画面是会话检查点，不会自动变成项目默认答案；只有教师显式保存的命名状态才进入工程。

正式编辑器不挂载「复制 AI 稳定引用」或「应用 AI Patch」。仓库里的 `npm run current:course-selection` 与 `npm run patch:course-project` 是保留脚本，不是教师可见工作流；Builder 不得把它们写成已验收入口。

## 课件构建路径（仓库 Skill，不是编辑器内 AI）

仓库只保留两个薄 Skill，供外部 Agent 在仓库根目录构建课例，不在产品壳里打开聊天：

1. [orchestrate-courseware](.agents/skills/orchestrate-courseware/SKILL.md) 读取教师材料，形成自由结构的 `01-teaching-plan.md` 与 `02-presentation-script.md`。
2. [build-courseware-project](.agents/skills/build-courseware-project/SKILL.md) 从两份确认文件冷启动，通过 [Courseware Agent Kit](agent-kit/) 查询能力、做高风险纵切、装配 V9 项目并验证。

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
| `npm run test:e2e` | 构建三课例并运行 Course Studio V9 与真实 Mixed 课程 Electron E2E；不属于默认快速验证 |
| `npm run check:ai-capabilities` | 只读检查短 V9 能力卡、来源和版本 |
| `npm run generate:ai-capabilities` | 规范化能力卡 JSON 后再检查 |
| `npm run current:course-selection` | 保留脚本：读选择桥。正式 App 未发布选择，不是教师入口 |
| `npm run patch:course-project -- --project <file> --patch <json>` | 保留脚本：对已关闭工程做 revision 保护写入。未挂载到正式编辑器 |
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
