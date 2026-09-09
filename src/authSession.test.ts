import { describe, expect, it } from "vitest";
import {
  parseLoginPayload,
  parseStoredAuthSession,
  selectStoredAuthSession,
} from "./authSession";

const validPayload = {
  token: "signed-token",
  user: {
    id: "u-owner",
    name: "Owner Menengs",
    email: "owner@meneng.id",
    role: "owner",
    active: true,
    organizationId: "org-meneng",
    organizationName: "Menengs",
  },
};

describe("authentication session validation", () => {
  it("accepts a complete login response", () => {
    expect(parseLoginPayload(validPayload)).toEqual(validPayload);
  });

  it("rejects a successful HTTP response without a token or user", () => {
    expect(() => parseLoginPayload({ message: "HTML fallback" })).toThrow(
      /respons login dari server tidak lengkap/i,
    );
  });

  it("does not treat malformed saved data as an authenticated session", () => {
    expect(parseStoredAuthSession('{"remember":false}')).toBeNull();
  });

  it("falls back to a valid persistent session when the current one is corrupt", () => {
    expect(
      selectStoredAuthSession("not-json", JSON.stringify(validPayload)),
    ).toMatchObject(validPayload);
  });
});
