import { describe, it, expect } from 'vitest';
import reducer, {
  authenticated,
  loggedOut,
  selectAuthUser,
  selectAuthStatus,
  selectIsAuthenticated,
  selectIsAdmin,
} from './authSlice';
import type { RootState } from '../store';

const user = { id: 'u1', name: 'Ali', email: 'a@x.dev', phone: null, role: 'CUSTOMER' as const };

describe('authSlice', () => {
  it('starts in the loading state with no user', () => {
    const s = reducer(undefined, { type: '@@INIT' });
    expect(s).toEqual({ user: null, status: 'loading' });
  });

  it('authenticated() sets the user and flips status', () => {
    const s = reducer(undefined, authenticated(user));
    expect(s.user).toEqual(user);
    expect(s.status).toBe('authenticated');
  });

  it('loggedOut() clears the user and marks the session as guest', () => {
    const s = reducer({ user, status: 'authenticated' }, loggedOut());
    expect(s).toEqual({ user: null, status: 'guest' });
  });

  it('selectors read the slice', () => {
    const state = { auth: { user: { ...user, role: 'ADMIN' as const }, status: 'authenticated' } } as RootState;
    expect(selectAuthUser(state)?.id).toBe('u1');
    expect(selectAuthStatus(state)).toBe('authenticated');
    expect(selectIsAuthenticated(state)).toBe(true);
    expect(selectIsAdmin(state)).toBe(true);

    const guest = { auth: { user: null, status: 'guest' } } as RootState;
    expect(selectIsAuthenticated(guest)).toBe(false);
    expect(selectIsAdmin(guest)).toBe(false);
  });

  it('STAFF counts as admin, CUSTOMER does not', () => {
    const staff = { auth: { user: { ...user, role: 'STAFF' as const }, status: 'authenticated' } } as RootState;
    expect(selectIsAdmin(staff)).toBe(true);
    const customer = { auth: { user, status: 'authenticated' } } as RootState;
    expect(selectIsAdmin(customer)).toBe(false);
  });
});
