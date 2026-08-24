import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const blockBetween = (source, start, end) => {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  if (startIndex < 0 || endIndex < 0)
    throw new Error(`Blok konfigurasi ${start} tidak ditemukan.`);
  return source.slice(startIndex + start.length, endIndex);
};

const quotedValues = (source) =>
  [...source.matchAll(/"([^"]+)"/g)].map((match) => match[1]);

const requirementEntries = (source) =>
  Object.fromEntries(
    [...source.matchAll(/(?:"([^"]+)"|([a-z][a-z-]*)):\s*"([^"]+)"/g)].map(
      (match) => [match[1] || match[2], match[3]],
    ),
  );

describe('kontrak menu dan hak akses', () => {
  it('menjaga daftar menu dan permission frontend/backend tetap lengkap dan sama', async () => {
    const [frontend, navigation, backend] = await Promise.all([
      readFile(new URL('../src/App.tsx', import.meta.url), 'utf8'),
      readFile(new URL('../src/utils/navigationAccess.ts', import.meta.url), 'utf8'),
      readFile(new URL('./index.mjs', import.meta.url), 'utf8'),
    ]);

    const roleMenuBlock = blockBetween(
      frontend,
      'const roleMenuOptions: RoleMenuOption[] = [',
      'const roleMenuGroups =',
    );
    const menuObjects = roleMenuBlock.match(/\{[\s\S]*?\}/g) || [];
    const frontendMenus = menuObjects.map((item) => ({
      id: item.match(/id:\s*"([^"]+)"/)?.[1],
      ownerOnly: /ownerOnly:\s*true/.test(item),
    }));
    expect(frontendMenus.every((item) => item.id)).toBe(true);
    expect(new Set(frontendMenus.map((item) => item.id)).size).toBe(
      frontendMenus.length,
    );
    expect(frontendMenus.filter((item) => item.ownerOnly).map((item) => item.id)).toEqual([
      'role-access',
    ]);

    const backendMenus = quotedValues(
      blockBetween(
        backend,
        'const configurableMenus = new Set([',
        ']);\nconst menuPermissionRequirements =',
      ),
    );
    const assignableFrontendMenus = frontendMenus
      .filter((item) => !item.ownerOnly)
      .map((item) => item.id)
      .sort();
    expect([...backendMenus].sort()).toEqual(assignableFrontendMenus);

    const frontendPermissionIds = [
      ...blockBetween(
        frontend,
        'const permissionOptions:',
        'const defaultRoleMenus:',
      ).matchAll(/id:\s*"([^"]+)"/g),
    ].map((match) => match[1]);
    const backendPermissions = quotedValues(
      blockBetween(
        backend,
        'const configurablePermissions = new Set([',
        ']);\nconst configurableMenus =',
      ),
    );
    expect(new Set(frontendPermissionIds).size).toBe(frontendPermissionIds.length);
    expect([...backendPermissions].sort()).toEqual(
      [...frontendPermissionIds].sort(),
    );

    const frontendRequirements = requirementEntries(
      blockBetween(
        navigation,
        'export const menuPermissionRequirement:',
        'export const userWithAssignedLocation',
      ),
    );
    const backendRequirements = requirementEntries(
      blockBetween(
        backend,
        'const menuPermissionRequirements = {',
        '};\nconst validateCommandProduct =',
      ),
    );
    expect(backendRequirements).toEqual(frontendRequirements);
    expect(Object.keys(backendRequirements).every((menu) => backendMenus.includes(menu))).toBe(true);
    expect(Object.values(backendRequirements).every((permission) => backendPermissions.includes(permission))).toBe(true);

    const defaultMenuBlock = blockBetween(
      backend,
      'const defaultRoleMenusById = {',
      '};\nconst defaultRolePolicyState =',
    );
    expect(
      quotedValues(defaultMenuBlock).every((menu) => backendMenus.includes(menu)),
    ).toBe(true);
  });
});
