import { Navigate, type RouteObject } from 'react-router';
import { SignInPage } from '../features/auth/SignInPage';
import { SignUpPage } from '../features/auth/SignUpPage';
import { AppPage } from '../pages/AppPage';
import { NotFoundPage } from '../pages/NotFoundPage';
import { GuestRoute, ProtectedRoute } from './guards';

export const routes: RouteObject[] = [
  { path: '/', element: <Navigate to="/app" replace /> },
  {
    element: <GuestRoute />,
    children: [
      { path: '/signin', element: <SignInPage /> },
      { path: '/signup', element: <SignUpPage /> },
    ],
  },
  { element: <ProtectedRoute />, children: [{ path: '/app', element: <AppPage /> }] },
  { path: '*', element: <NotFoundPage /> },
];
