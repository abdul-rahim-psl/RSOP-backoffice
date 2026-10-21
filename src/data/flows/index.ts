import type { Flow } from '../../lib/flow.ts';
import { inquiryFlow } from './inquiry.ts';
import { paymentFlow } from './payment.ts';

/** In the order the sketch lists them under "Transaction Flows". */
export const flows: Flow[] = [inquiryFlow, paymentFlow];
