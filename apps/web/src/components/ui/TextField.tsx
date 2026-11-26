import { useId, useState, type InputHTMLAttributes, type ReactNode, type Ref } from 'react';

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  /** Extra content under the input (e.g. the password checklist). */
  hint?: ReactNode;
  ref?: Ref<HTMLInputElement>;
}

const inputClasses =
  'block w-full rounded-lg border-0 bg-white px-3 py-2.5 text-slate-900 shadow-sm ring-1 ring-inset placeholder:text-slate-400 focus:ring-2 focus:ring-inset sm:text-sm dark:bg-slate-900 dark:text-white';

export function TextField({ label, error, hint, type = 'text', ref, ...props }: TextFieldProps) {
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const [revealed, setRevealed] = useState(false);
  const isPassword = type === 'password';

  const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ');

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-slate-700 dark:text-slate-200">
        {label}
      </label>
      <div className="relative">
        <input
          {...props}
          ref={ref}
          id={id}
          type={isPassword && revealed ? 'text' : type}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy || undefined}
          className={`${inputClasses} ${isPassword ? 'pr-16' : ''} ${
            error
              ? 'ring-red-400 focus:ring-red-500 dark:ring-red-500'
              : 'ring-slate-300 focus:ring-indigo-600 dark:ring-slate-700'
          }`}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setRevealed((value) => !value)}
            aria-label={revealed ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
            aria-pressed={revealed}
            className="absolute inset-y-0 right-0 px-3 text-xs font-semibold text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
          >
            {revealed ? 'Hide' : 'Show'}
          </button>
        )}
      </div>
      {error && (
        <p id={errorId} className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
      {hint && <div id={hintId}>{hint}</div>}
    </div>
  );
}
