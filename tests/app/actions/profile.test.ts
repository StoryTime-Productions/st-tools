import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = process.env;

function buildSupabaseClient() {
  const upload = vi.fn();
  const getPublicUrl = vi.fn();

  return {
    auth: {
      getUser: vi.fn(),
    },
    storage: {
      from: vi.fn(() => ({
        upload,
        getPublicUrl,
      })),
    },
    __upload: upload,
    __getPublicUrl: getPublicUrl,
  };
}

async function loadProfileModule() {
  const revalidatePath = vi.fn();
  const createClient = vi.fn();
  const update = vi.fn();

  vi.doMock("next/cache", () => ({ revalidatePath }));
  vi.doMock("@/lib/supabase/server", () => ({ createClient }));
  vi.doMock("@/lib/prisma", () => ({
    prisma: {
      user: {
        update,
      },
    },
  }));

  const profileModule = await import("@/app/actions/profile");

  return {
    ...profileModule,
    revalidatePath,
    createClient,
    update,
  };
}

describe("profile actions", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env = { ...ORIGINAL_ENV };
    vi.spyOn(Date, "now").mockReturnValue(1_710_000_000_000);
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
    vi.restoreAllMocks();
  });

  it("updates profile name for authenticated users", async () => {
    const { updateProfileAction, createClient, update, revalidatePath } = await loadProfileModule();
    const supabase = buildSupabaseClient();

    supabase.auth.getUser.mockResolvedValue({
      data: {
        user: {
          id: "11111111-1111-4111-8111-111111111111",
        },
      },
    });

    createClient.mockResolvedValue(supabase);

    await expect(updateProfileAction({ name: "New Name" })).resolves.toEqual({ success: true });

    expect(update).toHaveBeenCalledWith({
      where: { id: "11111111-1111-4111-8111-111111111111" },
      data: { name: "New Name" },
    });
    expect(revalidatePath).toHaveBeenCalledWith("/settings/profile");
  });

  it("returns auth and validation errors for profile updates", async () => {
    const { updateProfileAction, createClient } = await loadProfileModule();

    await expect(updateProfileAction({ name: "" })).resolves.toEqual({
      error: "Name is required",
    });

    const supabase = buildSupabaseClient();
    supabase.auth.getUser.mockResolvedValue({ data: { user: null } });
    createClient.mockResolvedValue(supabase);

    await expect(updateProfileAction({ name: "Valid" })).resolves.toEqual({
      error: "Not authenticated",
    });
  });

  it("validates avatar uploads and handles successful upload", async () => {
    const { updateAvatarAction, createClient, update, revalidatePath } = await loadProfileModule();
    const supabase = buildSupabaseClient();

    supabase.auth.getUser.mockResolvedValue({
      data: {
        user: {
          id: "11111111-1111-4111-8111-111111111111",
        },
      },
    });

    createClient.mockResolvedValue(supabase);

    const emptyData = new FormData();
    await expect(updateAvatarAction(emptyData)).resolves.toEqual({ error: "No file provided" });

    const badTypeData = new FormData();
    badTypeData.set("avatar", new File(["txt"], "note.txt", { type: "text/plain" }));
    await expect(updateAvatarAction(badTypeData)).resolves.toEqual({
      error: "Only JPEG, PNG, WebP and GIF images are allowed",
    });

    const largeFileData = new FormData();
    largeFileData.set(
      "avatar",
      new File([new Uint8Array(5 * 1024 * 1024 + 1)], "large.png", { type: "image/png" })
    );
    await expect(updateAvatarAction(largeFileData)).resolves.toEqual({
      error: "File must be smaller than 5 MB",
    });

    const uploadFailData = new FormData();
    uploadFailData.set(
      "avatar",
      new File([new Uint8Array(8)], "avatar.png", { type: "image/png" })
    );
    supabase.__upload.mockResolvedValueOnce({ error: { message: "Storage failure" } });
    await expect(updateAvatarAction(uploadFailData)).resolves.toEqual({ error: "Storage failure" });

    const successData = new FormData();
    successData.set("avatar", new File([new Uint8Array(8)], "avatar.png", { type: "image/png" }));
    supabase.__upload.mockResolvedValueOnce({ error: null });
    supabase.__getPublicUrl.mockReturnValueOnce({
      data: { publicUrl: "https://example.com/avatar.png" },
    });

    await expect(updateAvatarAction(successData)).resolves.toEqual({ success: true });

    expect(update).toHaveBeenCalledWith({
      where: { id: "11111111-1111-4111-8111-111111111111" },
      data: { avatarUrl: "https://example.com/avatar.png?v=1710000000000" },
    });
    expect(revalidatePath).toHaveBeenCalledWith("/settings/profile");
  });
});
