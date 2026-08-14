# Component API 4 作者边界

Component 是可复用、可参数化、可版本治理的互动能力包，不是页面模板，也不是“一次性复杂内容”的默认容器。类型和校验真值见 [`componentTypes.ts`](../src/shared/componentTypes.ts) 与 [`componentSchema.ts`](../src/shared/componentSchema.ts)。

## 选择条件

同时满足以下方向才值得组件化：多个课例会复用同一行为职责；输入、输出和作者参数可以稳定声明；能力能脱离某节课的文案和视觉身份；有明确维护与许可边界。否则使用 Native 或课例本地 Runtime 模块。

Component API 4 包包含 manifest、runtime 入口、作者属性声明、素材和缩略图。Project V9 的 `ComponentLayerItem` 只保存包身份、props、frame/order 与可选静态后备；包内容随项目归档，不能依赖相邻组件仓库。

## 统一图层

每个组件实例是一个明确 layer item。DOM、Phaser 或 hybrid 只是实例内部实现，根容器必须受 frame、order、rotation、opacity、visible 和 hit policy 约束。组件不得创建脱离宿主堆叠上下文的全窗 overlay；需要与 Native 内容交错时拆成多个产品层，而不是依赖偶然的 z-index。

## 作者目标

- 所有当前可见教学文字必须通过 props 或 text target 可编辑。
- 普通可替换图片应通过 asset prop/target 可编辑。
- 关键配置通过类型明确的 property 定义暴露。
- 画布命中返回稳定 binding，并由产品生成 `authoringAddress`；内部 session target ID 不作为持久化地址。
- `updateProps`、`updateAssets` 和目标更新应保持实例与当前交互画面，避免无关重建。

组件内部可以保留真正的实现细节，但不能把文案、答案、标签或教师需要调整的参数硬编码在不可达源码中。

## 生命周期与状态

组件实现创建、更新、尺寸变化、显隐、暂停/恢复、确定帧捕获和销毁。inspection 模式冻结副作用并保留当前画面；恢复后继续同一实例。课程级事实通过宿主的有限状态接口协作，不在组件内复制第二套全局进度。

业务事件使用声明的语义名称和 payload。错误与资源释放按实例隔离，一个组件失败不能阻断 surface 导航或其它图层。

## 包完整性与许可

组件归档的内容摘要用于发现包损坏和锁定实际执行依赖，不进入教师审批，也不是签名、权属或许可证证明。第三方包仍需独立确认许可、维护者、来源和发布门槛。

编辑第三方包时先创建工程内可编辑副本，不静默改写原包身份。升级组件版本时明确迁移 props 和作者绑定；旧 Component API 1-3 不进入当前新建路径。

## 导出

网页发布包含 Player 执行需要的代码、props 和素材；这不构成加密。PDF/PPTX/DOCX 对组件使用确定帧捕获、静态后备或明确省略，并记录差异。捕获失败只回退该实例，不能用空白冒充成功。

## 验证清单

- 安装包、归档、移动、保存重开后无需外部源目录。
- Props、文字、图片和关键参数可从编辑器修改，稳定地址跨重开可解析。
- 在统一图层中与 Native/Runtime/控制器正确交错。
- 创建、更新、隐藏、恢复、重播、导出和销毁无重复监听或泄漏。
- 单 HTML/网页包离线可运行，无 CDN 或绝对路径。
- 不含课例专属模板文案；复用价值由至少两个不同课例证明。

当前能力和限制从 [能力卡](../agent-kit/capabilities/index.json) 查询。
