import type { ReactNode, TableHTMLAttributes } from 'react';

export interface DataTableProps extends TableHTMLAttributes<HTMLTableElement> {
  /** Collapse to a labelled card list under 640px. Requires `data-label` on each <td>. */
  responsive?: boolean;
  /** Caps the wrapper's height and scrolls the body (sticky header stays
   *  put) instead of letting the table grow forever — for tables whose row
   *  count is driven by user input (e.g. a generated size × colour matrix)
   *  rather than server-side pagination. */
  maxHeight?: string;
  children: ReactNode;
}

/** Scroll-wrapped data table on the .table classes. Admin product/order lists
 *  build on this. Mark numeric cells with `className="is-numeric"` and, when
 *  `responsive`, give every <td> a `data-label` for the mobile card view. */
export function DataTable({ responsive = false, maxHeight, className, children, ...rest }: DataTableProps) {
  return (
    <div className="table-wrap" style={maxHeight ? { maxHeight, overflowY: 'auto' } : undefined}>
      <table
        className={['table', responsive && 'table--responsive', className].filter(Boolean).join(' ')}
        {...rest}
      >
        {children}
      </table>
    </div>
  );
}
