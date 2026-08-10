# 互动课件编辑器

一个面向教师、教研团队和课件制作者的 Windows 桌面编辑器。项目以 Electron、React、TypeScript 和 Project V8 统一业务模型构建；当前原生 2D 画布使用 Phaser，DOM/Canvas/WebGL 可由运行时与组件按需接入。它可编辑多场景互动课件，保存完整的 `.h5lesson` 工程，并导出离线单 HTML、网页包、静态 PDF 和对象级可编辑 PPTX。

当前源码版本：**1.0.0（内部正式版收敛中）**

文档同步基线：**2026-08-07**。1.7.0 原型已冻结在 `internal-prototype-1.7.0`；主干正在按 [内部正式版与多表面计划](MULTI_SURFACE_DEVELOPMENT_PLAN.md) 收敛 Editor 1.0.0。Project V8 打开/保存/Player Payload 边界已经启用，Runtime API 1、Component API 1–3、历史夹具和课例迁出仍在后续切片中，当前结果不是内部正式版验收完成。

当前主干基线：Editor 1.0.0、Project V8、RuntimeDocument API 2、V4 组件 API 4、PublishedLesson V1。Project V8 JSON 是业务真相，DOM、Phaser 和按内容打包的 Three.js 都是可替换的呈现/交互能力，而不是工程模型本身。Project V1–V7 已由产品打开和原始 Player Payload 入口明确拒绝，不再自动迁移；Runtime API 1 与组件 API 1–3 的实现清理仍在进行，因此本开发快照不能冒充已经通过内部正式版门禁。详细进度与处置合同见 [里程碑 0 冻结记录](docs/INTERNAL_1_0_MILESTONE_0.md)。

## 快速开始

### 双击启动当前源码

- Windows 10/11 x64；
- 已验证 Node.js 24.x、npm 11.x；建议使用当前 Node.js LTS；
- 可双击运行 `.cmd` 的标准 Windows 环境；
- 首次安装依赖需要访问 npm registry；Skill 同步本身只读写本机文件，不需要联网。

从 Git 拉取或源码 ZIP 解压后，直接双击根目录的 `启动课件编辑器.cmd`。启动入口会先把仓库权威课件 Skill 同步到当前用户目录，在缺少依赖时执行锁定安装，然后构建 Player、Renderer 与 Electron 主进程并打开编辑器；它不会调用 `electron-builder`，也不会生成便携版、安装包或 `release/` 制品。Skill 同步失败会显示明确警告，但不会阻止编辑器继续启动。

命令行等价方式：

```powershell
npm ci
npm start
```

`npm ci` 会严格按 `package-lock.json` 安装依赖；`npm start` 会通过 `prestart` 自动同步 Skill，再构建生产模式所需的三个目录并直接运行源码版 Electron。需要热更新开发时再使用 `npm run dev`；开发服务器固定使用 `127.0.0.1:5173`，若端口被占用会直接报错。

### Codex Skill 安装范围

仓库中的 [`.agents/skills/`](.agents/skills/) 是两个课件 Skill 的权威源码，也是进入本仓库及其子目录时的项目级发现入口。双击启动或执行 `npm start` 时，[安装脚本](scripts/install-courseware-skills.ps1) 会把它们幂等同步到 `%USERPROFILE%\.agents\skills`，从而允许当前用户在其他工作区调用：

```powershell
npm run install:courseware-skills
```

安装器只管理 `orchestrate-courseware` 与 `build-project-v7-courseware`，内容未变时直接跳过；如果用户目录已有同名但并非本项目管理、且内容不同的 Skill，它会拒绝覆盖并要求人工处理。安装器不会删除或修改旧的 `%USERPROFILE%\.codex\skills` 副本。Codex 通常会自动发现变更；若列表未刷新，请重启 Codex。这些 Skill 是外部 AI 创作工作流，不会把 AI 能力嵌入 Editor 1.x。

开始修改前建议先建立基线：

```powershell
npm run typecheck
npm test
```

## 产品能力

