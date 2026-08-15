1，不阅读任何文档，纯将 .workflow/outbox 中的所有markdown 前三位数字根据 .workflow/tasks/ 中当前最后一个task 的前三位数字作为基准，按照顺序向后顺延重命名；如，当前tasks 文件夹中的最后一个文件前三位为 018，则将现在的outbox中的文件名依此改为019 020等等。
2，将所有重新命名的markdown移动到 .workflow/tasks中。
确保outbox 中的所有markdown在放入后都是按照原来的顺序追加到当前的tasks 文件夹已有文件的后面的。