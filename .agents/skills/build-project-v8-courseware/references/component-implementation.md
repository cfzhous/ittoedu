# Component 实现

同时读取 Capability Index 的 `components.packageAdmission` 与组件快照。只有真实 `available`、许可已验证、维护人已指定且 `releaseBlockers` 为空的 `stable` 组件可直接进入正式交付；`experimental` 必须成为课例中的显式人类决策，并保留质量、许可证、维护人和 release blocker，不能描述为稳定、可商用或发布就绪。当前目录若没有满足条件的包，改用 native/Runtime/Hybrid，不能为通过构建而静默带入实验组件。

新组件只在行为重复、Props 边界稳定、独立版本和生命周期有价值时创建。一次性完整场景继续使用 Runtime/Hybrid。

所有稳定可见文字位于 `props.content`，可替换素材和关键参数由 manifest 公开。隐藏页用 `editor.pages + previewPageProp` 暴露作者视图；画布文字入口使用当前 Component API 4 的显式协议。记录 create/update/resize/visibility/suspend/resume/capture/destroy、静态后备、错误隔离和作用域。

组件必须校验、复制、锁定版本与双哈希并嵌入 `.h5lesson`；成品不能依赖外部 catalog 路径。
