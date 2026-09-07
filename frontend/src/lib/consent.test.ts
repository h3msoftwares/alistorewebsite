import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  CONSENT_STORAGE_KEY,
  clearConsentChoice,
  getConsentChoice,
  getConsentSnapshot,
  hasConsent,
  isConsentSettingsOpen,
  openConsentSettings,
  setConsentChoice,
  subscribeConsent,
} from './consent';

beforeEach(() => {
  window.localStorage.clear();
  // reset the module-level "settings open" flag between tests
  setConsentChoice('necessary');
  clearConsentChoice();
});

describe('consent preference', () => {
  it('is null until a choice is made', () => {
    expect(getConsentChoice()).toBeNull();
    expect(hasConsent('analytics')).toBe(false);
  });

  it('"Accept All" grants optional categories and persists', () => {
    setConsentChoice('all');
    expect(getConsentChoice()).toBe('all');
    expect(hasConsent('analytics')).toBe(true);
    expect(window.localStorage.getItem(CONSENT_STORAGE_KEY)).toBe('all');
  });

  it('"Necessary Only" is stored but grants nothing optional', () => {
    setConsentChoice('necessary');
    expect(getConsentChoice()).toBe('necessary');
    expect(hasConsent('analytics')).toBe(false);
  });

  it('ignores a garbage stored value', () => {
    window.localStorage.setItem(CONSENT_STORAGE_KEY, 'yes-please');
    expect(getConsentChoice()).toBeNull();
    expect(hasConsent('analytics')).toBe(false);
  });

  it('clearConsentChoice forgets the choice', () => {
    setConsentChoice('all');
    clearConsentChoice();
    expect(getConsentChoice()).toBeNull();
  });

  it('notifies subscribers on set, clear, and re-open', () => {
    const listener = vi.fn();
    const unsub = subscribeConsent(listener);

    setConsentChoice('all');
    openConsentSettings();
    clearConsentChoice();
    expect(listener).toHaveBeenCalledTimes(3);

    unsub();
    setConsentChoice('necessary');
    expect(listener).toHaveBeenCalledTimes(3);
  });

  it('openConsentSettings flips the flag; making a choice clears it', () => {
    expect(isConsentSettingsOpen()).toBe(false);
    openConsentSettings();
    expect(isConsentSettingsOpen()).toBe(true);
    expect(getConsentSnapshot()).toBe('none:open');

    setConsentChoice('necessary');
    expect(isConsentSettingsOpen()).toBe(false);
    expect(getConsentSnapshot()).toBe('necessary:closed');
  });
});
