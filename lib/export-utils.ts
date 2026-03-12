import { Platform } from "react-native";
import { Payment, CustomCategory } from "./payments-context";

export type ExportFormat = "csv" | "xls" | "pdf";
export type ExportProfile = "Todos" | "Pessoal" | "Empresa";

function formatCurrency(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(dateStr: string) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString("pt-BR");
}

function filterPayments(
  payments: Payment[],
  profile: ExportProfile,
  year?: number,
  month?: number
): Payment[] {
  return payments.filter((p) => {
    const profileMatch = profile === "Todos" || p.profile === profile;
    if (!profileMatch) return false;
    if (year !== undefined && month !== undefined) {
      const [py, pm] = p.date.split("-").map(Number);
      return py === year && pm === month;
    }
    return true;
  });
}

function buildRows(payments: Payment[]) {
  return payments.map((p) => ({
    Data: formatDate(p.date),
    Descrição: p.description,
    Valor: p.amount,
    "Valor Formatado": formatCurrency(p.amount),
    Categoria: p.category,
    Perfil: p.profile,
    Observação: p.notes ?? "",
  }));
}

function buildFileName(
  ext: string,
  profile: ExportProfile,
  year?: number,
  month?: number
): string {
  const period =
    year && month
      ? `${year}-${String(month).padStart(2, "0")}`
      : "todos";
  const profileSlug = profile === "Todos" ? "todos" : profile.toLowerCase();
  return `gastopix_${profileSlug}_${period}.${ext}`;
}

// ─── Web download helper ─────────────────────────────────────────────────────

