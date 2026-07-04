// تصدير ملفات Excel عبر exceljs (بديل آمن لمكتبة xlsx المصابة بثغرات دون إصلاح)
export interface ExcelSheetSpec {
  name: string;
  rows: Record<string, unknown>[];
  columnWidths?: number[];
}

export async function downloadExcel(fileName: string, sheets: ExcelSheetSpec[]) {
  const ExcelJS = await import("exceljs");
  const workbook = new ExcelJS.Workbook();

  for (const sheet of sheets) {
    const worksheet = workbook.addWorksheet(sheet.name, {
      views: [{ rightToLeft: true }],
    });

    const headers = sheet.rows.length > 0 ? Object.keys(sheet.rows[0]) : [];
    worksheet.columns = headers.map((header, i) => ({
      header,
      key: header,
      width: sheet.columnWidths?.[i] ?? 18,
    }));
    worksheet.getRow(1).font = { bold: true };

    for (const row of sheet.rows) {
      worksheet.addRow(row);
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}
