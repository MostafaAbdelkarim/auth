# Auth flows

Sessions use two httpOnly, `SameSite=Strict` cookies. JavaScript never sees either of them.

| Cookie | Contents | Lifetime | Sent to |
|---|---|---|---|
| `access_token` | JWT (HS256) with `sub` (user id), `typ: "access"`, `jti`, `iss`, `aud`, `exp` | 15 min | `/api` |
| `refresh_token` | 32 random bytes (base64url); only its SHA-256 is stored | 7 days | `/api/auth` only |

Code: [`auth.service.ts`](../apps/api/src/auth/auth.service.ts), [`refresh-token.service.ts`](../apps/api/src/auth/refresh-token.service.ts), [`jwt-auth.guard.ts`](../apps/api/src/auth/jwt-auth.guard.ts), [`auth-cookies.ts`](../apps/api/src/auth/auth-cookies.ts).

## Sign up

```mermaid
sequenceDiagram
  participant W as Web app
  participant A as API
  participant M as MongoDB
  W->>A: POST /api/auth/signup {email, name, password}
  A->>A: ValidationPipe (email, name ≥ 3, password policy)
  A->>A: argon2id hash
  A->>M: insert user (unique index on email)
  alt email already used
    M-->>A: duplicate key
    A-->>W: 409 EMAIL_ALREADY_REGISTERED
  else created
    A->>M: insert refresh token (new family)
    A-->>W: 201 {user} + Set-Cookie access_token, refresh_token
  end
```

## Sign in

```mermaid
sequenceDiagram
  participant W as Web app
  participant A as API
  participant M as MongoDB
  W->>A: POST /api/auth/signin {email, password}
  Note over A: throttled: 10/min per IP and 5/min per email
  A->>M: find live user by email (+passwordHash)
  A->>A: argon2id verify (against a dummy hash if the email is unknown → same timing)
  alt wrong email or password
    A-->>W: 401 INVALID_CREDENTIALS (same message for both)
  else ok
    A->>M: insert refresh token (new family)
    A-->>W: 200 {user} + cookies
  end
```

## Calling a protected endpoint, and silent refresh

```mermaid
sequenceDiagram
  participant W as Web app (http.ts)
  participant A as API
  participant M as MongoDB
  W->>A: GET /api/users/me (access cookie)
  A->>A: JwtAuthGuard: signature, iss, aud, typ, exp, jti not denylisted
  alt token expired
    A-->>W: 401 INVALID_ACCESS_TOKEN
    W->>A: POST /api/auth/refresh (one shared call for all pending requests)
    A->>M: atomically consume the refresh token, insert its successor (same family)
    A->>M: user still live? family not revoked meanwhile?
    A-->>W: 200 + rotated cookies
    W->>A: retry GET /api/users/me
  end
  A-->>W: 200 {user}
```

## Refresh-token reuse (theft detection) and parallel tabs

```mermaid
sequenceDiagram
  participant T as Attacker or a second tab
  participant A as API
  participant M as MongoDB
  T->>A: POST /api/auth/refresh with an already-rotated token
  A->>M: token rotated how long ago? family still live?
  alt rotated < 10 s ago and session live (another tab refreshing at the same moment)
    A-->>T: 200 + a successor in the same family
  else older (the token was copied)
    A->>M: revoke the whole family
    A-->>T: 401 INVALID_REFRESH_TOKEN (the real user must sign in again)
    Note over A: warn log: auth.refresh.reuse_detected
  end
```

## Logout

```mermaid
sequenceDiagram
  participant W as Web app
  participant A as API
  participant M as MongoDB
  participant D as TokenDenylist (in memory, Redis in production)
  W->>A: POST /api/auth/logout (both cookies)
  A->>M: revoke the refresh-token family
  A->>D: add(access jti, until its exp)
  A-->>W: 200 + cleared cookies
  Note over W,A: a copied access token now gets 401 SESSION_REVOKED
```

- **Refresh tokens stay in MongoDB.** They live 7 days, so their revocation must survive restarts and be shared across instances. MongoDB is also what enables rotation and theft detection.
- **Access tokens are denylisted.** They're stateless, so the denylist is the only way to revoke one before it expires. Entries live at most 15 minutes.

## Web routing

```mermaid
flowchart LR
  Visit["visit a route"] --> Q{"useMe()<br/>GET /api/users/me"}
  Q -- loading --> Spin["spinner"]
  Q -- "user" --> Prot["/app: welcome page"]
  Q -- "null (401)" --> Guest["/signin or /signup"]
  Q -- "error (5xx / network)" --> Err["error screen + Try again<br/>(an outage is not a sign-out)"]
  Guest -- "signed in" --> Back["back to where ProtectedRoute found you (same-app paths only)"]
```

Code: [`routes/guards.tsx`](../apps/web/src/routes/guards.tsx), [`features/auth/hooks.ts`](../apps/web/src/features/auth/hooks.ts).
