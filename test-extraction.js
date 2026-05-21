import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { llmService } from './src/services/llm.service.js';
import { validateInvoiceData } from './src/services/validation.service.js';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runTest() {
  console.log('Starting Gemini API Extraction Test on OD126583062707687000.pdf...');
  console.log('Using API Key: ' + (process.env.GEMINI_API_KEY ? 'Present (starts with ' + process.env.GEMINI_API_KEY.slice(0, 8) + '...)' : 'MISSING!'));

  const pdfPath = path.join(__dirname, 'OD126583062707687000.pdf');
  if (!fs.existsSync(pdfPath)) {
    console.error('OD126583062707687000.pdf not found in root directory!');
    process.exit(1);
  }

  const fileBuffer = fs.readFileSync(pdfPath);
  const mockFile = {
    fieldname: 'invoice',
    originalname: 'OD126583062707687000.pdf',
    encoding: '7bit',
    mimetype: 'application/pdf',
    buffer: fileBuffer,
    size: fileBuffer.length
  };

  try {
    const extractedData = await llmService.extractInvoiceData(mockFile);
    console.log('\n--- SUCCESS: Gemini Extraction Complete! ---');
    console.log(JSON.stringify(extractedData, null, 2));

    console.log('\n--- Running Zod Validation ---');
    const validatedData = validateInvoiceData(extractedData);
    console.log('SUCCESS: Extracted data passed Zod validation perfectly!');
    console.log(JSON.stringify(validatedData, null, 2));
  } catch (error) {
    console.error('\n--- FAILURE: Ingestion/Extraction Failed ---');
    console.error(error.message);
    if (error.errors) {
      console.error('Validation errors:', JSON.stringify(error.errors, null, 2));
    }
  }
}

runTest();
