'use client';

import { useState } from 'react';
import { Inbox, PackageX } from 'lucide-react';
import {
  Alert,
  Badge,
  Button,
  Choice,
  DataTable,
  Drawer,
  EmptyState,
  Field,
  Input,
  ProductCard,
  ProductGridSkeleton,
  QuantityStepper,
  Select,
  SizeChip,
  StatusPill,
  Swatch,
  Textarea,
  type ProductCardData,
  type OrderStatus,
} from '@/components/ui';

const COLLECTION_SLUGS = ['women', 'men', 'kids'] as const;

const MOCK: Record<(typeof COLLECTION_SLUGS)[number], ProductCardData> = {
  women: {
    id: 'mock-women-1',
    nameEn: 'Silk Robe',
    nameAr: 'روب حرير',
    price: 49.99,
    compareAtPrice: 69.99,
    sizes: ['S', 'M', 'L'],
    images: [
      { url: 'https://ik.imagekit.io/demo/img/image4.jpeg', altEn: 'Silk robe' },
      { url: 'https://ik.imagekit.io/demo/img/image1.jpeg', altEn: 'Silk robe, back' },
    ],
  },
  men: {
    id: 'mock-men-1',
    nameEn: 'Tailored Blazer',
    nameAr: 'بليزر مفصل',
    price: 89.0,
    sizes: ['M', 'L', 'XL'],
    images: [{ url: 'https://ik.imagekit.io/demo/img/image2.jpeg', altEn: 'Tailored blazer' }],
  },
  kids: {
    id: 'mock-kids-1',
    nameEn: 'Playful Hoodie',
    nameAr: 'هودي مرح',
    price: 24.5,
    compareAtPrice: 32.0,
    sizes: ['4Y', '6Y'],
    images: [{ url: 'https://ik.imagekit.io/demo/img/image3.jpeg', altEn: 'Playful hoodie' }],
  },
};

const STATUSES: OrderStatus[] = ['PENDING', 'CONFIRMED', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'RETURNED'];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBlockEnd: 'var(--space-9)' }}>
      <h2>{title}</h2>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-5)', alignItems: 'flex-start' }}>
        {children}
      </div>
    </section>
  );
}

