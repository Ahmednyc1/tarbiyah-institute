import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy",
  description:
    "What MAS Tarbiya Institute collects when you register for a course, who can see it, and how to ask for it to be removed.",
};

/**
 * What the institute holds about a student, in plain language.
 *
 * WRITTEN FROM THE SCHEMA, NOT FROM A TEMPLATE. Every claim below was checked
 * against the actual tables and the actual third parties the code calls, on
 * 2026-11-08. That is the only thing that makes a privacy policy worth having:
 * a copied one describes somebody else's system and quietly becomes a lie.
 *
 * IF THE DATA CHANGES, THIS PAGE HAS TO CHANGE. In particular: the `people`
 * table also has sex, date_of_birth, guardian_name and guardian_phone columns
 * that no form currently fills. The day one of them starts being collected —
 * especially for anyone under 18 — this page is out of date and the rules
 * around children's data get much stricter.
 *
 * This is not legal advice and nobody qualified has reviewed it. It is an
 * honest description of the system, which is a reasonable place to start and
 * not a substitute for someone who knows the law in New York.
 */

const LAST_REVIEWED = "8 November 2026";

type Section = { heading: string; body: React.ReactNode };

const sections: Section[] = [
  {
    heading: "What we collect",
    body: (
      <>
        <p>When you register for a course, we record:</p>
        <ul className="mt-3 space-y-2 pl-5">
          <li className="list-disc">
            <strong>Your name, email address and phone number</strong> — so we know who is in the
            class and can reach you about it.
          </li>
          <li className="list-disc">
            <strong>Which courses you enrolled in, and when.</strong>
          </li>
          <li className="list-disc">
            <strong>What you paid</strong> — the amount, the date, and whether it was online or at
            the desk. <strong>We never see or store your card number.</strong> That goes directly
            to Stripe; what comes back to us is a reference number and the amount.
          </li>
          <li className="list-disc">
            <strong>Your marks and attendance</strong> — scores, any written feedback from your
            teacher, and whether you were present, absent or excused for each session.
          </li>
          <li className="list-disc">
            <strong>A record of the emails we sent you</strong> — which message, to which address,
            and whether it was delivered. Not a copy of your replies.
          </li>
        </ul>
        <p className="mt-4">
          If you sign in with Google, Google tells us your name and email address and nothing
          else. <strong>We never receive your Google password</strong>, and we cannot read your
          Gmail, your contacts or anything else in your account.
        </p>
      </>
    ),
  },
  {
    heading: "Who can see it",
    body: (
      <>
        <ul className="space-y-2 pl-5">
          <li className="list-disc">
            <strong>You</strong> — your own record, in your student portal.
          </li>
          <li className="list-disc">
            <strong>Your teacher</strong> — the marks, attendance and contact details of students
            in the classes they teach, and no others.
          </li>
          <li className="list-disc">
            <strong>Institute administrators</strong> — enrolments and payments, in order to run
            the institute and account for its money.
          </li>
        </ul>
        <p className="mt-4">
          These limits are enforced by the database itself, not only by the pages you see. A
          teacher who is not teaching your class cannot retrieve your marks even by asking the
          system directly.
        </p>
        <p className="mt-4">
          <strong>We do not sell your information, and we do not share it for advertising.</strong>{" "}
          We share it only with the services listed below, which we need in order to run the
          institute, and when the law requires it.
        </p>
      </>
    ),
  },
  {
    heading: "Services we rely on",
    body: (
      <>
        <p>
          Running this site means trusting a few companies with parts of your information. These
          are all of them:
        </p>
        <ul className="mt-3 space-y-2 pl-5">
          <li className="list-disc">
            <strong>Supabase</strong> — stores the database and handles signing in.
          </li>
          <li className="list-disc">
            <strong>Vercel</strong> — runs the website itself.
          </li>
          <li className="list-disc">
            <strong>Stripe</strong> — takes online payments. Your card details go to Stripe and
            never pass through us.
          </li>
          <li className="list-disc">
            <strong>Resend</strong> — delivers our emails.
          </li>
          <li className="list-disc">
            <strong>Google</strong> — only if you choose to sign in with a Google account.
          </li>
        </ul>
      </>
    ),
  },
  {
    heading: "How long we keep it",
    body: (
      <p>
        We keep your enrolment, marks and attendance for as long as the institute keeps its
        academic records, so that a certificate or a transcript can still be verified years
        later. Payment records are kept as long as the institute&rsquo;s accounts require. If you
        ask us to delete your information, we will — except for what we are obliged to keep for
        accounting, and we will tell you plainly what that is.
      </p>
    ),
  },
  {
    heading: "Your choices",
    body: (
      <>
        <p>You can ask us at any time to:</p>
        <ul className="mt-3 space-y-2 pl-5">
          <li className="list-disc">tell you everything we hold about you;</li>
          <li className="list-disc">correct anything that is wrong;</li>
          <li className="list-disc">delete your information;</li>
          <li className="list-disc">stop emailing you about a course.</li>
        </ul>
        <p className="mt-4">
          Email <ContactLink /> and a person will answer. You do not need to give a reason.
        </p>
      </>
    ),
  },
  {
    heading: "Children",
    body: (
      <p>
        Our courses are intended for adults and older students. We do not knowingly collect
        information from children under 13 through this website. If a child under 13 has
        registered, write to <ContactLink /> and we will remove the record.
      </p>
    ),
  },
  {
    heading: "Cookies",
    body: (
      <p>
        We use one kind of cookie: the one that keeps you signed in. There is no advertising
        tracking on this site and no analytics following you between sites. Signing out clears
        it.
      </p>
    ),
  },
  {
    heading: "If this changes",
    body: (
      <p>
        If what we collect changes, this page changes with it, and the date below changes too.
        It is written to describe the system as it actually works rather than to cover every
        eventuality, so if something here does not match what you see, that is a mistake we want
        to hear about.
      </p>
    ),
  },
];

function ContactLink() {
  return (
    <a href="mailto:admissions@mastarbiya.org" className="text-primary hover:underline">
      admissions@mastarbiya.org
    </a>
  );
}

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-5 py-16">
      <p className="eyebrow">Privacy</p>
      <div className="gold-rule mt-3" />
      <h1 className="mt-5 font-display text-5xl text-primary">
        What we know about you, and why
      </h1>

      <p className="mt-8 text-lg leading-relaxed text-foreground/80">
        MAS Tarbiya Institute keeps the smallest amount of information it can while still running
        a class: who is enrolled, what they paid, and how they are doing. This page says exactly
        what that means, in plain language rather than legal boilerplate.
      </p>

      <div className="mt-12 space-y-10">
        {sections.map((section) => (
          <section key={section.heading}>
            <h2 className="font-display text-3xl text-primary">{section.heading}</h2>
            <div className="mt-3 leading-relaxed text-foreground/80">{section.body}</div>
          </section>
        ))}
      </div>

      <div className="mt-14 border-t border-border pt-6 text-sm text-muted-foreground">
        <p>
          Questions about any of this: <ContactLink />, or speak to the institute desk after
          Jumu&rsquo;ah.
        </p>
        <p className="mt-2">Last reviewed {LAST_REVIEWED}.</p>
        <p className="mt-4">
          <Link href="/" className="text-primary hover:underline">
            Back to the institute
          </Link>
        </p>
      </div>
    </div>
  );
}
