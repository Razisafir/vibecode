// VibeCode System Runtime - Content Security Policy Manager v8.0
// Manages CSP headers for the Electron renderer process

export interface CSPDirective {
  name: string;
  values: string[];
}

export interface CSPConfig {
  defaultSrc: string[];
  scriptSrc: string[];
  styleSrc: string[];
  imgSrc: string[];
  connectSrc: string[];
  fontSrc: string[];
  objectSrc: string[];
  mediaSrc: string[];
  frameSrc: string[];
}

const DEFAULT_CSP_CONFIG: CSPConfig = {
  defaultSrc: ["'self'"],
  scriptSrc: ["'self'"],
  styleSrc: ["'self'", "'unsafe-inline'"],
  imgSrc: ["'self'", "data:", "blob:"],
  connectSrc: ["'self'", "ws://localhost:*"],
  fontSrc: ["'self'"],
  objectSrc: ["'none'"],
  mediaSrc: ["'self'"],
  frameSrc: ["'none'"],
};

export class CSPManager {
  private config: CSPConfig;
  private overrides = new Map<string, string[]>();

  constructor(config: Partial<CSPConfig> = {}) {
    this.config = { ...DEFAULT_CSP_CONFIG, ...config };
  }

  buildCSPHeader(): string {
    const directives: string[] = [];

    const directiveMap: Record<string, string[]> = {
      'default-src': this.config.defaultSrc,
      'script-src': this.config.scriptSrc,
      'style-src': this.config.styleSrc,
      'img-src': this.config.imgSrc,
      'connect-src': this.config.connectSrc,
      'font-src': this.config.fontSrc,
      'object-src': this.config.objectSrc,
      'media-src': this.config.mediaSrc,
      'frame-src': this.config.frameSrc,
    };

    for (const [name, values] of Object.entries(directiveMap)) {
      const overridden = this.overrides.get(name) ?? values;
      if (overridden.length > 0) {
        directives.push(`${name} ${overridden.join(' ')}`);
      }
    }

    return directives.join('; ');
  }

  addDirectiveValue(directive: string, value: string): void {
    if (!this.overrides.has(directive)) {
      const key = directive as keyof CSPConfig;
      this.overrides.set(directive, [...(this.config[key] ?? [])]);
    }
    const current = this.overrides.get(directive)!;
    if (!current.includes(value)) {
      current.push(value);
    }
  }

  removeDirectiveValue(directive: string, value: string): void {
    const key = directive as keyof CSPConfig;
    const current = this.overrides.get(directive) ?? [...(this.config[key] ?? [])];
    const filtered = current.filter(v => v !== value);
    this.overrides.set(directive, filtered);
  }

  allowPluginOrigin(origin: string): void {
    this.addDirectiveValue('connect-src', origin);
    this.addDirectiveValue('script-src', origin);
  }

  revokePluginOrigin(origin: string): void {
    this.removeDirectiveValue('connect-src', origin);
    this.removeDirectiveValue('script-src', origin);
  }

  getConfig(): CSPConfig {
    return { ...this.config };
  }

  reset(): void {
    this.overrides.clear();
  }

  validateCSP(header: string): { valid: boolean; issues: string[] } {
    const issues: string[] = [];

    if (header.includes("'unsafe-eval'")) {
      issues.push("'unsafe-eval' is not allowed in production CSP");
    }

    if (header.includes('*')) {
      issues.push("Wildcard '*' is not recommended in CSP directives");
    }

    return { valid: issues.length === 0, issues };
  }
}
