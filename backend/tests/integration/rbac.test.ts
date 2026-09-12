import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { buildApp } from '../../src/app';
import { prisma } from '../../src/config/prisma';
import { createUser, createAdmin, createCustomer, bearer, signAccessToken } from '../helpers/auth';
import { ALL_PERMISSIONS } from '../../src/lib/permissions';

const app = buildApp();

/** A STAFF token whose custom role carries exactly `permissions`. */
async function staffWithRole(permissions: string[], roleName: string) {
  const role = await prisma.role.create({ data: { name: roleName, permissions } });
  const { user } = await createUser({ role: 'STAFF' });
  await prisma.user.update({ where: { id: user.id }, data: { customRoleID: role.id } });
  return { role, user, token: signAccessToken(user.id, 'STAFF') };
}

let adminToken: string;

beforeEach(async () => {
  adminToken = (await createAdmin()).token;
});

describe('GET /api/admin/permissions', () => {
  it('is gated by roles:view', async () => {
    // anon / customer / staff-without-a-role
    expect((await request(app).get('/api/admin/permissions')).status).toBe(401);

    const customer = (await createCustomer()).token;
    expect((await request(app).get('/api/admin/permissions').set(bearer(customer))).status).toBe(403);

    const staffNoRole = (await createUser({ role: 'STAFF' })).token;
    expect(
      (await request(app).get('/api/admin/permissions').set(bearer(staffNoRole))).status
    ).toBe(403);
  });

  it('returns the full catalog to an admin, and its keys match the shared constant', async () => {
    const res = await request(app).get('/api/admin/permissions').set(bearer(adminToken));
    expect(res.status).toBe(200);
    const keys = res.body.areas
      .flatMap((a: { area: string; levels: string[] }) => a.levels.map((l) => `${a.area}:${l}`))
      .sort();
    expect(keys).toEqual([...ALL_PERMISSIONS].sort());
  });
});

describe('Roles CRUD', () => {
  it('creates, lists, updates and deletes a role; normalises manage⇒view', async () => {
    const created = await request(app)
      .post('/api/admin/roles')
      .set(bearer(adminToken))
      .send({ name: 'Catalog editor', description: 'Products only', permissions: ['products:manage'] });
    expect(created.status).toBe(201);
    // manage implies view
    expect([...created.body.role.permissions].sort()).toEqual(['products:manage', 'products:view']);

    const list = await request(app).get('/api/admin/roles').set(bearer(adminToken));
    expect(list.status).toBe(200);
    expect(list.body.roles.some((r: { name: string }) => r.name === 'Catalog editor')).toBe(true);

    const patched = await request(app)
      .patch(`/api/admin/roles/${created.body.role.id}`)
      .set(bearer(adminToken))
      .send({ permissions: ['orders:view'] });
    expect(patched.status).toBe(200);
    expect(patched.body.role.permissions).toEqual(['orders:view']);

    const del = await request(app)
      .delete(`/api/admin/roles/${created.body.role.id}`)
      .set(bearer(adminToken));
    expect(del.status).toBe(204);
  });

  it('rejects a duplicate name with 409', async () => {
    await prisma.role.create({ data: { name: 'Dupe', permissions: [] } });
    const res = await request(app)
      .post('/api/admin/roles')
      .set(bearer(adminToken))
      .send({ name: 'Dupe', permissions: [] });
    expect(res.status).toBe(409);
  });

  it('rejects an unknown permission key with 400', async () => {
    const res = await request(app)
      .post('/api/admin/roles')
      .set(bearer(adminToken))
      .send({ name: 'Bad', permissions: ['orders:destroy'] });
    expect(res.status).toBe(400);
  });

  it('will not delete a built-in role or one that is still assigned', async () => {
    const system = await prisma.role.create({
      data: { name: 'Full access', permissions: ALL_PERMISSIONS, isSystem: true },
    });
    expect(
      (await request(app).delete(`/api/admin/roles/${system.id}`).set(bearer(adminToken))).status
    ).toBe(409);

    const inUse = await prisma.role.create({ data: { name: 'Desk', permissions: ['orders:view'] } });
    const { user } = await createUser({ role: 'STAFF' });
    await prisma.user.update({ where: { id: user.id }, data: { customRoleID: inUse.id } });
    expect(
      (await request(app).delete(`/api/admin/roles/${inUse.id}`).set(bearer(adminToken))).status
    ).toBe(409);
  });

  it('needs roles:manage to write — roles:view alone is read-only', async () => {
    const { token } = await staffWithRole(['roles:view'], 'Viewer');
    expect((await request(app).get('/api/admin/roles').set(bearer(token))).status).toBe(200);
    expect(
      (await request(app).post('/api/admin/roles').set(bearer(token)).send({ name: 'x', permissions: [] }))
        .status
    ).toBe(403);
  });
});

