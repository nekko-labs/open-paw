import React, { useCallback, useRef, useState } from 'react';
import type { OnboardingState } from '@kotrain/shared';
import { ONBOARDING_VERSION } from '@kotrain/shared';
import { useStore } from '../store.js';
import { WizardShell, type WizardStepDef } from '../components/onboarding/WizardShell.js';
import { WelcomeStep } from '../components/onboarding/WelcomeStep.js';
import { ThemeStep } from '../components/onboarding/ThemeStep.js';
import { ProvidersStep } from '../components/onboarding/ProvidersStep.js';
import { IntegrationsStep } from '../components/onboarding/IntegrationsStep.js';
import { DoneStep } from '../components/onboarding/DoneStep.js';

const STEPS: WizardStepDef[] = [
  { id: 'welcome', title: 'Welcome' },
  { id: 'theme', title: 'Theme' },
  { id: 'providers', title: 'Providers' },
  { id: 'integrations', title: 'Integrations' },
  { id: 'done', title: 'All set' },
];

/** "Skip step" is meaningful only on steps that configure something. */
const SKIPPABLE = new Set(['theme', 'providers', 'integrations']);

/**
 * The first-run setup wizard, rendered over the app while
 * `onboarding.completedAt` is unset (or Settings → Replay setup reopens it).
 * Progress is persisted per step through the normal `updateSettings` path:
 * `steps` records each step as 'done' or 'skipped', and `completedAt` is
 * written the same whether the user finishes or skips setup - the flag means
 * "don't auto-show again," not "did everything."
 */
export function OnboardingView() {
  const { settings, setOnboardingOpen } = useStore();
  const [index, setIndex] = useState(0);
  // A ref rather than state: rapid Back/Next keypresses must each read the
  // latest outcome map, and nothing renders from it.
  const stepsRef = useRef<Record<string, 'done' | 'skipped'>>(
    useStore.getState().settings?.onboarding?.steps ? { ...useStore.getState().settings!.onboarding!.steps } : {},
  );

  const persist = useCallback((steps: Record<string, 'done' | 'skipped'>, complete: boolean) => {
    const prev = useStore.getState().settings?.onboarding;
    const onboarding: OnboardingState = {
      version: ONBOARDING_VERSION,
      ...prev,
      steps,
      ...(complete ? { completedAt: Date.now() } : {}),
    };
    void window.kotrain
      .updateSettings({ onboarding })
      .then((next) => useStore.setState({ settings: next }));
  }, []);

  const close = useCallback(
    (after?: () => void) => {
      setOnboardingOpen(false);
      after?.();
    },
    [setOnboardingOpen],
  );

  const finish = useCallback(
    (after?: () => void) => {
      stepsRef.current = { ...stepsRef.current, [STEPS[STEPS.length - 1].id]: 'done' };
      persist(stepsRef.current, true);
      close(after);
    },
    [persist, close],
  );

  const goTo = useCallback((i: number) => setIndex(Math.min(STEPS.length - 1, Math.max(0, i))), []);

  const back = useCallback(() => goTo(index - 1), [goTo, index]);

  const next = useCallback(() => {
    if (index >= STEPS.length - 1) {
      finish();
      return;
    }
    stepsRef.current = { ...stepsRef.current, [STEPS[index].id]: 'done' };
    persist(stepsRef.current, false);
    goTo(index + 1);
  }, [index, finish, persist, goTo]);

  const skipStep = useCallback(() => {
    stepsRef.current = { ...stepsRef.current, [STEPS[index].id]: 'skipped' };
    if (index >= STEPS.length - 1) {
      persist(stepsRef.current, true);
      close();
      return;
    }
    persist(stepsRef.current, false);
    goTo(index + 1);
  }, [index, persist, close, goTo]);

  const skipAll = useCallback(() => {
    stepsRef.current = { ...stepsRef.current, [STEPS[index].id]: 'skipped' };
    persist(stepsRef.current, true);
    close();
  }, [index, persist, close]);

  if (!settings) return null;
  const step = STEPS[index];

  return (
    <WizardShell
      steps={STEPS}
      index={index}
      onBack={back}
      onNext={next}
      onSkipStep={skipStep}
      onSkipAll={skipAll}
      onGoTo={goTo}
      nextLabel={index === STEPS.length - 1 ? 'Finish' : 'Next'}
      showSkipStep={SKIPPABLE.has(step.id)}
    >
      {step.id === 'welcome' && <WelcomeStep />}
      {step.id === 'theme' && <ThemeStep />}
      {step.id === 'providers' && <ProvidersStep />}
      {step.id === 'integrations' && <IntegrationsStep />}
      {step.id === 'done' && <DoneStep onFinish={finish} />}
    </WizardShell>
  );
}
