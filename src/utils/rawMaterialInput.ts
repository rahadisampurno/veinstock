export const parseRawMaterialNumber = (value: string | number) => {
  const normalized = String(value).trim().replace(",", ".");
  if (!normalized || !/^-?\d+(?:\.\d+)?$/.test(normalized)) return Number.NaN;
  return Number(normalized);
};

export const sanitizeRawMaterialQuantityInput = (
  value: string,
  integerOnly: boolean,
) => {
  const compact = String(value).replace(/[^\d.,]/g, "");
  if (integerOnly) return compact.split(/[.,]/, 1)[0].replace(/\D/g, "");
  const separatorIndex = compact.search(/[.,]/);
  if (separatorIndex < 0) return compact;
  const whole = compact.slice(0, separatorIndex).replace(/\D/g, "") || "0";
  const separator = compact[separatorIndex];
  const fraction = compact
    .slice(separatorIndex + 1)
    .replace(/\D/g, "")
    .slice(0, 3);
  return `${whole}${separator}${fraction}`;
};

export const sanitizeRawMaterialCurrencyInput = (value: string) => {
  const digits = String(value)
    .replace(/\D/g, "")
    .replace(/^0+(?=\d)/, "");
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
};

export const parseRawMaterialCurrency = (value: string | number) => {
  const normalized = String(value).trim();
  if (!normalized || normalized.startsWith("-")) return Number.NaN;
  const digits = normalized.replace(/[^\d]/g, "");
  return digits ? Number(digits) : Number.NaN;
};
