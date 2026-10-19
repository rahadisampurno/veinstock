export const archiveReadyShipments = (
  state,
  {
    archivedAt,
    cancelledBy = "system-client-reset",
    cancelReason,
  },
) => {
  const shipmentIds = [];
  for (const shipment of state.shipments || []) {
    if (shipment.status !== "ready") continue;
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
