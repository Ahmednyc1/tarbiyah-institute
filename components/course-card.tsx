import Link from "next/link";
import { CalendarDays, GraduationCap, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatFee, openClassOf, type CatalogueCourse } from "@/lib/catalogue";

export function CourseCard({ course }: { course: CatalogueCourse }) {
  const offering = openClassOf(course);

  return (
    <article className="group flex flex-col overflow-hidden rounded-lg border border-border bg-card shadow-card transition-shadow hover:shadow-lift">
      <div className="bg-primary px-6 py-5">
        <h3 className="font-display text-2xl text-primary-foreground">{course.title}</h3>
        <p className="mt-1 text-xs uppercase tracking-[0.18em] text-gold">
          {offering ? `${formatFee(offering.registration_fee)} tuition` : "Not yet scheduled"}
        </p>
      </div>

      <div className="flex flex-1 flex-col gap-4 p-6">
        {offering ? (
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="flex items-center">
              <GraduationCap className="mr-2.5 h-4 w-4 shrink-0 text-primary" />
              {offering.teacher?.full_name ?? "Instructor to be announced"}
            </li>
            <li className="flex items-center">
              <CalendarDays className="mr-2.5 h-4 w-4 shrink-0 text-primary" />
              {offering.meeting_schedule ?? offering.term}
            </li>
            {offering.capacity !== null ? (
              <li className="flex items-center">
                <Users className="mr-2.5 h-4 w-4 shrink-0 text-primary" />
                {offering.capacity} seats
              </li>
            ) : null}
          </ul>
        ) : (
          <Badge variant="secondary" className="w-fit">
            Registration opening soon
          </Badge>
        )}

        <p className="flex-1 text-sm leading-relaxed text-foreground/80">{course.description}</p>

        {offering && offering.status === "open" ? (
          <Button asChild className="w-full bg-gold text-gold-foreground hover:bg-gold/90">
            <Link href={`/register/${offering.id}`}>Register Now</Link>
          </Button>
        ) : (
          <Button disabled className="w-full" variant="secondary">
            {offering ? "Registration closed" : "Dates to be announced"}
          </Button>
        )}
      </div>
    </article>
  );
}
