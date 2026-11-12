import { describe, expect, it } from 'vitest';
import { hasHighConfidenceDevToolsViewportChange } from './devToolsViewportSignal';

describe('detecção DevTools sem falso bloqueio', () => {
  it('não bloqueia o Chrome com escala, barras e dimensões habituais grandes', () => {
    expect(hasHighConfidenceDevToolsViewportChange(
      { width: 380, height: 405 }, { width: 380, height: 405 },
    )).toBe(false);
  });
  it('ignora pequenas alterações de janela e extensões', () => {
    expect(hasHighConfidenceDevToolsViewportChange(
      { width: 100, height: 130 }, { width: 290, height: 310 },
    )).toBe(false);
  });
  it('identifica abertura de painel lateral com mudança expressiva', () => {
    expect(hasHighConfidenceDevToolsViewportChange(
      { width: 80, height: 105 }, { width: 450, height: 105 },
    )).toBe(true);
  });
  it('identifica abertura de painel inferior com mudança expressiva', () => {
    expect(hasHighConfidenceDevToolsViewportChange(
      { width: 80, height: 105 }, { width: 80, height: 490 },
    )).toBe(true);
  });
  it('ignora troca de proporção sem distância suficiente', () => {
    expect(hasHighConfidenceDevToolsViewportChange(
      { width: 20, height: 20 }, { width: 250, height: 270 },
    )).toBe(false);
  });
});
