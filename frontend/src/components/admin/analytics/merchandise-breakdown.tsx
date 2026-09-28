'use client';

import { DataTable } from '@/components/ui';
import { money2, num } from './format';
import type { Breakdown } from '@/lib/types';

export function MerchandiseBreakdown({ rows, isAr }: { rows: Breakdown[]; isAr: boolean }) {
  const t = (en: string, ar: string) => isAr ? ar : en;
  const labels = [t('Group', 'المجموعة'), t('Ordered units', 'الوحدات المطلوبة'),
    t('Physically returned units', 'الوحدات المرتجعة والمستلمة'), t('Retained units', 'الوحدات المحتفظ بها'),
    t('Marked refunded', 'معلّم كمسترد'), t('Net merchandise value after marked refunds', 'صافي قيمة البضائع بعد الاستردادات المعلّمة')];
  return <DataTable responsive><thead><tr>{labels.map((label) => <th key={label}>{label}</th>)}</tr></thead>
    <tbody>{rows.map((row) => <tr key={row.label}>
      {[row.label, num(row.orderedUnits), num(row.physicallyReturnedUnits), num(row.retainedUnits), money2(row.merchandiseMarkedRefunded), money2(row.netMerchandiseValue)]
        .map((value, i) => <td key={labels[i]} data-label={labels[i]}>{value}</td>)}
    </tr>)}</tbody>
  </DataTable>;
}
