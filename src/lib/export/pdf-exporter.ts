/**
 * PDF format exporter
 * Uses jsPDF and html2canvas for high-quality PDF generation
 */

import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { ExportResult, ExportOptions, sanitizeFilename } from '@/types/import-export';
import { markdownToHtml, extractTitle } from './markdown-to-html';

interface PdfExportOptions extends ExportOptions {
  pageSize?: 'A4' | 'Letter' | 'Legal';
  orientation?: 'portrait' | 'landscape';
  includeTitlePage?: boolean;
  margins?: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
}

/**
 * Exports content to PDF format
 */
export async function exportToPdf(
  content: string,
  options: PdfExportOptions = {}
): Promise<ExportResult> {
  try {
    const {
      title = extractTitle(content) || 'Document',
      author,
      pageSize = 'A4',
      orientation = 'portrait',
      includeTitlePage = false,
      filename,
      margins = { top: 20, right: 20, bottom: 20, left: 20 },
    } = options;

    // Create PDF document
    const pdf = new jsPDF({
      orientation,
      unit: 'mm',
      format: pageSize.toLowerCase() as 'a4' | 'letter' | 'legal',
    });

    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const contentWidth = pageWidth - margins.left - margins.right;

    // Add title page if requested
    if (includeTitlePage) {
      pdf.setFontSize(28);
      pdf.text(title, pageWidth / 2, pageHeight / 3, { align: 'center' });

      if (author) {
        pdf.setFontSize(16);
        pdf.text(`by ${author}`, pageWidth / 2, pageHeight / 3 + 20, { align: 'center' });
      }

      pdf.addPage();
    }

    // Convert markdown to HTML
    const html = markdownToHtml(content, { wrapInDocument: false, includeStyles: false });

    // Create a temporary container to render the HTML
    const container = document.createElement('div');
    container.innerHTML = html;
    container.style.cssText = `
      position: absolute;
      left: -9999px;
      top: 0;
      width: ${contentWidth * 3.78}px;
      font-family: Georgia, 'Times New Roman', serif;
      font-size: 12pt;
      line-height: 1.6;
      color: #000;
      background: #fff;
      padding: 20px;
    `;

    // Style headings
    const styleSheet = document.createElement('style');
    styleSheet.textContent = `
      h1 { font-size: 24pt; margin: 20px 0 10px 0; font-family: Arial, sans-serif; }
      h2 { font-size: 20pt; margin: 18px 0 8px 0; font-family: Arial, sans-serif; }
      h3 { font-size: 16pt; margin: 16px 0 6px 0; font-family: Arial, sans-serif; }
      h4 { font-size: 14pt; margin: 14px 0 6px 0; font-family: Arial, sans-serif; }
      p { margin: 10px 0; }
      blockquote { border-left: 3px solid #ccc; padding-left: 15px; margin-left: 0; color: #555; }
      code { background: #f5f5f5; padding: 2px 5px; font-family: monospace; }
      pre { background: #f5f5f5; padding: 10px; overflow-x: auto; }
    `;
    container.appendChild(styleSheet);

    document.body.appendChild(container);

    try {
      // Use html2canvas to render the content
      const canvas = await html2canvas(container, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
      });

      // Calculate how many pages we need
      const imgWidth = contentWidth;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      const pageContentHeight = pageHeight - margins.top - margins.bottom;

      let heightLeft = imgHeight;
      let position = margins.top;
      let pageNumber = includeTitlePage ? 1 : 0;

      // Add the image to PDF, creating new pages as needed
      const imgData = canvas.toDataURL('image/png');

      while (heightLeft > 0) {
        if (pageNumber > 0) {
          pdf.addPage();
        }

        pdf.addImage(
          imgData,
          'PNG',
          margins.left,
          position - (pageNumber * pageContentHeight),
          imgWidth,
          imgHeight
        );

        heightLeft -= pageContentHeight;
        pageNumber++;
      }
    } finally {
      // Clean up
      document.body.removeChild(container);
    }

    // Generate filename
    const exportFilename = filename || sanitizeFilename(title) + '.pdf';

    // Get the PDF as blob
    const blob = pdf.output('blob');

    return {
      success: true,
      blob,
      filename: exportFilename,
    };
  } catch (error) {
    console.error('PDF export error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to export to PDF format',
    };
  }
}
