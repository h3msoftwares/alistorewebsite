import { api } from './client';
import type { Address, AddressBody, AuthUser, ProfileBody, UUID } from '../types';

// ---- Addresses ----

export function listAddresses() {
  return api.get<{ addresses: Address[] }>('/api/addresses').then((r) => r.addresses);
}

export function getAddress(id: UUID) {
  return api.get<{ address: Address }>(`/api/addresses/${id}`).then((r) => r.address);
}

export function createAddress(body: AddressBody) {
  return api.post<{ address: Address }>('/api/addresses', body).then((r) => r.address);
}

export function updateAddress(id: UUID, body: Partial<AddressBody>) {
  return api.patch<{ address: Address }>(`/api/addresses/${id}`, body).then((r) => r.address);
}

export function deleteAddress(id: UUID) {
  return api.del(`/api/addresses/${id}`);
}

// ---- Profile ----

export interface Profile extends AuthUser {
  emailVerified?: string | null;
  isActive: boolean;
  dateCreated: string;
}

export function getProfile() {
  return api.get<{ user: Profile }>('/api/users/me').then((r) => r.user);
}

export function updateProfile(body: ProfileBody) {
  return api.patch<{ user: Profile }>('/api/users/me', body).then((r) => r.user);
}
