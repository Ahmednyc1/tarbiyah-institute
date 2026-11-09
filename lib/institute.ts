/**
 * The institute's own details, in one place.
 *
 * WHY THIS FILE EXISTS. The contact address used to be written out by hand in
 * three separate files — the footer, the registration page and the privacy
 * policy — with a fourth, different address on the Reply-To of every email the
 * system sent. A student reading the website wrote to one inbox; a student
 * hitting reply on their confirmation wrote to another. Nobody decided that;
 * it just accumulated.
 *
 * Anything a visitor is told to write to, or write back to, belongs here.
 */

/**
 * Where enquiries go.
 *
 * It is used for the footer, the registration page, the privacy policy, and as
 * the Reply-To on every email sent — so a cold enquiry from the website and a
 * reply to a confirmation land in the same inbox. They used not to, and nobody
 * had chosen that.
 *
 * WHY THIS ADDRESS. The finance manager's condition, agreed 2026-09-27, was
 * that anything touching student records or payments live on a
 * **@masnewyork.org** address the organisation controls, rather than on a
 * personal account or a domain somebody happens to own. The site advertised
 * `admissions@mastarbiya.org` for months, which is a different mailbox on a
 * different domain entirely and satisfies none of that.
 *
 * `bk.institute@` over `tarbiyahinstitute@`, which was the name floated in
 * that thread: this one already exists, is already staffed, is already the
 * Reply-To sitting in forty students' inboxes, and matches the convention the
 * masjid already uses alongside `bk.finance@masnewyork.org`.
 */
export const CONTACT_EMAIL = "bk.institute@masnewyork.org";

/**
 * The envelope sender.
 *
 * A send-only subdomain, which is why it has no MX record and nothing can be
 * received at it. Replies are steered to CONTACT_EMAIL by the Reply-To header
 * instead — see lib/email.ts.
 */
export const FROM_EMAIL = `MAS Tarbiya Institute <institute@send.masnewyork.org>`;

/** Shown wherever the institute is named in full. */
export const INSTITUTE_NAME = "MAS Tarbiya Institute";
