import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Combines class names using clsx and tailwind-merge.
 * This ensures Tailwind classes are properly merged without conflicts.
 *
 * Usage:
 * ```tsx
 * cn("px-4 py-2", isActive && "bg-primary", className)
 * ```
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Retorna a data atual no fuso horário de São Paulo (America/Sao_Paulo)
 * no formato YYYY-MM-DD.
 *
 * Resolve o problema de datas erradas à noite quando o servidor/dispositivo
 * está em UTC e o usuário está no Brasil (UTC-3).
 */
export function getTodayBR(): string {
  return new Date().toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).split("/").reverse().join("-"); // dd/mm/yyyy -> yyyy-mm-dd
}

/**
 * Retorna o ano e mês atuais no fuso horário de São Paulo.
 */
export function getNowBR(): { year: number; month: number; day: number } {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) => parseInt(parts.find((p) => p.type === type)?.value ?? "0");
  return { year: get("year"), month: get("month"), day: get("day") };
}
