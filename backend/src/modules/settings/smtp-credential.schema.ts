import { z } from 'zod';

// Gmail app passwords are shown as 16 lowercase letters, sometimes with
// spaces ("abcd efgh ijkl mnop") — accept a generous length/character range
// rather than that exact shape, since Google's format isn't a documented
// contract and this must not reject a legitimate password over formatting.
export const setSmtpCredentialSchema = z.object({
  email: z.string().trim().email().max(320),
  appPassword: z.string().trim().min(8).max(200),
});

export type SetSmtpCredentialInput = z.infer<typeof setSmtpCredentialSchema>;
