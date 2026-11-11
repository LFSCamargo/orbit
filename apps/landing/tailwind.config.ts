import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        orbit: {
          canvas: 'rgb(8 8 9 / <alpha-value>)',
          surface: 'rgb(15 15 17 / <alpha-value>)',
          panel: 'rgb(23 23 26 / <alpha-value>)',
          foreground: 'rgb(245 245 244 / <alpha-value>)',
          muted: 'rgb(161 161 170 / <alpha-value>)',
          accent: 'rgb(251 146 60 / <alpha-value>)',
          focus: 'rgb(253 224 71 / <alpha-value>)',
          border: 'rgb(63 63 70 / <alpha-value>)',
        },
      },
      fontFamily: {
        sans: ['"DM Sans Variable"', 'DM Sans', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      borderRadius: {
        card: '1rem',
        panel: '1.25rem',
      },
    },
  },
  plugins: [],
}

export default config
