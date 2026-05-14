import path from 'path';
import os from 'os';
import fs from 'fs';

const VIBECODE_DIR = '.vibecode';

export function getHomeDir(): string {
  return os.homedir();
}

export function getVibeCodeDir(): string {
  return path.join(getHomeDir(), VIBECODE_DIR);
}

export function getMemoryDir(): string {
  return path.join(getVibeCodeDir(), 'memory');
}

export function getSessionsDir(): string {
  return path.join(getVibeCodeDir(), 'sessions');
}

export function getWorkspacesDir(): string {
  return path.join(getVibeCodeDir(), 'workspaces');
}

export function getProvidersConfigPath(): string {
  return path.join(getVibeCodeDir(), 'providers.json');
}

export function ensureDirectories(): void {
  const dirs = [getVibeCodeDir(), getMemoryDir(), getSessionsDir(), getWorkspacesDir()];
  dirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
}
