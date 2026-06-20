import type { ProviderConfig } from '@open-paw/shared';
import { DISCOVERY_TARGETS } from '@open-paw/shared';
import type { Provider } from './types.js';
import { OpenAICompatProvider } from './openai-compat.js';
import { AnthropicProvider } from './anthropic.js';
import { OllamaProvider } from './ollama.js';

export * from './types.js';
export { OpenAICompatProvider } from './openai-compat.js';
export { AnthropicProvider } from './anthropic.js';
export { OllamaProvider } from './ollama.js';

/** Build a Provider instance from its stored config. */
export function createProvider(config: ProviderConfig): Provider {
  switch (config.kind) {
    case 'anthropic':
      return new AnthropicProvider(config);
    case 'ollama':
      return new OllamaProvider(config);
    case 'openai':
    case 'openrouter':
    case 'lmstudio':
    case 'vllm':
    case 'openai-compat':
      return new OpenAICompatProvider(config);
  }
}

/**
 * Probe well-known localhost ports for running model servers. Returns a
 * ProviderConfig for each one that responds, so the UI can offer one-click add.
 */
export async function discoverLocalProviders(timeoutMs = 800): Promise<ProviderConfig[]> {
  const found: ProviderConfig[] = [];
  await Promise.all(
    DISCOVERY_TARGETS.map(async (t) => {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      try {
        const res = await fetch(`${t.baseUrl}${t.probe}`, { signal: ctrl.signal });
        if (res.ok) {
          found.push({
            id: `${t.kind}-local`,
            kind: t.kind,
            label: `${t.kind} (local)`,
            baseUrl: t.baseUrl,
            discovered: true,
            enabled: true,
          });
        }
      } catch {
        /* not running */
      } finally {
        clearTimeout(timer);
      }
    }),
  );
  return found;
}
