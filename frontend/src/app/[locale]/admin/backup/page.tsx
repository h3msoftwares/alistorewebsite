'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { CalendarClock, Cloud, CloudOff, DatabaseBackup, RotateCcw } from 'lucide-react';
import { Alert, Button, DataTable, EmptyState, Field, Icon, Input, Modal, ProductGridSkeleton, Select } from '@/components/ui';
import { useAuth, useStepUp } from '@/hooks/use-auth';
import {
  useBackups,
  useRunBackupNow,
  useRestoreBackup,
  useDriveStatus,
  useConnectDrive,
  useDisconnectDrive,
  useBackupSettings,
  useUpdateBackupSettings,
} from '@/hooks/use-backup';
import { isApiError } from '@/lib/api';
import type { BackupFrequency, BackupItem } from '@/lib/api/backup';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  return `${value.toFixed(1)} ${units[i]}`;
}

/**
 * Database backups — strictly ADMIN, unlike every other /admin page which
 * STAFF can reach via the granular permission system (see lib/rbac.tsx).
 * This is credentials-adjacent infrastructure, not a back-office task, so it
 * hard-checks `user.role` directly rather than going through `usePermissions`
 * — a STAFF account is refused here even if a custom role happened to carry
 * every other permission. The backend (backup.routes.ts) enforces the same
 * rule independently; this is defense in depth, not the real gate.
 */
export default function BackupPage() {
  const params = useParams();
  const locale = ((typeof params?.locale === 'string' ? params.locale : 'en') || 'en') as 'en' | 'ar';
  const isAr = locale === 'ar';
  const t = (en: string, ar: string) => (isAr ? ar : en);

  const { user } = useAuth();

  if (user?.role !== 'ADMIN') {
    return (
      <div className="section--tight">
        <EmptyState
          tone="alert"
          title={t('Admins only', 'للمسؤولين فقط')}
          body={t(
            'Database backups are restricted to ADMIN accounts.',
            'النسخ الاحتياطي لقاعدة البيانات مقتصر على حسابات المسؤول.'
          )}
        />
      </div>
    );
  }

  return <BackupPanel locale={locale} />;
}

