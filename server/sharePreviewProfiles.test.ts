import { describe, expect, it } from "vitest";
import {
  SHARE_PREVIEW_H2_SHIELD,
  defaultSharePreviewProfile,
  getSharePreviewProfileSettingKeys,
  resolveSharePreviewProfileFromSettings,
  sharePreviewProfileForPath,
} from "./sharePreviewProfiles";

describe("perfis de miniatura de links", () => {
  it("separa cada rota pública no perfil correto", () => {
    expect(sharePreviewProfileForPath("/")).toBe("institutional");
    expect(sharePreviewProfileForPath("/acompanhar")).toBe("tracking");
    expect(sharePreviewProfileForPath("/link/acompanhamento")).toBe("tracking");
    expect(sharePreviewProfileForPath("/agendar/c7b4264b374bca4a9aecb6af7e2e88ec")).toBe("schedule");
    expect(sharePreviewProfileForPath("/orcamento/token-publico")).toBe("quote");
    expect(sharePreviewProfileForPath("/recibo/token-publico")).toBe("receipt");
    expect(sharePreviewProfileForPath("/video/boas-vindas")).toBe("video");
    expect(sharePreviewProfileForPath("/video/tutorial")).toBe("tutorial");
    expect(sharePreviewProfileForPath("/app-pro")).toBe("app");
  });

  it("usa o escudo H2 existente como padrão sem herdar arte antiga", () => {
    const profile = defaultSharePreviewProfile("schedule");
    const tracking = defaultSharePreviewProfile("tracking");
    expect(profile.imageUrl).toBe(SHARE_PREVIEW_H2_SHIELD);
    expect(profile.title).toBe("Agendamento — H2 COLOMBIANO");
    expect(tracking.imageUrl).toBe(SHARE_PREVIEW_H2_SHIELD);
    expect(tracking.title).toBe("Acompanhe seu pedido — H2 COLOMBIANO");
  });

  it("mantém alterações isoladas em cada perfil", () => {
    const [titleKey, summaryKey, imageKey, typeKey, versionKey] = getSharePreviewProfileSettingKeys("schedule");
    const profile = resolveSharePreviewProfileFromSettings("schedule", {
      [titleKey]: "Agenda especial",
      [summaryKey]: "Escolha seu horário.",
      [imageKey]: "https://midia.h2colombiano.com/share/agenda.webp",
      [typeKey]: "image/webp",
      [versionKey]: "123456",
    });
    const institutional = resolveSharePreviewProfileFromSettings("institutional", {});

    expect(profile.title).toBe("Agenda especial");
    expect(profile.imageUrl).toBe("https://midia.h2colombiano.com/share/agenda.webp");
    expect(profile.imageVersion).toBe("123456");
    expect(institutional.imageUrl).toBe(SHARE_PREVIEW_H2_SHIELD);
  });

  it("permite remover somente a imagem de um perfil", () => {
    const [, , imageKey] = getSharePreviewProfileSettingKeys("video");
    const profile = resolveSharePreviewProfileFromSettings("video", { [imageKey]: "" });
    expect(profile.imageUrl).toBeNull();
  });
});
