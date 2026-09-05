import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { buildApp } from '../../src/app';
import { createAdmin, bearer } from '../helpers/auth';
import { makeCollection, makeCategory, makeProduct } from '../helpers/factories';

// Route-level coverage that add/delete actually threads `fileId` through the
// Zod schema -> Prisma row -> ImageKit cleanup, end to end (unit coverage of
// the cleanup decision itself lives in image-cleanup.test.ts).
vi.mock('../../src/modules/uploads/upload.service', () => ({
  deleteImageKitFile: vi.fn(),
}));
import { deleteImageKitFile } from '../../src/modules/uploads/upload.service';

const app = buildApp();

beforeEach(() => {
  vi.mocked(deleteImageKitFile).mockClear();
});

describe('Catalog image ImageKit cleanup (admin sub-resource routes)', () => {
  it('product image: stores fileId on add, deletes the ImageKit file on remove', async () => {
    const { token } = await createAdmin();
    const col = await makeCollection();
    const cat = await makeCategory(col.id);
    const product = await makeProduct(col.id, cat.id);

    const add = await request(app)
      .post(`/api/products/${product.id}/images`)
      .set(bearer(token))
      .send({ url: 'https://ik.imagekit.io/demo/p.jpg', fileId: 'pf-1' });
    expect(add.status).toBe(201);
    expect(add.body.image.fileId).toBe('pf-1');

    const del = await request(app)
      .delete(`/api/products/${product.id}/images/${add.body.image.id}`)
      .set(bearer(token));
    expect(del.status).toBe(204);
    expect(deleteImageKitFile).toHaveBeenCalledWith('pf-1');
  });

  it('product image without a fileId (legacy/manual) deletes cleanly with no ImageKit call', async () => {
    const { token } = await createAdmin();
    const col = await makeCollection();
    const cat = await makeCategory(col.id);
    const product = await makeProduct(col.id, cat.id);

    const add = await request(app)
      .post(`/api/products/${product.id}/images`)
      .set(bearer(token))
      .send({ url: 'https://ik.imagekit.io/demo/p.jpg' });
    expect(add.body.image.fileId).toBeFalsy();

    const del = await request(app)
      .delete(`/api/products/${product.id}/images/${add.body.image.id}`)
      .set(bearer(token));
    expect(del.status).toBe(204);
    expect(deleteImageKitFile).not.toHaveBeenCalled();
  });

  it('category image delete cleans up its ImageKit file', async () => {
    const { token } = await createAdmin();
    const col = await makeCollection();
    const cat = await makeCategory(col.id);

    const add = await request(app)
      .post(`/api/categories/${cat.id}/images`)
      .set(bearer(token))
      .send({ url: 'https://ik.imagekit.io/demo/c.jpg', fileId: 'cf-1' });

    await request(app).delete(`/api/categories/${cat.id}/images/${add.body.image.id}`).set(bearer(token));
    expect(deleteImageKitFile).toHaveBeenCalledWith('cf-1');
  });

  it('permanently deleting an (empty) category cascades ImageKit cleanup for all its images', async () => {
    const { token } = await createAdmin();
    const col = await makeCollection();
    const cat = await makeCategory(col.id);

    await request(app)
      .post(`/api/categories/${cat.id}/images`)
      .set(bearer(token))
      .send({ url: 'https://ik.imagekit.io/demo/c1.jpg', fileId: 'cf-a' });
    await request(app)
      .post(`/api/categories/${cat.id}/images`)
      .set(bearer(token))
      .send({ url: 'https://ik.imagekit.io/demo/c2.jpg', fileId: 'cf-b' });

    await request(app).delete(`/api/categories/${cat.id}`).set(bearer(token)); // archive first
    const del = await request(app).delete(`/api/categories/${cat.id}/permanent`).set(bearer(token));
    expect(del.status).toBe(204);
    expect(deleteImageKitFile).toHaveBeenCalledWith('cf-a');
    expect(deleteImageKitFile).toHaveBeenCalledWith('cf-b');
  });

  it('collection image delete cleans up its ImageKit file', async () => {
    const { token } = await createAdmin();
    const col = await makeCollection();

    const add = await request(app)
      .post(`/api/collections/${col.id}/images`)
      .set(bearer(token))
      .send({ url: 'https://ik.imagekit.io/demo/k.jpg', fileId: 'kf-1' });

    await request(app).delete(`/api/collections/${col.id}/images/${add.body.image.id}`).set(bearer(token));
    expect(deleteImageKitFile).toHaveBeenCalledWith('kf-1');
  });

  it('permanently deleting an (empty) collection cascades ImageKit cleanup for its images', async () => {
    const { token } = await createAdmin();
    const col = await makeCollection();

    await request(app)
      .post(`/api/collections/${col.id}/images`)
      .set(bearer(token))
      .send({ url: 'https://ik.imagekit.io/demo/k.jpg', fileId: 'kf-2' });

    await request(app).delete(`/api/collections/${col.id}`).set(bearer(token)); // archive first
    const del = await request(app).delete(`/api/collections/${col.id}/permanent`).set(bearer(token));
    expect(del.status).toBe(204);
    expect(deleteImageKitFile).toHaveBeenCalledWith('kf-2');
  });

  it('deleting a product (soft delete) does not touch its images or call ImageKit', async () => {
    const { token } = await createAdmin();
    const col = await makeCollection();
    const cat = await makeCategory(col.id);
    const product = await makeProduct(col.id, cat.id);

    await request(app)
      .post(`/api/products/${product.id}/images`)
      .set(bearer(token))
      .send({ url: 'https://ik.imagekit.io/demo/p.jpg', fileId: 'pf-keep' });

    const del = await request(app).delete(`/api/products/${product.id}`).set(bearer(token));
    expect(del.status).toBe(204);
    // Soft delete keeps order history intact — the image row (and its
    // ImageKit asset) must survive untouched.
    expect(deleteImageKitFile).not.toHaveBeenCalled();
  });
});
