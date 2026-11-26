import type { ReactNode } from 'react';

const tones = {
  error: {
    role: 'alert',
    className:
      'bg-red-50 text-red-700 ring-red-200 dark:bg-red-950/50 dark:text-red-300 dark:ring-red-900',
  },
  info: {
    role: 'status',
    className:
      'bg-indigo-50 text-indigo-800 ring-indigo-200 dark:bg-indigo-950/50 dark:text-indigo-200 dark:ring-indigo-900',
  },
} as const;

export function Alert({
  children,
  tone = 'error',
}: {
  children: ReactNode;
  tone?: keyof typeof tones;
}) {
  return (
    <div
      role={tones[tone].role}
      className={`rounded-lg px-4 py-3 text-sm ring-1 ring-inset ${tones[tone].className}`}
    >
      {children}
    </div>
  );
}
