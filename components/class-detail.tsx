import { Badge } from "@/components/ui/badge";
import { formatFee } from "@/lib/format";
import type { EnrollmentDetail } from "@/lib/student-detail";
import { cn } from "@/lib/utils";

const STATUS_LABEL: Record<string, string> = {
  present: "Present",
  late: "Late",
  absent: "Absent",
  excused: "Excused",
};

const formatDate = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

const pct = (value: number) => `${value.toFixed(1).replace(/\.0$/, "")}%`;

/**
 * One student's full standing in one class.
 *
 * `audience` only changes wording — "you" for the student, their name for
 * staff. It never changes what is fetched: RLS already decided that.
 */
export function ClassDetail({
  detail,
  audience,
}: {
  detail: EnrollmentDetail;
  audience: "student" | "staff";
}) {
  const finished = detail.classStatus === "completed";
  const headline = finished ? (detail.finalScore ?? detail.currentScore) : detail.currentScore;
  const passed = headline !== null && headline >= detail.passingScore;
  const partial = detail.weightGraded > 0 && detail.weightGraded < 100;

  // How many penalised sessions the class's grace allowance absorbed. Without
  // saying this, the attendance percentage looks like it disagrees with the
  // list of sessions printed right below it.
  const attendanceCategory = detail.categories.find((c) => c.source === "attendance");
  const penalisedSessions = detail.sessions.filter((s) => s.status !== "excused").length;
  const forgiven =
    attendanceCategory?.counted != null ? penalisedSessions - attendanceCategory.counted : 0;

  return (
    <>
      <p className="eyebrow">{detail.courseCode}</p>
      <div className="gold-rule mt-3" />
      <h1 className="mt-5 font-display text-5xl text-primary">
        {audience === "student" ? detail.courseTitle : detail.studentName}
      </h1>
      <p className="mt-3 text-muted-foreground">
        {audience === "student" ? null : <>{detail.courseTitle} · </>}
        {detail.term}
        {detail.meetingSchedule ? ` · ${detail.meetingSchedule}` : ""}
        {detail.teacherName ? ` · ${detail.teacherName}` : ""}
      </p>

      {/* Headline grade */}
      <div className="mt-8 rounded-lg border border-border bg-card p-6 shadow-card">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
              {finished ? "Final grade" : "Grade so far"}
            </p>
            <p className="mt-2 font-display text-5xl leading-none text-primary lining-nums tabular-nums">
              {headline === null ? "—" : pct(headline)}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {headline !== null && finished ? (
              <Badge variant={passed ? "default" : "destructive"}>
                {passed ? "Passed" : "Did not pass"}
              </Badge>
            ) : null}
            <Badge variant="secondary" className="capitalize">
              {detail.enrollmentStatus}
            </Badge>
            <Badge
              variant={detail.paymentStatus === "paid" ? "default" : "destructive"}
              className="capitalize"
            >
              {detail.paymentStatus}
            </Badge>
          </div>
        </div>

        <p className="mt-4 text-sm text-muted-foreground">
          {headline === null
            ? "Nothing has been marked yet."
            : finished
              ? `The pass mark for this class is ${pct(detail.passingScore)}.`
              : partial
                ? `Based on the ${pct(detail.weightGraded)} of the course marked so far — work not yet marked is left out rather than counted as zero. The pass mark is ${pct(detail.passingScore)}.`
                : `Every category has been marked. The pass mark is ${pct(detail.passingScore)}.`}
        </p>

        {detail.outstanding > 0 ? (
          <p className="mt-2 text-sm text-foreground/75">
            Outstanding balance: {formatFee(detail.outstanding)}
          </p>
        ) : null}
      </div>

      {/* Category breakdown */}
      <h2 className="mt-12 font-display text-3xl text-primary">How that breaks down</h2>
      <div className="mt-5 overflow-x-auto rounded-lg border border-border bg-card shadow-card">
        <table className="w-full text-sm">
          <thead className="bg-secondary/50">
            <tr className="border-b border-border">
              <th className="w-full px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Category
              </th>
              <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Weight
              </th>
              <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Score
              </th>
              <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Contributes
              </th>
            </tr>
          </thead>
          <tbody>
            {detail.categories.map((category) => (
              <tr key={category.id} className="border-b border-border/60 last:border-0">
                <td className="px-4 py-3">
                  <span className="font-medium text-foreground">{category.name}</span>
                  {category.source === "attendance" ? (
                    <span className="ml-2 text-xs text-muted-foreground">from the register</span>
                  ) : null}
                </td>
                <td className="whitespace-nowrap px-4 py-3 lining-nums tabular-nums text-foreground/80">
                  {pct(category.weight)}
                </td>
                <td className="whitespace-nowrap px-4 py-3 lining-nums tabular-nums text-foreground/80">
                  {category.percent === null ? (
                    <span className="text-muted-foreground">not marked</span>
                  ) : (
                    pct(category.percent)
                  )}
                </td>
                <td className="whitespace-nowrap px-4 py-3 lining-nums tabular-nums text-foreground/80">
                  {category.contributes === null ? (
                    <span className="text-muted-foreground">—</span>
                  ) : (
                    `${category.contributes.toFixed(1)} pts`
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {partial ? (
        <p className="mt-3 text-sm text-muted-foreground">
          Points are scaled across the {pct(detail.weightGraded)} marked so far, so they add up to
          the grade above. They will shift as the rest is marked.
        </p>
      ) : null}

      {/* Every piece of work, by category */}
      {detail.categories
        .filter((c) => c.source === "assignments")
        .map((category) => (
          <section key={category.id} className="mt-12">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="font-display text-2xl text-primary">{category.name}</h2>
              <Badge variant="secondary">{pct(category.weight)}</Badge>
            </div>

            {category.assignments.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">Nothing set yet.</p>
            ) : (
              <ul className="mt-4 divide-y divide-border/60 rounded-lg border border-border bg-card shadow-card">
                {category.assignments.map((item) => (
                  <li key={item.id} className="flex flex-wrap items-start justify-between gap-4 p-4">
                    <div>
                      <span className="font-medium text-foreground">{item.name}</span>
                      {!item.isPublished ? (
                        <Badge variant="outline" className="ml-2">
                          Draft
                        </Badge>
                      ) : null}
                      {item.dueDate ? (
                        <span className="block text-xs text-muted-foreground">
                          Due {formatDate(item.dueDate)}
                        </span>
                      ) : null}
                      {item.feedback ? (
                        <p className="mt-2 max-w-prose text-sm text-foreground/75">
                          {item.feedback}
                        </p>
                      ) : null}
                      {/* Staff only. A student seeing "marked by" invites an
                          argument with a name attached; staff need it to answer
                          "who changed this, and when" months afterwards. */}
                      {audience === "staff" && item.markedBy ? (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Marked by {item.markedBy}
                          {item.markedAt ? ` · ${formatDate(item.markedAt)}` : ""}
                        </p>
                      ) : null}
                    </div>

                    <div className="text-right">
                      {item.score === null ? (
                        <span className="text-sm text-muted-foreground">Not marked</span>
                      ) : (
                        <>
                          <span className="font-medium lining-nums tabular-nums text-foreground">
                            {item.score} / {item.maxScore}
                          </span>
                          <span className="block text-xs lining-nums tabular-nums text-muted-foreground">
                            {pct((100 * item.score) / item.maxScore)}
                          </span>
                        </>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}

      {/* Attendance register */}
      {detail.sessions.length > 0 ? (
        <section className="mt-12">
          <h2 className="font-display text-2xl text-primary">Attendance</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Late counts as half a session. Excused sessions are left out of the calculation
            entirely rather than counted against you.
            {detail.attendanceGrace > 0
              ? ` This class forgives up to ${detail.attendanceGrace} ${detail.attendanceGrace === 1 ? "absence" : "absences"} before attendance affects the grade.`
              : ""}
          </p>
          {forgiven > 0 ? (
            <p className="mt-2 text-sm text-foreground/75">
              {forgiven} {forgiven === 1 ? "session was" : "sessions were"} forgiven under that
              policy, so attendance is scored over {attendanceCategory?.counted} of them.
            </p>
          ) : null}
          <ul className="mt-4 divide-y divide-border/60 rounded-lg border border-border bg-card shadow-card">
            {detail.sessions.map((session) => (
              <li
                key={session.date}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
              >
                <div>
                  <span className="text-foreground/85">{formatDate(session.date)}</span>
                  {session.note ? (
                    <span className="block text-xs text-muted-foreground">{session.note}</span>
                  ) : null}
                </div>
                <span
                  className={cn(
                    "rounded-md px-2.5 py-0.5 text-xs font-medium",
                    session.status === "present" && "bg-primary/10 text-primary",
                    session.status === "late" && "bg-gold/25 text-gold-foreground",
                    session.status === "absent" && "bg-destructive/15 text-destructive",
                    session.status === "excused" && "bg-secondary text-muted-foreground",
                  )}
                >
                  {STATUS_LABEL[session.status] ?? session.status}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
