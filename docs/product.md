# Product Steering

## Purpose
- This product provides a remote development environment built on Modal Sandbox and a management application for that environment.
- Developers run coding agents in this environment to safely edit, validate, and debug code.
- Modal is treated as internal infrastructure, and users should not need to be aware of Modal as the underlying platform.
- Public-facing concepts are standardized on `Session`, and the term `Sandbox` is not used on exposed UI/API surfaces.

## Current Product Scope
- Session creation, listing, detail view, command execution, agent execution, termination, and deletion.
- The initial phase is operated with a single fixed user.
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
- Completion of multi-user authentication/authorization.
- Cross-account usage based on shared billing or shared contracts.
- Public offering as a general-purpose PaaS.

## Roadmap Direction
- Add user authentication next and strengthen session isolation.
- Migrate from single-user token operation to user-scoped credential management.
- Expand coding-agent interaction channels beyond Web UI to external chat platforms such as Slack.
- Support operations where developers enter a session via SSH and run coding agents directly from CLI.