- 固定 1280 × 720、16:9 课件画布；
- 多场景新增、复制、重命名、删除、缩略图和拖动排序；
- 每个场景包含“基础 + 多个命名状态”，支持初始/缩略图状态、最小元素覆盖、状态内新增/隐藏、状态层级和可撤销编辑；
- 文字、图片、视频、基础图形、箭头、大括号、方括号、画布内教师控制器和互动组件；
- 单选、多选、框选、对齐、分布、吸附、缩放、旋转及图层排序；
- 中文输入法就地编辑、选区富文本、横排及左右两种列方向的竖排文字；横排自动增高，竖排可纵向拉长并自动增宽；字体列表显示中文名、CSS 字体名和本机可用状态；
- 图片裁剪、焦点、适应/填充/拉伸、翻转、圆角和羽化；
- 撤销、重做、复制、粘贴、重复，以及异步压缩、单通道去重写入的本地恢复副本；
- 简洁/专业两套编辑工作流：简洁模式只保留“元素 / 图层 / 属性”三个一级入口和常用图文能力，最近工程、另存为与工程检查收进“更多”；专业模式追加“互动与动画 / 开发”、组件包、精确参数和高级声音设置。模式是本机界面偏好，切换不会改写、删除或降级 Project V8；
- Project V8 事件驱动元素动画：简洁模式会原子写入 `node.activated → node.enter` 规则及播放初始隐藏；专业模式可继续把 `node.enter` / `node.exit` 连接到点击、场景/状态进入、音视频/组件/运行时事件或前一动画完成。动作步骤支持 `after-previous` / `with-previous` 顺序与并行、局部延迟和完成事件；
- Project V8 声明式交互规则：场景规则与课程级 `globalInteractions` 分开保存；当前可视化配置节点点击、场景/状态进入、节点激活、动画完成、组件事件、带场景/全局来源的运行时事件和音视频事件，并用 `scene.in` / `presentation.in` 限定范围；
- 统一“元素”面板：文本、图片、视频、声音和全部图形快捷入口统一放在“常用”；“媒体”只负责管理已进入工程的声音、视频、图片及专业声音设置，不重复放置快捷入口或导入按钮；专业模式再显示“互动组件 / 控制与全局”和组件包管理；
- Project V8 场景/全局自由运行时（新创作只使用 `RuntimeDocument` API 2）：`renderMode` 严格声明 `dom/phaser/hybrid` 能力；一次性复杂互动可直接写入场景，跨场景复杂规则可写入全局运行时；稳定视觉仍应落在可编辑节点和命名状态中；API 1 属于待删除历史实现；
- 中央工作区始终是同一个 1280 × 720 画布，只在“编辑状态 / 当前位置试运行”之间切换职责：Player 是两种状态的唯一视觉源；编辑状态在其上叠加透明 Phaser 原生节点交互层，当前位置试运行则把输入交还给真实 Player；
- 编辑状态使用隔离的 authoring Player 挂载组件与场景/全局运行时，但冻结学生互动、声明式动作、音视频、导航和课程状态写入；因此可在原位置看见完整合成画面并安全拖改原生节点。当前位置试运行从当前场景和当前命名状态启动，顶部“整课预览”仍从课程起点播放；
- V1/V2/V3/V4 `.h5component` 导入；V4 在 V3 场景/全局作用域与全部 `props.content` 文案基础上，增加严格 `dom/phaser/hybrid` 能力、暂停/显隐和捕获生命周期；
- 组件可显式开放画布双击文字编辑：DOM 使用 `data-courseware-edit-key`，Phaser/hybrid 使用可选的 `ctx.editor?.registerTextRegion()`；该桥只在编辑态提供，是 V1–V4 兼容上下文的可选扩展，不是 Component API 4 的运行必需能力；
- 场景运行时可选择 `authoringApiVersion: 1`，用 `ctx.authoring.register()` 或 DOM `data-courseware-edit-key` / `data-courseware-asset-key` 显式开放文字和图片命中区；键必须已存在于 `content.values` 或 `assets`。未声明目标的旧运行时仍由 Player 正常显示，只继续通过属性面板修改；运行时内容与素材绑定由当前场景的全部命名状态共享；
- 专业“开发”面板是加宽的单任务工作台，通过“运行时 / 对象 JSON / 规则 JSON / 组件代码”切换，一次只呈现一类编辑内容；代码区使用不折行的较大等宽编辑区。第三方组件代码默认只读，必须在场景“基础”或全局层创建带明确来源标记的新 ID/版本工程内副本，才可修改副本 manifest/runtime。修改进入撤销历史，并在应用前校验包路径、入口、缩略图、素材、运行时 API、注册身份和现有实例作用域；该面板不是通用 IDE，也不能访问文件系统、Shell、Node/Electron API 或编辑器自身源码；
- 母版式统一“全局层”可直接编辑跨场景持久的文字、图片、图形和组件，并设置前后景与场景可见范围；
- 新工程默认在全局画布放置结构化教师控制器；其“场景目录”按钮默认为 `scene.open-picker`，点击后展开全部场景并选择跳转，只进入目标场景的初始状态；目录展开、焦点与当前项高亮仅是 Player 临时 UI，不写入工程或场景状态。固定 `scene.go` 仅作为高级按钮动作；
- “元素”中的媒体管理可把工程中已有图片或视频再次“添加到画布”，避免重复导入；编辑画布支持 50%–200% 缩放、Ctrl/Command+滚轮缩放、空格或鼠标中键平移及一键复位；
- 顶部“工程检查”集中列出丢失引用、无效跳转、组件包和静态兜底问题，支持定位与导出本地诊断报告；存在错误时阻断成品导出，提醒和建议不阻断；
- 关闭含未保存修改的窗口时明确提供“保存 / 不保存 / 取消”三种选择；保存过程中发生的新修改继续保持未保存状态，不会被错误标记为已保存；
- 统一导出菜单：离线单 HTML、网页包、静态 PDF、对象级可编辑 PPTX；
- 场景缩略图按 `thumbnailStateId` 绘制背景、原生元素和组件缩略图，并按层合成已启用场景/全局运行时登记的静态后备；组件未提供图片时显示带名称的后备框，已启用运行时未提供后备时显示“运行时”提示角标；
- 大型课件缩略图延迟渲染、图片按场景加载和增量撤销历史。

详细操作见 [用户指南](docs/USER_GUIDE.md)，正式版收敛进度见 [内部正式版与多表面计划](MULTI_SURFACE_DEVELOPMENT_PLAN.md)。AI 制作课件必须先使用 [`orchestrate-courseware`](.agents/skills/orchestrate-courseware/SKILL.md)，按 [通用创作编排规范](docs/AI_COURSEWARE_ORCHESTRATION.md) 把教学设计、教学内容规格、呈现脚本和批准哈希落入课例档案；取得有效 `implementation-ready` 后仍须等待新的 Project V8 实现 Skill，不能在当前主干使用归档的 `build-project-v7-courseware`。聊天记录不充当唯一交接真相。自由运行时和组件分别见 [自由运行时指南](docs/RUNTIME_V3_AUTHORING.md) 与 [组件开发指南](docs/COMPONENT_AUTHORING.md)。

## 旗舰课例：不是磁场，而是变化

仓库暂存可复现的高中物理旗舰课例《不是磁场，而是变化》：用五幕“预测—证据—建模—方向—迁移”完成电磁感应概念重建。连续实验由 V4 DOM 组件承担，稳定反馈由 Project V8 命名状态和声明式规则承担，全部可见文案进入 `TextNode` 或 `props.content`；它将在仓库拆分里程碑迁入课例库。

