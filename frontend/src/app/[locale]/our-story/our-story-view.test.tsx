import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createWrapper } from '@/test/utils';
import { OurStoryView } from './our-story-view';

const settings: { data: unknown } = { data: null };
vi.mock('@/hooks/use-settings', () => ({ useSettings: () => settings }));

function renderView(locale: 'en' | 'ar' = 'en') {
  const { Wrapper } = createWrapper();
  return render(<OurStoryView locale={locale} />, { wrapper: Wrapper });
}

beforeEach(() => {
  vi.clearAllMocks();
  settings.data = null;
});

describe('<OurStoryView>', () => {
  it('shows a placeholder when no story is written', () => {
    settings.data = { brandNameEn: 'Rima Boutique' };
    renderView('en');
    expect(screen.getByRole('heading', { level: 1, name: 'Our story' })).toBeInTheDocument();
    expect(screen.getByText(/hasn’t shared its story yet/)).toBeInTheDocument();
  });

  it('renders the admin title and body, splitting paragraphs on blank lines', () => {
    settings.data = {
      storyTitleEn: 'How we began',
      storyBodyEn: 'First paragraph.\n\nSecond paragraph.',
    };
    renderView('en');
    expect(screen.getByRole('heading', { level: 1, name: 'How we began' })).toBeInTheDocument();
    expect(screen.getByText('First paragraph.')).toBeInTheDocument();
    expect(screen.getByText('Second paragraph.')).toBeInTheDocument();
  });

  it('falls back to the other language when the requested one is empty', () => {
    settings.data = { storyTitleEn: 'Our story', storyBodyEn: 'English only body.' };
    renderView('ar');
    expect(screen.getByText('English only body.')).toBeInTheDocument();
  });
});
