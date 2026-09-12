import { useEffect, useMemo, useState } from 'react';
import { Banner, Button, Drawer, Field } from '../../components/index.tsx';
import type { ApiClient, ApiFailure } from '../../lib/api.ts';
import type { Course, CurriculumVersion, VersionDetail } from '../curriculum/types.ts';
import { COMPONENT_LABEL, type Component, type Offering, type Section } from './types.ts';

interface Choice {
  id: string;
  code: string;
  title: string;
  /** Whether the curriculum for this cohort's term expects the course. */
  expected: boolean;
}

const COMPONENTS: Component[] = ['lecture', 'lab', 'tutorial'];

/**
 * Attaching a course to a cohort.
 *
 * The curriculum already says what this cohort should be taught in this term, so
 * that is the list offered first and the catalogue is a deliberate second step.
 * It keeps the common case to two clicks and makes a departure from the
 * regulation a visible choice rather than an accident.
 *
 * The offering carries no credits or requirement. Those live on the curriculum
 * entry, immutable once published, which is what keeps a transcript stable when
 * a later regulation changes.
 */
export function OfferingDrawer({
  section, api, taken, onClose, onCreated,
}: {
  section: Section | null;
  api: ApiClient;
  taken: Offering[];
  onClose: () => void;
  onCreated: (code: string) => void;
}) {
  const [expected, setExpected] = useState<Choice[]>([]);
  const [catalogue, setCatalogue] = useState<Course[]>([]);
  const [browsing, setBrowsing] = useState(false);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Choice | null>(null);
  const [component, setComponent] = useState<Component>('lecture');
  const [curriculumMissing, setCurriculumMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<ApiFailure | null>(null);

  const open = section !== null;

  useEffect(() => {
    if (!section) return;
    setExpected([]); setCatalogue([]); setBrowsing(false); setQuery('');
    setSelected(null); setComponent('lecture'); setFailure(null); setCurriculumMissing(false);

    void (async () => {
      const versions = await api.get<CurriculumVersion[]>(
        `/v1/curriculum-versions?program_id=${section.program.id}`,
      );
      if (!versions.ok) return;
      // The regulation in force is the published one. A superseded version
      // still governs its own cohort, but a new offering follows what is
      // current, and a draft governs nobody.
      const live = versions.value.find((v) => v.status === 'published');
      if (!live) { setCurriculumMissing(true); setBrowsing(true); return; }
      const detail = await api.get<VersionDetail>(`/v1/curriculum-versions/${live.id}`);
      if (!detail.ok) return;
      const term = detail.value.terms.find((t) => t.term_number === section.term_number);
      const courses = (term?.courses ?? []).map((c) => ({
        id: c.course_id, code: c.code, title: c.title, expected: true,
      }));
      setExpected(courses);
      if (courses.length === 0) { setCurriculumMissing(true); setBrowsing(true); }
    })();
  }, [section, api]);

  // The catalogue is fetched only when the operator asks for it, because most
  // additions come straight from the curriculum.
  useEffect(() => {
    if (!browsing || catalogue.length > 0) return;
    void api.get<Course[]>('/v1/courses').then((r) => { if (r.ok) setCatalogue(r.value); });
  }, [browsing, catalogue.length, api]);

  /** Course and component together are the offering's identity. */
  const usedComponents = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const o of taken) {
      if (o.status === 'cancelled') continue;
      const set = map.get(o.course.id) ?? new Set<string>();
      set.add(o.component);
      map.set(o.course.id, set);
    }
    return map;
  }, [taken]);

  const results = useMemo(() => {
    if (!browsing) return expected;
    const q = query.trim().toLowerCase();
    const expectedIds = new Set(expected.map((c) => c.id));
    return catalogue
      .filter((c) => c.status === 'active')
      .filter((c) => !q || c.code.toLowerCase().includes(q) || c.title.toLowerCase().includes(q))
      .map((c) => ({ id: c.id, code: c.code, title: c.title, expected: expectedIds.has(c.id) }))
      .slice(0, 60);
  }, [browsing, expected, catalogue, query]);

  if (!open) return null;

  const clash = selected ? usedComponents.get(selected.id)?.has(component) === true : false;

  async function add() {
    if (!selected) return;
    setBusy(true);
    setFailure(null);
    const result = await api.post('/v1/offerings', {
      section_id: section!.id,
      course_id: selected.id,
      component,
    });
    setBusy(false);
    if (!result.ok) { setFailure(result.error); return; }
    onCreated(selected.code);
  }

  return (
    <Drawer
      open
      title={`Add a course to ${section!.label}`}
      subtitle={`${section!.program.name} · term ${section!.term_number} · ${section!.term.name}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button
            variant="primary" loading={busy} disabled={!selected || clash}
            onClick={() => void add()}
          >
            {selected ? `Add ${selected.code}` : 'Add course'}
          </Button>
        </>
      }
    >
      {failure && <Banner tone="error">{failure.message}</Banner>}

      {curriculumMissing && (
        <Banner tone="info">
          No published curriculum covers term {section!.term_number} of {section!.program.name},
          so there is nothing to suggest. Choose from the catalogue instead.
        </Banner>
      )}

      {browsing ? (
        <Field
          label="Search the catalogue" value={query} autoFocus placeholder="Code or title"
          onChange={(e) => setQuery(e.currentTarget.value)}
        />
      ) : (
        <p className="drawer__note">
          What the published curriculum expects this cohort to be taught this term.
        </p>
      )}

      <div className="catalog" role="listbox" aria-label="Courses">
        {results.length === 0 ? (
          <p className="catalog__empty">
            {browsing
              ? query ? `Nothing matches "${query}".` : 'No courses in the catalogue yet.'
              : 'The curriculum lists no courses for this term.'}
          </p>
        ) : (
          results.map((course) => {
            const used = usedComponents.get(course.id);
            const fully = used !== undefined && COMPONENTS.every((c) => used.has(c));
            return (
              <button
                key={course.id}
                type="button"
                role="option"
                aria-selected={selected?.id === course.id}
                className={`catalog__row${selected?.id === course.id ? ' catalog__row--on' : ''}`}
                disabled={fully}
                onClick={() => {
                  setSelected(course);
                  // Pick a component this cohort does not already have, so the
                  // obvious next click is a valid one.
                  const free = COMPONENTS.find((c) => !used?.has(c)) ?? 'lecture';
                  setComponent(free);
                }}
              >
                <code className="entry__code">{course.code}</code>
                <span className="catalog__title">{course.title}</span>
                {course.expected && browsing && (
                  <span className="catalog__flag">In the curriculum</span>
                )}
                {used && used.size > 0 && (
                  <span className="catalog__flag catalog__flag--muted">
                    {fully ? 'Already added' : `${[...used].join(', ')} added`}
                  </span>
                )}
              </button>
            );
          })
        )}
      </div>

      {!browsing && (
        <Button variant="text" onClick={() => setBrowsing(true)}>
          Teach something outside the curriculum
        </Button>
      )}

      {selected && (
        <div className="field">
          <label className="field__label" htmlFor="offering-component">Taught as</label>
          <select
            id="offering-component" className="field__input" value={component}
            onChange={(e) => setComponent(e.currentTarget.value as Component)}
          >
            {COMPONENTS.map((c) => (
              <option key={c} value={c} disabled={usedComponents.get(selected.id)?.has(c)}>
                {COMPONENT_LABEL[c]}
              </option>
            ))}
          </select>
          {/* Colleges staff a lab separately from the lecture that shares its
              course code, so each gets its own offering and its own teacher. */}
          <span className="field__message">
            {clash
              ? `${selected.code} already has a ${component} for this section.`
              : 'A lab or tutorial is staffed separately from the lecture.'}
          </span>
        </div>
      )}
    </Drawer>
  );
}
