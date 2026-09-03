import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { AuthUser } from '@/lib/types';
import type { RootState } from '../store';

// The short-lived access token itself lives in src/lib/api/token.ts (read by
// the fetch client). This slice mirrors *who* is signed in, for components.
export type AuthStatus = 'loading' | 'authenticated' | 'guest';

export interface AuthState {
  user: AuthUser | null;
  status: AuthStatus;
}

const initialState: AuthState = {
  user: null,
  status: 'loading', // until the boot refresh resolves
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    authenticated(state, action: PayloadAction<AuthUser>) {
      state.user = action.payload;
      state.status = 'authenticated';
    },
    loggedOut(state) {
      state.user = null;
      state.status = 'guest';
    },
  },
});

export const { authenticated, loggedOut } = authSlice.actions;
export default authSlice.reducer;

// ---- selectors ----
export const selectAuth = (s: RootState) => s.auth;
export const selectAuthUser = (s: RootState) => s.auth.user;
export const selectAuthStatus = (s: RootState) => s.auth.status;
export const selectIsAuthenticated = (s: RootState) => s.auth.status === 'authenticated';
export const selectIsAdmin = (s: RootState) =>
  s.auth.user?.role === 'ADMIN' || s.auth.user?.role === 'STAFF';
