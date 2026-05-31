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
  const findUnique = vi.fn();

  vi.doMock("next/cache", () => ({ revalidatePath }));
  vi.doMock("@/lib/supabase/server", () => ({ createClient }));
  vi.doMock("@/lib/prisma", () => ({
    prisma: {
      user: {
        update,
        findUnique,
      },
    },
  }));

  const profileModule = await import("@/app/actions/profile");

  return {
    ...profileModule,
    revalidatePath,
    createClient,
    update,
    findUnique,
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

  it("updates appearance settings for color mode", async () => {
    const { updateAppearanceAction, createClient, update, findUnique, revalidatePath } =
      await loadProfileModule();
    const supabase = buildSupabaseClient();

    supabase.auth.getUser.mockResolvedValue({
      data: {
        user: {
          id: "11111111-1111-4111-8111-111111111111",
        },
      },
    });

    createClient.mockResolvedValue(supabase);
    findUnique.mockResolvedValueOnce({ backgroundImageUrl: null });

    const formData = new FormData();
    formData.set("primaryColor", "#123456");
    formData.set("secondaryColor", "#abcdef");
    formData.set("backgroundMode", "COLOR");
    formData.set("backgroundImageStyle", "PATTERN");
    formData.set("backgroundPatternScale", "140");
    formData.set("backgroundColor", "#112233");
    formData.set("backgroundImageOpacity", "65");
    formData.set("removeBackgroundImage", "false");

    await expect(updateAppearanceAction(formData)).resolves.toEqual({ success: true });

    expect(update).toHaveBeenCalledWith({
      where: { id: "11111111-1111-4111-8111-111111111111" },
      data: {
        primaryColor: "#123456",
        secondaryColor: "#abcdef",
        backgroundMode: "COLOR",
        backgroundImageStyle: "PATTERN",
        backgroundPatternScale: 140,
        backgroundColor: "#112233",
        backgroundImageUrl: null,
        backgroundImageOpacity: 65,
      },
    });

    expect(revalidatePath).toHaveBeenCalledWith("/settings/profile");
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard");
    expect(revalidatePath).toHaveBeenCalledWith("/boards");
    expect(revalidatePath).toHaveBeenCalledWith("/admin/members");
  });

  it("validates image mode appearance updates", async () => {
    const { updateAppearanceAction, createClient, findUnique } = await loadProfileModule();
    const supabase = buildSupabaseClient();

    supabase.auth.getUser.mockResolvedValue({
      data: {
        user: {
          id: "11111111-1111-4111-8111-111111111111",
        },
      },
    });

    createClient.mockResolvedValue(supabase);
    findUnique.mockResolvedValueOnce({ backgroundImageUrl: null });

    const missingImageData = new FormData();
    missingImageData.set("primaryColor", "#123456");
    missingImageData.set("secondaryColor", "#abcdef");
    missingImageData.set("backgroundMode", "IMAGE");
    missingImageData.set("backgroundImageStyle", "STRETCH");
    missingImageData.set("backgroundPatternScale", "100");
    missingImageData.set("backgroundColor", "");
    missingImageData.set("backgroundImageOpacity", "50");
    missingImageData.set("removeBackgroundImage", "false");

    await expect(updateAppearanceAction(missingImageData)).resolves.toEqual({
      error: "Please upload a background image or switch to a different background mode",
    });
  });

  it("defaults appearance opacity when form value is missing", async () => {
    const { updateAppearanceAction, createClient, update, findUnique } = await loadProfileModule();
    const supabase = buildSupabaseClient();

    supabase.auth.getUser.mockResolvedValue({
      data: {
        user: {
          id: "11111111-1111-4111-8111-111111111111",
        },
      },
    });

    createClient.mockResolvedValue(supabase);
    findUnique.mockResolvedValueOnce({ backgroundImageUrl: null });

    const formData = new FormData();
    formData.set("primaryColor", "#123456");
    formData.set("secondaryColor", "#abcdef");
    formData.set("backgroundImageStyle", "STRETCH");
    formData.set("backgroundMode", "NONE");
    formData.set("backgroundColor", "");
    formData.set("removeBackgroundImage", "false");

    await expect(updateAppearanceAction(formData)).resolves.toEqual({ success: true });

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          backgroundPatternScale: 100,
          backgroundImageOpacity: 45,
        }),
      })
    );
  });
});