运行 `npm run build:induction` 生成 `.h5lesson`、离线 HTML 与组件包，再运行 `npm run validate:induction` 执行结构、教学语义和导出门禁。组件源码见 [`examples/induction-lab-component/`](examples/induction-lab-component/README.md)，生成与验收脚本见 [`scripts/build-induction-lesson.ts`](scripts/build-induction-lesson.ts) 和 [`scripts/validate-induction-lesson.ts`](scripts/validate-induction-lesson.ts)。

## 流程失败案例 0：让运动变成函数

现有高中数学七幕课《让运动变成函数——动点问题的五步建模法》被固定为“流程失败案例 0”，用于证明旧流程只对齐状态骨架、没有冻结完整教学内容规格和呈现语义，并出现内容量/难度不足、过度组件化与斜线分数等问题。它不是质量闭环成功案例、不是通用数学模板，也不得通过事后修补反向证明新工作流有效。

原构建与验证命令继续保留为失败制品复现和诊断入口，不代表教学或视觉验收通过。新高中数学课例必须从原始主题和新 Skill 冷启动，先冻结首轮结果再评分；不得从现有生成脚本继续扩展。失败编排记录见 [`docs/courseware-pilots/math-motion/ORCHESTRATION_RECORD.md`](docs/courseware-pilots/math-motion/ORCHESTRATION_RECORD.md)，Skill 设计与当前验证状态见 [`docs/AI_COURSEWARE_SKILL_DESIGN.md`](docs/AI_COURSEWARE_SKILL_DESIGN.md)。

## 技术栈

| 层 | 技术与职责 |
| --- | --- |
| 桌面容器 | Electron 43：窗口、文件对话框、协议、PDF、最近工程与恢复数据 |
| 编辑器界面 | React 19、Zustand、Immer、dnd-kit |
| 业务真相 | Project V8 JSON、Zod Schema、场景/状态/交互/运行时/组件实例 |
| 统一视觉画布 | Player Runtime：编辑状态、当前位置试运行和成品共用同一 1280 × 720 合成语义 |
| 原生编辑交互 | Phaser 4：编辑状态中的透明选择、框选、拖拽、缩放、旋转与命中层 |
| DOM 增强 | Shadow DOM 宿主：密集文字、表格、表单、HUD 和 HTML 组件/运行时 |
| 可选真 3D | Three.js/WebGL 由具体运行时或 V4 组件离线打包；编辑器核心和 Player 不直接依赖或暴露 Three.js |
| 构建 | TypeScript 7、Vite 8 |
| 数据校验 | Zod 4 |
| 工程压缩 | fflate |
| PPTX | PptxGenJS 4 |
| 测试 | Vitest、Testing Library、Playwright Electron |
| 发布 | electron-builder |

所有运行时依赖均锁定在 `package-lock.json`，二次开发时不要删除锁文件或把 `node_modules` 放入版本库。

## 架构

```text
Electron Main
  ├─ 安全窗口与自定义协议
  ├─ 文件/工程/PDF IPC
  └─ Preload 白名单 API
           │
           ▼
React Renderer ── Zustand / Project V8 业务状态（唯一工程真相）
  ├─ 编辑器 UI
  ├─ 场景状态物化与状态覆盖命令
  ├─ 统一 StageViewport（固定 1280 × 720）
  ├─ 透明 Phaser EditorScene 交互层
  ├─ 版本化 Player authoring patch / target 协议
  ├─ 工程和组件包读写
  └─ 单 HTML / 网页包 / PDF / PPTX 导出
           │
           ▼
Player Runtime
  ├─ authoring / playback 两种宿主状态（视觉实现相同）
  ├─ Phaser PlayerScene
  ├─ CourseRuntimeKernel（导航、事件、课程状态、场景表现状态）
  ├─ 固定粗粒度 DOM underlay / Phaser Canvas / 组件 DOM / DOM overlay
  ├─ Runtime API 2 严格 DOM/Phaser/Hybrid 能力宿主
  └─ V4 场景/全局组件与自由运行时生命周期
```

架构核心不是 DOM 或 Phaser，而是受 Schema 校验的 Project V8 JSON。原生节点、声明式交互、自由运行时和组件都读取同一工程数据；渲染器只负责实现画面与输入。`renderMode` 决定宿主向某份 API 2/V4 代码开放哪些能力，不会把现有 DOM、Phaser、Canvas 或 Three.js 代码自动翻译成另一种实现。

中央工作区不再维护一套“编辑画面”和另一套“运行画面”。隔离 Player 始终负责真实视觉合成；编辑状态通过版本化 authoring 协议把完整原生节点快照、背景和层级变化发送给 Player，并由透明 Phaser 层只处理原生节点选择与几何操作。authoring 宿主会冻结输入、导航、音视频、声明式互动和课程状态，组件/运行时只能显式发布文字或素材命中目标，不能取得编辑器 Store。切换到“当前位置试运行”后，同一画布位置改用 playback 宿主接收真实互动。

Player 使用固定粗粒度平面：全局运行时 DOM underlay → 场景运行时 DOM underlay → 单一 Phaser Canvas → V4 组件 DOM 平面 → 场景运行时 DOM overlay → 全局运行时 DOM overlay。Phaser Canvas 内部再维护全局/场景前后景、原生节点和 Phaser 组件；V4 DOM/hybrid 组件的 DOM 部分跟随组件框变换，但整体位于 Canvas 上方，不能与单个 Phaser 对象按 depth 交错。DOM 与 Canvas 不是一个统一显示列表；要求精确交错的对象应使用同一渲染器，或拆成明确前景/后景。

