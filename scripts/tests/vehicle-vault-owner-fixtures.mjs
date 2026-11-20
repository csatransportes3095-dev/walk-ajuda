// Generated examples only. These are not customer documents or valid CRLVs.
import PDFDocument from 'pdfkit';
import sharp from 'sharp';

export const syntheticVehicle = Object.freeze({
  plate: 'TST1A23', renavam: '00000000001', chassis: '9BWZZZ377VT004251',
  model: 'TESTE/AUTOMOVEL', color: 'PRATA', manufactureYear: 2024, modelYear: 2025,
  category: 'PARTICULAR', exerciseYear: 2026,
});

export function syntheticVehicleLines(vehicle = syntheticVehicle) {
  return [
    'CERTIFICADO DE REGISTRO E LICENCIAMENTO DE VEICULO - DIGITAL',
    'DOCUMENTO SINTETICO PARA TESTE - SEM VALIDADE',
    `PLACA: ${vehicle.plate}`,
    `RENAVAM: ${vehicle.renavam}`,
    `CHASSI: ${vehicle.chassis}`,
    `MARCA / MODELO: ${vehicle.model}`,
    `COR PREDOMINANTE: ${vehicle.color}`,
    `ANO FABRICACAO: ${vehicle.manufactureYear}`,
    `ANO DO MODELO: ${vehicle.modelYear}`,
    `CATEGORIA: ${vehicle.category}`,
    `EXERCICIO: ${vehicle.exerciseYear}`,
  ];
}

export function syntheticVehicleText(ownerName = '', vehicle = syntheticVehicle) {
  return [...syntheticVehicleLines(vehicle),
    ...(ownerName ? [`NOME DO PROPRIETÁRIO: ${ownerName}`, 'CPF/CNPJ: 000.000.000-00'] : []),
  ].join('\n');
}

/** The mixed fixture leaves all vehicle fields as real PDF text and only the
 * owner's labelled block as pixels. It exposes a missing owner-only OCR pass. */
export async function makeSyntheticOwnerPdf({ ownerName = '', vehicle = syntheticVehicle, imageOwner = false, ocrOwnerName = '', imageClassification = false } = {}) {
  const document = new PDFDocument({ size: 'A4', margin: 40, compress: false,
    info: { Title: 'Synthetic owner extraction fixture - no legal validity', Author: 'Isolated test fixture' } });
  const chunks = [];
  const result = new Promise((resolve, reject) => {
    document.on('data', chunk => chunks.push(chunk));
    document.on('end', () => resolve(Buffer.concat(chunks)));
    document.on('error', reject);
  });
  document.font('Helvetica').fontSize(12);
  syntheticVehicleLines(vehicle).filter(line => !imageClassification || !/^(CATEGORIA|EXERCICIO):/.test(line))
    .forEach((line, index) => document.text(line, 45, 48 + index * 24, { width: 505, lineBreak: false }));
  if (ownerName && !imageOwner) {
    document.text('NOME DO PROPRIETÁRIO', 45, 350, { width: 505, lineBreak: false });
    document.text(ownerName, 45, 374, { width: 505, lineBreak: false });
    document.text('CPF/CNPJ: 000.000.000-00', 45, 398, { width: 505, lineBreak: false });
  }
  if ((ownerName && imageOwner) || ocrOwnerName) {
    const escaped = (ocrOwnerName || ownerName).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const height = imageClassification ? 400 : 260;
    const classification = imageClassification ? `<text x="20" y="275">CATEGORIA: ${vehicle.category}</text><text x="20" y="345">EXERCICIO: ${vehicle.exerciseYear}</text>` : '';
    const image = await sharp(Buffer.from(`<svg width="1500" height="${height}" xmlns="http://www.w3.org/2000/svg"><rect width="1500" height="${height}" fill="white"/><g fill="black" font-family="DejaVu Sans, sans-serif" font-size="42"><text x="20" y="65">NOME DO PROPRIETARIO</text><text x="20" y="135">${escaped}</text><text x="20" y="205">CPF/CNPJ: 000.000.000-00</text>${classification}</g></svg>`)).png().toBuffer();
    document.image(image, 42, ownerName && !imageOwner ? 455 : 350, { width: 510 });
  }
  document.end();
  return result;
}
