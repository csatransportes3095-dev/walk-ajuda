from pathlib import Path

path = Path("client/src/pages/AdminCommissions.tsx")
text = path.read_text(encoding="utf-8")

old_query = '''  const commissionsQuery = trpc.orderStatus.listCommissions.useQuery();
  const statusTypesQuery = trpc.statusTypes.list.useQuery();'''
new_query = '''  const commissionsQuery = trpc.orderStatus.listCommissions.useQuery();
  const customersQuery = trpc.customers.list.useQuery(undefined, {
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
  const statusTypesQuery = trpc.statusTypes.list.useQuery();'''
if old_query not in text:
    raise SystemExit("commissions query snippet not found")
text = text.replace(old_query, new_query, 1)

old_all = '''  const all = commissionsQuery.data ?? [];

  // Filtrar por status de pagamento'''
new_all = '''  const all = commissionsQuery.data ?? [];
  const mainCustomers = (customersQuery.data ?? []) as Array<{ phone: string; profilePhotoUrl?: string | null }>;
  const normalizePhoneKey = (phone?: string | null) => String(phone || "").replace(/\\D/g, "");
  const profilePhotoByPhone = new Map(
    mainCustomers
      .filter(customer => normalizePhoneKey(customer.phone))
      .map(customer => [normalizePhoneKey(customer.phone), customer.profilePhotoUrl || null] as const),
  );

  // Filtrar por status de pagamento'''
if old_all not in text:
    raise SystemExit("all snippet not found")
text = text.replace(old_all, new_all, 1)

old_vars = '''            const indicadorNome = pedidos[0]?.referredBy ?? "—";
            const indicadorPhone = pedidos[0]?.referredByPhone;
            const totalIndicacoes = pedidos[0]?.totalReferrals ?? pedidos.length;'''
new_vars = '''            const indicadorNome = pedidos[0]?.referredBy ?? "—";
            const indicadorPhone = pedidos[0]?.referredByPhone;
            const indicadorPhotoUrl = indicadorPhone
              ? (profilePhotoByPhone.get(normalizePhoneKey(indicadorPhone)) || null)
              : null;
            const totalIndicacoes = pedidos[0]?.totalReferrals ?? pedidos.length;'''
if old_vars not in text:
    raise SystemExit("indicator vars snippet not found")
text = text.replace(old_vars, new_vars, 1)

old_avatar = '''                    {pedidos[0]?.referrerPhotoUrl ? (
                      <img
                        src={pedidos[0].referrerPhotoUrl}
                        alt={indicadorNome}
                        className="w-12 h-12 rounded-full object-cover border-2 border-amber-400/40 shadow"
                        title={indicadorNome}
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-amber-500/20 border-2 border-amber-400/30 flex items-center justify-center">
                        <span className="text-amber-300 text-lg font-bold">{indicadorNome.charAt(0).toUpperCase()}</span>
                      </div>
                    )}'''
new_avatar = '''                    {indicadorPhotoUrl ? (
                      <img
                        src={indicadorPhotoUrl}
                        alt={indicadorNome}
                        className="w-12 h-12 rounded-full object-cover border-2 border-amber-400/40 shadow"
                        title={`${indicadorNome} — foto do cadastro principal`}
                        onError={(event) => {
                          event.currentTarget.style.display = "none";
                          const fallback = event.currentTarget.nextElementSibling as HTMLElement | null;
                          if (fallback) fallback.style.display = "flex";
                        }}
                      />
                    ) : null}
                    <div
                      className="w-12 h-12 rounded-full bg-amber-500/20 border-2 border-amber-400/30 items-center justify-center"
                      style={{ display: indicadorPhotoUrl ? "none" : "flex" }}
                    >
                      <span className="text-amber-300 text-lg font-bold">{indicadorNome.charAt(0).toUpperCase()}</span>
                    </div>'''
if old_avatar not in text:
    raise SystemExit("avatar snippet not found")
text = text.replace(old_avatar, new_avatar, 1)

path.write_text(text, encoding="utf-8")
