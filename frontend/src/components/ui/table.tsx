import type { ReactNode, TableHTMLAttributes } from 'react';

export interface DataTableProps extends TableHTMLAttributes<HTMLTableElement> {
  /** Collapse to a labelled card list under 640px. Requires `data-label` on each <td>. */
  responsive?: boolean;
  children: ReactNode;
}

/** Scroll-wrapped data table on the .table classes. Admin product/order lists
 *  build on this. Mark numeric cells with `className="is-numeric"` and, when
 *  `responsive`, give every <td> a `data-label` for the mobile card view. */
export function DataTable({ responsive = false, className, children, ...rest }: DataTableProps) {
  return (
    <div className="table-wrap">
      <table
        className={['table', responsive && 'table--responsive', className].filter(Boolean).join(' ')}
        {...rest}
      >
        {children}
      </table>
    </div>
  );
}
