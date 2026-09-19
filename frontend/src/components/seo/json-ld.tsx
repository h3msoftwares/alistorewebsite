/** Renders one `<script type="application/ld+json">` block. `JSON.stringify`
 *  already escapes `"` and control characters; the one XSS-relevant
 *  character it does NOT escape is `<` — replaced here so a value containing
 *  `</script>` (a product name/description, in principle) can't break out of
 *  the script tag. Server-rendered only (no user interaction), so this is
 *  the one sanitization step actually needed. */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  return (
    // eslint-disable-next-line react/no-danger -- structured data must be raw JSON, not escaped text
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />
  );
}
