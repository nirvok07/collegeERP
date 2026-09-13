import { useState } from 'react';
import { Banner, Button, Drawer } from '../../components/index.tsx';
import { formatWhen, invitationLink, type IssuedInvitation } from './accounts.ts';

/** The invitation token is stored as a hash, so this is the only time it can be read. */
export function InviteLinkDrawer({
  name, invitation, onClose,
}: { name: string; invitation: IssuedInvitation | null; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  if (!invitation) return null;
  const link = invitationLink(window.location.origin, invitation.token);
  async function copy() {
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 2500); } catch { setCopied(false); }
  }
  return (
    <Drawer open title={`Invitation for ${name}`} subtitle="Send this link to them directly." onClose={onClose}
      footer={<Button variant="primary" onClick={onClose}>Done</Button>}>
      <Banner tone="warning">
        This link is shown once. They set a password and an authenticator app with it before they can sign in.
      </Banner>
      <div className="invite">
        <span className="invite__label">Invitation link</span>
        <code className="invite__value">{link}</code>
        <Button variant="secondary" onClick={copy}>{copied ? 'Copied' : 'Copy link'}</Button>
      </div>
      <dl className="detail"><div><dt>Expires</dt><dd>{formatWhen(invitation.expires_at)}</dd></div></dl>
    </Drawer>
  );
}
