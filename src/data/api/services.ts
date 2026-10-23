import type { Family, NodeKind, SketchBlock } from '../../lib/flow.ts';

export interface Service {
  /** Short and stable: it is the step's id on the canvas and in deep links. */
  id: string;
  label: string;
  kind: NodeKind;
  family: Family;
  /** The block of KJ's sketch this service is, where the sketch draws it. */
  sketch?: SketchBlock;
}

/**
 * The flow API's services, keyed by the names it returns. Labels follow KJ's sketch where it draws the step;
 * the rest, and the families of services the sketch does not draw, are read from the names.
 */
export const services: Record<string, Service> = {
  'raast-api-gateway': { id: 'gateway', label: 'Raast API Gateway', kind: 'party', family: 'raast' },
  'mpg-incoming-billing-service': { id: 'incoming', label: 'Incoming Bill', kind: 'inbound', family: 'raast', sketch: 'incoming' },
  'web-service-interface': { id: 'wsi', label: 'WSI', kind: 'wsi', family: 'rsop', sketch: 'wsi' },
  'queue-processor': { id: 'queue', label: 'RabbitMQ', kind: 'queue', family: 'queue', sketch: 'queue' },
  'rest-handler': { id: 'rest', label: 'REST', kind: 'rest', family: 'outbound', sketch: 'rest' },
  'fbr-biller-mock': { id: 'biller', label: 'Government biller', kind: 'biller', family: 'biller', sketch: 'biller' },
  raast: { id: 'raast', label: 'Raast', kind: 'party', family: 'raast' },
  'notification-service': { id: 'notify', label: 'Notification', kind: 'notify', family: 'rsop' },
  'notification-broker-service': { id: 'broker', label: 'Notification broker', kind: 'queue', family: 'queue' },
  'receiving-service': { id: 'receive', label: 'Receiving', kind: 'inbound', family: 'rsop' },
  'saf-dispatcher': { id: 'saf-dispatch', label: 'SAF dispatcher', kind: 'saf', family: 'store' },
  'saf-consumer': { id: 'saf-consume', label: 'SAF consumer', kind: 'rest', family: 'outbound' },
  // Services of the hard-coded flows in talha-bhai-api.ts. Exit systems reuse the biller's kind.
  channel: { id: 'channel', label: 'Channel', kind: 'channel', family: 'raast' },
  'cas-service': { id: 'cas', label: 'CAS service', kind: 'inbound', family: 'rsop' },
  'mpg-incoming-title-fetch': { id: 'incoming', label: 'Incoming Title Fetch', kind: 'inbound', family: 'raast' },
  cbs: { id: 'cbs', label: 'Core banking', kind: 'biller', family: 'biller' },
  'acquiring-system': { id: 'acquirer', label: 'Acquiring system', kind: 'biller', family: 'biller' },
  CAS: { id: 'cas-directory', label: 'CAS', kind: 'biller', family: 'biller' },
};
