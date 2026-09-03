import { notFound } from 'next/navigation';

// Catch-all for URLs that don't match any route under /[locale]. Without this,
// Next renders its bare built-in 404 (the root layout here is a top-level
// dynamic segment, so there's no plain app/not-found to compose from). This
// throws into app/[locale]/not-found.tsx, which renders inside the locale
// layout — header, footer, tokens, and the shared EmptyState — with a 404.
export default function CatchAllNotFound() {
  notFound();
}
