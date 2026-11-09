import { describe, expect, it } from "vitest";
import { parseSessionHistory } from "../../apps/api/src/session-history-snapshot";

const initial = {
  startsAt: "2030-06-03T13:00:00.000Z",
  endsAt: "2030-06-03T14:00:00.000Z",
  scheduledDate: "2030-06-03",
  teacherId: "11111111-1111-4111-8111-111111111111",
  roomId: null,
  status: "SCHEDULED",
  version: 1,
};
const changed = {
  ...initial,
  startsAt: "2030-06-05T20:00:00+07:00",
  endsAt: "2030-06-05T21:00:00+07:00",
  scheduledDate: "2030-06-05",
  roomId: "22222222-2222-4222-8222-222222222222",
  version: 2,
};
const row = () => ({
  oldSnapshot: { ...initial },
  newSnapshot: { ...changed },
  changeType: "RESCHEDULED",
});
function expectInvalid(data: Parameters<typeof parseSessionHistory>[0]) {
  let caught: unknown;
  try {
    parseSessionHistory(data);
  } catch (error) {
    caught = error;
  }
  expect(caught).toMatchObject({ status: 422 });
}

describe("immutable session history snapshot boundary", () => {
  it("preserves actual local dates, offset instants, room changes and versions", () => {
    expect(parseSessionHistory(row())).toEqual({
      before: initial,
      after: changed,
      changeType: "RESCHEDULED",
    });
  });
  it.each(["SCHEDULED", "IN_PROGRESS"])(
    "accepts an actual %s cancellation",
    (status) => {
      const result = parseSessionHistory({
        oldSnapshot: { ...initial, status },
        newSnapshot: { ...initial, status: "CANCELLED", version: 2 },
        changeType: "CANCELLED",
      });
      expect(result.changeType).toBe("CANCELLED");
      expect(result.after.status).toBe("CANCELLED");
    },
  );
  it("strips unrecognized personal fields from both snapshots without changing stored input", () => {
    const data = {
      oldSnapshot: {
        ...initial,
        email: "synthetic-private@example.test",
        medical: { note: "synthetic private field" },
      },
      newSnapshot: {
        ...changed,
        phone: "synthetic private phone",
        accessToken: "synthetic-unrecognized-token",
      },
      changeType: "RESCHEDULED",
    };
    const original = structuredClone(data);
    expect(parseSessionHistory(data)).toEqual({
      before: initial,
      after: changed,
      changeType: "RESCHEDULED",
    });
    expect(data).toEqual(original);
  });
  it.each([
    { startsAt: "not-a-date" },
    { endsAt: initial.startsAt },
    { endsAt: "2030-06-03T12:59:00Z" },
    { scheduledDate: "2028-02-30" },
    { scheduledDate: "0000-01-01" },
    { teacherId: "foreign-private-label-is-not-a-uuid" },
    { roomId: "not-a-room-uuid" },
    { status: "PRIVATE_UNKNOWN_STATE" },
    { version: 0 },
    { version: "1" },
  ])(
    "rejects malformed stored facts without returning partial history: %j",
    (patch) => {
      expectInvalid({
        ...row(),
        oldSnapshot: { ...initial, ...patch },
      });
    },
  );
  it.each([
    { changeType: "UNKNOWN" },
    { changeType: "CANCELLED" },
    { newSnapshot: { ...changed, version: 1 } },
    { newSnapshot: { ...changed, version: 3 } },
    { oldSnapshot: { ...initial, status: "COMPLETED" } },
    { oldSnapshot: { ...initial, status: "IN_PROGRESS" } },
    { newSnapshot: null },
  ])(
    "rejects inconsistent event types, lifecycle or version history: %j",
    (patch) => {
      expectInvalid({ ...row(), ...patch });
    },
  );
});
