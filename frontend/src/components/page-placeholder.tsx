import { Hammer } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';

/** Shared shell for not-yet-implemented routes. Keeps every empty page on the
 *  same container / spacing / typography as finished ones, and — when a
 *  storefront collection slug is given — applies that door's compound accent
 *  (see data-collection rules in globals.css) so the placeholder previews the
 *  section's identity. Real empty states (empty cart, no orders) should use
 *  <EmptyState> directly instead of this. */
export function PagePlaceholder({
  title,
  collection,
  note,
}: {
  title: string;
  collection?: string;
  note?: string;
}) {
  return (
    <div className="container section" data-collection={collection}>
      <EmptyState icon={Hammer} title={title} body={note ?? 'This page is not built yet.'} />
    </div>
  );
}
