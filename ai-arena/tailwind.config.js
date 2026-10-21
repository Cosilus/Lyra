/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#0a0b0d',
        surface: '#121417',
        raised: '#191c20',
        line: '#23272d',
        ink: '#ebe9e4',
        muted: '#8a9099',
        accent: { DEFAULT: '#3df5a0', dim: '#1f8f60', soft: 'rgba(61,245,160,0.10)' },
        warn: '#f5c451',
        bad: '#ff6b6b',
      },
      fontFamily: { sans: ['"Inter Variable"', 'Inter', 'system-ui', 'sans-serif'] },
      borderRadius: { xl: '0.875rem' },
      keyframes: {
        rise: { from: { opacity: 0, transform: 'translateY(6px)' }, to: { opacity: 1, transform: 'none' } },
      },
      animation: { rise: 'rise .35s ease-out both' },
    },
  },
  plugins: [],
};
