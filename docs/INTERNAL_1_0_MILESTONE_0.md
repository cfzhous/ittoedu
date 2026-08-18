# 内部正式版 1.0：里程碑 0 冻结记录

> 状态：里程碑已完成；本文保留为协议断代与文件处置的历史冻结记录
>
> 日期：2026-08-07
>
> 适用目标（当时）：Editor 1.0.0 / Project V8 / Runtime API 2 / Component API 4。当前工程格式已是 Course Project V9。

本文把当时的里程碑 0 转成可执行合同。协议断代已经完成；本文只解释当时的决策、归档入口和处置理由，不再充当待执行清单。当前能力、测试数量与后续工作以 [文档导航](README.md) 和根目录 [COURSEWARE_DEVELOPMENT_PLAN.md](../COURSEWARE_DEVELOPMENT_PLAN.md) 为准。

## 1. 可恢复基线

| 项目 | 冻结结果 |
| --- | --- |
| Git 提交 | `af5908dc57c0525a4cb3a212377ac486834c6a5c` |
| 归档标签 | `internal-prototype-1.7.0` |
| 应用 / 工程 | Editor 1.7.0 / Project V7 |
| 类型检查 | 通过 |
| 自动测试 | 100 个测试文件、641 项测试通过 |
| 生产构建 | Player、Renderer、Electron 通过 |
| 已知非阻断输出 | jsdom 不实现 Canvas `getContext()` 的测试环境提示；Vite 大包体提示 |

归档标签是旧 Project、Runtime 和 Component 协议的恢复入口。主干断代后不再把旧迁移链作为产品能力保留；如未来确有旧工程转换需求，应从该标签构建离线转换器，不把迁移代码重新放回正式版主程序。

## 2. 版本和产品边界

1. 应用版本改为 `1.0.0`；此前 `1.7.0` 明确属于未公开分发的内部原型线。
2. 作者态工程只接受 `schemaVersion: 8`。Project V1–V7 和未知未来版本都必须在解析前得到明确拒绝，不能部分加载、静默迁移或被标记为已保存。
3. Project V8 只承载固定 1280×720 的 Slide 表面。它沿用当前 V7 已稳定的场景、命名状态、全局层、媒体、声明式交互和四种导出语义，不借断代重命名稳定字段，也不加入 Flow、Spatial 2D 或混合工程占位字段。
4. 自由运行时只接受 `runtimeApiVersion: 2`；组件包只接受 `schemaVersion: 4` 与 `runtimeApiVersion: 4`。
5. PublishedLesson 的发布语义本轮不变，继续使用 PublishedLesson V1。由 PublishedLesson V1 重建的内存 Project 必须是 V8，但不得因此把作者态字段加入发布格式。
6. 断代按可独立验证的切片推进。中间提交可以暂时保留尚未删除的死代码，但编辑器打开、Player Payload 和保存入口一旦切换到 V8，就不得再调用旧迁移链。每个切片必须明确列出仍未完成的删除项。

## 3. Project V8 合同

### 3.1 V8 相对当前模型的唯一结构新增

除版本号外，首个新增字段是 `playback.presenter`：

```ts
interface ProjectPlaybackSettings {
  controls: 'canvas' | 'none'
  keyboardNavigation: boolean
  presenter: {
    enabled: boolean
    strategy: 'scene-navigation' | 'authored-command'
    additionalBindings: Array<{
      id: string
      command: 'next' | 'previous'
      key: string
      altKey: boolean
      ctrlKey: boolean
      shiftKey: boolean
      metaKey: boolean
    }>
  }
}
```

- 新工程默认 `enabled: true`、`strategy: 'scene-navigation'`、空附加绑定。
- `PageDown → next` 和 `PageUp → previous` 是 Player 内建且始终保留的标准绑定，不重复写入工程，也不能被附加绑定反向覆盖。
- `keyboardNavigation` 只控制方向键导航，与翻页笔开关相互独立。
- 附加绑定以 `KeyboardEvent.key` 为匹配真相；检测界面可以显示 `code`，但 V8 不把物理键位 `code` 作为跨设备合同。
- 第一版只允许 `next` 和 `previous`；最多 32 条附加绑定；同一键和修饰键组合不能映射到两个命令。
- `scene-navigation` 请求相邻场景并统一经过导航守卫；`authored-command` 只发出 `{ type: 'presenter.command', command: 'next' | 'previous' }` 触发器，没有隐式切幕后备。

