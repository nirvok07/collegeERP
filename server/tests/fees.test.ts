/**
 * M11 Student Finance, FEE-1: fee heads and structures.
 *
 * What matters: only fee.manage composes a structure, only a complete draft
 * can be published, publication is irreversible, and a published structure
 * cannot be quietly edited afterward. See
 * docs/blueprint/modules/m11-student-finance.md for the module contract.
 */
import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { LightMyRequestResponse } from 'fastify';
import {
  buildTestApp, provisionCollege, resetData, seedPlatformAccount,
  setupDatabase, signInPlatform, type TestApp,
} from './helpers.ts';

let harness: TestApp;
before(async () => { await setupDatabase(); harness = await buildTestApp(); });
after(async () => harness.close());
beforeEach(resetData);

const as = (t: string) => ({ authorization: `Bearer ${t}` });
const get = (url: string, t: string) =>
  harness.app.inject({ method: 'GET', url, headers: as(t) }) as Promise<LightMyRequestResponse>;
const post = (url: string, t: string, body: unknown = {}) =>
  harness.app.inject({ method: 'POST', url, headers: as(t), payload: body as never }) as Promise<LightMyRequestResponse>;
const del = (url: string, t: string) =>
  harness.app.inject({ method: 'DELETE', url, headers: as(t) }) as Promise<LightMyRequestResponse>;

async function login(institutionCode: string, identifier: string, password: string) {
  return ((await harness.app.inject({
    method: 'POST', url: '/v1/auth/login',
    payload: { institution_code: institutionCode, identifier, password },
  })) as LightMyRequestResponse).json().data.access_token as string;
}

/** Appoints a staff person with the given role, accepts their invitation, and signs them in. */
async function appoint(
  code: string, admin: string,
  input: { name: string; email: string; roleKey: string; scopeType: string; scopeRefId?: string },
) {
  const invited = await post('/v1/people', admin, {
    full_name: input.name, email: input.email, person_type: 'staff',
    role: { role_key: input.roleKey, scope_type: input.scopeType, scope_ref_id: input.scopeRefId ?? null },
  });
  assert.equal(invited.statusCode, 201, JSON.stringify(invited.json()));
  const password = 'staff-strong-99';
  await harness.app.inject({
    method: 'POST', url: '/v1/auth/accept-invite',
    payload: { institution_code: code, token: invited.json().data.invitation.token, password },
  });
  return login(code, input.email, password);
}

/** A college with a program and an academic year, ready for a fee structure. */
async function feeSetup(code = 'fee-college') {
  const platform = await seedPlatformAccount(`owner+${code}@nirvok.com`);
  const platformLogin = await signInPlatform(harness.app, platform.email, platform.password);
  const prov = await provisionCollege(harness.app, platformLogin.body.data.access_token, {
    code, name: 'Fee College', adminEmail: `admin@${code}.edu`,
  });
  await harness.app.inject({
    method: 'POST', url: '/v1/auth/accept-invite',
    payload: { institution_code: code, token: prov.body.data.invitation.token, password: 'admin-strong-99' },
  });
  const admin = await login(code, `admin@${code}.edu`, 'admin-strong-99');

  const campus = (await get('/v1/campuses', admin)).json().data[0].id;
  const department = (await post('/v1/departments', admin, {
    campus_id: campus, name: 'Computer Science', code: 'cse',
  })).json().data.id;
  const program = (await post('/v1/programs', admin, {
    department_id: department, name: 'B.Tech CSE', code: 'btech-cse', duration_years: 4, term_type: 'semester',
  })).json().data.id;
  const year = (await post('/v1/academic-years', admin, {
    name: '2026-27', starts_on: '2026-06-01', ends_on: '2027-05-31', make_current: true,
  })).json().data.id;

  return { code, admin, campus, department, program, year };
}

describe('FEE-1: fee heads', () => {
  it('an Accountant creates, lists and archives a fee head; a duplicate code is refused', async () => {
    const s = await feeSetup();
    const accountant = await appoint(s.code, s.admin, {
      name: 'Asha Rao', email: `asha@${s.code}.edu`, roleKey: 'accountant', scopeType: 'institution',
    });

    const created = await post('/v1/fees/heads', accountant, { name: 'Tuition fee', code: 'tuition' });
    assert.equal(created.statusCode, 201);
    const headId = created.json().data.id as string;

    const dup = await post('/v1/fees/heads', accountant, { name: 'Tuition again', code: 'TUITION' });
    assert.equal(dup.statusCode, 409, 'the code is normalised and unique per college');

    const listed = (await get('/v1/fees/heads', accountant)).json().data as Array<{ id: string; code: string }>;
    assert.deepEqual(listed.map((h) => h.code), ['TUITION']);

    assert.equal((await del(`/v1/fees/heads/${headId}`, accountant)).statusCode, 200);
    assert.deepEqual((await get('/v1/fees/heads', accountant)).json().data, []);
    assert.equal((await del(`/v1/fees/heads/${headId}`, accountant)).statusCode, 404, 'already archived');
  });

  it('a Cashier can read fees but not manage them; a teacher can do neither', async () => {
    const s = await feeSetup();
    const cashier = await appoint(s.code, s.admin, {
      name: 'Rohit Nair', email: `rohit@${s.code}.edu`, roleKey: 'cashier', scopeType: 'institution',
    });
    assert.equal((await get('/v1/fees/heads', cashier)).statusCode, 200);
    assert.equal((await post('/v1/fees/heads', cashier, { name: 'Lab fee', code: 'lab' })).statusCode, 403);

    const teacher = await appoint(s.code, s.admin, {
      name: 'Meera Iyer', email: `meera@${s.code}.edu`,
      roleKey: 'faculty', scopeType: 'department', scopeRefId: s.department,
    });
    assert.equal((await get('/v1/fees/heads', teacher)).statusCode, 403);
    assert.equal((await post('/v1/fees/heads', teacher, { name: 'Lab fee', code: 'lab' })).statusCode, 403);
  });
});

