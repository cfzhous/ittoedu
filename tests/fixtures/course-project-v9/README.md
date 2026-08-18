# Course Project V9 永久夹具

当前可打开的 `schemaVersion: 9` 工程归档（`.h5lesson`），供 round-trip、保存/重开和 T2 之后的通用打开/导出测试使用。

**不是** `tests/fixtures/courseware-v8/`。V8 目录只作历史形状参考；T2 已删除仅服务旧版打开的夹具。

## 覆盖

| 文件 | 覆盖 |
|---|---|
| `slide-native.h5lesson` | Slide Native（文字、公式、图片、图形） |
| `slide-presentation-state.h5lesson` | Slide Presentation State |
| `global-layer-teacher-controller.h5lesson` | Global Layer，含 `teacher-controller` |
| `canvas-runtime.h5lesson` | Canvas Runtime（当前持久化：`canvas-runtime` / API 2） |
| `surface-runtime.h5lesson` | Surface Runtime（当前持久化：`surface-runtime` / API 3） |
| `component.h5lesson` | Component API 4 嵌入包 |
| `flow.h5lesson` | Flow |
| `spatial.h5lesson` | Spatial |
| `mixed.h5lesson` | Mixed（Slide + Flow + Spatial + `mixedPrintPlan`） |
| `multi-asset.h5lesson` | 多素材（图片、音频、视频） |
| `slide-native.json` | Slide Native 工程 JSON（归档往返单测源，含图片 + 嵌入组件） |

归档由 `sources.ts` 生成，时间戳固定为 `2026-08-18T12:00:00.000Z`。重新生成：

```bash
npx tsx tests/fixtures/course-project-v9/build.ts
```
