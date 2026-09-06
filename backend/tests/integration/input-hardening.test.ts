import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { buildApp } from '../../src/app';
import { prisma } from '../../src/config/prisma';
import { createCustomer, bearer } from '../helpers/auth';

const app = buildApp();
const CH = (code: number) => String.fromCharCode(code);

describe('global input hardening (XSS defence-in-depth)', () => {
  it('rejects an HTML-tag payload in a JSON body field (400, before the handler)', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'xss1@hard.test',
        password: 'Password123!',
        name: '<script>alert(document.cookie)</script>',
        address: { phone: '0791234567', addressLine: '1 St', city: 'Amman' },
      });
    expect(res.status).toBe(400);
    expect(await prisma.user.findFirst({ where: { email: 'xss1@hard.test' } })).toBeNull();
  });

  it('rejects an <img onerror> payload nested in an address field', async () => {
    const { token } = await createCustomer();
    const res = await request(app)
      .post('/api/addresses')
      .set(bearer(token))
      .send({
        fullName: 'Fine',
        phone: '0791234567',
        addressLine: '<img src=x onerror=alert(1)>',
        city: 'Amman',
      });
    expect(res.status).toBe(400);
  });

  it('rejects markup in a query-string parameter', async () => {
    const res = await request(app).get('/api/products').query({ search: '<script>x</script>' });
    expect(res.status).toBe(400);
  });

  it('strips control characters but stores the rest of the value', async () => {
    const { token } = await createCustomer();
    const res = await request(app)
      .post('/api/addresses')
      .set(bearer(token))
      .send({
        fullName: `Sara${CH(0)}${CH(7)} Khan`,
        phone: '0791234567',
        addressLine: `5 Cedar Ave${CH(127)}`,
        city: 'Zarqa',
      });
    expect(res.status).toBe(201);
    expect(res.body.address.fullName).toBe('Sara Khan');
    expect(res.body.address.addressLine).toBe('5 Cedar Ave');
  });

  it('stores a SQL-injection-looking string verbatim and does not execute it', async () => {
    const { token, user } = await createCustomer();
    const evil = "Robert'); DROP TABLE \"address\";-- and 1=1 UNION SELECT";
    const res = await request(app)
      .post('/api/addresses')
      .set(bearer(token))
      .send({ fullName: 'Bobby', phone: '0791234567', addressLine: '1 St', city: 'Amman', notes: evil });

    expect(res.status).toBe(201);
    expect(res.body.address.notes).toBe(evil); // no keyword filtering, stored as-is

    // the table still exists and the row is really there (injection did nothing)
    const row = await prisma.address.findFirst({ where: { userID: user.id } });
    expect(row?.notes).toBe(evil);
    expect(await prisma.address.count()).toBeGreaterThan(0);
  });
});
