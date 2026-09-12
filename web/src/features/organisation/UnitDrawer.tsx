import { useEffect, useState, type FormEvent } from 'react';
import { Banner, Button, Drawer, Field } from '../../components/index.tsx';
import type { ApiClient, ApiFailure } from '../../lib/api.ts';
import type { Campus, Department } from './types.ts';

export type UnitRequest =
  | { kind: 'campus' }
  | { kind: 'department'; campus: Campus }
  | { kind: 'archive'; unit: Campus | Department; type: 'campus' | 'department' }
  | null;

const slug = (name: string) =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32);

/**
 * One drawer for creating a campus, creating a department, and archiving
 * either. They share a shape and a validation model; three near-identical
 * drawers would drift apart within a month.
 */
export function UnitDrawer({
  request, api, onClose, onDone,
}: {
  request: UnitRequest;
  api: ApiClient;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [codeEdited, setCodeEdited] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<ApiFailure | null>(null);

  useEffect(() => {
    setName(''); setCode(''); setCodeEdited(false); setReason(''); setFailure(null);
  }, [request]);

  if (!request) return null;

  const effectiveCode = codeEdited ? code : slug(name);
  const isArchive = request.kind === 'archive';
  const ready = isArchive ? reason.trim().length > 0 : name.trim().length > 1 && effectiveCode.length > 0;

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    if (!request) return;
    setBusy(true);
    setFailure(null);

    let result;
    if (request.kind === 'campus') {
      result = await api.post('/v1/campuses', { name: name.trim(), code: effectiveCode });
    } else if (request.kind === 'department') {
      result = await api.post('/v1/departments', {
        campus_id: request.campus.id, name: name.trim(), code: effectiveCode,
      });
    } else {
      const path = request.type === 'campus' ? 'campuses' : 'departments';
      result = await api.post(`/v1/${path}/${request.unit.id}/archive`, { reason: reason.trim() });
    }

    setBusy(false);
    if (!result.ok) { setFailure(result.error); return; }

    onDone(
      request.kind === 'campus' ? `${name.trim()} added`
        : request.kind === 'department' ? `${name.trim()} added to ${request.campus.name}`
        : `${request.unit.name} archived`,
    );
  }

  if (isArchive) {
    const { unit, type } = request;
    return (
      <Drawer
        open
        title={`Archive ${unit.name}`}
        subtitle={type === 'campus' ? 'Campus' : 'Department'}
        onClose={onClose}
        footer={
          <>
            <Button variant="secondary" onClick={onClose} disabled={busy}>Keep it</Button>
            <Button variant="danger" onClick={() => void submit()} loading={busy} disabled={!ready}>
              Archive
            </Button>
          </>
        }
      >
        {failure && <Banner tone="error">{failure.message}</Banner>}
        <Banner tone="warning">
          Archiving hides {unit.name} from everyday use. The record stays, so past
          records that reference it still make sense, and the code becomes free to reuse.
        </Banner>
        <Field
          label="Reason" value={reason} required autoFocus
          placeholder="Merged into Civil Engineering"
          hint="Recorded in the audit trail against your name."
          onChange={(e) => setReason(e.currentTarget.value)}
        />
      </Drawer>
    );
  }

  const isCampus = request.kind === 'campus';
  return (
    <Drawer
      open
      title={isCampus ? 'Add a campus' : `Add a department`}
      subtitle={isCampus ? undefined : `Inside ${request.campus.name}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" form="unit-form" type="submit" loading={busy} disabled={!ready}>
            {busy ? 'Adding' : isCampus ? 'Add campus' : 'Add department'}
          </Button>
        </>
      }
    >
      <form id="unit-form" onSubmit={submit} noValidate style={{ display: 'contents' }}>
        {failure && <Banner tone="error">{failure.message}</Banner>}
        <Field
          label="Name" value={name} required autoFocus
          placeholder={isCampus ? 'North Campus' : 'Computer Science'}
          onChange={(e) => setName(e.currentTarget.value)}
          error={failure?.fieldErrors?.name}
        />
        <Field
          label="Short code" value={effectiveCode} required
          hint="Appears in identifiers and reports, and does not change when the name does."
          onChange={(e) => { setCodeEdited(true); setCode(e.currentTarget.value.toLowerCase()); }}
          error={failure?.fieldErrors?.code}
        />
        {ready && !isCampus && (
          <Banner tone="info">
            Access can then be scoped to {name.trim()}, so a head of department sees
            only their own people.
          </Banner>
        )}
      </form>
    </Drawer>
  );
}
