/** Express 5's route-param types widened to `string | string[]` to support
 *  new wildcard segment behavior (`*splat`-style routes capturing multiple
 *  segments). Every route in this codebase uses plain `:id`-style segments
 *  (checked — no wildcards/optional params), and each is already validated
 *  by the `validate()` middleware's zod `params` schema before the handler
 *  runs, so this just narrows what's already guaranteed to be one string. */
export function paramString(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] : (value as string);
}
