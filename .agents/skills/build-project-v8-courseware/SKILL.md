---
name: build-project-v8-courseware
description: Build, patch, validate, export, and evidence an approved interactive courseware case as a current Project V8 lesson. Use after an orchestrate-courseware case has a hash-valid approved presentation script and Codex must choose native/runtime/hybrid/component ownership, implement through the repository's real TypeScript APIs, preserve author editability and stable IDs, run Player and export verification, or resume/audit an existing V8 implementation. Refuse to invent missing teaching content or use the archived V7 workflow.
---

# Build Project V8 Courseware

把获批的体验合同实现成当前 Project V8 工程。HTML 是产品真相；自动化最多签发 `engineering candidate`。

## 不可妥协规则

1. 先运行入口校验。脚本、批准或 Capability 证据失效时返回编排阶段，不从聊天、旧工程或模板补写。
2. 只生成 Project V8 / Runtime API 2 / Runtime Authoring 1 / Component API 4；不读取或调用 V7 Skill。
3. 通过仓库真实 TypeScript API 构建 `.h5lesson`，不得建立影子 Project DSL 或手写巨型 JSON。
4. 先按结果质量确定 `native-owned | runtime-owned | hybrid-owned | component-composed`，再设计状态和规则。Runtime 是一次性复杂场景的一等载体；组件需要真实复用职责。
5. 每个场景必须有 Authoring Inventory。人工内容、素材和关键参数必须有稳定绑定与明确编辑状态；不得持久化 `registered:*`、`dom:*` 等会话 targetId。
6. Presentation State 只表达有教学、复核、导航或静态捕获意义的稳定检查点；声明式规则只做可读连接，不承担复杂状态机。
7. 先打通最高风险纵切，再批量扩展。人类在编辑器修改后，只做保留既有 ID 的局部 Patch，不从初始 Builder 覆盖整课。
8. 真实验证编辑、保存、关闭、重开、Player、离线 HTML/网页包、PDF/PPTX 和证据；Headless 绿色不能代替像素与互动验收。
9. 实现若要求改变教学内容、用户可见流程、核心互动、编辑能力、授权、联网或静态差异，停止并返回 `$orchestrate-courseware`。

## 入口

运行：

```text
python <skill-dir>/scripts/init_v8_implementation.py --case-dir <case-dir> --editor-root <editor-root>
```

脚本会重跑编排校验和 `check:ai-capabilities`，核对 Capability Index 中的真实 Builder 入口，再创建内部计划、实现目录、Inventory 和证据清单；不会覆盖已有实现。

恢复既有实现时，先运行：

```text
python <skill-dir>/scripts/validate_v8_case.py --case-dir <case-dir> --editor-root <editor-root>
```

## 计划与载体

填写 `03-development-plan.md`，使每个场景/状态、内容源、载体所有权、静态帧、共享机制、任务和验收路径闭合。载体判断和状态爆炸信号见 [carrier-selection.md](references/carrier-selection.md)，计划合同见 [development-plan-contract.md](references/development-plan-contract.md)。

为全部可编辑内容维护 `implementation/authoring-inventory.json`。绑定与隐藏内容边界见 [authoring-inventory.md](references/authoring-inventory.md)。

## 实现

1. 按 [headless-project-v8-build.md](references/headless-project-v8-build.md) 完成 `implementation/build.ts`，先构建风险纵切。
2. Runtime 场景读取 [runtime-implementation.md](references/runtime-implementation.md)；组件场景读取 [component-implementation.md](references/component-implementation.md)。只加载本任务需要的 Capability 子合同与源码。
3. 含公式或专业数学排版时读取 [formula-typography.md](references/formula-typography.md)，优先使用当前一等 `FormulaNode`，并实际检查所有导出端。
4. 复杂或跨回合任务按 [task-execution.md](references/task-execution.md) 建 `tasks/TASK-*.md`；简单场景批次只留在内部计划表。
5. 首次完整生成后冻结路径和 SHA-256。人工编辑后改用 `implementation/patch.ts`，并在实际工程上校验稳定 scene/node/binding ID。

## 验证与交付

按 [visual-qa.md](references/visual-qa.md) 捕获互动幕的初始、关键反馈和稳定结果三帧，静态幕捕获稳定帧，并生成 contact sheet。按 [export-and-evidence.md](references/export-and-evidence.md) 完成分层验证、四格式真实产物、编辑闭环和差异报告。

至少运行：

```text
npm run --silent check:ai-capabilities
npm run --silent validate:project -- <lesson.h5lesson>
python <skill-dir>/scripts/validate_authoring_inventory.py <inventory.json> --project <lesson.h5lesson>
python <skill-dir>/scripts/validate_evidence.py <evidence-manifest.json>
```

管线只能写 `unusable | placeholder | engineering candidate | art candidate`。只有带指定审阅人、时间、证据和明确意见的人类记录才能成为 `accepted`。

## 停止条件

- 获批脚本、决策、Capability、组件目录或工程基线哈希失效；
- 精确文案、答案、反馈、公式或素材来源缺失；
- 必须静默降低互动、视觉、声音、分支、编辑性或静态输出；
- 真实证据不足，或存在必须可编辑但仍为 `blocked` 的人工内容。

停止时持久化原因和最早返回阶段，不用下游实现掩盖上游缺口。