主要目录：

```text
src/
├── main/       Electron 主进程、IPC、文件操作、协议与安全策略
├── preload/    暴露给 Renderer 的冻结桌面 API
├── renderer/   React UI、编辑状态、Phaser 编辑画布、工程与导出
├── player/     预览、单 HTML 和网页包共用的 Player Runtime
└── shared/     数据模型、Schema、几何、文字、图片和图形渲染

tests/
├── unit/        数据、Store、UI 与导出单元测试
├── integration/ Player、组件注册等集成测试
└── e2e/         真实 Electron 工作流测试

scripts/         示例生成、图标构建和发布验证
examples/        示例工程、组件包及其可编辑源码
docs/            用户指南与组件开发协议
resources/       应用图标等打包资源
```

关键入口：

- `src/main/index.ts`：Electron 生命周期；
- `src/preload/index.ts`：Renderer 可调用的桌面能力；
- `src/renderer/App.tsx`：编辑器顶层流程；
- `src/renderer/store/editorStore.ts`：工程状态和编辑命令；
- `src/renderer/phaser/EditorScene.ts`：编辑画布交互；
- `src/player/PlayerApp.ts`：预览和导出播放器；
- `src/shared/projectTypes.ts`：工程数据类型；
- `src/shared/projectSchema.ts`：工程运行时校验与迁移入口。

## 数据格式

### 课件工程

`.h5lesson` 本质上是 ZIP，保存工程 JSON、素材及已嵌入组件。当前工程为 `schemaVersion: 8`，一等支持场景状态、媒体、场景/全局声明式交互、动作步骤编排、事件驱动入场/退场、`playback.presenter` 和结构化教师控制器。全局层可容纳原生文字、图片、视频、图形、教师控制器和外部组件。旧 Project V1–V7 不再自动迁移，打开时会得到明确的“不受支持”结果；更高版本同样会被拒绝，不能静默丢字段。需要恢复旧工程时使用归档标签 `internal-prototype-1.7.0` 对应的旧编辑器，或后续独立离线转换工具。

当前切片只冻结并校验 `playback.presenter` 与 `presenter.command` 的 V8 数据合同；`PresenterInput`、PageUp/PageDown 处理、附加按键检测/设置和作者命令执行尚未实现，编辑器中的该触发器保持禁用。它们属于开发计划里程碑 3，不能把字段存在误写成翻页笔已经可用。

Project V8 的声明式交互规则是稳定状态与运行逻辑之间的首选连接层。`scene.interactions` 管理当前场景节点及场景事件；`globalInteractions` 管理只创建一次的全局元素和课程级映射，并用 `scene.in` 限制规则在哪些场景生效。每条规则包含触发器、AND 条件和有序动作步骤；步骤的 `after-previous` 等待上一并行组完成，`with-previous` 与前一步同组启动，`delayMs` 是相对于当前触发点或上一组的局部延迟。`scene.go` 可携带 `targetStateId` 原子进入指定场景状态；场景导航、重播和重开必须是最后一个独立动作组。

`node.enter` / `node.exit` 是动作载荷，使用 `none`、`fade`、`slide`或 `scale`，滑动额外保存上/下/左/右方向，并提供时长与缓动。动画完成后会按步骤稳定 ID 发出 `animation.completed`，可触发下一条规则；被后续动画、场景销毁或状态基线更新取消时不发完成事件。`playbackInitialVisibility: 'hidden'` 只决定互动 Player 是否先隐藏等待入场；入场/退场只改变 Player 瞬态可见性，不写回节点 `visible` 或切换场景状态。路径、关键帧和连续程序动画仍由组件或运行时承载。

简洁模式选中场景节点时，“属性”直接提供低负担的“出现动画”，并一次性维护入场规则与播放初始隐藏。专业模式把规则编辑分成两处：“属性”中的“交互”只显示该节点的 `node.click` 规则；右侧“互动与动画”维护进入场景/状态、节点激活、动画完成、声音结束、视频生命周期/时间点、组件事件及 `runtime.event` 等非点击规则。完整规则统一按“当 / 如果 / 就”解释，并提供自然语言摘要、搜索/筛选、常用模板及可读的顺序/并行动作序列。

`media.audio.sounds` 以稳定 `soundId` 建立声音库条目，并关联工程内音频素材、声道、默认音量和循环设置。“元素”→“常用”中的声音快捷入口负责导入，“媒体”负责试听、重命名、删除和复用；专业模式在媒体管理中追加默认静音、主音量、五个声道音量和旁白 ducking。交互动作只引用 `soundId` 或声道，不引用物理路径；Player 统一处理场景/课程生命周期、自动播放解锁、播放/恢复淡入、暂停/停止淡出及可取消的 ducking 淡变。视频是独立 `VideoNode`，可添加、删除、拖拽、缩放和配置封面、裁切方式、播放区间、循环、音量、速度、表面点击播放及开始播放时对背景音乐执行 `none/duck/pause/stop`。视频表面点击保留给媒体播放，不再提供“连接到状态”快捷入口；状态或场景变化应在专业模式使用视频生命周期规则，或另放按钮/透明图形热点。旧视频点击规则仍可查看，但只有关闭视频内置点击播放与原生 controls 后才能命中；编辑器会提示该冲突，也会提示“循环视频的结束事件不可达”。

工程打开、保存、恢复副本压缩、组件包导入和网页包生成均走异步归档路径。自动恢复在编辑停止约 1.8 秒后排队，只允许一个构建/写入管线运行；新修订会取消已经过期的压缩结果，并跳过重复修订。手动保存以启动保存时的工程快照为准；若压缩或写盘期间继续编辑，保存完成后这些新修改仍标记为未保存。启动时可恢复上次本地副本；关闭窗口时使用“保存 / 不保存 / 取消”明确决定。

