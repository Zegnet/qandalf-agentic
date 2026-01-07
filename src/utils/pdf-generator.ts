import * as fs from 'fs';
import * as path from 'path';
import PDFDocument from 'pdfkit';

export interface GeneratePdfOptions {
    fileName?: string;
    content?: string;
    outputDir?: string;
}

export async function generatePdf(options: GeneratePdfOptions = {}): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T').join('_').substring(0, 19);
    const fileName = options.fileName || `document_${timestamp}.pdf`;
    const outputDir = options.outputDir || path.join(process.cwd(), 'temp', 'uploads');
    const content = options.content || `Documento de teste gerado automaticamente\n\nData: ${new Date().toLocaleString('pt-BR')}\nIdentificador: ${timestamp}`;

    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    const filePath = path.join(outputDir, fileName);

    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({
            size: 'A4',
            margins: { top: 50, bottom: 50, left: 50, right: 50 }
        });

        const stream = fs.createWriteStream(filePath);

        stream.on('finish', () => {
            resolve(filePath);
        });

        stream.on('error', (error) => {
            reject(error);
        });

        doc.pipe(stream);

        doc.info.Title = 'Documento de Teste';
        doc.info.Author = 'Qandalf Agent';
        doc.info.CreationDate = new Date();

        doc.fontSize(16).text('Documento de Teste', { align: 'center' });
        doc.moveDown();
        doc.fontSize(12).text(content, { align: 'left' });
        doc.moveDown(2);
        doc.fontSize(10).text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, { align: 'right' });

        doc.end();
    });
}

export function cleanupOldFiles(directoryPath: string, maxAgeHours: number = 24): void {
    if (!fs.existsSync(directoryPath)) {
        return;
    }

    const now = Date.now();
    const maxAge = maxAgeHours * 60 * 60 * 1000;

    const files = fs.readdirSync(directoryPath);

    files.forEach(file => {
        const filePath = path.join(directoryPath, file);
        const stats = fs.statSync(filePath);

        if (stats.isFile() && (now - stats.mtimeMs) > maxAge) {
            fs.unlinkSync(filePath);
        }
    });
}
