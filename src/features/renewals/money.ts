/**
 * RENEWALS — how money is written, everywhere a price from the studio's
 * package table is shown (the Renewal Brief, the packages screen).
 *
 * One formatter so the two screens can never print the same figure two ways.
 * The amount is rounded to the cent FIRST and only then asked whether it is
 * whole, so 119.999 reads "$120" rather than "$120.00".
 */

/** "$480", "$5,760", "$67.50". */
export function formatMoney(n: number): string {
  const cents = Math.round(n * 100) / 100;
  return `$${cents.toLocaleString("en-US", {
    minimumFractionDigits: Number.isInteger(cents) ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

/** "+$10", "−$80" (a true minus sign), "—" for nothing or no difference. */
export function signedMoney(n: number | null): string {
  if (n === null) return "—";
  const cents = Math.round(n * 100) / 100;
  if (cents === 0) return "—";
  return `${cents < 0 ? "−" : "+"}${formatMoney(Math.abs(cents))}`;
}
