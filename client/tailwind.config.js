const v = (n) => `rgb(var(--${n}) / <alpha-value>)`;
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        // All colors resolve through CSS variables (see index.css) so light and dark share class names.
        ink: { DEFAULT: v('ink'), soft: v('ink-soft'), mute: v('ink-mute') },
        surface: v('surface'),
        sunken: v('sunken'),
        cream: { 50: v('surface'), 100: v('sunken'), 200: v('chip'), 300: v('chip-2') },
        chili: { 50: v('chili-50'), 100: v('chili-100'), 500: v('chili-500'), 600: v('chili-600'), 700: v('chili-700') },
        turmeric: { 100: v('amber-100'), 400: v('amber-400'), 600: v('amber-600') },
        leaf: { 100: v('leaf-100'), 600: v('leaf-600'), 700: v('leaf-700') },
      },
      fontFamily: {
        sans: ['"Segoe UI"', 'system-ui', '-apple-system', 'Roboto', '"Helvetica Neue"', 'Arial', 'sans-serif'],
        display: ['"Iowan Old Style"', '"Palatino Linotype"', 'Palatino', 'Georgia', 'serif'],
      },
    },
  },
  plugins: [],
};
