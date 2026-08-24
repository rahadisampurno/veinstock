import type { AppData, SessionUser } from "../types";
import { resolveUserScope, type ActionType } from "./rbac";

export type Page =
  | "dashboard"
  | "products"
  | "locations"
  | "receipts"
  | "stock"
  | "stock-outs"
  | "transfers"
  | "sales"
  | "shipping"
  | "returns"
  | "opname"
  | "history"
  | "reports"
  | "business"
  | "users"
  | "help"
  | "analytics"
  | "employees"
  | "attendance"
  | "loans"
  | "cashbook"
  | "debts"
  | "pricing"
  | "suppliers"
  | "role-access";

export const menuPermissionRequirement: Partial<Record<Page, ActionType>> = {
  products: "product.view",
  locations: "location.view",
  pricing: "pricing.view",
  suppliers: "supplier.view",
  receipts: "stock.view",
  stock: "stock.view",
  "stock-outs": "stock.out",
  transfers: "transfer.view",
  opname: "stock.view",
  history: "audit.location.view",
  sales: "sale.view",
  shipping: "shipping.view",
  returns: "stock.view",
  employees: "user.view",
  attendance: "attendance.view",
  loans: "payroll.view",
  cashbook: "cashbook.view",
  debts: "debt.view",
  reports: "report.view",
  analytics: "report.view",
};

export const userWithAssignedLocation = (user: SessionUser, data: AppData) => {
  if (user.role !== "employee" || user.outletId) return user;
  const assignment = (data.employees || []).find(
    (employee) => employee.userId === user.id && employee.active !== false,
  );
  return assignment?.locationId
    ? { ...user, outletId: assignment.locationId }
    : user;
};

export const isPageAllowedForUser = (
  page: Page,
  user: SessionUser,
  data: AppData,
) => {
  const scope = resolveUserScope(
    userWithAssignedLocation(user, data),
    data.rolePolicies,
  );
  if (page === "role-access") return scope.role === "owner";
  if (page === "business" && scope.role === "owner") return true;
  if (scope.role !== "owner") {
    const configuredMenus =
      data.rolePolicies?.[scope.role as keyof typeof data.rolePolicies]?.menus;
    if (configuredMenus) {
      const required = menuPermissionRequirement[page];
      return (
        configuredMenus.includes(page) &&
        (!required || scope.permissions.has(required))
      );
    }
  }
  if (scope.role === "employee")
    return page === "attendance" || page === "help";
  if (page === "dashboard" || page === "help") return true;
  const required = menuPermissionRequirement[page];
  if (required) return scope.permissions.has(required);
  if (page === "users" || page === "employees")
    return scope.permissions.has("user.view");
  return false;
};
