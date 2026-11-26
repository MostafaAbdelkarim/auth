import { Link } from 'react-router';

export function NotFoundPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Page not found</h1>
      <Link
        to="/"
        className="font-semibold text-indigo-600 hover:text-indigo-500 dark:text-indigo-400"
      >
        Go home
      </Link>
    </main>
  );
}