describe('FEE-1: fee structures', () => {
  async function head(admin: string, name: string, code: string) {
    return (await post('/v1/fees/heads', admin, { name, code })).json().data.id as string;
  }

  it('composes a draft, refuses an incomplete publish, then publishes once complete', async () => {
    const s = await feeSetup();
    const tuition = await head(s.admin, 'Tuition fee', 'tuition');

    const draft = await post('/v1/fees/structures', s.admin, {
      program_id: s.program, academic_year_id: s.year,
    });
    assert.equal(draft.statusCode, 201);
    const structureId = draft.json().data.id as string;

    const again = await post('/v1/fees/structures', s.admin, {
      program_id: s.program, academic_year_id: s.year,
    });
    assert.equal(again.statusCode, 409, 'one live structure per program per year');

    const emptyPublish = await post(`/v1/fees/structures/${structureId}/publish`, s.admin);
    assert.equal(emptyPublish.statusCode, 422);
    assert.match(emptyPublish.json().error.message, /at least one instalment/);

    const instalment = await post(`/v1/fees/structures/${structureId}/instalments`, s.admin, {
      seq: 1, due_date: '2026-07-01', late_fee_paise: 50000,
    });
    assert.equal(instalment.statusCode, 201);
    const instalmentId = instalment.json().data.id as string;

    const noLines = await post(`/v1/fees/structures/${structureId}/publish`, s.admin);
    assert.equal(noLines.statusCode, 422);
    assert.match(noLines.json().error.message, /Instalment 1 has no fee heads/);

    assert.equal((await post(`/v1/fees/instalments/${instalmentId}/lines`, s.admin, {
      fee_head_id: tuition, amount_paise: 5000000,
    })).statusCode, 201);

    const published = await post(`/v1/fees/structures/${structureId}/publish`, s.admin);
    assert.equal(published.statusCode, 200);

    const read = (await get(`/v1/fees/structures/${structureId}`, s.admin)).json().data;
    assert.equal(read.status, 'published');
    assert.equal(read.total_paise, 5000000);
    assert.equal(read.instalments[0].lines[0].amount_paise, 5000000);

    // Publication is the point of no return: nothing more may be added.
    const lateAdd = await post(`/v1/fees/structures/${structureId}/instalments`, s.admin, {
      seq: 2, due_date: '2026-09-01',
    });
    assert.equal(lateAdd.statusCode, 409);
    assert.match(lateAdd.json().error.message, /already published/);

    const lateLine = await post(`/v1/fees/instalments/${instalmentId}/lines`, s.admin, {
      fee_head_id: tuition, amount_paise: 100,
    });
    assert.equal(lateLine.statusCode, 409);

    const republish = await post(`/v1/fees/structures/${structureId}/publish`, s.admin);
    assert.equal(republish.statusCode, 409);
  });
});

