import { describe, expect, it } from 'vitest';
import { createEcbRateSource, parseEcbCsv } from './ecb-source';

// Shape of the ECB Data Portal `format=csvdata&detail=dataonly` answer.
const CSV = [
  'KEY,FREQ,CURRENCY,CURRENCY_DENOM,EXR_TYPE,EXR_SUFFIX,TIME_PERIOD,OBS_VALUE',
  'EXR.D.CHF.EUR.SP00.A,D,CHF,EUR,SP00,A,2025-04-17,0.9320',
  'EXR.D.CHF.EUR.SP00.A,D,CHF,EUR,SP00,A,2025-04-22,0.9351',
  'EXR.D.USD.EUR.SP00.A,D,USD,EUR,SP00,A,2025-04-17,1.1355',
  'EXR.D.USD.EUR.SP00.A,D,USD,EUR,SP00,A,2025-04-22,NaN',
  '',
].join('\r\n');

describe('ECB CSV', () => {
  it('groups observations by day and skips missing ones', () => {
    expect(parseEcbCsv(`﻿${CSV}`)).toEqual([
      { date: '2025-04-17', perEur: { CHF: '0.9320', USD: '1.1355' } },
      { date: '2025-04-22', perEur: { CHF: '0.9351' } },
    ]);
  });

  it('finds columns by name, including after quoted fields with commas', () => {
    const csv = [
      'KEY,CURRENCY,TITLE_COMPL,TIME_PERIOD,OBS_VALUE',
      'EXR.D.CHF.EUR.SP00.A,CHF,"ECB reference exchange rate, Swiss franc/Euro, 2:15 pm (C.E.T.)",2025-04-17,0.9320',
    ].join('\n');
    expect(parseEcbCsv(csv)).toEqual([{ date: '2025-04-17', perEur: { CHF: '0.9320' } }]);
  });

  it('reads an empty answer as no rates and refuses an unknown layout', () => {
    expect(parseEcbCsv('')).toEqual([]);
    expect(() => parseEcbCsv('DATE,VALUE\n2025-04-17,0.93')).toThrow('no CURRENCY column');
  });
});

describe('ECB source', () => {
  function respond(status: number, body = '') {
    const requests: URL[] = [];
    const fetchImpl = (async (input: URL) => {
      requests.push(input);
      return new Response(body || null, { status });
    }) as unknown as typeof fetch;
    return { source: createEcbRateSource(fetchImpl), requests };
  }

  it('asks for the daily reference rates of each Currency against EUR', async () => {
    const { source, requests } = respond(200, CSV);

    const days = await source.fetchReferenceRates({
      currencies: ['CHF', 'USD'],
      from: '2025-04-17',
      to: '2025-04-22',
    });

    expect(days).toHaveLength(2);
    expect(requests[0]!.toString()).toBe(
      'https://data-api.ecb.europa.eu/service/data/EXR/D.CHF+USD.EUR.SP00.A' +
        '?startPeriod=2025-04-17&endPeriod=2025-04-22&format=csvdata&detail=dataonly',
    );
  });

  it('reads "no results" as no rates, and throws on other errors', async () => {
    const request = { currencies: ['CHF'], from: '2025-04-19', to: '2025-04-20' };
    await expect(respond(404).source.fetchReferenceRates(request)).resolves.toEqual([]);
    await expect(respond(503).source.fetchReferenceRates(request)).rejects.toThrow(
      'ECB answered 503',
    );
  });

  it('names the reason when the ECB cannot be reached', async () => {
    const offline = (async () => {
      throw new TypeError('fetch failed', {
        cause: new Error('getaddrinfo ENOTFOUND data-api.ecb.europa.eu'),
      });
    }) as unknown as typeof fetch;

    await expect(
      createEcbRateSource(offline).fetchReferenceRates({
        currencies: ['CHF'],
        from: '2025-04-17',
        to: '2025-04-17',
      }),
    ).rejects.toThrow('Could not reach the ECB: getaddrinfo ENOTFOUND data-api.ecb.europa.eu');
  });
});