组件包是工程的一等资源。“组件包管理”显示包 ID、版本以及场景/全局实例数量；仍被实例引用的包不能删除。同 ID 新包可用于替换或升级，替换前会校验当前实例作用域，失败时工程保持原状；成功后所有实例版本同步更新。单个组件运行失败由宿主隔离并记录诊断，不应使整页或其余组件失效。

涉及工程格式的修改必须同步检查：

1. `src/shared/projectTypes.ts`；
2. `src/shared/projectSchema.ts`；
3. `src/renderer/project/createProject.ts`；
4. 工程保存、打开和迁移逻辑；
5. 编辑器、播放器及各导出器；
6. `tests/unit/projectArchive.test.ts` 和相关 E2E。

不要只修改 TypeScript 类型而遗漏 Zod Schema，否则工程可能在保存后无法重新打开。

### 互动组件

`.h5component` 也是 ZIP，根目录必须包含 `manifest.json` 和入口脚本。当前兼容四代协议：

- V1：`schemaVersion: 1`、`runtimeApiVersion: 1`，作为原子组件兼容运行；
- V2：`schemaVersion: 2`、`runtimeApiVersion: 2`，支持公开属性、内部编辑预览页面、变体、预设、工程图片和场景控制。
- V3：`schemaVersion: 3`、`runtimeApiVersion: 3`，声明 `supportedScopes`，支持真正的全局组件，并递归暴露 `props.content` 中全部文字。
- V4：`schemaVersion: 4`、`runtimeApiVersion: 4`，在 V3 基础上声明 `renderMode: 'dom' | 'phaser' | 'hybrid'`，按模式只获得 `ctx.dom` 和/或 `ctx.phaser`，并支持显隐、暂停、恢复与捕获准备生命周期。

组件使用可信的离线浏览器 JavaScript，不允许在成品运行时依赖 Node.js、npm、CDN 或远程网络。新组件使用 V4；旧 `examples/runtime-v3-complete/` 是待删除的 Runtime API 1 / Component API 3 历史夹具。Three.js 等第三方库如确有必要，应在构建阶段打进具体运行时/组件；程序化一次性 3D 可由运行时内联，模型默认用离线 GLB 并作为 V4 组件包 asset。Project V8 当前没有一等 `model` 素材类型，不得把 GLB 伪装成图片；独立模型库需后续正式扩展 Schema、归档、媒体管理和导出。不要把 Three.js 加入编辑器核心或假定宿主全局提供 `THREE`。

组件画布文字编辑必须显式加入协议：DOM 元素使用 `data-courseware-edit-key="content.title"`；Phaser/hybrid 组件在隔离 authoring Player 提供编辑宿主时调用 `ctx.editor?.registerTextRegion({ key, getBounds })`。`key` 必须同时对应 manifest 公开的文字字段或有效 `props.content` 字符串。普通试运行、整课预览、捕获和成品不提供该桥；未登记区域继续整体选择，旧组件继续通过属性栏编辑，不会根据画面文字反推 Props。

场景/全局自由运行时通过 `CoursewareRuntime.define()` 注册，源码内联在 Project V8 中。API 2 按 `renderMode` 只暴露声明的 DOM/Phaser 能力；API 1 分支处于断代清理中，不能用于新内容。普通教师仍通过属性栏编辑 `content.values`；场景与全局运行时还可独立选择 Runtime Authoring V1，显式登记可在对应画布作用域原位修改的 text/asset 目标。该 authoring 版本独立于 Runtime API 2，不声明时仍显示真实视觉，只是不产生画布命中区。专业“开发”面板可校验并修改当前工程承载的 runtime source，但不会生成实现，也不会因修改 `renderMode` 自动转换 DOM/Phaser 代码。一次性互动无需为了接入编辑器而组件化；题面、反馈、完成页等稳定画面仍必须优先使用原生节点、命名状态或可编辑组件。

## 编辑与播放一致性

编辑状态和播放状态使用同一个 Player 视觉入口、同一份节点模型与场景状态物化规则；差异只在宿主权限和叠加的编辑交互层：

- 基础场景与当前状态覆盖先物化为同一 `SceneDocument` 视图，再由 authoring Player 渲染；透明 Phaser Adapter 只同步原生节点几何和命中，不重复绘制视觉；
- 场景缩略图使用 `thumbnailStateId`（缺省回退到 `initialStateId`），并绘制背景、原生元素和组件缩略图；
- 状态中新建的节点在基础中默认隐藏、只在当前状态显示；状态中删除表示当前状态隐藏，只有从基础删除才清理节点及全部覆盖；
- Player 进入场景时物化 `initialStateId`；状态切换原位更新同一节点/组件实例，不修改工程数据；
- `scene.go` 可选携带 `targetStateId`，Player 在创建目标场景节点、运行时和组件前原子物化目标状态；状态引用无效时使用目标场景 `initialStateId`；
- 预览、单 HTML 和网页包使用 `src/player/`；
- 中央“当前位置试运行”使用最新工程从当前场景/状态启动；若正在编辑基础场景，则以该场景 `initialStateId` 启动。顶部“整课预览”始终在独立窗口从第一场景的初始状态开始；
- 文字、图片、视频、图形或教师控制器增加新属性时，需要同时检查编辑 Adapter、Player 渲染和静态导出；
- 外部组件在编辑模式中可整体变换；V2 使用显式公开属性，V3/V4 还会自动显示所有 `props.content` 字符串；
- 场景/全局运行时的 `content.values` 可由属性面板修改，预览和网页导出执行真实 runtime；
- 当前场景或全局运行时显式登记的 text/asset 目标可在对应编辑作用域原位修改；场景值由该场景全部命名状态共享，全局值由整课共享，均不生成 `presentation.nodeOverrides`；
- 场景的 `interactions` 与课程级 `globalInteractions` 将可编辑节点、组件事件和带作用域的运行时事件映射到元素入场/退场、状态、导航和音视频动作；连续 `with-previous` 步骤同组并行，下一个 `after-previous` 等待整组完成；
- 新工程的 `TeacherControllerNode` 位于全局画布。默认“场景目录”是 `scene.open-picker`，列出全部场景，选择后进入该场景初始状态；展开与选中不会写入场景状态。固定 `scene.go` 可为高级按钮配置目标场景与可选目标状态；
- 元素入场/退场只作用于宿主容器，不重建原生节点或组件，也不改变工程可见性或命名状态；`playbackInitialVisibility` 仅在互动 Player 中生效，捕获、缩略图和静态导出使用作者稳定画面；
- 统一全局层中的原生元素与组件都在普通翻页和重播时保留，只按场景更新可见性；
- 所有人工可见文字必须位于原生文本、运行时内容表或 V3/V4 组件 `props.content`，不能只硬编码在源码中。

