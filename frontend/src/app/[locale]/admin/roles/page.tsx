'use client';

import { Fragment, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  Alert,
  Badge,
  Button,
  Choice,
  DataTable,
  EmptyState,
  Field,
  Input,
  ProductGridSkeleton,
  Select,
  Textarea,
} from '@/components/ui';
import { areaLabel, usePermissions } from '@/lib/rbac';
import { useAuth } from '@/hooks/use-auth';
import {
  useAssignRole,
  useCreateRole,
  useCreateTeamMember,
  useDeleteRole,
  usePermissionCatalog,
  useRoles,
  useSetRevoked,
  useTeam,
  useUpdateRole,
  useUpdateTeamMember,
} from '@/hooks/use-rbac';
import type { NewTeamMember, PermissionArea, Role, RoleBody, TeamMember } from '@/lib/types';

type Tab = 'roles' | 'team';

// `manage` can't exist without its `view` sibling, and dropping `view` drops
// `manage` with it — same rule the backend enforces on save.
function toggleKey(held: Set<string>, key: string, on: boolean): Set<string> {
  const next = new Set(held);
  const [area, level] = key.split(':');
  if (on) {
    next.add(key);
    if (level === 'manage') next.add(`${area}:view`);
  } else {
    next.delete(key);
    if (level === 'view') next.delete(`${area}:manage`);
  }
  return next;
}

// ------------------------------------------------------- permission grid ----

