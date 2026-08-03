import { describe, expect, it } from "vitest";
import { seedData } from "../store";
import type { SessionUser } from "../types";
import { getOperationalNotifications } from "./operationalNotifications";
import { resolveUserScope } from "./rbac";

const owner: SessionUser = {
  id: "owner", name: "Owner", email: "owner@test.local", role: "owner", active: true,
  organizationId: "org-test", organizationName: "Menengs Test",
};
const pic: SessionUser = {
  id: "pic", name: "PIC Outlet", email: "pic@test.local", role: "pic", active: true,
  outletId: "loc-outlet-1", organizationId: "org-test", organizationName: "Menengs Test",
};
const mapsFor = (data = seedData) => ({
  variants: Object.fromEntries(data.products.flatMap((product) => product.variants.map((variant) => [variant.id, { ...variant, unit: product.unit, productName: product.name }]))),
  locations: Object.fromEntries(data.locations.map((location) => [location.id, location])),
});

describe("operational notifications", () => {
  it("groups a multi-variant incoming transfer into one actionable notification for the destination PIC", () => {
    const data = structuredClone(seedData);
    data.transfers = [
      { id: "trf-1720000000000-a", transferCode: "TRF-000001", fromId: "loc-owner", toId: "loc-outlet-1", variantId: "v-balado", quantity: 4, status: "sent", createdAt: new Date().toISOString() },
      { id: "trf-1720000000000-b", transferCode: "TRF-000001", fromId: "loc-owner", toId: "loc-outlet-1", variantId: "v-keju", quantity: 6, status: "sent", createdAt: new Date().toISOString() },
    ];

    const notifications = getOperationalNotifications(data, mapsFor(data).variants, mapsFor(data).locations, resolveUserScope(pic));
    const transferAlerts = notifications.filter((item) => item.tone === "info");

    expect(transferAlerts).toHaveLength(1);
    expect(transferAlerts[0]).toMatchObject({ title: "Transfer TRF-000001 menunggu penerimaan", action: "open-transfer-inbox", actionLabel: "Buka transfer" });
    expect(transferAlerts[0].detail).toContain("2 varian / 10 item");
  });

  it("does not expose transfer or low-stock alerts from other locations to a PIC", () => {
    const data = structuredClone(seedData);
    data.locations.push({ id: "loc-other", name: "Outlet Lain", type: "outlet", active: true });
    data.balances.push({ locationId: "loc-other", variantId: "v-balado", quantity: 0 });
    data.transfers = [{ id: "trf-1720000000000-a", fromId: "loc-owner", toId: "loc-other", variantId: "v-balado", quantity: 4, status: "sent", createdAt: new Date().toISOString() }];

    const notifications = getOperationalNotifications(data, mapsFor(data).variants, mapsFor(data).locations, resolveUserScope(pic));
    expect(notifications.some((item) => item.detail.includes("Outlet Lain"))).toBe(false);
  });

  it("shows low-stock alerts to the owner with a direct restock action", () => {
    const data = structuredClone(seedData);
    data.balances = [{ locationId: "loc-owner", variantId: "v-balado", quantity: 0 }];

    const notifications = getOperationalNotifications(data, mapsFor(data).variants, mapsFor(data).locations, resolveUserScope(owner));
    expect(notifications).toContainEqual(expect.objectContaining({ tone: "warning", action: "create-stock-receipt", actionLabel: "Tambah stok" }));
  });

  it("routes a low-stock outlet to a transfer when another location has available stock", () => {
    const data = structuredClone(seedData);
    data.balances = [
      { locationId: "loc-outlet-1", variantId: "v-balado", quantity: 0 },
      { locationId: "loc-owner", variantId: "v-balado", quantity: 2000 },
    ];

    const notifications = getOperationalNotifications(data, mapsFor(data).variants, mapsFor(data).locations, resolveUserScope(owner));
    expect(notifications).toContainEqual(expect.objectContaining({ tone: "warning", action: "create-restock-transfer", actionLabel: "Isi lewat transfer", locationId: "loc-outlet-1", variantId: "v-balado", sourceLocationId: "loc-owner" }));
    expect(notifications.find((item) => item.locationName === "Outlet Meneng 1")?.detail).toContain("tersedia di Gudang Owner");
  });

  it("does not suggest a transfer when no other location has available stock", () => {
    const data = structuredClone(seedData);
    data.balances = [{ locationId: "loc-outlet-1", variantId: "v-balado", quantity: 0 }];

    const notifications = getOperationalNotifications(data, mapsFor(data).variants, mapsFor(data).locations, resolveUserScope(owner));
    const alert = notifications.find((item) => item.locationName === "Outlet Meneng 1");
    expect(alert?.detail).not.toContain("tersedia di");
    expect(alert).toMatchObject({ action: "create-stock-receipt", actionLabel: "Tambah stok" });
  });

  it("does not send a PIC to a reversed transfer route when their outlet stock is low", () => {
    const data = structuredClone(seedData);
    data.balances = [{ locationId: "loc-outlet-1", variantId: "v-balado", quantity: 0 }];

    const notifications = getOperationalNotifications(data, mapsFor(data).variants, mapsFor(data).locations, resolveUserScope(pic));
    expect(notifications).toContainEqual(expect.objectContaining({ tone: "warning", action: "view-stock", actionLabel: "Lihat stok", locationId: "loc-outlet-1" }));
  });
});
