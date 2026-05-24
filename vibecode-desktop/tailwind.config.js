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
        // Background layers — depth system (ARC 8)
        bg: {
          deep: '#050507',
          base: '#0a0a0f',
          surface: '#0f0f15',
          elevated: '#14141c',
          hover: '#1a1a25',
          active: '#22222f',
        },
        // Border system
        border: {
          DEFAULT: 'rgba(255, 255, 255, 0.06)',
          subtle: 'rgba(255, 255, 255, 0.03)',
          emphasis: 'rgba(255, 255, 255, 0.1)',
          active: 'rgba(99, 102, 241, 0.3)',
          focus: '#6366f1',
        },
        // Text hierarchy
        text: {
          primary: '#e4e4e9',
          secondary: '#a0a0ae',
          muted: '#65657a',
          inverse: '#0a0a0f',
        },
        // Accent — primary action color
        accent: {
          DEFAULT: '#6366f1',
          hover: '#818cf8',
          glow: 'rgba(99, 102, 241, 0.15)',
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
          DEFAULT: '#f59e0b',
          muted: 'rgba(245, 158, 11, 0.15)',
          subtle: 'rgba(245, 158, 11, 0.08)',
        },
        danger: {
          DEFAULT: '#ef4444',
          muted: 'rgba(239, 68, 68, 0.15)',
          subtle: 'rgba(239, 68, 68, 0.08)',
        },
        info: {
          DEFAULT: '#3b82f6',
          muted: 'rgba(59, 130, 246, 0.15)',
          subtle: 'rgba(59, 130, 246, 0.08)',
        },
        // Legacy aliases for backward compat
        error: {
          DEFAULT: '#ef4444',
          muted: 'rgba(239, 68, 68, 0.15)',
          subtle: 'rgba(239, 68, 68, 0.08)',
        },
      },
      // Typography scale
      fontSize: {
        '2xs': ['10px', { lineHeight: '14px' }],
        'xs': ['11px', { lineHeight: '16px' }],
        'sm': ['12px', { lineHeight: '18px' }],
        'body': ['13px', { lineHeight: '20px' }],
        'base': ['14px', { lineHeight: '22px' }],
        'lg': ['16px', { lineHeight: '24px' }],
        'xl': ['18px', { lineHeight: '28px' }],
        '2xl': ['20px', { lineHeight: '30px' }],
        '3xl': ['24px', { lineHeight: '32px' }],
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'monospace'],
      },
      // Spacing scale
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
        sm: '2px',
        DEFAULT: '4px',
        md: '6px',
        lg: '8px',
        xl: '12px',
        '2xl': '16px',
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
        'glow': '0 0 20px rgba(99, 102, 241, 0.15)',
        'focus-ring': '0 0 0 2px var(--bg-base), 0 0 0 4px var(--accent)',
      },
      // Animation system
      animation: {
        'fade-in': 'fadeIn 200ms ease-out forwards',
        'fade-out': 'fadeOut 200ms ease-in forwards',
        'slide-up': 'slideUp 200ms ease-out forwards',
        'slide-down': 'slideDown 200ms ease-out forwards',
        'slide-right': 'slideRight 300ms cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'scale-in': 'scaleIn 200ms ease-out forwards',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'pulse-subtle': 'pulseSubtle 2s ease-in-out infinite',
        'shimmer': 'shimmer 1.5s ease-in-out infinite',
        'spin': 'spin 0.6s linear infinite',
        'typing': 'typing 1s steps(3) infinite',
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
        slideRight: {
          '0%': { transform: 'translateX(-8px)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
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
        typing: {
          '0%': { opacity: '0.2' },
          '20%': { opacity: '1' },
          '100%': { opacity: '0.2' },
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
        'decelerate': 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
    },
  },
  plugins: [],
};
