# Product Steering

## Purpose
- This product provides a remote development environment built on Modal Sandbox and a management application for that environment.
- Developers run coding agents in this environment to safely edit, validate, and debug code.
- Modal is treated as internal infrastructure, and users should not need to be aware of Modal as the underlying platform.
- Public-facing concepts are standardized on `Session`, and the term `Sandbox` is not used on exposed UI/API surfaces.

## Current Product Scope
- Session creation, listing, detail view, command execution, agent execution, termination, and deletion.
- GitHub login is required, and each user can view/manage only their own Sessions.
- Repository bootstrap supports both public and private GitHub repositories.
- Agent execution is based on Claude Code SDK, concentrating development work into remote execution.

## Terminology
- `Session`: The public term for one runnable development environment.
- `Agent Run`: Prompt execution inside a session through Claude Code SDK.

## User Experience Principles
- Developers can launch a remote development environment from the Web UI and perform implementation/debugging work with coding agents.
- A reproducible environment can be created quickly by specifying repository URL and ref.
- Users should focus on `Session` management without requiring prior knowledge of the underlying infrastructure (Modal).
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
- Support operations where developers enter a session via SSH and run coding agents directly from CLI.
