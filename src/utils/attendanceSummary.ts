export interface AttendanceSummarySourceRow {
  employee: {
    id: string;
    position?: string;
    joinDate?: string;
  };
  account?: { name?: string };
  location?: { name?: string };
  date: string;
  checkInEnd?: string;
  record?: {
    checkInAt?: string;
    checkOutAt?: string;
    lateMinutes?: number;
  };
}

export interface EmployeeAttendanceSummary {
  employeeId: string;
  employeeName: string;
  position: string;
  locationName: string;
  assessedDays: number;
  presentDays: number;
  absentDays: number;
  completedDays: number;
  incompleteDays: number;
  lateDays: number;
  totalLateMinutes: number;
}

export const formatLateDuration = (totalMinutes: number) => {
  const normalizedMinutes = Math.max(0, Math.floor(Number(totalMinutes) || 0));
  if (!normalizedMinutes) return "-";

  const hours = Math.floor(normalizedMinutes / 60);
  const minutes = normalizedMinutes % 60;
  return hours
    ? `${hours} jam ${minutes} menit`
    : `${minutes} menit`;
};

const clockMinutes = (value = "09:00") => {
  const [hours, minutes] = value.split(":").map(Number);
  if (
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  )
    return 9 * 60;
  return hours * 60 + minutes;
};

export const buildAttendanceSummary = (
  rows: AttendanceSummarySourceRow[],
  today: string,
  currentMinutes: number,
): EmployeeAttendanceSummary[] => {
  const summaries = new Map<string, EmployeeAttendanceSummary>();

  for (const row of rows) {
    let summary = summaries.get(row.employee.id);
    if (!summary) {
      summary = {
        employeeId: row.employee.id,
        employeeName: row.account?.name || "Akun tidak ditemukan",
        position: row.employee.position || "-",
        locationName: row.location?.name || "Belum ditugaskan",
        assessedDays: 0,
        presentDays: 0,
        absentDays: 0,
        completedDays: 0,
        incompleteDays: 0,
        lateDays: 0,
        totalLateMinutes: 0,
      };
      summaries.set(row.employee.id, summary);
    }

    const joinDate = row.employee.joinDate?.slice(0, 10);
    if ((joinDate && row.date < joinDate) || row.date > today) continue;

    const checkedIn = Boolean(row.record?.checkInAt);
    const dayCanBeAssessed =
      row.date < today ||
      (row.date === today &&
        (checkedIn || currentMinutes >= clockMinutes(row.checkInEnd)));
    if (!dayCanBeAssessed) continue;

    summary.assessedDays += 1;
    if (!checkedIn) {
      summary.absentDays += 1;
      continue;
    }

    summary.presentDays += 1;
    if (row.record?.checkOutAt) summary.completedDays += 1;
    else summary.incompleteDays += 1;

    const lateMinutes = Math.max(0, Number(row.record?.lateMinutes || 0));
    if (lateMinutes > 0) summary.lateDays += 1;
    summary.totalLateMinutes += lateMinutes;
  }

  return Array.from(summaries.values()).sort((a, b) =>
    a.employeeName.localeCompare(b.employeeName, "id"),
  );
};
