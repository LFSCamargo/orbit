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
        console: [
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'system-ui',
          'sans-serif',
        ],
      },
      fontSize: {
        '2xs': ['0.5rem', { lineHeight: '1' }],
        '3xs': ['0.5625rem', { lineHeight: '1.4' }],
      },
      borderRadius: {
        theme: 'var(--orbit-radius)',
        card: 'var(--orbit-card-radius)',
      },
      boxShadow: {
        focus:
          '0 0 0 3px rgb(var(--orbit-focus) / 0.9), 0 0 40px rgb(var(--orbit-accent) / 0.25)',
        hero: '0 30px 80px rgba(0, 0, 0, 0.55)',
        tile: '0 10px 25px #0003',
        'tile-selected': '0 0 0 3px #ffffff30, 0 14px 32px #0004',
        'tile-focus': '0 0 0 3px #ffffff80, 0 18px 35px #0004',
        play: 'inset 0 1px #fff8, 0 3px 12px #0002',
        selection: 'inset 0 1px #ffffff24, 0 2px 6px #0001',
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
        'macos-drift': 'macos-drift 24s ease-in-out infinite alternate',
        'steam-spin': 'steam-qr-spin 0.8s linear infinite',
        'artwork-shimmer': 'artwork-shimmer 1.5s ease-in-out infinite',
        'progress-sweep': 'progress-sweep 1.4s cubic-bezier(0.65, 0, 0.35, 1) infinite',
        'progress-sheen': 'progress-sheen 2.2s ease-in-out infinite',
        'backdrop-enter':
          'orbit-backdrop-enter 460ms cubic-bezier(0.22, 1, 0.36, 1) both',
        'backdrop-leave': 'orbit-backdrop-leave 220ms ease-out both',
      },
      keyframes: {
        'pulse-soft': {
          '0%, 100%': { opacity: '0.55' },
          '50%': { opacity: '1' },
        },
        'macos-drift': {
          to: { transform: 'translate(4%, -5%) rotate(-8deg)' },
        },
        'steam-qr-spin': {
          to: { transform: 'rotate(360deg)' },
        },
        'artwork-shimmer': {
          to: { transform: 'translateX(100%)' },
        },
        'progress-sweep': {
          from: { transform: 'translateX(-100%)' },
          to: { transform: 'translateX(250%)' },
        },
        'progress-sheen': {
          from: { transform: 'translateX(0)' },
          to: { transform: 'translateX(400%)' },
        },
        'orbit-backdrop-enter': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'orbit-backdrop-leave': {
          from: { opacity: '1' },
          to: { opacity: '0' },
        },
      },
    },
  },
  plugins: [],
}
