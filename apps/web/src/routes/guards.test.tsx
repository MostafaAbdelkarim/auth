import { act, screen } from '@testing-library/react';
import { http } from 'msw';
import { authApi } from '../api/auth';
import { fail, handlers, jane, ok } from '../test/handlers';
import { renderApp } from '../test/render';
import { server } from '../test/server';

describe('route guards', () => {
  it('sends a signed-out visitor from /app to sign in', async () => {
    server.use(...handlers.signedOut);
    const { router } = renderApp('/app');

    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/signin');
    expect(screen.queryByText(/session has expired/)).not.toBeInTheDocument();
  });

  it('signs the user out when a call fails and the session cannot be refreshed, then brings them back after sign-in', async () => {
    server.use(...handlers.signedIn);
    const { user, router } = renderApp('/app');
    await screen.findByText('Welcome to the application.');

    server.use(
      http.get('*/api/users/me', () => fail(401, 'INVALID_ACCESS_TOKEN')),
      http.post('*/api/auth/refresh', () => fail(401, 'INVALID_REFRESH_TOKEN')),
    );
    await act(() => authApi.me().catch(() => undefined));

    expect(
      await screen.findByText('Your session has expired. Please sign in again.'),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/signin');

    server.use(
      http.post('*/api/auth/signin', () => {
        server.use(...handlers.signedIn);
        return ok({ user: jane });
      }),
    );
    await user.type(screen.getByLabelText('Email'), 'jane@example.com');
    await user.type(screen.getByLabelText('Password'), 'Sup3r$ecret');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText('Welcome to the application.')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/app');
  });

  it('shows an error instead of signing the user out when the API is down', async () => {
    server.use(http.get('*/api/users/me', () => fail(500, 'INTERNAL_ERROR')));
    const { router } = renderApp('/app');

    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn't load your session/i);
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/app');
  });

  it('recovers when the user retries after the API comes back', async () => {
    server.use(http.get('*/api/users/me', () => fail(500, 'INTERNAL_ERROR')));
    const { user } = renderApp('/app');
    await screen.findByRole('alert');

    server.use(...handlers.signedIn);
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('Welcome to the application.')).toBeInTheDocument();
  });

  it('sends a signed-in user from /signin to the app', async () => {
    server.use(...handlers.signedIn);
    renderApp('/signin');
    expect(await screen.findByText('Welcome to the application.')).toBeInTheDocument();
  });

  it('logs out and returns to sign in', async () => {
    server.use(
      ...handlers.signedIn,
      http.post('*/api/auth/logout', () => {
        server.use(...handlers.signedOut);
        return ok(null);
      }),
    );
    const { user, router } = renderApp('/app');

    await user.click(await screen.findByRole('button', { name: 'Log out' }));

    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/signin');
  });
});
