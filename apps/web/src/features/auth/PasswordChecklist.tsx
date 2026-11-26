import { passwordRules } from './schemas';

export function PasswordChecklist({ password }: { password: string }) {
  return (
    <ul aria-label="Password requirements" className="grid gap-1 text-xs sm:grid-cols-2">
      {passwordRules.map((rule) => {
        const met = rule.test(password);
        return (
          <li
            key={rule.id}
            className={`flex items-center gap-1.5 ${
              met ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            <span aria-hidden="true">{met ? '✓' : '○'}</span>
            {rule.label}
            <span className="sr-only">{met ? '(met)' : '(not met)'}</span>
          </li>
        );
      })}
    </ul>
  );
}
