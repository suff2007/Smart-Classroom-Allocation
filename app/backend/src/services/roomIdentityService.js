const CONFIRMED_BLOCKS = new Set(["SMV", "SVB", "CVR"]);
// Source timetable legends explicitly expand SMVB to Sir M. Visvesvaraya Block.
const BLOCK_ALIASES = new Map([["SMVB", "SMV"]]);

function normalizeConfirmedBlock(block) {
  if (typeof block !== "string") {
    return null;
  }

  const normalized = block.trim().toUpperCase();
  const canonical = BLOCK_ALIASES.get(normalized) || normalized;
  return CONFIRMED_BLOCKS.has(canonical) ? canonical : null;
}

function isConfirmedBlock(block) {
  return normalizeConfirmedBlock(block) !== null;
}

function sameBlockIdentity(first, second) {
  const firstCanonical = normalizeConfirmedBlock(first);
  const secondCanonical = normalizeConfirmedBlock(second);

  if (firstCanonical !== null || secondCanonical !== null) {
    return firstCanonical !== null && firstCanonical === secondCanonical;
  }

  return (
    typeof first === "string" &&
    typeof second === "string" &&
    first.trim() === second.trim()
  );
}

function hasRoomIdentity(value) {
  return (
    value &&
    typeof value.block === "string" &&
    value.block.trim().length > 0 &&
    typeof value.roomNumber === "string" &&
    value.roomNumber.trim().length > 0
  );
}

function hasConfirmedRoomIdentity(value) {
  return hasRoomIdentity(value) && isConfirmedBlock(value.block);
}

function sameRoomIdentity(first, second) {
  return (
    hasRoomIdentity(first) &&
    hasRoomIdentity(second) &&
    sameBlockIdentity(first.block, second.block) &&
    first.roomNumber === second.roomNumber
  );
}

module.exports = {
  BLOCK_ALIASES,
  CONFIRMED_BLOCKS,
  hasConfirmedRoomIdentity,
  hasRoomIdentity,
  isConfirmedBlock,
  normalizeConfirmedBlock,
  sameBlockIdentity,
  sameRoomIdentity,
};
