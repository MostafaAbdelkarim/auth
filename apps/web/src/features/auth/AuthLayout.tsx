import type { ReactNode } from 'react';

export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div
            aria-hidden="true"
            className="mx-auto mb-4 grid size-12 place-items-center rounded-xl bg-indigo-600 text-xl font-bold text-white shadow-lg shadow-indigo-600/30"
          >
            ✓
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            {title}
          </h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">{subtitle}</p>
        </div>
        <div className="rounded-2xl bg-white/80 p-6 shadow-xl ring-1 ring-slate-900/5 backdrop-blur sm:p-8 dark:bg-slate-900/80 dark:ring-white/10">
          {children}
        </div>
        <p className="mt-6 text-center text-sm text-slate-600 dark:text-slate-400">{footer}</p>
      </div>
    </main>
  );
}