function BackupPanel({ locale }: { locale: 'en' | 'ar' }) {
  const isAr = locale === 'ar';
  const t = (en: string, ar: string) => (isAr ? ar : en);

  const { data, isPending, isError, refetch } = useBackups();
  const runNow = useRunBackupNow();
  const [restoreTarget, setRestoreTarget] = useState<BackupItem | null>(null);
  const [restoreResultMsg, setRestoreResultMsg] = useState<{ tone: 'success' | 'danger'; text: string } | null>(
    null
  );

  return (
    <div className="section--tight">
      <div className="admin-page__head">
        <h1>{t('Database backups', 'النسخ الاحتياطي لقاعدة البيانات')}</h1>
        <Button type="button" onClick={() => runNow.mutate()} loading={runNow.isPending}>
          <Icon as={DatabaseBackup} size={16} style={{ marginInlineEnd: 'var(--space-2)' }} />
          {t('Back up now', 'نسخ احتياطي الآن')}
        </Button>
      </div>

      <DriveConnectionCard locale={locale} />
      <BackupScheduleCard locale={locale} />

      <p className="admin-form__hint">
        {data
          ? t(
              `The newest ${data.retentionCount} backups are kept on Google Drive — older ones are deleted automatically after each successful backup.`,
              `يُحتفظ بأحدث ${data.retentionCount} نسخ على Google Drive — وتُحذف الأقدم تلقائيًا بعد كل نسخ ناجح.`
            )
          : t(
              'Older backup copies are pruned automatically once the retention limit is reached.',
              'تُحذف النسخ الاحتياطية الأقدم تلقائيًا عند بلوغ حد الاحتفاظ.'
            )}
      </p>

      {runNow.isPending && (
        <Alert tone="info">
          {t(
            'Backing up — this can take a minute or two for a large database.',
            'جارٍ النسخ الاحتياطي — قد يستغرق دقيقة أو دقيقتين لقاعدة بيانات كبيرة.'
          )}
        </Alert>
      )}
      {runNow.isSuccess && runNow.data.ok && (
        <Alert tone="success">
          {t(
            `Backup complete — ${runNow.data.file.name} uploaded to Drive.`,
            `اكتمل النسخ الاحتياطي — تم رفع ${runNow.data.file.name} إلى Drive.`
          )}
        </Alert>
      )}
      {runNow.isSuccess && !runNow.data.ok && (
        <Alert tone="warning">
          {t(
            "Still running after a few minutes — it may still finish. Refresh the list in a bit to check.",
            'ما زال قيد التشغيل بعد بضع دقائق — قد يكتمل لاحقًا. حدّث القائمة بعد قليل للتحقق.'
          )}
        </Alert>
      )}
      {runNow.isError && (
        <Alert tone="danger">
          {runNow.error instanceof Error ? runNow.error.message : t('Backup failed.', 'فشل النسخ الاحتياطي.')}
        </Alert>
      )}
      {restoreResultMsg && <Alert tone={restoreResultMsg.tone}>{restoreResultMsg.text}</Alert>}

      {isPending ? (
        <ProductGridSkeleton count={2} />
      ) : isError || !data ? (
        <EmptyState
          tone="alert"
          title={t("Couldn't load backups", 'تعذّر تحميل النسخ الاحتياطية')}
          action={
            <Button variant="primary" onClick={() => refetch()}>
              {t('Retry', 'إعادة المحاولة')}
            </Button>
          }
        />
      ) : data.backups.length === 0 ? (
        <EmptyState
          title={t('No backups yet', 'لا توجد نسخ احتياطية بعد')}
          body={t('Run one now, or wait for the daily schedule.', 'شغّل نسخة الآن، أو انتظر الجدول اليومي.')}
        />
      ) : (
        <DataTable responsive>
          <thead>
            <tr>
              <th>{t('File', 'الملف')}</th>
              <th>{t('Created', 'تاريخ الإنشاء')}</th>
              <th>{t('Size', 'الحجم')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {data.backups.map((b) => (
              <tr key={b.id}>
                <td data-label={t('File', 'الملف')}>{b.name}</td>
                <td data-label={t('Created', 'تاريخ الإنشاء')}>{new Date(b.createdAt).toLocaleString()}</td>
                <td data-label={t('Size', 'الحجم')}>{formatBytes(b.bytes)}</td>
                <td>
                  <Button
                    type="button"
                    size="sm"
                    variant="danger"
                    onClick={() => {
                      setRestoreResultMsg(null);
                      setRestoreTarget(b);
                    }}
                  >
                    <Icon as={RotateCcw} size={14} style={{ marginInlineEnd: 'var(--space-1)' }} />
                    {t('Restore', 'استعادة')}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      )}

      {restoreTarget && (
        <RestoreDialog
          backup={restoreTarget}
          locale={locale}
          onClose={() => setRestoreTarget(null)}
          onDone={(msg) => {
            setRestoreTarget(null);
            setRestoreResultMsg(msg);
          }}
        />
      )}
    </div>
  );
}

/**
 * Google Drive connection — "Connect" navigates the whole tab to Google's
 * consent screen (it can't be a background fetch); Google redirects back to
 * this same page afterward with `?drive=connected` or `?drive=error` (see
 * backend backup.routes.ts's `/drive/callback`), which this reads once and
 * strips from the URL. "Disconnect" revokes the token at Google and clears
 * the stored connection — reconnecting needs a fresh consent round-trip.
 */
function DriveConnectionCard({ locale }: { locale: 'en' | 'ar' }) {
  const isAr = locale === 'ar';
  const t = (en: string, ar: string) => (isAr ? ar : en);

  const { data: status, isPending } = useDriveStatus();
  const connect = useConnectDrive();
  const disconnect = useDisconnectDrive();

  const busy = connect.isPending || disconnect.isPending;

  function handleConnect() {
    // Opened synchronously, in direct response to the click — doing this
    // after an `await` risks the browser's popup blocker treating it as
    // unrelated to the user gesture. The URL is filled in once the mutation
    // fetches it; see useConnectDrive.
    const popup = window.open('about:blank', 'h3m-drive-connect', 'width=520,height=680');
    connect.mutate(popup);
  }

  return (
    <div className="list-item">
      <div className={`stat-icon ${status?.connectedEmail ? 'is-success' : 'is-warning'}`}>
        <Icon as={status?.connectedEmail ? Cloud : CloudOff} size={20} />
      </div>
      <div className="list-item-body">
        <h3 className="list-item-title">{t('Google Drive connection', 'اتصال Google Drive')}</h3>

        {connect.isSuccess && connect.data === 'connected' && (
          <Alert tone="success">{t('Google Drive connected.', 'تم الاتصال بـ Google Drive.')}</Alert>
        )}
        {(connect.isError || connect.data === 'error') && (
          <Alert tone="danger">
            {t('Could not connect Google Drive. Try again.', 'تعذّر الاتصال بـ Google Drive. حاول مجددًا.')}
          </Alert>
        )}

        {!isPending && (
          <p className="text-sm text-secondary" style={{ marginTop: 'var(--space-1)' }}>
            {status?.connectedEmail
              ? t(`Connected as ${status.connectedEmail}.`, `متصل باسم ${status.connectedEmail}.`)
              : status?.configured
                ? t(
                    'Connected via server configuration (no admin account on file).',
                    'متصل عبر إعدادات الخادم (لا يوجد حساب مسؤول مسجّل).'
                  )
                : t('Not connected — backups cannot run until this is connected.', 'غير متصل — لا يمكن تشغيل النسخ الاحتياطي حتى يتم الاتصال.')}
          </p>
        )}

        <div style={{ marginTop: 'var(--space-3)' }}>
          {status?.connectedEmail ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => disconnect.mutate()}
              loading={disconnect.isPending}
              disabled={busy}
            >
              {t('Disconnect', 'قطع الاتصال')}
            </Button>
          ) : (
            <Button type="button" size="sm" onClick={handleConnect} loading={connect.isPending} disabled={busy}>
              {t('Connect Google Drive', 'ربط Google Drive')}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

const FREQUENCIES: BackupFrequency[] = ['DAILY', 'WEEKLY', 'MONTHLY'];
const FREQUENCY_LABEL: Record<BackupFrequency, [string, string]> = {
  DAILY: ['Daily', 'يوميًا'],
  WEEKLY: ['Weekly', 'أسبوعيًا'],
  MONTHLY: ['Monthly', 'شهريًا'],
};

/**
 * How often the scheduled GitHub Actions run actually produces a backup
 * (default weekly) — that workflow fires daily regardless, but skips as a
 * no-op until this interval has elapsed since the newest Drive backup (see
 * backend/scripts/run-backup.ts). "Back up now" above is unaffected by this
 * — it's always immediate, on demand.
 */
function BackupScheduleCard({ locale }: { locale: 'en' | 'ar' }) {
  const isAr = locale === 'ar';
  const t = (en: string, ar: string) => (isAr ? ar : en);

  const { data: settings, isPending } = useBackupSettings();
  const update = useUpdateBackupSettings();

  const fmt = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString() : t('never', 'أبدًا'));
  const nextDueLabel = settings?.lastBackupAt
    ? fmt(settings.nextDueAt)
    : t('as soon as the schedule runs', 'فور تشغيل الجدول');

  return (
    <div className="list-item">
      <div className="stat-icon is-primary">
        <Icon as={CalendarClock} size={20} />
      </div>
      <div className="list-item-body">
        <h3 className="list-item-title">{t('Backup schedule', 'جدول النسخ الاحتياطي')}</h3>

        <div className="field" style={{ marginTop: 'var(--space-2)', maxWidth: '12rem' }}>
          <label className="label" htmlFor="backup-frequency">
            {t('Frequency', 'التكرار')}
          </label>
          <Select
            id="backup-frequency"
            value={settings?.frequency ?? 'WEEKLY'}
            disabled={isPending || update.isPending}
            onChange={(e) => update.mutate(e.target.value as BackupFrequency)}
          >
            {FREQUENCIES.map((f) => (
              <option key={f} value={f}>
                {t(...FREQUENCY_LABEL[f])}
              </option>
            ))}
          </Select>
        </div>

        {!isPending && (
          <p className="text-sm text-secondary" style={{ marginTop: 'var(--space-2)' }}>
            {t(
              `Last automatic backup: ${fmt(settings?.lastBackupAt)}. Next due: ${nextDueLabel}.`,
              `آخر نسخة تلقائية: ${fmt(settings?.lastBackupAt)}. التالية مستحقة: ${nextDueLabel}.`
            )}
          </p>
        )}

        {update.isError && (
          <Alert tone="danger">
            {t('Could not update the schedule.', 'تعذّر تحديث الجدول.')}
          </Alert>
        )}
      </div>
    </div>
  );
}

/**
 * The password re-entry itself is the confirmation — re-entering your own
 * password to authorize replacing the entire live database is a deliberate
 * enough act on its own, no extra "type the filename" step needed. Submitting
 * always calls step-up first (verifies the password and refreshes the
 * session's freshness) and only then the restore, so it works whether or not
 * the session already happened to be within the backend's freshness window
 * (`requireFreshAuth`) — the admin never sees a "wrong step" surprise either way.
 */
function RestoreDialog({
  backup,
  locale,
  onClose,
  onDone,
}: {
  backup: BackupItem;
  locale: 'en' | 'ar';
  onClose: () => void;
  onDone: (msg: { tone: 'success' | 'danger'; text: string }) => void;
}) {
  const isAr = locale === 'ar';
  const t = (en: string, ar: string) => (isAr ? ar : en);

  const restore = useRestoreBackup();
  const stepUp = useStepUp();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const busy = restore.isPending || stepUp.isPending;

  async function submit() {
    setError(null);
    try {
      await stepUp.mutateAsync(password);
    } catch {
      setError(t('Incorrect password.', 'كلمة المرور غير صحيحة.'));
      return;
    }
    try {
      const result = await restore.mutateAsync(backup.id);
      if (result.ok) {
        onDone({
          tone: 'success',
          text: t(
            `Restore complete — database replaced from ${backup.name} (${result.relations ?? '?'} tables).`,
            `اكتملت الاستعادة — استُبدلت قاعدة البيانات من ${backup.name} (${result.relations ?? '?'} جداول).`
          ),
        });
      } else if ('timedOut' in result) {
        onDone({
          tone: 'danger',
          text: t(
            'Still running after a few minutes — the database may already be restored. Refresh the page in a bit to check.',
            'ما زالت العملية قيد التشغيل بعد بضع دقائق — قد تكون قاعدة البيانات قد استُعيدت بالفعل. حدّث الصفحة بعد قليل للتحقق.'
          ),
        });
      } else {
        onDone({ tone: 'danger', text: result.error });
      }
    } catch (e) {
      setError(isApiError(e) ? e.message : t('Restore failed.', 'فشلت الاستعادة.'));
    }
  }

  return (
    <Modal open onClose={onClose} title={t('Restore from backup', 'استعادة من نسخة احتياطية')}>
      <div className="stack" style={{ padding: 'var(--space-5)', maxWidth: '28rem' }}>
        <h2 style={{ margin: 0 }}>{t('Restore from backup', 'استعادة من نسخة احتياطية')}</h2>
        <Alert tone="danger">
          {t(
            `This replaces the entire live database with ${backup.name}. Everything created or changed since it was taken is lost. This cannot be undone.`,
            `سيستبدل هذا كامل قاعدة البيانات الحية بـ ${backup.name}. سيُفقد كل ما أُنشئ أو تغيّر منذ أخذها. لا يمكن التراجع عن هذا.`
          )}
        </Alert>
        <Field
          label={t('Enter your password to confirm', 'أدخل كلمة المرور للتأكيد')}
        >
          {(p) => (
            <Input
              {...p}
              type="password"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={busy}
            />
          )}
        </Field>
        {error && <Alert tone="danger">{error}</Alert>}
        <div className="admin-form__actions">
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
            {t('Cancel', 'إلغاء')}
          </Button>
          <Button
            type="button"
            variant="danger"
            onClick={() => void submit()}
            loading={busy}
            disabled={!password}
          >
            {t('Restore — replace live database', 'استعادة — استبدال قاعدة البيانات الحية')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
