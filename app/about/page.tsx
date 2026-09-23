import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "About",
  description:
    "MAS Tarbiya Institute teaches the Qur'anic and Islamic sciences with an emphasis on character formation and community.",
};

const values = [
  {
    title: "Ilm",
    body: "Faithful transmission of classical sciences in accessible, modern language.",
  },
  { title: "Amal", body: "Learning that turns into practice — worship, manners and service." },
  { title: "Ummah", body: "A welcoming community for families, students and new Muslims alike." },
];

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-4xl px-5 py-16">
      <p className="eyebrow">About the institute</p>
      <div className="gold-rule mt-3" />
      <h1 className="mt-5 font-display text-5xl text-primary">
        Nurturing knowledge, character and community
      </h1>

      <div className="mt-8 space-y-5 text-lg leading-relaxed text-foreground/80">
        <p>
          MAS Tarbiya Institute was founded to make serious Islamic learning approachable for
          working adults, students and families. Our classes are small, our instructors are
          accessible, and every syllabus is built to move students from foundations to fluency.
        </p>
        <p>
          Tarbiya — the cultivation of the self — sits at the centre of everything we teach.
          Alongside lectures and readings, students join mentorship circles where knowledge is
          connected to daily practice.
        </p>
      </div>

      <div className="mt-12 grid gap-6 sm:grid-cols-3">
        {values.map((value) => (
          <div key={value.title} className="rounded-lg border border-border bg-card p-6 shadow-card">
            <h2 className="font-display text-2xl text-primary">{value.title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-foreground/75">{value.body}</p>
          </div>
        ))}
      </div>

      <div className="mt-14 rounded-lg bg-primary px-8 py-10 text-primary-foreground">
        <h2 className="font-display text-3xl">Registration is open</h2>
        <p className="mt-2 max-w-xl text-primary-foreground/80">
          Seats are limited in each class. Review the schedule and reserve your place today.
        </p>
        <Button asChild className="mt-6 bg-gold text-gold-foreground hover:bg-gold/90">
          <Link href="/courses">See courses</Link>
        </Button>
      </div>
    </div>
  );
}
