import { describe, expect, it } from 'vitest';
import { THEME_PRESETS, type ThemePreset } from './themes.js';

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

describe('THEME_PRESETS', () => {
  it('contains the v1 catalog with no duplicate ids', () => {
    const ids = THEME_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain('system');
    expect(ids).toContain('light');
    expect(ids).toContain('dark');
    expect(ids).toContain('nebula');
    expect(ids).toContain('terminal');
    expect(ids).toContain('nord');
    expect(ids).toContain('solar');
    expect(ids).toContain('ember');
  });

  it('every preset declares a mode, a label, and at least 3 swatch colors', () => {
    for (const p of THEME_PRESETS) {
      expect(p.id).toBeTruthy();
      expect(p.label).toBeTruthy();
      expect(p.mode).toMatch(/^(light|dark|system)$/);
      expect(p.swatch).toBeInstanceOf(Array);
      expect(p.swatch.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('every preset uses valid 6-digit hex for accents and swatches', () => {
    for (const p of THEME_PRESETS) {
      expect(p.accent).toMatch(HEX_RE);
      expect(p.accent2).toMatch(HEX_RE);
      for (const color of p.swatch) {
        expect(color).toMatch(HEX_RE);
      }
    }
  });

  it('surface/ink overrides, when present, are valid 6-digit hex', () => {
    const overrideKeys: (keyof ThemePreset)[] = [
      'paper',
      'surface',
      'surface2',
      'ink',
      'inkSoft',
      'inkFaint',
      'line',
    ];
    for (const p of THEME_PRESETS) {
      for (const key of overrideKeys) {
        const value = p[key];
        if (value != null) {
          expect(value).toMatch(HEX_RE);
        }
      }
    }
  });
});