describe('requirePermission route boundary', () => {
  it('a STAFF role only opens the routes its permissions cover', async () => {
    const { token } = await staffWithRole(
      ['dashboard:view', 'orders:view', 'orders:manage'],
      'Order desk'
    );

    // in scope
    expect((await request(app).get('/api/admin/orders').set(bearer(token))).status).toBe(200);
    expect((await request(app).get('/api/admin/dashboard').set(bearer(token))).status).toBe(200);
    // out of scope
    expect((await request(app).get('/api/admin/permissions').set(bearer(token))).status).toBe(403);
    expect((await request(app).get('/api/promotions').set(bearer(token))).status).toBe(403);
    expect(
      (await request(app).post('/api/products').set(bearer(token)).send({})).status
    ).toBe(403);
  });

  it('an ADMIN passes everything, but a revoked permission still 403s', async () => {
    // baseline: full admin can list orders
    expect((await request(app).get('/api/admin/orders').set(bearer(adminToken))).status).toBe(200);

    const { user } = await createUser({ role: 'ADMIN' });
    await prisma.user.update({
      where: { id: user.id },
      data: { revokedPermissions: ['orders:view'] },
    });
    const token = signAccessToken(user.id, 'ADMIN');
    expect((await request(app).get('/api/admin/orders').set(bearer(token))).status).toBe(403);
    // unrelated area still open
    expect((await request(app).get('/api/admin/permissions').set(bearer(token))).status).toBe(200);
  });
});

describe('Team assignment', () => {
  it('assigns / clears a STAFF role and refuses to give a role to an ADMIN', async () => {
    const role = await prisma.role.create({ data: { name: 'Desk', permissions: ['orders:view'] } });
    const { user: staff } = await createUser({ role: 'STAFF' });

    const assigned = await request(app)
      .post('/api/admin/team/assign-role')
      .set(bearer(adminToken))
      .send({ userId: staff.id, roleId: role.id });
    expect(assigned.status).toBe(200);
    expect(assigned.body.user.customRole.id).toBe(role.id);
    expect(assigned.body.user.effectivePermissions).toContain('orders:view');

    const cleared = await request(app)
      .post('/api/admin/team/assign-role')
      .set(bearer(adminToken))
      .send({ userId: staff.id, roleId: null });
    expect(cleared.status).toBe(200);
    expect(cleared.body.user.customRole).toBeNull();

    const { user: admin2 } = await createUser({ role: 'ADMIN' });
    const bad = await request(app)
      .post('/api/admin/team/assign-role')
      .set(bearer(adminToken))
      .send({ userId: admin2.id, roleId: role.id });
    expect(bad.status).toBe(400);
  });

  it('revoke list trims an admin’s effective permissions', async () => {
    const { user: admin2 } = await createUser({ role: 'ADMIN' });
    const res = await request(app)
      .post('/api/admin/team/revoke')
      .set(bearer(adminToken))
      .send({ userId: admin2.id, revoked: ['settings:view', 'settings:manage'] });
    expect(res.status).toBe(200);
    expect(res.body.user.effectivePermissions).not.toContain('settings:view');
    expect(res.body.user.effectivePermissions).not.toContain('settings:manage');
    expect(res.body.user.effectivePermissions).toContain('orders:view');
  });
});

