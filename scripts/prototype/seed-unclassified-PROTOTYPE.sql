-- PROTOTYPE, wipe me: seed data for the Unclassified page variants. Run it on a scratch database
-- only (it assumes an empty, migrated one): ~600 Transactions, ~18% Unclassified in 14 groups.
INSERT INTO bank (id, name) VALUES ('00000000-0000-4000-8000-00000000ba01', 'UBS');
INSERT INTO account (id, bank_id, name, kind, currency) VALUES
  ('00000000-0000-4000-8000-00000000ac01', '00000000-0000-4000-8000-00000000ba01', 'Private', 'current', 'CHF'),
  ('00000000-0000-4000-8000-00000000ac02', '00000000-0000-4000-8000-00000000ba01', 'Credit card', 'current', 'CHF');

INSERT INTO category_group (id, name, type, sort) VALUES
  ('00000000-0000-4000-8000-0000000000a1', 'Food', 'expense', 1),
  ('00000000-0000-4000-8000-0000000000a2', 'Transport', 'expense', 2),
  ('00000000-0000-4000-8000-0000000000a3', 'Home', 'expense', 3),
  ('00000000-0000-4000-8000-0000000000a4', 'Income', 'income', 4);
INSERT INTO category (id, group_id, name, sort) VALUES
  ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000a1', 'Groceries', 1),
  ('00000000-0000-4000-8000-0000000000c2', '00000000-0000-4000-8000-0000000000a1', 'Restaurants', 2),
  ('00000000-0000-4000-8000-0000000000c3', '00000000-0000-4000-8000-0000000000a1', 'Coffee', 3),
  ('00000000-0000-4000-8000-0000000000c4', '00000000-0000-4000-8000-0000000000a2', 'Public transport', 1),
  ('00000000-0000-4000-8000-0000000000c5', '00000000-0000-4000-8000-0000000000a2', 'Fuel', 2),
  ('00000000-0000-4000-8000-0000000000c6', '00000000-0000-4000-8000-0000000000a3', 'Rent', 1),
  ('00000000-0000-4000-8000-0000000000c7', '00000000-0000-4000-8000-0000000000a3', 'Utilities', 2),
  ('00000000-0000-4000-8000-0000000000c8', '00000000-0000-4000-8000-0000000000a4', 'Salary', 1);
INSERT INTO payee (name) VALUES ('Migros'), ('Coop'), ('SBB'), ('Acme AG');

-- ~490 classified Transactions (Groceries), spread over a year.
INSERT INTO "transaction" (account_id, is_manual, booking_date, amount_minor, currency, raw_description, category_id)
SELECT '00000000-0000-4000-8000-00000000ac01', true, date '2026-10-31' - (i % 365),
       -(1000 + (i * 37) % 9000), 'CHF', 'MIGROS ' || (i % 7), '00000000-0000-4000-8000-0000000000c1'
FROM generate_series(1, 490) AS i;

-- Unclassified groups: description, counterparty, how many, typical amount (minor units).
INSERT INTO "transaction" (account_id, is_manual, booking_date, amount_minor, currency, raw_description, counterparty_name)
SELECT CASE WHEN g.card THEN '00000000-0000-4000-8000-00000000ac02'::uuid
            ELSE '00000000-0000-4000-8000-00000000ac01'::uuid END,
       true, date '2026-10-30' - (i * 9 + length(g.description)) % 300, -(g.amount + (i * 13) % 300), 'CHF',
       g.description, g.counterparty
FROM (VALUES
  ('TWINT *STARBUCKS ZURICH HB', 'Starbucks', 24, 680, true),
  ('SBB CFF FFS MOBILE TICKET', 'SBB', 19, 1240, true),
  ('CARD PAYMENT VALORA KIOSK', 'Valora', 14, 450, true),
  ('LSV EWZ ELEKTRIZITAETSWERK', 'ewz', 11, 8900, false),
  ('TWINT *DENNER SATELLIT', 'Denner', 9, 2350, true),
  ('PAYPAL *STEAM GAMES', 'PayPal Europe', 7, 2490, true),
  ('ESSO TANKSTELLE OERLIKON', 'Esso', 6, 7400, true),
  ('APPLE.COM/BILL', 'Apple', 5, 300, true),
  ('DAUERAUFTRAG WG MIETE', 'Immo Verwaltung AG', 4, 145000, false),
  ('UBER *TRIP', 'Uber', 3, 2100, true),
  ('POST CH AG FILIALE', 'Die Post', 2, 950, false),
  ('ZALANDO PAYMENTS', 'Zalando', 2, 8900, true),
  ('BANCOMAT BEZUG', NULL, 1, 20000, false),
  ('', NULL, 1, 1500, false)
) AS g(description, counterparty, total, amount, card),
LATERAL generate_series(1, g.total) AS i;
