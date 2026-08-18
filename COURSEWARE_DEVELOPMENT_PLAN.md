# Course Project V9 统一与 Editor 1.0 收尾方案

> 计划版本：12.1  
> 更新日期：2026-08-18  
> 12.1 变更：教师确认没有要再打开的 V8 `.h5lesson`，删除导入、不保留密封导入器；删除已失效的重建任务包与 V8 Builder Skill；执行拆到 [docs/tasks/editor-1.0/00_INDEX.md](docs/tasks/editor-1.0/00_INDEX.md)，每环最小验证，全量只在最后。  
> 取代：计划 11.0–12.0。已删除 `docs/tasks/v8-to-v9-rebuild/**`，不得再领取 R0–R8。  
> 当前工程格式：Course Project `schemaVersion: 9`  
> 发布格式：Published Course V2  
> 运行时：Runtime API 2 / Surface Runtime API 3  
> 组件：Component API 4  
> 产品版本号：`package.json` 已是 `1.0.0`；**未完成合同冻结与教师验收前，不得宣称 Editor 1.0 已发布。**

本文件是唯一长期总纲。可执行任务卡在 `docs/tasks/editor-1.0/`。若与 README、USER_GUIDE 或能力索引冲突，以源码、Schema 和本文件为准，并在同一变更中修正过时文档。

---

## 1. 当前事实

审计日期：2026-08-18。当前产品就是仓库根目录 / `main`。V9 重建已合入。日常启动、构建和验证都在根目录进行。

已经成立、不要重做：

- 默认工程真相是 `CourseProjectDocument`（`COURSE_PROJECT_SCHEMA_VERSION = 9`）。
- 用户可见入口仍是成熟 `App` 表面。
- Slide / Flow / Spatial 可从空白直接创建；Mixed 从 `locations` / `surfaces` 推导，没有持久化 `projectMode`。
- `globalLayerItems`、`surfaceLayerItems`、逐 location 可见性仍是引擎能力。
- 正式 Skill 只有 `orchestrate-courseware` 与 `build-courseware-project`。V8 Builder 已从仓库树删除。
- 无可见 AI；无 Hash/审批/Evidence 教师流程。
- Vite `chunks larger than 500 kB` 不当缺陷修。

仍待收口（源码，不是再迁一次 V9）：

| 缺口 | 任务 |
|---|---|
| V9 Native 合同仍依赖 `projectTypes.ts` / `projectSchema.ts` | T1 |
| 持久化仍含 `legacy-runtime-v2`、`legacy-whole-canvas` | T1 |
| 打开 V8 仍走「导入旧版工程」；空白工程仍 `create V8 then migrate` | T2 |
| 双后端 + `v9-slide-candidate` | T3 |
| `artifacts/ai-capabilities` 仍声明 `project: 8`；`validate:project` 文案仍写 V8 | T4 |
| UI 仍消费 V8-shaped `SceneNode` 投影 | T5（隔离，不删光） |
| 无合同哈希、无教师 `accepted` | T6 |

不要从 `f272756` 再开重建分支。不要把 donor HEAD 当产品主干。

---

## 2. 决策

1. Course Project V9 是唯一作者工程真相。
2. **删除 V8 导入。** Archive 只接受 `schemaVersion === 9`。
3. 空白工程直接构造 V9。
4. 发布 1.0 前做最后一次 V9 Schema 收口；此后 1.x / 2.x 不改变 V9 字段、判别器和语义。
5. 1.0 之后的 Store / Workspace / Player / UI 重构不得改 V9 Schema。
6. Editor 2.0 的 AI 走独立 Authoring Protocol，不修改 V9；当前 `courseAiHandoff` / `courseAiPatch` 仍是未挂载 reserved 接口。
7. 破坏性工程模型才进 V10。

目标架构：

```text
教学设计 / 呈现脚本 / 素材
          │
          ▼
V9 Builder / Product Compiler
          │
          ▼
Course Project V9  ─────────────── 唯一作者工程真相
    │          │          │
    │          │          └── Project Health / Preflight
    │          └───────────── Editor Commands / History / Recovery
    └──────────────────────── Published Course V2 Producer
                                      │
                                      ▼
                             Player / HTML / Web / PDF / PPTX
```

---

## 3. 车道与执行包

```text
车道 P  产品事实与教师可感知收尾     可改 UI，不改 V9 判别器
车道 C  合同冻结与协议去 V8         可改 Schema，不改教师手感
```

