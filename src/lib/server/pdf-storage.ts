import path from 'path';
import { PDF_DIR as PDF_DIR_ENV } from '$env/static/private';

export const PDF_DIR = path.resolve(PDF_DIR_ENV);
