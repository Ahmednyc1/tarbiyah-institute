import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarDays, GraduationCap, MapPin, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { InstructorDialog, Portrait } from "@/components/instructor-dialog";
import { getViewer } from "@/lib/account";
import { formatFee } from "@/lib/format";
import { teacherPhotoUrl } from "@/lib/storage";
import { createClient } from "@/lib/supabase/server";

/**
 * Per-class link previews.
 *
 * A fixed `metadata` const is resolved at build time and cannot know which
 * class it is for, so every course link previewed identically in WhatsApp and
 * the like — which defeats the point of this being a shareable page. Next
 * dedupes the request, so this lookup costs nothing extra on top of the page's
 * own query.
 */
export async function generateMetadata({
  params,
}: PageProps<"/register/[classId]">): Promise<Metadata> {
  const { classId } = await params;
  const supabase = await createClient();

  const { data: cls } = await supabase
    .from("classes")
    .select(
      `term, meeting_schedule, registration_fee, capacity,
       courses ( title ), teacher_directory ( full_name )`,
    )
    .eq("id", classId)
    .maybeSingle();

  if (!cls?.courses) {
    return { title: "Register" };
  }

  const { data: availability } = await supabase
    .from("class_availability")
    .select("remaining")
    .eq("class_id", classId)
    .maybeSingle();

  const parts = [
    cls.meeting_schedule ?? cls.term,
    cls.teacher_directory?.full_name ? `with ${cls.teacher_directory.full_name}` : null,
  ].filter(Boolean);

  const facts = [
    formatFee(Number(cls.registration_fee)),
    availability?.remaining != null && cls.capacity !== null
      ? `${availability.remaining} of ${cls.capacity} seats left`
      : null,
  ].filter(Boolean);

  const description = `${parts.join(" ")}. ${facts.join(" · ")}.`;

  return {
    title: cls.courses.title,
    description,
    openGraph: {
      // The template in the root layout does not apply to openGraph, so the
      // institute name is spelled out here.
      title: `${cls.courses.title} — MAS Tarbiya Institute`,
      description,
      type: "website",
      images: [{ url: "/hero-institute.jpg", width: 1600, height: 1008 }],
    },
  };
}

// Registration is completed in person until a payment provider is settled.
// Kept here rather than inline so there is one place to change when it is.
const CONTACT_EMAIL = "admissions@mastarbiya.org";

