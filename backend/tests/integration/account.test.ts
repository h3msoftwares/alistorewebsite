import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { buildApp } from '../../src/app';
import { prisma } from '../../src/config/prisma';
import { createCustomer, bearer } from '../helpers/auth';

const app = buildApp();

const addr = {
  fullName: 'Jane Doe',
  phone: '0791234567',
  addressLine: '12 Rainbow Street',
  city: 'Amman',
};

describe('Addresses API', () => {
  it('requires auth on every route', async () => {
    expect((await request(app).get('/api/addresses')).status).toBe(401);
    expect((await request(app).post('/api/addresses').send(addr)).status).toBe(401);
  });

  it('defaults the recipient name to the account holder when fullName is omitted', async () => {
    const { token, user } = await createCustomer();
    const res = await request(app)
      .post('/api/addresses')
      .set(bearer(token))
      .send({ phone: '0791234567', addressLine: '9 Cedar St', city: 'Amman' }); // no fullName
    expect(res.status).toBe(201);
    expect(res.body.address.fullName).toBe(user.name);
  });

  it('first address is default; a new default clears the previous one', async () => {
    const { token } = await createCustomer();

    const a = await request(app).post('/api/addresses').set(bearer(token)).send(addr);
    expect(a.status).toBe(201);
    expect(a.body.address.isDefault).toBe(true);

    const b = await request(app)
      .post('/api/addresses')
      .set(bearer(token))
      .send({ ...addr, city: 'Zarqa', isDefault: true });
    expect(b.body.address.isDefault).toBe(true);

    const list = await request(app).get('/api/addresses').set(bearer(token));
    expect(list.body.addresses).toHaveLength(2);
    const defaults = list.body.addresses.filter((x: { isDefault: boolean }) => x.isDefault);
    expect(defaults).toHaveLength(1);
    expect(defaults[0].city).toBe('Zarqa');
  });

  it('updates and deletes, promoting a new default when the default is removed', async () => {
    const { token } = await createCustomer();
    const a = (await request(app).post('/api/addresses').set(bearer(token)).send(addr)).body.address;
    const b = (
      await request(app).post('/api/addresses').set(bearer(token)).send({ ...addr, city: 'Irbid' })
    ).body.address;

    const upd = await request(app)
      .patch(`/api/addresses/${b.id}`)
      .set(bearer(token))
      .send({ notes: 'ring twice' });
    expect(upd.body.address.notes).toBe('ring twice');

    // a is the default (created first) — delete it
    const del = await request(app).delete(`/api/addresses/${a.id}`).set(bearer(token));
    expect(del.status).toBe(204);

    const list = await request(app).get('/api/addresses').set(bearer(token));
    expect(list.body.addresses).toHaveLength(1);
    expect(list.body.addresses[0].isDefault).toBe(true);
  });

  it("cannot read or modify another user's address (404)", async () => {
    const { token: a } = await createCustomer();
    const { token: b } = await createCustomer();
    const created = (await request(app).post('/api/addresses').set(bearer(a)).send(addr)).body.address;

    expect((await request(app).get(`/api/addresses/${created.id}`).set(bearer(b))).status).toBe(404);
    expect(
      (await request(app).patch(`/api/addresses/${created.id}`).set(bearer(b)).send({ city: 'x' }))
        .status
    ).toBe(404);
  });

  it('400s invalid input', async () => {
    const { token } = await createCustomer();
    const res = await request(app).post('/api/addresses').set(bearer(token)).send({ fullName: '' });
    expect(res.status).toBe(400);
  });
});

describe('Profile API (/api/users/me)', () => {
  it('returns the current user without the password hash', async () => {
    const { token, user } = await createCustomer();
    const res = await request(app).get('/api/users/me').set(bearer(token));
    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(user.id);
    expect(res.body.user).not.toHaveProperty('passwordHash');
  });

  it('updates name and phone', async () => {
    const { token } = await createCustomer();
    const res = await request(app)
      .patch('/api/users/me')
      .set(bearer(token))
      .send({ name: 'New Name', phone: '0790000000' });
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ name: 'New Name', phone: '0790000000' });
  });

  it('409s a phone already used by someone else', async () => {
    const { token } = await createCustomer();
    await prisma.user.create({ data: { name: 'Other', phone: '0791111111', role: 'CUSTOMER' } });
    const res = await request(app)
      .patch('/api/users/me')
      .set(bearer(token))
      .send({ phone: '0791111111' });
    expect(res.status).toBe(409);
  });

  it('400s an empty patch', async () => {
    const { token } = await createCustomer();
    const res = await request(app).patch('/api/users/me').set(bearer(token)).send({});
    expect(res.status).toBe(400);
  });

  it('401s without a token', async () => {
    expect((await request(app).get('/api/users/me')).status).toBe(401);
  });
});
