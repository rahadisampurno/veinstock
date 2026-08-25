export const PACKING_EVIDENCE_RETENTION_DAYS = 30;
export const PACKING_EVIDENCE_RETENTION_MS =
  PACKING_EVIDENCE_RETENTION_DAYS * 24 * 60 * 60 * 1000;

const validDate = (value) => {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
};

export const packingEvidenceExpiresAt = (capturedAt) => {
  const captured = validDate(capturedAt);
  if (!captured) throw new Error("Waktu pengambilan bukti packing tidak valid");
  return new Date(captured.getTime() + PACKING_EVIDENCE_RETENTION_MS).toISOString();
};

export const isPackingEvidenceExpired = (
  evidence,
  now = new Date(),
) => {
  if (!evidence) return false;
  const expiresAt = validDate(evidence.expiresAt);
  const comparedAt = validDate(now);
  return Boolean(
    expiresAt && comparedAt && expiresAt.getTime() <= comparedAt.getTime(),
  );
};

export const buildPackingEvidence = ({
  id,
  capturedAt,
  capturedBy,
  upload,
}) => ({
  id,
  status: "available",
  capturedAt,
  capturedBy,
  expiresAt: packingEvidenceExpiresAt(capturedAt),
  bytes: Number(upload.bytes || 0),
  width: Number(upload.width || 0),
  height: Number(upload.height || 0),
  format: String(upload.format || "webp"),
  provider: {
    assetId: String(upload.assetId || ""),
    publicId: String(upload.publicId || ""),
    version: Number(upload.version || 0),
    deliveryType: "authenticated",
  },
});

export const packingEvidenceDeletionDue = (evidence, now = new Date()) =>
  Boolean(
    evidence &&
      evidence.status !== "resolved" &&
      evidence.provider?.publicId &&
      isPackingEvidenceExpired(evidence, now),
  );

export const resolvePackingEvidence = (evidence, deletedAt) => {
  if (!evidence) return undefined;
  const { provider: _provider, deletionError: _error, ...audit } = evidence;
  return {
    ...audit,
    status: "resolved",
    deletedAt: new Date(deletedAt).toISOString(),
    deletionReason: "retention_30_days",
  };
};

export const failPackingEvidenceDeletion = (evidence, attemptedAt) => ({
  ...evidence,
  status: "deletion_failed",
  deleteAttempts: Number(evidence?.deleteAttempts || 0) + 1,
  lastDeleteAttemptAt: new Date(attemptedAt).toISOString(),
});

// Identifier Cloudinary selalu menjadi data internal server. Klien hanya
// menerima status, ukuran, dan periode ketersediaan bukti.
export const publicPackingEvidence = (evidence, now = new Date()) => {
  if (!evidence) return undefined;
  const {
    provider: _provider,
    deletionError: _error,
    deleteAttempts: _attempts,
    lastDeleteAttemptAt: _lastAttempt,
    ...safe
  } = evidence;
  if (safe.status === "resolved" || isPackingEvidenceExpired(evidence, now))
    return {
      ...safe,
      status: "resolved",
      available: false,
    };
  return {
    ...safe,
    status: "available",
    available: true,
  };
};

export const publicShipmentEvidence = (shipment, now = new Date()) => ({
  ...shipment,
  packingEvidence: publicPackingEvidence(shipment?.packingEvidence, now),
});
