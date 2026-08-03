import type { AppData, StockUnit, Variant } from "../types";
import type { Scope } from "./rbac";

export type OperationalNotification = {
  id: string;
  tone: "warning" | "info";
  title: string;
  detail: string;
  action?: "open-transfer-inbox" | "create-restock-transfer" | "create-stock-receipt" | "view-stock";
  actionLabel?: string;
  locationId?: string;
  locationName?: string;
  variantId?: string;
  sourceLocationId?: string;
  sourceLocationName?: string;
  currentQuantity?: number;
  minimumQuantity?: number;
};

type NotificationVariant = Variant & { unit?: StockUnit; productName?: string };
type NotificationLocation = { id: string; name: string; type?: string };

const quantity = (value?: number | null, unit?: StockUnit) =>
  `${(value || 0).toLocaleString("id-ID")} ${unit === "pcs" ? "pcs" : unit || "unit"}`;
const minimumFor = (variant: Variant | undefined, locationId: string) =>
  variant?.minStockByLocation?.[locationId] ?? variant?.minStock ?? 0;
const transferGroupKey = (transfer: any) => {
  if (transfer.transferCode) return transfer.transferCode;
  const timestamp = /^trf-(\d+)-/i.exec(transfer.id || "")?.[1];
  return timestamp ? `legacy:${transfer.fromId}:${transfer.toId}:${timestamp}` : transfer.id;
};
const transferDisplayCode = (transfer: any) => {
  if (transfer.transferCode) return transfer.transferCode;
  const timestamp = /^trf-(\d+)-/i.exec(transfer.id || "")?.[1];
  return timestamp ? `TRF-${timestamp.slice(-6)}` : transfer.id;
};

/**
 * Membentuk notifikasi dari state organisasi yang sudah disimpan di server.
 * Tidak ada inbox/cache browser yang dapat tertinggal dari data operasional.
 */
export const getOperationalNotifications = (
  data: AppData,
  variants: Record<string, NotificationVariant>,
  locations: Record<string, NotificationLocation>,
  scope: Scope,
): OperationalNotification[] => {
  const canViewStock = scope.permissions.has("stock.view");
  const canReceiveTransfer = scope.permissions.has("transfer.receive");
  const canReceiveStock = scope.permissions.has("stock.in");
  const canSeeTransfers = canReceiveTransfer || scope.permissions.has("transfer.send") || scope.permissions.has("transfer.create");
  const accessibleLocation = (locationId: string) =>
    scope.scopeType === "all" || scope.allowedLocationIds.includes(locationId);
  const notifications: OperationalNotification[] = [];

  if (canSeeTransfers) {
    const grouped = new Map<string, any[]>();
    (data.transfers || []).forEach((transfer: any) => {
      if (!accessibleLocation(transfer.fromId) && !accessibleLocation(transfer.toId)) return;
      const key = transferGroupKey(transfer);
      grouped.set(key, [...(grouped.get(key) || []), transfer]);
    });
    grouped.forEach((items) => {
      const first = items[0];
      if (first.status !== "sent") return;
      const total = items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
      const isIncoming = accessibleLocation(first.toId);
      notifications.push({
        id: `transfer:${transferGroupKey(first)}`,
        tone: "info",
        title: isIncoming
          ? `Transfer ${transferDisplayCode(first)} menunggu penerimaan`
          : `Transfer ${transferDisplayCode(first)} menunggu penerimaan tujuan`,
        detail: `${locations[first.fromId]?.name || "Lokasi asal"} → ${locations[first.toId]?.name || "Lokasi tujuan"} · ${items.length} varian / ${total} item`,
        action: "open-transfer-inbox",
        actionLabel: isIncoming && canReceiveTransfer ? "Buka transfer" : "Lihat transfer",
      });
    });
  }

  if (canViewStock) {
    (data.balances || []).forEach((balance: any) => {
      if (!accessibleLocation(balance.locationId)) return;
      const variant = variants[balance.variantId];
      const minimum = minimumFor(variant, balance.locationId);
      if (!variant || balance.quantity >= minimum) return;
      const location = locations[balance.locationId];
      const sourceBalance = (data.balances || [])
        .filter((candidate: any) => candidate.variantId === balance.variantId && candidate.locationId !== balance.locationId)
        .map((candidate: any) => ({
          ...candidate,
          location: locations[candidate.locationId],
          available: Math.max(0, Number(candidate.quantity || 0) - minimumFor(variant, candidate.locationId)),
        }))
        .filter((candidate: any) => candidate.location && candidate.available > 0)
        .sort((a: any, b: any) => {
          if (a.location.type === "warehouse" && b.location.type !== "warehouse") return -1;
          if (a.location.type !== "warehouse" && b.location.type === "warehouse") return 1;
          return b.available - a.available;
        })[0];
      // Transfer hanya disarankan bila lokasi lain benar-benar memiliki stok
      // yang dapat dipindahkan tanpa melewati batas minimumnya sendiri.
      const canCreateRestockTransfer = scope.scopeType === "all" && location && location.type === "outlet" && sourceBalance &&
        (scope.permissions.has("transfer.create") || scope.permissions.has("transfer.send"));
      const action = canCreateRestockTransfer
        ? "create-restock-transfer"
        : canReceiveStock
          ? "create-stock-receipt"
          : "view-stock";
      notifications.push({
        id: `low-stock:${balance.locationId}:${balance.variantId}`,
        tone: "warning",
        title: `${variant.productName} · ${variant.name}`,
        detail: balance.quantity <= 0
          ? `Stok habis · minimum ${quantity(minimum, variant.unit)}${sourceBalance ? ` · tersedia di ${sourceBalance.location.name}` : ""}.`
          : `Tersisa ${quantity(balance.quantity, variant.unit)} dari minimum ${quantity(minimum, variant.unit)}${sourceBalance ? ` · tersedia di ${sourceBalance.location.name}` : ""}.`,
        action,
        actionLabel: action === "create-restock-transfer" ? "Isi lewat transfer" : action === "create-stock-receipt" ? "Tambah stok" : "Lihat stok",
        locationId: balance.locationId,
        locationName: location?.name || "Lokasi",
        variantId: balance.variantId,
        sourceLocationId: sourceBalance?.locationId,
        sourceLocationName: sourceBalance?.location?.name,
        currentQuantity: Number(balance.quantity || 0),
        minimumQuantity: minimum,
      });
    });
  }

  return notifications.sort((a, b) => {
    if (a.tone !== b.tone) return a.tone === "info" ? -1 : 1;
    if (a.tone === "warning" && b.tone === "warning") {
      const aRatio = (a.currentQuantity || 0) / Math.max(1, a.minimumQuantity || 1);
      const bRatio = (b.currentQuantity || 0) / Math.max(1, b.minimumQuantity || 1);
      if (aRatio !== bRatio) return aRatio - bRatio;
      if (a.locationName !== b.locationName) return (a.locationName || "").localeCompare(b.locationName || "", "id");
    }
    return a.title.localeCompare(b.title, "id");
  });
};
