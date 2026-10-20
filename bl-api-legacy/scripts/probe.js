/* Read-only connectivity probe for the HFSQL database. */
require('dotenv').config({ quiet: true });
const odbc = require('odbc');

(async () => {
  const connectionString =
    process.env.HFSQL_CONN ||
    'DSN=allaa;RepFic=C:\\Users\\Admin\\Documents\\project\\DOSSIER\\D001\\';

  console.log('Connecting...');
  const connection = await odbc.connect(connectionString);
  console.log('Connected.');

  const rows = Array.from(
    await connection.query(
      `SELECT IDMouvement AS id, Reference AS reference, Annee AS docYear,
              Numero AS docNumber, Date AS docDate, Statut AS status,
              IdTiers AS clientId, HT AS totalHt, TTC AS totalTtc
         FROM Mouvement
        WHERE Type = 23 AND Reference = 'BL26-05255'`
    )
  );
  console.log('Header:', rows);

  if (rows.length) {
    const id = Number(rows[0].id);
    const lines = Array.from(
      await connection.query(
        `SELECT IDLigne_MT AS lineId, IDArticle AS articleId, Libelle AS lineLabel,
                Qte AS quantity, Prix_HT AS unitPriceHt, Resultat_HT AS totalHt
           FROM Ligne_MT
          WHERE IDMouvement = ${id} AND Type = 23
          ORDER BY IDLigne_MT`
      )
    );
    console.log('Lines:', lines);

    const tiers = Array.from(
      await connection.query(
        `SELECT IdTiers AS id, Code AS code, Libelle AS name
           FROM Tiers WHERE IdTiers = ${Number(rows[0].clientId)}`
      )
    );
    console.log('Client:', tiers);
  }

  const byNumber = Array.from(
    await connection.query(
      `SELECT Reference AS reference, Annee AS docYear, Numero AS docNumber, Date AS docDate
         FROM Mouvement
        WHERE Type = 23 AND Numero = 5255`
    )
  );
  console.log('Number-only matches:', byNumber);

  await connection.close();
  console.log('Closed.');
  // The HFSQL ODBC driver can crash during native teardown on Node 24.
  // The explicit exit keeps the probe's exit code clean.
  process.exit(0);
})().catch((err) => {
  console.error('PROBE FAILED:', err);
  process.exit(1);
});
