import { screen, waitFor } from '@testing-library/react';
import { http } from 'msw';
import { renderApp } from '../../test/render';
import { fail, handlers, jane, ok } from '../../test/handlers';
import { server } from '../../test/server';

describe('Sign in page', () => {
  beforeEach(() => server.use(...handlers.signedOut));

  it('shows a generic error for wrong credentials', async () => {
    server.use(
      http.post('*/api/auth/signin', () =>
        fail(401, 'INVALID_CREDENTIALS', 'Invalid email or password'),
      ),
    );
    const { user } = renderApp('/signin');

    await user.type(await screen.findByLabelText('Email'), 'jane@example.com');
    await user.type(screen.getByLabelText('Password'), 'wrong');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password.');
  });

  it('tells the user to wait when rate limited', async () => {
    server.use(http.post('*/api/auth/signin', () => fail(429, 'TOO_MANY_REQUESTS')));
    const { user } = renderApp('/signin');

    await user.type(await screen.findByLabelText('Email'), 'jane@example.com');
    await user.type(screen.getByLabelText('Password'), 'whatever');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/Too many attempts/);
  });

  it('signs in and shows the welcome page', async () => {
    server.use(
      http.post('*/api/auth/signin', () => {
        server.use(...handlers.signedIn);
        return ok({ user: jane });
      }),
    );
    const { user } = renderApp('/signin');

    await user.type(await screen.findByLabelText('Email'), 'jane@example.com');
    await user.type(screen.getByLabelText('Password'), 'Sup3r$ecret');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText('Welcome to the application.')).toBeInTheDocument();
    expect(screen.getByText('Jane Doe')).toBeInTheDocument();
  });

  it('sends one request on a double click and shows a spinner while it is pending', async () => {
    let calls = 0;
    let respond: () => void = () => {};
    server.use(
      http.post('*/api/auth/signin', async () => {
        calls += 1;
        await new Promise<void>((resolve) => (respond = resolve));
        return fail(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
      }),
    );
    const { user } = renderApp('/signin');

    await user.type(await screen.findByLabelText('Email'), 'jane@example.com');
    await user.type(screen.getByLabelText('Password'), 'wrong');
    const button = screen.getByRole('button', { name: 'Sign in' });
    await user.dblClick(button);

    await waitFor(() => expect(button).toBeDisabled());
    expect(button).toHaveAttribute('aria-busy', 'true');
    respond();
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(calls).toBe(1);
    expect(button).toBeEnabled();
  });

  it('shows a notice when the user was sent here because their session expired', async () => {
    renderApp({ pathname: '/signin', state: { from: '/app', reason: 'session_expired' } });

    expect(
      await screen.findByText('Your session has expired. Please sign in again.'),
    ).toHaveAttribute('role', 'status');
  });

  it.each([
    ['the page the user came from', '/somewhere-else', '/somewhere-else'],
    ['/app instead of an external URL', '//evil.example', '/app'],
  ])('after sign-in, returns to %s', async (_case, from, expected) => {
    server.use(
      http.post('*/api/auth/signin', () => {
        server.use(...handlers.signedIn);
        return ok({ user: jane });
      }),
    );
    const { user, router } = renderApp({ pathname: '/signin', state: { from } });

    await user.type(await screen.findByLabelText('Email'), 'jane@example.com');
    await user.type(screen.getByLabelText('Password'), 'Sup3r$ecret');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => expect(router.state.location.pathname).toBe(expected));
  });
});
