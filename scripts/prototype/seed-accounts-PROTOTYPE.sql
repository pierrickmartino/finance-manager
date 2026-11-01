-- PROTOTYPE, wipe me: seed data for the Accounts page variants. Run it on a scratch database
-- only (it assumes an empty, migrated one): 3 Banks, 7 Accounts of every Kind, CHF and EUR, a
-- year of Manual transactions, EUR rates, a snapshot-only 3a and one Balance snapshot mismatch.
INSERT INTO bank (id, name) VALUES
  ('00000000-0000-4000-8000-00000000ba01', 'UBS'),
  ('00000000-0000-4000-8000-00000000ba02', 'BCGE'),
  ('00000000-0000-4000-8000-00000000ba03', 'VIAC');

INSERT INTO account (id, bank_id, name, kind, currency, iban, import_format, opening_balance_minor, opening_date, archived_at) VALUES
  ('00000000-0000-4000-8000-00000000ac01', '00000000-0000-4000-8000-00000000ba01', 'Private', 'current', 'CHF', 'CH9300762011623852957', 'ubs_csv', 420000, '2025-10-01', NULL),
  ('00000000-0000-4000-8000-00000000ac02', '00000000-0000-4000-8000-00000000ba01', 'Savings', 'savings', 'CHF', 'CH5604835012345678009', 'ubs_csv', 2500000, '2025-10-01', NULL),
  ('00000000-0000-4000-8000-00000000ac03', '00000000-0000-4000-8000-00000000ba02', 'Household', 'current', 'CHF', 'CH4431999123000889012', 'camt053', 180000, '2025-10-01', NULL),
  ('00000000-0000-4000-8000-00000000ac04', '00000000-0000-4000-8000-00000000ba02', 'Euro account', 'current', 'EUR', 'CH1209000000123456789', 'camt053', 350000, '2025-10-01', NULL),
  ('00000000-0000-4000-8000-00000000ac05', '00000000-0000-4000-8000-00000000ba03', 'Pillar 3a', '3a', 'CHF', NULL, NULL, 3100000, '2025-10-01', NULL),
  ('00000000-0000-4000-8000-00000000ac06', '00000000-0000-4000-8000-00000000ba02', 'Mortgage', 'loan', 'CHF', NULL, NULL, -45000000, '2025-10-01', NULL),
  ('00000000-0000-4000-8000-00000000ac07', '00000000-0000-4000-8000-00000000ba01', 'Old card', 'current', 'CHF', NULL, NULL, 0, '2025-10-01', '2026-03-01');

-- A year of Manual transactions: salary in, spending out, monthly savings and amortisation.
INSERT INTO "transaction" (account_id, is_manual, booking_date, amount_minor, currency, raw_description)
SELECT '00000000-0000-4000-8000-00000000ac01', true, date '2025-10-25' + (m || ' months')::interval, 820000, 'CHF', 'SALARY ACME AG'
FROM generate_series(0, 12) AS m WHERE date '2025-10-25' + (m || ' months')::interval <= date '2026-10-31';
INSERT INTO "transaction" (account_id, is_manual, booking_date, amount_minor, currency, raw_description)
SELECT '00000000-0000-4000-8000-00000000ac01', true, date '2026-10-31' - i * 3, -(3000 + (i * 977) % 21000), 'CHF', 'CARD ' || (i % 9)
FROM generate_series(0, 120) AS i;
INSERT INTO "transaction" (account_id, is_manual, booking_date, amount_minor, currency, raw_description)
SELECT '00000000-0000-4000-8000-00000000ac02', true, date '2025-10-27' + (m || ' months')::interval, 150000, 'CHF', 'STANDING ORDER SAVINGS'
FROM generate_series(0, 12) AS m WHERE date '2025-10-27' + (m || ' months')::interval <= date '2026-10-31';
INSERT INTO "transaction" (account_id, is_manual, booking_date, amount_minor, currency, raw_description)
SELECT '00000000-0000-4000-8000-00000000ac03', true, date '2026-10-30' - i * 5, -(4000 + (i * 613) % 15000), 'CHF', 'MIGROS ' || (i % 5)
FROM generate_series(0, 70) AS i;
INSERT INTO "transaction" (account_id, is_manual, booking_date, amount_minor, currency, raw_description)
SELECT '00000000-0000-4000-8000-00000000ac03', true, date '2025-10-28' + (m || ' months')::interval, 120000, 'CHF', 'TRANSFER PRIVATE'
FROM generate_series(0, 12) AS m WHERE date '2025-10-28' + (m || ' months')::interval <= date '2026-10-31';
INSERT INTO "transaction" (account_id, is_manual, booking_date, amount_minor, currency, raw_description)
SELECT '00000000-0000-4000-8000-00000000ac04', true, date '2026-10-29' - i * 11, -(2500 + (i * 431) % 9000), 'EUR', 'AMAZON EU ' || i
FROM generate_series(0, 30) AS i;
INSERT INTO "transaction" (account_id, is_manual, booking_date, amount_minor, currency, raw_description)
SELECT '00000000-0000-4000-8000-00000000ac06', true, date '2025-12-31' + (q * 3 || ' months')::interval, 250000, 'CHF', 'AMORTISATION'
FROM generate_series(0, 3) AS q WHERE date '2025-12-31' + (q * 3 || ' months')::interval <= date '2026-10-31';
INSERT INTO "transaction" (account_id, is_manual, booking_date, amount_minor, currency, raw_description)
VALUES ('00000000-0000-4000-8000-00000000ac07', true, '2025-11-15', -12000, 'CHF', 'OLD CARD'),
       ('00000000-0000-4000-8000-00000000ac07', true, '2026-02-20', 12000, 'CHF', 'OLD CARD SETTLE');

-- Snapshot-only 3a: quarterly statements. One Balance snapshot on Household that disagrees.
INSERT INTO balance_snapshot (account_id, date, balance_minor) VALUES
  ('00000000-0000-4000-8000-00000000ac05', '2025-12-31', 3240000),
  ('00000000-0000-4000-8000-00000000ac05', '2026-03-31', 3365000),
  ('00000000-0000-4000-8000-00000000ac05', '2026-06-30', 3410000),
  ('00000000-0000-4000-8000-00000000ac05', '2026-09-30', 3522000),
  ('00000000-0000-4000-8000-00000000ac03', '2026-09-30', 155000);

-- EUR rates, daily for a year, drifting around 0.94.
INSERT INTO fx_rate (date, currency, rate_to_chf)
SELECT d::date, 'EUR', 0.93 + 0.02 * sin(extract(doy FROM d) / 30.0)
FROM generate_series(date '2025-09-01', date '2026-10-30', interval '1 day') AS d;
INSERT INTO fx_fetch_status (source, last_attempt_at, last_success_at)
VALUES ('ecb', now(), now());
