/** Human-facing order number, e.g. AS-20260902-4821. Not used as a DB key. */
export function generateOrderNumber(): string {
  const date = new Date();
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `AS-${y}${m}${d}-${rand}`;
}
