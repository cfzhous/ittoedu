# 自适应任务执行

每个任务前检脚本哈希、开发计划哈希、当前 Project 哈希、依赖任务、Capability、允许修改的对象、素材和组件。只加载相关 Scene/State 脚本、计划条目、Task、Capability 子合同与源码。

固定顺序：内容与稳定画面 → 互动与生命周期 → 编辑入口 → 视觉细化 → 静态输出。

任务状态为 `planned → in-progress → implemented → verified`。只有目标场景操作、截图、编辑和导出证据齐全才是 `verified`。并行任务必须声明不重叠的 scene/机制/文件所有权；集成任务统一处理共享状态、导航和最终归档。
