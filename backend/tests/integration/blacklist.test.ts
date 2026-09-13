import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { buildApp } from '../../src/app';
import { createAdmin, createStaffWith, bearer } from '../helpers/auth';

const app = buildApp();
const UNKNOWN = '00000000-0000-4000-8000-000000000000';

// Anti-abuse block list — GET/POST/DELETE all sit behind
// requirePermission('orders:manage') at the router-mount level (see
// admin.routes.ts), so even listing needs the manage permission, not just
// orders:view. No admin UI existed for this until now — this file is the
// first direct coverage of the routes themselves (the block-CHECKING logic
// at checkout is covered separately by order-anti-abuse.test.ts).
describe('Blacklist API (admin)', () => {
  it('rejects anonymous with 401', async () => {
    const res = await request(app).get('/api/admin/blacklist');
    expect(res.status).toBe(401);
  });

  it('rejects a STAFF with orders:view but not orders:manage (403)', async () => {
    const { token } = await createStaffWith(['orders:view']);
    const res = await request(app).get('/api/admin/blacklist').set(bearer(token));
    expect(res.status).toBe(403);
  });

  it('lists, creates, and deletes an entry for a STAFF with orders:manage', async () => {
    const { token } = await createStaffWith(['orders:manage']);

    const empty = await request(app).get('/api/admin/blacklist').set(bearer(token));
    expect(empty.status).toBe(200);
    expect(empty.body.entries).toEqual([]);

    const created = await request(app)
      .post('/api/admin/blacklist')
      .set(bearer(token))
      .send({ type: 'PHONE', value: '+96170123456', reason: 'Repeated fake orders' });
    expect(created.status).toBe(201);
    expect(created.body.entry).toMatchObject({ type: 'PHONE', value: '+96170123456', reason: 'Repeated fake orders' });

    const listed = await request(app).get('/api/admin/blacklist').set(bearer(token));
    expect(listed.body.entries).toHaveLength(1);

    const del = await request(app)
      .delete(`/api/admin/blacklist/${created.body.entry.id}`)
      .set(bearer(token));
    expect(del.status).toBe(204);

    const afterDelete = await request(app).get('/api/admin/blacklist').set(bearer(token));
    expect(afterDelete.body.entries).toEqual([]);
  });

  it('normalizes an email to lower-case and matches case-insensitively', async () => {
    const { token } = await createAdmin();
    const created = await request(app)
      .post('/api/admin/blacklist')
      .set(bearer(token))
      .send({ type: 'EMAIL', value: 'Fraud@Example.com' });
    expect(created.body.entry.value).toBe('fraud@example.com');
  });

  it('rejects a duplicate (type, value) pair with 409', async () => {
    const { token } = await createAdmin();
    await request(app)
      .post('/api/admin/blacklist')
      .set(bearer(token))
      .send({ type: 'IP', value: '203.0.113.5' });
    const dupe = await request(app)
      .post('/api/admin/blacklist')
      .set(bearer(token))
      .send({ type: 'IP', value: '203.0.113.5' });
    expect(dupe.status).toBe(409);
  });

  it('404s deleting an unknown id', async () => {
    const { token } = await createAdmin();
    const res = await request(app).delete(`/api/admin/blacklist/${UNKNOWN}`).set(bearer(token));
    expect(res.status).toBe(404);
  });

  it('400s an invalid type', async () => {
    const { token } = await createAdmin();
    const res = await request(app)
      .post('/api/admin/blacklist')
      .set(bearer(token))
      .send({ type: 'FAX', value: 'whatever' });
    expect(res.status).toBe(400);
  });
});
