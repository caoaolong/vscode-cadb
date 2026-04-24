---
name: deepagent-stream-token-usage
description: 在 deepagents 带 subagents、streamMode 含 messages/updates 时，从流式 chunk 汇总本次会话（及可选按 main/subagent 拆分）的 Token 用量。
---

# deepagent-stream-token-usage

## 适用场景

- `agent.stream(input, { streamMode: ["updates", "messages"] })` 消费二元组 chunk `[mode, payload]`。
- 需要 **本次会话总 input/output/total**，或按 **主编排 / 各 subagent** 拆分用量时。

## 用量出现在哪里（结合 `test/agent-stream.txt`）

1. **`mode === "messages"`**  
   `payload = [messageChunk, bundleMetadata]`。  
   单次模型生成临近结束时，`messageChunk` 上会出现：
   - **`usage_metadata`**（优先）：`input_tokens`、`output_tokens`、`total_tokens`，以及可选的 `input_token_details`（如 `cache_read`）。
   - **`response_metadata.usage`**（OpenAI 形态）：`prompt_tokens`、`completion_tokens`、`total_tokens` 等。  
   同一条流里可能连续多条带同一 `id`（如 `chatcmpl-…`）的 chunk；**带完整数字的 `usage_metadata` 通常出现在生成末尾**（样本约第 13–14 行主编排、第 23–24 行 `tools:` 子图）。

2. **`mode === "updates"` 且存在 `model_request`（或 `model`）**  
   内层 `messages` 里的 AI 消息也可能带 **`usage_metadata` / `response_metadata.usage`**（样本第 15 行）。  
   **注意**：同一 `chatcmpl-*` 上，`response_metadata.usage` 里的 `prompt_tokens` 可能与 `usage_metadata.input_tokens` **不一致**（图内累计 vs 单次调用）。**汇总时以 `usage_metadata` 为准**；仅当没有 `usage_metadata` 时，再退回用 `prompt_tokens` / `completion_tokens` 作为 input/output 的估计。

3. **中间分片**  
   大量 chunk 的 `response_metadata.usage` 为空对象 `{}`，**不可累加**，否则会误判。

## 会话总用量算法（推荐）

1. 维护 `Map<completionId, { input, output, total }>`，`completionId` 取消息上的 **`kwargs.id` / `id`**（`chatcmpl-…` 或等价）。
2. 遍历每个 chunk：
   - **`messages`**：从 `payload[0]` 解析用量；若有 **`usage_metadata`** 且 `total_tokens` 为有效数字，则 **`map.set(id, { input, output, total })`**（后写覆盖先写，同 id 多段重复时结果一致）。
   - **`updates`** → `model_request.messages`（及兼容 `model`）：对其中每条 AI 类消息同样解析并 **`set`** 同一 map（与流式末尾为同一 id 时去重，只保留最后一次写入；若仅 updates 出现该 id，也能记入）。
3. **会话合计**：`sumInput = Σ v.input`，`sumOutput = Σ v.output`，`sumTotal = Σ v.total`（或用 `sumInput + sumOutput` 校验，注意与 `total` 是否含缓存计费以厂商为准）。
4. **不要用** `response_metadata.usage.total_tokens` 与 **`usage_metadata`** 混加；同一 id **只保留一套**以 `usage_metadata` 为主。

## 按 main / subagent 拆分（可选）

与「Subagent 归属」规则相同：

- `payload[1].checkpoint_ns` **不以 `tools:` 开头** → 本条 `messages` 用量记入 **main**。
- **以 `tools:` 开头** → 记入当前 **`task` 已解析的 `subagent_type`**（需在处理 `updates.model_request` 时维护 `pendingSubagent`，在 `updates.tools` 的 `task` ToolMessage 后清除）。

对每个 `(completionId)` 可同时打上 `agentKey`（`main` / `hello_agent` / …），再按 `agentKey` 对 `input`/`output` 分组求和（**注意**：同一 subagent 多次调用会产生多个 completion id，分组相加即可）。

## 实现提示（TypeScript）

- 从 LangChain 序列化对象读取：`msg.kwargs?.usage_metadata`、`msg.kwargs?.response_metadata?.usage`、`msg.kwargs?.id`。
- 运行时类实例：可能为顶层 `usage_metadata` / `id`，需同时兼容。
- 若无 `usage_metadata`，用 `prompt_tokens`/`completion_tokens` 映射到 input/output 再写入 map。

## 限制

- 用量以 **提供方返回的计费字段** 为准；子图与主编排各自一次 completion 对应一条 `chatcmpl-*`，**会话总量 = 各次 completion 之和**。
- 框架或提供商升级后字段名可能变化，应以实际 chunk 为准做抽样回归。
