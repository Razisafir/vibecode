/**
 * VibeCode Desktop — Branding Service
 *
 * Provides paths and metadata for app branding assets.
 * All paths return empty strings until the actual icon/asset files
 * are placed in the resources directory.
 */

import * as path from 'path';
import { kernelFsExists } from '../kernel/kernel-fs';
import { app } from 'electron';
import { logger } from '../utils/logger';

// ─── Resource Directory ──────────────────────────────────────────────────────

function getResourcesDir(): string {
  // In dev: <project>/resources
  // In production: <app>/resources
  if (app.isPackaged) {
    return process.resourcesPath;
  }
  return path.join(app.getAppPath(), 'resources');
}

// ─── Icon Paths ──────────────────────────────────────────────────────────────

/**
 * Returns the path to the main application icon.
 * Returns empty string until an icon asset is provided.
 */
export function getAppIconPath(): string {
  const resourcesDir = getResourcesDir();
  const candidates = [
    path.join(resourcesDir, 'icon.png'),
    path.join(resourcesDir, 'icons', 'icon.png'),
    path.join(resourcesDir, 'icon.icns'), // macOS
    path.join(resourcesDir, 'icon.ico'),   // Windows
  ];

  for (const candidate of candidates) {
    if (kernelFsExists(candidate)) {
      return candidate;
    }
  }

  logger.info('general', 'No app icon asset found — using default');
  return '';
}

/**
 * Returns the path to the tray icon.
 * Returns empty string until a tray icon asset is provided.
 */
export function getTrayIconPath(): string {
  const resourcesDir = getResourcesDir();
  const candidates = [
    path.join(resourcesDir, 'tray-icon.png'),
    path.join(resourcesDir, 'icons', 'tray-icon.png'),
    path.join(resourcesDir, 'tray-iconTemplate.png'), // macOS template
  ];

  for (const candidate of candidates) {
    if (kernelFsExists(candidate)) {
      return candidate;
    }
  }

  logger.info('general', 'No tray icon asset found — tray will not be created');
  return '';
}

/**
 * Returns the path to the splash screen HTML file.
 * Returns empty string until a splash screen asset is provided.
 */
export function getSplashScreenPath(): string {
  const resourcesDir = getResourcesDir();
  const candidates = [
    path.join(resourcesDir, 'splash.html'),
    path.join(resourcesDir, 'splash', 'index.html'),
  ];

  for (const candidate of candidates) {
    if (kernelFsExists(candidate)) {
      return candidate;
    }
  }

  return '';
}

// ─── App Metadata ────────────────────────────────────────────────────────────

export interface AppMetadata {
  name: string;
  version: string;
  copyright: string;
}

/**
 * Returns application metadata for branding purposes.
 */
export function getAppMetadata(): AppMetadata {
  return {
    name: app.getName(),
    version: app.getVersion(),
    copyright: `© ${new Date().getFullYear()} VibeCode`,
  };
}
