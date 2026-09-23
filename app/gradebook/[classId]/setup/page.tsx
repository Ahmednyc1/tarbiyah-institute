import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GradingSchemeEditor, type SchemeRow } from "@/components/grading-scheme-editor";
import {
  createAssignment,
  deleteAssignment,
  updateAssignment,
} from "@/app/gradebook/[classId]/setup/actions";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Class setup" };

export default async function SetupPage({ params }: PageProps<"/gradebook/[classId]/setup">) {
  const { classId } = await params;
  const supabase = await createClient();

  const { data: cls } = await supabase
    .from("classes")
    .select("id, term, status, courses ( code, title )")
    .eq("id", classId)
    .maybeSingle();

  if (!cls) notFound();

  const [categoriesRes, assignmentsRes] = await Promise.all([
    supabase
      .from("grade_categories")
      .select("id, name, weight, position, source")
      .eq("class_id", classId)
      .order("position"),
    supabase
      .from("assignments")
      .select("id, name, max_score, due_date, is_published, grade_category_id")
      .eq("class_id", classId)
      .order("due_date", { nullsFirst: false }),
  ]);

  const categories = categoriesRes.data ?? [];
  const assignments = assignmentsRes.data ?? [];

  const scheme: SchemeRow[] = categories.map((c) => ({
    id: c.id,
    name: c.name,
    weight: Number(c.weight),
    source: c.source as "assignments" | "attendance",
    assignmentCount: assignments.filter((a) => a.grade_category_id === c.id).length,
  }));

  return (
    <div className="mx-auto max-w-4xl px-5 py-16">
      <Link
        href={`/gradebook/${classId}`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to marks
      </Link>

      <p className="eyebrow mt-6">{cls.courses?.code} · Setup</p>
      <div className="gold-rule mt-3" />
      <h1 className="mt-5 font-display text-5xl text-primary">{cls.courses?.title}</h1>
      <p className="mt-3 text-muted-foreground">{cls.term}</p>

      <h2 className="mt-12 font-display text-3xl text-primary">Grading scheme</h2>
      <p className="mt-2 text-foreground/75">
        How the final mark is split. Categories scored from <em>the register</em> fill themselves
        in from attendance; the rest hold marked work.
      </p>

      <GradingSchemeEditor classId={classId} initial={scheme} />

      <h2 className="mt-16 font-display text-3xl text-primary">Work</h2>
      <p className="mt-2 text-foreground/75">
        Each piece of work sits in a category. Within a category, marks are combined by points —
        an item out of 100 counts five times as much as one out of 20.
      </p>

      {categories.length === 0 ? (
        <p className="mt-6 text-muted-foreground">Add a category above first.</p>
      ) : (
        <div className="mt-6 space-y-8">
          {categories.map((category) => {
            const items = assignments.filter((a) => a.grade_category_id === category.id);
            const isAttendance = category.source === "attendance";

            return (
              <section key={category.id}>
                <div className="flex flex-wrap items-center gap-3">
                  <h3 className="font-display text-2xl text-primary">{category.name}</h3>
                  <Badge variant="secondary">{Number(category.weight)}%</Badge>
                  {isAttendance ? <Badge variant="outline">From the register</Badge> : null}
                </div>

                {isAttendance ? (
                  <p className="mt-3 text-sm text-muted-foreground">
                    Computed from attendance — no items to add.{" "}
                    <Link
                      href={`/gradebook/${classId}/attendance`}
                      className="text-primary underline-offset-4 hover:underline"
                    >
                      Take the register
                    </Link>
                    .
                  </p>
                ) : (
                  <div className="mt-4 overflow-hidden rounded-lg border border-border bg-card shadow-card">
                    {items.length > 0 ? (
                      <ul className="divide-y divide-border/60">
                        {items.map((item) => (
                          <li key={item.id} className="flex flex-wrap items-end gap-3 p-4">
                            {/* Each row is its own form so one item can be edited
                                without touching the others. */}
                            <form
                              action={updateAssignment}
                              className="flex flex-1 flex-wrap items-end gap-3"
                            >
                              <input type="hidden" name="classId" value={classId} />
                              <input type="hidden" name="assignmentId" value={item.id} />

                              <div className="min-w-[12rem] flex-1 space-y-1.5">
                                <label className="text-xs uppercase tracking-wider text-muted-foreground">
                                  Name
                                </label>
                                <Input name="name" defaultValue={item.name} />
                              </div>

                              <div className="w-24 space-y-1.5">
                                <label className="text-xs uppercase tracking-wider text-muted-foreground">
                                  Out of
                                </label>
                                <Input
                                  name="maxScore"
                                  type="number"
                                  min={1}
                                  step="any"
                                  defaultValue={Number(item.max_score)}
                                  className="lining-nums tabular-nums"
                                />
                              </div>

                              <div className="w-40 space-y-1.5">
                                <label className="text-xs uppercase tracking-wider text-muted-foreground">
                                  Due
                                </label>
                                <Input
                                  name="dueDate"
                                  type="date"
                                  defaultValue={item.due_date ?? ""}
                                />
                              </div>

                              <label className="flex h-9 items-center gap-2 text-sm">
                                <input
                                  type="checkbox"
                                  name="isPublished"
                                  defaultChecked={item.is_published}
                                  className="accent-primary"
                                />
                                Visible to students
                              </label>

                              <Button type="submit" variant="outline" size="sm">
                                Save
                              </Button>
                            </form>

                            <form action={deleteAssignment}>
                              <input type="hidden" name="classId" value={classId} />
                              <input type="hidden" name="assignmentId" value={item.id} />
                              <Button
                                type="submit"
                                variant="ghost"
                                size="icon"
                                aria-label={`Delete ${item.name}`}
                                title="Deletes this item and every mark against it"
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </form>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="px-4 py-5 text-sm text-muted-foreground">
                        Nothing here yet. Until this category has work in it, its{" "}
                        {Number(category.weight)}% is left out of everyone&apos;s grade.
                      </p>
                    )}

                    <form
                      action={createAssignment}
                      className="flex flex-wrap items-end gap-3 border-t border-border bg-secondary/40 p-4"
                    >
                      <input type="hidden" name="classId" value={classId} />
                      <input type="hidden" name="categoryId" value={category.id} />

                      <div className="min-w-[12rem] flex-1 space-y-1.5">
                        <label className="text-xs uppercase tracking-wider text-muted-foreground">
                          New item
                        </label>
                        <Input name="name" placeholder={`${category.name} 1`} required />
                      </div>

                      <div className="w-24 space-y-1.5">
                        <label className="text-xs uppercase tracking-wider text-muted-foreground">
                          Out of
                        </label>
                        <Input
                          name="maxScore"
                          type="number"
                          min={1}
                          step="any"
                          defaultValue={100}
                          required
                          className="lining-nums tabular-nums"
                        />
                      </div>

                      <div className="w-40 space-y-1.5">
                        <label className="text-xs uppercase tracking-wider text-muted-foreground">
                          Due
                        </label>
                        <Input name="dueDate" type="date" />
                      </div>

                      <label className="flex h-9 items-center gap-2 text-sm">
                        <input type="checkbox" name="isPublished" className="accent-primary" />
                        Visible to students
                      </label>

                      <Button type="submit" className="bg-primary hover:bg-primary-deep">
                        Add
                      </Button>
                    </form>
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
