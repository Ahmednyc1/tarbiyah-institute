/**
 * Public URL for an object in a public Storage bucket.
 *
 * Composed here rather than stored in the row: the host changes between
 * environments, and a saved URL would pin every photograph to whichever
 * project it was uploaded from.
 */
export function publicStorageUrl(bucket: string, path: string | null) {
  if (!path) return null;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return null;
  return `${base}/storage/v1/object/public/${bucket}/${path}`;
}

export const teacherPhotoUrl = (path: string | null) =>
  publicStorageUrl("teacher-photos", path);
