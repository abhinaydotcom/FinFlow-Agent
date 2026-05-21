import { poService } from './po.service.js';
import { dbService } from './db.service.js';
import { logger } from '../utils/logger.js';
import { NotFoundError } from '../utils/errors.js';

class ReconciliationService {
  /**
   * Reconciles an invoice and produces a structured reconciliation report
   * @param {string} invoiceId The UUID of the invoice
   * @returns {object} The full reconciliation report
   */
  reconcileInvoice(invoiceId) {
    const invoice = dbService.getInvoice(invoiceId);
    if (!invoice) {
      throw new NotFoundError(`Invoice with ID ${invoiceId} not found.`);
    }

    const extracted = invoice.extracted_data;
    const anomalies = [];
    let matchedPo = null;
    let reconciliationStatus = 'MATCHED';

    logger.info(`Reconciling invoice: ${invoiceId} (Number: ${extracted.invoice_number})`);

    // 1. PO Matching (FR-4)
    const poMatchResult = poService.matchInvoiceToPo(extracted.po_reference);
    
    if (!poMatchResult.matched) {
      if (poMatchResult.error === 'MISSING_PO_REFERENCE') {
        anomalies.push({
          type: 'MISSING_PO_REFERENCE',
          message: 'The invoice does not contain a purchase order reference field.',
        });
      } else if (poMatchResult.error === 'UNMATCHED_PO_REFERENCE') {
        anomalies.push({
          type: 'UNMATCHED_PO_REFERENCE',
          message: `The invoice references PO '${extracted.po_reference}' which does not exist in the PO store.`,
          actual: extracted.po_reference,
        });
      }
      reconciliationStatus = 'FAILED';
    } else {
      matchedPo = poMatchResult.po;

      // 2. Amount Variance Check (FR-5a, AC-3)
      const poAmount = matchedPo.total_amount;
      const invoiceAmount = extracted.total_amount;
      const variance = Math.abs(invoiceAmount - poAmount) / poAmount;

      if (variance > 0.05) {
        const variancePercent = (variance * 100).toFixed(2);
        anomalies.push({
          type: 'AMOUNT_VARIANCE',
          message: `Invoice amount $${invoiceAmount.toFixed(2)} differs from PO value $${poAmount.toFixed(2)} by ${variancePercent}% (limit is 5%).`,
          actual: invoiceAmount,
          expected: poAmount,
          variance_percentage: parseFloat(variancePercent),
        });
        reconciliationStatus = 'PARTIAL';
      }

      // 3. Vendor Name Matching (Real-world Anomaly)
      const normalizedInvoiceVendor = extracted.vendor_name.trim().toLowerCase();
      const normalizedPoVendor = matchedPo.vendor_name.trim().toLowerCase();
      if (!normalizedInvoiceVendor.includes(normalizedPoVendor) && !normalizedPoVendor.includes(normalizedInvoiceVendor)) {
        anomalies.push({
          type: 'VENDOR_NAME_MISMATCH',
          message: `Invoice vendor name '${extracted.vendor_name}' does not match PO vendor name '${matchedPo.vendor_name}'.`,
          actual: extracted.vendor_name,
          expected: matchedPo.vendor_name,
        });
        if (reconciliationStatus !== 'FAILED') {
          reconciliationStatus = 'PARTIAL';
        }
      }

      // 4. Closed PO Check (Real-world Anomaly)
      if (matchedPo.status === 'CLOSED') {
        anomalies.push({
          type: 'CLOSED_PO_REFERENCE',
          message: `Invoice references a closed purchase order: ${matchedPo.po_number}.`,
        });
        if (reconciliationStatus !== 'FAILED') {
          reconciliationStatus = 'PARTIAL';
        }
      }
    }

    // 5. Duplicate Invoice Check (FR-5c, AC-5)
    const isDuplicate = dbService.hasDuplicateInvoiceNumber(extracted.invoice_number, invoiceId);
    if (isDuplicate) {
      const originalInvoiceId = dbService.getOriginalInvoiceIdForNumber(extracted.invoice_number, invoiceId);
      anomalies.push({
        type: 'DUPLICATE_INVOICE',
        message: `An invoice with number '${extracted.invoice_number}' already exists in this session.`,
        original_invoice_id: originalInvoiceId,
      });
      if (reconciliationStatus !== 'FAILED') {
        reconciliationStatus = 'PARTIAL';
      }
    }

    // Create the structured reconciliation report (FR-6)
    const report = {
      invoice_id: invoiceId,
      reconciliation_status: reconciliationStatus,
      validation_status: invoice.validation_status || 'VALID',
      extracted_data: extracted,
      matched_po: matchedPo,
      anomalies: anomalies,
      reconciled_at: new Date().toISOString(),
    };

    // Update the saved invoice with this report
    invoice.reconciliation_report = report;
    invoice.status = 'RECONCILED';
    dbService.saveInvoice(invoice);

    logger.info(`Reconciliation completed. Status: ${reconciliationStatus}. Total Anomalies: ${anomalies.length}`);
    return report;
  }
}

export const reconciliationService = new ReconciliationService();
export default reconciliationService;
