import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Button, EmptyState, ErrorState, ReasonDrawer, RefreshBar, StatusChip, useToast,
  type ChipTone,
} from '../../components/index.tsx';
import type { ApiClient, ApiFailure } from '../../lib/api.ts';
import type { Program } from '../curriculum/types.ts';
import { SectionDrawer } from './SectionDrawer.tsx';
import { OfferingDrawer } from './OfferingDrawer.tsx';
import { InstructorDrawer } from './InstructorDrawer.tsx';
import {
  COMPONENT_LABEL, NO_FILTERS, blockedReason, isFiltering, leadOf, unstaffedCount, visibleGroups,
  type AcademicYear, type Offering, type OfferingFilters, type OfferingStatus, type Section,
  type SectionStatus, type Term,
} from './types.ts';
import './teaching.css';

type Phase = 'loading' | 'refreshing' | 'ready' | 'error';

export interface TeachingPermissions {
  manageSections: boolean;
  manageOfferings: boolean;
  assignInstructors: boolean;
}

const SECTION_TONE: Record<SectionStatus, ChipTone> = {
  planned: 'neutral', open: 'info', active: 'success',
  completed: 'neutral', cancelled: 'warning',
};
const OFFERING_TONE: Record<OfferingStatus, ChipTone> = {
  planned: 'neutral', active: 'success', completed: 'neutral', cancelled: 'warning',
};
const STATUS_FILTERS: Array<OfferingStatus | 'all'> = ['all', 'planned', 'active', 'completed'];

/**
 * The teaching workspace: cohorts, the courses each cohort is taught, and who
 * teaches them.
 *
 * One term at a time, because that is the unit an operator works in. Every row
 * answers which cohort, which course, which instructor and what state without
 * navigating away, and an instructor is attached from the row itself rather than
 * from a separate screen that would make the relationship invisible.
 */
