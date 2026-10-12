import { describe, expect, it } from "vitest";
import {
  buildAttendanceSummary,
  formatLateDuration,
} from "./attendanceSummary";

const employee = {
  id: "employee-1",
  position: "Kasir",
  joinDate: "2026-10-02",
};
const base = {
  employee,
  account: { name: "Ayu" },
  location: { name: "Outlet Utama" },
  checkInEnd: "09:00",
};

describe("buildAttendanceSummary", () => {
  it("counts present, absent, complete, incomplete, and late days", () => {
    const [summary] = buildAttendanceSummary(
      [
        { ...base, date: "2026-10-01" },
        {
          ...base,
          date: "2026-10-02",
          record: {
            checkInAt: "2026-10-02T01:00:00.000Z",
            checkOutAt: "2026-10-02T10:00:00.000Z",
            lateMinutes: 0,
          },
        },
        { ...base, date: "2026-10-03" },
        {
          ...base,
          date: "2026-10-04",
          record: {
            checkInAt: "2026-10-04T01:30:00.000Z",
            lateMinutes: 20,
          },
        },
      ],
      "2026-10-04",
      10 * 60,
    );

    expect(summary).toMatchObject({
      assessedDays: 3,
      presentDays: 2,
      absentDays: 1,
      completedDays: 1,
      incompleteDays: 1,
      lateDays: 1,
      totalLateMinutes: 20,
    });
  });

  it("does not mark today absent before the check-in window closes", () => {
    const [summary] = buildAttendanceSummary(
      [{ ...base, date: "2026-10-04" }],
      "2026-10-04",
      8 * 60 + 59,
    );

    expect(summary).toMatchObject({
      assessedDays: 0,
      absentDays: 0,
    });
  });

  it("marks today absent after the check-in window and ignores future dates", () => {
    const [summary] = buildAttendanceSummary(
      [
        { ...base, date: "2026-10-04" },
        { ...base, date: "2026-10-05" },
      ],
      "2026-10-04",
      9 * 60,
    );

    expect(summary).toMatchObject({
      assessedDays: 1,
      absentDays: 1,
    });
  });
});

describe("formatLateDuration", () => {
  it("formats accumulated minutes as hours and minutes", () => {
    expect(formatLateDuration(807)).toBe("13 jam 27 menit");
    expect(formatLateDuration(60)).toBe("1 jam 0 menit");
    expect(formatLateDuration(20)).toBe("20 menit");
    expect(formatLateDuration(0)).toBe("-");
  });
});
