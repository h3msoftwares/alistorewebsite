import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createWrapper } from '@/test/utils';
import { CustomerReviews } from './customer-reviews';

const settings: { data: unknown } = { data: null };
vi.mock('@/hooks/use-settings', () => ({ useSettings: () => settings }));

function renderReviews(locale = 'en') {
  const { Wrapper } = createWrapper();
  return render(<CustomerReviews locale={locale} />, { wrapper: Wrapper });
}

beforeEach(() => {
  vi.clearAllMocks();
  settings.data = null;
});

describe('<CustomerReviews>', () => {
  it('renders nothing until settings load', () => {
    const { container } = renderReviews();
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when no review images are set', () => {
    settings.data = { reviewImages: [] };
    const { container } = renderReviews();
    expect(container).toBeEmptyDOMElement();
  });

  it('renders one image per review, in order, with prev/next controls', () => {
    settings.data = {
      reviewImages: [
        { id: 'r1', imageUrl: 'https://ik.imagekit.io/demo/a.jpg', imageFileId: 'f1', sortOrder: 0 },
        { id: 'r2', imageUrl: 'https://ik.imagekit.io/demo/b.jpg', imageFileId: null, sortOrder: 1 },
      ],
    };
    renderReviews();
    const imgs = screen.getAllByRole('img');
    expect(imgs.map((i) => i.getAttribute('src'))).toEqual([
      'https://ik.imagekit.io/demo/a.jpg',
      'https://ik.imagekit.io/demo/b.jpg',
    ]);
    expect(screen.getByRole('button', { name: 'Previous' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeInTheDocument();
    expect(screen.getByLabelText('Customer reviews')).toBeInTheDocument();
  });

  it('uses Arabic labels in the ar locale', () => {
    settings.data = {
      reviewImages: [{ id: 'r1', imageUrl: 'https://x/a.jpg', imageFileId: null, sortOrder: 0 }],
    };
    renderReviews('ar');
    expect(screen.getByLabelText('آراء العملاء')).toBeInTheDocument();
    expect(screen.getByAltText('مراجعة عميل 1')).toBeInTheDocument();
  });
});
