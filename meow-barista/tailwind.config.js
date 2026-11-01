/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Baloo 2"', '"Fredoka"', 'ui-rounded', 'system-ui', 'sans-serif'],
      },
      colors: {
        cream: '#fff6e9',
        mocha: { 50: '#fbf3ea', 100: '#f3e0cb', 300: '#d5a77c', 500: '#9a6440', 700: '#5e3a22', 900: '#2e1b10' },
        neon: { pink: '#ff4fd8', gold: '#ffd23f', cyan: '#3ff4ff' },
      },
      boxShadow: {
        chunky: '0 4px 0 0 rgba(0,0,0,0.25)',
        glow: '0 0 20px rgba(255,210,63,0.8)',
      },
    },
  },
  plugins: [],
};
