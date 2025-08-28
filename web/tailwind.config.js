/** @type {import('tailwindcss').Config} */
const colors = require('tailwindcss/colors');

module.exports = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Nunito", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      colors: {
        brand: {
          50:  colors.violet[50],
          100: colors.violet[100],
          200: colors.violet[200],
          300: colors.violet[300],
          400: colors.violet[400],
          500: colors.violet[500],
          600: colors.violet[600],
          700: colors.violet[700],
          800: colors.violet[800],
          900: colors.violet[900],
        },
      },
    },
  },
  plugins: [],
};
