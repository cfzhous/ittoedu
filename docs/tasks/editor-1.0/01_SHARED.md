# 共享约束

所有 Editor 1.0 收尾任务必须遵守。与源码冲突时以源码为准，并在同一变更修正文档。

## 已锁定决策

1. **Course Project V9 是唯一作者工程真相。** 新建、编辑、保存、恢复、Player、导出、工程检查和 AI 构建都只写 V9。
2. **删除 V8 导入。** 没有需要再打开的 V8 `.h5lesson`。不保留密封导入器。Archive 只接受 `schemaVersion === 9`；其他整数版本为 unsupported；缺少版本或损坏为 corrupted。
3. **空白工程直接构造 V9**，不得 `migrateProjectV8ToCourseProjectV9(createProject())`。
4. **不新增** `projectMode`、四模式字段、Hash/审批/Evidence 教师流程、可见 AI、每场景一份教师控制器副本。
5. **不启动 V10。** 统一图层尚未完整支持 ownership-aware 操作前，保留现有全局/surface 共享作者入口。
6. Vite `chunks larger than 500 kB` 不当缺陷修。
7. 自动化最多 `engineering candidate`。`accepted` 必须来自教师。

## 两条车道

```text
车道 P  产品事实与教师可感知收尾     可改 UI，不改 V9 判别器
车道 C  合同冻结与协议去 V8         可改 Schema，不改教师手感
```

同一提交不得同时改 Schema 判别器和教师可感知交互。

## 禁止

- 从 `f272756` 或 donor HEAD 当产品主干再重建。
- 领取已删除的 R0–R8 任务卡。
- 为「看起来纯 V9」一次性拆掉全部 `SceneNode` 投影。
- 本轮重写整个 `editorStore.ts` 或 `Workspace.tsx`。
- 用 `.passthrough()` / `z.unknown()` 弱化核心合同。
- 把 Player DOM 或投影副本存成工程。
- 靠删测试降覆盖率；V8 import 测试里的通用保存/导出/恢复必须先迁到 V9 夹具。
- 宣称编辑器内已有 AI。

## 1.0 之后才做（不要绑进本包）

统一 Command 层、拆分 `editorStore`、删光 `SceneNode`、拆 Workspace、Player Authoring 改语义 Patch、Editor 2.0 聊天/模型。

## 兼容承诺（T1 冻结后）

- 能读取所有合法 V9 工程。
- 不改变已有字段和判别器含义。
- 不重新解释统一图层顺序、owner、location、presentation state、稳定 ID。
- 不允许旧 V9 工程被静默丢字段。
- 不要求 Editor 1.0 读取 V10+。
