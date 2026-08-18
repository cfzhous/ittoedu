# T4 能力链与校验 CLI 统一到 V9

> 依赖：T1  
> 可与 T2、T3 并行  
> 合同变化：机器产物与 CLI 文案

V8 Builder Skill 与其专用测试已在卫生清理中删除。本任务改的是仍在说 Project V8 的能力索引和 `validate:project`。

## 允许修改

```text
scripts/generate-ai-capabilities.ts
scripts/validate-project.ts
scripts/run-courseware-behavior.ts      （去掉对已删 V8 Skill 路径的硬编码；无下游则删除脚本与 package.json 条目）
package.json                            （脚本名/说明）
artifacts/ai-capabilities/**
tests/unit/aiCapabilities.test.ts
tests/unit/validateProject.test.ts
tests/unit/coursewareSkillsInstaller.test.ts  （保持 retired 名称断言，不要再要求 Skill 目录存在）
.agents/skills/build-courseware-project/references/current-capabilities.md
```

不要改 Schema 判别器、Archive 打开规则、editorStore backend。

## 工作项

### A. Capability Index

改为声明：

```text
project: 9
publishedCourse: 2
runtime: [2, 3]
component: 4
interaction: 1
```

输出 `schemas/course-project-v9.json` 等。删除 `schemas/project-v8.json` 作为当前权威。生成器不得再读 `PROJECT_SCHEMA_VERSION = 8` 当当前工程版本。

### B. 校验入口

```text
npm run validate:course-project -- <project.h5lesson>
```

现有 `validate:project` 改为调用 V9 校验或删除，避免继续得到「只接受 Project V8」。

至少检查：V9 Schema、Health、资产与组件、Runtime/Component 协议、四导出 Preflight、稳定 ID、无 V8 字段和迁移标记。

### C. 编排遗留

`orchestrate-courseware` 目录里的 `case.json` / Hash 审批脚本不是当前教师工作流。本任务不要重写编排 Skill；不要在能力索引里把它们写成现行入口。彻底删除那些脚本留给后续独立卫生，不阻塞 1.0 合同。

### D. Builder

正式安装链保持：`orchestrate-courseware`、`build-courseware-project`。仓库树内不得再出现 `build-project-v8-courseware` 目录。

Flow / Spatial 已是产品能力：更新 `current-capabilities.md`，删除「只能在索引与编译器同时发布后使用」。

## 最小验证

只跑：

```powershell
npx vitest run tests/unit/aiCapabilities.test.ts
```

若改了 CLI 文案，可再加：

```powershell
npx vitest run tests/unit/validateProject.test.ts
```

不要跑真实课例冷启动或四格式导出（T6）。

## Gate

- Capability Index 只声明 project 9。
- 安装器不安装 V8 Builder。
- `validate:*` 不再把 V8 写成当前格式。

## 下游

T6 用真实课例与全量命令做 Builder/导出 Gate。
