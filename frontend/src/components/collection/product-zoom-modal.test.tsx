import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProductZoomModal } from './product-zoom-modal';

const image = { url: 'https://ik.imagekit.io/demo/x.jpg', altEn: 'Shirt', altAr: null };

describe('ProductZoomModal', () => {
  it('renders nothing when closed', () => {
    render(<ProductZoomModal open={false} onClose={() => {}} image={image} name="Shirt" locale="en" />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('toggles zoom in/out on click of the image', async () => {
    const user = userEvent.setup();
    render(<ProductZoomModal open={true} onClose={() => {}} image={image} name="Shirt" locale="en" />);

    const trigger = screen.getByRole('button', { name: 'Zoom in' });
    expect(trigger).not.toHaveAttribute('data-zoomed');

    await user.click(trigger);
    const zoomedOut = screen.getByRole('button', { name: 'Zoom out' });
    expect(zoomedOut).toHaveAttribute('data-zoomed');

    await user.click(zoomedOut);
    expect(screen.getByRole('button', { name: 'Zoom in' })).not.toHaveAttribute('data-zoomed');
  });

  it('zooms back out on mouse leave', async () => {
    const user = userEvent.setup();
    render(<ProductZoomModal open={true} onClose={() => {}} image={image} name="Shirt" locale="en" />);

    await user.click(screen.getByRole('button', { name: 'Zoom in' }));
    const zoomedOut = screen.getByRole('button', { name: 'Zoom out' });
    expect(zoomedOut).toHaveAttribute('data-zoomed');

    await user.unhover(zoomedOut);
    expect(screen.getByRole('button', { name: 'Zoom in' })).not.toHaveAttribute('data-zoomed');
  });

  it('calls onClose from the modal close button', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<ProductZoomModal open={true} onClose={onClose} image={image} name="Shirt" locale="en" />);

    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows a fallback placeholder with no zoom trigger when there is no image', () => {
    render(<ProductZoomModal open={true} onClose={() => {}} image={undefined} name="Shirt" locale="en" />);
    expect(screen.queryByRole('button', { name: /zoom/i })).not.toBeInTheDocument();
  });
});
