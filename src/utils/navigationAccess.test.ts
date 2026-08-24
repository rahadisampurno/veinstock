import { describe, expect, it } from "vitest";
import { createEmptyData } from "../store";
import type { SessionUser } from "../types";
import {
  isPageAllowedForUser,
  menuPermissionRequirement,
  userWithAssignedLocation,
} from "./navigationAccess";

const account = (role: SessionUser["role"]): SessionUser => ({
  id: `user-${role}`,
  name: `User ${role}`,
  email: `${role}@test.local`,
  role,
  active: true,
  organizationId: "org-test",
  organizationName: "Organisasi Test",
});

describe("akses navigasi berdasarkan kebijakan peran", () => {
  it("menjaga pengaturan hak akses dan profil usaha khusus sesuai kewenangan", () => {
    const owner = account("owner");
    const data = createEmptyData("Organisasi Test", owner);
    expect(isPageAllowedForUser("business", owner, data)).toBe(true);
    expect(isPageAllowedForUser("role-access", owner, data)).toBe(true);

    const finance = account("finance");
    data.rolePolicies = {
      finance: {
        menus: ["dashboard", "business", "cashbook"],
        permissions: ["cashbook.view"],
      },
    };
    expect(isPageAllowedForUser("business", finance, data)).toBe(true);
    expect(isPageAllowedForUser("cashbook", finance, data)).toBe(true);
    expect(isPageAllowedForUser("debts", finance, data)).toBe(false);
    expect(isPageAllowedForUser("role-access", finance, data)).toBe(false);
  });

  it("langsung memakai policy terbaru dan mensyaratkan permission menu", () => {
    const owner = account("owner");
    const finance = account("finance");
    const data = createEmptyData("Organisasi Test", owner);
    data.rolePolicies = {
      finance: { menus: ["cashbook"], permissions: [] },
    };
    expect(menuPermissionRequirement.cashbook).toBe("cashbook.view");
    expect(isPageAllowedForUser("cashbook", finance, data)).toBe(false);

    data.rolePolicies.finance = {
      menus: ["cashbook"],
      permissions: ["cashbook.view"],
    };
    expect(isPageAllowedForUser("cashbook", finance, data)).toBe(true);
  });

  it("mengikuti lokasi kerja aktif untuk akun karyawan", () => {
    const owner = account("owner");
    const employee = account("employee");
    const data = createEmptyData("Organisasi Test", owner);
    data.employees = [
      {
        id: "employee-1",
        userId: employee.id,
        locationId: "location-1",
        position: "Staf",
        monthlySalary: 1_000_000,
        active: true,
      },
    ];
    expect(userWithAssignedLocation(employee, data).outletId).toBe(
      "location-1",
    );
  });
});
