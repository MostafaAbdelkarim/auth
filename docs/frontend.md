# Frontend

React 19 + Vite + TypeScript (strict). Server state lives in TanStack Query, forms use react-hook-form + zod, and styling is Tailwind CSS 4.

## Structure

```
src/
  api/              the ONLY code that talks to the network
    http.ts           request() core + http.get/post/put/patch/delete
    endpoint.ts       defineEndpoint(): declare an endpoint once
    auth.ts           auth endpoints + fetchSession()
    error-codes.ts    mirrors the API's error codes
  features/auth/    pages, zod schemas, hooks, error messages for one feature
  routes/           route table + ProtectedRoute / GuestRoute
  pages/            pages that aren't part of a feature
  components/ui/    small, dependency-free UI primitives
  test/             test helpers (MSW server, handlers, renderApp)
```

As the app grows, add one folder per feature under `features/`. Each holds its pages, hooks, schemas and tests.

## Calling the API

Never call `fetch` directly. Declare each endpoint once:

```ts
// src/api/projects.ts
export const projectsApi = {
  list:   defineEndpoint<{ page?: number }, Project[]>({ method: 'GET', path: '/projects' }),          // input → query string
  create: defineEndpoint<NewProject, Project>({ method: 'POST', path: '/projects' }),                  // input → JSON body
  get:    defineEndpoint<{ id: string }, Project>({
            method: 'GET', path: '/projects/:id',
            toRequest: ({ id }) => ({ pathParams: { id } }),                                           // custom mapping
          }),
};
```

`request()` takes care of the rest:
- **Correlation id:** never sent. The API generates one per request; `ApiError.correlationId` carries it (from `meta.correlationId` or the `X-Correlation-Id` response header), and is undefined when the API never handled the request.
- **Cookies:** sent with `credentials: 'include'`.
- **Envelope:** unwraps `data` from the response.
- **Errors:** turned into a typed `ApiError` with `status`, `code`, `details` and `correlationId`. Network failures get `NETWORK_ERROR`; non-envelope responses (such as a proxy error page) get `UNEXPECTED_RESPONSE`.
- **Expired sessions:** on a `401` it makes one shared refresh call and retries once. Auth endpoints opt out with `retryOnUnauthorized: false`. If the server refuses the refresh (`401`), `request()` notifies `onSessionExpired()` listeners. `ProtectedRoute` listens, clears the query cache and sends a signed-in user to `/signin` with "Your session has expired", then back to the same page after they sign in. A refresh that never got an answer (offline, proxy error) does not sign anyone out.

## Server state: hooks

Wrap endpoints in TanStack Query hooks inside the feature ([`features/auth/hooks.ts`](../apps/web/src/features/auth/hooks.ts)):

```ts
export function useProjects(page: number) {
  return useQuery({ queryKey: ['projects', page], queryFn: () => projectsApi.list({ page }) });
}
export function useCreateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: NewProject) => projectsApi.create(input), // wrap it; don't pass the endpoint directly
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['projects'] }),
  });
}
```

> Always wrap the endpoint in `mutationFn`. TanStack Query passes its own context object as the second argument, which would land in the endpoint's `options`.

The session is the `['auth', 'me']` query (`useMe()`): `null` means signed out.

## Forms

- **One zod schema per form,** in the feature's `schemas.ts`, used through `zodResolver`, with `mode: 'onTouched'`.
- **Mirror the API's rules exactly.** For example, the password policy in [`schemas.ts`](../apps/web/src/features/auth/schemas.ts) matches [`password.ts`](../apps/api/src/common/validation/password.ts). Both sides are tested with the same edge cases.
- **Server errors:** map `ApiError.code` to a field error (`setError`) or a message (`describeAuthError`). Never parse message text.
- **Accessibility:** use `TextField`. It wires up `label`, `aria-invalid` and `aria-describedby`, and `Button` has a `loading` state.

## Routing

- **Protected pages** go under `ProtectedRoute` in [`routes.tsx`](../apps/web/src/routes/routes.tsx).
- **Signed-out-only pages** go under `GuestRoute`.
- **After sign-in,** `GuestRoute` sends the user back to where `ProtectedRoute` found them, following same-app paths only (an open-redirect guard).

## Styling

Tailwind utility classes in JSX, with dark mode through `dark:` variants (the OS setting). Keep primitives in `components/ui/`, and keep feature-specific markup inside the feature.