export function TeachingPage({ api, can }: { api: ApiClient; can: TeachingPermissions }) {
  const [terms, setTerms] = useState<Term[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [offerings, setOfferings] = useState<Offering[]>([]);
  const [termId, setTermId] = useState<string | null>(null);
  const [calendarReady, setCalendarReady] = useState(false);
  const [phase, setPhase] = useState<Phase>('loading');
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const [filters, setFilters] = useState<OfferingFilters>(NO_FILTERS);
  const [sectionDrawer, setSectionDrawer] = useState(false);
  const [offeringFor, setOfferingFor] = useState<Section | null>(null);
  const [instructorFor, setInstructorFor] = useState<Offering | null>(null);
  const [cancelling, setCancelling] = useState<Cancellation | null>(null);
  const toast = useToast();

  // The calendar and the program list load once. The current academic year
  // decides the opening term, so the screen opens on the work in hand.
  useEffect(() => {
    void Promise.all([
      api.get<AcademicYear[]>('/v1/academic-years'),
      api.get<Term[]>('/v1/terms'),
      api.get<Program[]>('/v1/programs'),
    ]).then(([years, allTerms, allPrograms]) => {
      if (allPrograms.ok) setPrograms(allPrograms.value.filter((p) => p.status === 'active'));
      if (!allTerms.ok) { setFailure(allTerms.error); setPhase('error'); return; }
      setTerms(allTerms.value);
      const current = years.ok ? years.value.find((y) => y.is_current) : undefined;
      const opening = allTerms.value.find((t) => t.academic_year_id === current?.id)
        ?? allTerms.value[0];
      setTermId(opening?.id ?? null);
      setCalendarReady(true);
      if (!opening) setPhase('ready');
    });
  }, [api]);

  const load = useCallback(async (mode: 'initial' | 'refresh') => {
    if (!termId) return;
    setPhase(mode === 'initial' ? 'loading' : 'refreshing');
    const [s, o] = await Promise.all([
      api.get<Section[]>(`/v1/sections?term_id=${termId}`),
      api.get<Offering[]>(`/v1/offerings?term_id=${termId}`),
    ]);
    if (!s.ok || !o.ok) {
      setFailure(s.ok ? (o as { ok: false; error: ApiFailure }).error : s.error);
      // A failed refresh keeps the data already on screen: losing the list
      // because one poll failed is worse than showing it with a warning.
      setPhase(mode === 'initial' ? 'error' : 'ready');
      return;
    }
    setSections(s.value);
    setOfferings(o.value);
    setFailure(null);
    setPhase('ready');
  }, [api, termId]);

  useEffect(() => { void load('initial'); }, [load]);

  const groups = useMemo(
    () => visibleGroups(sections, offerings, filters),
    [sections, offerings, filters],
  );
  const unstaffed = useMemo(() => unstaffedCount(offerings), [offerings]);
  const term = terms.find((t) => t.id === termId) ?? null;

  async function moveSection(section: Section, to: SectionStatus) {
    // Cancellation is the one transition that claims something should not have
    // happened, so it asks why before it happens.
    if (to === 'cancelled') { setCancelling({ kind: 'section', section }); return; }
    const result = await api.post(`/v1/sections/${section.id}/status`, { status: to });
    if (!result.ok) { toast(result.error.message, 'error'); return; }
    toast(`Section ${section.label} is now ${to}`);
    void load('refresh');
  }

  async function moveOffering(offering: Offering, to: OfferingStatus) {
    if (to === 'cancelled') { setCancelling({ kind: 'offering', offering }); return; }
    const result = await api.post(`/v1/offerings/${offering.id}/status`, { status: to });
    if (!result.ok) { toast(result.error.message, 'error'); return; }
    toast(`${offering.course.code} is now ${to}`);
    void load('refresh');
  }

  async function cancelWithReason(reason: string): Promise<string | null> {
    if (!cancelling) return null;
    const path = cancelling.kind === 'section'
      ? `/v1/sections/${cancelling.section.id}/status`
      : `/v1/offerings/${cancelling.offering.id}/status`;
    const result = await api.post(path, { status: 'cancelled', reason });
    if (!result.ok) return result.error.message;
    toast(cancelling.kind === 'section'
      ? `Section ${cancelling.section.label} cancelled`
      : `${cancelling.offering.course.code} cancelled`);
    void load('refresh');
    return null;
  }

  if (phase === 'error') {
    return (
      <ErrorState
        message={failure?.message ?? 'Teaching could not be loaded.'}
        onRetry={() => { setFailure(null); void load('initial'); }}
      />
    );
  }

  return (
    <>
      {phase === 'refreshing' ? <RefreshBar /> : <div className="refresh-bar__spacer" />}

      <div className="page__head">
        <div>
          <h1 className="page__title">Teaching</h1>
          <p className="page__sub">
            {term
              ? `${term.academic_year_name} · ${term.name}`
              : calendarReady ? 'No academic terms yet' : 'Loading'}
          </p>
        </div>
        <div className="page__actions">
          {terms.length > 1 && (
            <select
              className="search" aria-label="Term" value={termId ?? ''}
              onChange={(e) => setTermId(e.currentTarget.value)}
            >
              {terms.map((t) => (
                <option key={t.id} value={t.id}>{t.academic_year_name} · {t.name}</option>
              ))}
            </select>
          )}
          <input
            className="search" type="search" placeholder="Course or instructor"
            aria-label="Search courses and instructors" value={filters.query}
            onChange={(e) => setFilters({ ...filters, query: e.currentTarget.value })}
          />
          {can.manageSections && term && (
            <Button variant="primary" onClick={() => setSectionDrawer(true)}>Add section</Button>
          )}
        </div>
      </div>

      {sections.length > 0 && (
        <div className="filters">
          {/* The one question worth a dedicated filter at the start of a term:
              what is still going to refuse to start. */}
          {unstaffed > 0 && (
            <button
              className={`filter${filters.unstaffedOnly ? ' filter--on' : ''}`}
              aria-pressed={filters.unstaffedOnly}
              onClick={() => setFilters({ ...filters, unstaffedOnly: !filters.unstaffedOnly })}
            >
              Needs an instructor
              <span className="filter__count tabular">{unstaffed}</span>
            </button>
          )}
          {STATUS_FILTERS.map((s) => (
            <button
              key={s}
              className={`filter${filters.status === s ? ' filter--on' : ''}`}
              aria-pressed={filters.status === s}
              onClick={() => setFilters({ ...filters, status: s })}
            >
              {s === 'all' ? 'All courses' : s}
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

      {/* A refresh that failed while data is on screen: say so, keep the data. */}
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
      ) : terms.length === 0 ? (
        <EmptyState
          title="No academic terms yet"
          body="Teaching is organised by term. Create an academic year and its terms before adding cohorts."
        />
      ) : sections.length === 0 ? (
        <EmptyState
          title={`Nothing is taught in ${term?.name ?? 'this term'} yet`}
          body="A section is a cohort of students, such as year three section A. Add one, then add the courses it is taught."
          action={can.manageSections
            ? <Button variant="primary" onClick={() => setSectionDrawer(true)}>Add section</Button>
            : undefined}
        />
      ) : groups.length === 0 ? (
        <EmptyState
          title="Nothing matches"
          body={filters.unstaffedOnly
            ? 'Every course waiting to start has an instructor.'
            : filters.query.trim()
              ? `No course or instructor matches "${filters.query.trim()}".`
              : 'No course matches these filters.'}
          action={<Button variant="secondary" onClick={() => setFilters(NO_FILTERS)}>Clear filters</Button>}
        />
      ) : (
        <ul className="cohorts m-stagger">
          {groups.map(({ section, offerings: taught }) => (
            <li key={section.id} className="cohort">
              <div className="cohort__head">
                <div>
                  <h2 className="cohort__name">
                    {section.program.name}
                    <span className="cohort__label">
                      Term <span className="tabular">{section.term_number}</span> · {section.label}
                    </span>
                  </h2>
                  <div className="cohort__meta">
                    <StatusChip tone={SECTION_TONE[section.status]}>{section.status}</StatusChip>
                    <span>{section.department_name}</span>
                    {section.capacity !== null && (
                      <span className="tabular">{section.capacity} seats</span>
                    )}
                    {section.cancelled_reason && <span>{section.cancelled_reason}</span>}
                  </div>
                </div>

                <div className="cohort__actions">
                  {can.manageOfferings && section.status !== 'completed'
                    && section.status !== 'cancelled' && (
                    <Button variant="text" onClick={() => setOfferingFor(section)}>Add course</Button>
                  )}
                  {can.manageSections && section.allowed_transitions
                    .filter((t) => t !== 'planned')
                    .map((to) => (
                      <Button key={to} variant="text" onClick={() => void moveSection(section, to)}>
                        {SECTION_ACTION[to]}
                      </Button>
                    ))}
                </div>
              </div>

              {taught.length === 0 ? (
                <p className="cohort__empty">
                  {isFiltering(filters)
                    ? 'No matching courses.'
                    : can.manageOfferings
                      ? 'No courses yet. Add what this cohort is taught.'
                      : 'No courses yet.'}
                </p>
              ) : (
                <ul className="offerings">
                  {taught.map((offering) => {
                    const blocked = blockedReason(offering);
                    const lead = leadOf(offering);
                    const shown = lead ?? offering.instructors[0];
                    return (
                      <li key={offering.id} className="offering">
                        <code className="entry__code">{offering.course.code}</code>
                        <span className="offering__title">
                          {offering.course.title}
                          {offering.component !== 'lecture' && (
                            <span className="offering__component">
                              {COMPONENT_LABEL[offering.component]}
                            </span>
                          )}
                        </span>

                        {/* Who teaches this, answered and changed in place. */}
                        <button
                          className={`instructor${shown ? '' : ' instructor--none'}`}
                          onClick={() => setInstructorFor(offering)}
                          title={shown ? 'Instructors and history' : 'Assign an instructor'}
                        >
                          {shown ? shown.full_name : 'Assign instructor'}
                          {offering.instructors.length > 1 && (
                            <span className="instructor__more tabular">
                              +{offering.instructors.length - 1}
                            </span>
                          )}
                        </button>

                        <StatusChip tone={OFFERING_TONE[offering.status]}>
                          {offering.status}
                        </StatusChip>

                        {can.manageOfferings && (
                          <span className="offering__actions">
                            {offering.status === 'planned' && (
                              <Button
                                variant="text"
                                disabled={!offering.can_activate}
                                title={blocked ?? undefined}
                                onClick={() => void moveOffering(offering, 'active')}
                              >
                                Start
                              </Button>
                            )}
                            {offering.status === 'active' && (
                              <Button
                                variant="text"
                                onClick={() => void moveOffering(offering, 'completed')}
                              >
                                Complete
                              </Button>
                            )}
                            {offering.allowed_transitions.includes('cancelled') && (
                              <Button
                                variant="text"
                                onClick={() => void moveOffering(offering, 'cancelled')}
                              >
                                Cancel
                              </Button>
                            )}
                          </span>
                        )}

                        {/* The reason it cannot start, written out rather than
                            left to a disabled button and a tooltip. */}
                        {blocked && <p className="offering__blocked">{blocked}</p>}
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}

      <SectionDrawer
        open={sectionDrawer}
        api={api}
        term={term}
        programs={programs}
        onClose={() => setSectionDrawer(false)}
        onCreated={(label) => {
          setSectionDrawer(false);
          toast(`Section ${label} added`);
          void load('refresh');
        }}
      />

      <OfferingDrawer
        section={offeringFor}
        api={api}
        taken={offerings.filter((o) => o.section.id === offeringFor?.id)}
        onClose={() => setOfferingFor(null)}
        onCreated={(code) => {
          setOfferingFor(null);
          toast(`${code} added to ${offeringFor?.label ?? 'the section'}`);
          void load('refresh');
        }}
      />

      <ReasonDrawer
        open={cancelling !== null}
        title={cancelling?.kind === 'section'
          ? `Cancel section ${cancelling.section.label}`
          : `Cancel ${cancelling?.kind === 'offering' ? cancelling.offering.course.code : 'this course'}`}
        subtitle="The record stays, marked cancelled, with the reason attached."
        label="Why is this being cancelled?"
        placeholder="Too few enrolments to run this term"
        confirmLabel="Cancel it"
        body={cancelling?.kind === 'section'
          ? (
            <p className="drawer__note">
              Cancelling a cohort is refused while any of its courses is still being taught.
              Complete or cancel those first.
            </p>
          )
          : undefined}
        onClose={() => setCancelling(null)}
        onConfirm={cancelWithReason}
      />

      <InstructorDrawer
        offering={instructorFor}
        api={api}
        canAssign={can.assignInstructors}
        onClose={() => setInstructorFor(null)}
        onChanged={(message) => {
          toast(message);
          void load('refresh');
        }}
      />
    </>
  );
}

type Cancellation =
  | { kind: 'section'; section: Section }
  | { kind: 'offering'; offering: Offering };

const SECTION_ACTION: Record<SectionStatus, string> = {
  planned: 'Back to planning',
  open: 'Open for enrolment',
  active: 'Start teaching',
  completed: 'Complete term',
  cancelled: 'Cancel',
};
