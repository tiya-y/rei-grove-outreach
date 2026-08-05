import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        grove: {
          DEFAULT: '#2E7D4F',
          dark: '#1F5A38',
          light: '#E8F3EC',
        },
        brand: {
          DEFAULT: '#2675FF',
        },
      },
    },
  },
  plugins: [],
};

export default config;
