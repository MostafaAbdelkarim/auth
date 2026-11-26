import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useWatch } from 'react-hook-form';
import { Link } from 'react-router';
import { ErrorCode } from '../../api/error-codes';
import { ApiError } from '../../api/http';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { TextField } from '../../components/ui/TextField';
import { AuthLayout } from './AuthLayout';
import { describeAuthError } from './errors';
import { useSignUp } from './hooks';
import { PasswordChecklist } from './PasswordChecklist';
import { signUpSchema, type SignUpInput } from './schemas';

export function SignUpPage() {
  const signUp = useSignUp();
  const {
    register,
    handleSubmit,
    control,
    setError,
    formState: { errors },
  } = useForm<SignUpInput>({
    resolver: zodResolver(signUpSchema),
    mode: 'onTouched',
    defaultValues: { email: '', name: '', password: '' },
  });
  const password = useWatch({ control, name: 'password' });

  // On success GuestRoute sees the new session and redirects (see routes/guards.tsx).
  const onSubmit = handleSubmit((values) =>
    signUp.mutate(values, {
      onError: (error) => {
        if (error instanceof ApiError && error.code === ErrorCode.EMAIL_ALREADY_REGISTERED) {
          setError(
            'email',
            { message: 'An account with this email already exists' },
            { shouldFocus: true },
          );
        }
      },
    }),
  );

  const showAlert =
    signUp.isError &&
    !(signUp.error instanceof ApiError && signUp.error.code === ErrorCode.EMAIL_ALREADY_REGISTERED);

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Sign up to get started."
      footer={
        <>
          Already have an account?{' '}
          <Link
            to="/signin"
            className="font-semibold text-indigo-600 hover:text-indigo-500 dark:text-indigo-400"
          >
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate className="space-y-5">
        {showAlert && <Alert>{describeAuthError(signUp.error)}</Alert>}
        <TextField
          label="Email"
          type="email"
          autoComplete="email"
          error={errors.email?.message}
          {...register('email')}
        />
        <TextField
          label="Name"
          autoComplete="name"
          error={errors.name?.message}
          {...register('name')}
        />
        <TextField
          label="Password"
          type="password"
          autoComplete="new-password"
          error={errors.password?.message}
          hint={<PasswordChecklist password={password} />}
          {...register('password')}
        />
        <Button type="submit" loading={signUp.isPending}>
          Create account
        </Button>
      </form>
    </AuthLayout>
  );
}
