import type { Config } from 'tailwindcss';

export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#101418',
        steel: '#1b232b',
        frost: '#eef2f5',
        ok: '#1f9d55',
        warn: '#d97706',
        danger: '#dc2626',
      },
    },
  },
  plugins: [],
} satisfies Config;
