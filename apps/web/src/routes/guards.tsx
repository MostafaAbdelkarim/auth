import { Navigate, Outlet, useLocation } from 'react-router';
import { Alert } from '../components/ui/Alert';
import { Button } from '../components/ui/Button';
import { SESSION_EXPIRED_REASON, useMe, useSessionExpiry } from '../features/auth/hooks';

function FullPageSpinner() {
  return (
    <div role="status" className="flex min-h-dvh items-center justify-center">
      <span className="size-8 animate-spin rounded-full border-4 border-indigo-600 border-r-transparent" />
      <span className="sr-only">Loading…</span>
    </div>
  );
}

function SessionError({ onRetry, retrying }: { onRetry: () => void; retrying: boolean }) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-4">
        <Alert>We couldn't load your session. The server may be unavailable.</Alert>
        <Button onClick={onRetry} loading={retrying}>
          Try again
        </Button>
      </div>
    </main>
  );
}

/**
 * Only signed-in users; others go to sign-in and come back afterwards.
 * A server or network failure is not the same as being signed out, so it gets an error screen.
 * If the session dies while the user is here (any call gets 401 and the refresh is refused),
 * they are sent to sign-in with a notice, and return to this page once signed in again.
 */
export function ProtectedRoute() {
  const { data: user, isPending, isError, refetch, isFetching } = useMe();
  const sessionExpired = useSessionExpiry();
  const location = useLocation();
  if (isPending) return <FullPageSpinner />;
  if (isError) return <SessionError onRetry={() => void refetch()} retrying={isFetching} />;
  if (!user) {
    const state = {
      from: location.pathname,
      ...(sessionExpired && { reason: SESSION_EXPIRED_REASON }),
    };
    return <Navigate to="/signin" replace state={state} />;
  }
  return <Outlet />;
}

/** Only same-app paths are followed, never an absolute or protocol-relative URL. */
function safeRedirectPath(state: unknown): string {
  const from = (state as { from?: unknown } | null)?.from;
  return typeof from === 'string' && from.startsWith('/') && !from.startsWith('//') ? from : '/app';
}

/**
 * Only signed-out users. Once a session exists (including right after signing in or up),
 * send the user back to where ProtectedRoute found them, or to the app.
 * Doing this here, not in the forms, means the redirect can't be lost when the form unmounts.
 */
export function GuestRoute() {
  const { data: user, isPending } = useMe();
  const location = useLocation();
  if (isPending) return <FullPageSpinner />;
  if (user) return <Navigate to={safeRedirectPath(location.state)} replace />;
  return <Outlet />;
}