describe('Team member creation (POST /api/admin/team)', () => {
  it('creates a STAFF account that can then sign in at the admin door', async () => {
    const role = await prisma.role.create({ data: { name: 'Desk', permissions: ['orders:view'] } });
    const res = await request(app)
      .post('/api/admin/team')
      .set(bearer(adminToken))
      .send({ name: 'Sam', email: 'Sam@Shop.com', password: 'hunter2pw', role: 'STAFF', roleId: role.id });
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ role: 'STAFF', isActive: true, email: 'sam@shop.com' });
    expect(res.body.user.customRole.id).toBe(role.id);
    expect(res.body.user.effectivePermissions).toContain('orders:view');

    const login = await request(app)
      .post('/api/auth/ali-admin-login')
      .send({ identifier: 'sam@shop.com', password: 'hunter2pw' });
    expect(login.status).toBe(200);
  });

  it('rejects a short password (400) and a duplicate email (409)', async () => {
    expect(
      (await request(app).post('/api/admin/team').set(bearer(adminToken)).send({
        name: 'X', email: 'x@shop.com', password: 'short', role: 'STAFF',
      })).status
    ).toBe(400);

    await request(app).post('/api/admin/team').set(bearer(adminToken)).send({
      name: 'One', email: 'dupe@shop.com', password: 'longenough', role: 'STAFF',
    });
    expect(
      (await request(app).post('/api/admin/team').set(bearer(adminToken)).send({
        name: 'Two', email: 'dupe@shop.com', password: 'longenough', role: 'STAFF',
      })).status
    ).toBe(409);
  });

  it('needs roles:manage — a roles:view staffer cannot create accounts', async () => {
    const { token } = await staffWithRole(['roles:view'], 'ViewerB');
    expect(
      (await request(app).post('/api/admin/team').set(bearer(token)).send({
        name: 'Nope', email: 'nope@shop.com', password: 'longenough', role: 'STAFF',
      })).status
    ).toBe(403);
  });
});

describe('Team member updates (PATCH /api/admin/team/:id)', () => {
  it('toggles isActive and blocks a locked-out account from signing in', async () => {
    const { user } = await createUser({ role: 'STAFF', password: 'longenough' });

    const off = await request(app)
      .patch(`/api/admin/team/${user.id}`)
      .set(bearer(adminToken))
      .send({ isActive: false });
    expect(off.status).toBe(200);
    expect(off.body.user.isActive).toBe(false);

    const login = await request(app)
      .post('/api/auth/ali-admin-login')
      .send({ identifier: user.email, password: 'longenough' });
    expect(login.status).toBe(401);

    const on = await request(app)
      .patch(`/api/admin/team/${user.id}`)
      .set(bearer(adminToken))
      .send({ isActive: true });
    expect(on.body.user.isActive).toBe(true);
  });

  it('moves a STAFF member to ADMIN and clears any custom role', async () => {
    const role = await prisma.role.create({ data: { name: 'Desk2', permissions: ['orders:view'] } });
    const { user } = await createUser({ role: 'STAFF' });
    await prisma.user.update({ where: { id: user.id }, data: { customRoleID: role.id } });

    const res = await request(app)
      .patch(`/api/admin/team/${user.id}`)
      .set(bearer(adminToken))
      .send({ role: 'ADMIN' });
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('ADMIN');
    expect(res.body.user.customRole).toBeNull();
    expect([...res.body.user.effectivePermissions].sort()).toEqual([...ALL_PERMISSIONS].sort());
  });

  it('will not let an admin deactivate or demote themselves', async () => {
    const admin = await createUser({ role: 'ADMIN' });
    expect(
      (await request(app).patch(`/api/admin/team/${admin.user.id}`).set(bearer(admin.token)).send({ isActive: false }))
        .status
    ).toBe(400);
    expect(
      (await request(app).patch(`/api/admin/team/${admin.user.id}`).set(bearer(admin.token)).send({ role: 'STAFF' }))
        .status
    ).toBe(400);
  });

  it('rejects an empty patch body with 400', async () => {
    const { user } = await createUser({ role: 'STAFF' });
    expect(
      (await request(app).patch(`/api/admin/team/${user.id}`).set(bearer(adminToken)).send({})).status
    ).toBe(400);
  });
});

