# Product Steering

## Purpose
- This product provides a remote development environment built on Modal Sandbox and a management application for that environment.
- Developers run coding agents in this environment to safely edit, validate, and debug code.
- Modal is treated as internal infrastructure, and users should not need to be aware of Modal as the underlying platform.
- Public-facing concepts are standardized on `Session`, and the term `Sandbox` is not used on exposed UI/API surfaces.

## Current Product Scope
- Session creation, listing, detail view, command execution, agent execution, termination, and deletion.
- Session-scoped Web chat UI for agent interactions, with server-side chat history persistence per Session.
- GitHub login is required, and each user can view/manage only their own Sessions.
- Repository bootstrap supports both public and private GitHub repositories.
- Session bootstrap configures GitHub HTTPS credentials inside each Session so subsequent git operations in the Session can access private GitHub repositories without re-authentication.
- Session bootstrap configures SSH login access using the user's GitHub-registered public keys, and Session detail exposes SSH connection information.
- Agent execution is based on Claude Code SDK, concentrating development work into remote execution.
- Before the first Session launch, users must configure their own Claude API key in a modal and save it for subsequent agent runs.

## Terminology
- `Session`: The public term for one runnable development environment.
- `Agent Run`: Prompt execution inside a session through Claude Code SDK.
- `Session Chat`: The Web chat experience for iterative agent interaction within a Session.

## User Experience Principles
- Developers can launch a remote development environment from the Web UI and perform implementation/debugging work with coding agents.
- A reproducible environment can be created quickly by specifying repository URL and ref.
- Users should focus on `Session` management without requiring prior knowledge of the underlying infrastructure (Modal).
- Claude API key setup should happen in-product with minimal friction, and Session creation should resume immediately after saving.
- Failures should be diagnosable from both API and UI.

## Explicit Non-Goals (Current Phase)
- Role-based permission management beyond owner-only access.
- Organization-based login restriction or allowlist management.
- Cross-account usage based on shared billing or shared contracts.
- Public offering as a general-purpose PaaS.

## Roadmap Direction
- Add explicit session revoke controls and audit trails for authentication events.
- Strengthen long-term credential lifecycle management (token refresh/retry and alerting).
- Expand coding-agent interaction channels beyond Web UI to external chat platforms such as Slack.
- Improve SSH operations with key rotation/re-sync workflows and auditability enhancements.