describe('FEE-2: invoices', () => {
  /** A published structure with two instalments, and one admitted student. */
  async function publishedStructure(s: Awaited<ReturnType<typeof feeSetup>>) {
    const tuition = (await post('/v1/fees/heads', s.admin, { name: 'Tuition', code: 'tuition' })).json().data.id;
    const structureId = (await post('/v1/fees/structures', s.admin, {
      program_id: s.program, academic_year_id: s.year,
    })).json().data.id;
    for (const [seq, dueDate] of [[1, '2026-07-01'], [2, '2026-11-01']] as const) {
      const instalmentId = (await post(`/v1/fees/structures/${structureId}/instalments`, s.admin, {
        seq, due_date: dueDate,
      })).json().data.id;
      await post(`/v1/fees/instalments/${instalmentId}/lines`, s.admin, {
        fee_head_id: tuition, amount_paise: 2500000,
      });
    }
    await post(`/v1/fees/structures/${structureId}/publish`, s.admin);
    return structureId as string;
  }

  async function admit(s: Awaited<ReturnType<typeof feeSetup>>, name: string, number: string) {
    return (await post('/v1/students', s.admin, {
      full_name: name, email: `${number.toLowerCase()}@${s.code}.edu`,
      enrolment_number: number, program_id: s.program, admitted_on: '2026-06-01',
    })).json().data.id as string;
  }

  it('invoices every enrolled student once per instalment, and is safe to run again', async () => {
    const s = await feeSetup();
    const structureId = await publishedStructure(s);
    const nisha = await admit(s, 'Nisha Kumar', 'CSE2026-001');
    await admit(s, 'Rahul Verma', 'CSE2026-002');

    const generated = await post(`/v1/fees/structures/${structureId}/invoices`, s.admin);
    assert.equal(generated.statusCode, 200);
    assert.deepEqual(generated.json().data, { generated: 4, skipped: 0 }, '2 students x 2 instalments');

    const again = await post(`/v1/fees/structures/${structureId}/invoices`, s.admin);
    assert.deepEqual(again.json().data, { generated: 0, skipped: 4 }, 'already invoiced, nothing duplicated');

    const forNisha = (await get(`/v1/fees/students/${nisha}/invoices`, s.admin)).json().data;
    assert.equal(forNisha.length, 2);
    assert.equal(forNisha[0].amount_paise, 2500000);
    assert.equal(forNisha[0].status, 'due');
    assert.deepEqual(forNisha.map((i: { due_date: string }) => i.due_date), ['2026-07-01', '2026-11-01']);

    const forStructure = (await get(`/v1/fees/structures/${structureId}/invoices`, s.admin)).json().data;
    assert.equal(forStructure.length, 4);

    // A later admission into the same program is picked up next time.
    const later = await admit(s, 'Aditi Rao', 'CSE2026-003');
    const topUp = await post(`/v1/fees/structures/${structureId}/invoices`, s.admin);
    assert.deepEqual(topUp.json().data, { generated: 2, skipped: 4 });
    assert.equal((await get(`/v1/fees/students/${later}/invoices`, s.admin)).json().data.length, 2);
  });

  it('a Cashier cannot generate invoices; a teacher cannot even read them', async () => {
    const s = await feeSetup();
    const structureId = await publishedStructure(s);
    await admit(s, 'Nisha Kumar', 'CSE2026-001');

    const cashier = await appoint(s.code, s.admin, {
      name: 'Rohit Nair', email: `rohit@${s.code}.edu`, roleKey: 'cashier', scopeType: 'institution',
    });
    assert.equal((await post(`/v1/fees/structures/${structureId}/invoices`, cashier)).statusCode, 403);
    assert.equal((await get(`/v1/fees/structures/${structureId}/invoices`, cashier)).statusCode, 200, 'a Cashier still reads them');

    const teacher = await appoint(s.code, s.admin, {
      name: 'Meera Iyer', email: `meera@${s.code}.edu`,
      roleKey: 'faculty', scopeType: 'department', scopeRefId: s.department,
    });
    assert.equal((await get(`/v1/fees/structures/${structureId}/invoices`, teacher)).statusCode, 403);
  });

  it('refuses to invoice a draft structure', async () => {
    const s = await feeSetup();
    const draftId = (await post('/v1/fees/structures', s.admin, {
      program_id: s.program, academic_year_id: s.year,
    })).json().data.id;
    const refused = await post(`/v1/fees/structures/${draftId}/invoices`, s.admin);
    assert.equal(refused.statusCode, 422);
    assert.match(refused.json().error.message, /published fee structure/);
  });
});

describe('FEE-3: concessions', () => {
  async function invoicedStudent(s: Awaited<ReturnType<typeof feeSetup>>) {
    const tuition = (await post('/v1/fees/heads', s.admin, { name: 'Tuition', code: 'tuition' })).json().data.id;
    const structureId = (await post('/v1/fees/structures', s.admin, {
      program_id: s.program, academic_year_id: s.year,
    })).json().data.id;
    const instalmentId = (await post(`/v1/fees/structures/${structureId}/instalments`, s.admin, {
      seq: 1, due_date: '2026-07-01',
    })).json().data.id;
    await post(`/v1/fees/instalments/${instalmentId}/lines`, s.admin, { fee_head_id: tuition, amount_paise: 1000000 });
    await post(`/v1/fees/structures/${structureId}/publish`, s.admin);

    const studentId = (await post('/v1/students', s.admin, {
      full_name: 'Nisha Kumar', email: `nisha@${s.code}.edu`,
      enrolment_number: 'CSE2026-001', program_id: s.program, admitted_on: '2026-06-01',
    })).json().data.id;
    await post(`/v1/fees/structures/${structureId}/invoices`, s.admin);
    const invoiceId = (await get(`/v1/fees/students/${studentId}/invoices`, s.admin)).json().data[0].id as string;
    return { studentId, invoiceId };
  }

  it('an approved concession reduces the invoice; a rejected one does not', async () => {
    const s = await feeSetup();
    const accountant = await appoint(s.code, s.admin, {
      name: 'Asha Rao', email: `asha@${s.code}.edu`, roleKey: 'accountant', scopeType: 'institution',
    });
    const { studentId, invoiceId } = await invoicedStudent(s);

    const requested = await post('/v1/fees/concessions', accountant, {
      invoice_id: invoiceId, amount_paise: 200000, reason: 'Sibling discount',
    });
    assert.equal(requested.statusCode, 201);
    const requestId = requested.json().data.id as string;

    assert.equal((await post('/v1/fees/concessions', accountant, {
      invoice_id: invoiceId, amount_paise: 100000, reason: 'Another one',
    })).statusCode, 409, 'only one open request per invoice');

    // The Accountant cannot approve their own request: fee.approve is the
    // College Admin's alone (module doc §5).
    assert.equal((await post(`/v1/fees/requests/${requestId}/approve`, accountant)).statusCode, 403);

    const approved = await post(`/v1/fees/requests/${requestId}/approve`, s.admin, { reason: 'Confirmed with accounts' });
    assert.equal(approved.statusCode, 200);
    assert.equal(approved.json().data.status, 'approved');

    const invoice = (await get(`/v1/fees/students/${studentId}/invoices`, s.admin)).json().data[0];
    assert.equal(invoice.amount_paise, 800000, '10,00,000 - 2,00,000');

    assert.equal((await post(`/v1/fees/requests/${requestId}/approve`, s.admin)).statusCode, 409, 'already decided');
  });

  it('a rejected concession leaves the invoice untouched; a withdrawn one frees the invoice for a new request', async () => {
    const s = await feeSetup();
    const accountant = await appoint(s.code, s.admin, {
      name: 'Asha Rao', email: `asha@${s.code}.edu`, roleKey: 'accountant', scopeType: 'institution',
    });
    const { invoiceId } = await invoicedStudent(s);

    const rejectId = (await post('/v1/fees/concessions', accountant, {
      invoice_id: invoiceId, amount_paise: 200000, reason: 'Try one',
    })).json().data.id;
    assert.equal((await post(`/v1/fees/requests/${rejectId}/reject`, s.admin, { reason: 'Not eligible' })).statusCode, 200);
    assert.equal((await get(`/v1/fees/requests`, s.admin)).json().data[0].amount_paise, 200000);

    const withdrawId = (await post('/v1/fees/concessions', accountant, {
      invoice_id: invoiceId, amount_paise: 100000, reason: 'Try two',
    })).json().data.id;
    assert.equal((await post(`/v1/fees/requests/${withdrawId}/withdraw`, accountant)).statusCode, 200);

    // The invoice is free again: a third request is not blocked by the
    // withdrawn one, only a still-open one would be.
    assert.equal((await post('/v1/fees/concessions', accountant, {
      invoice_id: invoiceId, amount_paise: 50000, reason: 'Try three',
    })).statusCode, 201);
  });

  it('refuses a concession larger than what the invoice still asks for', async () => {
    const s = await feeSetup();
    const { invoiceId } = await invoicedStudent(s);
    const tooMuch = await post('/v1/fees/concessions', s.admin, {
      invoice_id: invoiceId, amount_paise: 99999999, reason: 'Too generous',
    });
    assert.equal(tooMuch.statusCode, 422);
  });
});

