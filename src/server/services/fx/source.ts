/**
 * The ECB reference rate source, behind an interface so tests can stub it (the only test
 * double, per the spec). The real adapter is `src/server/fx/ecb-source.ts`.
 */
export interface ReferenceRateRequest {
  /** ISO codes of the Currencies wanted, quoted against EUR (never EUR itself). */
  currencies: readonly string[];
  /** Inclusive ISO dates. */
  from: string;
  to: string;
}

/** One ECB publication day: how many units of each Currency one EUR buys, as decimal text. */
export interface ReferenceRateDay {
  date: string;
  perEur: Readonly<Record<string, string>>;
}

export interface EcbRateSource {
  /** Every publication day in the range. Days without a publication are simply absent. */
  fetchReferenceRates(request: ReferenceRateRequest): Promise<ReferenceRateDay[]>;
}
