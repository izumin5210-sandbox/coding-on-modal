# Workflow DevKit (useworkflow.dev) 調査結果

## 概要

Workflow DevKit (WDK) は Vercel が開発した TypeScript 向け durable workflow フレームワーク。
`"use workflow"` / `"use step"` ディレクティブを使い、通常の async/await コードに耐久性を付与する。

- npm: `workflow` (core), `@workflow/next` (Next.js 統合は core に含まれる)
- 最新版: 4.1.0-beta.60 (2026-02 時点)

## Next.js セットアップ

```bash
pnpm add workflow
```

```typescript
// next.config.ts
import { withWorkflow } from "workflow/next";
export default withWorkflow(nextConfig);
```

## Core Concepts

### Workflow 関数 (`"use workflow"`)
- deterministic な orchestrator。サンドボックス環境で実行。
- Node.js API への直接アクセスは制限される。
- replay で再開: すべての step 結果はイベントログに永続化される。

### Step 関数 (`"use step"`)
- 副作用のある処理 (DB, API, File I/O)。フル Node.js アクセス可。
- 結果は永続化され、replay 時はキャッシュから即座に返される。
- 失敗時は自動リトライ（デフォルト 3 回）。`FatalError` でリトライ停止。

### sleep()
`sleep("5s")` でリソース消費なしにワークフロー実行を一時停止。

## Hooks & Webhooks

### createHook()
```typescript
import { createHook } from "workflow";

const hook = createHook<{ approved: boolean }>({
  token: `session:${sessionId}:approval:${toolUseId}` // custom deterministic token
});
const result = await hook; // workflow はここで suspend
```

- カスタム token で外部システムから識別可能にする。
- `AsyncIterable<T>` を実装。`for await...of` で複数ペイロード受信可。
- **注意**: 同一 run 内で同じ token の再利用は不可（hook_conflict になる）。

### resumeHook()
```typescript
import { resumeHook } from "workflow/api";

await resumeHook(token, { approved: true, comment: "OK" });
// → hook_received イベントを生成し、workflow を再開
```

- **workflow 外から呼び出す**（API route, server action から）。
- token が見つからない場合はエラー。

### defineHook()
Zod スキーマによる型安全な hook 定義。

## Workflow 起動

### start()
```typescript
import { start } from "workflow/api";

const run = await start(myWorkflow, [arg1, arg2]);
// → workflow をキューに入れ、即座にリターン
```

- **`runId` オプションは未実装** (GitHub Issue #85)。idempotent な作成はできない。
- 返り値は `Run` オブジェクト（runId, メタデータ含む）。

### getRun()
```typescript
import { getRun } from "workflow/api";
const run = await getRun(runId);
```

### getHookByToken()
```typescript
import { getHookByToken } from "workflow/api";
const hook = await getHookByToken(token);
```

## Worlds (実行環境)

- **Local World**: ローカル開発用。仮想インフラを提供。
- **Vercel World**: 本番用。Vercel の FdI を使用。
- カスタム World の構築も可能（Postgres World の参考実装あり）。

## 本プロジェクトでの設計判断

1. **workflow per prompt**: `start()` に runId がないため、session あたり 1 つの長寿命 workflow ではなく、prompt ごとに新しい workflow run を作成する。
2. **approval hook token**: `session:${sessionId}:approval:${toolUseId}` で deterministic に導出。toolUseId は broker の pending input 情報から取得。
3. **Local World**: まず Local World で開発・検証。
4. **Thread lock**: 既存の `isRunning` フラグで並行実行防止。workflow の最終 step でロック解放。
