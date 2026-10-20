// default open-next.config.ts file created by @opennextjs/cloudflare
import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import r2IncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache";

export default defineCloudflareConfig({
	// R2 incremental cache: stores ISR-rendered pages in the R2 bucket bound as
	// NEXT_CACHE_R2_BUCKET (see wrangler.jsonc). Pages with a `revalidate` value
	// are cached after the first render and served from R2 on subsequent requests
	// with zero Worker CPU cost, until the revalidate window expires.
	// See https://opennext.js.org/cloudflare/caching for more details
	incrementalCache: r2IncrementalCache,
});
