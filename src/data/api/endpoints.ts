// Where RSOP's flow API lives; `npm run api:pull` reads these, and the build reads only the snapshot.

/** Overridden by RSOP_API_BASE when pulling. */
export const API_BASE = 'http://10.0.70.144:9991';

/** Each answers a JSON object whose values are chains; payment answers two. */
export const ENDPOINTS = ['/api/v1/billInquiryFlow', '/api/v1/billPaymentFlow'] as const;

export type Endpoint = (typeof ENDPOINTS)[number];

export interface Snapshot {
  baseUrl: string;
  /** ISO time of the pull that last changed a chain. */
  fetchedAt: string;
  /** The API's responses, verbatim, so a parser change never needs a new pull. */
  responses: Record<Endpoint, Record<string, string>>;
}
