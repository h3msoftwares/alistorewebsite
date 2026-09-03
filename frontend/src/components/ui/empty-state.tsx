import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Icon } from './icon';

export interface EmptyStateProps {
  icon?: LucideIcon;
  title: ReactNode;
  body?: ReactNode;
  /** One primary action (button/link). Keep it to a single CTA. */
  action?: ReactNode;
  /** `alert` adds role="alert" + aria-live for error states. */
  tone?: 'empty' | 'alert';
}

/** Shared empty / error / not-found block on the .state class. Replaces the
 *  bare "TODO: implement this page" placeholder for real empty states. */
export function EmptyState({ icon, title, body, action, tone = 'empty' }: EmptyStateProps) {
  return (
    <div
      className="state"
      role={tone === 'alert' ? 'alert' : undefined}
      aria-live={tone === 'alert' ? 'polite' : undefined}
    >
      {icon && <Icon as={icon} className="state__icon" size={40} />}
      <p className="state__title">{title}</p>
      {body && <p className="state__body">{body}</p>}
      {action && <div className="state__actions">{action}</div>}
    </div>
  );
}