同一提交不得同时改 Schema 判别器和教师可感知交互。

执行拆分、并行边界、最小验证命令见：

- [docs/tasks/editor-1.0/00_INDEX.md](docs/tasks/editor-1.0/00_INDEX.md)
- [docs/tasks/editor-1.0/01_SHARED.md](docs/tasks/editor-1.0/01_SHARED.md)

| ID | 内容 | 验证 |
|---|---|---|
| T0 | tag、V9 夹具、工作区产品补丁收口 | 1 个 round-trip 测试 |
| T1 | 共享合同、去掉 legacy Runtime 判别器 | 1–2 个合同测试 |
| T2 | 删除 V8 导入与 migration | 2 个 archive/migration 测试 |
| T3 | 单后端、去掉 candidate | 1–2 个 backend 测试 |
| T4 | 能力索引、validate CLI | 1–2 个 capabilities/CLI 测试 |
| T5 | Read Model 边界 | 1 个 UI 适配测试 |
| T6 | 合同哈希、CI、禁止项、教师 accepted | **唯一全量验证** |

T1 之后 T2 / T3 / T4 可分 worktree 并行；同一 worktree 内 T2 先于 T3。T5 在 T3 后。T6 在全部完成后。

中间任务禁止 `npm test`、`typecheck`、e2e、`build:desktop`、`verify`。

---

## 4. 版本策略

| 对象 | 1.0 冻结结果 | 后续 |
|---|---|---|
| Editor | 发布 `1.0.0`（缺的是冻结 Gate） | SemVer |
| Course Project | `schemaVersion: 9` | 破坏性变化进 V10 |
| Published Course | V2 | 独立升级 |
| Runtime | canvas-runtime API 2；surface-runtime API 3 | 新能力走独立 API 版本 |
| Component | API 4 | 独立升级 |
| Interaction | Interaction Protocol V1 | 破坏性判别器进 V2 |
| AI Authoring | 1.0 不发布 | 2.0 发 Protocol V1，不改 V9 |

1.0 之后必须能读取所有合法 V9 工程，不改变已有字段含义，不允许静默丢字段。

必须进 V10 的变化：新 Surface 无法由现有三类表达；改变 Location / Layer owner / 统一图层顺序 / Presentation 合并 / 稳定 ID；必须写入工程的完整时间轴或协作模型；删除或重解释现有必填字段。

---

## 5. 非目标

- 不全面重写 `editorStore.ts`、`Workspace.tsx`、属性栏。
- 不一次性移除所有 `SceneNode` 形状投影。
- 不加入可见 AI、聊天、模型调用。
- 不新增尚无产品需求的 Surface 或 Native 类型。
- 不为数字整齐重置 Runtime / Component / Published 版本号。
- 不把教师可感知交互缺陷塞进合同提交。

1.0 之后再做：统一 Command 层、拆 Store、V9-native Read Model 替换投影、拆 Workspace、Player Authoring 语义 Patch。

---

## 6. Editor 1.0 Done Definition

- V9 是唯一持久化 Schema，也是唯一 AI Builder 输出。
- 没有用户可达的 V8 默认真相、导入、双后端、candidate 产品语义。
- Runtime 合同无迁移型 legacy 字段。
- V9 合同有机器快照与哈希。
- 真实 V9 夹具可打开、保存、重开、播放、导出。
- 文档与能力索引不再把 Project V8 写成当前格式。
- 自动化、视觉、真人验收通过。
- **教师明确 `accepted`。**
- 内部投影适配器可以存在，不得形成第二份工程真相。

---

## 7. 仍然有效的产品约束（来自已完成的 11.4 重建）

- 不新增持久化四模式字段。
- 不取消全局层、MediaTab、动画、组件、图层控制、教师控制器。
- 不把 Flow 普通 block 当 z-order 图层。
- 不给 Spatial 另造弱化元素编辑器。
- 不维护两套可见编辑器。
- 不以 hidden/no-op 冒充完成。
- 自动化不能代替教师 `accepted`。

---

## 8. 最终判断

当前缺口不是「V9 领域模型要推倒」，而是过渡命名、合同归属、机器产物仍说 V8、以及教师尚未 `accepted`。

> **不要再增加 V8 兼容，也不要再跑一遍 V8→V9 重建。按 editor-1.0 任务包收口合同、删除导入、统一能力链，教师验收后发布 Editor 1.0。此后 V9 合同不变，内部实现再逐步解耦。**
