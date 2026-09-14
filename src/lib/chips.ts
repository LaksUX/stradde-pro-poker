// See REQUIREMENTS.md "Money model" — Chips decision (ninth revision).
// Banks are the stored, calculated unit. Chips are a pure display conversion
// applied at render time; they never enter the invariant or any calculation.
// This file is the one place that conversion happens — every screen should
// import from here rather than re-deriving the multiplier locally.

export type ChipRatio = '1:1' | '1:2'

export function chipMultiplier(ratio: ChipRatio): number {
  return ratio === '1:2' ? 2 : 1
}

export function toChips(banks: number, ratio: ChipRatio): number {
  return Math.round(banks * chipMultiplier(ratio))
}

/** Primary chips figure + secondary bank figure, e.g. "22 chips (11 banks)". */
export function formatValue(banks: number, ratio: ChipRatio): { chips: number; banks: number } {
  return { chips: toChips(banks, ratio), banks: Math.round(banks) }
}
