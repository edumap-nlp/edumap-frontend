/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['DM Sans', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      colors: {
        primary: { DEFAULT: '#2563eb', hover: '#1d4ed8' },
        surface: { DEFAULT: '#f8fafc', panel: '#ffffff', border: '#e2e8f0' },
        tag: { hard: '#fef08a', lowPriority: '#f1f5f9' },
      },
    },
  },
  plugins: [],
}
