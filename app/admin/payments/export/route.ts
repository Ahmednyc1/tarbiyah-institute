import { adminViewer } from "@/lib/guard";
import { METHOD_LABEL, getPayments, readRange } from "@/lib/finance";

/**
 * The payments report as a CSV, for Excel and for the books.
 *
 * The /admin layout does NOT protect this. A Route Handler is not wrapped by
 * layouts — they only run when a page renders — so the guard has to be here,
 * exactly as it does inside a Server Action. Without it this would be an
 * unauthenticated export of everyone's payment history at a guessable URL.
 */

/**
 * RFC 4180: quote everything, and double any quote inside.
 *
 * Also defuses spreadsheet formulas. A cell beginning =, +, - or @ is executed
 * by Excel and Sheets when the file is opened, and names here come from Google
 * profiles, which the person owning the account chooses. Quoting alone does not
 * stop it; a leading apostrophe does, and spreadsheets hide the apostrophe.
 */
function csvCell(value: string | number | null): string {
  if (value === null || value === undefined) return '""';

  const text = String(value);
  const risky = /^[=+\-@\t\r]/.test(text);

  return `"${(risky ? `'${text}` : text).replace(/"/g, '""')}"`;
}

export async function GET(request: Request) {
  if (!(await adminViewer())) {
    return new Response("Not found", { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const { from, to } = readRange({
    from: searchParams.get("from") ?? undefined,
    to: searchParams.get("to") ?? undefined,
  });

  const payments = await getPayments(from, to);

  const header = [
    "Date",
    "Student",
    "Student number",
    "Course code",
    "Course",
    "Term",
    "Method",
    "Reference",
    "Taken by",
    "Note",
    "Amount",
  ];

  const lines = [
    header.map(csvCell).join(","),
    ...payments.map((p) =>
      [
        csvCell(p.local_date),
        csvCell(p.student_name),
        csvCell(p.student_number),
        csvCell(p.course_code),
        csvCell(p.course_title),
        csvCell(p.term),
        csvCell(METHOD_LABEL[p.method]),
        csvCell(p.reference),
        csvCell(p.recorded_by),
        csvCell(p.note),
        // Deliberately not through csvCell. This column gets summed, so it must
        // arrive as a number: no currency symbol, no thousands separator, no
        // quotes, and no formula-guard apostrophe — a refund starts with "-",
        // and an apostrophe would turn every refund into text that will not add
        // up. Safe unquoted because toFixed can only produce digits, a dot and
        // a minus sign.
        Number(p.amount).toFixed(2),
      ].join(","),
    ),
  ];

  // Excel assumes the system codepage unless a UTF-8 byte order mark says
  // otherwise, which turns a name like "Badawy" fine but mangles anything
  // accented. The BOM costs three bytes and saves a support conversation.
  const body = "﻿" + lines.join("\r\n") + "\r\n";

  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="tarbiya-payments-${from}-to-${to}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
