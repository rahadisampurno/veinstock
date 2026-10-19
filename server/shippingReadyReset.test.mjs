import { describe, expect, it } from "vitest";
import { archiveReadyShipments } from "./shippingReadyReset.mjs";

describe("reset antrean Siap Diangkut", () => {
  it("mengarsipkan ready dan pending packing tanpa mengubah batch atau paket selesai", () => {
    const handedOver = {
      id: "ship-completed",
      trackingNumber: "DONE-001",
      status: "handed_over",
      handoverBatchCode: "KRM-001",
      handedOverAt: "2026-10-18T08:00:00.000Z",
    };
    const scanned = {
      id: "ship-scanned",
      trackingNumber: "SCAN-001",
      status: "handover_scanned",
      handoverBatchCode: "KRM-002",
    };
    const cancelled = {
      id: "ship-cancelled",
      trackingNumber: "CANCEL-001",
      status: "cancelled",
      cancelReason: "Data lama",
    };
    const state = {
      shipments: [
        {
          id: "ship-ready-1",
          trackingNumber: "READY-001",
          status: "ready",
          locationId: "loc-owner",
        },
        {
          id: "ship-ready-2",
          trackingNumber: "READY-002",
          status: "pending_packing",
          locationId: "loc-outlet",
          handoverBatchCode: "stale-batch",
        },
        handedOver,
        scanned,
        cancelled,
      ],
      shipmentHandovers: [
        { batchCode: "KRM-001", status: "completed" },
        { batchCode: "KRM-002", status: "draft" },
      ],
      sales: [{ id: "sale-1", total: 100_000 }],
    };
    const protectedData = structuredClone({
      handedOver,
      scanned,
      cancelled,
      shipmentHandovers: state.shipmentHandovers,
      sales: state.sales,
    });
    const archivedAt = "2026-10-19T01:00:00.000Z";
    const reason = "Reset operasional Menengs";

    const shipmentIds = archiveReadyShipments(state, {
      archivedAt,
      cancelReason: reason,
    });

    expect(shipmentIds).toEqual(["ship-ready-1", "ship-ready-2"]);
    expect(state.shipments.slice(0, 2)).toEqual([
      expect.objectContaining({
        id: "ship-ready-1",
        status: "cancelled",
        cancelledAt: archivedAt,
        cancelledBy: "system-client-reset",
        cancelReason: reason,
      }),
      expect.objectContaining({
        id: "ship-ready-2",
        status: "cancelled",
        cancelledAt: archivedAt,
        cancelledBy: "system-client-reset",
        cancelReason: reason,
      }),
    ]);
    expect(state.shipments[1].handoverBatchCode).toBeUndefined();
    expect({
      handedOver: state.shipments[2],
      scanned: state.shipments[3],
      cancelled: state.shipments[4],
      shipmentHandovers: state.shipmentHandovers,
      sales: state.sales,
    }).toEqual(protectedData);
  });

  it("aman dijalankan ketika tidak ada paket ready atau pending packing", () => {
    const state = {
      shipments: [{ id: "ship-1", status: "handover_scanned" }],
    };
    const before = structuredClone(state);

    expect(
      archiveReadyShipments(state, {
        archivedAt: "2026-10-19T01:00:00.000Z",
        cancelReason: "Reset operasional Menengs",
      }),
    ).toEqual([]);
    expect(state).toEqual(before);
  });
});