function downloadOnWeb(content: string | ArrayBuffer, fileName: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─── Native share helper ─────────────────────────────────────────────────────

async function shareOnNative(content: string, fileName: string, mimeType: string, encoding: "utf8" | "base64" = "utf8") {
  const FileSystem = await import("expo-file-system/legacy");
  const Sharing = await import("expo-sharing");

  const fileUri = FileSystem.cacheDirectory + fileName;
  await FileSystem.writeAsStringAsync(fileUri, content, {
    encoding: encoding === "base64" ? FileSystem.EncodingType.Base64 : FileSystem.EncodingType.UTF8,
  });

  const available = await Sharing.isAvailableAsync();
  if (!available) throw new Error("Compartilhamento não disponível neste dispositivo.");
  await Sharing.shareAsync(fileUri, { mimeType, dialogTitle: "Exportar dados do GastoPix" });
}

// ─── CSV ────────────────────────────────────────────────────────────────────

export async function exportCSV(
  payments: Payment[],
  profile: ExportProfile,
  year?: number,
  month?: number
): Promise<void> {
  const filtered = filterPayments(payments, profile, year, month);
  const rows = buildRows(filtered);

  const headers = ["Data", "Descrição", "Valor", "Valor Formatado", "Categoria", "Perfil", "Observação"];
  const csvLines = [
    headers.join(";"),
    ...rows.map((r) =>
      headers
        .map((h) => {
          const val = String((r as Record<string, unknown>)[h] ?? "");
          return val.includes(";") || val.includes("\n") ? `"${val}"` : val;
        })
        .join(";")
    ),
  ];

  const csvContent = "\uFEFF" + csvLines.join("\n"); // BOM for Excel UTF-8
  const fileName = buildFileName("csv", profile, year, month);

  if (Platform.OS === "web") {
    downloadOnWeb(csvContent, fileName, "text/csv;charset=utf-8;");
  } else {
    await shareOnNative(csvContent, fileName, "text/csv");
  }
}

// ─── XLS ────────────────────────────────────────────────────────────────────

export async function exportXLS(
  payments: Payment[],
  profile: ExportProfile,
  year?: number,
  month?: number
): Promise<void> {
  const filtered = filterPayments(payments, profile, year, month);
  const rows = buildRows(filtered);

  const { utils, write } = await import("xlsx");

  const ws = utils.json_to_sheet(rows);
  ws["!cols"] = [
    { wch: 12 }, { wch: 40 }, { wch: 12 }, { wch: 18 }, { wch: 18 }, { wch: 12 }, { wch: 30 },
  ];

  const wb = utils.book_new();
  utils.book_append_sheet(wb, ws, "Pagamentos");

  // Summary sheet
  const cats = [...new Set(filtered.map((p) => p.category))];
  const summaryRows = cats.map((cat) => {
    const catPayments = filtered.filter((p) => p.category === cat);
    const total = catPayments.reduce((s, p) => s + p.amount, 0);
    return { Categoria: cat, Quantidade: catPayments.length, Total: total, "Total Formatado": formatCurrency(total) };
  });
  const totalGeral = filtered.reduce((s, p) => s + p.amount, 0);
  summaryRows.push({ Categoria: "TOTAL GERAL", Quantidade: filtered.length, Total: totalGeral, "Total Formatado": formatCurrency(totalGeral) });

  const wsSummary = utils.json_to_sheet(summaryRows);
  wsSummary["!cols"] = [{ wch: 20 }, { wch: 12 }, { wch: 14 }, { wch: 20 }];
  utils.book_append_sheet(wb, wsSummary, "Resumo");

  const fileName = buildFileName("xlsx", profile, year, month);

  if (Platform.OS === "web") {
    // Write as ArrayBuffer for web download
    const xlsBuffer: ArrayBuffer = write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    downloadOnWeb(xlsBuffer, fileName, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  } else {
    const xlsData: string = write(wb, { type: "base64", bookType: "xlsx" });
    await shareOnNative(xlsData, fileName, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "base64");
  }
}

// ─── PDF ────────────────────────────────────────────────────────────────────

export async function exportPDF(
  payments: Payment[],
  _categories: CustomCategory[],
  profile: ExportProfile,
  year?: number,
  month?: number
): Promise<void> {
  const filtered = filterPayments(payments, profile, year, month);

  const periodLabel =
    year && month
      ? new Date(year, month - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" })
      : "Todos os períodos";

  const totalGeral = filtered.reduce((s, p) => s + p.amount, 0);

  const categoryMap = new Map<string, { count: number; total: number }>();
  filtered.forEach((p) => {
    const existing = categoryMap.get(p.category) ?? { count: 0, total: 0 };
    categoryMap.set(p.category, { count: existing.count + 1, total: existing.total + p.amount });
  });

  const summaryRows = Array.from(categoryMap.entries())
    .sort((a, b) => b[1].total - a[1].total)
    .map(
      ([cat, data]) =>
        `<tr>
          <td style="padding:6px 12px;border-bottom:1px solid #f0f0f0;">${cat}</td>
          <td style="padding:6px 12px;border-bottom:1px solid #f0f0f0;text-align:center;">${data.count}</td>
          <td style="padding:6px 12px;border-bottom:1px solid #f0f0f0;text-align:right;font-weight:600;">${formatCurrency(data.total)}</td>
        </tr>`
    )
    .join("");

  const paymentRows = filtered
    .map(
      (p) =>
        `<tr>
          <td style="padding:5px 10px;border-bottom:1px solid #f5f5f5;font-size:12px;">${formatDate(p.date)}</td>
          <td style="padding:5px 10px;border-bottom:1px solid #f5f5f5;font-size:12px;">${p.description}</td>
          <td style="padding:5px 10px;border-bottom:1px solid #f5f5f5;font-size:12px;">${p.category}</td>
          <td style="padding:5px 10px;border-bottom:1px solid #f5f5f5;font-size:12px;">${p.profile}</td>
          <td style="padding:5px 10px;border-bottom:1px solid #f5f5f5;font-size:12px;text-align:right;font-weight:600;">${formatCurrency(p.amount)}</td>
        </tr>`
    )
    .join("");

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: -apple-system, Arial, sans-serif; margin: 0; padding: 24px; color: #1a1a2e; }
    .header { background: linear-gradient(135deg, #7C3AED, #5B21B6); color: white; padding: 24px; border-radius: 12px; margin-bottom: 24px; }
    .header h1 { margin: 0 0 4px 0; font-size: 24px; }
    .header p { margin: 0; opacity: 0.85; font-size: 14px; }
    .total-card { background: #f8f5ff; border: 2px solid #7C3AED; border-radius: 12px; padding: 16px 24px; margin-bottom: 24px; display: flex; justify-content: space-between; align-items: center; }
    .total-label { font-size: 13px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px; }
    .total-value { font-size: 28px; font-weight: 700; color: #7C3AED; }
    .section-title { font-size: 16px; font-weight: 700; color: #1a1a2e; margin: 0 0 12px 0; padding-bottom: 8px; border-bottom: 2px solid #7C3AED; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 28px; }
    th { background: #7C3AED; color: white; padding: 8px 12px; text-align: left; font-size: 13px; }
    th:last-child { text-align: right; }
    td { color: #374151; }
    .footer { text-align: center; font-size: 11px; color: #9ca3af; margin-top: 32px; padding-top: 16px; border-top: 1px solid #e5e7eb; }
    @media print { body { padding: 0; } }
  </style>
</head>
<body>
  <div class="header">
    <h1>GastoPix — Relatório de Pagamentos</h1>
    <p>Período: ${periodLabel} &nbsp;|&nbsp; Perfil: ${profile}</p>
  </div>
  <div class="total-card">
    <div>
      <div class="total-label">Total de pagamentos</div>
      <div style="font-size:15px;font-weight:600;color:#374151;">${filtered.length} lançamento${filtered.length !== 1 ? "s" : ""}</div>
    </div>
    <div style="text-align:right;">
      <div class="total-label">Total gasto</div>
      <div class="total-value">${formatCurrency(totalGeral)}</div>
    </div>
  </div>
  <p class="section-title">Resumo por Categoria</p>
  <table>
    <thead><tr><th>Categoria</th><th style="text-align:center;">Qtd</th><th style="text-align:right;">Total</th></tr></thead>
    <tbody>${summaryRows}</tbody>
  </table>
  <p class="section-title">Todos os Lançamentos</p>
  <table>
    <thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th>Perfil</th><th style="text-align:right;">Valor</th></tr></thead>
    <tbody>${paymentRows}</tbody>
  </table>
  <div class="footer">Gerado pelo GastoPix em ${new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}</div>
</body>
</html>`;

  const fileName = buildFileName("html", profile, year, month).replace(".html", "-relatorio.html");

  if (Platform.OS === "web") {
    // On web: open in new tab so user can print/save as PDF via browser
    const blob = new Blob([html], { type: "text/html;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  } else {
    await shareOnNative(html, fileName, "text/html");
  }
}