新增节点类型时，至少要同步修改联合类型、Schema、默认节点创建、Store 命令、属性面板、编辑 Adapter、Player 渲染、工程迁移、导出和测试。

## 导出链路

| 格式 | 实现方式 | 交互 | 后续编辑 |
| --- | --- | --- | --- |
| 单 HTML | 单向编译的 PublishedLesson、素材和 Player Runtime 内联为单文件；超过 50 MB 提示改用网页包 | 保留 | 不能从成品恢复工程；修改原 `.h5lesson` |
| 网页包 | ZIP 内分离 `index.html`、唯一 `course-data.js` 发布数据、Player 和运行素材 | 保留 | 不能从成品恢复工程；修改原 `.h5lesson` |
| PDF | 使用实际 Player Runtime 捕获 Canvas、DOM、全局层与场景层，再由 Electron 打印 | 不保留 | 固定版式 |
| PPTX | 原生节点逐对象生成；组件和运行时按快照/`staticFallback` 静态化 | 不保留 | 原生对象可修改，静态化内容整体调整 |

单 HTML 和网页包保留声明式交互、声音、视频播放、事件驱动入场/退场及场景目录，但不主动包含完整 Project V8、历史、编辑器元数据、组件 manifest 或独立原始 `runtime.js`；网页包只保存一份 `course-data.js` 发布数据，不再并存 `course.json` 或离线回退副本。浏览器仍需取得并可恢复执行逻辑，因此这里不承诺源码保密、不可逆向或 DRM。格式边界见 [PublishedLesson V1](docs/PUBLISHED_LESSON_V1.md)。PDF/PPTX 是静态结果：不播放声音，不执行交互或元素动画，也不应用 `playbackInitialVisibility: 'hidden'`；视频导出为封面/占位画面，画布内教师控制器默认不进入静态导出。

静态捕获会对每个实例先排空此前通过 `capture.waitUntil()` 登记的资源任务，再调用 Runtime API 2 / Component API 4 的 `prepareCapture()` 生成最终帧；hook 内同步登记的有限任务也会被等待，并在该实例完成后立即复制其 Canvas/WebGL 帧。最终按“运行时 DOM underlay → Phaser Canvas → V4 组件 DOM/WebGL → 运行时 DOM overlay”合成。WebGL/Three.js 作者必须在 `prepareCapture()` 主动渲染确定帧，不能依赖循环 RAF 恰好保留缓冲；hook 内登记的异步任务必须在完成最终绘制后才 resolve。宿主的即时副本可兼容 `preserveDrawingBuffer: false`。

静态导出按最小失败单元隔离：Player 已成功启动后，PDF 某一场景捕获失败时只让该页改用带诊断信息的静态后备，其余页面继续使用真实 Player 捕获；PPTX 组件按实例依次创建独立捕获 Player，单个组件失败只回退该实例，运行时快照失败只回退对应场景/全局运行时条目及图层。已经成功取得的页面、组件和运行时快照不会因后续条目失败而被整批丢弃。只有捕获 Player 本身无法初始化等批次级故障，才会对该批次执行统一后备。

PPTX 映射规则：

- 文字：PowerPoint 原生文本框，文字可直接修改；
- 基础图形：PowerPoint 原生形状；
- 图片：独立高分辨率 PNG 对象，裁剪、翻转、圆角和羽化会烘焙进图片；
- 视频：静态封面或带文件名的播放占位，不保留视频播放和声音；
- 画布内教师控制器：默认省略；显式允许静态导出时作为静态控制条保留，不具备按钮行为；
- 互动组件：独立透明静态快照，整个组件可移动、复制和删除；
- 全局原生元素：按场景可见性生成对应的可编辑文字、图片和形状对象；
- 全局组件：按场景可见性生成静态快照；
- 场景/全局运行时：优先在隐藏 Player 中捕获实际 underlay/overlay 透明快照；只有实际画面不可用时才使用 `staticFallback`。`runtime-layer` 保留原生对象，`full-scene` 整页扁平化；
- 场景背景：幻灯片背景；
- 隐藏节点：不导出；
- 图层顺序：保持 `scene.nodes` 顺序。

`elbow-arrow` 当前映射为 PowerPoint 原生 `bentArrow`；互动组件在 PPTX 内不保留内部交互。

相关代码位于 `src/renderer/export/`。修改 PPTX 时必须解包检查幻灯片 XML，并至少验证原生 `<p:sp>`、图片 `<p:pic>` 和文字 `<a:t>`，防止意外退化为整页图片。

## 常用命令

