import { describe, it, expect, beforeEach } from 'vitest';
import {
  checkPermission,
  recordToolCall,
  resetRateLimits,
  getToolPermission,
  getRateLimitStatus,
} from '../mcpPermissions';

describe('MCP Permissions — Issue #1337', () => {
  beforeEach(() => {
    resetRateLimits();
  });

  describe('Permission levels', () => {
    it('read operations are always allowed', () => {
      const result = checkPermission('daw_get_project');
      expect(result.allowed).toBe(true);
      expect(result.requiresConfirmation).toBeUndefined();
    });

    it('write operations are allowed when not rate limited', () => {
      const result = checkPermission('daw_set_bpm');
      expect(result.allowed).toBe(true);
    });

    it('destructive operations require confirmation', () => {
      const result = checkPermission('daw_delete_track');
      expect(result.allowed).toBe(true);
      expect(result.requiresConfirmation).toBe(true);
    });

    it('unknown tools are denied', () => {
      const result = checkPermission('unknown_tool');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Unknown tool');
    });
  });

  describe('Rate limiting', () => {
    it('allows calls within the limit', () => {
      for (let i = 0; i < 5; i++) {
        const result = checkPermission('daw_generate');
        expect(result.allowed).toBe(true);
        recordToolCall('daw_generate');
      }
    });

    it('blocks calls exceeding the limit', () => {
      // daw_generate has a limit of 5 per 60s
      for (let i = 0; i < 5; i++) {
        recordToolCall('daw_generate');
      }
      const result = checkPermission('daw_generate');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Rate limit exceeded');
    });

    it('read operations have no rate limit', () => {
      for (let i = 0; i < 100; i++) {
        recordToolCall('daw_get_project');
      }
      const result = checkPermission('daw_get_project');
      expect(result.allowed).toBe(true);
    });

    it('reset clears all limits', () => {
      for (let i = 0; i < 5; i++) {
        recordToolCall('daw_generate');
      }
      expect(checkPermission('daw_generate').allowed).toBe(false);
      resetRateLimits();
      expect(checkPermission('daw_generate').allowed).toBe(true);
    });
  });

  describe('Rate limit status', () => {
    it('returns null for unrated tools', () => {
      expect(getRateLimitStatus('daw_get_project')).toBeNull();
    });

    it('reports remaining calls', () => {
      recordToolCall('daw_generate');
      recordToolCall('daw_generate');
      const status = getRateLimitStatus('daw_generate');
      expect(status).not.toBeNull();
      expect(status!.remaining).toBe(3); // 5 max - 2 used
      expect(status!.total).toBe(5);
    });
  });

  describe('Permission config', () => {
    it('returns config for known tools', () => {
      const config = getToolPermission('daw_generate');
      expect(config).toBeDefined();
      expect(config!.level).toBe('write');
      expect(config!.rateLimit).toBeDefined();
    });

    it('returns undefined for unknown tools', () => {
      expect(getToolPermission('nonexistent')).toBeUndefined();
    });

    it('destructive tools have confirmation flag', () => {
      const config = getToolPermission('daw_delete_track');
      expect(config!.requireConfirmation).toBe(true);
    });
  });
});
