const v = (n) => `rgb(var(--${n}) / <alpha-value>)`;
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        // Colors resolve through CSS variables (see index.css) so light and dark share class names.
        ink: { DEFAULT: v('ink'), soft: v('ink-soft'), mute: v('ink-mute') },
        surface: v('surface'),
        sunken: v('sunken'),
        mist: { 50: v('surface'), 100: v('sunken'), 200: v('chip'), 300: v('chip-2') },
        // Brand: blue (primary) with indigo as the secondary backdrop/title hue.
        brand: { 50: v('brand-50'), 100: v('brand-100'), 500: v('brand-500'), 600: v('brand-600'), 700: v('brand-700') },
        // Semantic data colors (never recolored to the brand)
        danger: { 50: v('danger-50'), 100: v('danger-100'), 500: v('danger-500'), 600: v('danger-600'), 700: v('danger-700') },
        warn: { 100: v('warn-100'), 400: v('warn-400'), 600: v('warn-600') },
        ok: { 100: v('ok-100'), 600: v('ok-600'), 700: v('ok-700') },
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', '"SF Pro Display"', '"SF Pro Text"', '"Inter Variable"', 'Inter', '"Helvetica Neue"', 'Arial', 'sans-serif'],
      },
      boxShadow: {
        glass: '0 1px 2px rgba(15,23,42,0.06), 0 10px 18px -8px rgba(15,23,42,0.22), inset 0 1px 0 rgba(255,255,255,0.9)',
        'glass-dark': '0 1px 3px rgba(0,0,0,0.45), 0 12px 22px -8px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.08)',
        'glass-lg': '0 2px 4px rgba(15,23,42,0.08), 0 16px 28px -10px rgba(15,23,42,0.28), inset 0 1px 0 rgba(255,255,255,0.95)',
        'glass-lg-dark': '0 2px 5px rgba(0,0,0,0.5), 0 18px 32px -10px rgba(0,0,0,0.65), inset 0 1px 0 rgba(255,255,255,0.11)',
        'glass-inset': 'inset 0 1px 4px rgba(15,23,42,0.18), inset 0 -1px 0 rgba(255,255,255,0.5)',
        'glass-inset-dark': 'inset 0 1px 4px rgba(0,0,0,0.5), inset 0 -1px 0 rgba(255,255,255,0.05)',
      },
      backgroundImage: {
        'glow-light': 'radial-gradient(120vh circle at 0% 0%, rgba(37,99,235,0.22), transparent 72%), radial-gradient(120vh circle at 100% 0%, rgba(79,70,229,0.18), transparent 72%)',
        'glow-dark': 'radial-gradient(120vh circle at 0% 0%, rgba(37,99,235,0.34), transparent 72%), radial-gradient(120vh circle at 100% 0%, rgba(79,70,229,0.20), transparent 72%)',
      },
    },
  },
  plugins: [],
};
