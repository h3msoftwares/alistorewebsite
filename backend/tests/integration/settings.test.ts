import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { buildApp } from '../../src/app';
import { prisma } from '../../src/config/prisma';
import { createAdmin, createCustomer, bearer } from '../helpers/auth';
import { makeCategory } from '../helpers/factories';

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
      brandNameEn: "Ali'sStore",
      announcementActive: true,
      instagramUrl: null,
      contactEmail: null,
    });
    expect(Array.isArray(res.body.settings.announcementLines)).toBe(true);
  });

  it('PATCH requires auth and (since S4) the ADMIN role', async () => {
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

  it('sets and clears the outgoing-email sender identity (mailFromName / mailFromEmail)', async () => {
    const set = await request(app)
      .patch('/api/settings')
      .set(bearer(adminToken))
      .send({ mailFromName: 'Rima Boutique', mailFromEmail: 'orders@rima.test' });
    expect(set.status).toBe(200);
    expect(set.body.settings).toMatchObject({
      mailFromName: 'Rima Boutique',
      mailFromEmail: 'orders@rima.test',
    });

    const cleared = await request(app)
      .patch('/api/settings')
      .set(bearer(adminToken))
      .send({ mailFromName: '', mailFromEmail: '' });
    expect(cleared.body.settings.mailFromName).toBeNull();
    expect(cleared.body.settings.mailFromEmail).toBeNull();

    expect(
      (await request(app).patch('/api/settings').set(bearer(adminToken)).send({ mailFromEmail: 'nope' })).status
    ).toBe(400);
  });

  it('rejects an invalid URL and a bad email', async () => {
    expect(
      (await request(app).patch('/api/settings').set(bearer(adminToken)).send({ facebookUrl: 'not a url' })).status
    ).toBe(400);
    expect(
      (await request(app).patch('/api/settings').set(bearer(adminToken)).send({ contactEmail: 'nope' })).status
    ).toBe(400);
  });

  it('rejects a non-http(s) URL scheme (stored-XSS guard)', async () => {
    for (const bad of [
      'javascript:alert(document.cookie)',
      'JavaScript:alert(1)',
      '  javascript:alert(1)  ',
      'data:text/html,<script>alert(1)</script>',
      'vbscript:msgbox(1)',
    ]) {
      const res = await request(app)
        .patch('/api/settings')
        .set(bearer(adminToken))
        .send({ instagramUrl: bad });
      expect(res.status, bad).toBe(400);
    }
    // and it did not persist any of them
    expect((await request(app).get('/api/settings')).body.settings.instagramUrl).toBeNull();
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

  it('links / clears the hero CTA category and rejects an unknown id', async () => {
    const cat = await makeCategory({ slug: 'summer-hero' });

    const linked = await request(app)
      .patch('/api/settings')
      .set(bearer(adminToken))
      .send({ heroCtaCategoryId: cat.id });
    expect(linked.body.settings.heroCtaCategory).toMatchObject({ id: cat.id, slug: 'summer-hero' });

    const cleared = await request(app)
      .patch('/api/settings')
      .set(bearer(adminToken))
      .send({ heroCtaCategoryId: '' });
    expect(cleared.body.settings.heroCtaCategoryID).toBeNull();

    const bad = await request(app)
      .patch('/api/settings')
      .set(bearer(adminToken))
      .send({ heroCtaCategoryId: '00000000-0000-4000-8000-000000000000' });
    expect(bad.status).toBe(404);
  });

  it('persists across GET', async () => {
    await request(app).patch('/api/settings').set(bearer(adminToken)).send({ brandNameAr: 'متجر ريما' });
    const res = await request(app).get('/api/settings');
    expect(res.body.settings.brandNameAr).toBe('متجر ريما');
    expect(await prisma.siteSetting.findUnique({ where: { id: 1 } })).not.toBeNull();
  });

  describe('store locations', () => {
    const patch = (body: unknown) =>
      request(app).patch('/api/settings').set(bearer(adminToken)).send(body);

    it('creates multiple locations, each with its own name, address, map, image and hours', async () => {
      const res = await patch({
        storeLocations: [
          {
            nameEn: 'Hamra branch',
            nameAr: 'فرع الحمرا',
            addressEn: '12 Hamra Street, Beirut',
            mapUrl: 'https://maps.google.com/?q=hamra',
            imageUrl: 'https://ik.imagekit.io/demo/hamra.jpg',
            imageFileId: 'file_hamra',
            hours: [
              { dayOfWeek: 0, opensAt: '10:00', closesAt: '20:00' },
              { dayOfWeek: 4, opensAt: '10:00', closesAt: '22:00' },
            ],
          },
          {
            nameEn: 'Jounieh branch',
            addressEn: 'Main Road, Jounieh',
            hours: [{ dayOfWeek: 5, opensAt: '11:00', closesAt: '19:00' }],
          },
        ],
      });
      expect(res.status).toBe(200);
      const locs = res.body.settings.storeLocations;
      expect(locs).toHaveLength(2);
      expect(locs.map((l: { nameEn: string }) => l.nameEn)).toEqual(['Hamra branch', 'Jounieh branch']);
      expect(locs.map((l: { sortOrder: number }) => l.sortOrder)).toEqual([0, 1]);
      expect(locs[0]).toMatchObject({
        addressEn: '12 Hamra Street, Beirut',
        mapUrl: 'https://maps.google.com/?q=hamra',
        imageUrl: 'https://ik.imagekit.io/demo/hamra.jpg',
        imageFileId: 'file_hamra',
      });
      expect(locs[0].hours.map((h: { dayOfWeek: number }) => h.dayOfWeek)).toEqual([0, 4]);
      expect(locs[1].hours).toHaveLength(1);
    });

    it('storeLocations is replace-all; [] clears every location (and its hours)', async () => {
      await patch({
        storeLocations: [
          { nameEn: 'A', hours: [{ dayOfWeek: 1, opensAt: '09:00', closesAt: '17:00' }] },
          { nameEn: 'B' },
        ],
      });
      const replaced = await patch({ storeLocations: [{ nameEn: 'C' }] });
      expect(replaced.body.settings.storeLocations.map((l: { nameEn: string }) => l.nameEn)).toEqual(['C']);

      const cleared = await patch({ storeLocations: [] });
      expect(cleared.body.settings.storeLocations).toHaveLength(0);
    });

    it('rejects a bad time, an inverted range, and a non-http(s) map link', async () => {
      expect(
        (await patch({ storeLocations: [{ hours: [{ dayOfWeek: 0, opensAt: '9am', closesAt: '17:00' }] }] })).status
      ).toBe(400);
      expect(
        (await patch({ storeLocations: [{ hours: [{ dayOfWeek: 0, opensAt: '18:00', closesAt: '09:00' }] }] })).status
      ).toBe(400);
      expect((await patch({ storeLocations: [{ mapUrl: 'javascript:alert(1)' }] })).status).toBe(400);
    });

    it('empty strings on a location clear its nullable fields', async () => {
      await patch({
        storeLocations: [
          { nameEn: 'x', addressEn: 'y', mapUrl: 'https://x.test', imageUrl: 'https://x.test/a.jpg', imageFileId: 'f1' },
        ],
      });
      const cleared = await patch({
        storeLocations: [{ nameEn: '', addressEn: '', mapUrl: '', imageUrl: '', imageFileId: '' }],
      });
      expect(cleared.body.settings.storeLocations[0]).toMatchObject({
        nameEn: null,
        addressEn: null,
        mapUrl: null,
        imageUrl: null,
        imageFileId: null,
      });
    });
  });

  describe('our story page copy', () => {
    const patch = (body: unknown) =>
      request(app).patch('/api/settings').set(bearer(adminToken)).send(body);

    it('stores title/body per language and clears them with an empty string', async () => {
      const set = await patch({
        storyTitleEn: 'Our story',
        storyBodyEn: 'We started in a Beirut living room.\n\nNow we ship nationwide.',
        storyTitleAr: 'قصتنا',
        storyBodyAr: 'بدأنا في غرفة معيشة في بيروت.',
      });
      expect(set.status).toBe(200);
      expect(set.body.settings).toMatchObject({
        storyTitleEn: 'Our story',
        storyTitleAr: 'قصتنا',
        storyBodyEn: 'We started in a Beirut living room.\n\nNow we ship nationwide.',
      });

      const cleared = await patch({ storyTitleEn: '', storyBodyEn: '' });
      expect(cleared.body.settings.storyTitleEn).toBeNull();
      expect(cleared.body.settings.storyBodyEn).toBeNull();
      // untouched language survives
      expect(cleared.body.settings.storyTitleAr).toBe('قصتنا');
    });

    it('rejects a body over the length cap', async () => {
      expect((await patch({ storyBodyEn: 'x'.repeat(8001) })).status).toBe(400);
    });

    it('stores + clears the side image; rejects a non-http(s) URL', async () => {
      const set = await patch({
        storyImageUrl: 'https://ik.imagekit.io/demo/story.jpg',
        storyImageFileId: 'file_story',
      });
      expect(set.body.settings.storyImageUrl).toBe('https://ik.imagekit.io/demo/story.jpg');
      expect(set.body.settings.storyImageFileId).toBe('file_story');

      const cleared = await patch({ storyImageUrl: '', storyImageFileId: '' });
      expect(cleared.body.settings.storyImageUrl).toBeNull();
      expect(cleared.body.settings.storyImageFileId).toBeNull();

      expect((await patch({ storyImageUrl: 'javascript:alert(1)' })).status).toBe(400);
    });
  });

  describe('home showcases', () => {
    const patch = (body: unknown) =>
      request(app).patch('/api/settings').set(bearer(adminToken)).send(body);

    it('upserts by type, returns them ordered by sortOrder, and clears a label with ""', async () => {
      const res = await patch({
        showcases: [
          { type: 'BEST_SELLERS', isActive: true, sortOrder: 6, labelEn: 'Top picks', labelAr: 'الأفضل' },
          { type: 'ON_SALE', isActive: true, sortOrder: 3 },
          { type: 'NEW_ARRIVALS', isActive: false, sortOrder: 9 },
        ],
      });
      expect(res.status).toBe(200);
      const list = res.body.settings.showcases;
      expect(list.map((s: { type: string }) => s.type)).toEqual([
        'ON_SALE',
        'BEST_SELLERS',
        'NEW_ARRIVALS',
      ]);
      expect(list.find((s: { type: string }) => s.type === 'BEST_SELLERS')).toMatchObject({
        isActive: true,
        sortOrder: 6,
        labelEn: 'Top picks',
      });

      const cleared = await patch({
        showcases: [{ type: 'BEST_SELLERS', isActive: true, sortOrder: 6, labelEn: '' }],
      });
      expect(
        cleared.body.settings.showcases.find((s: { type: string }) => s.type === 'BEST_SELLERS').labelEn
      ).toBeNull();
      // types not sent are left untouched
      expect(
        cleared.body.settings.showcases.find((s: { type: string }) => s.type === 'ON_SALE').isActive
      ).toBe(true);
    });

    it('rejects an unknown type and a duplicate type', async () => {
      expect((await patch({ showcases: [{ type: 'WISHLIST', isActive: true, sortOrder: 1 }] })).status).toBe(400);
      expect(
        (
          await patch({
            showcases: [
              { type: 'ON_SALE', isActive: true, sortOrder: 1 },
              { type: 'ON_SALE', isActive: false, sortOrder: 2 },
            ],
          })
        ).status
      ).toBe(400);
    });
  });

  describe('customer review images', () => {
    const patch = (body: unknown) =>
      request(app).patch('/api/settings').set(bearer(adminToken)).send(body);

    it('replace-all, ordered; [] clears the strip', async () => {
      const set = await patch({
        reviewImages: [
          { imageUrl: 'https://ik.imagekit.io/demo/r1.jpg', imageFileId: 'f1' },
          { imageUrl: 'https://ik.imagekit.io/demo/r2.jpg' },
        ],
      });
      expect(set.status).toBe(200);
      expect(set.body.settings.reviewImages).toHaveLength(2);
      expect(set.body.settings.reviewImages.map((r: { imageUrl: string }) => r.imageUrl)).toEqual([
        'https://ik.imagekit.io/demo/r1.jpg',
        'https://ik.imagekit.io/demo/r2.jpg',
      ]);
      expect(set.body.settings.reviewImages.map((r: { sortOrder: number }) => r.sortOrder)).toEqual([0, 1]);

      const replaced = await patch({
        reviewImages: [{ imageUrl: 'https://ik.imagekit.io/demo/r3.jpg' }],
      });
      expect(replaced.body.settings.reviewImages.map((r: { imageUrl: string }) => r.imageUrl)).toEqual([
        'https://ik.imagekit.io/demo/r3.jpg',
      ]);

      const cleared = await patch({ reviewImages: [] });
      expect(cleared.body.settings.reviewImages).toHaveLength(0);
    });

    it('rejects a non-http(s) image URL', async () => {
      expect(
        (await patch({ reviewImages: [{ imageUrl: 'javascript:alert(1)' }] })).status
      ).toBe(400);
    });
  });

  describe('delivery fee config', () => {
    const patch = (body: unknown) =>
      request(app).patch('/api/settings').set(bearer(adminToken)).send(body);

    it('admin sets the flat fee, threshold and free governorates', async () => {
      const res = await patch({
        deliveryFeeEnabled: true,
        deliveryFeeFlat: 4,
        freeDeliveryThreshold: 60,
        freeDeliveryRegions: ['BEIRUT', 'MOUNT_LEBANON'],
      });
      expect(res.status).toBe(200);
      expect(res.body.settings).toMatchObject({
        deliveryFeeEnabled: true,
        freeDeliveryRegions: ['BEIRUT', 'MOUNT_LEBANON'],
      });
      expect(Number(res.body.settings.deliveryFeeFlat)).toBe(4);
      expect(Number(res.body.settings.freeDeliveryThreshold)).toBe(60);
    });

    it('deliveryRates is replace-all, ordered, and null threshold clears', async () => {
      const set = await patch({
        deliveryRates: [
          { region: 'NORTH', fee: 6 },
          { region: 'BEIRUT', fee: 2 },
        ],
      });
      expect(set.body.settings.deliveryRates.map((r: { region: string }) => r.region)).toEqual([
        'NORTH',
        'BEIRUT',
      ]);

      await patch({ freeDeliveryThreshold: 30 });
      const cleared = await patch({ deliveryRates: [], freeDeliveryThreshold: null });
      expect(cleared.body.settings.deliveryRates).toHaveLength(0);
      expect(cleared.body.settings.freeDeliveryThreshold).toBeNull();
    });

    it('accepts custom region names; rejects a negative fee and duplicates (400)', async () => {
      expect((await patch({ deliveryFeeFlat: -1 })).status).toBe(400);

      const custom = await patch({
        deliveryRates: [{ region: 'Zahle Special', fee: 3 }],
        freeDeliveryRegions: ['Beirut Suburb'],
      });
      expect(custom.status).toBe(200);
      expect(custom.body.settings.deliveryRates[0].region).toBe('Zahle Special');
      expect(custom.body.settings.freeDeliveryRegions).toContain('Beirut Suburb');

      expect(
        (
          await patch({
            deliveryRates: [
              { region: 'BEIRUT', fee: 1 },
              { region: 'BEIRUT', fee: 2 },
            ],
          })
        ).status
      ).toBe(400);
    });
  });
});
