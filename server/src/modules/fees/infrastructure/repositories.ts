import type { Tx } from '../../../shared/application/unit-of-work.ts';
import { clientOf } from '../../../infrastructure/db/unit-of-work.ts';
import type {
  FeeHeadRecord, FeeHeadRepository, FeeInstalmentRecord, FeeLineRecord,
  FeeStructureRecord, FeeStructureRepository, InvoiceRecord, InvoiceRepository,
} from '../application/ports.ts';

function toHead(r: any): FeeHeadRecord {
  return { id: r.id, name: r.name, code: r.code, status: r.status };
}

export class PgFeeHeadRepository implements FeeHeadRepository {
  async create(tx: Tx, input: { id: string; tenantId: string; name: string; code: string }): Promise<void> {
    await clientOf(tx).query(
      `INSERT INTO fee_heads (id, tenant_id, name, code) VALUES ($1,$2,$3,$4)`,
      [input.id, input.tenantId, input.name, input.code],
    );
  }

  async findById(tx: Tx, id: string): Promise<FeeHeadRecord | null> {
    const { rows } = await clientOf(tx).query(`SELECT id, name, code, status FROM fee_heads WHERE id=$1`, [id]);
    return rows[0] ? toHead(rows[0]) : null;
  }

  async findByCode(tx: Tx, code: string): Promise<FeeHeadRecord | null> {
    const { rows } = await clientOf(tx).query(`SELECT id, name, code, status FROM fee_heads WHERE code=$1`, [code]);
    return rows[0] ? toHead(rows[0]) : null;
  }

  async list(tx: Tx, includeArchived: boolean): Promise<FeeHeadRecord[]> {
    const { rows } = await clientOf(tx).query(
      `SELECT id, name, code, status FROM fee_heads WHERE ($1::boolean OR status='active') ORDER BY name`,
      [includeArchived],
    );
    return rows.map(toHead);
  }

  async archive(tx: Tx, id: string): Promise<boolean> {
    const { rowCount } = await clientOf(tx).query(
      `UPDATE fee_heads SET status='archived', updated_at=now(), version=version+1 WHERE id=$1 AND status='active'`,
      [id],
    );
    return (rowCount ?? 0) > 0;
  }
}

const STRUCTURE_SELECT = `
  SELECT s.id, s.program_id, p.name AS program_name, s.academic_year_id, y.name AS academic_year_name,
         s.status, s.published_at
    FROM fee_structures s
    JOIN programs p ON p.id = s.program_id
    JOIN academic_years y ON y.id = s.academic_year_id`;

function toStructure(r: any): FeeStructureRecord {
  return {
    id: r.id, programId: r.program_id, programName: r.program_name,
    academicYearId: r.academic_year_id, academicYearName: r.academic_year_name,
    status: r.status, publishedAt: r.published_at,
  };
}

function toInstalment(r: any): FeeInstalmentRecord {
  return {
    id: r.id, structureId: r.structure_id, seq: r.seq, dueDate: `${r.due_date}`,
    lateFeePaise: r.late_fee_paise === null ? null : Number(r.late_fee_paise),
  };
}

function toLine(r: any): FeeLineRecord {
  return {
    id: r.id, instalmentId: r.instalment_id, feeHeadId: r.fee_head_id,
    feeHeadName: r.fee_head_name, amountPaise: Number(r.amount_paise),
  };
}

export class PgFeeStructureRepository implements FeeStructureRepository {
  async create(tx: Tx, input: {
    id: string; tenantId: string; programId: string; academicYearId: string;
  }): Promise<void> {
    await clientOf(tx).query(
      `INSERT INTO fee_structures (id, tenant_id, program_id, academic_year_id) VALUES ($1,$2,$3,$4)`,
      [input.id, input.tenantId, input.programId, input.academicYearId],
    );
  }

  async findById(tx: Tx, id: string): Promise<FeeStructureRecord | null> {
    const { rows } = await clientOf(tx).query(`${STRUCTURE_SELECT} WHERE s.id=$1`, [id]);
    return rows[0] ? toStructure(rows[0]) : null;
  }

  async findLive(tx: Tx, programId: string, academicYearId: string): Promise<FeeStructureRecord | null> {
    const { rows } = await clientOf(tx).query(
      `${STRUCTURE_SELECT} WHERE s.program_id=$1 AND s.academic_year_id=$2 AND s.status IN ('draft','published')`,
      [programId, academicYearId],
    );
    return rows[0] ? toStructure(rows[0]) : null;
  }

  async list(tx: Tx, programId: string | null): Promise<FeeStructureRecord[]> {
    const { rows } = await clientOf(tx).query(
      `${STRUCTURE_SELECT} WHERE ($1::uuid IS NULL OR s.program_id=$1) AND s.status <> 'discarded'
        ORDER BY y.starts_on DESC, p.name`,
      [programId],
    );
    return rows.map(toStructure);
  }

  async publish(tx: Tx, id: string, by: string, at: Date): Promise<boolean> {
    const { rowCount } = await clientOf(tx).query(
      `UPDATE fee_structures SET status='published', published_at=$2, published_by=$3,
              updated_at=now(), version=version+1
        WHERE id=$1 AND status='draft'`,
      [id, at, by],
    );
    return (rowCount ?? 0) > 0;
  }