describe('FEE-4: payments', () => {
  /** Two instalments of 5,00,000 paise each, one student, none paid yet. */
  async function twoInstalments(s: Awaited<ReturnType<typeof feeSetup>>) {
    const tuition = (await post('/v1/fees/heads', s.admin, { name: 'Tuition', code: 'tuition' })).json().data.id;
    const structureId = (await post('/v1/fees/structures', s.admin, {
      program_id: s.program, academic_year_id: s.year,
    })).json().data.id;
    for (const [seq, dueDate] of [[1, '2026-07-01'], [2, '2026-11-01']] as const) {
      const instalmentId = (await post(`/v1/fees/structures/${structureId}/instalments`, s.admin, {
        seq, due_date: dueDate,
      })).json().data.id;
      await post(`/v1/fees/instalments/${instalmentId}/lines`, s.admin, { fee_head_id: tuition, amount_paise: 500000 });
    }
    await post(`/v1/fees/structures/${structureId}/publish`, s.admin);
    const studentId = (await post('/v1/students', s.admin, {
      full_name: 'Nisha Kumar', email: `nisha@${s.code}.edu`,
      enrolment_number: 'CSE2026-001', program_id: s.program, admitted_on: '2026-06-01',
    })).json().data.id;
    await post(`/v1/fees/structures/${structureId}/invoices`, s.admin);
    return studentId as string;
  }

  it('allocates to the oldest due instalment first, issues a receipt, and marks it paid once covered', async () => {
    const s = await feeSetup();
    const cashier = await appoint(s.code, s.admin, {
      name: 'Rohit Nair', email: `rohit@${s.code}.edu`, roleKey: 'cashier', scopeType: 'institution',
    });
    const studentId = await twoInstalments(s);

    const partial = await post('/v1/fees/payments', cashier, {
      student_id: studentId, method: 'cash', amount_paise: 300000,
    });
    assert.equal(partial.statusCode, 201);
    assert.equal(partial.json().data.receipt.receipt_number, 1);
    assert.deepEqual(partial.json().data.allocations, [{ invoice_id: (await get(`/v1/fees/students/${studentId}/invoices`, s.admin)).json().data[0].id, amount_paise: 300000 }]);

    const stillDue = (await get(`/v1/fees/students/${studentId}/invoices`, s.admin)).json().data;
    assert.equal(stillDue[0].status, 'due', 'partially paid, not yet fully covered');

    const rest = await post('/v1/fees/payments', cashier, {
      student_id: studentId, method: 'upi', amount_paise: 200000, reference: 'UTR123',
    });
    assert.equal(rest.json().data.receipt.receipt_number, 2, 'gapless, per college');

    const afterFirstPaid = (await get(`/v1/fees/students/${studentId}/invoices`, s.admin)).json().data;
    assert.equal(afterFirstPaid[0].status, 'paid');
    assert.equal(afterFirstPaid[1].status, 'due', 'the second instalment is untouched');

    const overpay = await post('/v1/fees/payments', cashier, {
      student_id: studentId, method: 'cash', amount_paise: 999999999,
    });
    assert.equal(overpay.statusCode, 422);

    const wholeSecond = await post('/v1/fees/payments', cashier, {
      student_id: studentId, method: 'bank_transfer', amount_paise: 500000, reference: 'NEFT1',
    });
    assert.equal(wholeSecond.json().data.receipt.receipt_number, 3);
    const allPaid = (await get(`/v1/fees/students/${studentId}/invoices`, s.admin)).json().data;
    assert.ok(allPaid.every((i: { status: string }) => i.status === 'paid'));

    assert.equal((await post('/v1/fees/payments', cashier, { student_id: studentId, method: 'cash', amount_paise: 1 })).statusCode, 422);
  });

  it('cancelling a payment reverses it and un-pays the invoice, without touching the receipt row', async () => {
    const s = await feeSetup();
    const cashier = await appoint(s.code, s.admin, {
      name: 'Rohit Nair', email: `rohit@${s.code}.edu`, roleKey: 'cashier', scopeType: 'institution',
    });
    const studentId = await twoInstalments(s);
    const paid = await post('/v1/fees/payments', cashier, { student_id: studentId, method: 'cash', amount_paise: 500000 });
    const paymentId = paid.json().data.payment.id as string;
    assert.equal((await get(`/v1/fees/students/${studentId}/invoices`, s.admin)).json().data[0].status, 'paid');

    const cancelled = await post(`/v1/fees/payments/${paymentId}/cancel`, cashier, { reason: 'Cheque bounced' });
    assert.equal(cancelled.statusCode, 200);
    const reversalId = cancelled.json().data.reversalId as string;

    assert.equal((await get(`/v1/fees/students/${studentId}/invoices`, s.admin)).json().data[0].status, 'due', 'reversed back to due');

    const payments = (await get(`/v1/fees/students/${studentId}/payments`, s.admin)).json().data;
    assert.equal(payments.length, 2, 'the original and its reversal, both kept');
    assert.ok(payments.some((p: { id: string; kind: string }) => p.id === paymentId && p.kind === 'payment'));
    assert.ok(payments.some((p: { id: string; kind: string }) => p.id === reversalId && p.kind === 'reversal'));

    assert.equal((await post(`/v1/fees/payments/${paymentId}/cancel`, cashier, { reason: 'Again' })).statusCode, 409, 'already cancelled');

    // A fresh payment for the same instalment gets the next receipt number,
    // never reusing one — the reversal did not consume a number either.
    const again = await post('/v1/fees/payments', cashier, { student_id: studentId, method: 'cash', amount_paise: 500000 });
    assert.equal(again.json().data.receipt.receipt_number, 2);
  });

  it('an Accountant cannot collect; a teacher cannot even read payments', async () => {
    const s = await feeSetup();
    const studentId = await twoInstalments(s);
    const accountant = await appoint(s.code, s.admin, {
      name: 'Asha Rao', email: `asha@${s.code}.edu`, roleKey: 'accountant', scopeType: 'institution',
    });
    assert.equal((await post('/v1/fees/payments', accountant, {
      student_id: studentId, method: 'cash', amount_paise: 100000,
    })).statusCode, 403);

    const teacher = await appoint(s.code, s.admin, {
      name: 'Meera Iyer', email: `meera@${s.code}.edu`,
      roleKey: 'faculty', scopeType: 'department', scopeRefId: s.department,
    });
    assert.equal((await get(`/v1/fees/students/${studentId}/payments`, teacher)).statusCode, 403);
  });
});

