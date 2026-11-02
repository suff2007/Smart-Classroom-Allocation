const assert = require("node:assert/strict");
const test = require("node:test");

const { planEventAllocation } = require("../src/services/eventAllocationService");

test("creates a non-binding preview only from confirmed available room capacities", () => {
  const result = planEventAllocation({
    eventType: "EXAM",
    participantCount: 100,
    candidateRooms: [
      {
        roomNumber: "A",
        block: "SVB",
        capacity: 60,
        capacityStatus: "CONFIRMED",
        availabilityStatus: "AVAILABLE",
      },
      {
        roomNumber: "B",
        block: "SVB",
        capacity: 60,
        capacityStatus: "CONFIRMED",
        availabilityStatus: "AVAILABLE",
      },
      {
        roomNumber: "C",
        block: "SVB",
        capacity: 120,
        capacityStatus: "CONFIRMED",
        availabilityStatus: "CANNOT_VERIFY",
      },
    ],
  });

  assert.equal(result.status, "PREVIEW_READY");
  assert.equal(result.plannedCapacity, 120);
  assert.deepEqual(result.rooms.map((room) => room.roomNumber), ["A", "B"]);
  assert.equal(result.allocationCreated, false);
});

test("does not use unconfirmed capacity or unverified availability", () => {
  const result = planEventAllocation({
    eventType: "PLACEMENT",
    participantCount: 20,
    candidateRooms: [
      {
        roomNumber: "219",
        block: "SVB",
        capacity: null,
        capacityStatus: "UNCONFIRMED",
        availabilityStatus: "AVAILABLE",
      },
      {
        roomNumber: "314",
        block: "SVB",
        capacity: 120,
        capacityStatus: "CONFIRMED",
        availabilityStatus: "CANNOT_VERIFY",
      },
    ],
  });

  assert.equal(result.status, "CANNOT_VERIFY");
  assert.equal(result.plannedCapacity, 0);
  assert.deepEqual(result.rooms, []);
});

test("reports insufficient capacity when verified candidates cannot seat participants", () => {
  const result = planEventAllocation({
    eventType: "EXAM",
    participantCount: 100,
    candidateRooms: [
      {
        roomNumber: "F1",
        block: "SVB",
        capacity: 30,
        capacityStatus: "CONFIRMED",
        availabilityStatus: "AVAILABLE",
      },
    ],
  });

  assert.equal(result.status, "INSUFFICIENT_CAPACITY");
  assert.equal(result.plannedCapacity, 30);
  assert.deepEqual(result.rooms, []);
});

test("rejects invalid event types and participant counts", () => {
  assert.throws(
    () => planEventAllocation({ eventType: "OTHER", participantCount: 1, candidateRooms: [] }),
    /eventType/,
  );
  assert.throws(
    () => planEventAllocation({ eventType: "EXAM", participantCount: 0, candidateRooms: [] }),
    /participantCount/,
  );
});
