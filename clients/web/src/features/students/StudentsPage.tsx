import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Button, EmptyState, ErrorState, ReasonDrawer, RefreshBar, SkeletonRows, StatusChip,
  useToast, type ChipTone,
} from '../../components/index.tsx';
import type { ApiClient, ApiFailure } from '../../lib/api.ts';
import type { Program } from '../curriculum/types.ts';
import type { Section } from '../teaching/types.ts';
import { AdmitDrawer } from './AdmitDrawer.tsx';
import { PlacementDrawer } from './PlacementDrawer.tsx';
import {
  NO_FILTERS, STATUS_LABEL, filterStudents, initials, isFiltering, unplacedCount,
  type Student, type StudentFilters, type StudentStatus,
} from './types.ts';
import './students.css';

type Phase = 'loading' | 'refreshing' | 'ready' | 'error';

export interface StudentPermissions {
  manageStudents: boolean;
  manageEnrolment: boolean;
}

const STATUS_TONE: Record<StudentStatus, ChipTone> = {
  enrolled: 'success', on_leave: 'warning', withdrawn: 'neutral', graduated: 'info',
};
const STATUS_FILTERS: Array<StudentStatus | 'all'> = ['all', 'enrolled', 'on_leave', 'withdrawn'];

/**
 * The student register, and the two things an operator does with it: admit
 * somebody, and put them in a cohort.
 *
 * A table rather than cards, because the register is scanned by enrolment
 * number and compared row against row. The one thing surfaced above the table
 * is who is not in a cohort yet, since an unplaced student is on nobody's
 * roster and would be quietly missing from every register until noticed.
 */
