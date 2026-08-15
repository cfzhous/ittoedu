# Workflow Context

This file defines cross-task context that every agent should read before
executing a task card. Task cards reference it via `@path .workflow/docs/context.md`
in their "必读" section.

## 必读约定

- Task cards list required reading in a "必读" / "必须先读取这些路径" section.
- Paths are written as `@path .workflow/path/to/file` or `@skill skill-name`.
- Always read listed paths first if they exist; they define the task's
  expectations, conventions, and constraints.
- Headless agent CLI does NOT auto-expand `@path` references. You must
  explicitly `read` them.

## 阻断处理

If you encounter a situation requiring human intervention and must stop
the automation workflow, read `.workflow/skills/block-protocol.md` and
follow its procedure. Do NOT include blocked details in this context file.
