import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { NewTeacherForm, TeacherCard, type TeacherRecord } from "@/components/teacher-editor";
import { teacherPhotoUrl } from "@/lib/storage";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Teachers",
  description: "Who teaches at the institute.",
};

export default async function TeachersPage() {
  const supabase = await createClient();

  // Read `teachers` joined to `people` rather than teacher_directory: this page
  // needs inactive teachers and the email address, and the directory publishes
  // neither. Only an admin reaches this query at all.
  const [teachersRes, classesRes] = await Promise.all([
    supabase
      .from("teachers")
      .select("id, bio, photo_path, is_active, people ( title, first_name, last_name, email, auth_user_id )")
      .order("created_at"),
    supabase.from("classes").select("teacher_id"),
  ]);

  const classCounts = new Map<string, number>();
  for (const row of classesRes.data ?? []) {
    if (row.teacher_id) classCounts.set(row.teacher_id, (classCounts.get(row.teacher_id) ?? 0) + 1);
  }

  const teachers: TeacherRecord[] = (teachersRes.data ?? [])
    .map((t) => {
      const person = t.people;
      return {
        id: t.id,
        title: person?.title ?? null,
        firstName: person?.first_name ?? "",
        lastName: person?.last_name ?? "",
        email: person?.email ?? null,
        bio: t.bio,
        photoUrl: teacherPhotoUrl(t.photo_path),
        isActive: t.is_active,
        classCount: classCounts.get(t.id) ?? 0,
        hasLogin: Boolean(person?.auth_user_id),
      };
    })
    .sort((a, b) => {
      // Active first, then alphabetical: the ones you are likely to edit sit at
      // the top, and retired teachers fall to the bottom rather than vanishing.
      if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
      return `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`);
    });

  const active = teachers.filter((t) => t.isActive).length;

  return (
    <div className="mx-auto max-w-4xl px-5 py-16">
      <Link
        href="/admin"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary"
      >
        <ArrowLeft className="h-4 w-4" />
        Administration
      </Link>

      <p className="eyebrow mt-6">Institute</p>
      <div className="gold-rule mt-3" />
      <h1 className="mt-5 font-display text-5xl text-primary">Teachers</h1>
      <p className="mt-3 max-w-2xl text-muted-foreground">
        Everyone who teaches here. Recording an email lets them sign in with Google and reach
        their own gradebook without anyone setting it up for them.
      </p>

      <div className="mt-8">
        <NewTeacherForm />
      </div>

      <h2 className="mt-12 font-display text-3xl text-primary">
        {active} {active === 1 ? "teacher" : "teachers"}
        {teachers.length > active ? ` · ${teachers.length - active} retired` : ""}
      </h2>

      {teachers.length === 0 ? (
        <p className="mt-4 text-muted-foreground">Nobody yet.</p>
      ) : (
        <ul className="mt-5 space-y-4">
          {teachers.map((teacher) => (
            <TeacherCard key={teacher.id} teacher={teacher} />
          ))}
        </ul>
      )}
    </div>
  );
}
