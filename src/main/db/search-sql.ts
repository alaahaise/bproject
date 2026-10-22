/** Colonne comparée sans casse, espaces ni tirets (« 12345-116-16 » = « 1234511616 »). */
export const stripped = (column: string): string =>
  `REPLACE(REPLACE(REPLACE(REPLACE(UPPER(${column}),'-',''),' ',''),'.',''),'/','')`
