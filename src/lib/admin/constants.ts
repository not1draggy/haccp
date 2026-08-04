/**
 * Zdieľané konštanty administrácie.
 *
 * Zámerne mimo súborov s 'use server' — tie smú exportovať iba async funkcie,
 * inak Next.js build zlyhá.
 */

/** Zvolená prevádzka. Hodnota sa vždy overuje proti DB, nie je autoritatívna. */
export const LOCATION_COOKIE = 'haccp_location';
