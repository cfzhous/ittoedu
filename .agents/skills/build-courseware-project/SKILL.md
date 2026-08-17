---
name: build-courseware-project
description: 从已确认的 01-teaching-plan.md 与 02-presentation-script.md 构建、增量修复和验证当前编辑器支持的可编辑互动课件。Use when Codex should act as a clean Build Coordinator, discover current capabilities, select Native/Runtime/Component ownership, build a high-risk vertical slice before the whole lesson, coordinate bounded workers, assemble through Courseware Agent Kit, export deliverables, or apply a revision-protected patch to a stable authoringAddress。
---

# 构建互动课件工程

以两份当前教学文件为体验真相，以当前产品 Capability Index 和源码为工程真相。交付可编辑 Project 与离线 HTML；不得用旧聊天、旧课件或模板补写缺失内容。

## 1. 冷启动

1. 直接读取 `01-teaching-plan.md`、`02-presentation-script.md` 和其中引用的材料。
2. 读取用户本轮约束；不继承被否决的设计和无关聊天摘要。
3. 确认当前编辑器根目录、Agent Kit 入口和 Capability Index。
4. 若两份文件缺失关键教学内容，或实现必须改变教师可感知体验，返回 `$orchestrate-courseware`；不要猜。

## 2. 发现能力

先按需检索短能力卡，不通读整库：

```text
node <editor-root>/agent-kit/bin/courseware-agent-kit.mjs capabilities \
  --index <editor-root>/agent-kit/capabilities/index.json --query "<需要的行为或载体>"
```

需要解释索引位置、状态或版本边界时读 [current-capabilities.md](references/current-capabilities.md)。只使用当前存在且适配需求的能力；计划中的能力不能冒充已发布能力。

按“满足效果所需的最少黑箱”选择所有权：稳定文字、公式、图片、形状和控制优先 Native；一次性复杂动态机制使用普通 Runtime 模块；确有跨课例复用职责才用 Component。Runtime/Component 的文字必须、普通可替换图片应当公开稳定作者目标。

## 3. 建立最小构建图

使用 Agent Kit 建预备工作区；已有工作区则先验证，不覆盖：

```text
node <editor-root>/agent-kit/bin/courseware-agent-kit.mjs scaffold \
  --workspace <build-workspace> --id <stable-id> --title <title> \
  --plan <01-teaching-plan.md> --script <02-presentation-script.md> \
  --capabilities <capability-index.json>
```

把工作分为：能力核对、高风险纵切、共享基础、独立实现单元、集成、验证修复、导出。构建图只描述真实依赖和产物所有权；不按页数机械拆分，也不预建教学模板。

先运行 `graph` 校验拓扑和输出冲突，再用 `assemble` 确定性装配。语义 SDK 生成 CourseProject 构建输入；产品编译器生成真实 Project。若当前产品没有对应编译器或载体，停止并报告产品缺口，不自造影子 Project DSL。

## 4. 先做最高风险纵切

选择最可能推翻载体、视觉、互动、编辑或导出的最小真实片段。必须使用真实内容、真实 Player、真实作者目标和真实保存路径；占位机制不能证明方案成立。

缺失的低层机制先用 `rig` 建独立 micro rig，至少验证相关的行为、视觉、命中、保存重开和导出边界。只有跨课例成立、去除课例文案与视觉身份后，才作为能力块复用。

纵切失败时修正底座或载体，再扩展；不要在错误机制上批量生成。

## 5. 增量构建与 Worker

Coordinator 是唯一能写权威 Project、构建图和共享接口的人。小型强耦合课件由 Coordinator 分段完成。

仅当边界清楚且能独立验收时使用干净 Worker，例如场景组、复杂互动模块或共享能力。每个 Worker 只得到：本单元脚本、共享视觉/接口简报、相关能力卡、输入输出路径和验收命令。Worker 输出独立模块或建议 Patch，不直接改权威 Project，也不修改别的单元。

每合入一个单元就重跑受影响的最小验证；完成共享层后再做整课集成。动态代码保存在普通模块中，由装配器处理；禁止在构建脚本中手写巨型 Runtime/Component 字符串。

## 6. 保持可编辑

所有画布项、控制器、Runtime 和 Component 都作为显式图层项参与同一层级关系。稳定内容尽可能是 Native；动态载体公开可编辑内容、素材、关键参数和可选择区域。

首次构建后保留稳定 project/surface/scene/layerItem/binding ID。教师手工编辑后不得全量重建覆盖。当前编辑器没有可见 AI（没有复制引用、Clipboard、Patch 应用入口）；“修改当前选中项”优先由教师在编辑器中就地修改，或由 Builder 读取当前工程后输出窄 Patch。不要用会话 `hitId` 定位；跨保存定位使用稳定 `authoringAddress`。

输出单个 `op=replace` 的 JSON Patch。工程仍在编辑器中打开时不要运行磁盘 Patch（它会拒绝覆盖，且当前编辑器没有“应用 AI Patch”导入入口）；请回编辑器直接修改，或先确认工程已关闭。工程关闭后运行 `npm run patch:course-project -- --project <project.h5lesson> --patch <patch.json>`，它会验证临时副本并原子更新 Project 与 `course.html`。revision 冲突或选择失效时重新读取，不猜测合并。Agent Kit `patch` 只用于尚未编译的语义构建状态，不替代产品工程 Patch。

交互后返回编辑的当前画面是会话检查点，不自动写成默认答案；只有教师显式保存为命名状态时才持久化。

## 7. 验证与交付

运行 `validate --workspace`、构建图装配、产品类型/Schema/单测、真实编辑保存重开、Player、默认离线 HTML 和本课要求的其它导出。验证范围和停止边界见 [validation-boundaries.md](references/validation-boundaries.md)。

工程检查通过后，由全新上下文做一次只读体验 QA，检查教学内容、视觉层级、互动反馈、教师控制、命中编辑和静态差异。自动化通过不代表教师体验已验收。

只保留两份教学 Markdown、真实 Project、默认 HTML 及用户要求的交付物。成功后清理构建图、Worker 任务、micro-rig 临时副本、截图和中间报告；可复用能力应迁入正式能力库并单独验证，不留在课例中伪装复用。

## 停止条件

- 两份教学文件不一致或缺少必须由教师决定的内容；
- 当前能力不能实现且需要可感知降级；
- 载体内部文字、普通图片或关键参数无法满足约定的编辑性；
- 稳定地址、revision 或目标字段已经失效；
- 真实 Player、保存重开或交付格式缺少足够证据。

停止时说明最早应返回的阶段和最小缺口，不用下游代码掩盖问题。
