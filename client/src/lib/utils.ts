import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** مبلغ بالريال العماني بلا كسور — الصيغة المعروضة في كل الشاشات */
export function formatCurrency(value: number) {
  return `${Math.round(value).toLocaleString("en-US")} ر.ع`;
}
