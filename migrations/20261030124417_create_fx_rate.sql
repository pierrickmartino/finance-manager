-- Up Migration
-- FX rates into the Base currency (CHF), one per day and Currency (ADR-0002). CHF itself is
-- never stored: its rate is 1. Days without a rate (weekends, holidays) have no row; lookups
-- use the most recent earlier one.
CREATE TABLE fx_rate (
  date date NOT NULL,
  currency char(3) NOT NULL CONSTRAINT fx_rate_currency_check CHECK (currency ~ '^[A-Z]{3}$'),
  -- How many CHF one unit of `currency` is worth.
  rate_to_chf numeric(20, 10) NOT NULL CONSTRAINT fx_rate_positive CHECK (rate_to_chf > 0),
  CONSTRAINT fx_rate_pkey PRIMARY KEY (date, currency)
);

-- Lookup "latest rate on or before a date" for one Currency.
CREATE INDEX fx_rate_currency_date ON fx_rate (currency, date DESC);

-- When rates were last fetched from a source, for the rate status. Not History (story 117).
CREATE TABLE fx_fetch_status (
  source text PRIMARY KEY,
  last_attempt_at timestamptz NOT NULL,
  last_success_at timestamptz,
  last_error text
);

-- Down Migration
DROP TABLE fx_fetch_status;
DROP TABLE fx_rate;
