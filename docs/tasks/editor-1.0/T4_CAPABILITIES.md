# T4 能力链与校验 CLI 统一到 V9

> 状态：**已合入，禁止重做**  
> HANDOFF：[T4_HANDOFF.md](T4_HANDOFF.md)  
> 并行：可与 T3、P8 分树（文件不重叠）  
> 合同变化：机器产物与 CLI 文案  
> 工人先读：[02_WORKER.md](02_WORKER.md)

## 一句话

能力索引和 `validate:*` 把 **当前工程** 写成 Course Project 9。不要改编辑器打开规则（T2 已做），不要改 `editorStore`。

## 基线

- `package.json` 仍是 `"validate:project": "tsx scripts/validate-project.ts"`，**没有** `validate:course-project`。
- `scripts/generate-ai-capabilities.ts` 仍用 `PROJECT_SCHEMA_VERSION`（`src/shared/constants.ts` 里 **等于 8**）当 `project:` 字段。
- 当前工程版本常量是 `COURSE_PROJECT_SCHEMA_VERSION`（`src/shared/courseProjectTypes.ts`），值为 9。
- `scripts/run-courseware-behavior.ts` 可能仍指向已删 V8 Skill。无下游则删除脚本和 `package.json` 条目。
- 正式 Skill 只有 `orchestrate-courseware`、`build-courseware-project`。仓库不得再出现 `build-project-v8-courseware` 目录。

## 允许修改

```text
scripts/generate-ai-capabilities.ts
scripts/validate-project.ts
scripts/run-courseware-behavior.ts      无下游则删除
package.json                            只改脚本名/说明
artifacts/ai-capabilities/**
tests/unit/aiCapabilities.test.ts
tests/unit/validateProject.test.ts
tests/unit/coursewareSkillsInstaller.test.ts  保持 retired 名称；不要要求 Skill 目录存在
.agents/skills/build-courseware-project/references/current-capabilities.md
docs/tasks/editor-1.0/T4_HANDOFF.md
```

## 禁止

- 改 `src/shared/constants.ts` 里 `PROJECT_SCHEMA_VERSION = 8` 的数值（那是历史 V8 形状常量，T5/投影还在用）。
- 改 `courseProjectSchema.ts`、Archive、`editorStore`、宿主、UI。
- 重写 `orchestrate-courseware` Skill，或把 Hash/审批写成现行教师入口。
- 跑课例冷启动或四格式导出。

## 逐步算法

### A. Capability Index

在 `generate-ai-capabilities.ts` 把 **当前产品** 声明改成：

```text
project: 9
publishedCourse: 2
runtime: [2, 3]
component: 4
interaction: 1
```

`project` 必须来自 `COURSE_PROJECT_SCHEMA_VERSION`，禁止再读 `PROJECT_SCHEMA_VERSION` 当当前工程版本。

输出 `schemas/course-project-v9.json`（或能力目录里等价路径）。`schemas/project-v8.json` 不得再标成当前权威（可留历史快照，但 index 的 current 必须是 v9）。

改完后按仓库现有方式再生 `artifacts/ai-capabilities/**`（看 `package.json` 里 generate 脚本；不要手写一份对不上的 JSON）。

### B. 校验入口

`package.json` 增加：

```text
"validate:course-project": "tsx scripts/validate-project.ts"
```

现有 `validate:project` **改为同一入口**（或打印「请用 validate:course-project」后转调 V9）。运行 V8 归档必须失败，文案不得说「只接受 Project V8」为当前格式；应说版本不受支持 / 需要 schemaVersion 9。

脚本至少检查（已有函数就接线，不要重写校验器）：V9 Schema、Health、资产与组件、Runtime/Component 协议、四导出 Preflight、稳定 ID、拒绝 V8 字段当可保存工程。

### C. 编排遗留

不要改编排 Skill 正文去「现代化」。不要在能力索引把 `case.json` / Hash 审批标成现行入口。不要借本任务大删编排目录。

### D. Builder 文案

更新 `current-capabilities.md`：Flow / Spatial 已是产品能力。删除「只能在索引与编译器同时发布后使用」。安装链仍是两个现 Skill。

### E. 测试

`aiCapabilities.test.ts`：断言 index `project === 9`（或 `COURSE_PROJECT_SCHEMA_VERSION`）。  
`validateProject.test.ts`：V9 夹具通过；V8 bytes（可用 `createProject` + `createProjectArchive` 现场造，不要依赖已删 `tests/fixtures/courseware-v8`）失败。  
`coursewareSkillsInstaller.test.ts`：仍断言 V8 Builder 名称 retired。

## 最小验证

```powershell
npx vitest run tests/unit/aiCapabilities.test.ts tests/unit/validateProject.test.ts
```

然后 `git diff --check`。

## 完成判定

- [ ] Capability Index 当前 `project` 为 9
- [ ] `validate:*` 不再把 V8 写成当前格式
- [ ] 未改 `PROJECT_SCHEMA_VERSION` 常量值
- [ ] 已 push `cursor/t4-capabilities-v9-de5c`
- [ ] 有 `T4_HANDOFF.md`

## 下游

T6 用真实课例与全量命令做 Builder/导出 Gate。
