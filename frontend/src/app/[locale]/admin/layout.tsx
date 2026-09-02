// TODO: guard this whole subtree with an auth check (STAFF/ADMIN only),
// and give it its own nav (Dashboard / Products / Orders) instead of the
// storefront header — it still imports the same design tokens from
// globals.css (via the root layout) so light/dark mode stays consistent.
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <div className="container">{children}</div>;
}
