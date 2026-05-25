// CSP Manager Test Suite (Phase 5)
import { describe, it, expect, beforeEach } from 'vitest';
import { CSPManager } from '../../system/runtime/csp';

describe('CSPManager', () => {
  let csp: CSPManager;

  beforeEach(() => {
    csp = new CSPManager();
  });

  it('should build default CSP header', () => {
    const header = csp.buildCSPHeader();
    expect(header).toContain("default-src 'self'");
    expect(header).toContain("script-src 'self'");
    expect(header).toContain("object-src 'none'");
  });

  it('should add directive values', () => {
    csp.addDirectiveValue('connect-src', 'https://api.example.com');
    const header = csp.buildCSPHeader();
    expect(header).toContain('https://api.example.com');
  });

  it('should remove directive values', () => {
    csp.addDirectiveValue('connect-src', 'https://api.example.com');
    csp.removeDirectiveValue('connect-src', 'https://api.example.com');
    const header = csp.buildCSPHeader();
    expect(header).not.toContain('https://api.example.com');
  });

  it('should validate CSP header', () => {
    const result = csp.validateCSP("script-src 'unsafe-eval'");
    expect(result.valid).toBe(false);
    expect(result.issues).toContain("'unsafe-eval' is not allowed in production CSP");
  });

  it('should flag wildcard in CSP', () => {
    const result = csp.validateCSP("default-src *");
    expect(result.valid).toBe(false);
    expect(result.issues[0]).toContain("Wildcard");
  });

  it('should allow plugin origins', () => {
    csp.allowPluginOrigin('https://plugin.example.com');
    const header = csp.buildCSPHeader();
    expect(header).toContain('https://plugin.example.com');
  });

  it('should revoke plugin origins', () => {
    csp.allowPluginOrigin('https://plugin.example.com');
    csp.revokePluginOrigin('https://plugin.example.com');
    const header = csp.buildCSPHeader();
    expect(header).not.toContain('https://plugin.example.com');
  });
});
