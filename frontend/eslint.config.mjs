import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

// eslint-config-next ships native flat config (an array of Linter.Config
// objects) as of this version — no FlatCompat/legacy "extends" bridge
// needed, unlike older eslint-config-next releases.
const config = [
  { ignores: ['.next/**', 'node_modules/**'] },
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    rules: {
      // XSS guard: the app renders plain text only and relies on React's
      // output encoding. `dangerouslySetInnerHTML` opts a subtree out of that
      // — if it's ever needed, it must be a deliberate, reviewed exception,
      // not something that slips in unnoticed.
      'react/no-danger': 'error',
    },
  },
];

export default config;