// A STAFF who has been delegated `roles:manage` must NOT be able to use it to
// escalate past their own level. Regression cover for the privilege-escalation
// finding: self-promote to ADMIN, mint an ADMIN, author an over-powered role
// and self-assign it, or strip a real ADMIN's permissions.
describe('roles:manage delegation guardrails', () => {
  /** STAFF whose role carries roles:manage plus the orders area — so we can
   *  tell "permission you hold" from "permission you don't". */
  async function delegatedStaff() {
    return staffWithRole(
      ['roles:view', 'roles:manage', 'orders:view', 'orders:manage'],
      'Team lead ' + Math.random().toString(36).slice(2)
    );
  }

  it('cannot promote itself to ADMIN', async () => {
    const { user, token } = await delegatedStaff();
    const res = await request(app)
      .patch(`/api/admin/team/${user.id}`)
      .set(bearer(token))
      .send({ role: 'ADMIN' });
    expect(res.status).toBe(403);
    const after = await prisma.user.findUnique({ where: { id: user.id }, select: { role: true } });
    expect(after?.role).toBe('STAFF');
  });

  it('cannot promote another STAFF to ADMIN', async () => {
    const { token } = await delegatedStaff();
    const { user: victim } = await createUser({ role: 'STAFF' });
    const res = await request(app)
      .patch(`/api/admin/team/${victim.id}`)
      .set(bearer(token))
      .send({ role: 'ADMIN' });
    expect(res.status).toBe(403);
  });

  it('cannot mint a fresh ADMIN account', async () => {
    const { token } = await delegatedStaff();
    const res = await request(app)
      .post('/api/admin/team')
      .set(bearer(token))
      .send({ name: 'E', email: 'evil@x.test', password: 'longenough', role: 'ADMIN' });
    expect(res.status).toBe(403);
  });

  it('cannot modify or revoke against an existing ADMIN account', async () => {
    const { token } = await delegatedStaff();
    const { user: someAdmin } = await createUser({ role: 'ADMIN' });
    expect(
      (await request(app).post('/api/admin/team/revoke').set(bearer(token))
        .send({ userId: someAdmin.id, revoked: ['orders:view'] })).status
    ).toBe(403);
    expect(
      (await request(app).patch(`/api/admin/team/${someAdmin.id}`).set(bearer(token))
        .send({ isActive: false })).status
    ).toBe(403);
  });

  it('can only author a role with permissions it holds', async () => {
    const { token } = await delegatedStaff();
    // beyond their set → 403
    expect(
      (await request(app).post('/api/admin/roles').set(bearer(token))
        .send({ name: 'Grab', permissions: ['settings:manage'] })).status
    ).toBe(403);
    // within their set → 201
    expect(
      (await request(app).post('/api/admin/roles').set(bearer(token))
        .send({ name: 'Desk copy', permissions: ['orders:manage'] })).status
    ).toBe(201);
  });

  it('cannot assign a role more powerful than itself', async () => {
    const { token } = await delegatedStaff();
    const { user: target } = await createUser({ role: 'STAFF' });
    const strong = await prisma.role.create({
      data: { name: 'Strong', permissions: ['settings:manage'] },
    });
    const res = await request(app)
      .post('/api/admin/team/assign-role')
      .set(bearer(token))
      .send({ userId: target.id, roleId: strong.id });
    expect(res.status).toBe(403);
  });

  it('cannot edit or delete a role that outranks it', async () => {
    const { token } = await delegatedStaff();
    const strong = await prisma.role.create({
      data: { name: 'Strong2', permissions: ['settings:manage', 'products:manage'] },
    });
    expect(
      (await request(app).patch(`/api/admin/roles/${strong.id}`).set(bearer(token))
        .send({ name: 'renamed' })).status
    ).toBe(403);
    expect(
      (await request(app).delete(`/api/admin/roles/${strong.id}`).set(bearer(token))).status
    ).toBe(403);
  });

  it('still can do the legitimate job: create a STAFF account with an in-ceiling role', async () => {
    const { token } = await delegatedStaff();
    const deskRole = await prisma.role.create({
      data: { name: 'Desk3', permissions: ['orders:view'] },
    });
    const res = await request(app)
      .post('/api/admin/team')
      .set(bearer(token))
      .send({ name: 'New', email: 'newstaff@x.test', password: 'longenough', role: 'STAFF', roleId: deskRole.id });
    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe('STAFF');
  });

  it('writes an audit row for an RBAC change', async () => {
    const before = await prisma.auditLog.count({ where: { action: 'role.created' } });
    await request(app)
      .post('/api/admin/roles')
      .set(bearer(adminToken))
      .send({ name: 'Audited', permissions: ['orders:view'] });
    expect(await prisma.auditLog.count({ where: { action: 'role.created' } })).toBe(before + 1);
  });
});

describe('GET /api/users/me', () => {
  it('carries the caller’s effective permissions and role name', async () => {
    const { token } = await staffWithRole(['dashboard:view', 'orders:view'], 'Support');

    const me = await request(app).get('/api/users/me').set(bearer(token));
    expect(me.status).toBe(200);
    expect(me.body.user.roleName).toBe('Support');
    expect([...me.body.user.permissions].sort()).toEqual(['dashboard:view', 'orders:view']);

    // A plain admin gets every key and no role name.
    const adminMe = await request(app).get('/api/users/me').set(bearer(adminToken));
    expect(adminMe.body.user.roleName).toBeNull();
    expect([...adminMe.body.user.permissions].sort()).toEqual([...ALL_PERMISSIONS].sort());
  });
});
