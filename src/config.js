import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env
dotenv.config();

export const PORT = process.env.PORT || 3000;
export const NODE_ENV = process.env.NODE_ENV || 'development';

export const GEMINI_API_KEY = process.env.GEMINI_API_KEY || null;
export const OPENAI_API_KEY = process.env.OPENAI_API_KEY || null;

// Mock Purchase Orders Seed Data
export const SEED_PURCHASE_ORDERS = [
  {
    po_number: 'PO-1001',
    vendor_name: 'TechSupply Co.',
    po_date: '2026-01-15',
    total_amount: 12500.00,
    currency: 'USD',
    status: 'OPEN'
  },
  {
    po_number: 'PO-1002',
    vendor_name: 'CloudParts Ltd.',
    po_date: '2026-02-10',
    total_amount: 8750.50,
    currency: 'USD',
    status: 'OPEN'
  },
  {
    po_number: 'PO-1003',
    vendor_name: 'DataEdge Pvt. Ltd.',
    po_date: '2026-03-01',
    total_amount: 3200.00,
    currency: 'USD',
    status: 'OPEN'
  },
  {
    po_number: 'PO-1004',
    vendor_name: 'NetworkPros Inc.',
    po_date: '2026-03-20',
    total_amount: 21000.00,
    currency: 'USD',
    status: 'CLOSED'
  }
];
