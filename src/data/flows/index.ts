import type { Flow } from '../../lib/flow.ts';
import { NO_CHAIN, snapshotSource } from '../api/build.ts';
import type { Source } from '../api/endpoints.ts';
import { hardcodedFlows } from './hardcoded.ts';
import { inquiryFlow, makeInquiryFlow } from './inquiry.ts';
import { makePaymentFlow, paymentFlow } from './payment.ts';

/** From the committed snapshot, in the order the sketch lists them under "Transaction Flows", then the hard-coded ones. */
export const flows: Flow[] = [inquiryFlow, paymentFlow, ...hardcodedFlows];

/** Every flow, the API's from one answer. If the answer lacks a chain an API flow needs, both fall back to the snapshot and say why. */
export function flowsFrom(source: Source): Flow[] {
  const built = [makeInquiryFlow(source), makePaymentFlow(source)];
  const missing = built.flatMap((f) => f.gaps).find((g) => g.startsWith(NO_CHAIN));
  return missing && source.live ? flowsFrom({ ...snapshotSource, error: missing }) : [...built, ...hardcodedFlows];
}