describe('FEE-5: fines, late fees and waivers', () => {
  async function admitted(s: Awaited<ReturnType<typeof feeSetup>>, name: string, number: string) {
    return (await post('/v1/students', s.admin, {
      full_name: name, email: `${number.toLowerCase()}@${s.code}.edu`,
      enrolment_number: number, program_id: s.program, admitted_on: '2026-06-01',
    })).json().data.id as string;
  }

  it('a fine is charged directly, no approval needed', async () => {
    const s = await feeSetup();
    const accountant = await appoint(s.code, s.admin, {
      name: 'Asha Rao', email: `asha@${s.code}.edu`, roleKey: 'accountant', scopeType: 'institution',
    });
    const studentId = await admitted(s, 'Nisha Kumar', 'CSE2026-001');

    const raised = await post(`/v1/fees/students/${studentId}/fines`, accountant, {
      amount_paise: 50000, reason: 'Library book not returned',
    });
    assert.equal(raised.statusCode, 201);

    const invoices = (await get(`/v1/fees/students/${studentId}/invoices`, s.admin)).json().data;
    assert.equal(invoices.length, 1);
    assert.equal(invoices[0].kind, 'fine');
    assert.equal(invoices[0].status, 'due');
    assert.equal(invoices[0].reason, 'Library book not returned');

    const teacher = await appoint(s.code, s.admin, {
      name: 'Meera Iyer', email: `meera@${s.code}.edu`,
      roleKey: 'faculty', scopeType: 'department', scopeRefId: s.department,
    });
    assert.equal((await post(`/v1/fees/students/${studentId}/fines`, teacher, {
      amount_paise: 1000, reason: 'x',
    })).statusCode, 403);
  });

  async function overdueInstalment(s: Awaited<ReturnType<typeof feeSetup>>, dueDate: string) {
    const tuition = (await post('/v1/fees/heads', s.admin, { name: 'Tuition', code: 'tuition' })).json().data.id;
    const structureId = (await post('/v1/fees/structures', s.admin, {
      program_id: s.program, academic_year_id: s.year,
    })).json().data.id;
    const instalmentId = (await post(`/v1/fees/structures/${structureId}/instalments`, s.admin, {
      seq: 1, due_date: dueDate, late_fee_paise: 25000,
    })).json().data.id;
    await post(`/v1/fees/instalments/${instalmentId}/lines`, s.admin, { fee_head_id: tuition, amount_paise: 500000 });
    await post(`/v1/fees/structures/${structureId}/publish`, s.admin);
    return instalmentId as string;
  }

  it('charges a flat late fee once per student on an overdue instalment, and is safe to run again', async () => {
    const s = await feeSetup();
    const instalmentId = await overdueInstalment(s, '2000-01-01');
    const structureId = (await get('/v1/fees/structures', s.admin)).json().data[0].id;
    const nisha = await admitted(s, 'Nisha Kumar', 'CSE2026-001');
    await admitted(s, 'Rahul Verma', 'CSE2026-002');
    await post(`/v1/fees/structures/${structureId}/invoices`, s.admin);

    const applied = await post(`/v1/fees/instalments/${instalmentId}/late-fees`, s.admin);
    assert.equal(applied.statusCode, 200);
    assert.deepEqual(applied.json().data, { applied: 2, skipped: 0 });

    const again = await post(`/v1/fees/instalments/${instalmentId}/late-fees`, s.admin);
    assert.deepEqual(again.json().data, { applied: 0, skipped: 2 }, 'already charged, never twice');

    const invoices = (await get(`/v1/fees/students/${nisha}/invoices`, s.admin)).json().data;
    const lateFee = invoices.find((i: { kind: string }) => i.kind === 'late_fee');
    assert.ok(lateFee, 'a late_fee invoice was created');
    assert.equal(lateFee.amount_paise, 25000);
  });

  it('refuses to apply a late fee before the due date, or where none is configured', async () => {
    const s = await feeSetup();
    const notYetDue = await overdueInstalment(s, '2099-01-01');
    await admitted(s, 'Nisha Kumar', 'CSE2026-001');
    const tooSoon = await post(`/v1/fees/instalments/${notYetDue}/late-fees`, s.admin);
    assert.equal(tooSoon.statusCode, 422);
    assert.match(tooSoon.json().error.message, /not overdue/);

    const tuition = (await post('/v1/fees/heads', s.admin, { name: 'Lab', code: 'lab' })).json().data.id;
    const otherProgram = (await post('/v1/programs', s.admin, {
      department_id: s.department, name: 'B.Sc Physics', code: 'bsc-phy', duration_years: 3, term_type: 'semester',
    })).json().data.id;
    const noLateFeeStructure = (await post('/v1/fees/structures', s.admin, {
      program_id: otherProgram, academic_year_id: s.year,
    })).json().data.id;
    const noLateFeeInstalment = (await post(`/v1/fees/structures/${noLateFeeStructure}/instalments`, s.admin, {
      seq: 1, due_date: '2000-01-01',
    })).json().data.id;
    await post(`/v1/fees/instalments/${noLateFeeInstalment}/lines`, s.admin, { fee_head_id: tuition, amount_paise: 100000 });
    await post(`/v1/fees/structures/${noLateFeeStructure}/publish`, s.admin);

    const noneConfigured = await post(`/v1/fees/instalments/${noLateFeeInstalment}/late-fees`, s.admin);
    assert.equal(noneConfigured.statusCode, 422);
    assert.match(noneConfigured.json().error.message, /carries no late fee/);
  });

  it('waives a fine through the College Admin\'s approval; rejects an instalment invoice', async () => {
    const s = await feeSetup();
    const accountant = await appoint(s.code, s.admin, {
      name: 'Asha Rao', email: `asha@${s.code}.edu`, roleKey: 'accountant', scopeType: 'institution',
    });
    const studentId = await admitted(s, 'Nisha Kumar', 'CSE2026-001');
    await post(`/v1/fees/students/${studentId}/fines`, accountant, { amount_paise: 50000, reason: 'Late ID card' });
    const fineId = (await get(`/v1/fees/students/${studentId}/invoices`, s.admin)).json().data[0].id as string;

    const requested = await post('/v1/fees/waivers', accountant, { invoice_id: fineId, reason: 'x' });
    assert.equal(requested.statusCode, 201, 'a fine is a valid waiver target');
    const requestId = requested.json().data.id as string;

    assert.equal((await post(`/v1/fees/requests/${requestId}/approve`, accountant)).statusCode, 403, 'the Accountant cannot approve their own request');

    const approved = await post(`/v1/fees/requests/${requestId}/approve`, s.admin);
    assert.equal(approved.statusCode, 200);

    const invoice = (await get(`/v1/fees/students/${studentId}/invoices`, s.admin)).json().data[0];
    assert.equal(invoice.amount_paise, 0);
    assert.equal(invoice.status, 'paid', 'a full waiver leaves nothing owed');
  });

  it('refuses a waiver on an ordinary instalment invoice', async () => {
    const s = await feeSetup();
    const { invoiceId } = await (async () => {
      const tuition = (await post('/v1/fees/heads', s.admin, { name: 'Tuition', code: 'tuition' })).json().data.id;
      const structureId = (await post('/v1/fees/structures', s.admin, {
        program_id: s.program, academic_year_id: s.year,
      })).json().data.id;
      const instalmentId = (await post(`/v1/fees/structures/${structureId}/instalments`, s.admin, {
        seq: 1, due_date: '2026-07-01',
      })).json().data.id;
      await post(`/v1/fees/instalments/${instalmentId}/lines`, s.admin, { fee_head_id: tuition, amount_paise: 500000 });
      await post(`/v1/fees/structures/${structureId}/publish`, s.admin);
      const studentId = await admitted(s, 'Nisha Kumar', 'CSE2026-001');
      await post(`/v1/fees/structures/${structureId}/invoices`, s.admin);
      const invoiceId = (await get(`/v1/fees/students/${studentId}/invoices`, s.admin)).json().data[0].id;
      return { invoiceId };
    })();

    const refused = await post('/v1/fees/waivers', s.admin, { invoice_id: invoiceId, reason: 'x' });
    assert.equal(refused.statusCode, 422);
    assert.match(refused.json().error.message, /concession instead/);
  });
});

