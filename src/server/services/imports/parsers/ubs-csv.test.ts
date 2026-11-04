import { describe, expect, it } from 'vitest';
import { parseUbsCsv } from './ubs-csv';

const encode = (lines: string[]): Uint8Array =>
  new TextEncoder().encode(`﻿${lines.join('\r\n')}\r\n`);

const HEADER =
  'Date de transaction;Heure de transaction;Date de comptabilisation;Date de valeur;{CURRENCY};Débit;Crédit;Sous-montant;Solde;No de transaction;Description1;Description2;Description3;Notes de bas de page;';

/** The newer UBS layout: `Évaluation en` in the metadata and a `Devise` column. */
const DEVISE_LAYOUT = encode([
  'Numéro de compte:;0235 00123456.01;',
  'IBAN:;CH69 0023 5235 1234 5601 0;',
  'Du:;2026-09-01;',
  'Au:;2026-09-30;',
  'Solde initial:;1000.00;',
  'Solde final:;1985.00;',
  'Évaluation en:;CHF;',
  'Nombre de transactions dans cette période:;3;',
  '',
  HEADER.replace('{CURRENCY}', 'Devise'),
  '2026-09-30;;2026-09-30;2026-09-30;CHF;-15.00;;;1985.00;CR01773HJ0000001;Solde décompte des prix prestations;;No de transaction: CR01773HJ0000001;;',
  '2026-09-25;;2026-09-25;2026-09-25;CHF;-500.00;;;2000.00;5179268TO0000002;"Piscines Exemple SA;Route Exemple 1; 1200 Genève; CH";Ordre e-banking;"Reference no. QRR: 23 84670 00000 00000 20260 54611; Motif du paiement: Facture finale; Account no. IBAN: CH78 0900 0000 0123 4567 8; Coûts: E-Banking intérieur; No de transaction: 5179268TO0000002";;',
  '2026-09-07;;2026-09-07;2026-09-08;CHF;;1500.00;;2500.00;ZD81250ZC0000003;"Caisse Exemple;Rue Exemple 2; 1201 Genève; CH";credit;"Motif du paiement: Allocations familiales; Account no. 02350000123456M10000; Coûts: Entrée paiement SIC; No de transaction: ZD81250ZC0000003";;',
]);

describe('UBS CSV parser', () => {
  it('reads the layout with "Évaluation en" and a "Devise" column', () => {
    const statement = parseUbsCsv(DEVISE_LAYOUT);

    expect(statement).toMatchObject({
      iban: 'CH6900235235123456010',
      currency: 'CHF',
      from: '2026-09-01',
      to: '2026-09-30',
      openingBalanceMinor: 100000,
      closingBalanceMinor: 198500,
    });
    expect(
      statement.entries.map((e) => [e.bookingDate, e.valueDate, e.amountMinor, e.bankReference]),
    ).toEqual([
      ['2026-09-07', '2026-09-08', 150000, 'ZD81250ZC0000003'],
      ['2026-09-25', '2026-09-25', -50000, '5179268TO0000002'],
      ['2026-09-30', '2026-09-30', -1500, 'CR01773HJ0000001'],
    ]);
  });

  it('reads "Motif du paiement" and "Account no. IBAN" from Description3', () => {
    const [credit, payment, fee] = parseUbsCsv(DEVISE_LAYOUT).entries;

    expect(payment).toMatchObject({
      paymentReference: 'Facture finale',
      counterpartyIban: 'CH7809000000012345678',
      counterpartyName: 'Piscines Exemple SA;Route Exemple 1; 1200 Genève; CH',
    });
    // A plain account number is not an IBAN.
    expect(credit).toMatchObject({
      paymentReference: 'Allocations familiales',
      counterpartyIban: null,
    });
    expect(fee).toMatchObject({ paymentReference: null, counterpartyIban: null });
  });

  it('names both currency labels when neither is in the metadata', () => {
    const text = new TextDecoder().decode(DEVISE_LAYOUT).replace('Évaluation en:;CHF;', '');

    expect(() => parseUbsCsv(new TextEncoder().encode(text))).toThrow(
      'the header has no "Monnaie" or "Évaluation en"',
    );
  });

  it('names both currency columns when neither is in the table header', () => {
    const text = new TextDecoder().decode(DEVISE_LAYOUT).replace(';Devise;', ';Currency;');

    expect(() => parseUbsCsv(new TextEncoder().encode(text))).toThrow(
      'the column "Monnaie" or "Devise" is missing',
    );
  });
});