export function UiShowcase({ locale }: { locale: 'en' | 'ar' }) {
  const [qty, setQty] = useState(1);
  const [size, setSize] = useState('M');
  const [color, setColor] = useState('navy');
  const [menuOpen, setMenuOpen] = useState(false);
  const [showError, setShowError] = useState(false);

  return (
    <div className="container section">
      <p className="eyebrow">Ali&apos;s Store</p>
      <h1>
        Design <em>system</em> — {locale.toUpperCase()}
      </h1>
      <p className="prose">
        Every primitive and state, in the current locale/direction. Toggle the header language switch to
        see the RTL mirror.
      </p>

      <Section title="Buttons">
        <Button variant="primary">Primary</Button>
        <Button variant="outline">Outline</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="accent">Accent</Button>
        <Button variant="danger">Danger</Button>
        <Button loading>Loading</Button>
        <Button disabled>Disabled</Button>
        <Button size="sm">Small</Button>
        <Button size="lg">Large</Button>
      </Section>

      <Section title="Badges & status">
        <Badge variant="sale">Sale</Badge>
        <Badge variant="save">Save $20.00</Badge>
        <Badge variant="new">New</Badge>
        <Badge variant="low-stock">Low stock</Badge>
        {STATUSES.map((s) => (
          <StatusPill key={s} status={s} locale={locale} />
        ))}
      </Section>

      <Section title="Form controls">
        <div style={{ minWidth: 280 }}>
          <Field label="Full name" required hint="As it appears on your ID.">
            {(p) => <Input {...p} placeholder="Jane Doe" />}
          </Field>
          <Field label="Email" error="Enter a valid email address.">
            {(p) => <Input {...p} type="email" defaultValue="not-an-email" />}
          </Field>
          <Field label="Collection">
            {(p) => (
              <Select {...p} defaultValue="">
                <option value="" disabled>
                  Choose…
                </option>
                <option>Women</option>
                <option>Men</option>
                <option>Kids</option>
              </Select>
            )}
          </Field>
          <Field label="Notes">{(p) => <Textarea {...p} rows={3} />}</Field>
          <Choice label="Subscribe to the newsletter" defaultChecked />
          <Choice type="radio" name="demo" label="Cash on delivery" defaultChecked />
        </div>
      </Section>

      <Section title="Size chips">
        <div className="chip-group">
          {['XS', 'S', 'M', 'L', 'XL'].map((s) => (
            <SizeChip key={s} selected={size === s} outOfStock={s === 'XL'} onClick={() => setSize(s)}>
              {s}
            </SizeChip>
          ))}
        </div>
      </Section>

      <Section title="Colour swatches">
        <div className="swatch-group">
          <Swatch
            colorName="Sand"
            imageUrl="https://ik.imagekit.io/demo/img/image1.jpeg"
            selected={color === 'sand'}
            onClick={() => setColor('sand')}
          />
          <Swatch
            colorName="Navy"
            imageUrl="https://ik.imagekit.io/demo/img/image2.jpeg"
            selected={color === 'navy'}
            onClick={() => setColor('navy')}
          />
          <Swatch colorName="Olive" swatchColor="#6b7043" outOfStock />
        </div>
      </Section>

      <Section title="Quantity stepper">
        <QuantityStepper value={qty} onChange={setQty} label="Quantity" min={1} max={9} />
      </Section>

      <Section title="Alerts">
        <div style={{ display: 'grid', gap: 'var(--space-3)', minWidth: 320 }}>
          <Alert tone="success">Order placed — you&apos;ll get a call to confirm delivery.</Alert>
          <Alert tone="warning" title="Low stock">
            Only 2 left in this size.
          </Alert>
          <Alert tone="danger" title="Payment on delivery only">
            Online payment isn&apos;t available yet.
          </Alert>
          <Alert tone="info">Free delivery inside the city.</Alert>
        </div>
      </Section>

      <Section title="Product cards (one per collection accent)">
        {COLLECTION_SLUGS.map((slug) => (
          <div key={slug} style={{ width: 240 }}>
            <ProductCard product={MOCK[slug]} locale={locale} collection={slug} />
          </div>
        ))}
      </Section>

      <Section title="Table">
        <DataTable responsive style={{ minWidth: 480 }}>
          <thead>
            <tr>
              <th>Product</th>
              <th>Status</th>
              <th className="is-numeric">Stock</th>
              <th className="is-numeric">Price</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td data-label="Product">Silk Robe</td>
              <td data-label="Status">
                <StatusPill status="PENDING" locale={locale} />
              </td>
              <td data-label="Stock" className="is-numeric">
                3
              </td>
              <td data-label="Price" className="is-numeric">
                $49.99
              </td>
            </tr>
            <tr>
              <td data-label="Product">Tailored Blazer</td>
              <td data-label="Status">
                <StatusPill status="DELIVERED" locale={locale} />
              </td>
              <td data-label="Stock" className="is-numeric">
                12
              </td>
              <td data-label="Price" className="is-numeric">
                $89.00
              </td>
            </tr>
          </tbody>
        </DataTable>
      </Section>

      <Section title="Loading skeleton">
        <div style={{ width: '100%' }}>
          <ProductGridSkeleton count={4} />
        </div>
      </Section>

      <Section title="Empty / error states">
        <div style={{ flex: 1, minWidth: 280 }}>
          <EmptyState
            icon={Inbox}
            title="Your cart is empty"
            body="Browse a collection to add something."
            action={<Button variant="primary">Shop women</Button>}
          />
        </div>
        <div style={{ flex: 1, minWidth: 280 }}>
          <Button variant="outline" onClick={() => setShowError((v) => !v)}>
            Toggle error state
          </Button>
          {showError && (
            <EmptyState
              tone="alert"
              icon={PackageX}
              title="Couldn't load products"
              body="Check your connection and try again."
              action={<Button variant="primary">Retry</Button>}
            />
          )}
        </div>
      </Section>

      <Section title="Drawer (off-canvas)">
        <Button variant="outline" onClick={() => setMenuOpen(true)}>
          Open drawer
        </Button>
        <Drawer open={menuOpen} onClose={() => setMenuOpen(false)} side="end" title="Cart">
          <p>Drawer content. Esc closes; focus is trapped and restored to the trigger.</p>
        </Drawer>
      </Section>
    </div>
  );
}
