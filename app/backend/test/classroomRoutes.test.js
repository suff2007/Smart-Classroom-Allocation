const assert = require("node:assert/strict");
const test = require("node:test");

const app = require("../src/app");
const { validateTransferRequest } = require("../src/routes/classroomRoutes");

const validTransferRequest = {
  requestType: "BORROW",
  roomNumber: "314",
  block: "SVB",
  requesterName: "Demo Requester",
  requesterEmail: "requester@example.edu",
  requesterDepartment: "Department B",
  lendingDepartment: "Department A",
  borrowingDepartment: "Department B",
  date: "2026-10-15",
  startTime: "09:00",
  endTime: "10:00",
  purpose: "Classroom demonstration",
};

test("transfer validation accepts the evidence-backed block alias without merging SVB", () => {
  const confirmed = validateTransferRequest(validTransferRequest, [
    { block: "SVB", roomNumber: "314", capacity: 120 },
  ]);
  const sourceAlias = validateTransferRequest(
    { ...validTransferRequest, block: "SMV", roomNumber: "317" },
    [{ block: "SMVB", roomNumber: "317", capacity: 60 }],
  );
  const differentBlock = validateTransferRequest(
    { ...validTransferRequest, block: "SMV", roomNumber: "317" },
    [{ block: "SVB", roomNumber: "317", capacity: 60 }],
  );

  assert.deepEqual(confirmed.errors, []);
  assert.deepEqual(sourceAlias.errors, []);
  assert.ok(differentBlock.errors.some((error) => /not in the supplied room inventory/.test(error)));
});

test("serves supplied inventory and conservative availability without MongoDB", async (t) => {
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  }));

  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const healthResponse = await fetch(`${baseUrl}/api/health`);
  assert.deepEqual(await healthResponse.json(), {
    status: "OK",
    message: "Classroom Allocation API is running",
  });

  const inventoryResponse = await fetch(`${baseUrl}/api/classrooms`);
  const inventory = await inventoryResponse.json();
  assert.equal(inventoryResponse.status, 200);
  assert.equal(inventory.rooms.length, 22);
  assert.ok(inventory.rooms.some((room) => room.block === "SMVB"));

  const availabilityResponse = await fetch(
    `${baseUrl}/api/classrooms/availability?date=2026-10-12&startTime=09%3A25&endTime=10%3A20`,
  );
  const availability = await availabilityResponse.json();
  assert.equal(availabilityResponse.status, 200);
  assert.equal(availability.databaseConnected, false);
  // A verified timetable conflict remains OCCUPIED even while MongoDB is offline;
  // rooms without a confirmed conflict remain CANNOT_VERIFY because persisted bookings
  // and complete occupancy coverage cannot be checked.
  const smvb507 = availability.results.find(
    (room) => room.block === "SMVB" && room.roomNumber === "507",
  );
  assert.equal(smvb507.availabilityStatus, "OCCUPIED");
  assert.ok(
    availability.results
      .filter((room) => !(room.block === "SMVB" && room.roomNumber === "507"))
      .every((result) => result.availabilityStatus === "CANNOT_VERIFY"),
  );
  const svb314 = availability.results.find(
    (room) => room.block === "SVB" && room.roomNumber === "314",
  );
  assert.equal(svb314.capacity, 120);
  assert.match(svb314.reason, /MongoDB is disconnected/);
  assert.match(svb314.reason, /Complete verified occupancy coverage.*is not certified/);

  const invalidResponse = await fetch(
    `${baseUrl}/api/classrooms/availability?date=2026-02-30&startTime=10%3A20&endTime=09%3A25`,
  );
  assert.equal(invalidResponse.status, 400);

  const qualityResponse = await fetch(`${baseUrl}/api/timetable/quality`);
  const quality = await qualityResponse.json();
  assert.equal(qualityResponse.status, 200);
  assert.equal(quality.summary.sourceEntryCount, 657);
  assert.equal(quality.summary.acceptedCount, 0);
  assert.equal(quality.summary.extractionStatusCounts.VERIFIED_TEXT, 414);
  assert.equal(quality.summary.extractionStatusCounts.NEEDS_VISUAL_REVIEW, 192);
  assert.equal(quality.summary.extractionStatusCounts.AMBIGUOUS, 51);
  assert.equal(quality.summary.entryRejectionCounts.MISSING_PERIOD_ROOM, 593);
  assert.equal(quality.rejectedEntries.length, 657);
  assert.ok(quality.rejectedEntries[0].reasons.length > 0);
  assert.deepEqual(quality.corrections, []);

  const previewResponse = await fetch(`${baseUrl}/api/classrooms/allocation-preview`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      eventType: "EXAM",
      participantCount: 100,
      date: "2026-10-12",
      startTime: "09:25",
      endTime: "10:20",
    }),
  });
  const preview = await previewResponse.json();
  assert.equal(previewResponse.status, 200);
  assert.equal(preview.preview.status, "CANNOT_VERIFY");
  assert.equal(preview.preview.allocationCreated, false);
});

test("answers a valid browser-style classroom search with conservative results", async (t) => {
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  }));

  const query = new URLSearchParams({
    dateFrom: "2026-10-15",
    dateTo: "2026-10-16",
    startTime: "09:00",
    endTime: "10:00",
    block: "SVB",
    minimumCapacity: "60",
  });
  const response = await fetch(
    `http://127.0.0.1:${server.address().port}/api/classrooms/availability?${query}`,
  );
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.query.dateFrom, "2026-10-15");
  assert.equal(payload.query.dateTo, "2026-10-16");
  assert.ok(payload.results.length > 0);
  assert.ok(payload.results.every((room) => room.block === "SVB"));
  assert.ok(
    payload.results.every((room) => room.availabilityStatus === "CANNOT_VERIFY"),
  );
});

test("requires an authenticated account before accepting a room request", async (t) => {
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  }));

  const response = await fetch(
    `http://127.0.0.1:${server.address().port}/api/classrooms/transfers`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ requestType: "BORROW" }),
    },
  );
  const body = await response.json();
  assert.equal(response.status, 401);
  assert.equal(body.error.code, "AUTH_REQUIRED");

  const eventResponse = await fetch(
    `http://127.0.0.1:${server.address().port}/api/classrooms/events`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ eventType: "EXAM", participantCount: 10 }),
    },
  );
  assert.equal(eventResponse.status, 401);
  assert.equal((await eventResponse.json()).error.code, "AUTH_REQUIRED");
});
