const v = (n) => `rgb(var(--${n}) / <alpha-value>)`;
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Colors resolve through CSS variables (see index.css) so the green and blue palettes share class names.
        ink: { DEFAULT: v('ink'), soft: v('ink-soft'), mute: v('ink-mute') },
        surface: v('surface'),
        sunken: v('sunken'),
        mist: { 50: v('surface'), 100: v('sunken'), 200: v('chip'), 300: v('chip-2') },
        // Brand accent: emerald (green palette) or blue (blue palette).
        brand: { 50: v('brand-50'), 100: v('brand-100'), 500: v('brand-500'), 600: v('brand-600'), 700: v('brand-700') },
        // Semantic data colors (never recolored to the brand)
        danger: { 50: v('danger-50'), 100: v('danger-100'), 500: v('danger-500'), 600: v('danger-600'), 700: v('danger-700') },
        warn: { 100: v('warn-100'), 400: v('warn-400'), 600: v('warn-600') },
        ok: { 100: v('ok-100'), 600: v('ok-600'), 700: v('ok-700') },
      },
      fontFamily: {
        sans: ['"Inter Variable"', 'Inter', '-apple-system', 'BlinkMacSystemFont', '"SF Pro Text"', '"Helvetica Neue"', 'Arial', 'sans-serif'],
      },
      boxShadow: {
        // Values live in index.css (--shadow-*) so both palettes share the same class names.
        glass: 'var(--shadow-glass)',
        'glass-lg': 'var(--shadow-glass-lg)',
        'glass-inset': 'var(--shadow-inset)',
      },
      borderRadius: { '2xl': 'var(--r-panel)' },
      backgroundImage: { backdrop: 'var(--backdrop-img)' },
    },
  },
  plugins: [],
};
