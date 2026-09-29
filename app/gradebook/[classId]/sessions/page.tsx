import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import {
  ClearSessions,
  GenerateSessions,
  SessionCard,
  type SessionRecord,
} from "@/components/session-editor";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Sessions" };

export default async function SessionsPage({ params }: PageProps<"/gradebook/[classId]/sessions"> ) {
  const { classId } = await params;
  const supabase = await createClient();

  const { data: cls } = await supabase
    .from("classes")
    .select("id, term, meeting_schedule, start_date, courses ( code, title )")
    .eq("id", classId)
    .maybeSingle();

  if (!cls) notFound();

  const [sessionsRes, attendanceRes] = await Promise.all([
    supabase
      .from("class_sessions")
      .select("id, session_number, meets_on, starts_at, title, summary, recording_url, is_cancelled, is_published")
      .eq("class_id", classId)
      .order("session_number"),
    // How many marks each session carries, so the page can say which have been
    // taken and refuse to clear the term once any have.
    supabase
      .from("attendance")
      .select("session_id, class_sessions!inner ( class_id )")
      .eq("class_sessions.class_id", classId),
  ]);

  const marks = new Map<string, number>();
  for (const row of attendanceRes.data ?? []) {
    const id = row.session_id as string;
    marks.set(id, (marks.get(id) ?? 0) + 1);
  }

  const sessions: SessionRecord[] = (sessionsRes.data ?? []).map((s) => ({
    id: s.id,
    number: s.session_number,
    meetsOn: s.meets_on,
    startsAt: s.starts_at,
    title: s.title,
    summary: s.summary,
    recordingUrl: s.recording_url,
    isCancelled: s.is_cancelled,
    isPublished: s.is_published,
    marked: marks.get(s.id) ?? 0,
  }));

  const running = sessions.filter((s) => !s.isCancelled).length;

  return (
    <div className="mx-auto max-w-4xl px-5 py-16">
      <Link
        href={`/gradebook/${classId}`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to marks
      </Link>

      <p className="eyebrow mt-6">{cls.courses?.code} · Sessions</p>
      <div className="gold-rule mt-3" />
      <h1 className="mt-5 font-display text-5xl text-primary">{cls.courses?.title}</h1>
      <p className="mt-3 text-muted-foreground">
        {cls.term}
        {cls.meeting_schedule ? ` · ${cls.meeting_schedule}` : ""}
      </p>

      {sessions.length === 0 ? (
        <div className="mt-10">
          <GenerateSessions classId={classId} startDate={cls.start_date} />
        </div>
      ) : (
        <>
          <h2 className="mt-12 font-display text-3xl text-primary">
            {sessions.length} {sessions.length === 1 ? "session" : "sessions"}
            {running !== sessions.length ? ` · ${sessions.length - running} cancelled` : ""}
          </h2>
          <p className="mt-2 max-w-prose text-sm text-muted-foreground">
            The register is taken against these, so a mistyped date cannot invent a session.
            Cancelled ones are excluded from everyone&rsquo;s attendance rather than counting as
            a miss.
          </p>

          <ul className="mt-6 space-y-3">
            {sessions.map((session) => (
              <SessionCard key={session.id} classId={classId} session={session} />
            ))}
          </ul>

          <div className="mt-8">
            <ClearSessions classId={classId} anyMarked={marks.size > 0} />
          </div>
        </>
      )}
    </div>
  );
}
