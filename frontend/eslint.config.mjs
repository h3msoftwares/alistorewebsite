import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

// eslint-config-next ships native flat config (an array of Linter.Config
// objects) as of this version — no FlatCompat/legacy "extends" bridge
// needed, unlike older eslint-config-next releases.
const config = [
  { ignores: ['.next/**', 'node_modules/**'] },
  ...nextCoreWebVitals,
  ...nextTypescript,
];

export default config;
