export interface OperationalStateResponse {
  version: number;
  data: unknown;
}

export class OperationalStateError extends Error {
  status?: number;
  retryable: boolean;
  authenticationFailed: boolean;

  constructor(
    message: string,
    options: {
      status?: number;
      retryable?: boolean;
      authenticationFailed?: boolean;
    } = {},
  ) {
    super(message);
    this.name = "OperationalStateError";
    this.status = options.status;
    this.retryable = options.retryable ?? false;
    this.authenticationFailed = options.authenticationFailed ?? false;
  }
}

const responseMessage = (value: unknown) => {
  if (
    value &&
    typeof value === "object" &&
    "message" in value &&
    typeof value.message === "string" &&
    value.message.trim()
  )
    return value.message.trim();
  return "";
};

const wait = (milliseconds: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Permintaan dibatalkan", "AbortError"));
      return;
    }
    const aborted = () => {
      globalThis.clearTimeout(timer);
      reject(new DOMException("Permintaan dibatalkan", "AbortError"));
    };
    const timer = globalThis.setTimeout(() => {
      signal?.removeEventListener("abort", aborted);
      resolve();
    }, milliseconds);
    signal?.addEventListener("abort", aborted, { once: true });
  });

export async function fetchOperationalState({
  token,
  signal,
  attempts = 2,
  timeoutMs = 25_000,
  fetcher = fetch,
}: {
  token: string;
  signal?: AbortSignal;
  attempts?: number;
  timeoutMs?: number;
  fetcher?: typeof fetch;
}): Promise<OperationalStateResponse> {
  let lastError: OperationalStateError | null = null;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const controller = new AbortController();
    const abortFromParent = () => controller.abort();
    signal?.addEventListener("abort", abortFromParent, { once: true });
    const timeout = globalThis.setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetcher("/api/state", {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      });
      const result: unknown = await response.json().catch(() => null);

      if (response.status === 401 || response.status === 403)
        throw new OperationalStateError(
          responseMessage(result) ||
            "Sesi tidak dapat diverifikasi. Silakan masuk kembali.",
          { status: response.status, authenticationFailed: true },
        );

      if (!response.ok) {
        const retryable =
          response.status === 408 ||
          response.status === 425 ||
          response.status === 429 ||
          response.status >= 500;
        throw new OperationalStateError(
          responseMessage(result) ||
            "Server belum dapat memuat data operasional.",
          { status: response.status, retryable },
        );
      }

      if (
        !result ||
        typeof result !== "object" ||
        !("version" in result) ||
        !Number.isFinite(Number(result.version)) ||
        !("data" in result)
      )
        throw new OperationalStateError(
          "Respons data operasional dari server tidak lengkap.",
          { retryable: true },
        );

      return {
        version: Number(result.version),
        data: result.data,
      };
    } catch (caught) {
      if (signal?.aborted) throw caught;
      if (caught instanceof OperationalStateError) lastError = caught;
      else if (caught instanceof DOMException && caught.name === "AbortError")
        lastError = new OperationalStateError(
          "Server terlalu lama merespons saat memuat data operasional.",
          { retryable: true },
        );
      else
        lastError = new OperationalStateError(
          "Koneksi ke server terputus saat memuat data operasional.",
          { retryable: true },
        );
    } finally {
      globalThis.clearTimeout(timeout);
      signal?.removeEventListener("abort", abortFromParent);
    }

    if (!lastError.retryable || attempt === attempts - 1) throw lastError;
    await wait(600 * (attempt + 1), signal);
  }

  throw lastError || new OperationalStateError("Data operasional gagal dimuat.");
}
