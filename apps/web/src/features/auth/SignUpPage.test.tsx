import { screen, waitFor, within } from '@testing-library/react';
import { http } from 'msw';
import { renderApp } from '../../test/render';
import { fail, handlers, jane, ok, SERVER_CORRELATION_ID } from '../../test/handlers';
import { server } from '../../test/server';

describe('Sign up page', () => {
  beforeEach(() => server.use(...handlers.signedOut));

  it('shows field errors and sends nothing when the form is invalid', async () => {
    let called = false;
    server.use(http.post('*/api/auth/signup', () => ((called = true), ok({}))));
    const { user } = renderApp('/signup');

    await user.click(await screen.findByRole('button', { name: 'Create account' }));

    expect(await screen.findByText('Email is required')).toBeInTheDocument();
    expect(screen.getByText('Name must be at least 3 characters')).toBeInTheDocument();
    expect(screen.getByText('Password does not meet all the requirements')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Email')).toHaveFocus();
    expect(called).toBe(false);
  });

  it('updates the password checklist while typing', async () => {
    const { user } = renderApp('/signup');
    const checklist = await screen.findByRole('list', { name: 'Password requirements' });

    await user.type(screen.getByLabelText('Password'), 'abc1');

    expect(within(checklist).getByText(/At least one letter/)).toHaveTextContent('(met)');
    expect(within(checklist).getByText(/At least one number/)).toHaveTextContent('(met)');
    expect(within(checklist).getByText(/At least 8 characters/)).toHaveTextContent('(not met)');
    expect(within(checklist).getByText(/special character/)).toHaveTextContent('(not met)');
  });

  it('creates the account and lands on the welcome page', async () => {
    let body: unknown;
    server.use(
      http.post('*/api/auth/signup', async ({ request }) => {
        body = await request.json();
        server.use(...handlers.signedIn);
        return ok({ user: jane }, 201);
      }),
    );
    const { user, router } = renderApp('/signup');

    await user.type(await screen.findByLabelText('Email'), '  Jane@Example.com ');
    await user.type(screen.getByLabelText('Name'), 'Jane Doe');
    await user.type(screen.getByLabelText('Password'), 'Sup3r$ecret');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByText('Welcome to the application.')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/app');
    expect(body).toEqual({ email: 'jane@example.com', name: 'Jane Doe', password: 'Sup3r$ecret' });
  });

  it('sends one request on a double click and shows a spinner while it is pending', async () => {
    let calls = 0;
    let respond: () => void = () => {};
    server.use(
      http.post('*/api/auth/signup', async () => {
        calls += 1;
        await new Promise<void>((resolve) => (respond = resolve));
        return fail(500, 'INTERNAL_ERROR', 'Internal server error');
      }),
    );
    const { user } = renderApp('/signup');

    await user.type(await screen.findByLabelText('Email'), 'jane@example.com');
    await user.type(screen.getByLabelText('Name'), 'Jane Doe');
    await user.type(screen.getByLabelText('Password'), 'Sup3r$ecret');
    const button = screen.getByRole('button', { name: 'Create account' });
    await user.dblClick(button);

    await waitFor(() => expect(button).toBeDisabled());
    expect(button).toHaveAttribute('aria-busy', 'true');
    respond();
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(calls).toBe(1);
    expect(button).toBeEnabled();
  });

  it('marks the email field when the address is already registered', async () => {
    server.use(
      http.post('*/api/auth/signup', () =>
        fail(409, 'EMAIL_ALREADY_REGISTERED', 'Email is already registered'),
      ),
    );
    const { user } = renderApp('/signup');

    await user.type(await screen.findByLabelText('Email'), 'jane@example.com');
    await user.type(screen.getByLabelText('Name'), 'Jane Doe');
    await user.type(screen.getByLabelText('Password'), 'Sup3r$ecret');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(
      await screen.findByText('An account with this email already exists'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');
  });

  it('can reveal the password', async () => {
    const { user } = renderApp('/signup');
    const input = await screen.findByLabelText('Password');
    expect(input).toHaveAttribute('type', 'password');
    await user.click(screen.getByRole('button', { name: 'Show password' }));
    expect(input).toHaveAttribute('type', 'text');
  });

  it('shows a server failure with its reference id, without blaming a field', async () => {
    server.use(
      http.post('*/api/auth/signup', () => fail(500, 'INTERNAL_ERROR', 'Internal server error')),
    );
    const { user } = renderApp('/signup');

    await user.type(await screen.findByLabelText('Email'), 'jane@example.com');
    await user.type(screen.getByLabelText('Name'), 'Jane Doe');
    await user.type(screen.getByLabelText('Password'), 'Sup3r$ecret');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      `Reference: ${SERVER_CORRELATION_ID}`,
    );
    expect(screen.getByLabelText('Email')).not.toHaveAttribute('aria-invalid');
  });
});