| 命令 | 作用 |
| --- | --- |
| 双击 `启动课件编辑器.cmd` | 自动同步课件 Skill、补齐依赖、构建并打开当前源码版编辑器，不生成安装包 |
| `npm run install:courseware-skills` | 将仓库权威课件 Skill 幂等同步到当前用户的 `.agents/skills` |
| `npm start` | 自动同步课件 Skill，构建生产模式 Player、Renderer、Electron 后启动源码版应用 |
| `npm run dev` | 启动开发版 Electron |
| `npm run typecheck` | 检查 Renderer、Player、Main 和 Preload 类型 |
| `npm test` | 运行 Vitest 单元与集成测试 |
| `npm run test:e2e` | 构建依赖并以透明离屏窗口运行全部 Playwright Electron 测试 |
| `npm run test:e2e:visible` | 调试时显式显示 Electron 与预览窗口并运行同一套 E2E |
| `npm run build:player` | 构建预览、单 HTML 和网页包共用的 Player IIFE |
| `npm run build:renderer` | 构建 React 编辑器 |
| `npm run build:electron` | 编译 Main 与 Preload |
| `npm run build:desktop` | 只构建可由根目录入口直接启动的三个生产目录 |
| `npm run build` | 类型检查、测试并构建全部生产产物 |
| `npm run build:examples` | 重新生成示例工程和示例组件包 |
| `npm run build:lesson-demo` | 生成三页光合作用最小回归课例 |
| `npm run build:induction` | 生成《不是磁场，而是变化》旗舰课例、离线 HTML 与组件包 |
| `npm run validate:induction` | 验证旗舰课例的结构、教学语义、状态可达性与离线导出 |
| `npm run build:math-motion-course` | 生成高中数学动点问题七幕课、离线 HTML、网页包与组件包 |
| `npm run validate:math-motion-course` | 验证七幕状态、数学真相、离线导出和 25 轮状态物化 |
| `npm run export:math-motion-course` | 从真实浏览器初态帧生成七页 PDF 与对象级可编辑 PPTX |
| `npm run validate:math-motion-static` | 检查 PDF/PPTX 页数、可编辑文字、组件快照、边界与回渲尺寸 |
| `npm run build:render-benchmark` | 生成原生 / Phaser / DOM / Three.js / 旧组件五路径离线基准 |
| `npm run build:icons` | 从源图标重新生成应用图标 |
| `npm run verify` | 执行类型检查、测试、E2E 和完整构建 |

E2E 默认向 Electron 传入 `COURSEWARE_E2E_BACKGROUND=1`：主窗口和课件预览窗口以透明、离屏、跳过任务栏且不抢焦点的方式运行，同时关闭后台渲染节流以保持动画、拖拽和导出测试稳定。正常 `npm start`、开发启动和双击入口不读取该测试默认值，仍会照常显示窗口。只有需要观察自动化过程时才使用 `npm run test:e2e:visible`。

架构与回归基准见 [`examples/render-host-benchmark/`](examples/render-host-benchmark/README.md)。当前切片已把工程升级为 Project V8；API 3 Phaser 兼容组件仍只用于断代前的过渡回归，完成 Component API 4 清理后会由当前协议夹具替代。

当前 Playwright 基准在完成五条路径的真实点击、拖拽、滚轮、排序和确定帧捕获后，执行 25 轮压力循环：每轮依次切换四个定制场景并重播末页，合计 **100 次切页 + 25 次重播**。门禁同时检查运行时/组件挂载点、DOM Canvas、WebGL/Three 捕获副本、活动 RAF、控制台异常和外部网络请求，防止只验证“能打开”而遗漏宿主泄漏。

## 当前源码启动与历史发布基线

当前 1.0.0 收敛分支不构建便携版或安装包。根目录 `启动课件编辑器.cmd` 是面向当前源码工作区的双击入口；它生成被 `.gitignore` 排除的 `dist-player/`、`dist-renderer/` 与 `dist-electron/`，然后直接使用项目锁定的 Electron 运行。拉取新提交后再次双击即可同步和重建，不需要复用旧 `release/`。

仓库仍保留历史打包配置和验证脚本，但根目录入口不会调用它们。最近一次已打包的 Editor 1.6.0 Windows x64 制品生成于 **2026-07-30（Asia/Shanghai）**，并于 **2026-08-01** 按当时源码与文档核对；它不是当前 1.0.0 收敛分支的新制品：

`npm run verify:release` 会在启动任何成品前，校验 Portable 与 `win-unpacked` EXE 的 Windows `FileVersion` / `ProductVersion`，再交叉校验 `resources/app.asar` 内嵌 `package.json` 的名称与版本。任何一项与当前 `package.json` 不一致都会硬失败，因此不能复用旧 `win-unpacked`；验证报告同时记录三份产物的大小与 SHA-256。

- 便携版 EXE：`PhaserCoursewareEditor-Portable-1.6.0.exe`，可单文件分发；
- `win-unpacked/PhaserCoursewareEditor.exe`：目录版，分发时必须保留整个目录。

源码 ZIP 不由 `npm run dist:win` 自动生成；打包时只收集当前 Git 跟踪文件的工作区内容，排除依赖、构建产物、发布产物、本机缓存和 Git 元数据。若工作区含尚未提交的文档或源码修改，文件名必须使用打包日期等快照标识，不能继续沿用旧提交号。

`release/` 被 `.gitignore` 排除，Portable EXE、源码 ZIP、`win-unpacked/`、校验截图及其他可重建发布产物均不会随源码提交或 `git push` 自动上传；正式分发必须通过单独的制品渠道完成。

