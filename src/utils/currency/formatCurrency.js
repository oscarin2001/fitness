// @utils/currency/formatCurrency.js

export function formatCurrency(amount) {
  const validAmount = typeof amount === "number" && !isNaN(amount) ? amount : 0;
  return new Intl.NumberFormat("es-BO", {
    style: "currency",
    currency: "BOB",
    minimumFractionDigits: 2,
  }).format(validAmount);
}
