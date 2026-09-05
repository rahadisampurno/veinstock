export const commandErrorMessage = (
  status: number,
  serverMessage?: unknown,
) => {
  const message =
    typeof serverMessage === "string" ? serverMessage.trim() : "";
  if (message) return message;
  if ([502, 503, 504].includes(status))
    return "Server sedang sibuk. Data belum berubah; tunggu sebentar lalu coba lagi.";
  if (status === 409)
    return "Data telah diperbarui dari perangkat lain. Muat ulang halaman lalu ulangi perubahan.";
  if (status === 401)
    return "Sesi telah berakhir. Silakan masuk kembali.";
  if (status >= 500)
    return "Layanan sedang mengalami gangguan. Data belum berubah; silakan coba lagi.";
  return "Permintaan belum dapat diproses. Periksa data yang diisi lalu coba lagi.";
};
