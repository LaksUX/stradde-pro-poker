// See REQUIREMENTS.md "Money model" — Chips decision (ninth revision,
// direction corrected by the fourteenth, real chip denominations set by the
// fifteenth). Banks are the stored, calculated unit. Chips are a pure
// display conversion applied at render time; they never enter the
// invariant or any calculation. This file is the one place that conversion
// happens — every screen should import from here rather than re-deriving
// the multiplier locally.

export type ChipRatio = '1:1' | '1:2'

// Real physical-chip denominations, confirmed explicitly (see the
// fifteenth revision note): a 1:1 table plays with 10000-value chips, a 1:2
// table with 5000-value chips — half as many chips for the same bank, same
// "coarser unit at 1:2" relationship as before, just real-looking numbers
// instead of an abstract 1/0.5.
export function chipMultiplier(ratio: ChipRatio): number {
  return ratio === '1:2' ? 5000 : 10000
}

export function toChips(banks: number, ratio: ChipRatio): number {
  return Math.round(banks * chipMultiplier(ratio))
}

/** Primary chips figure + secondary bank figure, e.g. "22 chips (11 banks)". */
export function formatValue(banks: number, ratio: ChipRatio): { chips: number; banks: number } {
  return { chips: toChips(banks, ratio), banks: Math.round(banks) }
}
