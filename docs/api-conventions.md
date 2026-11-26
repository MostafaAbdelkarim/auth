# API conventions

## Routes

| Method | Path | Auth | Success | Error codes |
|---|---|---|---|---|
| POST | `/api/auth/signup` | public | `201 { user }` + cookies | `VALIDATION_FAILED`, `EMAIL_ALREADY_REGISTERED`, `TOO_MANY_REQUESTS` |
| POST | `/api/auth/signin` | public | `200 { user }` + cookies | `VALIDATION_FAILED`, `INVALID_CREDENTIALS`, `TOO_MANY_REQUESTS` |
| POST | `/api/auth/refresh` | refresh cookie | `200 null` | `INVALID_REFRESH_TOKEN`, `SESSION_REVOKED` |
| POST | `/api/auth/logout` | either cookie | `200 null` | |
| GET | `/api/users/me` | access cookie | `200 user` | `AUTHENTICATION_REQUIRED`, `INVALID_ACCESS_TOKEN`, `SESSION_REVOKED` |
| GET | `/api/health` | public | `200` | `SERVICE_UNAVAILABLE` |
| GET | `/api/docs` | Basic auth | Swagger UI | |

## The response envelope: always this shape

```jsonc
// success: produced by ResponseEnvelopeInterceptor from whatever the handler returns
{ "success": true, "data": { … }, "meta": { "correlationId": "<uuid v4>", "timestamp": "…" } }

// error: produced by AllExceptionsFilter from whatever was thrown
{ "success": false,
  "error": { "statusCode": 400, "code": "VALIDATION_FAILED", "message": "Request validation failed",
             "details": ["Name must be at least 3 characters"] },
  "meta": { "correlationId": "<uuid v4>", "timestamp": "…", "path": "/api/auth/signup" } }
```

- **Handlers return plain data.** Never build the envelope yourself.
- **Clients branch on `error.code`.** Codes are a stable enum ([`error-codes.ts`](../apps/api/src/common/http/error-codes.ts), mirrored in [`apps/web/src/api/error-codes.ts`](../apps/web/src/api/error-codes.ts)). Messages are for humans and may change.
- **`details`** appears only for validation errors: one message per failed rule.
- **Unknown errors** become `500 INTERNAL_ERROR` with a generic message. The real error is logged, never sent.

## Throwing errors

```ts
// Use AppException with a specific code when the client should react to it:
throw AppException.conflict(ErrorCode.EMAIL_ALREADY_REGISTERED, 'Email is already registered');
throw AppException.unauthorized(ErrorCode.INVALID_CREDENTIALS, 'Invalid email or password');

// Nest's built-in exceptions also work; their code is derived from the status (404 → NOT_FOUND).
throw new NotFoundException('Project not found');
```

To add a code, add it to the API's `ErrorCode` enum and, if the web app reacts to it, to the web's `ErrorCode` too.

## Checklist: adding an endpoint

1. **Module.** Use an existing module, or `nest g module <name>` plus `controller`/`service`, and register it in `AppModule`.
2. **DTO.** One class per body, with class-validator rules and `@ApiProperty`. Unknown fields are rejected automatically (`whitelist` + `forbidNonWhitelisted`). Normalise inputs with the `trim` / `normalizeEmail` transforms.
3. **Controller.**
   - Routes are **protected by default**. Add `@Public()` only if anonymous access is intended.
   - Get the caller with `@CurrentUser() user: AuthUser`.
   - Return data, not the envelope, and map documents to a public type.
4. **Swagger.** Document success with `@ApiSuccessResponse(Model)` and each error with `@ApiResponse({ status, type: ErrorResponse, description: 'CODE' })`.
5. **Rate limiting.** The default throttler (120/min per IP) applies automatically. Credential-style endpoints need a stricter named throttler (see `app.module.ts`).
6. **Logging.** Use `AppLogger` for domain events (see [Logging and tracing](logging-and-tracing.md)).
7. **Tests.**
   - An e2e test for the happy path, each error code, auth (no cookie gives 401) and validation.
   - Unit tests for service logic that the e2e tests can't reach.
   - Run `make test`; coverage must stay at 95% or above.
8. **Web.** Declare the endpoint once with `defineEndpoint` (see [Frontend](frontend.md)).

### Example

```ts
@ApiTags('projects')
@ApiCookieAuth('access_token')
@Controller('projects')
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get(':id')
  @ApiSuccessResponse(PublicProject)
  @ApiResponse({ status: 404, type: ErrorResponse, description: 'NOT_FOUND' })
  async findOne(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<PublicProject> {
    return this.projects.findOwned(user.id, id); // scope every query to the caller
  }
}
```

## Naming and style

| Thing | Convention | Example |
|---|---|---|
| Files | kebab-case, with a suffix by role | `refresh-token.service.ts`, `sign-up.dto.ts` |
| Classes | PascalCase + role | `UsersService`, `SignUpDto`, `JwtAuthGuard` |
| Routes | plural nouns, kebab-case; actions as sub-paths only when not CRUD | `/api/users/me`, `/api/auth/refresh` |
| Error codes | SCREAMING_SNAKE, describes the condition | `EMAIL_ALREADY_REGISTERED` |
| Log events | `domain.action.outcome` | `auth.signin.failed` |
| Config | env vars validated in [`env.ts`](../apps/api/src/config/env.ts), injected with `@InjectAppConfig()`; never read `process.env` elsewhere | |
