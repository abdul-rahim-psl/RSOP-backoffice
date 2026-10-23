// Flow chains RSOP's flow API does not serve yet, hard-coded in the API's own notation.
// When the API starts returning one, move its key to ENDPOINTS in endpoints.ts and delete it here.

export const TALHA_BHAI_API: Record<string, string> = {
  p2pIncoming1:
    'Start-->raast-->GET PACS008-->notification-service-->notification-broker-service-->receiving-service<-->cbs<-->receiving-service<-->Post PACS002 AUTH<-->web-service-interface<-->queue-processor<-->rest-handler<-->raast-->END',
  p2pIncoming2:
    'Start-->raast-->GET PACS002 ACSP-->notification-service-->notification-broker-service-->receiving-service<-->cbs-->END',

  p2pOutgoing1: 'Start<-->channel<-->cas-service<-->web-service-interface<-->queue-processor<-->rest-handler<-->Post PACS008<-->raast-->END',
  p2pOutgoing2: 'Start-->raast-->GET PACS002 ACSP-->notification-service-->notification-broker-service-->cas-service<-->channel-->END',

  incomingTitleFetch:
    'Start<-->raast-api-gateway<-->mpg-incoming-title-fetch<-->web-service-interface<-->queue-processor<-->rest-handler<-->cbs-->END',

  outgoingTitleFetch: 'Start<-->channel<-->cas-service<-->web-service-interface<-->queue-processor<-->rest-handler<-->raast-api-gateway-->END',

  raastIDInquiry: 'Start<-->channel<-->cas-service<-->web-service-interface<-->queue-processor<-->rest-handler<-->CAS-->END',

  p2mIncoming1:
    'Start-->raast-->GET PACS008-->notification-service-->notification-broker-service-->receiving-service<-->acquiring-system<-->receiving-service<-->Post PACS002 AUTH<-->web-service-interface<-->queue-processor<-->rest-handler<-->raast-->END',
  p2mIncoming2:
    'Start-->raast-->GET PACS002 ACSP-->notification-service-->notification-broker-service-->receiving-service<-->acquiring-system-->END',

  p2mOutgoing1: 'Start<-->channel<-->cas-service<-->web-service-interface<-->queue-processor<-->rest-handler<-->Post PACS008<-->raast-->END',
  p2mOutgoing2: 'Start-->raast-->GET PACS002 ACSP-->notification-service-->notification-broker-service-->cas-service<-->channel-->END',
};
