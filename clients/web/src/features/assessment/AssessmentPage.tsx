import { useCallback, useEffect, useState } from 'react';
import {
  Button, EmptyState, ErrorState, RefreshBar, StatusChip, useToast,
} from '../../components/index.tsx';
import type { ApiClient, ApiFailure } from '../../lib/api.ts';
import { AssessmentSheetDrawer } from './AssessmentSheetDrawer.tsx';
import { KIND_LABEL, type AssessmentComponent } from './types.ts';
import './assessment.css';

type Phase = 'loading' | 'refreshing' | 'ready' | 'error';

/**
 * The head of department's queue: mark sheets submitted and waiting to be
 * verified, limited by the server to the cohorts this reader may verify.
 *
 * A queue rather than a browser, because the one question here is what is
 * waiting on me. Plans are edited on the course itself, in Teaching.
 */
export function AssessmentPage({ api }: { api: ApiClient }) {
  const [rows, setRows] = useState<AssessmentComponent[]>([]);
  const [phase, setPhase] = useState<Phase>('loading');
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const toast = useToast();

  const load = useCallback(async (mode: 'initial' | 'refresh') => {
    setPhase(mode === 'initial' ? 'loading' : 'refreshing');
    const result = await api.get<AssessmentComponent[]>('/v1/assessments?status=submitted');
    if (!result.ok) {
      setFailure(result.error);
      setPhase(mode === 'initial' ? 'error' : 'ready');
      return;
    }
    setRows(result.value);
    setFailure(null);
    setPhase('ready');
  }, [api]);

  useEffect(() => { void load('initial'); }, [load]);

  if (phase === 'error') {
    return (
      <ErrorState
        message={failure?.message ?? 'The verification queue could not be loaded.'}
        onRetry={() => { setFailure(null); void load('initial'); }}
      />
    );
  }

  return (
    <>
      {phase === 'refreshing' ? <RefreshBar /> : <div className="refresh-bar__spacer" />}
      <div className="page__head">
        <div>
          <p className="page__eyebrow">Academic</p>
          <h1 className="page__title">Assessment</h1>
          <p className="page__sub">
            {phase === 'loading'
              ? 'Loading'
              : `${rows.length} ${rows.length === 1 ? 'sheet' : 'sheets'} awaiting verification`}
          </p>
        </div>
      </div>

      {failure && phase === 'ready' && (
        <div className="banner banner--error teaching__degraded" role="alert">
          <span>{failure.message}</span>
          <Button variant="text" onClick={() => void load('refresh')}>Retry</Button>
        </div>
      )}

      {phase === 'loading' ? (
        <div className="cohort-skeleton" aria-hidden="true">
          {[0, 1].map((i) => <div key={i} className="skeleton cohort-skeleton__card" />)}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          title="Nothing waiting"
          body="Every submitted mark sheet in your reach has been verified. Plans are set on each course, under Teaching."
        />
      ) : (
        <ul className="registers m-stagger">
          {rows.map((c) => (
            <li key={c.id} className="register-row">
              <button className="register-row__main" onClick={() => setOpen(c.id)}>
                <span className="class-row__course">
                  <code className="entry__code">{c.course.code}</code>
                  {c.name}
                </span>
                <span className="class-row__context">
                  {c.program_name} · {c.section.label} · {KIND_LABEL[c.kind]} out of {c.max_marks}
                  {c.submitted_by ? ` · submitted by ${c.submitted_by}` : ''}
                </span>
              </button>
              <span className="register-row__progress tabular">{c.mark_count} results · held {c.held_on}</span>
              <StatusChip tone="warning">awaiting verification</StatusChip>
            </li>
          ))}
        </ul>
      )}

      <AssessmentSheetDrawer
        componentId={open}
        api={api}
        onClose={() => setOpen(null)}
        onChanged={(message) => { toast(message); void load('refresh'); }}
      />
    </>
  );
}
