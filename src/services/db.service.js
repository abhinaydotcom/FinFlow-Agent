import { SEED_PURCHASE_ORDERS } from '../config.js';
import { logger } from '../utils/logger.js';

class DbService {
  constructor() {
    this.purchaseOrders = new Map();
    this.invoices = new Map();
    this.duplicatesIndex = new Map(); // maps invoice_number -> Array of invoice_id
    this.seedDb();
  }

  seedDb() {
    this.purchaseOrders.clear();
    for (const po of SEED_PURCHASE_ORDERS) {
      this.purchaseOrders.set(po.po_number, { ...po });
    }
    logger.info(`Successfully seeded ${this.purchaseOrders.size} Purchase Orders in-memory.`);
  }

  // PO methods
  getPurchaseOrder(poNumber) {
    if (!poNumber) return null;
    return this.purchaseOrders.get(poNumber) || null;
  }

  getAllPurchaseOrders() {
    return Array.from(this.purchaseOrders.values());
  }

  // Invoice methods
  saveInvoice(invoice) {
    const { invoice_id, extracted_data } = invoice;
    const invoiceNumber = extracted_data?.invoice_number;

    this.invoices.set(invoice_id, invoice);

    if (invoiceNumber) {
      if (!this.duplicatesIndex.has(invoiceNumber)) {
        this.duplicatesIndex.set(invoiceNumber, []);
      }
      this.duplicatesIndex.get(invoiceNumber).push(invoice_id);
    }

    logger.debug(`Saved invoice: ${invoice_id} (Number: ${invoiceNumber})`);
    return invoice;
  }

  getInvoice(invoiceId) {
    return this.invoices.get(invoiceId) || null;
  }

  // Duplicate checks
  hasDuplicateInvoiceNumber(invoiceNumber, currentInvoiceId) {
    if (!invoiceNumber) return false;
    const matches = this.duplicatesIndex.get(invoiceNumber) || [];
    // A duplicate is another invoice with the same number but a different invoice_id
    return matches.some(id => id !== currentInvoiceId);
  }

  getOriginalInvoiceIdForNumber(invoiceNumber, currentInvoiceId) {
    if (!invoiceNumber) return null;
    const matches = this.duplicatesIndex.get(invoiceNumber) || [];
    const firstMatch = matches.find(id => id !== currentInvoiceId);
    return firstMatch || null;
  }

  // Reset database for clean testing state
  clearStore() {
    this.invoices.clear();
    this.duplicatesIndex.clear();
    this.seedDb();
    logger.info('Database store cleared & re-seeded.');
  }
}

export const dbService = new DbService();
export default dbService;
