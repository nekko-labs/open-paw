import { describe, expect, it } from 'vitest';
import {
  getModelPrice,
  estimateCost,
  estimateCostUSD,
  MODEL_PRICING,
} from './limits.js';

describe('MODEL_PRICING', () => {
  it('keeps more-specific entries before broader ones', () => {
    const mini = MODEL_PRICING.findIndex((p) => p.match === 'gpt-4o-mini');
    const fourO = MODEL_PRICING.findIndex((p) => p.match === 'gpt-4o');
    expect(mini).toBeLessThan(fourO);
  });

  it('lists Claude prices with cache where published', () => {
    const sonnet = getModelPrice('claude-sonnet-4-6');
    expect(sonnet).toBeTruthy();
    expect(sonnet?.input).toBe(3);
    expect(sonnet?.output).toBe(15);
    expect(sonnet?.cacheWrite).toBe(3.75);
    expect(sonnet?.cacheRead).toBe(0.3);
  });
});

describe('getModelPrice', () => {
  it('matches by substring on the model id', () => {
    expect(getModelPrice('claude-opus-4-8')?.match).toBe('claude-opus');
    expect(getModelPrice('openai/gpt-4o-mini')?.match).toBe('gpt-4o-mini');
  });

  it('is case-insensitive', () => {
    expect(getModelPrice('Claude-Sonnet-4-6')?.match).toBe('claude-sonnet');
  });

  it('returns undefined for unknown or local models', () => {
    expect(getModelPrice('llama3.1:8b')).toBeUndefined();
    expect(getModelPrice('qwen2.5-coder-7b')).toBeUndefined();
    expect(getModelPrice('unknown-vendor-thing')).toBeUndefined();
  });

  it('returns undefined for an empty or missing model id', () => {
    expect(getModelPrice('')).toBeUndefined();
    expect(getModelPrice(undefined)).toBeUndefined();
  });
});

describe('estimateCost', () => {
  it('computes the list price for a known metered model', () => {
    const cost = estimateCost('claude-sonnet-4-6', { inputTokens: 1_000_000, outputTokens: 1_000_000 });
    expect(cost).toBeCloseTo(18, 4);
  });

  it('returns 0 for subscription usage', () => {
    const cost = estimateCost('claude-sonnet-4-6', {
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
      auth: 'subscription',
    });
    expect(cost).toBe(0);
  });

  it('treats apikey auth as metered', () => {
    const cost = estimateCost('claude-sonnet-4-6', {
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
      auth: 'apikey',
    });
    expect(cost).toBeCloseTo(18, 4);
  });

  it('adds cache token prices when provided', () => {
    const cost = estimateCost('claude-sonnet-4-6', {
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
      cacheReadTokens: 2_000_000,
      cacheWriteTokens: 1_000_000,
    });
    expect(cost).toBeCloseTo(18 + 2 * 0.3 + 3.75, 4);
  });

  it('returns undefined for unknown models so the UI can hide the estimate', () => {
    expect(estimateCost('llama3.1:8b', { inputTokens: 1_000_000, outputTokens: 1_000_000 })).toBeUndefined();
  });

  it('matches by prefix / substring, not exact id', () => {
    expect(estimateCost('anthropic/claude-sonnet-4-6-latest', { inputTokens: 2_000_000, outputTokens: 0 })).toBe(6);
  });
});

describe('estimateCostUSD', () => {
  it('returns the same list price as estimateCost for known models', () => {
    expect(estimateCostUSD('gpt-4o-mini', 1_000_000, 1_000_000)).toBeCloseTo(0.75, 4);
  });

  it('returns 0 for unknown / local models', () => {
    expect(estimateCostUSD('llama3.1:8b', 1_000_000, 1_000_000)).toBe(0);
  });

  it('returns 0 when the model id is missing', () => {
    expect(estimateCostUSD(undefined, 1_000_000, 1_000_000)).toBe(0);
  });
});
