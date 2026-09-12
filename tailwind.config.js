/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'vant-deep': '#0D0D0D',
        'vant-dark': '#111113',
        'vant-card': 'rgba(18, 18, 22, 0.75)',
        'vant-card-hover': 'rgba(28, 28, 34, 0.85)',
        'vant-border': 'rgba(255, 255, 255, 0.08)',
        'vant-border-cyan': 'rgba(0, 242, 255, 0.25)',
        'neon-cyan': '#00F2FF',
        'neon-violet': '#8B5CF6',
        'neon-blue': '#38BDF8',
      },
      fontFamily: {
        heading: ['"Space Grotesk"', 'Inter', 'sans-serif'],
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      boxShadow: {
        'neon-cyan': '0 0 20px rgba(0, 242, 255, 0.25)',
        'neon-cyan-lg': '0 0 35px rgba(0, 242, 255, 0.4)',
        'dock': '0 8px 32px 0 rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
      }
    },
  },
  plugins: [],
}

