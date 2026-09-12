import {
  createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState,
  type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode,
} from 'react';
import './components.css';

/* ---- Button ------------------------------------------------------------ */

type ButtonVariant = 'primary' | 'secondary' | 'text' | 'danger';

export function Button({
  variant = 'secondary', loading = false, block = false, children, ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant; loading?: boolean; block?: boolean;
}) {
  return (
    <button
      {...rest}
      className={`btn btn--${variant}${block ? ' btn--block' : ''}`}
      disabled={rest.disabled || loading}
      aria-busy={loading || undefined}
    >
      {loading && <span className="btn__spinner" aria-hidden="true" />}
      {children}
    </button>
  );
}

/* ---- Field ------------------------------------------------------------- */

export function Field({
  label, error, hint, ...rest
}: InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string; hint?: string }) {
  const id = useId();
  const messageId = `${id}-message`;
  const message = error ?? hint;
  return (
    <div className={`field${error ? ' field--invalid' : ''}`}>
      {/* A real label, never a placeholder standing in for one (§7.8). */}
      <label className="field__label" htmlFor={id}>{label}</label>
      <input
        {...rest}
        id={id}
        className="field__input"
        aria-invalid={error ? true : undefined}
        aria-describedby={message ? messageId : undefined}
      />
      <span className="field__message" id={messageId} role={error ? 'alert' : undefined}>
        {message ?? ' '}
      </span>
    </div>
  );
}

/* ---- Status chip ------------------------------------------------------- */

export type ChipTone = 'success' | 'warning' | 'error' | 'info' | 'neutral';

export function StatusChip({ tone, children }: { tone: ChipTone; children: ReactNode }) {
  return (
    <span className={`chip chip--${tone}`}>
      <span className="chip__dot" aria-hidden="true" />
      {children}
    </span>
  );
}

/* ---- Screen states ----------------------------------------------------- */

export function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="state">
      <svg className="state__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
        <path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
      </svg>
      <h2 className="state__title">{title}</h2>
      <p className="state__body">{body}</p>
      {action}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="state" role="alert">
      <svg className="state__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
        <circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16h.01" />
      </svg>
      <h2 className="state__title">That did not load</h2>
      <p className="state__body">{message}</p>
      {onRetry && <Button variant="secondary" onClick={onRetry}>Try again</Button>}
    </div>
  );
}

/** Skeleton rows carry the real column widths, so nothing shifts when data lands. */
export function SkeletonRows({ rows = 5, widths }: { rows?: number; widths: string[] }) {
  return (
    <>
      {Array.from({ length: rows }, (_, r) => (
        <tr key={r}>
          {widths.map((w, c) => (
            <td key={c}><div className="skeleton" style={{ width: w, height: 16 }} /></td>
          ))}
        </tr>
      ))}
    </>
  );
}

export function RefreshBar() {
  return (
    <div className="refresh-bar" role="status" aria-label="Refreshing">
      <div className="refresh-bar__fill" />
    </div>
  );
}

export function Banner({ tone, children }: { tone: 'error' | 'info' | 'warning'; children: ReactNode }) {
  return <div className={`banner banner--${tone}`} role={tone === 'error' ? 'alert' : 'status'}>{children}</div>;
}

/* ---- Drawer ------------------------------------------------------------ */

/**
 * Context, not confirmation. Drawers keep the operator's place in the list
 * (§10.2). Focus is trapped, restored on close, and Escape closes.
 */
export function Drawer({
  open, title, subtitle, onClose, children, footer,
}: {
  open: boolean; title: string; subtitle?: string; onClose: () => void;
  children: ReactNode; footer?: ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const restoreTo = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    restoreTo.current = document.activeElement as HTMLElement;
    const first = panel.current?.querySelector<HTMLElement>('input, button, select, textarea');
    first?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
      if (e.key !== 'Tab' || !panel.current) return;
      const focusable = panel.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      restoreTo.current?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <>
      <div className="scrim" onClick={onClose} aria-hidden="true" />
      <div className="drawer" role="dialog" aria-modal="true" aria-label={title} ref={panel}>
        <div className="drawer__head">
          <div>
            <h2 className="drawer__title">{title}</h2>
            {subtitle && <p className="drawer__subtitle">{subtitle}</p>}
          </div>
          <Button variant="text" onClick={onClose} aria-label="Close">Esc</Button>
        </div>
        <div className="drawer__body">{children}</div>
        {footer && <div className="drawer__foot">{footer}</div>}
      </div>
    </>
  );
}

/**
 * A destructive step that needs an explanation, asked for in the product's own
 * language rather than through a browser prompt.
 *
 * The reason is required, not optional: a cancellation with no stated cause
 * leaves whoever reads the record next term with no way to understand it.
 */
export function ReasonDrawer({
  open, title, subtitle, label, placeholder, confirmLabel, body, onClose, onConfirm,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  label: string;
  placeholder?: string;
  confirmLabel: string;
  body?: ReactNode;
  onClose: () => void;
  /** Resolves to an error message to show in place, or null on success. */
  onConfirm: (reason: string) => Promise<string | null>;
}) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) { setReason(''); setBusy(false); setError(null); }
  }, [open]);

  if (!open) return null;

  async function confirm() {
    setBusy(true);
    setError(null);
    const failed = await onConfirm(reason.trim());
    setBusy(false);
    if (failed) { setError(failed); return; }
    onClose();
  }

  return (
    <Drawer
      open
      title={title}
      subtitle={subtitle}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Keep it</Button>
          <Button
            variant="danger" loading={busy} disabled={reason.trim().length === 0}
            onClick={() => void confirm()}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      {error && <Banner tone="error">{error}</Banner>}
      {body}
      <Field
        label={label} value={reason} autoFocus placeholder={placeholder}
        onChange={(e) => setReason(e.currentTarget.value)}
      />
    </Drawer>
  );
}

/* ---- Toasts ------------------------------------------------------------ */

interface Toast { id: number; message: string; tone: 'neutral' | 'error' }
const ToastContext = createContext<(message: string, tone?: 'neutral' | 'error') => void>(() => {});
export const useToast = () => useContext(ToastContext);

export function ToastHost({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((message: string, tone: 'neutral' | 'error' = 'neutral') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 5000);
  }, []);

  const value = useMemo(() => push, [push]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toasts" aria-live="polite" aria-atomic="false">
        {toasts.map((t) => (
          <div key={t.id} className={`toast${t.tone === 'error' ? ' toast--error' : ''}`}>{t.message}</div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
