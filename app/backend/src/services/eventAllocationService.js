
function planEventAllocation({
  eventType,
  participantCount,
  candidateRooms,
}) {
  if (!["EXAM", "PLACEMENT"].includes(eventType)) {
    throw new TypeError("eventType must be EXAM or PLACEMENT.");
  }

  if (!Number.isInteger(participantCount) || participantCount < 1) {
    throw new TypeError("participantCount must be a positive integer.");
  }

  if (!Array.isArray(candidateRooms)) {
    throw new TypeError("candidateRooms must be an array.");
  }

  const rooms = candidateRooms
    .filter(
      (room) =>
        Number.isInteger(room.capacity) &&
        room.capacity > 0 &&
        room.capacityStatus === "CONFIRMED",
    )
    .sort((a, b) => b.capacity - a.capacity);

  const selectedRooms = [];
  let suggestedCapacity = 0;

  for (const room of rooms) {
    selectedRooms.push(room);
    suggestedCapacity += room.capacity;

    if (suggestedCapacity >= participantCount) break;
  }

  const capacitySufficient = suggestedCapacity >= participantCount;
  const allAvailable = capacitySufficient &&
    selectedRooms.every((room) => room.availabilityStatus === "AVAILABLE");

  return {
    eventType,
    status: capacitySufficient
  ? "PREVIEW_READY"
  : "INSUFFICIENT_CAPACITY",
    allocationCreated: false,
    availabilityVerified: allAvailable,
    participantCount,
    plannedCapacity: suggestedCapacity,
    suggestedCapacity,
    rooms: selectedRooms.map((room) => ({
      roomNumber: room.roomNumber,
      block: room.block,
      capacity: room.capacity,
      availabilityStatus: room.availabilityStatus,
    })),
    message: allAvailable
      ? "Capacity-sufficient preview ready. No rooms have been reserved."
      : capacitySufficient
        ? "Capacity-sufficient provisional preview only. Verify room availability before allocating."
        : "Confirmed room capacity is insufficient for the requested participants.",
  };
}

module.exports = { planEventAllocation };
