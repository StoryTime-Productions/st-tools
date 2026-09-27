import "server-only";
import { createClient } from "@/lib/supabase/server";

const COVER_MIME = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_COVER_BYTES = 5 * 1024 * 1024;

export async function uploadCover(
  file: FormDataEntryValue | null,
  path: string
): Promise<{ error: string } | { url: string }> {
  if (!(file instanceof File) || file.size === 0) return { error: "No file provided" };
  if (!COVER_MIME.includes(file.type)) {
    return { error: "Only JPEG, PNG, WebP and GIF images are allowed" };
  }
  if (file.size > MAX_COVER_BYTES) return { error: "File must be smaller than 5 MB" };

  const extension = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const fullPath = `${path}.${extension}`;
  const supabase = await createClient();
  const { error } = await supabase.storage
    .from("avatars")
    .upload(fullPath, await file.arrayBuffer(), { contentType: file.type, upsert: true });
  if (error) return { error: error.message };

  const {
    data: { publicUrl },
  } = supabase.storage.from("avatars").getPublicUrl(fullPath);
  return { url: `${publicUrl}?v=${Date.now()}` };
}
