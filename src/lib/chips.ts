// See REQUIREMENTS.md "Money model" — Chips decision (ninth revision,
// direction corrected by the fourteenth). Banks are the stored, calculated
// unit. Chips are a pure display conversion applied at render time; they
// never enter the invariant or any calculation. This file is the one place
// that conversion happens — every screen should import from here rather
// than re-deriving the multiplier locally.

export type ChipRatio = '1:1' | '1:2'

// '1:2' — a chip is the coarser, larger-value unit: 2 banks = 1 chip.
export function chipMultiplier(ratio: ChipRatio): number {
  return ratio === '1:2' ? 0.5 : 1
}

export function toChips(banks: number, ratio: ChipRatio): number {
  return Math.round(banks * chipMultiplier(ratio))
}

/** Primary chips figure + secondary bank figure, e.g. "22 chips (11 banks)". */
export function formatValue(banks: number, ratio: ChipRatio): { chips: number; banks: number } {
  return { chips: toChips(banks, ratio), banks: Math.round(banks) }
}