describe('a Cashier or Accountant finds a student without student.read', () => {
  it('searches by name or enrolment number, and needs at least two characters', async () => {
    const s = await feeSetup();
    const cashier = await appoint(s.code, s.admin, {
      name: 'Rohit Nair', email: `rohit@${s.code}.edu`, roleKey: 'cashier', scopeType: 'institution',
    });
    await post('/v1/students', s.admin, {
      full_name: 'Nisha Kumar', email: `nisha@${s.code}.edu`,
      enrolment_number: 'CSE2026-001', program_id: s.program, admitted_on: '2026-06-01',
    });

    const byName = (await get('/v1/fees/students?q=Nisha', cashier)).json().data;
    assert.equal(byName.length, 1);
    assert.equal(byName[0].enrolment_number, 'CSE2026-001');

    const byNumber = (await get('/v1/fees/students?q=CSE2026', cashier)).json().data;
    assert.equal(byNumber.length, 1);

    const tooShort = (await get('/v1/fees/students?q=N', cashier)).json().data;
    assert.deepEqual(tooShort, []);

    const teacher = await appoint(s.code, s.admin, {
      name: 'Meera Iyer', email: `meera@${s.code}.edu`,
      roleKey: 'faculty', scopeType: 'department', scopeRefId: s.department,
    });
    assert.equal((await get('/v1/fees/students?q=Nisha', teacher)).statusCode, 403);
  });
});