function PermissionGrid({
  catalog,
  locale,
  held,
  onChange,
  disabled,
}: {
  catalog: PermissionArea[];
  locale: 'en' | 'ar';
  held: Set<string>;
  onChange: (next: Set<string>) => void;
  disabled?: boolean;
}) {
  const isAr = locale === 'ar';
  return (
    <DataTable responsive>
      <thead>
        <tr>
          <th>{isAr ? 'المجال' : 'Area'}</th>
          <th>{isAr ? 'عرض' : 'View'}</th>
          <th>{isAr ? 'إدارة' : 'Manage'}</th>
        </tr>
      </thead>
      <tbody>
        {catalog.map((a) => {
          const canManage = a.levels.includes('manage');
          return (
            <tr key={a.area}>
              <td data-label={isAr ? 'المجال' : 'Area'}>{areaLabel(a.area, locale)}</td>
              <td data-label={isAr ? 'عرض' : 'View'}>
                <Choice
                  type="checkbox"
                  label=""
                  aria-label={`${areaLabel(a.area, locale)} — ${isAr ? 'عرض' : 'view'}`}
                  checked={held.has(`${a.area}:view`)}
                  disabled={disabled}
                  onChange={(e) => onChange(toggleKey(held, `${a.area}:view`, e.target.checked))}
                />
              </td>
              <td data-label={isAr ? 'إدارة' : 'Manage'}>
                {canManage ? (
                  <Choice
                    type="checkbox"
                    label=""
                    aria-label={`${areaLabel(a.area, locale)} — ${isAr ? 'إدارة' : 'manage'}`}
                    checked={held.has(`${a.area}:manage`)}
                    disabled={disabled}
                    onChange={(e) => onChange(toggleKey(held, `${a.area}:manage`, e.target.checked))}
                  />
                ) : (
                  <span aria-hidden>—</span>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </DataTable>
  );
}

// --------------------------------------------------------------- roles tab ----

/** Create / edit form. Remounted (via `key`) whenever the selected role
 *  changes, so all state can seed straight from props with no effect. */
function RoleForm({
  role,
  catalog,
  catalogPending,
  locale,
  busy,
  onSubmit,
}: {
  role: Role | null;
  catalog: PermissionArea[] | undefined;
  catalogPending: boolean;
  locale: 'en' | 'ar';
  busy: boolean;
  onSubmit: (body: RoleBody) => Promise<void>;
}) {
  const isAr = locale === 'ar';
  const t = (en: string, ar: string) => (isAr ? ar : en);

  const [name, setName] = useState(role?.name ?? '');
  const [description, setDescription] = useState(role?.description ?? '');
  const [held, setHeld] = useState<Set<string>>(() => new Set(role?.permissions ?? []));
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    if (!name.trim()) {
      setError(t('Give the role a name.', 'أدخل اسمًا للدور.'));
      return;
    }
    try {
      await onSubmit({
        name: name.trim(),
        description: description.trim() || null,
        permissions: [...held],
      });
      if (!role) {
        // Created — clear for the next one (no remount happens in this case).
        setName('');
        setDescription('');
        setHeld(new Set());
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Save failed', 'فشل الحفظ'));
    }
  };

  return (
    <form
      className="admin-form"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="admin-form__section">
        <p className="admin-form__section-title">
          {role ? t('Edit role', 'تعديل الدور') : t('New role', 'دور جديد')}
        </p>

        <div className="admin-form__row">
          <Field label={t('Name', 'الاسم')} required>
            {(p) => (
              <Input
                {...p}
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={busy || role?.isSystem}
              />
            )}
          </Field>
          <Field label={t('Description', 'الوصف')} hint={t('Optional', 'اختياري')}>
            {(p) => (
              <Textarea
                {...p}
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={busy}
              />
            )}
          </Field>
        </div>

        {role?.isSystem && (
          <Alert tone="info" className="stack">
            {t(
              'This is a built-in role. You can adjust its permissions but it can’t be renamed or deleted.',
              'هذا دور مدمج. يمكنك تعديل صلاحياته لكن لا يمكن إعادة تسميته أو حذفه.'
            )}
          </Alert>
        )}

        <div className="stack">
          <p className="admin-form__section-title">{t('Permissions', 'الصلاحيات')}</p>
          {catalogPending || !catalog ? (
            <ProductGridSkeleton count={2} />
          ) : (
            <PermissionGrid
              catalog={catalog}
              locale={locale}
              held={held}
              onChange={setHeld}
              disabled={busy}
            />
          )}
        </div>

        {error && (
          <Alert tone="danger" className="stack">
            {error}
          </Alert>
        )}

        <div className="admin-form__actions">
          <Button type="submit" loading={busy}>
            {role ? t('Save changes', 'حفظ التغييرات') : t('Create role', 'إنشاء الدور')}
          </Button>
        </div>
      </div>
    </form>
  );
}

function RolesPanel({ locale }: { locale: 'en' | 'ar' }) {
  const isAr = locale === 'ar';
  const t = (en: string, ar: string) => (isAr ? ar : en);
  const canManage = usePermissions().has('roles:manage');

  const { data: catalog, isPending: catalogPending } = usePermissionCatalog();
  const { data: roles, isPending, isError, refetch } = useRoles();
  const create = useCreateRole();
  const update = useUpdateRole();
  const remove = useDeleteRole();
  const busy = create.isPending || update.isPending || remove.isPending;

  const [editing, setEditing] = useState<Role | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  const onSubmit = async (body: RoleBody) => {
    if (editing) await update.mutateAsync({ id: editing.id, body });
    else await create.mutateAsync(body);
    setEditing(null);
  };

  const onDelete = async (r: Role) => {
    if (!confirm(t(`Delete the "${r.name}" role?`, `حذف الدور "${r.name}"؟`))) return;
    setListError(null);
    try {
      await remove.mutateAsync(r.id);
      if (editing?.id === r.id) setEditing(null);
    } catch (e) {
      setListError(e instanceof Error ? e.message : t('Delete failed', 'فشل الحذف'));
    }
  };

  return (
    <div className="section--tight">
      {canManage && (
        <>
          <RoleForm
            key={editing?.id ?? 'new'}
            role={editing}
            catalog={catalog}
            catalogPending={catalogPending}
            locale={locale}
            busy={busy}
            onSubmit={onSubmit}
          />
          {editing && (
            <Button type="button" variant="ghost" onClick={() => setEditing(null)} disabled={busy}>
              {t('Cancel edit', 'إلغاء التعديل')}
            </Button>
          )}
        </>
      )}

      {listError && (
        <Alert tone="danger" className="stack">
          {listError}
        </Alert>
      )}

      {isPending ? (
        <ProductGridSkeleton count={3} />
      ) : isError ? (
        <EmptyState
          tone="alert"
          title={t("Couldn't load roles", 'تعذّر تحميل الأدوار')}
          action={
            <Button variant="primary" onClick={() => refetch()}>
              {t('Retry', 'إعادة المحاولة')}
            </Button>
          }
        />
      ) : (roles ?? []).length === 0 ? (
        <EmptyState title={t('No roles yet', 'لا توجد أدوار بعد')} />
      ) : (
        <DataTable responsive>
          <thead>
            <tr>
              <th>{t('Role', 'الدور')}</th>
              <th>{t('Permissions', 'الصلاحيات')}</th>
              <th>{t('People', 'الأشخاص')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {(roles ?? []).map((r) => (
              <tr key={r.id}>
                <td data-label={t('Role', 'الدور')}>
                  <span className="admin-inline">
                    {r.name}
                    {r.isSystem && <Badge variant="new">{t('Built-in', 'مدمج')}</Badge>}
                  </span>
                  {r.description && <p className="muted">{r.description}</p>}
                </td>
                <td data-label={t('Permissions', 'الصلاحيات')}>{r.permissions.length}</td>
                <td data-label={t('People', 'الأشخاص')}>{r._count?.users ?? 0}</td>
                <td>
                  {canManage && (
                    <span className="admin-row-actions">
                      <Button variant="ghost" size="sm" onClick={() => setEditing(r)} disabled={busy}>
                        {t('Edit', 'تعديل')}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onDelete(r)}
                        disabled={busy || r.isSystem || (r._count?.users ?? 0) > 0}
                        title={
                          r.isSystem
                            ? t('Built-in roles can’t be deleted', 'لا يمكن حذف الأدوار المدمجة')
                            : (r._count?.users ?? 0) > 0
                              ? t('Unassign it from everyone first', 'ألغِ إسناده من الجميع أولًا')
                              : undefined
                        }
                      >
                        {t('Delete', 'حذف')}
                      </Button>
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- team tab ----

const BLANK_MEMBER: NewTeamMember = { name: '', email: '', password: '', role: 'STAFF', roleId: '' };

/** Create-a-team-member form. Self-contained; clears itself on success. */
function NewMemberForm({
  roles,
  locale,
  busy,
  onSubmit,
}: {
  roles: Role[];
  locale: 'en' | 'ar';
  busy: boolean;
  onSubmit: (body: NewTeamMember) => Promise<void>;
}) {
  const isAr = locale === 'ar';
  const t = (en: string, ar: string) => (isAr ? ar : en);
  // Only a full ADMIN can create an ADMIN account (backend enforces it). For a
  // delegated `roles:manage` staffer the new account is always STAFF.
  const isFullAdmin = usePermissions().isFullAdmin;
  const [form, setForm] = useState<NewTeamMember>(BLANK_MEMBER);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof NewTeamMember>(k: K, v: NewTeamMember[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    setError(null);
    if (!form.name.trim() || !form.email.trim()) {
      setError(t('Name and email are required.', 'الاسم والبريد مطلوبان.'));
      return;
    }
    if (form.password.length < 8) {
      setError(t('Password must be at least 8 characters.', 'كلمة المرور 8 أحرف على الأقل.'));
      return;
    }
    try {
      await onSubmit({
        ...form,
        name: form.name.trim(),
        email: form.email.trim(),
        roleId: form.role === 'STAFF' ? form.roleId || null : null,
      });
      setForm(BLANK_MEMBER);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Could not create the account', 'تعذّر إنشاء الحساب'));
    }
  };

  return (
    <form
      className="admin-form"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="admin-form__section">
        <p className="admin-form__section-title">{t('Add a team member', 'إضافة عضو للفريق')}</p>
        <div className="admin-form__row">
          <Field label={t('Name', 'الاسم')} required>
            {(p) => (
              <Input {...p} value={form.name} onChange={(e) => set('name', e.target.value)} disabled={busy} />
            )}
          </Field>
          <Field label={t('Email', 'البريد الإلكتروني')} required>
            {(p) => (
              <Input
                {...p}
                type="email"
                value={form.email}
                onChange={(e) => set('email', e.target.value)}
                disabled={busy}
              />
            )}
          </Field>
        </div>
        <div className="admin-form__row">
          <Field
            label={t('Temporary password', 'كلمة مرور مؤقتة')}
            hint={t('They sign in at the admin login and can change it.', 'يسجّلون الدخول من صفحة الإدارة ويمكنهم تغييرها.')}
            required
          >
            {(p) => (
              <Input
                {...p}
                type="text"
                value={form.password}
                onChange={(e) => set('password', e.target.value)}
                disabled={busy}
              />
            )}
          </Field>
          {isFullAdmin && (
            <Field label={t('Access', 'الوصول')}>
              {(p) => (
                <Select
                  {...p}
                  value={form.role}
                  onChange={(e) => set('role', e.target.value as 'STAFF' | 'ADMIN')}
                  disabled={busy}
                >
                  <option value="STAFF">{t('Staff (role-scoped)', 'موظف (حسب الدور)')}</option>
                  <option value="ADMIN">{t('Admin (all permissions)', 'مسؤول (كل الصلاحيات)')}</option>
                </Select>
              )}
            </Field>
          )}
        </div>
        {form.role === 'STAFF' && (
          <Field label={t('Role', 'الدور')} hint={t('No role = no admin access yet', 'بلا دور = لا وصول للإدارة بعد')}>
            {(p) => (
              <Select
                {...p}
                value={form.roleId ?? ''}
                onChange={(e) => set('roleId', e.target.value)}
                disabled={busy}
              >
                <option value="">{t('No access', 'بلا وصول')}</option>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        )}
        {error && (
          <Alert tone="danger" className="stack">
            {error}
          </Alert>
        )}
        <div className="admin-form__actions">
          <Button type="submit" loading={busy}>
            {t('Create account', 'إنشاء الحساب')}
          </Button>
        </div>
      </div>
    </form>
  );
}

/** The per-permission revoke grid for one ADMIN. Remounted (via `key`) when the
 *  member's revoked list changes, so `held` seeds straight from props. */
function AdminRevokeRow({
  member,
  catalog,
  locale,
  disabled,
  onSave,
}: {
  member: TeamMember;
  catalog: PermissionArea[];
  locale: 'en' | 'ar';
  disabled?: boolean;
  onSave: (revoked: string[]) => void;
}) {
  const isAr = locale === 'ar';
  const t = (en: string, ar: string) => (isAr ? ar : en);
  const allKeys = useMemo(
    () => catalog.flatMap((a) => a.levels.map((l) => `${a.area}:${l}`)),
    [catalog]
  );
  // "held" for an admin = every catalog key minus what's currently revoked.
  const [held, setHeld] = useState<Set<string>>(
    () => new Set(allKeys.filter((k) => !member.revokedPermissions.includes(k)))
  );

  const revoked = allKeys.filter((k) => !held.has(k));
  const dirty =
    revoked.length !== member.revokedPermissions.length ||
    revoked.some((k) => !member.revokedPermissions.includes(k));

  return (
    <div className="stack">
      <p className="muted">
        {t(
          'Admins hold every permission. Untick one to revoke it for this person.',
          'يملك المسؤولون كل الصلاحيات. أزل التحديد لسحب صلاحية من هذا الشخص.'
        )}
      </p>
      <PermissionGrid
        catalog={catalog}
        locale={locale}
        held={held}
        onChange={setHeld}
        disabled={disabled}
      />
      <div className="admin-form__actions">
        <Button size="sm" onClick={() => onSave(revoked)} disabled={disabled || !dirty}>
          {t('Save revocations', 'حفظ السحب')}
        </Button>
        {revoked.length > 0 && (
          <span className="muted">{t(`${revoked.length} revoked`, `${revoked.length} مسحوبة`)}</span>
        )}
      </div>
    </div>
  );
}

function TeamPanel({ locale }: { locale: 'en' | 'ar' }) {
  const isAr = locale === 'ar';
  const t = (en: string, ar: string) => (isAr ? ar : en);
  const perms = usePermissions();
  const canManage = perms.has('roles:manage');
  // Only a full ADMIN can touch the ADMIN tier (create/promote/demote an admin,
  // revoke an admin's permissions). The backend enforces this — mirror it here
  // so a delegated `roles:manage` staffer isn't shown controls that only 403.
  const isFullAdmin = perms.isFullAdmin;
  const { user } = useAuth();

  const { data: catalog } = usePermissionCatalog();
  const { data: team, isPending, isError, refetch } = useTeam();
  const assign = useAssignRole();
  const revoke = useSetRevoked();
  const createMember = useCreateTeamMember();
  const updateMember = useUpdateTeamMember();
  const { data: roles } = useRoles();
  const busy =
    assign.isPending || revoke.isPending || createMember.isPending || updateMember.isPending;

  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const run = async (p: Promise<unknown>) => {
    setError(null);
    try {
      await p;
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Update failed', 'فشل التحديث'));
    }
  };

  if (isPending) return <ProductGridSkeleton count={3} />;
  if (isError)
    return (
      <EmptyState
        tone="alert"
        title={t("Couldn't load the team", 'تعذّر تحميل الفريق')}
        action={
          <Button variant="primary" onClick={() => refetch()}>
            {t('Retry', 'إعادة المحاولة')}
          </Button>
        }
      />
    );

  return (
    <div className="section--tight">
      {canManage && (
        <NewMemberForm
          roles={roles ?? []}
          locale={locale}
          busy={busy}
          onSubmit={(body) => createMember.mutateAsync(body).then(() => setError(null))}
        />
      )}

      {error && (
        <Alert tone="danger" className="stack">
          {error}
        </Alert>
      )}
      <DataTable responsive>
        <thead>
          <tr>
            <th>{t('Person', 'الشخص')}</th>
            <th>{t('Access', 'الوصول')}</th>
            <th>{t('Role', 'الدور')}</th>
            <th>{t('Permissions', 'الصلاحيات')}</th>
            <th>{t('Status', 'الحالة')}</th>
          </tr>
        </thead>
        <tbody>
          {(team ?? []).map((m) => {
            const isSelf = user?.id === m.id;
            return (
              <Fragment key={m.id}>
                <tr>
                  <td data-label={t('Person', 'الشخص')}>
                    <span className="admin-inline">
                      {m.name}
                      {isSelf && <Badge variant="new">{t('You', 'أنت')}</Badge>}
                    </span>
                    {m.email && <p className="muted">{m.email}</p>}
                  </td>
                  <td data-label={t('Access', 'الوصول')}>
                    {canManage && !isSelf && isFullAdmin ? (
                      <Select
                        value={m.role}
                        disabled={busy}
                        aria-label={t('Access level', 'مستوى الوصول')}
                        onChange={(e) =>
                          run(
                            updateMember.mutateAsync({
                              id: m.id,
                              body: { role: e.target.value as 'STAFF' | 'ADMIN' },
                            })
                          )
                        }
                      >
                        <option value="STAFF">{t('Staff', 'موظف')}</option>
                        <option value="ADMIN">{t('Admin', 'مسؤول')}</option>
                      </Select>
                    ) : m.role === 'ADMIN' ? (
                      t('Admin', 'مسؤول')
                    ) : (
                      t('Staff', 'موظف')
                    )}
                  </td>
                  <td data-label={t('Role', 'الدور')}>
                    {m.role === 'ADMIN' ? (
                      <span className="muted">{t('All permissions', 'كل الصلاحيات')}</span>
                    ) : (
                      <Select
                        value={m.customRole?.id ?? ''}
                        disabled={!canManage || busy}
                        aria-label={t('Assigned role', 'الدور المسند')}
                        onChange={(e) =>
                          run(assign.mutateAsync({ userId: m.id, roleId: e.target.value || null }))
                        }
                      >
                        <option value="">{t('No access', 'بلا وصول')}</option>
                        {(roles ?? []).map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name}
                          </option>
                        ))}
                      </Select>
                    )}
                  </td>
                  <td data-label={t('Permissions', 'الصلاحيات')}>
                    <span className="admin-inline">
                      {m.effectivePermissions.length}
                      {m.role === 'ADMIN' && isFullAdmin && catalog && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setExpanded(expanded === m.id ? null : m.id)}
                        >
                          {expanded === m.id ? t('Close', 'إغلاق') : t('Revoke…', 'سحب…')}
                        </Button>
                      )}
                    </span>
                  </td>
                  <td data-label={t('Status', 'الحالة')}>
                    <span className="admin-inline">
                      {!m.isActive && <Badge variant="low-stock">{t('Inactive', 'غير نشط')}</Badge>}
                      {canManage && !isSelf && (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={busy}
                          onClick={() =>
                            run(
                              updateMember.mutateAsync({
                                id: m.id,
                                body: { isActive: !m.isActive },
                              })
                            )
                          }
                        >
                          {m.isActive ? t('Deactivate', 'تعطيل') : t('Activate', 'تفعيل')}
                        </Button>
                      )}
                    </span>
                  </td>
                </tr>
                {expanded === m.id && m.role === 'ADMIN' && isFullAdmin && catalog && (
                  <tr>
                    <td colSpan={5}>
                      <AdminRevokeRow
                        key={`${m.id}:${m.revokedPermissions.join(',')}`}
                        member={m}
                        catalog={catalog}
                        locale={locale}
                        disabled={busy}
                        onSave={(revoked) =>
                          run(revoke.mutateAsync({ userId: m.id, revoked })).then(() =>
                            setExpanded(null)
                          )
                        }
                      />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </DataTable>
      {(team ?? []).length === 0 && (
        <EmptyState title={t('No staff accounts', 'لا توجد حسابات موظفين')} />
      )}
    </div>
  );
}

// ------------------------------------------------------------------- page ----

export default function AdminRolesPage() {
  const params = useParams();
  const locale = ((typeof params?.locale === 'string' ? params.locale : 'en') || 'en') as 'en' | 'ar';
  const isAr = locale === 'ar';
  const t = (en: string, ar: string) => (isAr ? ar : en);
  const [tab, setTab] = useState<Tab>('roles');

  return (
    <div className="section--tight">
      <div className="admin-page__head">
        <h1>{t('Permissions & roles', 'الصلاحيات والأدوار')}</h1>
      </div>

      <nav className="admin-nav settings-tabs" aria-label={t('Sections', 'الأقسام')}>
        <button
          type="button"
          className="admin-nav__link"
          data-active={tab === 'roles' ? '' : undefined}
          aria-pressed={tab === 'roles'}
          onClick={() => setTab('roles')}
        >
          {t('Roles', 'الأدوار')}
        </button>
        <button
          type="button"
          className="admin-nav__link"
          data-active={tab === 'team' ? '' : undefined}
          aria-pressed={tab === 'team'}
          onClick={() => setTab('team')}
        >
          {t('Team', 'الفريق')}
        </button>
      </nav>

      {tab === 'roles' ? <RolesPanel locale={locale} /> : <TeamPanel locale={locale} />}
    </div>
  );
}
