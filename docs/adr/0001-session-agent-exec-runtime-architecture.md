# ADR 0001: Session exec/agent runtime architecture

## Status
Accepted

## Context

This project needs to execute two classes of operations inside a Modal Session runtime:

- `exec`: arbitrary shell commands requested from the UI
- `agent`: Claude Code agent runs via `@anthropic-ai/claude-agent-sdk`

We explored multiple architectures while trying to satisfy all of the following constraints:

- Public API stays Session-centric (`/api/sessions/*`)
- Claude Code runs inside the Session, not on the manager host
- `permissionMode: bypassPermissions` / `--allow-dangerously-skip-permissions` should remain enabled for agent runs
- Avoid a persistent root daemon in the Session if possible
- Make failures diagnosable (stderr surfaced to UI/logs)
- Keep implementation practical on Modal JS SDK (`sandbox.exec`)

Runtime constraints discovered during implementation:

- Claude Code refuses `--allow-dangerously-skip-permissions` when launched as root/sudo
- Modal Sandbox may run with `no_new_privileges`, which prevents `sudo` inside the Session from escalating
- Modal JS SDK `sandbox.exec()` returns a `Promise<ContainerProcess>` with Web Streams, not a Node `ChildProcess`
- Modal JS SDK does not provide a direct per-exec kill API compatible with Claude Agent SDK's `SpawnedProcess.kill()` expectations
- Claude Agent SDK `spawnClaudeCodeProcess` requires a synchronous `SpawnedProcess`-compatible return value

## Options Considered

### A. Persistent HTTP runtime server inside Session (root)

Pros:
- Simple internal API boundary for `exec`/`agent`
- Low per-request startup overhead
- Easy future extension to streaming APIs

Cons:
- Persistent root daemon increases blast radius
- Claude Code bypass-permissions fails under root/sudo
- Server lifecycle/health/PID/log management adds complexity
- Harder to isolate server vs subprocess failures

### B. Persistent HTTP runtime server inside Session (non-root) + user switching helper

Pros:
- Avoids root daemon
- Keeps API-driven internal boundary
- Can separate runtime management user from Session owner user

Cons:
- Non-root process cannot `setuid` (`spawn EPERM`)
- `sudo` fallback can fail under Modal `no_new_privileges`
- Still needs a privileged helper / wrapper
- Highest implementation and operational complexity among considered options

### C. Per-request sandbox-internal CLI (`session-runtime-api` CLI)

Pros:
- No persistent daemon
- Simpler lifecycle than HTTP server
- Good debuggability (single process per request)

Cons:
- Session-side SDK/runtime packaging and artifact deployment overhead
- `agent` still needs user execution and env handling inside Session
- Responsibility split is awkward (`exec`/`agent` orchestration partly inside Session)
- Extra build/copy steps for CLI artifacts

### D. `exec` direct from manager + `agent` manager-side Agent SDK with Modal spawn adapter (Adopted)

Pros:
- `exec` path is the simplest implementation
- Token handling and SDK orchestration stay in `manager-app`
- No persistent Session daemon
- No Session-side npm install for Claude Agent SDK
- Centralized diagnostics and error handling
- Clear responsibility boundary: manager orchestrates, Session executes

Cons:
- Requires custom `SpawnedProcess` adapter (Web Streams -> Node streams/events)
- Agent cancel is best-effort because Modal lacks per-exec kill API
- More adapter complexity than the CLI approach for `agent`

### E. Split CLIs (user-facing CLI + system CLI)

Pros:
- Clean separation of user vs system operations
- Preserves CLI debugging ergonomics

Cons:
- Does not solve manager/session orchestration split for `agent`
- Keeps Session-side SDK/runtime packaging costs
- More moving parts than option D for current scope

## Decision

Adopt **Option D**:

- `exec` runs directly from `manager-app` via Modal `sandbox.exec()`
- `agent` runs from `manager-app` via Claude Agent SDK, with a custom `spawnClaudeCodeProcess` adapter that launches Claude Code inside the Modal Session
- `session-runtime-api` is removed from the `exec`/`agent` execution path (kept in repo for now)

## Why This Was Chosen

Option D gives the best trade-off for the current phase:

- It removes persistent daemon and Session-side CLI deployment complexity
- It keeps the most fragile integration (Claude Agent SDK orchestration) in one place (`manager-app`)
- It preserves `bypassPermissions` while running Claude Code inside the Session as the target Linux user
- It improves observability and error reporting without adding a new privileged in-Session service

The adapter complexity is localized and preferable to the broader complexity of daemon lifecycle management, Session-side SDK packaging, and root/non-root helper designs.

## Consequences

### Positive
- Simpler `exec` path
- Session image no longer needs runtime install of Claude Agent SDK
- Agent stderr handling can be centralized in manager-side logs/errors
- No persistent root daemon in Session

### Negative / Trade-offs
- Maintain a custom Modal `ContainerProcess` -> Claude SDK `SpawnedProcess` adapter
- Agent cancellation is best-effort (pidfile/pgidfile + separate kill exec)
- `apps/session-runtime-api` remains temporarily in the repo but is not used for `exec`/`agent`

## Deferred / Follow-up
- Decide whether to remove or repurpose `apps/session-runtime-api` for system-only commands
- Improve agent run observability / streaming UX in the UI
- Revisit kill semantics if Modal adds per-exec termination APIs