describe('FEE-6: a student reads their own fees', () => {
  it('sees their own invoices and payments, self-scoped like /me/attendance', async () => {
    const s = await feeSetup();
    const tuition = (await post('/v1/fees/heads', s.admin, { name: 'Tuition', code: 'tuition' })).json().data.id;
    const structureId = (await post('/v1/fees/structures', s.admin, {
      program_id: s.program, academic_year_id: s.year,
    })).json().data.id;
    const instalmentId = (await post(`/v1/fees/structures/${structureId}/instalments`, s.admin, {
      seq: 1, due_date: '2026-07-01',
    })).json().data.id;
    await post(`/v1/fees/instalments/${instalmentId}/lines`, s.admin, { fee_head_id: tuition, amount_paise: 500000 });
    await post(`/v1/fees/structures/${structureId}/publish`, s.admin);

    const studentId = (await post('/v1/students', s.admin, {
      full_name: 'Nisha Kumar', email: `nisha@${s.code}.edu`,
      enrolment_number: 'CSE2026-001', program_id: s.program, admitted_on: '2026-06-01',
    })).json().data.id;
    await post(`/v1/fees/structures/${structureId}/invoices`, s.admin);
    await post(`/v1/fees/payments`, s.admin, { student_id: studentId, method: 'cash', amount_paise: 500000 });

    const issued = await post(`/v1/students/${studentId}/access`, s.admin);
    const { code } = issued.json().data as { code: string };
    await post('/v1/auth/student-activate', s.admin, {
      institution_code: s.code, enrolment_number: 'CSE2026-001', code, password: 'nisha-strong-99',
    });
    const login = await post('/v1/auth/login', s.admin, {
      institution_code: s.code, identifier: 'CSE2026-001', password: 'nisha-strong-99',
    });
    const studentToken = login.json().data.access_token as string;

    const mine = await get('/v1/me/fees', studentToken);
    assert.equal(mine.statusCode, 200);
    assert.equal(mine.json().data.invoices.length, 1);
    assert.equal(mine.json().data.invoices[0].status, 'paid');
    assert.equal(mine.json().data.payments.length, 1);
    assert.equal(mine.json().data.payments[0].amount_paise, 500000);

    // Not another student's, and not a staff member's at all.
    assert.equal((await get('/v1/me/fees', s.admin)).statusCode, 403);
  });
});

