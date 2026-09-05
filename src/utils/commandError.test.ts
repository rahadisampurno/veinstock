import { describe, expect, it } from "vitest";
import { commandErrorMessage } from "./commandError";

describe("command error messages", () => {
  it("keeps a specific server validation message", () => {
    expect(commandErrorMessage(400, "SKU sudah digunakan")).toBe(
      "SKU sudah digunakan",
    );
  });

  it("returns an actionable message when a gateway response is not JSON", () => {
    expect(commandErrorMessage(504)).toMatch(/server sedang sibuk/i);
    expect(commandErrorMessage(504)).toMatch(/data belum berubah/i);
  });

  it("explains stale writes and expired sessions", () => {
    expect(commandErrorMessage(409)).toMatch(/perangkat lain/i);
    expect(commandErrorMessage(401)).toMatch(/masuk kembali/i);
  });
});
