# Bank file anonymiser

A standalone command-line tool, separate from the app, that turns a real bank export into a file that is safe to commit as a parser test fixture. It supports the three Import formats:

| Format | `--format` | Encoding kept |
| --- | --- | --- |
| UBS CSV | `ubs-csv` | UTF-8 (BOM kept if present) |
| BCGE CAMT.053 (camt.053.001.04) | `camt053` | UTF-8 |
| Crédit Agricole OFX 1.02 SGML | `ofx` | Windows-1252 |

## Usage

```sh
cd tools/anonymiser
pnpm install
pnpm anonymise ../../bank-exports/ubs-2025-03.csv --seed "$MY_SECRET_SEED"
# writes ../../bank-exports/ubs-2025-03.anonymised.csv
```

Options:

- `--seed <secret>`, or the `ANONYMISER_SEED` environment variable (required). The same seed gives the same fakes on every run, so re-running is reproducible.
- `--format ubs-csv|camt053|ofx` forces the format. By default it is detected from the content.
- `--out <path>` sets the output path. By default the output is written next to the input as `<name>.anonymised.<ext>`.

Keep real exports in `bank-exports/` at the repository root, or name them `*.real.csv`, `*.real.xml` or `*.real.ofx`. Git ignores all of these.

After the run, **review the output by eye** before you copy it into `test/fixtures/import/<bank>/`.

## What it does

**Kept unchanged:** the layout (columns, elements, tags, delimiters, quoting), the encoding, line endings, dates and times, amounts and signs, balances (opening, closing and running), currency and country codes, bank codes (BIC, bank clearing number, OFX `BANKID`), and transaction counts.

**Replaced:** names, addresses, IBANs, account numbers, bank references (`No de transaction`, `AcctSvcrRef`, `EndToEndId`, `FITID`, QR references and other ids) and payment text.

- Each value is replaced with a fake derived from HMAC(seed, value). The same value always gets the same fake, within a file and across files anonymised with the same seed. A Transfer between a UBS and a BCGE account still shows the same (fake) IBAN on both sides, and duplicates stay duplicates.
- Fakes keep the length and character classes of the original: digits stay digits, letters keep their case, and accented letters stay accented (using letters that exist in Windows-1252). Free text is replaced word by word, so an OFX `NAME` that is a truncated `MEMO` still matches its fake `MEMO`.
- A fake IBAN keeps the country, the bank code and the spacing, and has valid check digits.
- Labels inside UBS `Description3` (`Motif du paiement:`, `No de compte:`, `No de transaction:`, ...) are kept so the app's parser still finds the fields.
- The text of an element or column the tool does not know is **replaced**, not kept, so an unexpected field never leaks.

Before writing, the tool parses its own output back and stops with an error if any date, amount or balance changed, if the structure no longer parses, or if an original IBAN is still present. It also reports whether the balances reconcile.

## Keep the seed secret

Anyone who knows the seed can test guesses ("is this fake the name *Dupont*?") against the output. Use a private seed, keep it out of the repository, and reuse it for every file you want to stay consistent with each other.

## Development

```sh
pnpm test        # Vitest, synthetic inputs only (test/inputs/)
pnpm typecheck
```

The inputs in `test/inputs/` are synthetic and hand-written: every name, IBAN and reference in them is made up.