| 产物 | 大小 | SHA-256 |
| --- | ---: | --- |
| `release/PhaserCoursewareEditor-Portable-1.6.0.exe` | 103,524,302 bytes（98.73 MiB） | `77E5929851E4936E9379B0F4135E2900E01EC3BF9463A1D4AD7A1C0084A2248A` |
| `release/win-unpacked/PhaserCoursewareEditor.exe` | 225,819,136 bytes（215.36 MiB） | `4012FA34162154688F4D808BADEC183EC6BD396B8BEC7E7A33BC9D7065FA184D` |
| `release/win-unpacked/resources/app.asar` | 158,850,615 bytes（151.49 MiB） | `99848237B025078B1784FF2AA9647973AA2C3237D8FFFF9BE18ABB54CC726F20` |

源码 ZIP 的大小与 SHA-256 应在生成后随制品单独发布，不写入 ZIP 内部的 README，避免重新打包时出现自引用哈希失效。

当前 Project V8 边界切片已通过类型检查、101 个 Vitest 测试文件共 657 项测试、26 项 Playwright 端到端测试和桌面生产构建；旧 1.7.0 基线则为 100 个测试文件、641 项测试。尚未执行根目录启动脚本的人工冒烟，也没有生成 1.0.0 Portable、目录版或安装包；历史 1.6.0 二进制不得冒充当前版本。当前管线状态为 `engineering candidate`，不代表真实课件的视觉与教学体验已经验收。

## 测试与提交要求

小改动至少运行：

```powershell
npm run typecheck
npm test
```

涉及画布、工程读写、组件、导出或 Electron IPC 时运行：

```powershell
npm run verify
```

准备当前源码交付时，再双击根目录入口做一次真实启动冒烟。当前流程不运行以下历史打包命令：

```powershell
.\启动课件编辑器.cmd
```

交付基线以当前 `npm test`、`npm run test:e2e`、生产构建和根目录入口冒烟的实际结果为准。新增功能应补充相应测试，不应通过删除断言来维持通过状态。

## 安全边界

- 主窗口和预览窗口开启 `contextIsolation`、`sandbox` 和 `webSecurity`；
- 禁用 `nodeIntegration`、`<webview>`、生产版 DevTools、任意导航和新窗口；
- Renderer 只能调用 Preload 暴露的冻结白名单 API；
- 文件位置由系统对话框或已批准的最近工程路径确定；
- IPC 参数、扩展名、签名、文件大小和 ZIP 路径均需校验；
- 导出的离线 HTML 使用 CSP 禁止网络连接；
- 中央统一画布的 authoring / playback Player 通过仅允许同源派生 Blob 子框架的受限导航策略装载不含 `allow-same-origin` 的 sandbox iframe，并把消息绑定到当前会话；主框架及独立预览窗口继续拒绝 Blob、外部页面和任意导航。该机制用于隔离编辑器和避免旧实例竞态，不代表可以执行不可信代码；
- 中央统一画布用父窗口临时 Blob URL 承载 Player 文档；工程与组件素材以可转移二进制缓冲区送入 sandbox，再由 iframe 在自身不透明源内创建并回收 Blob URL。这样既不授予 `allow-same-origin`，也避免大媒体 Base64 膨胀和父窗口 Blob URL 被沙箱拒绝；
- `.h5lesson` 的场景/全局运行时及 `.h5component` 都含可执行 JavaScript，只能打开可信来源。

修改窗口、协议、IPC、文件系统或组件 runtime 时，不要为了开发方便关闭现有安全选项。

## 已知边界

- 当前根目录双击入口只支持 Windows，源码命令行仍以 Node.js/npm 为前提；
- Blueprint、AI 局部 patch 及其他编辑器内 AI 能力不属于 1.x；统一延后到 2.0 以后。当前 authoring 协议只提供版本化、可校验的人工编辑边界，不会自动调用模型或修改工程；
- 不包含通用时间轴、关键帧/路径系统、节点连线式状态机、题库/成绩、多用户协作、云同步、模板市场和移动端编辑；编辑器提供事件驱动的入场/退场、顺序/并行步骤、表单式声明交互映射和稳定场景状态，复杂连续效果仍由可信运行时或组件实现；
- PDF 为静态版式；
- PPTX 为对象级素材导出，互动组件只保留其在 `capture` 模式经 `prepareCapture()` 生成的确定性静态快照；失败时使用带名称的诊断占位；
- 单 HTML 和网页包保留互动与音视频，但不应依赖远程服务；含大视频或大量媒体的课件优先网页包；
- 当前源码入口直接运行项目锁定的 Electron，不生成已签名安装包；请只从可信仓库获取源码和依赖锁文件。

## 源码 ZIP 说明

用于合作开发的源码 ZIP 应包含：

- `src/`、`tests/`、`scripts/`、`.agents/skills/`；
- `docs/`、`examples/`、`resources/`；
- `package.json`、`package-lock.json`；
- TypeScript、Vite、Vitest、Playwright、Electron 配置与根目录 `启动课件编辑器.cmd`；
- 本 README、`AGENTS.md` 和 `.gitignore`。

源码 ZIP 不包含：

- `node_modules/`；
- `dist-electron/`、`dist-player/`、`dist-renderer/`；
- `release/`；
- `artifacts/`、`output/`、`test-results/`、`tmp/`、日志和本机工具缓存；
- `.git/`。

合作伙伴解压后双击 `启动课件编辑器.cmd`，即可同步当前项目的课件 Skill、按锁文件恢复依赖、构建并打开当前源码。不要把 `node_modules/`、生产构建目录或历史 `release/` 产物混入源码包。

## 许可

`package.json` 当前标记为 `UNLICENSED`。源码包仅供项目所有者授权的内部合作与二次开发使用；对外发布、销售或再许可前，应由项目所有者补充正式许可证、版权归属和第三方依赖合规说明。
