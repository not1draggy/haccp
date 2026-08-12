/**
 * Vyhodnotenie nameranej hodnoty voči limitu.
 *
 * Rovnaký výpočet potreboval kiosk pri zápise, kiosk pri vykresľovaní dlaždíc
 * aj DB trigger measurements_resolve. Tri kópie toho istého pravidla sú pri
 * regulovanom zázname riziko: keby sa jedna rozišla, tablet by ukazoval iný
 * stav, než aký je zapísaný v denníku. Autoritatívny zostáva DB trigger —
 * tento modul musí dávať rovnaký výsledok a je krytý testami.
 */

export type Limits = { minC: number | null; maxC: number | null };
export type MeasurementStatus = 'ok' | 'alarm';

type LimitSource = { min_c: number | string | null; max_c: number | string | null };

function toNumber(value: number | string | null | undefined): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Vlastný limit zariadenia má prednosť pred globálnym pravidlom — prevádzka
 * si smie nastaviť prísnejšiu hranicu, než akú vyžaduje predpis.
 *
 * Prednosť sa rieši pre každú hranicu zvlášť: zariadenie so zadaným iba
 * maximom si spodnú hranicu naďalej berie z pravidla.
 */
export function resolveLimits(
  device: LimitSource | null | undefined,
  rule: LimitSource | null | undefined,
): Limits {
  const deviceMin = toNumber(device?.min_c);
  const deviceMax = toNumber(device?.max_c);
  return {
    minC: deviceMin != null ? deviceMin : toNumber(rule?.min_c),
    maxC: deviceMax != null ? deviceMax : toNumber(rule?.max_c),
  };
}

/**
 * Hranica je vrátane: hodnota rovná limitu ešte vyhovuje. Alarm nastane až
 * pri prekročení, inak by chladnička nastavená presne na 5 °C hlásila poplach
 * pri každom korektnom meraní.
 */
export function evaluateStatus(valueC: number, limits: Limits): MeasurementStatus {
  const belowMin = limits.minC != null && valueC < limits.minC;
  const aboveMax = limits.maxC != null && valueC > limits.maxC;
  return belowMin || aboveMax ? 'alarm' : 'ok';
}
