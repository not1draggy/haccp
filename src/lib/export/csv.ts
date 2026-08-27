/**
 * Zostavenie CSV pre export meraní.
 *
 * Excel v slovenskom locale očakáva bodkočiarku ako oddeľovač a bez BOM
 * zobrazí diakritiku ako „ChladniÄka". Oboje je tu zámerné.
 */

export const CSV_DELIMITER = ';';
export const CSV_BOM = '﻿';

/**
 * Excel a LibreOffice vyhodnotia bunku začínajúcu = + - @ (alebo tabulátorom
 * či CR) ako vzorec. Názvy zariadení a texty nápravných opatrení píše
 * používateľ, takže by sa do exportu dal prepašovať vzorec, ktorý sa spustí
 * na počítači toho, kto súbor otvorí — spravidla vedúci alebo kontrolór.
 * Apostrof pred hodnotou z nej spraví text a Excel ho pri zobrazení skryje.
 *
 * Záporná teplota („-18,5") tiež začína mínusom, ale je to číslo a musí ním
 * v Exceli zostať — apostrof preto dostane len to, čo číslo nie je.
 */
export function csvCell(value: string | number | null | undefined): string {
  if (value == null) return '';
  let s = String(value);

  const isNumeric = /^-?\d+([.,]\d+)?$/.test(s);
  if (!isNumeric && /^[=+\-@\t\r]/.test(s)) {
    s = `'${s}`;
  }

  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function csvRow(cells: (string | number | null | undefined)[]): string {
  return cells.map(csvCell).join(CSV_DELIMITER);
}
