import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";

const source = () => readFile(new URL("../client/src/pages/AdminOrders.tsx", import.meta.url), "utf8");

describe("edição responsiva de grupos extras", () => {
  it("separa o editor do cabeçalho de ações do grupo", async () => {
    const page = await source();

    expect(page).toContain('flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:px-4');
    expect(page).toContain('editingGroupId === group.id && (');
    expect(page).toContain('border-b border-white/10 bg-black/20 px-3 py-3 sm:px-4');
  });

  it("mantém paleta, ícones e ações de salvar em áreas responsivas próprias", async () => {
    const page = await source();

    expect(page).toContain('grid max-w-[220px] grid-cols-7 gap-2');
    expect(page).toContain('grid w-fit grid-cols-6 gap-1.5');
    expect(page).toContain('updateGroupMut.mutate({ id: group.id, name: editGroupName, color: editGroupColor, icon: editGroupIcon })');
    expect(page).toContain('setEditingGroupId(null)');
  });

  it("preserva filtro, recolhimento e exclusão do grupo", async () => {
    const page = await source();

    expect(page).toContain('toggleExtraGroup(group.id)');
    expect(page).toContain("setFilterStatus(filterStatus === `group_${group.id}` ? 'all' : `group_${group.id}`)");
    expect(page).toContain('deleteGroupMut.mutate({ id: group.id })');
    expect(page).toContain("'🔍 Ver grupo'");
    expect(page).toContain("'🔍 Ver só este grupo'");
  });
});
