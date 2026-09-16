import { api } from './client';
import type { SiteSettings, SiteSettingsBody } from '../types';

export function getSettings(opts?: { signal?: AbortSignal }) {
  return api.get<{ settings: SiteSettings }>('/api/settings', { signal: opts?.signal }).then((r) => r.settings);
}

export function updateSettings(body: SiteSettingsBody) {
  return api.patch<{ settings: SiteSettings }>('/api/settings', body).then((r) => r.settings);
}
