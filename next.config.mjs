/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  // Fonty pre PDF report sa načítavajú za behu z disku, takže ich Next.js
  // pri trasovaní závislostí sám nenájde a do serverless funkcie by sa
  // nedostali — report by potom padal až v produkcii.
  outputFileTracingIncludes: {
    '/admin/report': ['./src/lib/report/fonts/**'],
  },
  headers: async () => [
    {
      source: '/(.*)',
      headers: [
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      ],
    },
  ],
};
export default nextConfig;
