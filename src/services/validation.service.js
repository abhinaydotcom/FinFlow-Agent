import { z } from 'zod';
import { ValidationError } from '../utils/errors.js';

// Line item validator schema
const lineItemSchema = z.object({
  description: z.string({
    required_error: 'description is required',
    invalid_type_error: 'description must be a string',
  }).min(1, 'description cannot be empty'),
  
  qty: z.number({
    required_error: 'qty is required',
    invalid_type_error: 'qty must be a number',
  }).positive('qty must be greater than 0'),
  
  unit_price: z.number({
    required_error: 'unit_price is required',
    invalid_type_error: 'unit_price must be a number',
  }).nonnegative('unit_price must be greater than or equal to 0'),
});

// Full Invoice Zod schema
export const invoiceSchema = z.object({
  vendor_name: z.string({
    required_error: 'vendor_name is required',
    invalid_type_error: 'vendor_name must be a string',
  }).min(1, 'vendor_name cannot be empty'),
  
  invoice_number: z.string({
    required_error: 'invoice_number is required',
    invalid_type_error: 'invoice_number must be a string',
  }).min(1, 'invoice_number cannot be empty'),
  
  invoice_date: z.string({
    required_error: 'invoice_date is required',
    invalid_type_error: 'invoice_date must be a string',
  }).regex(/^\d{4}-\d{2}-\d{2}$/, 'invoice_date must be in YYYY-MM-DD ISO format'),
  
  line_items: z.array(lineItemSchema, {
    required_error: 'line_items are required',
    invalid_type_error: 'line_items must be an array',
  }).min(1, 'line_items must contain at least one item'),
  
  total_amount: z.number({
    required_error: 'total_amount is required',
    invalid_type_error: 'total_amount must be a number',
  }).positive('total_amount must be greater than 0'),
  
  currency: z.string({
    required_error: 'currency is required',
    invalid_type_error: 'currency must be a string',
  })
    .length(3, 'currency must be a valid 3-letter ISO code')
    .transform(val => val.toUpperCase()),
  
  po_reference: z.string({
    invalid_type_error: 'po_reference must be a string',
  })
    .nullable()
    .optional()
    .transform(val => val || undefined),
});

/**
 * Validates the extracted or provided invoice data
 * @param {object} data The extracted data
 * @returns {object} The validated & normalized data
 * @throws {ValidationError} If validation fails
 */
export function validateInvoiceData(data) {
  const result = invoiceSchema.safeParse(data);
  
  if (!result.success) {
    // Format Zod errors into a clean structured list
    const structuredErrors = result.error.errors.map(err => ({
      field: err.path.join('.'),
      message: err.message,
      code: err.code
    }));
    
    throw new ValidationError('Invoice data validation failed', structuredErrors);
  }
  
  return result.data;
}
