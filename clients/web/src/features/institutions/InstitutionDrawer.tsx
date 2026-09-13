import { useCallback, useEffect, useState } from 'react';
import {
  Banner, Button, Drawer, Field, ReasonDrawer, StatusChip, type ChipTone,
} from '../../components/index.tsx';
import type { ApiClient, ApiFailure } from '../../lib/api.ts';
import type { ProvisionedInstitution } from './ProvisionDrawer.tsx';
import {
  ACTION_COPY, confirmCodeMatches, formatWhen, invitationSummary, reactivationNote,
  type InstitutionDetail, type LifecycleAction,
} from './lifecycle.ts';

const TONE: Record<string, ChipTone> = { active: 'success', trial: 'info', suspended: 'warning', closed: 'neutral' };

/**
 * One college, as the platform sees it: its record, its lifecycle, and its
 * first administrator's invitation. Nothing operational about the college is
 * shown, because the platform does not own it.
 *
 * The actions offered are the ones the server listed; the server checks again.
 */
export function InstitutionDrawer({
  api, id, onClose, onChanged, onInvitation,
}: {
  api: ApiClient;
  id: string | null;
  onClose: () => void;
  onChanged: () => void;
  onInvitation: (issued: ProvisionedInstitution) => void;
}) {
  const [detail, setDetail] = useState<InstitutionDetail | null>(null);
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const [pending, setPending] = useState<LifecycleAction | null>(null);
  const [typedCode, setTypedCode] = useState('');
  const [reissuing, setReissuing] = useState(false);

  const load = useCallback(async (target: string) => {
    setFailure(null);
    const result = await api.get<InstitutionDetail>(`/v1/institutions/${target}`);
    if (result.ok) setDetail(result.value);
    else setFailure(result.error);
  }, [api]);

  useEffect(() => {
    setDetail(null);
    if (id) void load(id);
  }, [id, load]);

  if (!id) return null;

  async function confirm(action: LifecycleAction, reason: string): Promise<string | null> {
    if (!detail) return 'The college is still loading.';
    if (action === 'close' && !confirmCodeMatches(typedCode, detail.code)) {
      return `Type ${detail.code} to confirm.`;
    }
    const result = await api.post<InstitutionDetail>(`/v1/institutions/${detail.id}/${action}`, {
      version: detail.version,
      reason,
      ...(action === 'close' ? { confirm_code: typedCode } : {}),
    });
    if (!result.ok) return result.error.message;
    setDetail(result.value);
    onChanged();
    return null;
  }

  async function reissue() {
    if (!detail) return;
    setReissuing(true);
    const result = await api.post<{ institution: InstitutionDetail; invitation: ProvisionedInstitution['invitation'] }>(
      `/v1/institutions/${detail.id}/administrator-invitation`, {},
    );
    setReissuing(false);
    if (!result.ok) { setFailure(result.error); return; }
    const d = result.value.institution;
    setDetail(d);
    onInvitation({
      institution: { id: d.id, code: d.code, name: d.name, status: d.status, seat_limit: d.seat_limit },
      administrator: { person_id: '', account_id: '' },
      invitation: result.value.invitation,
    });
  }

  const copy = pending ? ACTION_COPY[pending] : null;
  const admin = detail?.administrator ?? null;
  const note = detail ? reactivationNote(detail) : null;

  return (
    <>
      <Drawer
        open
        title={detail?.name ?? 'College'}
        subtitle={detail ? detail.code : 'Loading'}
        onClose={onClose}
        footer={
          detail && detail.actions.length > 0 ? (
            <div className="drawer-actions">
              {detail.actions.map((action) => (
                <Button
                  key={action}
                  variant={ACTION_COPY[action].danger ? 'danger' : 'primary'}
                  onClick={() => { setTypedCode(''); setPending(action); }}
                >
                  {ACTION_COPY[action].button}
                </Button>
              ))}
            </div>
          ) : undefined
        }
      >
        {failure && (
          <Banner tone="error">
            {failure.message}{' '}
            {!detail && <Button variant="text" onClick={() => void load(id)}>Try again</Button>}
          </Banner>
        )}
        {!detail && !failure && <p className="page__sub">Loading</p>}
        {detail && (
          <>
            <dl className="detail">
              <div><dt>Status</dt><dd><StatusChip tone={TONE[detail.status] ?? 'neutral'}>{detail.status}</StatusChip></dd></div>
              {note && <div><dt>On reactivation</dt><dd>{note}</dd></div>}
              <div><dt>Status changed</dt><dd>{formatWhen(detail.status_changed_at)}</dd></div>
              <div><dt>Created</dt><dd>{formatWhen(detail.created_at)}</dd></div>
              <div><dt>Plan</dt><dd>{detail.plan}</dd></div>
              <div><dt>Seats</dt><dd className="tabular">{detail.seat_limit}</dd></div>
              <div><dt>Time zone</dt><dd>{detail.timezone}</dd></div>
            </dl>

            <h3 className="drawer-section">Administrator</h3>
            {admin ? (
              <dl className="detail">
                <div><dt>Name</dt><dd>{admin.full_name}</dd></div>
                <div><dt>Email</dt><dd>{admin.email ?? 'None'}</dd></div>
                <div><dt>Account</dt><dd>{admin.account_status}</dd></div>
                <div><dt>Invitation</dt><dd>{invitationSummary(admin)}</dd></div>
              </dl>
            ) : <p className="page__sub">No administrator recorded.</p>}
            {admin?.can_reissue && (
              <Button variant="secondary" loading={reissuing} onClick={() => void reissue()}>
                Issue a new invitation
              </Button>
            )}
          </>
        )}
      </Drawer>

      <ReasonDrawer
        open={pending !== null}
        title={copy?.title ?? ''}
        subtitle={detail?.name}
        label={copy?.label ?? 'Reason'}
        placeholder={copy?.placeholder}
        confirmLabel={copy?.confirmLabel ?? 'Confirm'}
        body={
          copy && detail ? (
            <>
              <Banner tone={copy.danger ? 'warning' : 'info'}>{copy.body}</Banner>
              {pending === 'close' && (
                <Field
                  label={`Type ${detail.code} to confirm`}
                  value={typedCode}
                  autoComplete="off"
                  onChange={(e) => setTypedCode(e.currentTarget.value)}
                />
              )}
            </>
          ) : undefined
        }
        onClose={() => setPending(null)}
        onConfirm={(reason) => confirm(pending!, reason)}
      />
    </>
  );
}
