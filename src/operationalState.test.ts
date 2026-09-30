import { describe, expect, it, vi } from "vitest";
import { fetchOperationalState } from "./operationalState";

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

describe("operational state loading", () => {
  it("automatically recovers from a transient server failure", async () => {
    vi.useFakeTimers();
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(503, { message: "Database sibuk" }))
      .mockResolvedValueOnce(jsonResponse(200, { version: 7, data: { products: [] } }));

    const resultPromise = fetchOperationalState({
      token: "token",
      fetcher,
      timeoutMs: 10_000,
    });
    const expectation = expect(resultPromise).resolves.toEqual({
      version: 7,
      data: { products: [] },
    });
    await vi.advanceTimersByTimeAsync(600);

    await expectation;
    expect(fetcher).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("retries when the first state request times out", async () => {
    vi.useFakeTimers();
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementationOnce((_input, options) =>
        new Promise((_resolve, reject) => {
          options?.signal?.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true },
          );
        }),
      )
      .mockResolvedValueOnce(jsonResponse(200, { version: 8, data: {} }));

    const resultPromise = fetchOperationalState({
      token: "token",
      fetcher,
      timeoutMs: 1_000,
    });
    const expectation = expect(resultPromise).resolves.toMatchObject({
      version: 8,
    });
    await vi.advanceTimersByTimeAsync(1_600);

    await expectation;
    expect(fetcher).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("does not retry an expired session", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse(401, { message: "Sesi telah berakhir" }));

    await expect(
      fetchOperationalState({ token: "expired", fetcher }),
    ).rejects.toMatchObject({
      authenticationFailed: true,
      retryable: false,
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("rejects a successful but incomplete response instead of opening empty data", async () => {
    vi.useFakeTimers();
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse(200, { message: "HTML fallback" }));
    const resultPromise = fetchOperationalState({ token: "token", fetcher });
    const expectation = expect(resultPromise).rejects.toThrow(/tidak lengkap/i);
    await vi.advanceTimersByTimeAsync(600);

    await expectation;
    expect(fetcher).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});