  async discard(tx: Tx, id: string, at: Date): Promise<boolean> {
    const { rowCount } = await clientOf(tx).query(
      `UPDATE fee_structures SET status='discarded', discarded_at=$2, updated_at=now(), version=version+1
        WHERE id=$1 AND status IN ('draft','published')`,
      [id, at],
    );
    return (rowCount ?? 0) > 0;
  }

  async listInstalments(tx: Tx, structureId: string): Promise<FeeInstalmentRecord[]> {
    const { rows } = await clientOf(tx).query(
      `SELECT id, structure_id, seq, due_date, late_fee_paise FROM fee_structure_instalments
        WHERE structure_id=$1 ORDER BY seq`,
      [structureId],
    );
    return rows.map(toInstalment);
  }

  async findInstalment(tx: Tx, id: string): Promise<FeeInstalmentRecord | null> {
    const { rows } = await clientOf(tx).query(
      `SELECT id, structure_id, seq, due_date, late_fee_paise FROM fee_structure_instalments WHERE id=$1`,
      [id],
    );
    return rows[0] ? toInstalment(rows[0]) : null;
  }

  async addInstalment(tx: Tx, input: {
    id: string; tenantId: string; structureId: string; seq: number;
    dueDate: string; lateFeePaise: number | null;
  }): Promise<void> {
    await clientOf(tx).query(
      `INSERT INTO fee_structure_instalments (id, tenant_id, structure_id, seq, due_date, late_fee_paise)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [input.id, input.tenantId, input.structureId, input.seq, input.dueDate, input.lateFeePaise],
    );
  }

  async listLines(tx: Tx, instalmentId: string): Promise<FeeLineRecord[]> {
    const { rows } = await clientOf(tx).query(
      `SELECT l.id, l.instalment_id, l.fee_head_id, h.name AS fee_head_name, l.amount_paise
         FROM fee_structure_lines l JOIN fee_heads h ON h.id = l.fee_head_id
        WHERE l.instalment_id=$1 ORDER BY h.name`,
      [instalmentId],
    );
    return rows.map(toLine);
  }

  async addLine(tx: Tx, input: {
    id: string; tenantId: string; instalmentId: string; feeHeadId: string; amountPaise: number;
  }): Promise<void> {
    await clientOf(tx).query(
      `INSERT INTO fee_structure_lines (id, tenant_id, instalment_id, fee_head_id, amount_paise)
       VALUES ($1,$2,$3,$4,$5)`,
      [input.id, input.tenantId, input.instalmentId, input.feeHeadId, input.amountPaise],
    );
  }
}

const INVOICE_SELECT = `
  SELECT i.id, i.student_id, per.full_name AS student_name, s.enrolment_number,
         i.fee_structure_id, i.instalment_id, fsi.seq AS instalment_seq,
         i.amount_paise, i.due_date, i.status
    FROM invoices i
    JOIN students s ON s.id = i.student_id
    JOIN persons per ON per.id = s.person_id
    JOIN fee_structure_instalments fsi ON fsi.id = i.instalment_id`;

function toInvoice(r: any): InvoiceRecord {
  return {
    id: r.id, studentId: r.student_id, studentName: r.student_name, enrolmentNumber: r.enrolment_number,
    feeStructureId: r.fee_structure_id, instalmentId: r.instalment_id, instalmentSeq: r.instalment_seq,
    amountPaise: Number(r.amount_paise), dueDate: `${r.due_date}`, status: r.status,
  };
}

export class PgInvoiceRepository implements InvoiceRepository {
  async enrolledStudentIds(tx: Tx, programId: string): Promise<string[]> {
    const { rows } = await clientOf(tx).query(
      `SELECT id FROM students WHERE program_id=$1 AND status='enrolled'`,
      [programId],
    );
    return rows.map((r: any) => r.id);
  }

  async existsFor(tx: Tx, studentId: string, instalmentId: string): Promise<boolean> {
    const { rows } = await clientOf(tx).query(
      `SELECT 1 FROM invoices WHERE student_id=$1 AND instalment_id=$2`,
      [studentId, instalmentId],
    );
    return rows.length > 0;
  }

  async create(tx: Tx, input: {
    id: string; tenantId: string; studentId: string; feeStructureId: string;
    instalmentId: string; amountPaise: number; dueDate: string;
  }): Promise<void> {
    await clientOf(tx).query(
      `INSERT INTO invoices (id, tenant_id, student_id, fee_structure_id, instalment_id, amount_paise, due_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [input.id, input.tenantId, input.studentId, input.feeStructureId,
       input.instalmentId, input.amountPaise, input.dueDate],
    );
  }

  async listByStudent(tx: Tx, studentId: string): Promise<InvoiceRecord[]> {
    const { rows } = await clientOf(tx).query(
      `${INVOICE_SELECT} WHERE i.student_id=$1 ORDER BY i.due_date`,
      [studentId],
    );
    return rows.map(toInvoice);
  }

  async listByStructure(tx: Tx, structureId: string): Promise<InvoiceRecord[]> {
    const { rows } = await clientOf(tx).query(
      `${INVOICE_SELECT} WHERE i.fee_structure_id=$1 ORDER BY per.full_name, i.due_date`,
      [structureId],
    );
    return rows.map(toInvoice);
  }
}
