import Image from "next/image";
import Link from "next/link";
import { ArrowRight, BookOpen, HeartHandshake, ScrollText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CourseCard } from "@/components/course-card";
import { getCatalogue } from "@/lib/catalogue";

const pillars = [
  {
    icon: BookOpen,
    title: "Rooted scholarship",
    body: "Curricula grounded in classical texts, taught by qualified instructors.",
  },
  {
    icon: ScrollText,
    title: "Structured progression",
    body: "Level-by-level tracks in Qur'anic and Islamic sciences so every student knows the next step.",
  },
  {
    icon: HeartHandshake,
    title: "Tarbiya first",
    body: "Knowledge paired with character — mentorship circles, adab and community service woven throughout.",
  },
];

export default async function Home() {
  const courses = await getCatalogue();

  return (
    <div>
      <section className="relative overflow-hidden">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 py-16 lg:grid-cols-2 lg:py-24">
          <div>
            <p className="eyebrow">Seeking transformation not just information</p>
            <div className="gold-rule mt-4" />
            <h1 className="mt-6 font-display text-5xl leading-[1.05] text-primary sm:text-6xl">
              A place to learn the language of the Qur&apos;an — and live by it.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-foreground/75">
              MAS Tarbiya Institute offers regular courses in the Qur&apos;anic and Islamic
              sciences. Register online in minutes and track your studies in the student portal.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg" className="bg-gold text-gold-foreground hover:bg-gold/90">
                <Link href="/courses">
                  Browse courses
                  <ArrowRight className="ml-1.5 h-4 w-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/about">About the institute</Link>
              </Button>
            </div>
          </div>
          <div className="relative">
            <div className="absolute -inset-3 -z-10 rounded-lg border border-gold/40" />
            <Image
              src="/hero-institute.jpg"
              alt="Sunlit classroom at MAS Tarbiya Institute with open Qur'an and Arabic calligraphy"
              width={1600}
              height={1008}
              priority
              className="rounded-lg object-cover shadow-lift"
            />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-10">
        <div className="grid gap-6 md:grid-cols-3">
          {pillars.map((pillar) => (
            <div
              key={pillar.title}
              className="rounded-lg border border-border bg-card p-6 shadow-card"
            >
              <pillar.icon className="h-7 w-7 text-gold" />
              <h3 className="mt-4 font-display text-2xl text-primary">{pillar.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-foreground/75">{pillar.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-14">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow">Courses offered</p>
            <h2 className="mt-2 font-display text-4xl text-primary">This term at the institute</h2>
          </div>
          <Button asChild variant="outline">
            <Link href="/courses">View all courses</Link>
          </Button>
        </div>
        <div className="mt-8 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {courses.slice(0, 3).map((course) => (
            <CourseCard key={course.id} course={course} />
          ))}
        </div>
      </section>
    </div>
  );
}
