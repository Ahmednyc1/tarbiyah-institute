import type { Metadata } from "next";
import { CourseCard } from "@/components/course-card";
import { getCatalogue } from "@/lib/catalogue";

export const metadata: Metadata = {
  title: "Courses offered",
  description:
    "Schedules, instructors and tuition for every course at MAS Tarbiya Institute. Register online.",
};

export default async function CoursesPage() {
  const courses = await getCatalogue();

  return (
    <div className="mx-auto max-w-6xl px-5 py-16">
      <p className="eyebrow">Courses offered</p>
      <div className="gold-rule mt-3" />
      <h1 className="mt-5 font-display text-5xl text-primary">Study with us this term</h1>
      <p className="mt-4 max-w-2xl text-lg text-foreground/75">
        Every course meets weekly with a qualified instructor. Choose a class, complete the short
        registration, and your seat appears in your student portal.
      </p>

      {courses.length === 0 ? (
        <p className="mt-12 text-muted-foreground">
          No courses are listed right now. Please check back soon.
        </p>
      ) : (
        <div className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {courses.map((course) => (
            <CourseCard key={course.id} course={course} />
          ))}
        </div>
      )}
    </div>
  );
}
