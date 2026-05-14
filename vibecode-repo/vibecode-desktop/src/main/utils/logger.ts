export const logger = {
  info: (message: string, ...args: any[]) => console.log(`[VibeCode] ${message}`, ...args),
  warn: (message: string, ...args: any[]) => console.warn(`[VibeCode] ${message}`, ...args),
  error: (message: string, ...args: any[]) => console.error(`[VibeCode] ${message}`, ...args),
  debug: (message: string, ...args: any[]) => {
    if (process.env.VIBECODE_DEBUG) {
      console.log(`[VibeCode:DEBUG] ${message}`, ...args);
    }
  },
};
