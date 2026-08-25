import { describe, expect, it } from "vitest";
import {
  buildPackingEvidence,
  isPackingEvidenceExpired,
  packingEvidenceDeletionDue,
  packingEvidenceExpiresAt,
  publicPackingEvidence,
  resolvePackingEvidence,
} from "./shippingEvidence.mjs";

describe("siklus bukti foto packing", () => {
  const capturedAt = "2026-08-24T06:00:00.000Z";
  const evidence = buildPackingEvidence({
    id: "ev-1",
    capturedAt,
    capturedBy: "u-1",
    upload: {
      assetId: "asset-secret",
      publicId: "menengs/org/shipping/ev-1",
      version: 7,
      bytes: 204800,
      width: 1400,
      height: 1050,
      format: "webp",
    },
  });

  it("menetapkan masa retensi tepat 30 hari", () => {
    expect(packingEvidenceExpiresAt(capturedAt)).toBe(
      "2026-09-23T06:00:00.000Z",
    );
    expect(
      isPackingEvidenceExpired(evidence, "2026-09-23T05:59:59.999Z"),
    ).toBe(false);
    expect(
      isPackingEvidenceExpired(evidence, "2026-09-23T06:00:00.000Z"),
    ).toBe(true);
  });

  it("tidak pernah mengirim identifier penyimpanan ke frontend", () => {
    const visible = publicPackingEvidence(evidence, "2026-08-25T00:00:00Z");
    expect(visible.available).toBe(true);
    expect(visible.status).toBe("available");
    expect(visible.provider).toBeUndefined();
    expect(JSON.stringify(visible)).not.toContain("asset-secret");
  });

  it("menyembunyikan foto tepat saat kedaluwarsa meskipun job belum berjalan", () => {
    const visible = publicPackingEvidence(evidence, evidence.expiresAt);
    expect(visible).toMatchObject({ status: "resolved", available: false });
    expect(packingEvidenceDeletionDue(evidence, evidence.expiresAt)).toBe(true);
  });

  it("mempertahankan metadata audit setelah aset berhasil dihapus", () => {
    const resolved = resolvePackingEvidence(
      evidence,
      "2026-09-23T06:05:00.000Z",
    );
    expect(resolved).toMatchObject({
      id: "ev-1",
      status: "resolved",
      deletedAt: "2026-09-23T06:05:00.000Z",
      deletionReason: "retention_30_days",
    });
    expect(resolved.provider).toBeUndefined();
  });
});
