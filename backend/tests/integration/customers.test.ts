import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import type { OrderStatus } from '@prisma/client';
import { buildApp } from '../../src/app';
import { prisma } from '../../src/config/prisma';
import { createUser, createAdmin, createCustomer, createStaff, createStaffWith, bearer } from '../helpers/auth';

const app = buildApp();

async function makeOrder(userID: string, total: number, status: OrderStatus = 'DELIVERED', when = new Date()) {
  return prisma.order.create({
    data: {
      orderNumber: `AS-${Math.random().toString(36).slice(2, 10)}`,
      userID,
      status,
      dateCreated: when,
      deliveryName: 'Test',
      deliveryPhone: '0790000000',
      deliveryAddress: 'Street',
      deliveryCity: 'Beirut',
      subtotal: total,
      total,
    },
  });
}

let adminToken: string;

beforeEach(async () => {
  adminToken = (await createAdmin()).token;
});

describe('GET /api/admin/customers', () => {
  it('401 without a session, 403 for a customer, 403 for staff without customers:view', async () => {
    expect((await request(app).get('/api/admin/customers')).status).toBe(401);

    const { token: customer } = await createCustomer();
    expect((await request(app).get('/api/admin/customers').set(bearer(customer))).status).toBe(403);

    const { token: staff } = await createStaffWith(['orders:view'], 'Desk');
    expect((await request(app).get('/api/admin/customers').set(bearer(staff))).status).toBe(403);
  });

  it('lists registered customers only — never staff, admins or soft-deleted accounts', async () => {
    await createUser({ role: 'CUSTOMER', name: 'Real Customer', email: 'real@test.dev' });
    await createStaff();
    const gone = await createUser({ role: 'CUSTOMER', name: 'Deleted One', email: 'gone@test.dev' });
    await prisma.user.update({ where: { id: gone.user.id }, data: { deletedAt: new Date() } });

    const res = await request(app).get('/api/admin/customers').set(bearer(adminToken));
    expect(res.status).toBe(200);
    const names = res.body.customers.map((c: { name: string }) => c.name);
    expect(names).toEqual(['Real Customer']);
    expect(res.body).toMatchObject({ total: 1, page: 1, pageSize: 20 });
  });

  it('a STAFF role carrying customers:view can read the list', async () => {
    await createCustomer();
    const { token } = await createStaffWith(['customers:view'], 'Support');
    const res = await request(app).get('/api/admin/customers').set(bearer(token));
    expect(res.status).toBe(200);
    expect(res.body.customers.length).toBe(1);
  });

  it('aggregates order count + lifetime spend, excluding cancelled / returned', async () => {
    const { user } = await createUser({ role: 'CUSTOMER', name: 'Spender', email: 'spender@test.dev' });
    await makeOrder(user.id, 40, 'DELIVERED');
    await makeOrder(user.id, 60, 'PENDING');
    await makeOrder(user.id, 999, 'CANCELLED');
    await makeOrder(user.id, 999, 'RETURNED');

    const res = await request(app).get('/api/admin/customers').set(bearer(adminToken));
    const row = res.body.customers.find((c: { email: string }) => c.email === 'spender@test.dev');
    expect(row.orderCount).toBe(4); // every order, whatever the status
    expect(row.paidOrderCount).toBe(2); // cancelled + returned dropped
    expect(Number(row.totalSpent)).toBe(100);
    expect(row.lastOrderAt).not.toBeNull();
  });

  it('searches by name, email or phone (case-insensitive)', async () => {
    await createUser({ role: 'CUSTOMER', name: 'Lina Haddad', email: 'lina@test.dev', phone: '+9611234567' });
    await createUser({ role: 'CUSTOMER', name: 'Omar Nasr', email: 'omar@test.dev', phone: '+9617654321' });

    const byName = await request(app).get('/api/admin/customers?search=haddad').set(bearer(adminToken));
    expect(byName.body.customers.map((c: { name: string }) => c.name)).toEqual(['Lina Haddad']);

    const byPhone = await request(app).get('/api/admin/customers?search=7654321').set(bearer(adminToken));
    expect(byPhone.body.customers.map((c: { name: string }) => c.name)).toEqual(['Omar Nasr']);
  });

  it('filters by account status', async () => {
    const active = await createUser({ role: 'CUSTOMER', name: 'Active One', email: 'a@test.dev' });
    const blocked = await createUser({ role: 'CUSTOMER', name: 'Blocked One', email: 'b@test.dev' });
    await prisma.user.update({ where: { id: blocked.user.id }, data: { isActive: false } });

    const onlyBlocked = await request(app).get('/api/admin/customers?status=inactive').set(bearer(adminToken));
    expect(onlyBlocked.body.customers.map((c: { name: string }) => c.name)).toEqual(['Blocked One']);

    const onlyActive = await request(app).get('/api/admin/customers?status=active').set(bearer(adminToken));
    expect(onlyActive.body.customers.map((c: { id: string }) => c.id)).toEqual([active.user.id]);
  });

  it('sort=orders ranks by number of orders placed', async () => {
    const few = await createUser({ role: 'CUSTOMER', name: 'Few', email: 'few@test.dev' });
    const many = await createUser({ role: 'CUSTOMER', name: 'Many', email: 'many@test.dev' });
    await makeOrder(few.user.id, 10);
    await makeOrder(many.user.id, 10);
    await makeOrder(many.user.id, 10);

    const res = await request(app).get('/api/admin/customers?sort=orders').set(bearer(adminToken));
    expect(res.body.customers.map((c: { name: string }) => c.name)).toEqual(['Many', 'Few']);
  });

  it('paginates', async () => {
    for (let i = 0; i < 3; i++) {
      await createUser({ role: 'CUSTOMER', name: `C${i}`, email: `c${i}@test.dev` });
    }
    const res = await request(app).get('/api/admin/customers?pageSize=2&page=2').set(bearer(adminToken));
    expect(res.body).toMatchObject({ total: 3, page: 2, pageSize: 2 });
    expect(res.body.customers).toHaveLength(1);
  });
});

