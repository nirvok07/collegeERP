import { useEffect, useMemo, useState } from 'react';
import { Banner, Button, Drawer, Field } from '../../components/index.tsx';
import type { ApiClient, ApiFailure } from '../../lib/api.ts';
import type { Course } from './types.ts';

/**
 * Choosing a course, and saying what it is worth here.
 *
 * A searchable catalogue rather than a dropdown, because a college has hundreds
 * of courses and a select element is unusable past about thirty.
 *
 * The two halves are deliberate: picking the course answers "which subject",
 * and the fields below answer "what does it count for in this regulation". That
 * second answer belongs to this version alone, which is why the same course can
 * appear elsewhere worth something different.
 */
export function CourseCatalogDrawer({
  api, versionId, termNumber, alreadyPlaced, onClose, onAdded,
}: {
  api: ApiClient;
  versionId: string;
  termNumber: number | null;
  alreadyPlaced: ReadonlySet<string>;
  onClose: () => void;
  onAdded: (code: string) => void;
}) {
  const [courses, setCourses] = useState<Course[]>([]);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Course | null>(null);
  const [credits, setCredits] = useState('4');
  const [requirement, setRequirement] = useState<'core' | 'elective' | 'audit'>('core');
  const [electiveGroup, setElectiveGroup] = useState('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const [creating, setCreating] = useState(false);
  const [newCode, setNewCode] = useState('');
  const [newTitle, setNewTitle] = useState('');

  const open = termNumber !== null;

  useEffect(() => {
    if (!open) return;
    setQuery(''); setSelected(null); setCredits('4');
    setRequirement('core'); setElectiveGroup(''); setFailure(null);
    setCreating(false); setNewCode(''); setNewTitle('');
    void api.get<Course[]>('/v1/courses').then((r) => { if (r.ok) setCourses(r.value); });
  }, [open, api]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return courses
      .filter((c) => !q || c.code.toLowerCase().includes(q) || c.title.toLowerCase().includes(q))
      .slice(0, 50);
  }, [courses, query]);

  if (!open) return null;

  async function add() {
    if (!selected) return;
    setBusy(true);
    setFailure(null);
    const result = await api.post(`/v1/curriculum-versions/${versionId}/entries`, {
      course_id: selected.id,
      term_number: termNumber,
      credits: Number(credits),
      requirement,
      ...(requirement === 'elective' && electiveGroup.trim()
        ? { elective_group: electiveGroup.trim() }
        : {}),
    });
    setBusy(false);
    if (!result.ok) { setFailure(result.error); return; }
    onAdded(selected.code);
  }

  async function createCourse() {
    setBusy(true);
    setFailure(null);
    const result = await api.post<{ id: string }>('/v1/courses', {
      code: newCode.trim().toUpperCase(),
      title: newTitle.trim(),
    });
    setBusy(false);
    if (!result.ok) { setFailure(result.error); return; }
    const course: Course = {
      id: result.value.id, code: newCode.trim().toUpperCase(), title: newTitle.trim(),
      description: null, status: 'active', used_in_versions: 0,
    };
    setCourses((existing) => [course, ...existing]);
    setSelected(course);
    setCreating(false);
  }

  const validCredits = Number(credits) >= 0 && Number(credits) <= 30 && credits !== '';

  return (
    <Drawer
      open
      title={`Add a course to term ${termNumber}`}
      subtitle="What the course counts for here applies to this regulation only."
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button
            variant="primary"
            loading={busy}
            disabled={!selected || !validCredits}
            onClick={() => void add()}
          >
            Add to term {termNumber}
          </Button>
        </>
      }
    >
      {failure && <Banner tone="error">{failure.message}</Banner>}

      {creating ? (
        <>
          <Banner tone="info">
            A course code identifies the subject permanently and can never be reused, because it
            appears on transcripts. What it is worth belongs to each regulation, not to the course.
          </Banner>
          <Field
            label="Course code" value={newCode} autoFocus placeholder="CS301"
            onChange={(e) => setNewCode(e.currentTarget.value.toUpperCase())}
            error={failure?.fieldErrors?.code}
          />
          <Field
            label="Title" value={newTitle} placeholder="Operating Systems"
            onChange={(e) => setNewTitle(e.currentTarget.value)}
            error={failure?.fieldErrors?.title}
          />
          <div style={{ display: 'flex', gap: 'var(--space-md)' }}>
            <Button variant="secondary" onClick={() => setCreating(false)}>Back to catalogue</Button>
            <Button
              variant="primary"
              loading={busy}
              disabled={newCode.trim().length < 2 || newTitle.trim().length < 2}
              onClick={() => void createCourse()}
            >
              Create course
            </Button>
          </div>
        </>
      ) : (
        <>
          <Field
            label="Search the catalogue" value={query} autoFocus
            placeholder="Code or title"
            onChange={(e) => setQuery(e.currentTarget.value)}
          />

          <div className="catalog" role="listbox" aria-label="Course catalogue">
            {results.length === 0 ? (
              <p className="catalog__empty">
                {query ? `Nothing matches "${query}".` : 'No courses in the catalogue yet.'}
              </p>
            ) : (
              results.map((course) => {
                const placed = alreadyPlaced.has(course.id);
                return (
                  <button
                    key={course.id}
                    role="option"
                    aria-selected={selected?.id === course.id}
                    className={`catalog__row${selected?.id === course.id ? ' catalog__row--on' : ''}`}
                    disabled={placed}
                    // Already in this regulation: offering it again would fail
                    // on a unique constraint, so it is refused here instead.
                    title={placed ? 'Already in this curriculum' : undefined}
                    onClick={() => setSelected(course)}
                  >
                    <code className="entry__code">{course.code}</code>
                    <span className="catalog__title">{course.title}</span>
                    {placed
                      ? <span className="catalog__note">already added</span>
                      : course.used_in_versions > 0 && (
                          <span className="catalog__note tabular">
                            in {course.used_in_versions} {course.used_in_versions === 1 ? 'regulation' : 'regulations'}
                          </span>
                        )}
                  </button>
                );
              })
            )}
          </div>

          <Button variant="text" onClick={() => setCreating(true)}>
            Not in the catalogue? Create a course
          </Button>

          {selected && (
            <>
              <hr className="rule" />
              <p className="catalog__chosen">
                <code className="entry__code">{selected.code}</code> {selected.title}
              </p>
              <Field
                label="Credits in this regulation" type="number" value={credits}
                min={0} max={30} step={0.5}
                hint="Applies to this version only. The same course may be worth more or less elsewhere."
                onChange={(e) => setCredits(e.currentTarget.value)}
                error={failure?.fieldErrors?.credits}
              />
              <div className="field">
                <span className="field__label" id="requirement-label">Requirement</span>
                <div className="segmented" role="radiogroup" aria-labelledby="requirement-label">
                  {(['core', 'elective', 'audit'] as const).map((r) => (
                    <button
                      key={r} type="button" role="radio" aria-checked={requirement === r}
                      className={`segmented__option${requirement === r ? ' segmented__option--on' : ''}`}
                      onClick={() => setRequirement(r)}
                    >
                      {r[0]!.toUpperCase() + r.slice(1)}
                    </button>
                  ))}
                </div>
                <span className="field__message"> </span>
              </div>
              {requirement === 'elective' && (
                <Field
                  label="Elective group" value={electiveGroup}
                  placeholder="Professional Elective I"
                  hint="Students choose from within a group."
                  onChange={(e) => setElectiveGroup(e.currentTarget.value)}
                  error={failure?.fieldErrors?.electiveGroup}
                />
              )}
            </>
          )}
        </>
      )}
    </Drawer>
  );
}
