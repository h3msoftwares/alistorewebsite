import type { ReactNode } from 'react';

export interface CheckListItem {
  id: string;
  label: ReactNode;
  /** Muted secondary line under the label — e.g. a category's ancestor
   *  breadcrumb ("Men › Shoes"), so two same-named options from different
   *  branches (a "Shoes" under Women, Men, and Kids) are distinguishable. */
  sublabel?: ReactNode;
  /** Blocks *checking* this row (e.g. it's archived) — never blocks
   *  *unchecking* it. Without that distinction, an item that becomes
   *  archived after it was already selected can never be removed again. */
  disabled?: boolean;
}

export interface CheckListProps {
  items: CheckListItem[];
  value: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
  emptyLabel?: ReactNode;
  id?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: true;
}

/** A scrollable list of checkable rows — the clearer, self-explanatory
 *  replacement for a native `<select multiple>` (which needs an undiscoverable
 *  ctrl/cmd-click to pick more than one option). Each row shows its checked
 *  state directly; nothing to learn. */
export function CheckList({
  items,
  value,
  onChange,
  disabled,
  emptyLabel,
  id,
  'aria-describedby': describedBy,
  'aria-invalid': invalid,
}: CheckListProps) {
  const toggle = (itemId: string) => {
    onChange(value.includes(itemId) ? value.filter((v) => v !== itemId) : [...value, itemId]);
  };

  return (
    <div
      id={id}
      role="group"
      aria-describedby={describedBy}
      aria-invalid={invalid}
      className="check-list"
      data-disabled={disabled ? '' : undefined}
    >
      {items.length === 0 ? (
        <p className="check-list__empty">{emptyLabel}</p>
      ) : (
        items.map((item) => {
          const checked = value.includes(item.id);
          // The form-level `disabled` (busy/saving) always applies; the
          // per-item one only blocks adding a new selection, never removing
          // one that's already checked.
          const rowDisabled = disabled || (item.disabled && !checked);
          return (
            <label key={item.id} className="check-list__row" data-disabled={rowDisabled ? '' : undefined}>
              <input
                type="checkbox"
                checked={checked}
                disabled={rowDisabled}
                onChange={() => toggle(item.id)}
              />
              <span className="check-list__row-text">
                <span>{item.label}</span>
                {item.sublabel && <span className="check-list__row-sublabel">{item.sublabel}</span>}
              </span>
            </label>
          );
        })
      )}
    </div>
  );
}
