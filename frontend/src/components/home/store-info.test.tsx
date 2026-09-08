import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createWrapper } from '@/test/utils';
import { StoreInfo } from './store-info';

const settings: { data: unknown } = { data: null };
vi.mock('@/hooks/use-settings', () => ({ useSettings: () => settings }));

const hamra = {
  id: 'l1',
  nameEn: 'Hamra branch',
  nameAr: 'فرع الحمرا',
  addressEn: '12 Hamra Street, Beirut',
  addressAr: 'شارع الحمرا ١٢، بيروت',
  mapUrl: 'https://maps.google.com/?q=beirut',
  imageUrl: null as string | null,
  imageFileId: null,
  sortOrder: 0,
  hours: [
    { id: 'h1', dayOfWeek: 0, opensAt: '10:00', closesAt: '20:00' }, // Monday
    { id: 'h2', dayOfWeek: 4, opensAt: '10:00', closesAt: '22:00' }, // Friday
  ],
};
const jounieh = {
  id: 'l2',
  nameEn: 'Jounieh branch',
  nameAr: 'فرع جونية',
  addressEn: 'Main Road, Jounieh',
  addressAr: null,
  mapUrl: null,
  imageUrl: null as string | null,
  imageFileId: null,
  sortOrder: 1,
  hours: [],
};

function renderInfo(locale = 'en') {
  const { Wrapper } = createWrapper();
  return render(<StoreInfo locale={locale} />, { wrapper: Wrapper });
}

beforeEach(() => {
  vi.clearAllMocks();
  settings.data = null;
});

describe('<StoreInfo>', () => {
  it('renders nothing until settings load', () => {
    const { container } = renderInfo();
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when there are no renderable locations', () => {
    settings.data = { storeLocations: [{ ...jounieh, nameEn: null, nameAr: null, addressEn: null, hours: [] }] };
    const { container } = renderInfo();
    expect(container).toBeEmptyDOMElement();
  });

  it('renders one card per location with name and address', () => {
    settings.data = { storeLocations: [hamra, jounieh] };
    renderInfo();
    expect(screen.getByText('Hamra branch')).toBeInTheDocument();
    expect(screen.getByText('12 Hamra Street, Beirut')).toBeInTheDocument();
    expect(screen.getByText('Jounieh branch')).toBeInTheDocument();
    expect(screen.getByText('Main Road, Jounieh')).toBeInTheDocument();
  });

  it('shows a Get directions link only for a location that has a (safe) map link', () => {
    settings.data = { storeLocations: [hamra, jounieh] };
    renderInfo();
    const links = screen.getAllByRole('link', { name: /get directions/i });
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute('href', 'https://maps.google.com/?q=beirut');
  });

  it('drops a non-http(s) map link (xss guard)', () => {
    settings.data = { storeLocations: [{ ...hamra, mapUrl: 'javascript:alert(1)' }] };
    renderInfo();
    expect(screen.queryByRole('link', { name: /get directions/i })).not.toBeInTheDocument();
  });

  it('lists every weekday for a location, marking days without hours as Closed', () => {
    settings.data = { storeLocations: [hamra] };
    renderInfo();
    expect(screen.getByText('Monday')).toBeInTheDocument();
    expect(screen.getByText('10:00 – 20:00')).toBeInTheDocument();
    expect(screen.getByText('10:00 – 22:00')).toBeInTheDocument();
    // Mon + Fri have hours; the other 5 days are Closed.
    expect(screen.getAllByText('Closed')).toHaveLength(5);
  });

  it('applies the per-card background image and dark-band flag', () => {
    settings.data = { storeLocations: [{ ...hamra, imageUrl: 'https://ik.imagekit.io/x/store.jpg' }] };
    const { container } = renderInfo();
    const card = container.querySelector('.store-card') as HTMLElement;
    expect(card).toHaveAttribute('data-has-image', '');
    expect(card.style.backgroundImage).toContain('https://ik.imagekit.io/x/store.jpg');
  });
});