export default async function RegisterPage({ params }: PageProps<"/register/[classId]">) {
  const { classId } = await params;
  const supabase = await createClient();

  const [{ data: cls }, { data: availability }, viewer] = await Promise.all([
    supabase
      .from("classes")
      .select(
        `id, term, section, status, registration_fee, capacity, meeting_schedule, location,
         start_date, end_date, gender_restriction,
         courses ( code, title, description ),
         teacher_directory ( full_name, bio, photo_path )`,
      )
      .eq("id", classId)
      .maybeSingle(),
    supabase.from("class_availability").select("taken, remaining, is_full").eq("class_id", classId).maybeSingle(),
    getViewer(),
  ]);

  // RLS publishes only open and in_progress classes to the public, so a draft
  // or cancelled class is simply not found here.
  if (!cls) notFound();

  let alreadyEnrolled = false;
  let previouslyPaid = false;
  if (viewer?.studentId) {
    const { data } = await supabase
      .from("enrollments")
      .select("id, status, amount_paid")
      .eq("class_id", classId)
      .eq("student_id", viewer.studentId)
      .maybeSingle();

    alreadyEnrolled = Boolean(data && data.status !== "dropped");
    // Dropped, but money changed hands. Whether they owe again is a policy
    // question about money — a person decides that, not a checkout page.
    previouslyPaid = Boolean(data && data.status === "dropped" && Number(data.amount_paid) > 0);
  }

  const isFull = availability?.is_full ?? false;
  // The status is somebody's recollection; start_date is the fact. A course
  // whose first session has run stops selling seats even if nobody remembered
  // to change its status that morning.
  const hasBegun = cls.start_date !== null && cls.start_date <= new Date().toISOString().slice(0, 10);
  const openForRegistration = cls.status === "open" && !isFull && !hasBegun;

  return (
    <div className="mx-auto max-w-2xl px-5 py-20">
      <Link
        href="/courses"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary"
      >
        <ArrowLeft className="h-4 w-4" />
        All courses
      </Link>

      <p className="eyebrow mt-6">{cls.courses?.code} · Registration</p>
      <div className="gold-rule mt-3" />
      <h1 className="mt-5 font-display text-4xl text-primary sm:text-5xl">
        {cls.courses?.title}
      </h1>

      <div className="mt-8 rounded-lg border border-border bg-card p-6 shadow-card">
        <ul className="space-y-3 text-sm">
          <Fact icon={GraduationCap}>
            {cls.teacher_directory?.full_name ?? "Instructor to be announced"}
          </Fact>
          <Fact icon={CalendarDays}>
            {cls.meeting_schedule ?? cls.term}
            {cls.start_date ? ` · begins ${formatDate(cls.start_date)}` : ""}
          </Fact>
          {cls.location ? <Fact icon={MapPin}>{cls.location}</Fact> : null}
          <Fact icon={Users}>
            {cls.capacity === null
              ? `${availability?.taken ?? 0} enrolled`
              : `${availability?.taken ?? 0} of ${cls.capacity} seats taken`}
            {cls.gender_restriction !== "mixed" ? ` · ${cls.gender_restriction} only` : ""}
          </Fact>
        </ul>

        <div className="mt-5 flex items-center justify-between rounded-md bg-secondary px-4 py-3">
          <span className="text-sm font-medium">Tuition</span>
          <span className="font-display text-2xl text-primary lining-nums tabular-nums">
            {formatFee(Number(cls.registration_fee))}
          </span>
        </div>

        {cls.courses?.description ? (
          <p className="mt-5 text-sm leading-relaxed text-foreground/80">
            {cls.courses.description}
          </p>
        ) : null}

        {cls.teacher_directory ? (
          <div className="mt-5 flex flex-wrap items-center justify-between gap-4 border-t border-border pt-5">
            <div className="flex items-center">
              <Portrait
                name={cls.teacher_directory.full_name ?? "Instructor"}
                photoUrl={teacherPhotoUrl(cls.teacher_directory.photo_path)}
                size={44}
              />
              <div className="ml-3">
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  Your instructor
                </p>
                <p className="font-display text-xl text-primary">
                  {cls.teacher_directory.full_name ?? "Instructor"}
                </p>
              </div>
            </div>

            <InstructorDialog
              name={cls.teacher_directory.full_name ?? "Instructor"}
              bio={cls.teacher_directory.bio}
              photoUrl={teacherPhotoUrl(cls.teacher_directory.photo_path)}
              subtitle={cls.courses?.title ?? null}
            />
          </div>
        ) : null}
      </div>

      {/* ---- What happens next, depending on where this person stands ---- */}

      {alreadyEnrolled ? (
        <Panel tone="good" title="You are already registered">
          <p>This class is in your portal, along with your marks and attendance.</p>
          <Button asChild className="mt-5 bg-primary hover:bg-primary-deep">
            <Link href="/portal">Go to your portal</Link>
          </Button>
        </Panel>
      ) : previouslyPaid ? (
        <Panel tone="warn" title="You have registered for this before">
          <p>
            Our records show you were registered for this course and later left it. Whether you
            can rejoin, and whether anything further is owed, is for the institute to decide —
            please email{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary hover:underline">
              {CONTACT_EMAIL}
            </a>{" "}
            or speak to the desk.
          </p>
        </Panel>
      ) : hasBegun ? (
        <Panel tone="warn" title="This course has already begun">
          <p>
            The first session has passed, so online registration is closed. Joining late is
            sometimes possible — email{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary hover:underline">
              {CONTACT_EMAIL}
            </a>{" "}
            and ask.
          </p>
        </Panel>
      ) : isFull ? (
        <Panel tone="warn" title="This class is full">
          <p>
            All {cls.capacity} seats are taken. Email{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary hover:underline">
              {CONTACT_EMAIL}
            </a>{" "}
            to be told if a place opens up.
          </p>
        </Panel>
      ) : !openForRegistration ? (
        <Panel tone="warn" title="Registration is closed">
          <p>This class is no longer accepting new students.</p>
        </Panel>
      ) : (
        <Panel tone="plain" title="How to register">
          <p>
            Registration is completed in person at the masjid. Speak to the institute desk after
            Jumu&apos;ah, or email{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary hover:underline">
              {CONTACT_EMAIL}
            </a>
            , and bring the {formatFee(Number(cls.registration_fee))} tuition. Your place is
            confirmed once it is paid.
          </p>

          {viewer ? (
            <p className="mt-4">
              Your account is ready — once you are enrolled, this class and your grades appear in{" "}
              <Link href="/portal" className="text-primary hover:underline">
                your portal
              </Link>{" "}
              automatically.
            </p>
          ) : (
            <>
              <p className="mt-4">
                Create your account now and it will be waiting, so your marks, attendance and
                certificate are there from the first week.
              </p>
              <Button asChild className="mt-5 bg-gold text-gold-foreground hover:bg-gold/90">
                <Link href={`/auth?next=/register/${classId}`}>Create your account</Link>
              </Button>
            </>
          )}

          <p className="mt-6 text-sm text-muted-foreground">
            Online card payment is coming. Zakat and sadaqah support is available — ask at the
            desk, and it stays between you and the institute.
          </p>
        </Panel>
      )}
    </div>
  );
}

function Fact({ icon: Icon, children }: { icon: typeof Users; children: React.ReactNode }) {
  return (
    // Spacing sits on the icon rather than a flex gap: margin applies whether
    // or not the row resolves to flex, and gap was rendering as zero here.
    <li className="flex items-start text-muted-foreground">
      <Icon className="mr-3 mt-0.5 h-4 w-4 shrink-0 text-primary" />
      <span>{children}</span>
    </li>
  );
}

function Panel({
  tone,
  title,
  children,
}: {
  tone: "good" | "warn" | "plain";
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-8 rounded-lg border border-border bg-card p-6 shadow-card">
      <div className="flex items-center gap-3">
        <h2 className="font-display text-2xl text-primary">{title}</h2>
        {tone === "good" ? <Badge>Enrolled</Badge> : null}
        {tone === "warn" ? <Badge variant="destructive">Closed</Badge> : null}
      </div>
      <div className="mt-3 leading-relaxed text-foreground/80">{children}</div>
    </div>
  );
}

const formatDate = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
