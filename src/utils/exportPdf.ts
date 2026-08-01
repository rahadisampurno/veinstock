export const downloadPDF = async (elementId: string, filename: string) => {
  const element = document.getElementById(elementId);
  if (!element) {
    alert("Elemen tidak ditemukan untuk dicetak");
    return;
  }

  try {
    // Library ekspor cukup besar dan hanya diperlukan saat pengguna benar-benar
    // mencetak laporan; jangan masukkan ke bundle awal aplikasi kasir.
    const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
      import('html2canvas'),
      import('jspdf'),
    ]);
    const canvas = await html2canvas(element, { scale: 2, useCORS: true });
    const imgData = canvas.toDataURL('image/png');
    
    // A4 dimensions in mm
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pdfWidth = pdf.internal.pageSize.getWidth();
    let pdfHeight = (canvas.height * pdfWidth) / canvas.width;
    
    // Check if the image height exceeds a single page
    const pageHeight = pdf.internal.pageSize.getHeight();
    if (pdfHeight > pageHeight) {
       // We can scale it down to fit on one page for simplicity
       pdfHeight = pageHeight;
       const scaledWidth = (canvas.width * pdfHeight) / canvas.height;
       // Center it
       const xOffset = (pdfWidth - scaledWidth) / 2;
       pdf.addImage(imgData, 'PNG', xOffset, 0, scaledWidth, pdfHeight);
    } else {
       pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
    }

    pdf.save(`${filename}.pdf`);
  } catch (error) {
    console.error("Gagal membuat PDF", error);
    alert("Gagal membuat laporan PDF.");
  }
};
