// See REQUIREMENTS.md "The rake/settlement invariant" and "Deterministic
// tie-break". Computed once at close as a starting point — the host can
// freely reassign who-pays-whom afterward; this function never re-runs
// automatically once transfers exist in the database.

export type PlayerForSettlement = {
  gamePlayerId: string
  name: string
  netBanks: number // cashout - invested, already computed by the caller
}

export type ComputedTransfer = {
  fromPlayerId: string
  toPlayerId: string
  amountBanks: number
}

export function computeInitialSettlement(players: PlayerForSettlement[]): ComputedTransfer[] {
  type Bal = { id: string; net: number }
  const creditors: Bal[] = players
    .filter((p) => p.netBanks > 0.01)
    .map((p) => ({ id: p.gamePlayerId, net: p.netBanks }))
    .sort((a, b) => b.net - a.net || a.id.localeCompare(b.id))
  const debtors: Bal[] = players
    .filter((p) => p.netBanks < -0.01)
    .map((p) => ({ id: p.gamePlayerId, net: p.netBanks }))
    .sort((a, b) => a.net - b.net || a.id.localeCompare(b.id))

  const transfers: ComputedTransfer[] = []
  let ci = 0
  let di = 0
  while (ci < creditors.length && di < debtors.length) {
    const c = creditors[ci]
    const d = debtors[di]
    const amt = Math.min(c.net, -d.net)
    if (amt > 0.01) {
      transfers.push({
        fromPlayerId: d.id,
        toPlayerId: c.id,
        amountBanks: Math.round(amt),
      })
    }
    c.net -= amt
    d.net += amt
    if (c.net <= 0.01) ci++
    if (d.net >= -0.01) di++
  }
  return transfers
}
