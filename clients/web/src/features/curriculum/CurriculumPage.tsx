import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Button, EmptyState, ErrorState, RefreshBar, StatusChip, useToast, type ChipTone,
} from '../../components/index.tsx';
import type { ApiClient, ApiFailure } from '../../lib/api.ts';
import { VersionDetailPanel } from './VersionDetailPanel.tsx';
import { ProgramDrawer } from './ProgramDrawer.tsx';
import { VersionDrawer } from './VersionDrawer.tsx';
import type { CurriculumVersion, Program, VersionStatus } from './types.ts';
import './curriculum.css';

type Status = 'loading' | 'refreshing' | 'ready' | 'error';

export const STATUS_TONE: Record<VersionStatus, ChipTone> = {
  draft: 'warning', published: 'success', superseded: 'neutral', discarded: 'neutral',
};

/**
 * The curriculum workspace.
 *
 * Three panes because the question an academic administrator is answering has
 * three levels: which program, which regulation, and what does it require. A
 * flat table would force them to reconstruct that hierarchy in their head on
 * every visit.
 *
 * Context is visible at every level, so "which regulation year am I editing"
 * never needs to be inferred from a page title.
 */
export function CurriculumPage({ api, canManage }: { api: ApiClient; canManage: boolean }) {
  const [programs, setPrograms] = useState<Program[]>([]);
  const [versions, setVersions] = useState<CurriculumVersion[]>([]);
  const [status, setStatus] = useState<Status>('loading');
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const [selectedProgram, setSelectedProgram] = useState<string | null>(null);
  const [selectedVersion, setSelectedVersion] = useState<string | null>(null);
  const [programDrawer, setProgramDrawer] = useState(false);
  const [versionDrawer, setVersionDrawer] = useState(false);
  const toast = useToast();

  const load = useCallback(async (mode: 'initial' | 'refresh') => {
    setStatus(mode === 'initial' ? 'loading' : 'refreshing');
    const [p, v] = await Promise.all([
      api.get<Program[]>('/v1/programs'),
      api.get<CurriculumVersion[]>('/v1/curriculum-versions'),
    ]);
    if (!p.ok || !v.ok) {
      setFailure(p.ok ? (v as { error: ApiFailure }).error : p.error);
      setStatus(mode === 'initial' ? 'error' : 'ready');
      return;
    }
    setPrograms(p.value);
    setVersions(v.value);
    setFailure(null);
    setStatus('ready');
  }, [api]);

  useEffect(() => { void load('initial'); }, [load]);

  // Selecting the first program on arrival saves a click on every visit, and
  // the workspace is never meaningfully empty on the right.
  useEffect(() => {
    if (!selectedProgram && programs.length > 0) setSelectedProgram(programs[0]!.id);
  }, [programs, selectedProgram]);

  const programVersions = useMemo(
    () => versions
      .filter((v) => v.program_id === selectedProgram)
      .sort((a, b) => b.regulation_year - a.regulation_year || b.revision - a.revision),
    [versions, selectedProgram],
  );

  useEffect(() => {
    // Keep a valid selection when the program changes, defaulting to the newest
    // regulation, which is what an administrator is almost always looking for.
    if (programVersions.length === 0) { setSelectedVersion(null); return; }
    if (!programVersions.some((v) => v.id === selectedVersion)) {
      setSelectedVersion(programVersions[0]!.id);
    }
  }, [programVersions, selectedVersion]);

  const program = programs.find((p) => p.id === selectedProgram) ?? null;

  if (status === 'error') {
    return (
      <ErrorState
        message={failure?.message ?? 'The curriculum could not be loaded.'}
        onRetry={() => void load('initial')}
      />
    );
  }

  return (
    <>
      {status === 'refreshing' ? <RefreshBar /> : <div style={{ height: 2 }} />}

      <div className="page__head">
        <div>
          <p className="page__eyebrow">Academic</p>
          <h1 className="page__title">Curriculum</h1>
          <p className="page__sub">
            {status === 'loading'
              ? 'Loading'
              : `${programs.length} ${programs.length === 1 ? 'program' : 'programs'}`}
          </p>
        </div>
        {canManage && status !== 'loading' && (
          <div className="page__actions">
            <Button variant="secondary" onClick={() => setProgramDrawer(true)}>Add program</Button>
          </div>
        )}
      </div>

      {status === 'loading' ? (
        <div className="curriculum" aria-busy="true">
          <div className="skeleton" style={{ height: 320 }} />
          <div className="skeleton" style={{ height: 320 }} />
        </div>
      ) : programs.length === 0 ? (
        <EmptyState
          title="No programs yet"
          body="A program is the qualification your college awards, such as B.Tech Computer Science. Add one, then write the curriculum for a regulation year."
          action={canManage ? <Button variant="primary" onClick={() => setProgramDrawer(true)}>Add program</Button> : undefined}
        />
      ) : (
        <div className="curriculum">
          {/* Pane one: which program. */}
          <nav className="pane pane--programs" aria-label="Programs">
            <h2 className="pane__title">Programs</h2>
            <ul className="pane__list">
              {programs.map((p) => (
                <li key={p.id}>
                  <button
                    className={`program${p.id === selectedProgram ? ' program--on' : ''}`}
                    aria-current={p.id === selectedProgram ? 'true' : undefined}
                    onClick={() => setSelectedProgram(p.id)}
                  >
                    <span className="program__name">{p.name}</span>
                    <span className="program__meta">
                      {p.department_name} · {p.duration_years} {p.duration_years === 1 ? 'year' : 'years'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </nav>

          {/* Pane two: which regulation. Ordered newest first. */}
          <section className="pane pane--versions" aria-label="Curriculum versions">
            <div className="pane__head">
              <h2 className="pane__title">Regulations</h2>
              {canManage && program && (
                <Button variant="text" onClick={() => setVersionDrawer(true)}>New</Button>
              )}
            </div>
            {programVersions.length === 0 ? (
              <p className="pane__empty">
                No curriculum yet for {program?.name}.
                {canManage && ' Start a draft for a regulation year.'}
              </p>
            ) : (
              <ul className="pane__list">
                {programVersions.map((v) => (
                  <li key={v.id}>
                    <button
                      className={`version${v.id === selectedVersion ? ' version--on' : ''}`}
                      aria-current={v.id === selectedVersion ? 'true' : undefined}
                      onClick={() => setSelectedVersion(v.id)}
                    >
                      <span className="version__year tabular">
                        {v.regulation_year}
                        {v.revision > 1 && <span className="version__rev">r{v.revision}</span>}
                      </span>
                      <StatusChip tone={STATUS_TONE[v.status]}>{v.status}</StatusChip>
                      <span className="version__meta tabular">
                        {v.course_count} courses · {v.total_credits} credits
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Pane three: what it requires. */}
          <section className="pane pane--detail" aria-label="Curriculum structure">
            {selectedVersion ? (
              <VersionDetailPanel
                api={api}
                versionId={selectedVersion}
                canManage={canManage}
                program={program}
                onChanged={(message) => { if (message) toast(message); void load('refresh'); }}
                onSelectVersion={setSelectedVersion}
              />
            ) : (
              <EmptyState
                title="No regulation selected"
                body="Choose a regulation year, or start a draft to define what this program requires."
              />
            )}
          </section>
        </div>
      )}

      <ProgramDrawer
        open={programDrawer}
        api={api}
        onClose={() => setProgramDrawer(false)}
        onCreated={(name) => { setProgramDrawer(false); toast(`${name} added`); void load('refresh'); }}
      />

      <VersionDrawer
        open={versionDrawer}
        api={api}
        program={program}
        existingYears={programVersions.map((v) => v.regulation_year)}
        onClose={() => setVersionDrawer(false)}
        onCreated={(id, year) => {
          setVersionDrawer(false);
          setSelectedVersion(id);
          toast(`Draft started for regulation ${year}`);
          void load('refresh');
        }}
      />
    </>
  );
}