`controls: 'footer'` 属于旧播放器外壳兼容值，不进入 V8。

### 3.2 严格解析和错误语义

- 先读取顶层 `schemaVersion`，再进入当前 Schema 校验。
- `1..7`：提示“旧工程格式不受支持”，建议使用对应归档版本打开或另行转换。
- `>8`：提示“工程来自更新版本”，建议升级编辑器。
- 缺失、非整数或其他值：按损坏/无效工程处理。
- 保存、恢复、Player 原始 Payload 和网页包 `course.json` 使用同一 V8 严格解析器。
- PublishedLesson V1 继续由自身格式守卫解析，再只在内存中组装合法 V8 Project。

### 3.3 教师控制器拖动

- V8 不增加按钮级拖拽配置，也不保存运行时坐标。
- `TeacherControllerNode.x/y` 只表示作者初始位置；`defaultCollapsed` 只表示课程启动状态。
- 点击/拖动阈值、边缘吸附距离、画布限位和键盘移动步长是 Player 统一可访问性常量，不进入每个工程。
- 运行时会话保存 `{ dx, dy, collapsed }`；切幕和重播保持，刷新、重开课程或重新打开成品时清空。
- 静态导出只使用作者位置，继续默认省略控制器。

### 3.4 公式最低语义

正式版使用一等 `FormulaNode`，不把公式降级为普通 `TextNode` 字符串。最低 AST 由 `row`、`token`、`operator`、`fraction`、`root`、`script` 和 `fenced` 构成，足以表达纵向分式、上下标、根式、括号、绝对值和常见关系/运算符。公式节点还保存可访问文本、字号、颜色、对齐和稳定 Formula ID。

编辑器与 HTML 使用同一 AST 渲染；PDF 捕获确定帧；PPTX 在没有可靠原生映射时静态化，并在预检报告中记录。实现 FormulaNode 前不得用 `a/b` 或 Unicode 斜线分数冒充该能力。FormulaNode 仍属于 V8 的发布前演进，不为尚未发布的中间提交另增工程版本。

## 4. 本地组件目录和工程自包含合同

组件库采用相邻独立 Git 仓库 `courseware-components`，课例采用相邻独立 Git 仓库 `courseware-cases`。外部目录只负责发现；导入结果必须复制并嵌入 `.h5lesson`。

`catalog.json` 最低合同：

```ts
interface ComponentCatalogV1 {
  catalogVersion: 1
  packages: Array<{
    packageId: string
    version: string
    name: string
    description: string
    subject: string[]
    schoolStage: string[]
    tags: string[]
    packagePath: string
    thumbnailPath: string
    sha256: string
    componentSchemaVersion: 4
    runtimeApiVersion: 4
    renderMode: 'dom' | 'phaser' | 'hybrid'
    supportedScopes: Array<'scene' | 'global'>
    quality: 'experimental' | 'candidate' | 'stable' | 'deprecated'
    maintainer: string
    verifiedCases: string[]
    verifiedAt?: string
  }>
}
```

- 路径相对目录根并接受归档路径安全校验；哈希为组件包原始字节的 SHA-256 小写十六进制。
- 可信度属于“目录来源配置”，不能由包自我声明。来源为 `built-in | trusted | prompt`；`prompt` 每次首次导入需人工确认。
- V8 的嵌入组件元数据记录锁定的包哈希、导入时间和可读来源标签，但运行时不保存外部绝对路径。
- 同 ID/版本但哈希不同视为冲突；新版本只提示，不能自动修改已保存工程。

## 5. 导出预检和诊断合同

统一预检返回结构化 `error | warning | info` 项，包含稳定代码、格式范围、工程定位和可读修复建议。错误阻断对应导出；提醒和信息不阻断。首批检查文字溢出/过小、缺失字体、公式降级、组件/运行时捕获失败、空白页、越界对象、页数异常、外部网络请求和静态格式差异。

