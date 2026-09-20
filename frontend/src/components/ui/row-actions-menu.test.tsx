import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Trash2 } from 'lucide-react';
import { RowActionsMenu } from './row-actions-menu';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('<RowActionsMenu>', () => {
  it('opens downward by default', async () => {
    const user = userEvent.setup();
    render(<RowActionsMenu actions={[{ label: 'Delete', icon: Trash2, onClick: vi.fn() }]} />);

    await user.click(screen.getByRole('button', { name: 'More actions' }));

    expect(screen.getByRole('menu')).toHaveAttribute('data-placement', 'down');
  });

  it('flips upward when opening downward would overflow the viewport — a row near the bottom of a long table', async () => {
    const user = userEvent.setup();
    // jsdom's layout is a no-op (every rect is zeros) — simulate a menu that
    // would render past the bottom of the (768px-tall, jsdom default) viewport.
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      bottom: 900,
      top: 850,
      left: 0,
      right: 160,
      width: 160,
      height: 50,
      x: 0,
      y: 850,
      toJSON: () => {},
    } as DOMRect);
    render(<RowActionsMenu actions={[{ label: 'Delete', icon: Trash2, onClick: vi.fn() }]} />);

    await user.click(screen.getByRole('button', { name: 'More actions' }));

    expect(screen.getByRole('menu')).toHaveAttribute('data-placement', 'up');
  });
});
