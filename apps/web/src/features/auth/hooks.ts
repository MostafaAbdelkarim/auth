import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { authApi, fetchSession, type User } from '../../api/auth';
import { onSessionExpired } from '../../api/http';
import type { SignInInput, SignUpInput } from './schemas';

export const meQueryKey = ['auth', 'me'] as const;

/** Router state `reason` that makes the sign-in page explain why the user is there. */
export const SESSION_EXPIRED_REASON = 'session_expired';

export function useMe() {
  return useQuery({ queryKey: meQueryKey, queryFn: fetchSession, staleTime: 5 * 60 * 1000 });
}

function useSetUser() {
  const queryClient = useQueryClient();
  return (user: User | null) => queryClient.setQueryData(meQueryKey, user);
}

/** Drops every cached query (they belong to the old session) and marks the user signed out. */
function endLocalSession(queryClient: QueryClient) {
  queryClient.clear();
  queryClient.setQueryData(meQueryKey, null);
}

export function useSignUp() {
  const setUser = useSetUser();
  return useMutation({
    mutationFn: (input: SignUpInput) => authApi.signUp(input),
    onSuccess: ({ user }) => setUser(user),
  });
}

export function useSignIn() {
  const setUser = useSetUser();
  return useMutation({
    mutationFn: (input: SignInInput) => authApi.signIn(input),
    onSuccess: ({ user }) => setUser(user),
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => authApi.logout(),
    // Even if the server call fails, the local session must end.
    onSettled: () => endLocalSession(queryClient),
  });
}

/**
 * Signs the user out locally when any API call finds the session dead (401 and the refresh was
 * refused). Returns true once that happened, so the caller can tell the user why.
 * Visitors who were never signed in are not "expired": their 401s are ignored here.
 */
export function useSessionExpiry(): boolean {
  const queryClient = useQueryClient();
  const [expired, setExpired] = useState(false);
  useEffect(
    () =>
      onSessionExpired(() => {
        if (!queryClient.getQueryData(meQueryKey)) return;
        setExpired(true);
        endLocalSession(queryClient);
      }),
    [queryClient],
  );
  return expired;
}
