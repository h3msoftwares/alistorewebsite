import { api } from './client';
import type { ComboRule, ComboRuleBody, ComboCoveragePreview, UUID } from '../types';

// ---- Combo rules (admin) ----
// Own route/permission namespace ("combos"), deliberately not "discounts" —
// see backend/src/lib/permissions.ts.

export function listComboRules() {
  return api.get<{ comboRules: ComboRule[] }>('/api/combo-rules').then((r) => r.comboRules);
}

export function getComboRule(id: UUID) {
  return api.get<{ comboRule: ComboRule }>(`/api/combo-rules/${id}`).then((r) => r.comboRule);
}

export function createComboRule(body: ComboRuleBody) {
  return api.post<{ comboRule: ComboRule }>('/api/combo-rules', body).then((r) => r.comboRule);
}

export function updateComboRule(id: UUID, body: Partial<ComboRuleBody>) {
  return api.patch<{ comboRule: ComboRule }>(`/api/combo-rules/${id}`, body).then((r) => r.comboRule);
}

export function deleteComboRule(id: UUID) {
  return api.del(`/api/combo-rules/${id}`);
}

export interface PreviewComboCoverageBody {
  appliesToAll: boolean;
  productIds: UUID[];
  categoryTargets: { categoryId: UUID; includeDescendants: boolean }[];
  collectionIds: UUID[];
}

export function previewComboCoverage(body: PreviewComboCoverageBody) {
  return api.post<ComboCoveragePreview>('/api/combo-rules/preview-coverage', body);
}
