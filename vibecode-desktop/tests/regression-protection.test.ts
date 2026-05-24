import { describe, it, expect } from 'vitest';
import { RegressionProtection } from '../src/main/services/regression/regression-protection';

describe('RegressionProtection', () => {
  const rp = new RegressionProtection();

  describe('Baseline Management', () => {
    it('should have default baselines initialized', () => {
      const baselines = rp.getAllBaselines();
      expect(baselines.length).toBeGreaterThanOrEqual(3);
      expect(baselines.some((b) => b.id === 'file-ops-safety')).toBe(true);
      expect(baselines.some((b) => b.id === 'terminal-exec-safety')).toBe(true);
      expect(baselines.some((b) => b.id === 'proposal-parsing-safety')).toBe(true);
    });

    it('should validate against file operation baseline with passing values', () => {
      const result = rp.validateAgainstBaseline('file-ops-safety', {
        pathWithinWorkspace: true,
        noPathTraversal: true,
        noBlockedExtension: true,
      });

      expect(result.passed).toBe(true);
      expect(result.failures.length).toBe(0);
    });

    it('should validate against file operation baseline with failing values', () => {
      const result = rp.validateAgainstBaseline('file-ops-safety', {
        pathWithinWorkspace: false,
        noPathTraversal: true,
        noBlockedExtension: true,
      });

      expect(result.passed).toBe(false);
      expect(result.failures.length).toBeGreaterThan(0);
    });

    it('should validate against terminal execution baseline', () => {
      const result = rp.validateAgainstBaseline('terminal-exec-safety', {
        noCriticalCommand: true,
        noSudo: true,
        noSystemPath: true,
      });

      expect(result.passed).toBe(true);
    });

    it('should return failure for non-existent baseline', () => {
      const result = rp.validateAgainstBaseline('non-existent', {});
      expect(result.passed).toBe(false);
    });
  });

  describe('Golden Flows', () => {
    it('should have default golden flows initialized', () => {
      const flows = rp.getAllGoldenFlows();
      expect(flows.length).toBeGreaterThanOrEqual(3);
      expect(flows.some((f) => f.id === 'safe-file-cycle')).toBe(true);
      expect(flows.some((f) => f.id === 'safe-command-exec')).toBe(true);
      expect(flows.some((f) => f.id === 'dangerous-command-blocked')).toBe(true);
    });

    it('should define golden flow steps with expected outcomes', () => {
      const flow = rp.getGoldenFlow('safe-file-cycle');
      expect(flow).toBeDefined();
      expect(flow!.steps.length).toBeGreaterThan(0);
      expect(flow!.steps[0].expectedOutcome.status).toBeDefined();
    });
  });
});
