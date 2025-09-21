// tailwind.config.js
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)',
        card: 'var(--card)',
        card2: 'var(--card2)',
        text: 'var(--text)',
        muted: 'var(--muted)',
        stroke: 'var(--stroke)',
        'primary-bg': 'var(--primary-bg)',
        'primary-text': 'var(--primary-text)',
      },
      keyframes: {
        'fade-in-up': {
          '0%': { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-in-up': 'fade-in-up 200ms ease-out',
      },
      borderColor: {
        stroke: 'var(--stroke)',
      },
    },
  },
  plugins: [],
};