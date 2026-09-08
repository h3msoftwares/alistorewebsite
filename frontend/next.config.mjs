import bundleAnalyzer from '@next/bundle-analyzer';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    loader: 'custom',
    loaderFile: './src/lib/imagekit-loader.ts',
    // Tuned to this app's actual breakpoints/variants (see lib/imagekit-url.ts's
    // IMAGE_VARIANTS) rather than Next's generic defaults, so the srcset widths
    // next/image generates for a `sizes`-annotated image line up with sizes
    // ImageKit (and its CDN cache) actually sees repeated across the site —
    // nothing here ever needs to go past the 2000px zoom variant.
    deviceSizes: [400, 600, 828, 1080, 1200, 1920, 2000],
    imageSizes: [80, 120, 160, 256, 300],
  },
};

// `ANALYZE=true npm run build` (or `npm run analyze`) emits the interactive
// treemap reports under .next/analyze/ — use it to confirm the storefront
// chunk stays lean (no admin-only Recharts / analytics kit leaking in).
const withBundleAnalyzer = bundleAnalyzer({ enabled: process.env.ANALYZE === 'true' });

export default withBundleAnalyzer(nextConfig);
