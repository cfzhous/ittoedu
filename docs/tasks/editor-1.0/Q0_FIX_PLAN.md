# Q0 修复方案与并行切分

> 执行入口：[00_INDEX.md](00_INDEX.md) 车道 Q。  
> 工人协议：[02_WORKER.md](02_WORKER.md) + 本轮 Git 后缀 **`-489b`**。  
> 定位：[Q0_DIAGNOSIS.md](Q0_DIAGNOSIS.md)

## 产品行为（修完后教师应看到）

1. **演示页 / 无限画布世界编辑：** 点教师控制器不切换全局层、不抢走场景手势。控制器仍显示，编辑态 inert。运行态（试运行/预览）仍可拖、可点、只改会话。
2. **左栏「全局层」：** 可选择、拖动、缩放全局文字/图片/图形（非控制器走 Native 变换；控制器仍走现有 `commitTeacherControllerAuthoringFrame`）。
3. **图层树：** 场景/本页/世界分组没有控制器。未进入全局层时图层树也不列出控制器。
4. **试运行 / 整课预览：** Slide 与 Spatial 文字表现与编辑态一致（node.style + runs）。Flow 正文已有 runs，不回退。
5. **流式讲义稿纸图片：** 选中后可替换素材、改 alt/caption、改 `layout`（`content-width` / `wide` / `full-width`）、删除。不做环绕。
6. **无限画布视频：** 世界 scope 下插入写入 sidecar + assets；当前位置试运行与整课预览都能出现可 `controls` 的 HTML `<video>`，不依赖 SVG foreignObject。

## 并行图（文件防火墙，禁止抢同一文件）

```text
Q1  控制器 inert + 图层列表     ─┐
Q2  全局 Native 变换/内容写入    ─┤  无共同允许文件
Q3  Slide 试运行文字 runs        ─┤
Q4  Flow 稿纸图片基础编辑        ─┤
Q5  Spatial 视频 URL + HTML 播放 ─┘
```

| 卡 | 症状 | 允许热点 | 禁止 |
|---|---|---|---|
| [Q1](Q1_CONTROLLER_INERT.md) | 1、5 | `v9TeacherControllerAuthoring.ts`, `spatialWorldAuthoring.ts`, `NodesTab.tsx` | `Workspace.tsx`, `editorStore.ts` |
| [Q2](Q2_GLOBAL_NATIVE_TRANSFORM.md) | 2、全局文字写不进 | `workspaceSlideAuthoring.ts`, `slideEditorCommands.ts`, `slideAuthoringBackend.ts`, `v9SlideContentCommands.ts` | 控制器 frame 命令、Phaser |
| [Q3](Q3_PUBLISHED_TEXT_RUNS.md) | 3（Slide） | 新建 `publishedNativeText.ts`, `SlidePublishedAdapter.ts` | SpatialHost、FlowHost |
| [Q4](Q4_FLOW_IMAGE_EDIT.md) | 4 | `PropertiesTab.tsx` 仅 FlowBlockProperties, `FlowWorkspace.tsx` 仅 media 块, `flowEditorCommands.ts` 仅增量 | overlay 手势、P3 blob src |
| [Q5](Q5_SPATIAL_VIDEO.md) | 6、7 的 Spatial 部分 | `SpatialSurfaceHost.ts`, `spatialLocationTryRun.ts`, `spatialEditorCommands.ts` 仅 video insert | `editorStore.ts`, SVG 路径/关系 |

父代理负责：合入、复检。Q1–Q5 已合入集成分支后的接线走 [Q6](Q6_ADD_VIDEO_NODE.md)、[Q7](Q7_FLOW_FILE_REPLACE.md)、[Q8](Q8_E2E_CONTROLLER_LIST.md)，不要重做 Q1–Q5。

## 合入顺序

Q1–Q5 已合入集成分支。Q6–Q8 无共同允许文件，可同时从 **同一 docs HEAD**（`origin/cursor/editor-q-stability-489b`）分 worktree。建议合入顺序：Q6 → Q7 → Q8（无代码依赖，仅便于复检）。

## 验证

每卡只跑自己的「最小验证」。禁止 `npm test` / e2e / desktop。Q8 只改 e2e 断言，不跑 Playwright。

## 12.8 合入后接线（Q6–Q8，并行）

Q1–Q5 修的是命令与宿主。教师按钮仍有三处缺口，文件互斥如下：

```text
Q6  addVideoNode 空间插入        editorStore.ts 仅该函数空间分支
Q7  Flow 从文件替换稿纸媒体      flowEditorCommands + PropertiesTab 媒体段
Q8  e2e 图层树控制器行           tests/e2e/editor.spec.ts + componentCatalogMatrix.spec.ts
```

不要抢 `App.tsx`。Q7 用属性面板隐藏 `input[type=file]` + `applyFlowCommand(..., { sidecar })`，不改 store。
