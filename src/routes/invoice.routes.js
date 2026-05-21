import express from 'express';
import multer from 'multer';
import { invoiceController } from '../controllers/invoice.controller.js';

const router = express.Router();

// Configure Multer to store uploaded files in memory
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB file limit
  },
  fileFilter: (req, file, cb) => {
    // Support PDF, plain text, and common image formats
    const allowedMimeTypes = [
      'application/pdf',
      'text/plain',
      'image/png',
      'image/jpeg',
      'image/jpg',
      'image/webp'
    ];
    
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}. Allowed: PDF, plain text, and images.`), false);
    }
  }
});

// Submit invoice for processing (file upload or raw JSON)
// FR-7: POST /upload
router.post('/upload', upload.single('invoice'), invoiceController.uploadInvoice);

// Trigger reconciliation
// FR-7: POST /reconcile/{invoice_id}
router.post('/reconcile/:invoice_id', invoiceController.reconcileInvoice);

// Retrieve full reconciliation report
// FR-7: GET /report/{invoice_id}
router.get('/report/:invoice_id', invoiceController.getReconciliationReport);

export default router;