诊断包只包含应用/协议版本、平台摘要、脱敏日志、工程结构计数、健康检查代码和导出报告；默认不包含可见文案、素材字节、运行时源码、组件源码或绝对用户路径。需要附加工程内容时必须另行显式选择。

## 6. 文件级处置清单

“归档后删除”表示从正式版主干删除，但可从 `internal-prototype-1.7.0` 恢复。

| 文件或精确文件族 | 处置 | 理由 / 替代 |
| --- | --- | --- |
| `src/shared/constants.ts` | 改写 | App 1.0.0、Project V8；Component 4 常量保留 |
| `src/shared/projectTypes.ts` | 改写 | `schemaVersion: 8`、Presenter 合同、后续 FormulaNode；删除 V3/V5 兼容别名 |
| `src/shared/projectSchema.ts` | 改写 | 只导出 V8 当前 Schema；V1–V7 Schema 和逐级迁移归档后删除 |
| `src/renderer/project/projectArchive.ts` | 改写 | 打开/保存只走 V8；加入旧版、未来版和损坏版分流诊断 |
| `src/player/payload.ts` | 改写 | 原始 Payload 只接受 V8；不再调用迁移器 |
| `src/player/publishedLesson.ts` | 改写 | PublishedLesson V1 内存重建目标改为 V8，发布格式不升级 |
| `src/renderer/project/createProject.ts` | 改写 | 新建 V8 并写入 Presenter 默认值；删除仅供旧调用签名的重载 |
| `tests/unit/projectV7Schema.test.ts` | 替换 | 新建 `projectV8Schema.test.ts`，覆盖当前正例与 V1–V7/未来版拒绝 |
| `tests/helpers/projectV5.ts` | 归档后删除 | 用当前 V8 工厂/夹具替代 |
| `tests/unit/projectArchive.test.ts` 中迁移用例 | 改写 | 改为明确拒绝与不产生半损坏工程的断言 |
| 其他手写 `schemaVersion: 7` 测试/脚本 | 改写 | 全部使用 `PROJECT_SCHEMA_VERSION` 或当前 V8 工厂 |
| `src/shared/runtimeTypes.ts` | 改写 | 只保留 Runtime API 2 上下文和定义 |
| `src/shared/runtimeSchema.ts` | 改写 | 删除 Runtime API 1 Schema；只接受 API 2 |
| `src/player/RuntimeRegistry.ts` | 改写 | 支持集合收敛为 API 2，错误文案不再宣称 1/2 |
| `src/player/RuntimeHost.ts` | 改写 | 删除 API 1 同时暴露 DOM/Phaser 的分支 |
| `src/player/PlayerApp.ts`、`src/renderer/ui/PropertiesTab.tsx` 的 API 1 分支 | 改写 | 统一 API 2 能力声明与 UI |
| `tests/unit/runtimeSchema.test.ts`、`runtimeHostV2.test.ts` | 改写 | API 1 改为拒绝用例，保留 API 2 生命周期覆盖 |
| `tests/unit/runtimeContentEditor.test.tsx`、`sceneThumbnailComposition.test.ts` 的 API 1 夹具 | 改写 | 使用最小 API 2 夹具 |
| `src/shared/componentTypes.ts` | 改写 | 只保留 Component API 4 Manifest、定义、上下文与实例 |
| `src/shared/componentSchema.ts` | 改写 | 删除 Component Schema/API 1–3 解析 |
| `src/player/ComponentRegistry.ts`、`src/renderer/components/ComponentRegistry.ts` | 改写 | 注册只接受 API 4 |
| `src/player/renderNode.ts`、`src/renderer/phaser/ComponentRegistry.ts` | 改写 | 删除旧组件上下文和宿主分支 |
| `src/renderer/components/importComponentPackage.ts` | 改写 | 任何非 Schema 4/API 4 包均明确拒绝，而非只拒绝未来版本 |
| `src/renderer/export/buildPublishedLesson.ts` 的旧组件转换 | 改写 | 发布只编译 Component 4；保留 PublishedLesson V1 |
| `ComponentPropertiesEditor.tsx`、`ElementsTab.tsx`、`PropertiesTab.tsx` 的 Schema 1 UI | 改写 | 只显示 V4 编辑模型 |
| `tests/unit/componentProtocolV2.test.ts`、`componentProtocolV3.test.ts` | 归档后删除 | V4 测试承接当前合同；另加旧包拒绝测试 |
| 其余 V1–V3 组件夹具和兼容断言 | 改写或删除 | 只保留能够保护 V4 当前行为的断言 |
| `examples/runtime-v3-complete/**` | 归档后删除 | 历史兼容演示，不进入正式版核心 |
| `scripts/build-runtime-v3-example.ts` | 归档后删除 | 用当前 API 2/API 4 综合夹具替代 |
| `tests/e2e/runtime-v3.spec.ts` | 替换 | 改为当前协议综合 E2E，不再以历史代际命名 |
| `examples/render-host-benchmark/**`、`scripts/build-render-host-benchmark.ts` | 改写并保留 | 收敛为 API 2/API 4 五路径当前基准 |
| `examples/induction-lab-component/**` | 迁出 | 进入 `courseware-components`；核心仅保留最小 V4 夹具 |
| `examples/math-motion-function-lab/**` | 迁出 | 进入 `courseware-components`，先保持 `experimental` |
| `docs/courseware-pilots/**` | 迁出 | 进入 `courseware-cases` 的课例档案与证据目录 |
| `scripts/build-induction-lesson.ts`、`validate-induction-lesson.ts` | 迁出 | 跟随对应课例进入 `courseware-cases` |
| `scripts/build-math-motion-*.ts`、`validate-math-motion-*.ts`、`export-math-motion-static.ts`、`export_math_motion_pdf.py` | 迁出 | 跟随数学课例进入 `courseware-cases` |
| `src/shared/coursewareEvidence.ts` 与对应测试 | 评估后迁出 | 若只服务课例证据则移入课例库；核心不承载领域交付治理 |
| `.agents/skills/orchestrate-courseware/**` | 保留并改写 | 仓库权威 Skill；V8 合同冻结后中文化 |
| `.agents/skills/build-project-v7-courseware/**` | 保留为受阻断历史入口 | 当前主干不得使用；W1 另建稳定 V8 实现 Skill，不能原地伪改版本 |
| `scripts/install-courseware-skills.ps1` | 保留并改写 | 继续从仓库权威源幂等安装当前两个 Skill |
| `docs/AI_COURSEWARE_AUTHORING.md` | 改写 | 切换为 Editor 1.0.0 / Project V8 / API 2 / API 4 |
| `docs/RUNTIME_AUTHORING.md`、`docs/COMPONENT_AUTHORING.md` | 改写 | 删除旧协议描述；当前链接使用不带历史代际的文件名 |
| `docs/RUNTIME_V3_DEVELOPMENT_PLAN.md` | 从主干删除 | 历史内容由标签 `internal-prototype-1.7.0` 保留 |
| `README.md`、`docs/USER_GUIDE.md` | 改写 | 只描述当前正式版真实能力和旧格式拒绝方式 |
| `MULTI_SURFACE_DEVELOPMENT_PLAN.md` | 已删除（2026-08-18） | 当时作为正式版收敛路线图；现行总纲是根目录 `COURSEWARE_DEVELOPMENT_PLAN.md` |

## 7. 分段实现门禁

1. Project V8 边界：新建、保存、打开、恢复、原始 Player Payload、PublishedLesson V1 重建和拒绝诊断。
2. Runtime API 2 边界：删除 API 1 Schema、上下文、宿主、UI 与测试。
3. Component API 4 边界：删除 API 1–3 Schema、注册、宿主、导出、UI 与测试。
4. 当前综合夹具：把渲染基准改成 Project V8/API 2/API 4，随后删除历史示例。
5. 全链路文档同步后，里程碑 1 才可标记完成。

每个门禁分别运行类型检查、相关单元/集成测试和生产构建。管线通过最多记为 `engineering candidate`；本文件不授予任何视觉或课例 `accepted` 状态。
