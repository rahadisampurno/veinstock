export const archiveReadyShipments = (
  state,
  {
    archivedAt,
    cancelledBy = "system-client-reset",
    cancelReason,
    statuses = ["ready", "pending_packing"],
  },
) => {
  const resettableStatuses = new Set(statuses);
  const shipmentIds = [];
  for (const shipment of state.shipments || []) {
    if (!resettableStatuses.has(shipment.status)) continue;
    shipmentIds.push(shipment.id);
    Object.assign(shipment, {
      status: "cancelled",
      cancelledAt: archivedAt,
      cancelledBy,
      cancelReason,
    });
    delete shipment.handoverBatchCode;
  }
  return shipmentIds;
};
