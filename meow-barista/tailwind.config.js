/** @type {import('tailwindcss').Config} */
// "Cozy Café" palette: roasted browns, soft cream, pastel mint, warm amber, Fever gold.
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Lilita One"', '"Fredoka"', 'ui-rounded', 'system-ui', 'sans-serif'],
        body: ['"Fredoka"', 'ui-rounded', 'system-ui', 'sans-serif'],
      },
      colors: {
        roast: {
          50: '#fdf6ee', 100: '#f6e7d4', 200: '#ead0b0', 300: '#d9ad80', 400: '#c08a5b',
          500: '#9c6640', 600: '#7c4a2b', 700: '#5c331d', 800: '#3f2214', 900: '#2a160c', 950: '#1a0d07',
        },
        cream: { DEFAULT: '#fff8ec', 100: '#fffdf8', 200: '#fff3df', 300: '#fbe6c6' },
        mint: { 100: '#e6f8ef', 200: '#c8f0dc', 300: '#a1e4c6', 400: '#72d2aa', 500: '#43b98a', 600: '#2c9a6f', 700: '#1f7a57', 800: '#175a41' },
        amber: { glow: '#ffb547' },
        gold: { 200: '#fff1b0', 300: '#ffe27a', 400: '#ffd23f', 500: '#f5b700', 600: '#d29200', 700: '#a86f00' },
        berry: { 300: '#ffb3bd', 400: '#f68b99', 500: '#e8657a', 600: '#c94860', 700: '#9c2f46' },
        sky: { 200: '#cdeeff', 300: '#a6defb', 400: '#74c6f2', 500: '#46a8dd', 600: '#2d86ba' },
        // legacy alias kept so nothing renders unstyled
        mocha: { 50: '#fdf6ee', 100: '#f6e7d4', 300: '#d9ad80', 500: '#9c6640', 700: '#5c331d', 900: '#2a160c' },
        neon: { pink: '#ff4fd8', gold: '#ffd23f', cyan: '#3ff4ff' },
      },
      boxShadow: {
        chunky: '0 4px 0 0 rgba(42,22,12,0.35)',
        glow: '0 0 24px rgba(255,210,63,0.75)',
        soft: '0 10px 30px -10px rgba(42,22,12,0.55)',
      },
    },
  },
  plugins: [],
};
