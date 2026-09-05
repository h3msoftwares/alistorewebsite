import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { buildApp } from '../../src/app';
import { prisma } from '../../src/config/prisma';
import { createAdmin, createCustomer, bearer } from '../helpers/auth';
import { makeCollection } from '../helpers/factories';

const app = buildApp();

let adminToken: string;
let customerToken: string;

beforeEach(async () => {
  adminToken = (await createAdmin()).token;
  customerToken = (await createCustomer()).token;
  // resetDb() truncates the seeded singleton — getSettings() self-heals it.
});

describe('Site settings API', () => {
  it('GET returns the singleton with defaults and an empty announcement list', async () => {
    const res = await request(app).get('/api/settings');
    expect(res.status).toBe(200);
    expect(res.body.settings).toMatchObject({
      id: 1,
      brandNameEn: "Ali's Store",
      announcementActive: true,
      instagramUrl: null,
      contactEmail: null,
    });
    expect(Array.isArray(res.body.settings.announcementLines)).toBe(true);
  });

  it('PATCH requires auth and staff role', async () => {
    expect((await request(app).patch('/api/settings').send({ brandNameEn: 'X' })).status).toBe(401);
    expect(
      (await request(app).patch('/api/settings').set(bearer(customerToken)).send({ brandNameEn: 'X' })).status
    ).toBe(403);
  });

  it('admin PATCH updates scalars and echoes them back', async () => {
    const res = await request(app)
      .patch('/api/settings')
      .set(bearer(adminToken))
      .send({
        brandNameEn: 'Rima Boutique',
        announcementActive: false,
        instagramUrl: 'https://instagram.com/rima',
        contactEmail: 'hi@rima.test',
        contactPhone: '+961 71 000 000',
      });
    expect(res.status).toBe(200);
    expect(res.body.settings).toMatchObject({
      brandNameEn: 'Rima Boutique',
      announcementActive: false,
      instagramUrl: 'https://instagram.com/rima',
      contactEmail: 'hi@rima.test',
      contactPhone: '+961 71 000 000',
    });
  });

  it('empty string clears a nullable field', async () => {
    await request(app).patch('/api/settings').set(bearer(adminToken)).send({ instagramUrl: 'https://x.test' });
    const res = await request(app).patch('/api/settings').set(bearer(adminToken)).send({ instagramUrl: '' });
    expect(res.body.settings.instagramUrl).toBeNull();
  });

  it('rejects an invalid URL and a bad email', async () => {
    expect(
      (await request(app).patch('/api/settings').set(bearer(adminToken)).send({ facebookUrl: 'not a url' })).status
    ).toBe(400);
    expect(
      (await request(app).patch('/api/settings').set(bearer(adminToken)).send({ contactEmail: 'nope' })).status
    ).toBe(400);
  });

  it('announcementLines replace the whole strip, in order', async () => {
    const res = await request(app)
      .patch('/api/settings')
      .set(bearer(adminToken))
      .send({
        announcementLines: [
          { textEn: 'Line A', textAr: 'سطر أ' },
          { textEn: 'Line B', textAr: 'سطر ب' },
        ],
      });
    expect(res.body.settings.announcementLines).toHaveLength(2);
    expect(res.body.settings.announcementLines.map((l: { textEn: string }) => l.textEn)).toEqual(['Line A', 'Line B']);
    expect(res.body.settings.announcementLines.map((l: { sortOrder: number }) => l.sortOrder)).toEqual([0, 1]);

    const cleared = await request(app)
      .patch('/api/settings')
      .set(bearer(adminToken))
      .send({ announcementLines: [] });
    expect(cleared.body.settings.announcementLines).toHaveLength(0);
  });

  it('links / clears the hero CTA collection and rejects an unknown id', async () => {
    const col = await makeCollection({ slug: 'summer-hero' });

    const linked = await request(app)
      .patch('/api/settings')
      .set(bearer(adminToken))
      .send({ heroCtaCollectionId: col.id });
    expect(linked.body.settings.heroCtaCollection).toMatchObject({ id: col.id, slug: 'summer-hero' });

    const cleared = await request(app)
      .patch('/api/settings')
      .set(bearer(adminToken))
      .send({ heroCtaCollectionId: '' });
    expect(cleared.body.settings.heroCtaCollectionID).toBeNull();

    const bad = await request(app)
      .patch('/api/settings')
      .set(bearer(adminToken))
      .send({ heroCtaCollectionId: '00000000-0000-4000-8000-000000000000' });
    expect(bad.status).toBe(404);
  });

  it('persists across GET', async () => {
    await request(app).patch('/api/settings').set(bearer(adminToken)).send({ brandNameAr: 'متجر ريما' });
    const res = await request(app).get('/api/settings');
    expect(res.body.settings.brandNameAr).toBe('متجر ريما');
    expect(await prisma.siteSetting.findUnique({ where: { id: 1 } })).not.toBeNull();
  });
});