export function StudentsPage({ api, can }: { api: ApiClient; can: StudentPermissions }) {
  const [students, setStudents] = useState<Student[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [phase, setPhase] = useState<Phase>('loading');
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const [filters, setFilters] = useState<StudentFilters>(NO_FILTERS);
  const [admitOpen, setAdmitOpen] = useState(false);
  const [placing, setPlacing] = useState<Student | null>(null);
  const [withdrawing, setWithdrawing] = useState<Student | null>(null);
  const toast = useToast();

  useEffect(() => {
    void Promise.all([
      api.get<Program[]>('/v1/programs'),
      api.get<Section[]>('/v1/sections'),
    ]).then(([p, s]) => {
      if (p.ok) setPrograms(p.value.filter((x) => x.status === 'active'));
      if (s.ok) {
        // Only cohorts that can still take a student.
        setSections(s.value.filter((x) => x.status !== 'completed' && x.status !== 'cancelled'));
      }
    });
  }, [api]);

  const load = useCallback(async (mode: 'initial' | 'refresh') => {
    setPhase(mode === 'initial' ? 'loading' : 'refreshing');
    const result = await api.get<Student[]>('/v1/students');
    if (!result.ok) {
      setFailure(result.error);
      setPhase(mode === 'initial' ? 'error' : 'ready');
      return;
    }
    setStudents(result.value);
    setFailure(null);
    setPhase('ready');
  }, [api]);

  useEffect(() => { void load('initial'); }, [load]);

  const visible = useMemo(() => filterStudents(students, filters), [students, filters]);
  const unplaced = useMemo(() => unplacedCount(students), [students]);

  async function withdraw(reason: string): Promise<string | null> {
    if (!withdrawing) return null;
    const result = await api.patch(`/v1/students/${withdrawing.id}/status`, {
      status: 'withdrawn', reason,
    });
    if (!result.ok) return result.error.message;
    toast(`${withdrawing.full_name} withdrawn`);
    void load('refresh');
    return null;
  }

  if (phase === 'error') {
    return (
      <ErrorState
        message={failure?.message ?? 'The student register could not be loaded.'}
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
          <h1 className="page__title">Students</h1>
          <p className="page__sub">
            {phase === 'loading'
              ? 'Loading'
              : `${students.length} on the register`}
          </p>
        </div>
        <div className="page__actions">
          <input
            className="search" type="search" placeholder="Name or enrolment number"
            aria-label="Search students" value={filters.query}
            onChange={(e) => setFilters({ ...filters, query: e.currentTarget.value })}
          />
          {can.manageStudents && (
            <Button variant="primary" onClick={() => setAdmitOpen(true)}>Admit student</Button>
          )}
        </div>
      </div>

      {students.length > 0 && (
        <div className="filters">
          {/* An unplaced student is on nobody's roster. That is the one thing
              worth a dedicated filter here. */}
          {unplaced > 0 && (
            <button
              className={`filter${filters.unplacedOnly ? ' filter--on' : ''}`}
              aria-pressed={filters.unplacedOnly}
              onClick={() => setFilters({ ...filters, unplacedOnly: !filters.unplacedOnly })}
            >
              Not in a cohort
              <span className="filter__count tabular">{unplaced}</span>
            </button>
          )}
          {STATUS_FILTERS.map((s) => (
            <button
              key={s}
              className={`filter${filters.status === s ? ' filter--on' : ''}`}
              aria-pressed={filters.status === s}
              onClick={() => setFilters({ ...filters, status: s })}
            >
              {s === 'all' ? 'Everyone' : STATUS_LABEL[s]}
            </button>
          ))}
          {programs.length > 1 && (
            <select
              className="filter filter--select" aria-label="Program"
              value={filters.programId ?? ''}
              onChange={(e) => setFilters({ ...filters, programId: e.currentTarget.value || null })}
            >
              <option value="">Every program</option>
              {programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}
        </div>
      )}

      {failure && phase === 'ready' && (
        <div className="banner banner--error teaching__degraded" role="alert">
          <span>{failure.message}</span>
          <Button variant="text" onClick={() => void load('refresh')}>Retry</Button>
        </div>
      )}

      {phase !== 'loading' && students.length === 0 ? (
        <EmptyState
          title="Nobody on the register yet"
          body="Admit a student, then place them in the cohort they will be taught with."
          action={can.manageStudents
            ? <Button variant="primary" onClick={() => setAdmitOpen(true)}>Admit student</Button>
            : undefined}
        />
      ) : phase !== 'loading' && visible.length === 0 ? (
        <EmptyState
          title="Nothing matches"
          body={filters.unplacedOnly
            ? 'Everybody enrolled is in a cohort.'
            : 'No student matches these filters.'}
          action={<Button variant="secondary" onClick={() => setFilters(NO_FILTERS)}>Clear filters</Button>}
        />
      ) : (
        <div className="table__wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Student</th>
                <th scope="col">Program</th>
                <th scope="col">Cohort</th>
                <th scope="col">Status</th>
                <th scope="col" className="table__actions">&nbsp;</th>
              </tr>
            </thead>
            <tbody>
              {phase === 'loading' ? (
                <SkeletonRows rows={6} widths={['220px', '160px', '90px', '80px', '60px']} />
              ) : visible.map((student) => (
                <tr key={student.id}>
                  <td className="table__primary">
                    <span className="who">
                      <span className="who__mark" aria-hidden="true">
                        {initials(student.full_name)}
                      </span>
                      <span className="who__text">
                        <span>{student.full_name}</span>
                        <code className="entry__code">{student.enrolment_number}</code>
                      </span>
                    </span>
                  </td>
                  <td className="table__muted">{student.program.name}</td>
                  <td>
                    {student.section
                      ? (
                        <span className="tabular">
                          Term {student.section.term_number} · {student.section.label}
                        </span>
                      )
                      : <span className="table__muted">Not placed</span>}
                  </td>
                  <td>
                    <StatusChip tone={STATUS_TONE[student.status]}>
                      {STATUS_LABEL[student.status]}
                    </StatusChip>
                  </td>
                  <td className="table__actions">
                    <span className="row-action">
                      {can.manageEnrolment && student.status === 'enrolled' && (
                        <Button variant="text" onClick={() => setPlacing(student)}>
                          {student.section ? 'Move' : 'Place'}
                        </Button>
                      )}
                      {can.manageStudents && student.status === 'enrolled' && (
                        <Button variant="text" onClick={() => setWithdrawing(student)}>
                          Withdraw
                        </Button>
                      )}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {isFiltering(filters) && visible.length > 0 && (
        <p className="days__note">Showing {visible.length} of {students.length} students.</p>
      )}

      <AdmitDrawer
        open={admitOpen}
        api={api}
        programs={programs}
        onClose={() => setAdmitOpen(false)}
        onAdmitted={(name) => {
          setAdmitOpen(false);
          toast(`${name} admitted`);
          void load('refresh');
        }}
      />

      <PlacementDrawer
        student={placing}
        api={api}
        sections={sections}
        onClose={() => setPlacing(null)}
        onChanged={(message) => {
          setPlacing(null);
          toast(message);
          void load('refresh');
        }}
      />

      <ReasonDrawer
        open={withdrawing !== null}
        title={`Withdraw ${withdrawing?.full_name ?? 'this student'}`}
        subtitle="Their record stays, and so does every class they were marked on."
        label="Why are they leaving?"
        placeholder="Transferred to another college"
        confirmLabel="Withdraw"
        body={(
          <p className="drawer__note">
            This ends their cohort placement and every course enrolment from today. Registers
            already taken are untouched: they were taught those classes.
          </p>
        )}
        onClose={() => setWithdrawing(null)}
        onConfirm={withdraw}
      />
    </>
  );
}
