import { useCallback, useEffect, useState } from 'react';
import { Banner, Button, Drawer, Field, StatusChip, type ChipTone } from '../../components/index.tsx';
import type { ApiClient, ApiFailure } from '../../lib/api.ts';
import type { Offering } from '../teaching/types.ts';
import {
  KINDS, KIND_LABEL, STATUS_LABEL, progressOf, weightLeft,
  type ComponentKind, type ComponentStatus, type OfferingAssessments,
} from './types.ts';

const TONE: Record<ComponentStatus, ChipTone> = {
  draft: 'info', submitted: 'warning', verified: 'success', cancelled: 'neutral',
};

/**
 * A course's internal assessment plan, set by the department.
 *
 * Opened from the course in the teaching workspace, beside its weekly timetable,
 * because the plan is a property of the course. The weight still unallocated is
 * shown before it is typed, so the form says the limit rather than failing on it.
 */
export function AssessmentPlanDrawer({
  offering, api, onClose, onOpenSheet,
}: {
  offering: Offering | null;
  api: ApiClient;
  onClose: () => void;
  onOpenSheet: (componentId: string) => void;
}) {
  const [plan, setPlan] = useState<OfferingAssessments | null>(null);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<ComponentKind>('test');
  const [maxMarks, setMaxMarks] = useState('50');
  const [weight, setWeight] = useState('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<ApiFailure | null>(null);

  const offeringId = offering?.id ?? null;

  const reload = useCallback(async () => {
    if (!offeringId) return;
    const result = await api.get<OfferingAssessments>(`/v1/offerings/${offeringId}/assessments`);
    if (result.ok) setPlan(result.value);
    else setFailure(result.error);
  }, [api, offeringId]);

  useEffect(() => {
    if (!offeringId) return;
    setPlan(null); setFailure(null); setName(''); setKind('test'); setMaxMarks('50'); setWeight('');
    void reload();
  }, [offeringId, reload]);

  if (!offering) return null;

  const left = plan ? weightLeft(plan.weight_total) : 100;
  const ready = name.trim().length > 0 && Number(maxMarks) > 0
    && Number(weight) > 0 && Number(weight) <= left;

  async function add() {
    setBusy(true);
    setFailure(null);
    const result = await api.post(`/v1/offerings/${offering!.id}/assessments`, {
      name: name.trim(), kind, max_marks: Number(maxMarks), weight: Number(weight),
    });
    setBusy(false);
    if (!result.ok) { setFailure(result.error); return; }
    setName(''); setWeight('');
    await reload();
  }

  return (
    <Drawer
      open
      title={`Assessment for ${offering.course.code}`}
      subtitle={`${offering.program.name} · ${offering.section.label} · ${offering.term.name}`}
      onClose={onClose}
      footer={<Button variant="secondary" onClick={onClose}>Done</Button>}
    >
      {failure && <Banner tone="error">{failure.message}</Banner>}

      {plan && (
        <p className="drawer__note">
          {plan.weight_total === 0
            ? 'No components yet. Weights are percentages of the internal total.'
            : `${plan.weight_total}% allocated, ${left}% left.`}
        </p>
      )}

      {plan && plan.components.length > 0 && (
        <ul className="assignees">
          {plan.components.map((c) => (
            <li key={c.id} className="assignee">
              <button className="plan-row" onClick={() => onOpenSheet(c.id)}>
                <span className="assignee__name">{c.name}</span>
                <span className="assignee__since tabular">
                  {KIND_LABEL[c.kind]} · out of {c.max_marks} · {c.weight}%
                </span>
                <span className="assignee__since">{progressOf(c)}</span>
              </button>
              <StatusChip tone={TONE[c.status]}>{STATUS_LABEL[c.status]}</StatusChip>
            </li>
          ))}
        </ul>
      )}

      {left > 0 ? (
        <>
          <h3 className="drawer__section">Add a component</h3>
          <Field
            label="Name" value={name} placeholder="Test 1"
            onChange={(e) => setName(e.currentTarget.value)}
            error={failure?.fieldErrors?.name}
          />
          <div className="drawer__row">
            <div className="field field--inline">
              <label className="field__label" htmlFor="plan-kind">Kind</label>
              <select
                id="plan-kind" className="field__input" value={kind}
                onChange={(e) => setKind(e.currentTarget.value as ComponentKind)}
              >
                {KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
              </select>
            </div>
            <div className="field field--inline">
              <label className="field__label" htmlFor="plan-max">Out of</label>
              <input
                id="plan-max" className="field__input" type="number" min={0.5} step={0.5}
                value={maxMarks} onChange={(e) => setMaxMarks(e.currentTarget.value)}
              />
            </div>
            <div className="field field--inline">
              <label className="field__label" htmlFor="plan-weight">Weight %</label>
              <input
                id="plan-weight" className="field__input" type="number" min={0.5} max={left}
                step={0.5} value={weight} placeholder={String(left)}
                onChange={(e) => setWeight(e.currentTarget.value)}
              />
            </div>
          </div>
          {/* Fixed once the first mark is entered, so it is said before, not after. */}
          <p className="drawer__note">
            Maximum marks and weight are fixed once the first mark is entered.
          </p>
          <Button variant="primary" loading={busy} disabled={!ready} onClick={() => void add()}>
            Add component
          </Button>
        </>
      ) : (
        <Banner tone="info">All 100% is allocated. Cancel a component that was never held to free its weight.</Banner>
      )}
    </Drawer>
  );
}
