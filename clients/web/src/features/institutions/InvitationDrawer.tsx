import { useState } from 'react';
import { Banner, Button, Drawer } from '../../components/index.tsx';
import type { ProvisionedInstitution } from './ProvisionDrawer.tsx';

/**
 * The invitation token is returned once and stored only as a hash, so this is
 * the only moment it can be read. The screen says so plainly rather than
 * letting an operator close it and discover the loss later.
 */
export function InvitationDrawer({
  result, onClose,
}: { result: ProvisionedInstitution | null; onClose: () => void }) {
  const [copied, setCopied] = useState(false);

  if (!result) return null;

  const link = `${window.location.origin}/accept-invite?college=${result.institution.code}&token=${result.invitation.token}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Drawer
      open
      title={`${result.institution.name} is ready`}
      subtitle="Send this invitation to the administrator."
      onClose={onClose}
      footer={<Button variant="primary" onClick={onClose}>Done</Button>}
    >
      <Banner tone="warning">
        This link is shown once. It is stored as a hash and cannot be retrieved again.
        If it is lost, issue a new invitation.
      </Banner>

      <div className="invite">
        <span className="invite__label">Invitation link</span>
        <code className="invite__value">{link}</code>
        <Button variant="secondary" onClick={copy}>{copied ? 'Copied' : 'Copy link'}</Button>
      </div>

      <dl className="detail">
        <div><dt>Expires</dt><dd>{new Date(result.invitation.expires_at).toLocaleString()}</dd></div>
        <div><dt>Delivery</dt><dd>Not sent automatically yet</dd></div>
        <div><dt>Seats</dt><dd className="tabular">{result.institution.seat_limit}</dd></div>
      </dl>
    </Drawer>
  );
}
