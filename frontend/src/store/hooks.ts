import { useDispatch, useSelector, type TypedUseSelectorHook } from 'react-redux';
import type { AppDispatch, RootState } from './store';

// Typed wrappers over the plain react-redux hooks — use these instead of
// bare useDispatch/useSelector everywhere so state/action types flow
// through without re-annotating at every call site.
export const useAppDispatch: () => AppDispatch = useDispatch;
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;
