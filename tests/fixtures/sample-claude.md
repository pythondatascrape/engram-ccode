# CLAUDE.md

## What This Is

Acme API is a Go service that handles payment processing and user account management.
Clients authenticate via JWT; the server validates claims and routes requests to the
appropriate backend service.

**Architecture:** Modular monolith. Single Go binary. Postgres for persistence, Redis for sessions.

## Build & Run

```bash
go build -o acme-api ./cmd/api
./acme-api serve --config api.yaml
```

### Tests

```bash
go test ./...                      # all tests
go test ./internal/payments/...    # specific package
go test -race ./...                # race detector
go test -count=1 ./...             # no cache
```

## Project Structure

```
cmd/api/               → main entry point
internal/
  config/              → YAML + env var config loading
  server/              → HTTP server lifecycle and routing
  auth/                → JWT validation, middleware
  payments/            → payment processing logic
  accounts/            → user account management
  db/                  → database access layer (sqlx)
  cache/               → Redis session cache
  events/              → domain event publishing
```

## Code Conventions

### Go Best Practices

- **Error handling:** Return errors, don't panic. Wrap with `fmt.Errorf("context: %w", err)`.
- **Context:** Every public function accepts `context.Context` as first param.
- **Interfaces:** Define where consumed, not where implemented. Keep them small.
- **Naming:** Follow Go conventions. Acronyms all-caps (`HTTPServer`, `JWTClaims`).
- **Concurrency:** Goroutines must be owned. Every goroutine has a clear shutdown path.
- **Testing:** Table-driven tests. Use `testify` for assertions. Test behavior, not implementation.
- **Logging:** Structured logging with `slog`. No `fmt.Println` in production code.

## Key Design Decisions

1. **JWT for auth:** Short-lived tokens, Ed25519 signing, iss/aud claims validated on every request.
2. **sqlx over ORM:** Direct SQL with named params. No magic, readable query plans.
3. **Redis for sessions:** Ephemeral session data only. Nothing persisted in Redis that can't be rebuilt.
4. **Outbox pattern for events:** Events written in same transaction as data, consumed by a separate processor.

## What Not To Do

- Don't use `database/sql` directly — use the `db` package wrapper.
- Don't log PII. Mask account numbers and emails in structured log fields.
- Don't commit secrets. Use `api.yaml` with env var overrides for all credentials.
- Don't skip table-driven tests for anything with more than 2 input variations.
