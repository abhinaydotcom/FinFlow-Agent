import { dbService } from './db.service.js';
import { logger } from '../utils/logger.js';

/**
 * Service to handle matching invoices to Purchase Orders
 */
class PoService {
  /**
   * Matches an invoice's po_reference to our PO store
   * @param {string|null} poReference The PO reference string
   * @returns {object} Matching result containing matched status, error code, and PO details
   */
  matchInvoiceToPo(poReference) {
    if (!poReference) {
      logger.warn('Reconciliation triggered with missing po_reference.');
      return {
        matched: false,
        error: 'MISSING_PO_REFERENCE',
        po: null,
      };
    }

    const po = dbService.getPurchaseOrder(poReference);
    
    if (!po) {
      logger.warn(`No purchase order found matching: ${poReference}`);
      return {
        matched: false,
        error: 'UNMATCHED_PO_REFERENCE',
        po: null,
      };
    }

    logger.info(`Successfully matched invoice to Purchase Order: ${po.po_number}`);
    return {
      matched: true,
      error: null,
      po,
    };
  }
}

export const poService = new PoService();
export default poService;
