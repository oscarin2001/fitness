// @utils/date/formatDate.js
import { parseISO, isValid, format, differenceInMinutes } from "date-fns";
import { es } from "date-fns/locale";

export function formatDate(dateString) {
  if (dateString === "") return "-";

  try {
    let date;
    let isYearMonthOnly = false;

    if (/^\d{4}$/.test(dateString)) {
      // Solo año, como "2025"
      return dateString;
    }

    if (/^\d{4}-\d{2}$/.test(dateString)) {
      const [year, month] = dateString.split("-");
      date = new Date(Number(year), Number(month) - 1, 1);
      isYearMonthOnly = true;
    } else {
      const normalized = dateString.replace(/\//g, "-");
      date = parseISO(normalized);
    }

    if (!isValid(date)) return "N/A";

    const now = new Date();
    const diffMinutes = differenceInMinutes(now, date);

    if (diffMinutes >= 0 && diffMinutes < 60) {
      return diffMinutes <= 1 ? "hace 1 min" : `hace ${diffMinutes} min`;
    }

    const hasTime = date.getHours() !== 0 || date.getMinutes() !== 0;

    if (isYearMonthOnly) {
      const formatted = format(date, "MMMM 'de' yyyy", { locale: es });
      return formatted.charAt(0).toUpperCase() + formatted.slice(1);
    } else {
      const formatted = format(
        date,
        hasTime ? "EEEE d 'de' MMMM yyyy, HH:mm" : "EEEE d 'de' MMMM yyyy",
        { locale: es }
      );
      return formatted.charAt(0).toUpperCase() + formatted.slice(1);
    }
  } catch {
    return "N/A";
  }
}
