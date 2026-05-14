// ============================================================
// VibeCode Desktop — Release Channel Configuration
// Defines 3 release tiers: alpha, beta, stable
// ============================================================

export type ReleaseChannel = 'alpha' | 'beta' | 'stable';

export interface ReleaseChannelConfig {
  channel: ReleaseChannel;
  /** Semver prerelease tag (e.g. "0.1.0-alpha.1") */
  prereleaseTag: string;
  /** Whether this channel allows auto-updates to itself */
  allowAutoUpdate: boolean;
  /** Minimum risk level that requires user confirmation */
  confirmationThreshold: 'low' | 'medium' | 'high';
  /** Whether dangerous commands are blocked entirely */
  blockDangerousCommands: boolean;
  /** Whether file mutations outside workspace are blocked */
  blockExternalMutations: boolean;
  /** Maximum concurrent execution steps (safety throttle) */
  maxConcurrentSteps: number;
  /** Whether telemetry/crash reports are sent */
  telemetryEnabled: boolean;
  /** CI enforcement: required checks before release */
  requiredCIChecks: string[];
}

const CHANNEL_CONFIGS: Record<ReleaseChannel, ReleaseChannelConfig> = {
  alpha: {
    channel: 'alpha',
    prereleaseTag: 'alpha',
    allowAutoUpdate: true,
    confirmationThreshold: 'high',
    blockDangerousCommands: false,
    blockExternalMutations: false,
    maxConcurrentSteps: 10,
    telemetryEnabled: true,
    requiredCIChecks: ['build', 'typecheck'],
  },
  beta: {
    channel: 'beta',
    prereleaseTag: 'beta',
    allowAutoUpdate: true,
    confirmationThreshold: 'medium',
    blockDangerousCommands: true,
    blockExternalMutations: true,
    maxConcurrentSteps: 5,
    telemetryEnabled: true,
    requiredCIChecks: ['build', 'typecheck', 'lint', 'test'],
  },
  stable: {
    channel: 'stable',
    prereleaseTag: '',
    allowAutoUpdate: true,
    confirmationThreshold: 'low',
    blockDangerousCommands: true,
    blockExternalMutations: true,
    maxConcurrentSteps: 3,
    telemetryEnabled: false,
    requiredCIChecks: ['build', 'typecheck', 'lint', 'test', 'security'],
  },
};

let activeChannel: ReleaseChannel = 'alpha';

export function getReleaseChannel(): ReleaseChannel {
  return activeChannel;
}

export function setReleaseChannel(channel: ReleaseChannel): void {
  activeChannel = channel;
}

export function getChannelConfig(channel?: ReleaseChannel): ReleaseChannelConfig {
  return CHANNEL_CONFIGS[channel ?? activeChannel];
}

export function getAllChannelConfigs(): Record<ReleaseChannel, ReleaseChannelConfig> {
  return { ...CHANNEL_CONFIGS };
}

/** Determine channel from version string (e.g. "0.1.0-alpha.1" -> "alpha") */
export function channelFromVersion(version: string): ReleaseChannel {
  if (version.includes('-alpha')) return 'alpha';
  if (version.includes('-beta')) return 'beta';
  return 'stable';
}

/** Format version with channel prerelease tag */
export function formatVersion(baseVersion: string, channel: ReleaseChannel, buildNumber: number): string {
  if (channel === 'stable') return baseVersion;
  return `${baseVersion}-${channel}.${buildNumber}`;
}
