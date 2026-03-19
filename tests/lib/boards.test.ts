import { describe, expect, it } from "vitest";
import {
  getAccessibleBoardWhere,
  getManageableBoardWhere,
  getUserDisplayName,
  sortUsersByDisplayName,
} from "@/lib/boards";

describe("boards helpers", () => {
  it("returns unrestricted where clause for admin access", () => {
    expect(getAccessibleBoardWhere({ id: "u-1", role: "ADMIN" })).toEqual({});
    expect(getManageableBoardWhere({ id: "u-1", role: "ADMIN" })).toEqual({});
  });

  it("returns workspace/member/owner filters for member access", () => {
    expect(getAccessibleBoardWhere({ id: "member-1", role: "MEMBER" })).toEqual({
      OR: [
        { ownerId: "member-1" },
        {
          isPersonal: false,
          isOpenToWorkspace: true,
        },
        {
          members: {
            some: {
              userId: "member-1",
            },
          },
        },
      ],
    });
  });

  it("returns owner-only manageable filter for non-admin", () => {
    expect(getManageableBoardWhere({ id: "member-1", role: "MEMBER" })).toEqual({
      ownerId: "member-1",
    });
  });

  it("sorts users by trimmed display name with email fallback", () => {
    const users = [
      { id: "3", name: null, email: "zoe@example.com" },
      { id: "1", name: "  Amy  ", email: "amy@example.com" },
      { id: "2", name: "Bob", email: "bob@example.com" },
    ];

    const sorted = sortUsersByDisplayName(users);

    expect(sorted.map((user) => user.id)).toEqual(["1", "2", "3"]);
    // Non-mutating sort helper
    expect(users.map((user) => user.id)).toEqual(["3", "1", "2"]);
  });

  it("returns display name with email fallback", () => {
    expect(getUserDisplayName({ name: "  Jane  ", email: "jane@example.com" })).toBe("Jane");
    expect(getUserDisplayName({ name: null, email: "jane@example.com" })).toBe("jane@example.com");
  });
});
