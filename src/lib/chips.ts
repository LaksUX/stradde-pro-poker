// See REQUIREMENTS.md "Money model" — Chips decision (ninth revision,
// direction corrected by the fourteenth, real chip denominations set by the
// fifteenth). Banks are the stored, calculated unit. Chips are a pure
// display conversion applied at render time; they never enter the
// invariant or any calculation. This file is the one place that conversion
// happens — every screen should import from here rather than re-deriving
// the multiplier locally.

export type ChipRatio = '1:1' | '1:2'

// One buy-in is one bank is 10,000 points, at every table. The ratio (1:1 or
// 1:2) only says how a bank relates to real value at that table; it never
// changes what is shown, and nothing here shows currency.
export function chipMultiplier(_ratio: ChipRatio): number {
  return 10000
}

export function toChips(banks: number, ratio: ChipRatio): number {
  return Math.round(banks * chipMultiplier(ratio))
}

// What a host types (in the same units the app shows) back to stored banks.
export function fromChips(chips: number, ratio: ChipRatio): number {
  return Math.round((chips / chipMultiplier(ratio)) * 10000) / 10000
}

// Display string with thousands separators (en-US so grouping is predictable).
export function formatChips(banks: number, ratio: ChipRatio): string {
  return toChips(banks, ratio).toLocaleString('en-US')
}

/** Primary chips figure + secondary bank figure, e.g. "22 chips (11 banks)". */
export function formatValue(banks: number, ratio: ChipRatio): { chips: number; banks: number } {
  return { chips: toChips(banks, ratio), banks: Math.round(banks) }
}
