/** Shared shell for not-yet-implemented pages. Keeps every empty page on
 *  the same container/spacing/typography as finished ones, and — when a
 *  department is given — applies that door's compound accent (see
 *  data-department rules in globals.css) so the placeholder itself
 *  previews the section's identity. */
export function PagePlaceholder({
  title,
  department,
  note,
}: {
  title: string;
  department?: 'women' | 'men' | 'kids';
  note?: string;
}) {
  return (
    <div className="container" data-department={department}>
      <div className="page-placeholder">
        <h1>{title}</h1>
        <p>TODO: implement this page.</p>
        {note && <p style={{ fontSize: 'var(--fs-xs)' }}>{note}</p>}
      </div>
    </div>
  );
}
