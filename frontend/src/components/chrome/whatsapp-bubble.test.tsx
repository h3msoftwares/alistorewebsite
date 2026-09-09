import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WhatsappBubble } from './whatsapp-bubble';

const settings: { data: unknown } = { data: null };
vi.mock('@/hooks/use-settings', () => ({ useSettings: () => settings }));

beforeEach(() => {
  settings.data = null;
});

describe('<WhatsappBubble>', () => {
  it('renders nothing when no WhatsApp URL or contact phone is set', () => {
    settings.data = { whatsappUrl: null, contactPhone: null };
    const { container } = render(<WhatsappBubble locale="en" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('links to the admin WhatsApp URL, opening in a new tab', () => {
    settings.data = { whatsappUrl: 'https://wa.me/9611234567', contactPhone: null };
    render(<WhatsappBubble locale="en" />);
    const link = screen.getByRole('link', { name: 'Chat with us on WhatsApp' });
    expect(link).toHaveAttribute('href', 'https://wa.me/9611234567');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('falls back to a wa.me link built from the contact phone (digits only)', () => {
    settings.data = { whatsappUrl: null, contactPhone: '+961 71 234 567' };
    render(<WhatsappBubble locale="en" />);
    expect(screen.getByRole('link')).toHaveAttribute('href', 'https://wa.me/96171234567');
  });

  it('ignores a non-http(s) URL and a too-short phone', () => {
    settings.data = { whatsappUrl: 'javascript:alert(1)', contactPhone: '123' };
    const { container } = render(<WhatsappBubble locale="en" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('uses the Arabic label in the ar locale', () => {
    settings.data = { whatsappUrl: 'https://wa.me/9611234567' };
    render(<WhatsappBubble locale="ar" />);
    expect(screen.getByRole('link', { name: 'تواصل معنا عبر واتساب' })).toBeInTheDocument();
  });
});
