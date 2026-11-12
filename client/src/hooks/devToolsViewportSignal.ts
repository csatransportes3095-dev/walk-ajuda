/**
 * A distância entre as dimensões internas e externas do Chrome não prova que
 * o inspetor está aberto: zoom, escala do Windows e barras do navegador podem
 * produzir uma distância grande mesmo em navegação normal.
 *
 * Um bloqueio visual só deve ser disparado quando a distância aumenta muito
 * em relação à medida inicial da própria aba. O hook exige também 3 leituras
 * consecutivas para evitar eventos transitórios de resize.
 */
export type DevToolsViewportGaps = Readonly<{ width: number; height: number }>;

export function hasHighConfidenceDevToolsViewportChange(
  baseline: DevToolsViewportGaps,
  current: DevToolsViewportGaps,
): boolean {
  const widthIncrease = current.width - baseline.width;
  const heightIncrease = current.height - baseline.height;

  return (
    (current.width >= 360 && widthIncrease >= 260) ||
    (current.height >= 360 && heightIncrease >= 260)
  );
}
