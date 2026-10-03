import { beforeEach, describe, expect, it, vi } from "vitest";

const HANGOUT_ID = "11111111-1111-4111-8111-111111111111";

async function load() {
  const prisma = {
    user: { findUnique: vi.fn().mockResolvedValue({ id: "u1" }) },
    hangout: { findUnique: vi.fn().mockResolvedValue({ title: "Movie night" }) },
    hangoutIdea: { create: vi.fn() },
  };
  const applyAttendance = vi.fn().mockResolvedValue(null);
  const refreshAnnouncement = vi.fn();
  const postToChannel = vi.fn();
  const revalidatePath = vi.fn();
  vi.doMock("@/lib/prisma", () => ({ prisma }));
  vi.doMock("@/lib/attendance", async () => ({
    ...(await vi.importActual<typeof import("@/lib/attendance")>("@/lib/attendance")),
    applyAttendance,
  }));
  vi.doMock("@/lib/hangout-discord", () => ({
    refreshAnnouncement,
    siteUrl: async () => "https://tools.test",
  }));
  vi.doMock("@/lib/discord", () => ({ postToChannel }));
  vi.doMock("next/cache", () => ({ revalidatePath }));
  const attendance = await import("@/app/api/bot/attendance/route");
  const ideas = await import("@/app/api/bot/ideas/route");
  return {
    attendance,
    ideas,
    prisma,
    applyAttendance,
    refreshAnnouncement,
    postToChannel,
    revalidatePath,
  };
}

function post(body: unknown, auth: string | null = "Bearer s3cret") {
  return new Request("https://tools.test/api/bot/x", {
    method: "POST",
    headers: auth ? { authorization: auth } : {},
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const CLICK = { hangoutId: HANGOUT_ID, discordId: "123", status: "going" };
const IDEA = { title: " Bowling ", details: "", discordId: "123", name: "Dana" };

describe("bot API", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.stubEnv("BOT_API_SECRET", "s3cret");
    vi.stubEnv("DISCORD_IDEAS_CHANNEL_ID", "ideas-1");
  });

  it("rejects missing, wrong or unconfigured secrets with 401 before touching anything", async () => {
    const mod = await load();

    for (const auth of [null, "Bearer nope", "s3cret", "Bearer s3cret-and-more"]) {
      expect((await mod.attendance.POST(post(CLICK, auth))).status).toBe(401);
      expect((await mod.ideas.POST(post(IDEA, auth))).status).toBe(401);
    }
    vi.stubEnv("BOT_API_SECRET", "");
    expect((await mod.attendance.POST(post(CLICK, "Bearer "))).status).toBe(401);
    expect(mod.prisma.user.findUnique).not.toHaveBeenCalled();
    expect(mod.prisma.hangoutIdea.create).not.toHaveBeenCalled();
  });

  it("rejects malformed bodies with 400", async () => {
    const mod = await load();

    expect((await mod.attendance.POST(post("not json"))).status).toBe(400);
    expect((await mod.attendance.POST(post({ ...CLICK, status: "sure" }))).status).toBe(400);
    expect((await mod.ideas.POST(post({ ...IDEA, title: " " }))).status).toBe(400);
    expect((await mod.ideas.POST(post({ ...IDEA, discordId: "abc" }))).status).toBe(400);
  });

  it("answers an unlinked clicker with the connect embed and changes nothing", async () => {
    const mod = await load();
    mod.prisma.user.findUnique.mockResolvedValue(null);

    const body = await (await mod.attendance.POST(post(CLICK))).json();

    expect(body.ok).toBe(false);
    expect(body.message.embeds[0].title).toBe("Connect Discord first");
    expect(body.message.components[0].components[0].url).toBe(
      "https://tools.test/settings/profile"
    );
    expect(mod.applyAttendance).not.toHaveBeenCalled();
  });

  it("404s an unknown hangout", async () => {
    const mod = await load();
    mod.prisma.hangout.findUnique.mockResolvedValue(null);

    expect((await mod.attendance.POST(post(CLICK))).status).toBe(404);
  });

  it("saves the answer, refreshes the opener and confirms", async () => {
    const mod = await load();

    const body = await (await mod.attendance.POST(post({ ...CLICK, status: "not_going" }))).json();

    expect(mod.applyAttendance).toHaveBeenCalledWith(HANGOUT_ID, "u1", "NOT_GOING");
    expect(mod.refreshAnnouncement).toHaveBeenCalledWith(HANGOUT_ID);
    expect(mod.revalidatePath).toHaveBeenCalledWith(`/hub/hangouts/${HANGOUT_ID}`);
    expect(body.ok).toBe(true);
    expect(body.message.embeds[0].title).toBe("You're not going");
  });

  it("tells the clicker attendance is not open yet, or already over", async () => {
    const mod = await load();

    mod.applyAttendance.mockResolvedValueOnce("Hangout is not scheduled");
    const early = await (await mod.attendance.POST(post(CLICK))).json();
    expect(early.ok).toBe(false);
    expect(early.message.embeds[0].title).toBe("Not open yet");
    expect(early.message.components[0].components[0]).toMatchObject({
      label: "Fill in availability",
      url: `https://tools.test/hub/hangouts/${HANGOUT_ID}#availability`,
    });

    mod.applyAttendance.mockResolvedValueOnce("This hangout has already ended");
    const late = await (await mod.attendance.POST(post(CLICK))).json();
    expect(late.message.embeds[0].title).toBe("Too late");
    expect(late.message.embeds[0].description).toBe("This hangout has already ended.");

    mod.applyAttendance.mockResolvedValueOnce("Something else");
    const other = await (await mod.attendance.POST(post(CLICK))).json();
    expect(other.message.embeds[0].description).toBe("Something else");
    expect(mod.refreshAnnouncement).not.toHaveBeenCalled();
  });

  it("stores an idea, posts it once to the ideas channel and replies", async () => {
    const mod = await load();

    const body = await (await mod.ideas.POST(post(IDEA))).json();

    expect(mod.prisma.hangoutIdea.create).toHaveBeenCalledWith({
      data: { title: "Bowling", details: null, proposerDiscordId: "123", proposerName: "Dana" },
    });
    expect(mod.postToChannel).toHaveBeenCalledTimes(1);
    expect(mod.postToChannel.mock.calls[0][0]).toBe("ideas-1");
    expect(mod.revalidatePath).toHaveBeenCalledWith("/hub/ideas");
    expect(body.ok).toBe(true);
    expect(body.message.embeds[0].title).toBe("Bowling");
  });

  it("still stores and replies when no ideas channel is configured", async () => {
    vi.stubEnv("DISCORD_IDEAS_CHANNEL_ID", "");
    const mod = await load();

    expect((await mod.ideas.POST(post(IDEA))).status).toBe(200);
    expect(mod.postToChannel).not.toHaveBeenCalled();
  });
});
