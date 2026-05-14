import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    resolve(__dirname, 'src/renderer/**/*.{ts,tsx,html}'),
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Background layers — depth system
        bg: {
          primary: '#0a0a0f',
          secondary: '#111118',
          tertiary: '#1a1a24',
          hover: '#222233',
          'active': '#2a2a3d',
          elevated: '#16161f',
        },
        // Border system
        border: {
          DEFAULT: '#32324a',
          subtle: '#262638',
          emphasis: '#404060',
          focus: '#6366f1',
        },
        // Text hierarchy
        text: {
          primary: '#eeeef4',
          secondary: '#9898b0',
          muted: '#6b6b82',
          'tertiary': '#555570',
          inverse: '#0a0a0f',
        },
        // Accent — primary action color
        accent: {
          DEFAULT: '#6366f1',
          hover: '#818cf8',
          muted: 'rgba(99, 102, 241, 0.15)',
          subtle: 'rgba(99, 102, 241, 0.08)',
          strong: '#4f46e5',
        },
        // Semantic colors
        success: {
          DEFAULT: '#22c55e',
          muted: 'rgba(34, 197, 94, 0.15)',
          subtle: 'rgba(34, 197, 94, 0.08)',
        },
        warning: {
          DEFAULT: '#eab308',
          muted: 'rgba(234, 179, 8, 0.15)',
          subtle: 'rgba(234, 179, 8, 0.08)',
        },
        error: {
          DEFAULT: '#ef4444',
          muted: 'rgba(239, 68, 68, 0.15)',
          subtle: 'rgba(239, 68, 68, 0.08)',
        },
        info: {
          DEFAULT: '#3b82f6',
          muted: 'rgba(59, 130, 246, 0.15)',
          subtle: 'rgba(59, 130, 246, 0.08)',
        },
      },
      // Typography scale
      fontSize: {
        '2xs': ['10px', { lineHeight: '14px' }],
        'xs': ['12px', { lineHeight: '16px' }],
        'sm': ['13px', { lineHeight: '20px' }],
        'base': ['14px', { lineHeight: '22px' }],
        'lg': ['16px', { lineHeight: '24px' }],
        'xl': ['18px', { lineHeight: '28px' }],
        '2xl': ['20px', { lineHeight: '30px' }],
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'monospace'],
      },
      // Spacing scale (supplement Tailwind defaults)
      spacing: {
        '0.5': '2px',
        '1': '4px',
        '1.5': '6px',
        '2': '8px',
        '2.5': '10px',
        '3': '12px',
        '3.5': '14px',
        '4': '16px',
        '5': '20px',
        '6': '24px',
        '7': '28px',
        '8': '32px',
        '10': '40px',
        '12': '48px',
        '16': '64px',
        '20': '80px',
      },
      // Border radius
      borderRadius: {
        sm: '4px',
        DEFAULT: '6px',
        md: '8px',
        lg: '12px',
        xl: '16px',
        '2xl': '20px',
        full: '9999px',
      },
      // Shadows
      boxShadow: {
        'xs': '0 1px 2px rgba(0, 0, 0, 0.3)',
        'sm': '0 2px 4px rgba(0, 0, 0, 0.3)',
        DEFAULT: '0 4px 8px rgba(0, 0, 0, 0.3)',
        'md': '0 6px 12px rgba(0, 0, 0, 0.35)',
        'lg': '0 10px 20px rgba(0, 0, 0, 0.4)',
        'xl': '0 25px 50px rgba(0, 0, 0, 0.5)',
        'focus-ring': '0 0 0 2px var(--bg-primary), 0 0 0 4px var(--accent)',
        'focus-ring-error': '0 0 0 2px var(--bg-primary), 0 0 0 4px var(--error)',
      },
      // Animation system
      animation: {
        'fade-in': 'fadeIn 200ms ease-out forwards',
        'fade-out': 'fadeOut 200ms ease-in forwards',
        'slide-up': 'slideUp 250ms cubic-bezier(0.4, 0, 0.2, 1) forwards',
        'slide-down': 'slideDown 250ms cubic-bezier(0.4, 0, 0.2, 1) forwards',
        'scale-in': 'scaleIn 200ms ease-out forwards',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'pulse-subtle': 'pulseSubtle 2s ease-in-out infinite',
        'shimmer': 'shimmer 1.5s ease-in-out infinite',
        'spin': 'spin 0.6s linear infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        fadeOut: {
          '0%': { opacity: '1' },
          '100%': { opacity: '0' },
        },
        slideUp: {
          '0%': { transform: 'translateY(8px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        slideDown: {
          '0%': { transform: 'translateY(-8px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        scaleIn: {
          '0%': { transform: 'scale(0.96)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        pulseSubtle: {
          '0%, 100%': { transform: 'scale(1)' },
          '50%': { transform: 'scale(1.02)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-400px 0' },
          '100%': { backgroundPosition: '400px 0' },
        },
      },
      transitionDuration: {
        DEFAULT: '150ms',
        '75': '75ms',
        '100': '100ms',
        '150': '150ms',
        '200': '200ms',
        '250': '250ms',
        '300': '300ms',
      },
      transitionTimingFunction: {
        DEFAULT: 'cubic-bezier(0.4, 0, 0.2, 1)',
        'spring': 'cubic-bezier(0.34, 1.56, 0.64, 1)',
        'smooth': 'cubic-bezier(0.25, 0.1, 0.25, 1)',
      },
    },
  },
  plugins: [],
};
