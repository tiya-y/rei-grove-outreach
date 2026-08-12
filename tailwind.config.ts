import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Poppins', 'sans-serif'],
      },
      colors: {
        // REI Grove brand tokens — see rei-grove-webpage-design skill,
        // references/rei-grove-brand-foundations.md
        forest: '#26463D',
        grove: {
          DEFAULT: '#57823C',
          dark: '#1E4D37', // "deep"
          light: '#EAF0E8', // "light-green"
        },
        deep: '#1E4D37',
        mint: '#9FE1CB',
        sage: '#C0DD97',
        brand: {
          DEFAULT: '#57823C',
        },
      },
    },
  },
  plugins: [],
};

export default config;
