import { describe, it, expect, beforeAll } from 'vitest';
import { createCustomer, getCustomerDocuments, createCustomerDocument, deleteCustomerDocument } from './db';

describe('Customer Documents', () => {
  let customerId: number;

  beforeAll(async () => {
    // Criar um cliente de teste
    const customer = await createCustomer({
      name: 'Teste Documentos',
      phone: '11987654321',
      email: 'teste@documents.com',
      city: 'São Paulo',
      uf: 'SP',
    });
    customerId = customer.id;
  });

  it('should create a customer document', async () => {
    const doc = await createCustomerDocument({
      customerId,
      label: 'RG',
      fileUrl: '/manus-storage/test-rg.jpg',
      fileKey: 'customer-documents/123-1234567890.jpg',
      mimeType: 'image/jpeg',
    });

    expect(doc).toBeDefined();
    expect(doc.label).toBe('RG');
    expect(doc.customerId).toBe(customerId);
    expect(doc.mimeType).toBe('image/jpeg');
  });

  it('should retrieve customer documents', async () => {
    // Criar múltiplos documentos
    await createCustomerDocument({
      customerId,
      label: 'CNH',
      fileUrl: '/manus-storage/test-cnh.jpg',
      fileKey: 'customer-documents/123-1234567891.jpg',
      mimeType: 'image/jpeg',
    });

    await createCustomerDocument({
      customerId,
      label: 'Comprovante de Residência',
      fileUrl: '/manus-storage/test-comprovante.pdf',
      fileKey: 'customer-documents/123-1234567892.pdf',
      mimeType: 'application/pdf',
    });

    const docs = await getCustomerDocuments(customerId);

    expect(docs).toBeDefined();
    expect(docs.length).toBeGreaterThanOrEqual(2);
    expect(docs.some(d => d.label === 'CNH')).toBe(true);
    expect(docs.some(d => d.label === 'Comprovante de Residência')).toBe(true);
  });

  it('should delete a customer document', async () => {
    // Criar um documento
    const doc = await createCustomerDocument({
      customerId,
      label: 'Documento Temporário',
      fileUrl: '/manus-storage/test-temp.jpg',
      fileKey: 'customer-documents/123-temp.jpg',
      mimeType: 'image/jpeg',
    });

    // Verificar que foi criado
    let docs = await getCustomerDocuments(customerId);
    const initialCount = docs.length;

    // Deletar o documento
    await deleteCustomerDocument(doc.id);

    // Verificar que foi deletado
    docs = await getCustomerDocuments(customerId);
    expect(docs.length).toBe(initialCount - 1);
    expect(docs.some(d => d.id === doc.id)).toBe(false);
  });

  it('should return empty array for customer with no documents', async () => {
    // Criar um novo cliente sem documentos
    const uniquePhone = `119${Math.random().toString().slice(2, 10)}`;
    const customer = await createCustomer({
      name: 'Cliente Sem Docs',
      phone: uniquePhone,
      email: `nodocs-${Date.now()}@test.com`,
      city: 'Rio de Janeiro',
      uf: 'RJ',
    });

    const docs = await getCustomerDocuments(customer.id);
    expect(docs).toBeDefined();
    expect(docs.length).toBe(0);
  });

  it('should preserve document metadata', async () => {
    const doc = await createCustomerDocument({
      customerId,
      label: 'Documento com Metadata',
      fileUrl: '/manus-storage/test-metadata.jpg',
      fileKey: 'customer-documents/123-metadata.jpg',
      mimeType: 'image/jpeg',
    });

    const docs = await getCustomerDocuments(customerId);
    const retrieved = docs.find(d => d.id === doc.id);

    expect(retrieved).toBeDefined();
    expect(retrieved?.label).toBe('Documento com Metadata');
    expect(retrieved?.fileUrl).toBe('/manus-storage/test-metadata.jpg');
    expect(retrieved?.fileKey).toBe('customer-documents/123-metadata.jpg');
    expect(retrieved?.mimeType).toBe('image/jpeg');
    expect(retrieved?.createdAt).toBeDefined();
  });
});
