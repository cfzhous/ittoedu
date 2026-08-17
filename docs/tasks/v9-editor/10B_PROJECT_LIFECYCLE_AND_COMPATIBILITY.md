# T09B — 工程生命周期、恢复与 V8 显式兼容

> Wave：2，可与 T05–T09A 并行
> 目标：V9 新建/打开/保存/恢复完整，V8 只走显式导入迁移

## 1. 可见结果

新建、打开、最近工程、保存、另存为、脏状态、防误关、恢复、资源 sidecar 与错误诊断均以 Course Project V9 为生产真相；V8 文件可显式导入并产生清晰迁移结果，但不会让 store 回落到 V8 编辑后端。

## 2. 独占文件

- `src/renderer/project/**`
- `src/main/projectPersistence.ts`
- 仅与工程文件生命周期直接相关的 main IPC 窄路径（修改前先确认无其他 owner）
- 对应 archive/persistence/recovery/asset 单测

不修改 App/store、Player/export producer、Schema、UI 热点或生成 artifact。App/store 文件对话框接线交给 T10。

## 3. 必须闭合

### 3.1 V9 生命周期

- 三类空白工程经 T03 model 创建后可保存为 V9 archive。
- 打开、另存、最近工程和路径更新不双写旧 V8 project。
- dirty/revision 与一次命令一次 history 一致；纯 selection/location/global scope 切换不变脏。
- 关闭前安全保存/取消/放弃路径明确，失败不误清 dirty。

### 3.2 恢复与原子写

- recovery sidecar、写入协调、窗口关闭和崩溃恢复保持原子。
- 恢复候选有项目 ID/revision/时间验证，不覆盖更新的正式文件。
- 资源二进制、Runtime/Component package 和音视频 sidecar 寻址稳定。

### 3.3 V8 显式导入

- V8 schema/archive 只从明确“导入旧课件”入口读取。
- 迁移产出 V9 工程和可理解报告；不兼容项阻止或告警，不静默丢失。
- 导入后保存只写 V9；最近工程和恢复不把 V8 设为默认 backend。
- V8 compatibility tests 与默认 V9 编辑测试分离。

### 3.4 健康检查

- 检查缺失 surface/location、悬空资源/互动引用、Runtime/Component package、声音引用和 owner 地址。
- 不通过隐藏入口或删功能消除健康问题。

## 4. 不做

- 不启动 V10 或更改 Course Project V9 Schema 语义。
- 不修改导出格式或 Player。
- 不创建第二 store/backend。
- 不重写 main IPC 框架。

## 5. 最小验证

```powershell
npx vitest run tests/unit/projectArchive.test.ts tests/unit/asyncArchive.test.ts
npx vitest run tests/unit/recoveryWriteCoordinator.test.ts tests/unit/projectPersistence.test.ts
npx vitest run tests/unit/assetTransactions.test.ts tests/unit/assetReferences.test.ts
npx vitest run tests/unit/projectV8Schema.test.ts tests/unit/courseProjectProtocol.test.ts
git diff --check -- src/renderer/project src/main/projectPersistence.ts
```

只运行触及组；禁止 typecheck、build、全量 test/E2E/visual，不生成真实发布包。

## 6. 验收

- 默认路径始终是 V9，V8 只能显式导入。
- 保存/恢复失败不会破坏源文件或错误清除 dirty。
- 资源与 package sidecar 在另存/重开后可解析。
- App/store 对话框和关闭流程以 `INTEGRATION_REQUEST` 交给 T10。

## 7. 交付记录

尚未执行。

