import type { User } from "@prisma/client";

/** Full Prisma User with schema defaults; the one place to update when User gains a column. */
export function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Default User",
    email: "default@example.com",
    avatarUrl: null,
    discordId: null,
    role: "MEMBER",
    primaryColor: null,
    secondaryColor: null,
    foregroundColor: null,
    cardBackgroundColor: null,
    backgroundMode: "NONE",
    backgroundColor: null,
    backgroundImageUrl: null,
    backgroundImageStyle: "STRETCH",
    backgroundPatternScale: 100,
    backgroundImageOpacity: 45,
    pomodoroWorkMin: 25,
    pomodoroShortBreakMin: 5,
    pomodoroLongBreakMin: 15,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}
