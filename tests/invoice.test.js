import request from 'supertest';
import app from '../src/app.js';
import { dbService } from '../src/services/db.service.js';
import { llmService } from '../src/services/llm.service.js';

describe('FinFlow AP Reconciliation Agent API Tests', () => {
  
  beforeAll(() => {
    // Disable external LLM connections in testing to ensure deterministic, fast, offline tests
    llmService.geminiClient = null;
    llmService.openaiClient = null;
  });

  beforeEach(() => {
    // Reset database to seed POs and clear previous uploads for isolation
    dbService.clearStore();
  });

  describe('FR-1 & FR-3 & AC-1: Invoice Ingestion & Field Validation', () => {
    
    test('AC-1: Upload valid invoice JSON successfully', async () => {
      const validPayload = {
        vendor_name: 'TechSupply Co.',
        invoice_number: 'INV-1001',
        invoice_date: '2026-01-16',
        line_items: [
          { description: 'High Performance Laptops', qty: 10, unit_price: 1250.00 }
        ],
        total_amount: 12500.00,
        currency: 'USD',
        po_reference: 'PO-1001'
      };

      const res = await request(app)
        .post('/upload')
        .send(validPayload);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('invoice_id');
      expect(res.body.status).toBe('UPLOADED');
      expect(res.body.extracted_data.vendor_name).toBe('TechSupply Co.');
      expect(res.body.extracted_data.invoice_number).toBe('INV-1001');
    });

    test('AC-6 & FR-3: Returns 422 for missing required fields (vendor_name)', async () => {
      const invalidPayload = {
        invoice_number: 'INV-1001',
        invoice_date: '2026-01-16',
        line_items: [
          { description: 'High Performance Laptops', qty: 10, unit_price: 1250.00 }
        ],
        total_amount: 12500.00,
        currency: 'USD'
      };

      const res = await request(app)
        .post('/upload')
        .send(invalidPayload);

      expect(res.status).toBe(422);
      expect(res.body.status).toBe('fail');
      expect(res.body.message).toContain('validation failed');
      expect(res.body.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'vendor_name',
            message: 'vendor_name is required'
          })
        ])
      );
    });

    test('FR-3: Returns 422 for invalid date format or negative amount', async () => {
      const invalidPayload = {
        vendor_name: 'TechSupply Co.',
        invoice_number: 'INV-1001',
        invoice_date: '16-01-2026', // Invalid date format (should be YYYY-MM-DD)
        line_items: [
          { description: 'Laptop', qty: 1, unit_price: -100 } // Negative price
        ],
        total_amount: -100, // Negative amount
        currency: 'US' // Not 3-letter ISO
      };

      const res = await request(app)
        .post('/upload')
        .send(invalidPayload);

      expect(res.status).toBe(422);
      expect(res.body.errors.some(e => e.field === 'invoice_date')).toBe(true);
      expect(res.body.errors.some(e => e.field === 'total_amount')).toBe(true);
      expect(res.body.errors.some(e => e.field === 'currency')).toBe(true);
      expect(res.body.errors.some(e => e.field === 'line_items.0.unit_price')).toBe(true);
    });

    test('FR-1: Upload raw text file and extract fields via Mock Local Parser', async () => {
      const txtContent = `
        vendor_name: CloudParts Ltd.
        invoice_number: INV-9999
        invoice_date: 2026-02-12
        total_amount: 8750.50
        currency: USD
        po_reference: PO-1002
        
        line_items:
        - description: Cloud Engine Hosting
          qty: 1
          unit_price: 8750.50
      `;

      const res = await request(app)
        .post('/upload')
        .attach('invoice', Buffer.from(txtContent), 'invoice.txt');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('invoice_id');
      expect(res.body.extracted_data.vendor_name).toBe('CloudParts Ltd.');
      expect(res.body.extracted_data.invoice_number).toBe('INV-9999');
      expect(res.body.extracted_data.total_amount).toBe(8750.50);
      expect(res.body.extracted_data.po_reference).toBe('PO-1002');
    });
  });

  describe('FR-4 & FR-5 & FR-6 & AC-2 to AC-5: Reconciliation & Anomaly Detection', () => {

    test('AC-2: Perfect match returns reconciliation_status MATCHED', async () => {
      // 1. Upload valid invoice matching PO-1002 perfectly
      const validPayload = {
        vendor_name: 'CloudParts Ltd.',
        invoice_number: 'INV-2002',
        invoice_date: '2026-02-11',
        line_items: [
          { description: 'Cloud Engine Hosting', qty: 1, unit_price: 8750.50 }
        ],
        total_amount: 8750.50,
        currency: 'USD',
        po_reference: 'PO-1002'
      };

      const uploadRes = await request(app)
        .post('/upload')
        .send(validPayload);
      
      const invoiceId = uploadRes.body.invoice_id;

      // 2. Reconcile
      const reconcileRes = await request(app)
        .post(`/reconcile/${invoiceId}`);

      expect(reconcileRes.status).toBe(200);
      expect(reconcileRes.body.reconciliation_status).toBe('MATCHED');
      expect(reconcileRes.body.matched_po.po_number).toBe('PO-1002');
      expect(reconcileRes.body.anomalies.length).toBe(0);
    });

    test('AC-3: Amount variance of 8% flags AMOUNT_VARIANCE anomaly', async () => {
      // PO-1002 amount is 8750.50. Let's make the invoice 9450.54 (8% variance)
      const variancePayload = {
        vendor_name: 'CloudParts Ltd.',
        invoice_number: 'INV-2003',
        invoice_date: '2026-02-11',
        line_items: [
          { description: 'Cloud Engine Hosting', qty: 1, unit_price: 9450.54 }
        ],
        total_amount: 9450.54,
        currency: 'USD',
        po_reference: 'PO-1002'
      };

      const uploadRes = await request(app)
        .post('/upload')
        .send(variancePayload);
      
      const invoiceId = uploadRes.body.invoice_id;

      // Reconcile
      const reconcileRes = await request(app)
        .post(`/reconcile/${invoiceId}`);

      expect(reconcileRes.status).toBe(200);
      expect(reconcileRes.body.reconciliation_status).toBe('PARTIAL');
      expect(reconcileRes.body.anomalies).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'AMOUNT_VARIANCE',
            actual: 9450.54,
            expected: 8750.50,
            variance_percentage: 8
          })
        ])
      );
    });

    test('AC-4: Missing PO reference flags MISSING_PO_REFERENCE and status is FAILED', async () => {
      const missingPoPayload = {
        vendor_name: 'CloudParts Ltd.',
        invoice_number: 'INV-2004',
        invoice_date: '2026-02-11',
        line_items: [
          { description: 'Cloud Engine Hosting', qty: 1, unit_price: 8750.50 }
        ],
        total_amount: 8750.50,
        currency: 'USD'
        // po_reference is missing
      };

      const uploadRes = await request(app)
        .post('/upload')
        .send(missingPoPayload);
      
      const invoiceId = uploadRes.body.invoice_id;

      // Reconcile
      const reconcileRes = await request(app)
        .post(`/reconcile/${invoiceId}`);

      expect(reconcileRes.status).toBe(200);
      expect(reconcileRes.body.reconciliation_status).toBe('FAILED');
      expect(reconcileRes.body.anomalies).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'MISSING_PO_REFERENCE'
          })
        ])
      );
    });

    test('FR-5b: Unmatched PO reference flags UNMATCHED_PO_REFERENCE and status is FAILED', async () => {
      const unmatchedPoPayload = {
        vendor_name: 'CloudParts Ltd.',
        invoice_number: 'INV-2005',
        invoice_date: '2026-02-11',
        line_items: [
          { description: 'Cloud Engine Hosting', qty: 1, unit_price: 8750.50 }
        ],
        total_amount: 8750.50,
        currency: 'USD',
        po_reference: 'PO-9999' // Non-existent PO
      };

      const uploadRes = await request(app)
        .post('/upload')
        .send(unmatchedPoPayload);
      
      const invoiceId = uploadRes.body.invoice_id;

      // Reconcile
      const reconcileRes = await request(app)
        .post(`/reconcile/${invoiceId}`);

      expect(reconcileRes.status).toBe(200);
      expect(reconcileRes.body.reconciliation_status).toBe('FAILED');
      expect(reconcileRes.body.anomalies).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'UNMATCHED_PO_REFERENCE',
            actual: 'PO-9999'
          })
        ])
      );
    });

    test('AC-5: Submitting the same invoice_number twice flags DUPLICATE_INVOICE with original invoice_id', async () => {
      const payload1 = {
        vendor_name: 'CloudParts Ltd.',
        invoice_number: 'INV-DUP-123',
        invoice_date: '2026-02-11',
        line_items: [
          { description: 'Cloud Engine Hosting', qty: 1, unit_price: 8750.50 }
        ],
        total_amount: 8750.50,
        currency: 'USD',
        po_reference: 'PO-1002'
      };

      // Upload first time
      const uploadRes1 = await request(app)
        .post('/upload')
        .send(payload1);
      
      const firstInvoiceId = uploadRes1.body.invoice_id;

      // Upload second time (identical invoice number)
      const uploadRes2 = await request(app)
        .post('/upload')
        .send({
          ...payload1,
          total_amount: 8750.50 // Same invoice number
        });
      
      const secondInvoiceId = uploadRes2.body.invoice_id;

      expect(firstInvoiceId).not.toBe(secondInvoiceId);

      // Reconcile the second upload
      const reconcileRes2 = await request(app)
        .post(`/reconcile/${secondInvoiceId}`);

      expect(reconcileRes2.status).toBe(200);
      expect(reconcileRes2.body.reconciliation_status).toBe('PARTIAL'); // Due to duplicate anomaly
      expect(reconcileRes2.body.anomalies).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'DUPLICATE_INVOICE',
            original_invoice_id: firstInvoiceId
          })
        ])
      );
    });
  });

  describe('FR-7: REST API Route Access /report/:invoice_id', () => {

    test('Retrieves report successfully or throws 404', async () => {
      // 1. Unmatched UUID report retrieval should throw 404
      const invalidUuid = '88888888-8888-8888-8888-888888888888';
      const errRes = await request(app)
        .get(`/report/${invalidUuid}`);
      
      expect(errRes.status).toBe(404);
      expect(errRes.body.status).toBe('fail');
      expect(errRes.body.message).toContain('does not exist');

      // 2. Add an invoice and retrieve report
      const validPayload = {
        vendor_name: 'TechSupply Co.',
        invoice_number: 'INV-PORT-01',
        invoice_date: '2026-01-16',
        line_items: [
          { description: 'High Performance Laptops', qty: 10, unit_price: 1250.00 }
        ],
        total_amount: 12500.00,
        currency: 'USD',
        po_reference: 'PO-1001'
      };

      const uploadRes = await request(app)
        .post('/upload')
        .send(validPayload);
      
      const invoiceId = uploadRes.body.invoice_id;

      // Call GET /report/:invoice_id. It should reconcile on-the-fly and return the report.
      const reportRes = await request(app)
        .get(`/report/${invoiceId}`);

      expect(reportRes.status).toBe(200);
      expect(reportRes.body.invoice_id).toBe(invoiceId);
      expect(reportRes.body.reconciliation_status).toBe('MATCHED');
      expect(reportRes.body.extracted_data.invoice_number).toBe('INV-PORT-01');
    });
  });
});
