import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ReorderList, type ReorderItem } from './reorder-list';

const items = (keys: string[]): ReorderItem[] =>
  keys.map((k) => ({ key: k, content: <span data-testid={`row-${k}`}>{k.toUpperCase()}</span> }));

/** Give each rendered <li> a vertical band so the "row under pointer" hit test
 *  works (jsdom's getBoundingClientRect is all-zero otherwise). */
function stubRects(container: HTMLElement, rowHeight = 40) {
  container.querySelectorAll('li').forEach((li, i) => {
    li.getBoundingClientRect = () =>
      ({
        top: i * rowHeight,
        bottom: i * rowHeight + rowHeight,
        left: 0,
        right: 200,
        width: 200,
        height: rowHeight,
        x: 0,
        y: i * rowHeight,
        toJSON: () => ({}),
      }) as DOMRect;
  });
}

describe('<ReorderList>', () => {
  it('renders rows in the given order, each with a drag handle', () => {
    render(<ReorderList items={items(['a', 'b', 'c'])} onReorder={vi.fn()} />);
    const rows = screen.getAllByRole('listitem');
    expect(rows.map((r) => r.textContent)).toEqual(['A', 'B', 'C']);
    expect(screen.getAllByLabelText('Drag to reorder')).toHaveLength(3);
  });

  it('drags the first row down past the last and reports the new order on drop', () => {
    const onReorder = vi.fn();
    const { container } = render(<ReorderList items={items(['a', 'b', 'c'])} onReorder={onReorder} />);
    stubRects(container);

    // With a real pointer capture every move routes to the dragged row; jsdom
    // has no capture, so fire on the dragged row's handle (bubbles to its <li>).
    const handleA = screen.getAllByLabelText('Drag to reorder')[0];
    fireEvent.pointerDown(handleA, { button: 0, pointerId: 1, clientY: 10 });
    // move into the 3rd row's band (80–120)
    fireEvent.pointerMove(handleA, { pointerId: 1, clientY: 110 });

    expect(screen.getAllByRole('listitem').map((r) => r.textContent)).toEqual(['B', 'C', 'A']);

    fireEvent.pointerUp(handleA, { pointerId: 1, clientY: 110 });
    expect(onReorder).toHaveBeenCalledWith(['b', 'c', 'a']);
  });

  it('does not fire onReorder when the row is dropped where it started', () => {
    const onReorder = vi.fn();
    const { container } = render(<ReorderList items={items(['a', 'b', 'c'])} onReorder={onReorder} />);
    stubRects(container);

    const handleB = screen.getAllByLabelText('Drag to reorder')[1];
    fireEvent.pointerDown(handleB, { button: 0, pointerId: 1, clientY: 50 });
    fireEvent.pointerUp(screen.getByRole('list'), { pointerId: 1, clientY: 50 });
    expect(onReorder).not.toHaveBeenCalled();
  });

  it('re-syncs to a new incoming order', () => {
    const { rerender } = render(<ReorderList items={items(['a', 'b', 'c'])} onReorder={vi.fn()} />);
    rerender(<ReorderList items={items(['c', 'a', 'b'])} onReorder={vi.fn()} />);
    expect(screen.getAllByRole('listitem').map((r) => r.textContent)).toEqual(['C', 'A', 'B']);
  });
});
