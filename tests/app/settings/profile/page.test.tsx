import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

async function loadProfileSettingsPageModule() {
  const redirect = vi.fn();
  const getCurrentUser = vi.fn();

  const avatarForm = vi.fn(() => <div data-testid="avatar-form" />);
  const profileForm = vi.fn(() => <div data-testid="profile-form" />);
  const appearanceForm = vi.fn(() => <div data-testid="appearance-form" />);
  const pomodoroPreferencesForm = vi.fn(() => <div data-testid="pomodoro-preferences-form" />);

  vi.doMock("next/navigation", () => ({ redirect }));
  vi.doMock("@/lib/get-current-user", () => ({ getCurrentUser }));
  vi.doMock("@/app/settings/profile/_components/avatar-form", () => ({ AvatarForm: avatarForm }));
  vi.doMock("@/app/settings/profile/_components/profile-form", () => ({
    ProfileForm: profileForm,
  }));
  vi.doMock("@/app/settings/profile/_components/appearance-form", () => ({
    AppearanceForm: appearanceForm,
  }));
  vi.doMock("@/app/settings/profile/_components/pomodoro-preferences-form", () => ({
    PomodoroPreferencesForm: pomodoroPreferencesForm,
  }));

  const profileSettingsModule = await import("@/app/settings/profile/page");

  return {
    ...profileSettingsModule,
    redirect,
    getCurrentUser,
    avatarForm,
    profileForm,
    appearanceForm,
    pomodoroPreferencesForm,
  };
}

describe("ProfileSettingsPage", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("redirects unauthenticated users", async () => {
    const {
      default: ProfileSettingsPage,
      getCurrentUser,
      redirect,
    } = await loadProfileSettingsPageModule();

    getCurrentUser.mockResolvedValueOnce(null);
    redirect.mockImplementationOnce(() => {
      throw new Error("REDIRECT");
    });

    await expect(ProfileSettingsPage()).rejects.toThrowError("REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/auth/sign-in");
  });

  it("renders account info and profile forms", async () => {
    const {
      default: ProfileSettingsPage,
      getCurrentUser,
      avatarForm,
      profileForm,
      appearanceForm,
      pomodoroPreferencesForm,
    } = await loadProfileSettingsPageModule();

    const user = {
      id: "11111111-1111-4111-8111-111111111111",
      name: "Nirav Patel",
      email: "nirav@example.com",
      avatarUrl: "https://example.com/avatar.png",
      role: "ADMIN",
      createdAt: new Date("2026-03-18T00:00:00.000Z"),
      primaryColor: "#123456",
      secondaryColor: "#abcdef",
      backgroundMode: "COLOR",
      backgroundColor: "#112233",
      backgroundImageUrl: null,
      backgroundImageStyle: "STRETCH",
      backgroundPatternScale: 100,
      backgroundImageOpacity: 45,
      pomodoroWorkMin: 25,
      pomodoroShortBreakMin: 5,
      pomodoroLongBreakMin: 15,
    };

    getCurrentUser.mockResolvedValueOnce(user);

    const output = await ProfileSettingsPage();
    render(output);

    expect(screen.getByText("Profile settings")).toBeInTheDocument();
    expect(screen.getByText("nirav@example.com")).toBeInTheDocument();
    expect(screen.getByText("ADMIN")).toBeInTheDocument();
    expect(screen.getByText(/2026/)).toBeInTheDocument();

    expect(avatarForm).toHaveBeenCalledWith(
      {
        avatarUrl: user.avatarUrl,
        displayName: user.name,
      },
      undefined
    );
    expect(profileForm).toHaveBeenCalledWith(
      {
        initialName: user.name,
      },
      undefined
    );
    expect(appearanceForm).toHaveBeenCalledWith(
      {
        initialPrimaryColor: user.primaryColor,
        initialSecondaryColor: user.secondaryColor,
        initialBackgroundMode: user.backgroundMode,
        initialBackgroundColor: user.backgroundColor,
        initialBackgroundImageUrl: user.backgroundImageUrl,
        initialBackgroundImageStyle: user.backgroundImageStyle,
        initialBackgroundPatternScale: user.backgroundPatternScale,
        initialBackgroundImageOpacity: user.backgroundImageOpacity,
      },
      undefined
    );

    expect(pomodoroPreferencesForm).toHaveBeenCalledWith(
      {
        initialWorkMin: user.pomodoroWorkMin,
        initialShortBreakMin: user.pomodoroShortBreakMin,
        initialLongBreakMin: user.pomodoroLongBreakMin,
      },
      undefined
    );
  });
});
