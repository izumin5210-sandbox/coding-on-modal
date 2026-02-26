# Claude Agent SDK V2 調査結果

## V1 vs V2 比較

### V1 `query()` (採用)
```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";

for await (const message of query({
  prompt,
  options: {
    cwd,
    maxTurns,
    resume: sessionId,
    permissionMode,
    canUseTool,
    spawnClaudeCodeProcess,
  },
})) {
  // SDKMessage を受信
}
```

- `cwd` サポート: あり
- `maxTurns` サポート: あり
- `resume` (セッション継続): あり
- `spawnClaudeCodeProcess`: あり（リモート実行のフック）
- `canUseTool`: あり（permission コールバック）
- `permissionMode`: あり

### V2 (不採用)
- `cwd` 未サポート
- `maxTurns` 未サポート
- `DurableAgent` (`@workflow/ai/agent`) を使った durable agent パターンは存在するが、
  Claude Agent SDK の V2 API 自体がまだ上記の基本パラメータをサポートしていない。

## 本プロジェクトでの設計判断

**V1 `query()` を採用**:
- sandbox 内のブローカーで `query()` をローカル実行する。
- manager-app 側の `spawnClaudeCodeProcess` は不要になる（broker が sandbox 内で直接 Claude を起動するため）。
- `canUseTool` コールバック内で user-feedback tool を検出し、SSE `permission_request` イベントとして workflow に通知。
- ブローカーは `POST /chat/approve` で approval を受け取り、`canUseTool` の Promise を resolve する。

## ブローカーでの query() 使用パターン

```typescript
// broker 内
for await (const message of query({
  prompt,
  options: {
    cwd,
    maxTurns,
    resume: sdkSessionId,
    permissionMode: "bypassPermissions",
    allowDangerouslySkipPermissions: true,
    canUseTool: async (toolName, toolInput, sdkOptions) => {
      if (!isUserFeedbackTool(toolName)) {
        return { behavior: "allow", updatedInput: toolInput, toolUseID: sdkOptions.toolUseID };
      }
      // SSE で permission_request を送信
      // POST /chat/approve で resolve される Promise を返す
      return waitForApproval(toolName, toolInput, sdkOptions);
    },
  },
})) {
  messages.push(message);
  sseStream.write(`data: ${JSON.stringify({ type: "message", message })}\n\n`);
}
```
