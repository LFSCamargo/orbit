/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        orbit: {
          canvas: 'rgb(var(--orbit-canvas) / <alpha-value>)',
          surface: 'rgb(var(--orbit-surface) / <alpha-value>)',
          panel: 'rgb(var(--orbit-panel) / <alpha-value>)',
          foreground: 'rgb(var(--orbit-foreground) / <alpha-value>)',
          muted: 'rgb(var(--orbit-muted) / <alpha-value>)',
          accent: 'rgb(var(--orbit-accent) / <alpha-value>)',
          focus: 'rgb(var(--orbit-focus) / <alpha-value>)',
          border: 'rgb(var(--orbit-border) / <alpha-value>)',
        },
      },
      fontFamily: {
        display: ['var(--orbit-font-display)', 'DM Sans', 'system-ui', 'sans-serif'],
        body: ['var(--orbit-font-body)', 'DM Sans', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        theme: 'var(--orbit-radius)',
        card: 'var(--orbit-card-radius)',
      },
      boxShadow: {
        focus: '0 0 0 3px rgb(var(--orbit-focus) / 0.9), 0 0 40px rgb(var(--orbit-accent) / 0.25)',
        hero: '0 30px 80px rgba(0, 0, 0, 0.55)',
      },
      backdropBlur: {
        panel: 'var(--orbit-blur)',
      },
      transitionDuration: {
        theme: 'var(--orbit-motion-duration)',
      },
      transitionTimingFunction: {
        theme: 'var(--orbit-motion-easing)',
      },
      animation: {
        'pulse-soft': 'pulse-soft 2.4s ease-in-out infinite',
      },
      keyframes: {
        'pulse-soft': {
          '0%, 100%': { opacity: '0.55' },
          '50%': { opacity: '1' },
        },
      },
    },
  },
  plugins: [],
}
