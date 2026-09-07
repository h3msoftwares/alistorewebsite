import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { buildApp } from '../../src/app';
import { prisma } from '../../src/config/prisma';
import { makeCollection, makeCategory, makeProduct } from '../helpers/factories';

// See orders.test.ts — same mock, same reason (guest checkout now requires a
// real email-OTP round trip).
vi.mock('../../src/lib/mailer', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/mailer')>();
  return { ...actual, sendCheckoutOtpEmail: vi.fn().mockResolvedValue(true) };
});
import { sendCheckoutOtpEmail } from '../../src/lib/mailer';
const mockSendOtp = vi.mocked(sendCheckoutOtpEmail);
const HCAPTCHA_DUMMY_TOKEN = '10000000-aaaa-bbbb-cccc-000000000001';

const app = buildApp();

const delivery = {
  deliveryName: 'Jane Doe',
  deliveryPhone: '0791234567',
  deliveryAddress: '12 Rainbow Street',
  deliveryCity: 'Jounieh',
  deliveryRegion: 'MOUNT_LEBANON',
};

let variantId: string;

beforeEach(async () => {
  const col = await makeCollection({ slug: 'c' });
  const cat = await makeCategory(col.id);
  const p = await makeProduct(col.id, cat.id, {
    over: { price: 20 },
    variants: [{ sku: 'v1', size: 'M', color: 'Black', stockQuantity: 10 }],
  });
  variantId = p.variants[0].id;
});

/** Set the delivery-fee config on the singleton row. */
async function configure({
  rates,
  ...scalars
}: {
  deliveryFeeEnabled?: boolean;
  deliveryFeeFlat?: number;
  freeDeliveryThreshold?: number | null;
  freeDeliveryRegions?: string[];
  rates?: { region: string; fee: number }[];
}) {
  await prisma.siteSetting.upsert({
    where: { id: 1 },
    create: { id: 1, ...scalars },
    update: scalars,
  });
  await prisma.deliveryRate.deleteMany({ where: { settingID: 1 } });
  if (rates?.length) {
    await prisma.deliveryRate.createMany({
      data: rates.map((r, i) => ({ settingID: 1, region: r.region, fee: r.fee, sortOrder: i })),
    });
  }
}

async function checkout(quantity = 2, body: Record<string, unknown> = delivery) {
  const agent = request.agent(app);
  expect((await agent.post('/api/cart/items').send({ variantId, quantity })).status).toBe(201);

  const guestEmail = (body.guestEmail as string | undefined) ?? 'df@test.dev';
  mockSendOtp.mockClear();
  expect(
    (await agent.post('/api/checkout/otp/request').send({ email: guestEmail, captchaToken: HCAPTCHA_DUMMY_TOKEN }))
      .status
  ).toBe(204);
  const code = mockSendOtp.mock.calls.at(-1)?.[1] as string;
  const verify = await agent.post('/api/checkout/otp/verify').send({ email: guestEmail, code });
  expect(verify.status).toBe(200);

  return {
    agent,
    res: await agent
      .post('/api/orders/checkout')
      .send({ ...body, guestEmail, emailVerifyToken: verify.body.verifyToken }),
  };
}

describe('delivery fee at checkout', () => {
  it('disabled config ⇒ fee 0, total == subtotal', async () => {
    await configure({ deliveryFeeEnabled: false, deliveryFeeFlat: 5 });
    const { res } = await checkout(2); // 2 × 20 = 40
    expect(res.status).toBe(201);
    expect(Number(res.body.order.deliveryFee)).toBe(0);
    expect(Number(res.body.order.total)).toBe(40);
  });

  it('flat fee ⇒ total = subtotal + flat', async () => {
    await configure({ deliveryFeeEnabled: true, deliveryFeeFlat: 5 });
    const { res } = await checkout(2);
    expect(Number(res.body.order.deliveryFee)).toBe(5);
    expect(Number(res.body.order.subtotal)).toBe(40);
    expect(Number(res.body.order.total)).toBe(45);
  });

  it('per-governorate override wins over the flat fee', async () => {
    await configure({
      deliveryFeeEnabled: true,
      deliveryFeeFlat: 5,
      rates: [{ region: 'MOUNT_LEBANON', fee: 2 }],
    });
    const { res } = await checkout(2);
    expect(Number(res.body.order.deliveryFee)).toBe(2);
    expect(Number(res.body.order.total)).toBe(42);
  });

  it('free once the subtotal reaches the threshold', async () => {
    await configure({ deliveryFeeEnabled: true, deliveryFeeFlat: 5, freeDeliveryThreshold: 30 });
    const { res } = await checkout(2); // 40 ≥ 30
    expect(Number(res.body.order.deliveryFee)).toBe(0);
    expect(Number(res.body.order.total)).toBe(40);
  });

  it('free for a governorate on the free list', async () => {
    await configure({
      deliveryFeeEnabled: true,
      deliveryFeeFlat: 5,
      freeDeliveryRegions: ['MOUNT_LEBANON'],
    });
    const { res } = await checkout(2);
    expect(Number(res.body.order.deliveryFee)).toBe(0);
  });

  it('applies a custom (non-governorate) region rate', async () => {
    await configure({
      deliveryFeeEnabled: true,
      deliveryFeeFlat: 5,
      rates: [{ region: 'Outside Lebanon', fee: 12 }],
    });
    const { res } = await checkout(2, { ...delivery, deliveryRegion: 'Outside Lebanon' });
    expect(res.status).toBe(201);
    expect(Number(res.body.order.deliveryFee)).toBe(12);
    expect(res.body.order.deliveryRegion).toBe('Outside Lebanon');
  });

  it('rejects a checkout naming a region with no built-in or configured match', async () => {
    await configure({ deliveryFeeEnabled: true, deliveryFeeFlat: 5 });
    const { res } = await checkout(2, { ...delivery, deliveryRegion: 'Nowhere Zone' });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/orders/delivery-quote', () => {
  it('quotes the fee for the guest cart + chosen region', async () => {
    await configure({
      deliveryFeeEnabled: true,
      deliveryFeeFlat: 5,
      freeDeliveryThreshold: 100,
      rates: [{ region: 'BEIRUT', fee: 2 }],
    });
    const agent = request.agent(app);
    await agent.post('/api/cart/items').send({ variantId, quantity: 2 }); // subtotal 40

    const beirut = await agent.get('/api/orders/delivery-quote?region=BEIRUT');
    expect(beirut.status).toBe(200);
    expect(beirut.body).toMatchObject({ subtotal: 40, deliveryFee: 2, total: 42, freeReason: null });

    const north = await agent.get('/api/orders/delivery-quote?region=NORTH');
    expect(north.body).toMatchObject({ deliveryFee: 5, total: 45 });
  });

  it('reports freeReason when disabled', async () => {
    await configure({ deliveryFeeEnabled: false });
    const agent = request.agent(app);
    await agent.post('/api/cart/items').send({ variantId, quantity: 1 });
    const res = await agent.get('/api/orders/delivery-quote?region=BEIRUT');
    expect(res.body).toMatchObject({ deliveryFee: 0, freeReason: 'disabled' });
  });

  it('quotes a well-formed unknown region at the flat fee, but 400s a blank one', async () => {
    await configure({ deliveryFeeEnabled: true, deliveryFeeFlat: 5 });
    const agent = request.agent(app);
    await agent.post('/api/cart/items').send({ variantId, quantity: 2 });

    const ok = await agent.get('/api/orders/delivery-quote?region=Some%20New%20Zone');
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ deliveryFee: 5 });

    expect((await agent.get('/api/orders/delivery-quote?region=')).status).toBe(400);
  });
});
