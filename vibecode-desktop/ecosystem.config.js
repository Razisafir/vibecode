// ============================================================
// VibeCode Desktop — PM2 Process Ecosystem Configuration
// ============================================================
//
// SAFETY: This file does NOTHING unless you explicitly run:
//   npm run preview:start
//
// The default `npm run dev` workflow is COMPLETELY UNAFFECTED.
// PM2 is never invoked by any existing npm script.
//
// Usage:
//   npm run preview:start   → Start app under PM2 supervision
//   npm run preview:stop    → Stop PM2-managed app
//   npm run preview:logs    → Tail PM2 logs
//   npm run preview:status  → Check PM2 process status
// ============================================================

module.exports = {
  apps: [
    {
      // ─── VibeCode Electron App (headless/preview mode) ──────────────────
      name: 'vibecode-desktop',
      script: './dist/main/main.js',

      // Electron must be launched through its own binary, not node directly.
      // This interpreter field is a hint for PM2; in practice the startup
      // script uses `electron .` to launch properly.
      interpreter: 'none',
      node_args: [],

      // Environment-specific configuration
      env_dev: {
        NODE_ENV: 'development',
        VIBECODE_DEV: '1',
        VIBECODE_CHANNEL: 'alpha',
      },
      env_preview: {
        NODE_ENV: 'preview',
        VIBECODE_CHANNEL: 'beta',
        VIBECODE_HEALTH_PORT: '9876',
      },
      env_prod: {
        NODE_ENV: 'production',
        VIBECODE_CHANNEL: 'stable',
        VIBECODE_HEALTH_PORT: '9876',
      },

      // Process supervision
      max_restarts: 5,
      restart_delay: 5000,
      max_memory_restart: '1G',
      kill_timeout: 10000,
      listen_timeout: 30000,

      // Logging
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,

      // Auto-restart on file change (DEV only — disabled by default)
      watch: false,
      ignore_watch: ['node_modules', 'dist', 'dist-electron', 'logs', '.git'],

      // Instance management
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
    },
  ],

  // ─── Deployment configuration (placeholder — no actual deploy targets) ────
  deploy: {
    preview: {
      user: 'vibecode',
      host: 'localhost',
      ref: 'origin/main',
      repo: 'git@github.com:Razisafir/vibecode.git',
      path: '/opt/vibecode/preview',
      'pre-deploy-local': '',
      'post-deploy': 'npm install && npm run build && pm2 reload ecosystem.config.js --env preview',
      'pre-setup': '',
    },
  },
};
