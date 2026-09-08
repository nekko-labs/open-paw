import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { AppSettings } from '@kotrain/shared';
import { ONBOARDING_VERSION } from '@kotrain/shared';
import { WizardShell } from './WizardShell.js';
import { WelcomeStep } from './WelcomeStep.js';
import { ProvidersStep } from './ProvidersStep.js';
import { IntegrationsStep } from './IntegrationsStep.js';
import { DoneStep } from './DoneStep.js';

// The step components and the store read browser globals at import time;
// node has none, so provide the minimum first (hoisted above module imports
// and mock factories).
vi.hoisted(() => {
  (globalThis as { window?: unknown }).window = {
    innerWidth: 1280,
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
  };
});

vi.mock('../../store.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../store.js')>();
  return {
    ...actual,
    useStore: (selector?: (s: unknown) => unknown) => {
      const state = { settings: null, providers: [], setView: vi.fn(), newChat: vi.fn(), applyTheme: vi.fn() };
      return selector ? selector(state) : state;
    },
  };
});

const { shouldAutoOpenOnboarding } = await import('../../store.js');

const STEPS = [
  { id: 'welcome', title: 'Welcome' },
  { id: 'theme', title: 'Theme' },
  { id: 'done', title: 'All set' },
];

function shell(index: number, extra: { nextLabel?: string; showSkipStep?: boolean } = {}) {
  return renderToStaticMarkup(
    <WizardShell
      steps={STEPS}
      index={index}
      onBack={() => {}}
      onNext={() => {}}
      onSkipStep={() => {}}
      onSkipAll={() => {}}
      onGoTo={() => {}}
      nextLabel={extra.nextLabel}
      showSkipStep={extra.showSkipStep}
    >
      <p>step body</p>
    </WizardShell>,
  );
}

const baseSettings = { providers: [] } as unknown as AppSettings;

describe('shouldAutoOpenOnboarding', () => {
  it('opens on a genuinely fresh install and not once setup is done', () => {
    expect(shouldAutoOpenOnboarding(baseSettings)).toBe(true);
    expect(
      shouldAutoOpenOnboarding({
        ...baseSettings,
        onboarding: { version: ONBOARDING_VERSION, completedAt: 1 },
      }),
    ).toBe(false);
    // Skipping writes the same flag: "don't auto-show again," not "did everything."
    expect(
      shouldAutoOpenOnboarding({
        ...baseSettings,
        onboarding: { version: ONBOARDING_VERSION, completedAt: 1, steps: { theme: 'skipped' } },
      }),
    ).toBe(false);
  });

  it('stays closed for installs that predate the wizard', () => {
    // completedAt is unset on every upgrade; a configured provider is the
    // signal that setup already happened, so the wizard must not ambush them.
    expect(
      shouldAutoOpenOnboarding({ ...baseSettings, providers: [{ id: 'p1' }] as AppSettings['providers'] }),
    ).toBe(false);
  });

  it('stays closed until settings have loaded', () => {
    expect(shouldAutoOpenOnboarding(null)).toBe(false);
    expect(shouldAutoOpenOnboarding(undefined)).toBe(false);
  });
});

describe('WizardShell', () => {
  it('renders as a modal dialog with step dots, controls, and focusable step region', () => {
    const html = shell(1);
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('aria-label="Agent Nekko setup"');
    expect(html).toContain('aria-label="Setup progress"');
    expect(html).toContain('aria-current="step"');
    expect(html.match(/aria-label="Step \d of 3:/g)).toHaveLength(3);
    for (const label of ['Back', 'Skip step', 'Skip setup', 'Next']) {
      expect(html).toContain(`>${label}<`);
    }
    expect(html).toContain('tabindex="-1"');
    expect(html).toContain('aria-label="Theme"');
    expect(html).toContain('step body');
  });

  it('hides Back on the first step and swaps the label on the last', () => {
    const first = shell(0);
    expect(first).toContain('invisible');
    const last = shell(2, { nextLabel: 'Finish', showSkipStep: false });
    expect(last).toContain('>Finish<');
    expect(last).not.toContain('>Skip step<');
    expect(last).toContain('>Skip setup<');
  });
});

describe('onboarding step content', () => {
  it('greets with the mascot and the Agent Nekko name', () => {
    const html = renderToStaticMarkup(<WelcomeStep />);
    expect(html).toContain('Welcome to Agent Nekko');
    expect(html).toContain('aria-label="Nekko"');
  });

  it('keeps the placeholder steps honest about landing later', () => {
    const providers = renderToStaticMarkup(<ProvidersStep />);
    expect(providers).toContain('Connect a model');
    expect(providers).toContain('Models tab');
    const integrations = renderToStaticMarkup(<IntegrationsStep />);
    expect(integrations).toContain('kotrain mcp');
    expect(integrations).toContain('Connectors tab');
  });

  it('offers three first moves on the done step', () => {
    const html = renderToStaticMarkup(<DoneStep onFinish={() => {}} />);
    expect(html).toContain('You&#x27;re set');
    expect(html).toContain('Start your first chat');
    expect(html).toContain('Connect a model provider');
    expect(html).toContain('Wire up your apps');
  });
});
