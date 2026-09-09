import type { SessionUser } from "./types";

export const savedSessionKey = "veinstock_saved_session";

export interface AuthSession {
  user: SessionUser;
  token: string;
  remember?: boolean;
}

const roles = new Set([
  "owner",
  "pic",
  "finance",
  "admin",
  "warehouse",
  "cashier",
  "employee",
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const isSessionUser = (value: unknown): value is SessionUser =>
  isRecord(value) &&
  isNonEmptyString(value.id) &&
  isNonEmptyString(value.name) &&
  isNonEmptyString(value.email) &&
  isNonEmptyString(value.role) &&
  roles.has(value.role) &&
  isNonEmptyString(value.organizationId) &&
  isNonEmptyString(value.organizationName) &&
  typeof value.active === "boolean";

export const parseLoginPayload = (value: unknown): AuthSession => {
  if (
    !isRecord(value) ||
    !isSessionUser(value.user) ||
    !isNonEmptyString(value.token)
  )
    throw new Error(
      "Respons login dari server tidak lengkap. Silakan coba lagi.",
    );

  return { user: value.user, token: value.token };
};

export const parseStoredAuthSession = (raw: string | null): AuthSession | null => {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    const session = parseLoginPayload(value);
    return {
      ...session,
      remember: isRecord(value) && value.remember === true,
    };
  } catch {
    return null;
  }
};

export const selectStoredAuthSession = (
  ...values: Array<string | null>
): AuthSession | null => {
  for (const value of values) {
    const session = parseStoredAuthSession(value);
    if (session) return session;
  }
  return null;
};

export const readStoredAuthSession = (): AuthSession | null => {
  let current: string | null = null;
  let saved: string | null = null;
  try {
    current = window.sessionStorage.getItem(savedSessionKey);
  } catch {
    // Browser dapat memblokir sessionStorage; coba penyimpanan persisten.
  }
  try {
    saved = window.localStorage.getItem(savedSessionKey);
  } catch {
    // Login tetap dapat menampilkan pesan kegagalan jika storage diblokir.
  }
  return selectStoredAuthSession(current, saved);
};
