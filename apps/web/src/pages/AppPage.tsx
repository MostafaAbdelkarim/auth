import { useNavigate } from 'react-router';
import { Button } from '../components/ui/Button';
import { useLogout, useMe } from '../features/auth/hooks';

export function AppPage() {
  const { data: user } = useMe();
  const logout = useLogout();
  const navigate = useNavigate();

  const onLogout = () =>
    logout.mutate(undefined, { onSettled: () => navigate('/signin', { replace: true }) });

  return (
    <div className="min-h-dvh">
      <header className="border-b border-slate-200 bg-white/70 backdrop-blur dark:border-slate-800 dark:bg-slate-900/70">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
          <span className="font-semibold text-slate-900 dark:text-white">Easy Auth</span>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-slate-600 sm:inline dark:text-slate-400">
              {user?.email}
            </span>
            <Button
              variant="secondary"
              className="!w-auto"
              onClick={onLogout}
              loading={logout.isPending}
            >
              Log out
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-16 text-center">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl dark:text-white">
          Welcome to the application.
        </h1>
        {user && (
          <p className="mt-4 text-lg text-slate-600 dark:text-slate-400">
            Signed in as{' '}
            <span className="font-medium text-slate-900 dark:text-white">{user.name}</span>
          </p>
        )}
      </main>
    </div>
  );
}
