# CADB

在 VS Code 中管理多种数据源的扩展：MySQL、Redis、OSS，支持 SQL 执行与查询面板。

+ 驱动管理

![](https://raw.githubusercontent.com/caoaolong/vscode-cadb/refs/heads/master/examples/example2.png)

+ 数据预览

![](https://raw.githubusercontent.com/caoaolong/vscode-cadb/refs/heads/master/examples/example1.gif)

+ **AI 数据库助手**（自然语言查库、主编排计划与 Subagent 轨迹展示、可折叠结果表与复制等）

![](https://raw.githubusercontent.com/caoaolong/vscode-cadb/refs/heads/master/examples/example4.png)

## 功能特性

- **AI 数据库助手**：命令面板执行 **「AI 数据库助手」**（`cadb.ai.openChat`），新会话中选择数据源与数据库后对话；支持 `@` 插表名、会话持久化、流式回复；基于 deepagents 多 Subagent 编排，界面可展示主编排执行计划与当前委派的 Subagent；结果 Markdown 表格可折叠、支持复制为 TSV；代码块与表格复制使用 Codicon 图标按钮。
- **MySQL**：连接数据库，浏览库/表，执行 SQL、解释 SQL，表数据查看与编辑，复制连接信息
- **工作区符号**：`Ctrl+T` / `Cmd+T` 可搜索并快速打开 MySQL 表（仅包含当前「过滤显示」的数据库下的表）
- **Redis**：连接实例，浏览键值，Pub/Sub
- **OSS**：浏览 Bucket/目录与文件，点击文件下载到临时目录后按后缀用默认编辑器打开，支持文件夹下载、清除临时缓存
- **SQL 文件**：`.sql` 查询文件，支持 IntelliSense（表/字段等）、执行与 Explain
- **查询面板**：数据源树、搜索、过滤，右键菜单（编辑、下载、删除、复制连接等）
- 数据源树每次加载均从服务器拉取最新结构，用户设置的「过滤显示的数据库/表」与展开状态会保留

## 使用说明

1. 安装扩展后，左侧活动栏会出现 **CADB** 图标，点击进入「数据源」视图。
2. 点击「新建项」或视图内「+」，选择数据源类型（MySQL / Redis / OSS），按提示配置连接并保存。
3. 展开数据源节点：MySQL 可展开库与表并执行 SQL；Redis 可浏览键与 Pub/Sub；OSS 可展开目录，点击文件会先下载到临时目录再按文件类型打开。
4. 使用 **转到工作区中的符号**（`Ctrl+T` / `Cmd+T`）可搜索 MySQL 表名并回车快速打开表数据。
5. 命令面板（`Ctrl+Shift+P` / `Cmd+Shift+P`）可搜索并执行扩展命令，如「清除 OSS 临时缓存」「选择数据库」「执行 SQL」等。

## 常用命令

| 命令 | 说明 |
|------|------|
| 新建项 | 添加数据源（MySQL/Redis/OSS） |
| 刷新 | 刷新数据源树 |
| 编辑 | 编辑当前节点配置 |
| 下载 | OSS 文件/文件夹下载到本地 |
| 清除 OSS 临时缓存 | 删除 OSS 预览用临时文件 |
| 执行 SQL | 执行当前 SQL |
| 选择数据库 | 切换当前 SQL 执行目标库 |

## DeepAgents 流式 chunk 如何区分 Subagent

本仓库在 `streamMode: ["updates", "messages"]` 下，每个 chunk 为 **`[mode, payload]`**；若本地存在 **`test/agent-stream.txt`**（历史保存的 JSON Lines），可作每行一条 chunk 的对照样例。

1. **`messages` 分片**：`payload` 为 **`[messageChunk, bundleMetadata]`**。看 **`bundleMetadata.checkpoint_ns`**（或 `langgraph_checkpoint_ns`）：
   - **以 `tools:` 开头**（如 `tools:<uuid>|model_request:<uuid>`）→ 来自 **Task 子图内**某 subagent 的模型流式输出。
   - **仅为 `model_request:<uuid>`**、无 `tools:` 前缀 → **顶层主编排**的模型输出。
2. **具体是哪个 subagent**：`messages` 元数据里一般不直接带 subagent 名；需在**时间上靠前**的 **`updates`** 中读取 **`model_request`** 节点下 AI 消息的 **`tool_calls`**，对 **`name === "task"`** 解析 **`args.subagent_type`**。其后直到 **`updates.tools`** 里出现对应 **`ToolMessage`** 为止，带 **`tools:`** 的 `messages` 分片属于该次委派。

更完整的约定说明见 **`.cursor/rules/deepagent-stream-subagents.mdc`**（供后续开发与 AI 会话长期参照）。

从流式 chunk **汇总本次会话 Token 用量**（含与 `usage_metadata` 优先级、按 `chatcmpl` id 去重、可选按 main/subagent 拆分）的步骤见 **`resources/ai-skills/main/deepagent-stream-token-usage/SKILL.md`**。

## 许可证

[MIT](LICENSE) © codingsoul
