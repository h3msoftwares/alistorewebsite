import { api } from './client';
import type { LoyaltyRule, LoyaltyRuleBody, UUID } from '../types';

// ---- Loyalty rules (admin) ----

export function listLoyaltyRules() {
  return api.get<{ rules: LoyaltyRule[] }>('/api/loyalty-rules').then((r) => r.rules);
}

export function createLoyaltyRule(body: LoyaltyRuleBody) {
  return api.post<{ rule: LoyaltyRule }>('/api/loyalty-rules', body).then((r) => r.rule);
}

export function updateLoyaltyRule(id: UUID, body: Partial<LoyaltyRuleBody>) {
  return api.patch<{ rule: LoyaltyRule }>(`/api/loyalty-rules/${id}`, body).then((r) => r.rule);
}

export function deleteLoyaltyRule(id: UUID) {
  return api.del(`/api/loyalty-rules/${id}`);
}
