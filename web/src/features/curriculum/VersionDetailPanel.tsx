import { useCallback, useEffect, useState } from 'react';
import { Banner, Button, StatusChip, useToast } from '../../components/index.tsx';
import type { ApiClient, ApiFailure } from '../../lib/api.ts';
import { CourseCatalogDrawer } from './CourseCatalogDrawer.tsx';
import { SuccessorDrawer } from './SuccessorDrawer.tsx';
import { STATUS_TONE } from './CurriculumPage.tsx';
import { emptyTerms, readOnlyReason, type Program, type VersionDetail } from './types.ts';

/**
 * One regulation, as a document rather than a table.
 *
 * Terms are the structure an academic reads, so they are the structure shown.
 * Published versions render the same way and simply lose their actions, which
 * is what makes the difference between draft and published feel like a state of
 * the document rather than a difference in the screen.
 */
export function VersionDetailPanel({
  api, versionId, canManage, program, onChanged, onSelectVersion,
}: {
  api: ApiClient;
  versionId: string;
  canManage: boolean;
  program: Program | null;
  onChanged: (message?: string) => void;
  onSelectVersion: (id: string) => void;
}) {
  const [detail, setDetail] = useState<VersionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const [catalogTerm, setCatalogTerm] = useState<number | null>(null);
  const [successor, setSuccessor] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const toast = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    const result = await api.get<VersionDetail>(`/v1/curriculum-versions/${versionId}`);
    setLoading(false);
    if (result.ok) { setDetail(result.value); setFailure(null); }
    else setFailure(result.error);
  }, [api, versionId]);

  useEffect(() => { void load(); }, [load]);

  if (loading && !detail) return <div className="skeleton" style={{ height: 280 }} />;
  if (!detail) {
    return <Banner tone="error">{failure?.message ?? 'That curriculum could not be loaded.'}</Banner>;
  }

  const readOnly = readOnlyReason(detail);
  const gaps = emptyTerms(detail);
  const editable = detail.editable && canManage;

  async function removeEntry(entryId: string) {
    const result = await api.del(`/v1/curriculum-versions/${versionId}/entries/${entryId}`);
    if (!result.ok) { toast(result.error.message, 'error'); return; }
    await load();
    onChanged();
  }

  async function publish() {
    setPublishing(true);
    const result = await api.post(`/v1/curriculum-versions/${versionId}/publish`, {});
    setPublishing(false);
    if (!result.ok) { setFailure(result.error); return; }
    setFailure(null);
    await load();
    onChanged(`Regulation ${detail!.regulation_year} published`);
  }

  return (
    <div className="detail">
      {/* Context, always visible: which program, which regulation, what state. */}
      <header className="detail__head">
        <div className="detail__identity">
          <div className="detail__crumbs">
            {program ? `${program.department_name} · ${program.name}` : detail.program_name}
          </div>
          <h2 className="detail__title">
            Regulation <span className="tabular">{detail.regulation_year}</span>
            {detail.revision > 1 && (
              <span className="detail__revision">revision {detail.revision}</span>
            )}
          </h2>
          <div className="detail__facts">
            <StatusChip tone={STATUS_TONE[detail.status]}>{detail.status}</StatusChip>
            <span className="tabular">{detail.total_terms} terms</span>
            <span className="tabular">{detail.course_count} courses</span>
            <span className="tabular">{detail.total_credits} credits</span>
            {detail.published_at && (
              <span>published {new Date(detail.published_at).toLocaleDateString()}</span>
            )}
          </div>
        </div>

        <div className="detail__actions">
          {editable && (
            <Button
              variant="primary"
              loading={publishing}
              disabled={detail.course_count === 0 || gaps.length > 0}
              onClick={() => void publish()}
            >
              Publish
            </Button>
          )}
          {canManage && !detail.editable && detail.status !== 'discarded' && (
            <Button variant="secondary" onClick={() => setSuccessor(true)}>New version</Button>
          )}
        </div>
      </header>

      {failure && <Banner tone="error">{failure.message}</Banner>}

      {/* Not just hidden buttons: the reason is stated, so nobody goes looking
          for a way around it. */}
      {readOnly && <Banner tone="info">{readOnly}</Banner>}

      {editable && gaps.length > 0 && (
        <Banner tone="warning">
          {gaps.length === 1 ? 'Term' : 'Terms'} {gaps.join(', ')}{' '}
          {gaps.length === 1 ? 'has' : 'have'} no courses. Publishing is permanent, so every term
          must be complete first.
        </Banner>
      )}

      <ol className="terms">
        {detail.terms.map((term) => (
          <li key={term.term_number} className="term">
            <div className="term__head">
              <h3 className="term__title">
                Term <span className="tabular">{term.term_number}</span>
              </h3>
              <span className="term__credits tabular">
                {term.credits} {term.credits === 1 ? 'credit' : 'credits'}
              </span>
              {editable && (
                <Button variant="text" onClick={() => setCatalogTerm(term.term_number)}>
                  Add course
                </Button>
              )}
            </div>

            {term.courses.length === 0 ? (
              <p className="term__empty">
                Nothing here yet.{editable && ' Add the courses this term requires.'}
              </p>
            ) : (
              <ul className="entries">
                {term.courses.map((entry) => (
                  <li key={entry.id} className="entry">
                    <code className="entry__code">{entry.code}</code>
                    <span className="entry__title">{entry.title}</span>
                    {entry.requirement !== 'core' && (
                      <StatusChip tone="info">
                        {entry.elective_group ?? entry.requirement}
                      </StatusChip>
                    )}
                    {/* Credits sit on the entry, not the course: the same course
                        may be worth something different in another regulation. */}
                    <span className="entry__credits tabular">{entry.credits}</span>
                    {editable && (
                      <span className="row-action">
                        <Button variant="text" onClick={() => void removeEntry(entry.id)}>
                          Remove
                        </Button>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ol>

      <CourseCatalogDrawer
        api={api}
        versionId={versionId}
        termNumber={catalogTerm}
        alreadyPlaced={new Set(detail.terms.flatMap((t) => t.courses.map((c) => c.course_id)))}
        onClose={() => setCatalogTerm(null)}
        onAdded={async (code) => {
          setCatalogTerm(null);
          await load();
          onChanged(`${code} added`);
        }}
      />

      <SuccessorDrawer
        open={successor}
        api={api}
        version={detail}
        onClose={() => setSuccessor(false)}
        onCreated={(id, message) => {
          setSuccessor(false);
          onSelectVersion(id);
          onChanged(message);
        }}
      />
    </div>
  );
}
