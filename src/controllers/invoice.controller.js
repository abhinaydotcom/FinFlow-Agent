import { v4 as uuidv4 } from 'uuid';
import { dbService } from '../services/db.service.js';
import { llmService } from '../services/llm.service.js';
import { validateInvoiceData } from '../services/validation.service.js';
import { reconciliationService } from '../services/reconciliation.service.js';
import { logger } from '../utils/logger.js';
import { NotFoundError, BadRequestError } from '../utils/errors.js';

/**
 * Controller to manage all Express invoice actions
 */
class InvoiceController {
  /**
   * POST /upload
   * Ingests an invoice (via file upload or JSON payload), runs LLM extraction and field validation
   */
  async uploadInvoice(req, res, next) {
    try {
      const file = req.file;
      const jsonPayload = req.body && Object.keys(req.body).length > 0 ? req.body : null;

      if (!file && !jsonPayload) {
        throw new BadRequestError('Upload requires a file in multipart/form-data or a raw JSON payload.');
      }

      // Generate a unique invoice_id (FR-1)
      const invoiceId = uuidv4();
      logger.info(`Processing ingestion for invoice ID: ${invoiceId}`);

      // Call LLM for extraction (FR-2)
      // Note: If raw JSON is provided, llmService skips extraction and returns it directly
      const extractedData = await llmService.extractInvoiceData(file, jsonPayload);

      // Perform Field Validation (FR-3, AC-6)
      // Throws ValidationError (HTTP 422) if critical fields are missing or invalid
      const validatedData = validateInvoiceData(extractedData);

      // Construct and save invoice record
      const invoiceRecord = {
        invoice_id: invoiceId,
        status: 'UPLOADED',
        validation_status: 'VALID',
        file_name: file ? file.originalname : 'raw_payload.json',
        extracted_data: validatedData,
        uploaded_at: new Date().toISOString(),
        reconciliation_report: null
      };

      dbService.saveInvoice(invoiceRecord);

      // AC-1: Given valid invoice, POST /upload returns HTTP 200 with invoice_id and extracted JSON
      return res.status(200).json({
        invoice_id: invoiceId,
        status: 'UPLOADED',
        extracted_data: validatedData,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /reconcile/:invoice_id
   * Triggers reconciliation against the purchase order store
   */
  async reconcileInvoice(req, res, next) {
    try {
      const { invoice_id } = req.params;
      
      const invoice = dbService.getInvoice(invoice_id);
      if (!invoice) {
        throw new NotFoundError(`Invoice with ID ${invoice_id} does not exist.`);
      }

      logger.info(`Triggering reconciliation process for invoice ID: ${invoice_id}`);
      const report = reconciliationService.reconcileInvoice(invoice_id);

      return res.status(200).json(report);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /report/:invoice_id
   * Retrieves the full reconciliation report for a given invoice
   */
  async getReconciliationReport(req, res, next) {
    try {
      const { invoice_id } = req.params;

      const invoice = dbService.getInvoice(invoice_id);
      if (!invoice) {
        throw new NotFoundError(`Invoice with ID ${invoice_id} does not exist.`);
      }

      // If report is not generated yet, generate it on the fly!
      if (!invoice.reconciliation_report) {
        logger.info(`Reconciliation report not found for ${invoice_id}. Generating on the fly.`);
        invoice.reconciliation_report = reconciliationService.reconcileInvoice(invoice_id);
      }

      logger.info(`Retrieving reconciliation report for invoice ID: ${invoice_id}`);
      return res.status(200).json(invoice.reconciliation_report);
    } catch (error) {
      next(error);
    }
  }
}

export const invoiceController = new InvoiceController();
export default invoiceController;
