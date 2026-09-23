"use client";

import Image from "next/image";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/** Initials, for an instructor with no photograph on file. */
function initialsOf(name: string) {
  return name
    .replace(/^(Sh|Shaykh|Sheikh|Ustadh|Ustadha|Dr\.?)\s+/i, "")
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function InstructorDialog({
  name,
  bio,
  photoUrl,
  subtitle,
}: {
  name: string;
  bio: string | null;
  photoUrl: string | null;
  subtitle?: string | null;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          About the instructor
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <div className="flex items-center">
            <Portrait name={name} photoUrl={photoUrl} size={64} />
            <div className="ml-4">
              <DialogTitle>{name}</DialogTitle>
              {subtitle ? (
                <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>
              ) : null}
            </div>
          </div>
        </DialogHeader>

        <div className="mt-5 border-t border-border pt-5">
          {bio ? (
            <p className="text-sm leading-relaxed text-foreground/80">{bio}</p>
          ) : (
            <p className="text-sm text-muted-foreground">
              No biography on file for this instructor yet.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function Portrait({
  name,
  photoUrl,
  size,
}: {
  name: string;
  photoUrl: string | null;
  size: number;
}) {
  if (photoUrl) {
    return (
      <Image
        src={photoUrl}
        alt={name}
        width={size}
        height={size}
        className="shrink-0 rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className="flex shrink-0 items-center justify-center rounded-full bg-secondary font-display text-primary"
      style={{ width: size, height: size, fontSize: size * 0.36 }}
    >
      {initialsOf(name)}
    </span>
  );
}