describe('GET /api/admin/customers/:id', () => {
  it('returns the customer with their orders, newest first', async () => {
    const { user } = await createUser({ role: 'CUSTOMER', name: 'History', email: 'history@test.dev' });
    const old = await makeOrder(user.id, 20, 'DELIVERED', new Date('2026-01-01'));
    const recent = await makeOrder(user.id, 30, 'PENDING', new Date('2026-06-01'));

    const res = await request(app).get(`/api/admin/customers/${user.id}`).set(bearer(adminToken));
    expect(res.status).toBe(200);
    expect(res.body.customer.name).toBe('History');
    expect(res.body.customer.orders.map((o: { id: string }) => o.id)).toEqual([recent.id, old.id]);
    expect(res.body.customer.orders[0].items).toBeDefined();
    expect(Number(res.body.customer.totalSpent)).toBe(50);
  });

  it('404s for an unknown id or a non-customer account', async () => {
    expect(
      (await request(app)
        .get('/api/admin/customers/00000000-0000-4000-8000-000000000000')
        .set(bearer(adminToken))).status
    ).toBe(404);

    const staff = await createStaff();
    expect(
      (await request(app).get(`/api/admin/customers/${staff.user.id}`).set(bearer(adminToken))).status
    ).toBe(404);
  });
});

describe('PATCH /api/admin/customers/:id', () => {
  it('blocks and unblocks a customer, and writes an audit row', async () => {
    const { user } = await createCustomer();

    const blocked = await request(app)
      .patch(`/api/admin/customers/${user.id}`)
      .set(bearer(adminToken))
      .send({ isActive: false });
    expect(blocked.status).toBe(200);
    expect(blocked.body.customer.isActive).toBe(false);
    expect((await prisma.user.findUnique({ where: { id: user.id } }))?.isActive).toBe(false);

    const audit = await prisma.auditLog.findFirst({
      where: { entityType: 'user', entityID: user.id, action: 'customer.deactivated' },
    });
    expect(audit).not.toBeNull();

    const unblocked = await request(app)
      .patch(`/api/admin/customers/${user.id}`)
      .set(bearer(adminToken))
      .send({ isActive: true });
    expect(unblocked.body.customer.isActive).toBe(true);
  });

  it('needs customers:manage — customers:view alone gets 403', async () => {
    const { user } = await createCustomer();
    const { token } = await createStaffWith(['customers:view'], 'ReadOnly');
    const res = await request(app)
      .patch(`/api/admin/customers/${user.id}`)
      .set(bearer(token))
      .send({ isActive: false });
    expect(res.status).toBe(403);
  });

  it('404s when the target is not a registered customer', async () => {
    const staff = await createStaff();
    const res = await request(app)
      .patch(`/api/admin/customers/${staff.user.id}`)
      .set(bearer(adminToken))
      .send({ isActive: false });
    expect(res.status).toBe(404);
  });
});
