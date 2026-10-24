export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: '#2a1b12', soft: '#5b4637', mute: '#7a6553' },
        cream: { 50: '#fffaf1', 100: '#fbf0dc', 200: '#f3e0bd', 300: '#e8cb97' },
        chili: { 50: '#fdeee9', 100: '#f9d6cb', 500: '#c4452a', 600: '#a8361d', 700: '#8a2b16' },
        turmeric: { 100: '#fbe9b8', 400: '#e5a823', 600: '#a97a0a' },
        leaf: { 100: '#dcebd2', 600: '#3f7a2c', 700: '#2f5f20' },
      },
      fontFamily: {
        sans: ['"Segoe UI"', 'system-ui', '-apple-system', 'Roboto', '"Helvetica Neue"', 'Arial', 'sans-serif'],
        display: ['"Iowan Old Style"', '"Palatino Linotype"', 'Palatino', 'Georgia', 'serif'],
      },
      boxShadow: {
        glass: '0 1px 0 rgba(255,255,255,.7) inset, 0 8px 28px -12px rgba(90,50,20,.28)',
      },
    },
  },
  plugins: [],
};
