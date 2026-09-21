import { it, describe } from 'node:test';
import assert from 'node:assert/strict';

function parseMultipart(body: Buffer, contentType: string | undefined) {
  const match = /boundary=([^;]+)/i.exec(contentType ?? '');
  if (!match) return [];
  const boundary = Buffer.from('--' + match[1]!.trim());
  const parts: any[] = [];

  let index = body.indexOf(boundary);
  while (index !== -1) {
    const start = index + boundary.length;
    const next = body.indexOf(boundary, start);
    if (next === -1) break;

    // Peek at the bytes right after the next boundary: if "--" follows, it's the
    // closing delimiter. The segment between index and next is the LAST real part.
    const isClosing = body.subarray(next + boundary.length, next + boundary.length + 2).toString() === '--';

    const segment = body.subarray(start, next);
    // Header block ends at the first blank line (\r\n\r\n) after `\r\n`.
    const headerEnd = segment.indexOf(Buffer.from('\r\n\r\n'));
    if (headerEnd !== -1) {
      const headers = segment.subarray(0, headerEnd).toString('latin1');
      const value = segment.subarray(headerEnd + 4, segment.length - 2); // strip trailing \r\n

      const nameMatch = /name="([^"]*)"/.exec(headers);
      const filenameMatch = /filename="([^"]*)"/.exec(headers);
      const ctMatch = /content-type:\s*([^\r\n]+)/i.exec(headers);
      parts.push({
        name: nameMatch?.[1] ?? '',
        filename: filenameMatch?.[1],
        contentType: ctMatch?.[1]?.trim(),
        value,
      });
    }
    if (isClosing) break;
    index = next;
  }
  return parts;
}

function multipart(
  fields: Record<string, string>,
  file: { filename: string; contentType: string; bytes: Buffer },
) {
  const boundary = '----syllabusTestBoundary';
  const chunks: Buffer[] = [];
  const push = (s: string) => chunks.push(Buffer.from(s));
  for (const [k, v] of Object.entries(fields)) {
    push(`--${boundary}\r\n`);
    push(`Content-Disposition: form-data; name="${k}"\r\n\r\n`);
    push(`${v}\r\n`);
  }
  push(`--${boundary}\r\n`);
  push(`Content-Disposition: form-data; name="pdf"; filename="${file.filename}"\r\n`);
  push(`Content-Type: ${file.contentType}\r\n\r\n`);
  chunks.push(file.bytes);
  push('\r\n');
  push(`--${boundary}--\r\n`);
  return {
    boundary,
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
    body: Buffer.concat(chunks),
  };
}

const PDF = Buffer.from('%PDF-1.4% syllabus test bytes ÿ');

describe('parseMultipart', () => {
  it('parses the test body', () => {
    const req = multipart({ course_id: 'course-uuid', academic_year_id: 'year-uuid' }, { filename: 'syllabus.pdf', contentType: 'application/pdf', bytes: PDF });
    console.log('BOUNDARY', req.boundary);
    console.log('CONTENT-TYPE', req.headers['content-type']);
    console.log('BODY len', req.body.length);
    console.log('BODY preview', req.body.subarray(0, 200).toString());
    console.log('---');
    console.log('FULL BODY:', req.body.toString());
    const parts = parseMultipart(req.body, req.headers['content-type']);
    console.log('PARTS', JSON.stringify(parts.map(p => ({ name: p.name, filename: p.filename, contentType: p.contentType, valueLen: p.value.length }))));
    assert.equal(parts.length, 3);
    assert.ok(parts.some(p => p.name === 'course_id' && !p.filename && p.value.toString() === 'course-uuid'));
    assert.ok(parts.some(p => p.name === 'academic_year_id' && !p.filename && p.value.toString() === 'year-uuid'));
    assert.ok(parts.some(p => p.name === 'pdf' && p.filename === 'syllabus.pdf' && p.value.length === PDF.length));
  });
});