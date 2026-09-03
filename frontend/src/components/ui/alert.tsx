import { AlertCircle, AlertTriangle, CheckCircle2, Info, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Icon } from './icon';

export type AlertTone = 'success' | 'warning' | 'danger' | 'info';

const ICONS: Record<AlertTone, LucideIcon> = {
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: AlertCircle,
  info: Info,
};

export interface AlertProps {
  tone?: AlertTone;
  title?: ReactNode;
  children: ReactNode;
  /** danger/warning use role="alert"; success/info use a polite status region. */
  className?: string;
}

/** Inline feedback banner on the .alert--* classes. Colour is always paired
 *  with an icon. Screen readers are notified via role/aria-live. */
export function Alert({ tone = 'info', title, children, className }: AlertProps) {
  const assertive = tone === 'danger' || tone === 'warning';
  return (
    <div
      className={['alert', `alert--${tone}`, className].filter(Boolean).join(' ')}
      role={assertive ? 'alert' : 'status'}
      aria-live={assertive ? 'assertive' : 'polite'}
    >
      <Icon as={ICONS[tone]} className="alert__icon" />
      <div>
        {title && <strong>{title}</strong>}
        <div>{children}</div>
      </div>
    </div>
  );
}
