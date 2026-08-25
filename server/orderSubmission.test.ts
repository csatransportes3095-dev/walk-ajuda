import { describe, expect, it } from 'vitest';
import { isPersistedOrderResult } from '../shared/orderSubmission';

describe('isPersistedOrderResult', () => {
  it('aceita somente sucesso com registrationId positivo', () => {
    expect(isPersistedOrderResult({ success: true, registrationId: 123 })).toBe(true);
  });

  it('rejeita sucesso sem registrationId', () => {
    expect(isPersistedOrderResult({ success: true, registrationId: null })).toBe(false);
    expect(isPersistedOrderResult({ success: true })).toBe(false);
    expect(isPersistedOrderResult({ success: true, registrationId: 0 })).toBe(false);
  });

  it('rejeita respostas falhas mesmo com id', () => {
    expect(isPersistedOrderResult({ success: false, registrationId: 123 })).toBe(false);
    expect(isPersistedOrderResult(undefined)).toBe(false);
  });
});
