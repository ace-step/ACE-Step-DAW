import { describe, it, expect } from 'vitest';
import {
  MCP_TOOL_DEFINITIONS,
  getAllToolDefinitions,
  getToolsByCategory,
  getToolDefinition,
  MCP_API_VERSION,
  API_VERSIONING,
} from '../mcpToolDefinitions';

describe('MCP Tool Definitions — Issue #1337', () => {
  describe('Tool registry', () => {
    it('contains 18 tool definitions', () => {
      const tools = getAllToolDefinitions();
      expect(tools.length).toBe(18);
    });

    it('all tools have a daw_ prefix', () => {
      for (const tool of getAllToolDefinitions()) {
        expect(tool.name).toMatch(/^daw_/);
      }
    });

    it('all tools have a description', () => {
      for (const tool of getAllToolDefinitions()) {
        expect(tool.description.length).toBeGreaterThan(10);
      }
    });

    it('all tools have a valid category', () => {
      const validCategories = ['read', 'write', 'transport', 'mixer', 'generation', 'session', 'ui'];
      for (const tool of getAllToolDefinitions()) {
        expect(validCategories).toContain(tool.category);
      }
    });

    it('all tools have input schema with type: object', () => {
      for (const tool of getAllToolDefinitions()) {
        expect(tool.inputSchema.type).toBe('object');
        expect(tool.inputSchema.properties).toBeDefined();
        expect(Array.isArray(tool.inputSchema.required)).toBe(true);
      }
    });
  });

  describe('Category grouping', () => {
    it('has read tools', () => {
      const readTools = getToolsByCategory('read');
      expect(readTools.length).toBe(4);
      expect(readTools.map((t) => t.name)).toContain('daw_get_project');
    });

    it('has transport tools', () => {
      const transportTools = getToolsByCategory('transport');
      expect(transportTools.length).toBe(3);
      expect(transportTools.map((t) => t.name)).toContain('daw_play');
    });

    it('has mixer tools', () => {
      const mixerTools = getToolsByCategory('mixer');
      expect(mixerTools.length).toBe(4);
    });

    it('has generation tools', () => {
      const genTools = getToolsByCategory('generation');
      expect(genTools.length).toBe(1);
      expect(genTools[0].name).toBe('daw_generate');
    });
  });

  describe('Tool lookup', () => {
    it('finds a tool by name', () => {
      const tool = getToolDefinition('daw_get_project');
      expect(tool).toBeDefined();
      expect(tool!.name).toBe('daw_get_project');
    });

    it('returns undefined for unknown tool', () => {
      expect(getToolDefinition('nonexistent')).toBeUndefined();
    });
  });

  describe('Schema validation', () => {
    it('daw_set_bpm requires bpm parameter', () => {
      const tool = getToolDefinition('daw_set_bpm')!;
      expect(tool.inputSchema.required).toContain('bpm');
      expect(tool.inputSchema.properties.bpm.type).toBe('number');
      expect(tool.inputSchema.properties.bpm.minimum).toBe(20);
      expect(tool.inputSchema.properties.bpm.maximum).toBe(999);
    });

    it('daw_add_track requires type parameter', () => {
      const tool = getToolDefinition('daw_add_track')!;
      expect(tool.inputSchema.required).toContain('type');
      expect(tool.inputSchema.properties.type.enum).toContain('stems');
      expect(tool.inputSchema.properties.type.enum).toContain('pianoroll');
    });

    it('daw_generate requires prompt', () => {
      const tool = getToolDefinition('daw_generate')!;
      expect(tool.inputSchema.required).toContain('prompt');
      expect(tool.inputSchema.properties.prompt.type).toBe('string');
    });

    it('daw_add_midi_note has all required params', () => {
      const tool = getToolDefinition('daw_add_midi_note')!;
      expect(tool.inputSchema.required).toEqual(['clipId', 'pitch', 'startBeat', 'durationBeats']);
      expect(tool.inputSchema.properties.velocity.default).toBe(0.8);
    });

    it('read operations have no required params', () => {
      for (const tool of getToolsByCategory('read')) {
        expect(tool.inputSchema.required).toHaveLength(0);
      }
    });
  });

  describe('API versioning', () => {
    it('has a semantic version string', () => {
      expect(MCP_API_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    });

    it('versioning config has deprecation policy', () => {
      expect(API_VERSIONING.breakingChangePolicy.length).toBeGreaterThan(10);
    });

    it('deprecated tools list is empty for v1', () => {
      expect(API_VERSIONING.deprecatedTools).toHaveLength(0);
    });
  });
});