describe('FEE-7: online payment (dummy gateway)', () => {
  /** Gets a signed-in student with one due instalment, ready to pay online. */
  async function studentWithDues(amountPaise = 500000) {
    const s = await feeSetup('fee-online');
    const tuition = (await post('/v1/fees/heads', s.admin, { name: 'Tuition', code: 'tuition' })).json().data.id;
    const structureId = (await post('/v1/fees/structures', s.admin, {
      program_id: s.program, academic_year_id: s.year,
    })).json().data.id;
    const instalmentId = (await post(`/v1/fees/structures/${structureId}/instalments`, s.admin, {
      seq: 1, due_date: '2026-07-01',
    })).json().data.id;
    await post(`/v1/fees/instalments/${instalmentId}/lines`, s.admin, { fee_head_id: tuition, amount_paise: amountPaise });
    await post(`/v1/fees/structures/${structureId}/publish`, s.admin);

    const studentId = (await post('/v1/students', s.admin, {
      full_name: 'Rehan Ali', email: `rehan@${s.code}.edu`,
      enrolment_number: 'CSE2026-002', program_id: s.program, admitted_on: '2026-06-01',
    })).json().data.id;
    await post(`/v1/fees/structures/${structureId}/invoices`, s.admin);

    const issued = await post(`/v1/students/${studentId}/access`, s.admin);
    const { code: activationCode } = issued.json().data as { code: string };
    await post('/v1/auth/student-activate', s.admin, {
      institution_code: s.code, enrolment_number: 'CSE2026-002', code: activationCode, password: 'rehan-strong-99',
    });
    const login = await post('/v1/auth/login', s.admin, {
      institution_code: s.code, identifier: 'CSE2026-002', password: 'rehan-strong-99',
    });
    const studentToken = login.json().data.access_token as string;
    return { ...s, studentId, studentToken };
  }

  it('a student starts an online payment, completes it through the dummy checkout, and their fees reflect it', async () => {
    const s = await studentWithDues();

    const started = await post('/v1/me/fees/online', s.studentToken, { amount_paise: 500000 });
    assert.equal(started.statusCode, 201, JSON.stringify(started.json()));
    const { intent_id: intentId, checkout_url: checkoutUrl } = started.json().data as { intent_id: string; checkout_url: string };
    assert.ok(checkoutUrl.includes(`/v1/fees/online/${intentId}/checkout`));
    assert.ok(checkoutUrl.includes(`college=${s.code}`));

    // The checkout page itself needs no session — the link is its own capability.
    const path = new URL(checkoutUrl).pathname + new URL(checkoutUrl).search;
    const checkoutPage = await harness.app.inject({ method: 'GET', url: path });
    assert.equal(checkoutPage.statusCode, 200);
    assert.match(checkoutPage.body, /₹5000\.00/);

    const before = await get(`/v1/me/fees/online/${intentId}`, s.studentToken);
    assert.equal(before.json().data.status, 'created');

    // The dummy provider's own "I paid" call, in place of a signed webhook.
    const completed = await harness.app.inject({ method: 'POST', url: `/v1/fees/online/${intentId}/complete?college=${s.code}` });
    assert.equal(completed.statusCode, 200);

    const mine = await get('/v1/me/fees', s.studentToken);
    assert.equal(mine.json().data.invoices[0].status, 'paid');
    assert.equal(mine.json().data.payments.length, 1);
    assert.equal(mine.json().data.payments[0].method, 'online');
    assert.equal(mine.json().data.payments[0].amount_paise, 500000);
    assert.equal(mine.json().data.payments[0].received_by, null, 'nobody at the college received an online payment personally');

    const after = await get(`/v1/me/fees/online/${intentId}`, s.studentToken);
    assert.equal(after.json().data.status, 'paid');
  });

  it('a simulated failed payment settles nothing, and the intent cannot be completed afterwards', async () => {
    const s = await studentWithDues();
    const started = await post('/v1/me/fees/online', s.studentToken, { amount_paise: 500000 });
    const { intent_id: intentId } = started.json().data as { intent_id: string };

    const failed = await harness.app.inject({ method: 'POST', url: `/v1/fees/online/${intentId}/fail?college=${s.code}` });
    assert.equal(failed.statusCode, 200);

    const mine = await get('/v1/me/fees', s.studentToken);
    assert.equal(mine.json().data.payments.length, 0, 'a failed payment settles nothing');

    // A failed (or already-completed) intent refuses to complete afterwards.
    const lateComplete = await harness.app.inject({ method: 'POST', url: `/v1/fees/online/${intentId}/complete?college=${s.code}` });
    assert.equal(lateComplete.statusCode, 200, 'the dummy page always renders, even on refusal');
    const mineAfter = await get('/v1/me/fees', s.studentToken);
    assert.equal(mineAfter.json().data.payments.length, 0);
  });

  it('the same intent cannot be completed twice', async () => {
    const s = await studentWithDues();
    const started = await post('/v1/me/fees/online', s.studentToken, { amount_paise: 500000 });
    const { intent_id: intentId } = started.json().data as { intent_id: string };

    await harness.app.inject({ method: 'POST', url: `/v1/fees/online/${intentId}/complete?college=${s.code}` });
    await harness.app.inject({ method: 'POST', url: `/v1/fees/online/${intentId}/complete?college=${s.code}` });

    const mine = await get('/v1/me/fees', s.studentToken);
    assert.equal(mine.json().data.payments.length, 1, 'a repeated "webhook" call never pays twice');
  });

  it('refuses to start online payment for more than is due, or when nothing is due', async () => {
    const s = await studentWithDues(500000);
    const tooMuch = await post('/v1/me/fees/online', s.studentToken, { amount_paise: 600000 });
    assert.equal(tooMuch.statusCode, 422);

    // Pay it off entirely by counter, then try again online.
    await post('/v1/fees/payments', s.admin, { student_id: s.studentId, method: 'cash', amount_paise: 500000 });
    const nothingDue = await post('/v1/me/fees/online', s.studentToken, { amount_paise: 100 });
    assert.equal(nothingDue.statusCode, 422);
  });

  it('a checkout link from another college is never found', async () => {
    const s = await studentWithDues();
    const other = await feeSetup('fee-online-2');
    const started = await post('/v1/me/fees/online', s.studentToken, { amount_paise: 500000 });
    const { intent_id: intentId } = started.json().data as { intent_id: string };

    const wrongCollege = await harness.app.inject({
      method: 'GET', url: `/v1/fees/online/${intentId}/checkout?college=${other.code}`,
    });
    assert.equal(wrongCollege.statusCode, 200);
    assert.match(wrongCollege.body, /expired/i);
  });
});
