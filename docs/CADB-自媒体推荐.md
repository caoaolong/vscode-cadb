# CADB：把数据库装进 VS Code

**CADB** 是一款面向开发者的 VS Code 数据库扩展：侧栏管理连接与对象树，编辑器执行 SQL，底部面板看结果；支持多种数据源与 **AI 数据库助手**（具体以当前版本说明为准）。

- **扩展市场（一键安装）：** <https://marketplace.visualstudio.com/items?itemName=codingsoul.vscode-cadb>  
- **市场搜索：** `CADB` 或 `vscode-cadb`（发布者 **codingsoul**）  
- **开源仓库（MIT）：** <https://github.com/caoaolong/vscode-cadb>

---

写后端、跑 SQL、查线上库时，很多人习惯在「编辑器 + 独立客户端」之间来回切。**CADB** 把数据源接进你本来就在用的界面，用同一套布局完成「连接 → 浏览 → 执行 → 对照代码」，少切几次窗口。

下图是扩展里的 **驱动管理** 界面（真实运行截图，下同）：

![驱动管理](https://raw.githubusercontent.com/caoaolong/vscode-cadb/refs/heads/master/examples/example2.png)

如果你主要在 **VS Code** 里开发，又经常碰库或对象存储，可以往下看看它支持什么。

## 支持哪些能力？

- **MySQL（含 MariaDB）：** 连接与库表浏览、SQL 执行、表数据查看与编辑、表结构相关操作（以当前版本为准）。
- **SQLite：** 本地文件库，适合脚本与小项目。
- **Redis：** 键值浏览与 Pub/Sub。
- **OSS（S3 兼容）：** Bucket / 目录 / 文件浏览与下载预览。
- **查询面板 + 表格：** 底部集中展示结果，支持过滤等交互。
- **AI 数据库助手：** 自然语言描述需求，协助理解表结构与 SQL 工作流。

**数据预览**（表数据 / 查询结果类界面）示意：

![数据预览](https://raw.githubusercontent.com/caoaolong/vscode-cadb/refs/heads/master/examples/example1.gif)

项目 **开源**，多驱动可扩展；连接支持 **全局 / 工作区**，适配个人与团队协作。建议装好后用你最熟的一条链路连上，跑两条 `SELECT`，侧栏树 + 底部结果面板几分钟就能试出是否顺手。

## AI 数据库助手长什么样？

![AI 数据库助手](https://raw.githubusercontent.com/caoaolong/vscode-cadb/refs/heads/master/examples/example4.png)

界面支持主编排计划、Subagent 轨迹、流式回复与结果表格折叠等（详见扩展说明）。

---

**截图注意：** 请使用测试库或脱敏数据；正文与图片中不要出现真实密码、内网地址与生产连接串。

## 结语

想找「尽量不离开编辑器」的数据库入口，可点上文 **扩展市场链接** 安装；觉得顺手欢迎到 GitHub **Star** 跟踪更新。

**话题标签（按需复制）：** `#VSCode` `#数据库` `#MySQL` `#Redis` `#SQLite` `#对象存储` `#开源` `#程序员` `#效率工具`
