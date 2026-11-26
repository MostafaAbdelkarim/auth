import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Link, useLocation } from 'react-router';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { TextField } from '../../components/ui/TextField';
import { AuthLayout } from './AuthLayout';
import { describeAuthError } from './errors';
import { SESSION_EXPIRED_REASON, useSignIn } from './hooks';
import { signInSchema, type SignInInput } from './schemas';

export function SignInPage() {
  const signIn = useSignIn();
  const location = useLocation();
  const sessionExpired =
    (location.state as { reason?: unknown } | null)?.reason === SESSION_EXPIRED_REASON;
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignInInput>({
    resolver: zodResolver(signInSchema),
    mode: 'onTouched',
    defaultValues: { email: '', password: '' },
  });

  // On success GuestRoute sees the new session and redirects (see routes/guards.tsx).
  const onSubmit = handleSubmit((values) => signIn.mutate(values));

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to your account."
      footer={
        <>
          New here?{' '}
          <Link
            to="/signup"
            className="font-semibold text-indigo-600 hover:text-indigo-500 dark:text-indigo-400"
          >
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate className="space-y-5">
        {signIn.isError ? (
          <Alert>{describeAuthError(signIn.error)}</Alert>
        ) : (
          sessionExpired && (
            <Alert tone="info">Your session has expired. Please sign in again.</Alert>
          )
        )}
        <TextField
          label="Email"
          type="email"
          autoComplete="email"
          error={errors.email?.message}
          {...register('email')}
        />
        <TextField
          label="Password"
          type="password"
          autoComplete="current-password"
          error={errors.password?.message}
          {...register('password')}
        />
        <Button type="submit" loading={signIn.isPending}>
          Sign in
        </Button>
      </form>
    </AuthLayout>
  );
}
