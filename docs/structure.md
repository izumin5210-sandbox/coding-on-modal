# Structure Steering

## Repository Layout
- `apps/manager-app`: Main implementation of Session management UI and APIs.
- `docs`: Steering documents for product, technology, and structure.

## Manager App Structure
- `apps/manager-app/src/app/page.tsx`: Session list/create/execute and agent operation UI.
- `apps/manager-app/src/app/api/sessions/*`: Session CRUD / execute / agent execution APIs.
- `apps/manager-app/src/server/sessions/service.ts`: Core session lifecycle and execution logic.
- `apps/manager-app/src/server/modal/*`: Modal Sandbox image and launch configuration.
- `apps/manager-app/src/server/env.ts`: Required environment variable schema.
- `apps/manager-app/src/lib/session-types.ts`: Shared UI/API type definitions.

## Responsibility Boundaries
- UI layer: Input/output handling and user interaction orchestration.
- API layer: HTTP boundary, validation, and error handling.
- Service layer: Session state transitions, Modal execution, and Agent SDK invocation.
- Infra layer: Modal image construction and external service integration.

## Naming & Evolution Rules
- Keep `Session` naming for new user-facing features, and confine `Sandbox` to implementation details.
- Share JSON contracts via types in `src/lib` across UI/API.
- For requirement changes, update `docs/product.md` first; for technical decision changes, update `docs/tech.md` first.
