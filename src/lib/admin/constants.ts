/**
 * Zdieľané konštanty administrácie.
 *
 * Zámerne mimo súborov s 'use server' — tie smú exportovať iba async funkcie,
 * inak Next.js build zlyhá.
 */

/** Zvolená prevádzka. Hodnota sa vždy overuje proti DB, nie je autoritatívna. */
export const LOCATION_COOKIE = 'haccp_location';

/**
 * Náhrada za chýbajúce id prevádzky vo filtroch. Prázdny reťazec sa v Postgres
 * nedá pretypovať na uuid, takže `.eq('location_id', '')` zhodí celú stránku
 * na 500 — nastane to napr. keď admin deaktivuje jedinú prevádzku.
 * Toto UUID nikdy neexistuje, takže dotaz korektne vráti prázdny výsledok.
 */
export const NO_LOCATION = '00000000-0000-0000-0000-000000000000';
