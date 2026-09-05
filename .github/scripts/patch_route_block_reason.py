from pathlib import Path


def replace_once(path_str: str, old: str, new: str, label: str) -> None:
    path = Path(path_str)
    text = path.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: esperado 1 bloco, encontrado {count}")
    path.write_text(text.replace(old, new, 1), encoding="utf-8")


# ---------------------------------------------------------------------------
# server/customerAccess.ts
# ---------------------------------------------------------------------------
replace_once(
    "server/customerAccess.ts",
    '''export async function hasRouteAccess(customerId: number, route: CustomerRoute, dbArg?: any): Promise<{ allowed: boolean; restricted: boolean; routes: CustomerRoute[] }> {
  const access = await getRouteAccess(customerId, dbArg);
  return { ...access, allowed: !access.restricted || access.routes.includes(route) };
}
''',
    '''export type CustomerRouteRestrictionReason = {
  reason: string;
  updatedBy: string | null;
  updatedAt: string | null;
};

export async function getCustomerRouteRestrictionReason(
  customerId: number,
  route: CustomerRoute,
  dbArg?: any,
): Promise<CustomerRouteRestrictionReason | null> {
  const db = dbArg || await getDb() as any;
  if (!db) return null;
  await ensureCustomerIdentityInfrastructure(db);
  const result = await rows(db, sql`
    SELECT reason, updatedBy, updatedAt
    FROM customerRouteRestrictionReasons
    WHERE customerId=${customerId} AND route=${route}
    LIMIT 1
  `);
  const row = result[0];
  const reason = String(row?.reason || '').trim();
  if (!reason) return null;
  return {
    reason,
    updatedBy: row?.updatedBy ? String(row.updatedBy) : null,
    updatedAt: row?.updatedAt ? new Date(row.updatedAt).toISOString() : null,
  };
}

export async function clearCustomerRouteRestrictionReason(customerId: number, route: CustomerRoute, dbArg?: any): Promise<void> {
  const db = dbArg || await getDb() as any;
  if (!db) return;
  await ensureCustomerIdentityInfrastructure(db);
  await db.execute(sql`DELETE FROM customerRouteRestrictionReasons WHERE customerId=${customerId} AND route=${route}`);
}

export async function setCustomerRouteRestrictionReason(
  customerId: number,
  route: CustomerRoute,
  reasonInput: string,
  updatedBy = 'Administrador',
  dbArg?: any,
): Promise<void> {
  const db = dbArg || await getDb() as any;
  if (!db) throw new Error('Banco de dados indisponível');
  await ensureCustomerIdentityInfrastructure(db);
  const reason = String(reasonInput || '').trim().slice(0, 500);
  if (!reason) {
    await clearCustomerRouteRestrictionReason(customerId, route, db);
    return;
  }
  await db.execute(sql`
    INSERT INTO customerRouteRestrictionReasons (customerId, route, reason, updatedBy, createdAt, updatedAt)
    VALUES (${customerId}, ${route}, ${reason}, ${updatedBy}, NOW(), NOW())
    ON DUPLICATE KEY UPDATE reason=VALUES(reason), updatedBy=VALUES(updatedBy), updatedAt=NOW()
  `);
}

export async function hasRouteAccess(customerId: number, route: CustomerRoute, dbArg?: any): Promise<{ allowed: boolean; restricted: boolean; routes: CustomerRoute[] }> {
  const access = await getRouteAccess(customerId, dbArg);
  return { ...access, allowed: !access.restricted || access.routes.includes(route) };
}
''',
    "customerAccess helpers",
)

replace_once(
    "server/customerAccess.ts",
    '''  for (const route of routes) {
    await db.execute(sql`
      INSERT INTO customerRoutePermissions (customerId, route, status, grantedBy, grantedAt, updatedAt)
      VALUES (${customerId}, ${route}, 'approved', ${grantedBy}, NOW(), NOW())
    `);
  }
  await syncLegacyLoanPermission(db, customerId, routes.includes('emprestimo'));
''',
    '''  for (const route of routes) {
    await db.execute(sql`
      INSERT INTO customerRoutePermissions (customerId, route, status, grantedBy, grantedAt, updatedAt)
      VALUES (${customerId}, ${route}, 'approved', ${grantedBy}, NOW(), NOW())
    `);
    // Ao liberar novamente uma rota, remove o motivo antigo para ele não reaparecer ao cliente.
    await clearCustomerRouteRestrictionReason(customerId, route, db);
  }
  await syncLegacyLoanPermission(db, customerId, routes.includes('emprestimo'));
''',
    "customerAccess clear reason on grant",
)

replace_once(
    "server/customerAccess.ts",
    '''      await db.execute(sql.raw(`
        CREATE TABLE IF NOT EXISTS customerRouteReleaseModes (
''',
    '''      await db.execute(sql.raw(`
        CREATE TABLE IF NOT EXISTS customerRouteRestrictionReasons (
          id INT AUTO_INCREMENT PRIMARY KEY,
          customerId INT NOT NULL,
          route VARCHAR(32) NOT NULL,
          reason VARCHAR(500) NOT NULL,
          updatedBy VARCHAR(100) NULL,
          createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          UNIQUE KEY customer_route_restriction_reason_unique (customerId, route),
          KEY customer_route_restriction_reason_route (route, updatedAt)
        )
      `));
      await db.execute(sql.raw(`
        CREATE TABLE IF NOT EXISTS customerRouteReleaseModes (
''',
    "customerAccess reason table",
)

# ---------------------------------------------------------------------------
# server/routers/spreadsheet.ts
# ---------------------------------------------------------------------------
replace_once(
    "server/routers/spreadsheet.ts",
    '''import { findMainCustomerByIdentity, getRouteAccess, normalizeCustomerPhone, setCustomerRoutePermissions } from "../customerAccess";''',
    '''import { findMainCustomerByIdentity, getCustomerRouteRestrictionReason, getRouteAccess, normalizeCustomerPhone, setCustomerRoutePermissions, setCustomerRouteRestrictionReason } from "../customerAccess";''',
    "spreadsheet imports",
)

replace_once(
    "server/routers/spreadsheet.ts",
    '''          if (access.restricted && !access.routes.includes(requestedRoute)) {
            return { status: 'access_restricted' as const, clientName: client.name, clientPhone: client.phone, allowedRoutes: access.routes };
          }
''',
    '''          if (access.restricted && !access.routes.includes(requestedRoute)) {
            const restriction = await getCustomerRouteRestrictionReason(accessCustomer.id, requestedRoute, db);
            return {
              status: 'access_restricted' as const,
              clientName: client.name,
              clientPhone: client.phone,
              allowedRoutes: access.routes,
              restrictionReason: restriction?.reason || null,
            };
          }
''',
    "spreadsheet checkPhone restriction reason",
)

replace_once(
    "server/routers/spreadsheet.ts",
    '''  updateClientRoutesByPhone: publicProcedure
    .input(z.object({
      phone: z.string(),
      allowedRoutes: z.string(),
    }))
''',
    '''  updateClientRoutesByPhone: publicProcedure
    .input(z.object({
      phone: z.string(),
      allowedRoutes: z.string(),
      disabledRoute: z.enum(['site', 'acompanhar', 'gastos', 'emprestimo']).optional(),
      restrictionReason: z.string().trim().max(500).optional(),
    }))
''',
    "spreadsheet updateClientRoutesByPhone input",
)

replace_once(
    "server/routers/spreadsheet.ts",
    '''        const routes = input.allowedRoutes.split(',').map((route: string) => route.trim()).filter(Boolean);
        await setCustomerRoutePermissions(mainCustomer.id, routes, 'Administrador', db);
        return { success: true };
''',
    '''        const routes = input.allowedRoutes.split(',').map((route: string) => route.trim()).filter(Boolean);
        await setCustomerRoutePermissions(mainCustomer.id, routes, 'Administrador', db);
        if (input.disabledRoute && !routes.includes(input.disabledRoute)) {
          await setCustomerRouteRestrictionReason(
            mainCustomer.id,
            input.disabledRoute,
            input.restrictionReason || 'Acesso temporariamente desativado pela administração.',
            'Administrador',
            db,
          );
        }
        return { success: true };
''',
    "spreadsheet updateClientRoutesByPhone reason",
)

replace_once(
    "server/routers/spreadsheet.ts",
    '''  adminUpdateAllowedRoutes: publicProcedure
    .input(z.object({
      clientId: z.number(),
      allowedRoutes: z.string(), // ex: "gastos,emprestimo" ou "gastos" ou ""
    }))
''',
    '''  adminUpdateAllowedRoutes: publicProcedure
    .input(z.object({
      clientId: z.number(),
      allowedRoutes: z.string(), // ex: "gastos,emprestimo" ou "gastos" ou ""
      disabledRoute: z.enum(['site', 'acompanhar', 'gastos', 'emprestimo']).optional(),
      restrictionReason: z.string().trim().max(500).optional(),
    }))
''',
    "spreadsheet adminUpdateAllowedRoutes input",
)

replace_once(
    "server/routers/spreadsheet.ts",
    '''            const routes = input.allowedRoutes.split(',').map((route: string) => route.trim()).filter(Boolean);
            await setCustomerRoutePermissions(mainCustomer.id, routes, 'Administrador', db);
          }
''',
    '''            const routes = input.allowedRoutes.split(',').map((route: string) => route.trim()).filter(Boolean);
            await setCustomerRoutePermissions(mainCustomer.id, routes, 'Administrador', db);
            if (input.disabledRoute && !routes.includes(input.disabledRoute)) {
              await setCustomerRouteRestrictionReason(
                mainCustomer.id,
                input.disabledRoute,
                input.restrictionReason || 'Acesso temporariamente desativado pela administração.',
                'Administrador',
                db,
              );
            }
          }
''',
    "spreadsheet adminUpdateAllowedRoutes reason",
)

replace_once(
    "server/routers/spreadsheet.ts",
    '''        const access = await getRouteAccess(mainCustomer.id, db);
        const allowed = !access.restricted || access.routes.includes(input.route as any);
        return { allowed, allowedRoutes: access.restricted ? access.routes : [] };
''',
    '''        const access = await getRouteAccess(mainCustomer.id, db);
        const allowed = !access.restricted || access.routes.includes(input.route as any);
        const restriction = allowed
          ? null
          : await getCustomerRouteRestrictionReason(mainCustomer.id, input.route as any, db);
        return {
          allowed,
          allowedRoutes: access.restricted ? access.routes : [],
          restrictionReason: restriction?.reason || null,
        };
''',
    "spreadsheet checkRouteAccess reason",
)

replace_once(
    "server/routers/spreadsheet.ts",
    '''        const access = await getRouteAccess(mainCustomer.id, db);
        const allowed = !access.restricted || access.routes.includes(input.route as any);
        return { allowed, allowedRoutes: access.restricted ? access.routes : [] };
      } catch (_) {
        return { allowed: true, allowedRoutes: [] };
      }
    }),

  adminUpdateClient:''',
    '''        const access = await getRouteAccess(mainCustomer.id, db);
        const allowed = !access.restricted || access.routes.includes(input.route as any);
        const restriction = allowed
          ? null
          : await getCustomerRouteRestrictionReason(mainCustomer.id, input.route as any, db);
        return {
          allowed,
          allowedRoutes: access.restricted ? access.routes : [],
          restrictionReason: restriction?.reason || null,
        };
      } catch (_) {
        return { allowed: true, allowedRoutes: [], restrictionReason: null };
      }
    }),

  adminUpdateClient:''',
    "spreadsheet checkRouteAccessByPhone reason",
)

# ---------------------------------------------------------------------------
# client/src/pages/AdminGastosPage.tsx
# ---------------------------------------------------------------------------
replace_once(
    "client/src/pages/AdminGastosPage.tsx",
    '''  const updateAllowedRoutesMutation = trpc.spreadsheet.adminUpdateAllowedRoutes.useMutation();

  // Modal de confirmar renovação de acesso
''',
    '''  const updateAllowedRoutesMutation = trpc.spreadsheet.adminUpdateAllowedRoutes.useMutation();

  const askRouteRestrictionReason = (routeLabel: string): string | null => {
    const reason = window.prompt(
      `Informe o motivo da desativação de ${routeLabel}. Esse texto será exibido ao cliente como aviso do sistema.`,
      'Acesso temporariamente desativado pela administração.',
    );
    if (reason === null) return null;
    const clean = reason.trim();
    if (!clean) {
      setError('Informe o motivo da desativação para continuar.');
      return null;
    }
    return clean;
  };

  // Modal de confirmar renovação de acesso
''',
    "AdminGastos reason prompt helper",
)

replace_once(
    "client/src/pages/AdminGastosPage.tsx",
    '''                                  onChange={async (e) => {
                                    const newRoutes = e.target.checked
                                      ? [...routes.filter((r: string) => r !== key), key]
                                      : routes.filter((r: string) => r !== key);
                                    try {
                                      await updateAllowedRoutesMutation.mutateAsync({
                                        clientId: c.id,
                                        allowedRoutes: newRoutes.join(','),
                                      });
                                      clientsQuery.refetch();
                                    } catch (err) {
                                      console.error('Erro ao atualizar rotas', err);
                                    }
                                  }}
''',
    '''                                  onChange={async (e) => {
                                    const checked = e.target.checked;
                                    const restrictionReason = checked ? undefined : askRouteRestrictionReason(label);
                                    if (!checked && !restrictionReason) return;
                                    const newRoutes = checked
                                      ? [...routes.filter((r: string) => r !== key), key]
                                      : routes.filter((r: string) => r !== key);
                                    try {
                                      await updateAllowedRoutesMutation.mutateAsync({
                                        clientId: c.id,
                                        allowedRoutes: newRoutes.join(','),
                                        disabledRoute: checked ? undefined : (key as 'gastos' | 'emprestimo'),
                                        restrictionReason,
                                      });
                                      setSuccess(checked
                                        ? `${label} liberado para ${c.name}.`
                                        : `${label} desativado para ${c.name}. O motivo será mostrado automaticamente ao cliente.`);
                                      clientsQuery.refetch();
                                    } catch (err: any) {
                                      setError(err?.message || 'Erro ao atualizar rotas');
                                    }
                                  }}
''',
    "AdminGastos route toggle reason",
)

# ---------------------------------------------------------------------------
# client/src/pages/AdminCustomers.tsx
# ---------------------------------------------------------------------------
replace_once(
    "client/src/pages/AdminCustomers.tsx",
    '''  const handleToggle = async (routeKey: string, checked: boolean) => {
    let newRoutes: string[];
    if (!hasRestriction) {
      newRoutes = checked ? ROUTES.map(r => r.key) : ROUTES.map(r => r.key).filter(k => k !== routeKey);
    } else {
      newRoutes = checked ? [...routes.filter(r => r !== routeKey), routeKey] : routes.filter(r => r !== routeKey);
    }
    setOptimisticRoutes(newRoutes);
    try {
      await updateRoutesMut.mutateAsync({ phone: phone.replace(/\D/g, ''), allowedRoutes: newRoutes.join(',') });
      await refetch();
    } finally {
      setOptimisticRoutes(null);
    }
  };
''',
    '''  const handleToggle = async (routeKey: string, checked: boolean) => {
    const routeLabel = ROUTES.find((route) => route.key === routeKey)?.label || routeKey;
    let restrictionReason: string | undefined;
    if (!checked) {
      const reason = window.prompt(
        `Informe o motivo da desativação de ${routeLabel}. Esse texto será exibido ao cliente como aviso do sistema.`,
        'Acesso temporariamente desativado pela administração.',
      );
      if (reason === null) return;
      const clean = reason.trim();
      if (!clean) {
        toast.error('Informe o motivo da desativação para continuar.');
        return;
      }
      restrictionReason = clean;
    }

    let newRoutes: string[];
    if (!hasRestriction) {
      newRoutes = checked ? ROUTES.map(r => r.key) : ROUTES.map(r => r.key).filter(k => k !== routeKey);
    } else {
      newRoutes = checked ? [...routes.filter(r => r !== routeKey), routeKey] : routes.filter(r => r !== routeKey);
    }
    setOptimisticRoutes(newRoutes);
    try {
      await updateRoutesMut.mutateAsync({
        phone: phone.replace(/\D/g, ''),
        allowedRoutes: newRoutes.join(','),
        disabledRoute: checked ? undefined : (routeKey as 'site' | 'gastos' | 'emprestimo'),
        restrictionReason,
      });
      toast.success(checked
        ? `${routeLabel} liberado.`
        : `${routeLabel} desativado. O motivo será exibido automaticamente ao cliente.`);
      await refetch();
    } finally {
      setOptimisticRoutes(null);
    }
  };
''',
    "AdminCustomers route toggle reason",
)

# ---------------------------------------------------------------------------
# client/src/pages/GastosLoginPage.tsx
# ---------------------------------------------------------------------------
replace_once(
    "client/src/pages/GastosLoginPage.tsx",
    '''  const [allowedRoutes, setAllowedRoutes] = useState<string[]>([]);
  const [restrictedPhone, setRestrictedPhone] = useState('');
''',
    '''  const [allowedRoutes, setAllowedRoutes] = useState<string[]>([]);
  const [restrictedPhone, setRestrictedPhone] = useState('');
  const [restrictionReason, setRestrictionReason] = useState<string | null>(null);
''',
    "GastosLogin restriction reason state",
)

replace_once(
    "client/src/pages/GastosLoginPage.tsx",
    '''        case 'access_restricted':
          setAllowedRoutes((result as any).allowedRoutes || []);
          setRestrictedPhone((result as any).clientPhone || cleanPhone);
          setStep('access_restricted');
          break;
''',
    '''        case 'access_restricted':
          setAllowedRoutes((result as any).allowedRoutes || []);
          setRestrictedPhone((result as any).clientPhone || cleanPhone);
          setRestrictionReason((result as any).restrictionReason || null);
          setStep('access_restricted');
          break;
''',
    "GastosLogin set reason",
)

replace_once(
    "client/src/pages/GastosLoginPage.tsx",
    '''              <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                <AlertCircle className="w-7 h-7 text-amber-300 mx-auto mb-2" />
                <p className="text-base font-semibold text-amber-200">Acesso não autorizado</p>
                <p className="text-sm text-muted-foreground mt-2">Seu cadastro foi encontrado, mas esta área ainda não foi liberada pelo administrador.</p>
                {allowedRoutes.length > 0 && <p className="text-xs text-green-300 mt-3">Acesso atual: {allowedRoutes.join(', ')}</p>}
              </div>
''',
    '''              <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                <AlertCircle className="w-7 h-7 text-amber-300 mx-auto mb-2" />
                <p className="text-xs font-black uppercase tracking-[0.18em] text-amber-400">Aviso do sistema</p>
                <p className="mt-1 text-base font-semibold text-amber-100">Acesso temporariamente suspenso</p>
                <p className="text-sm text-muted-foreground mt-2">O sistema informa que seu acesso a esta área está desativado no momento.</p>
                <div className="mt-3 rounded-lg border border-amber-400/25 bg-black/20 p-3 text-left">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-amber-300">Motivo informado</p>
                  <p className="mt-1 text-sm leading-5 text-foreground">{restrictionReason || 'Acesso ainda não liberado para esta área.'}</p>
                </div>
                {allowedRoutes.length > 0 && <p className="text-xs text-green-300 mt-3">Acesso atual: {allowedRoutes.join(', ')}</p>}
              </div>
''',
    "GastosLogin reason UI",
)

# ---------------------------------------------------------------------------
# client/src/pages/GastosPage.tsx
# ---------------------------------------------------------------------------
replace_once(
    "client/src/pages/GastosPage.tsx",
    '''function AcessoNegado({ routeLabel, onLogout }: { routeLabel: string; onLogout: () => void }) {''',
    '''function AcessoNegado({ routeLabel, reason, onLogout }: { routeLabel: string; reason?: string | null; onLogout: () => void }) {''',
    "GastosPage denied props",
)

replace_once(
    "client/src/pages/GastosPage.tsx",
    '''        <h2 className="text-xl font-bold text-red-300">Acesso não permitido</h2>
        <p className="text-sm text-muted-foreground">Você não tem permissão para acessar a área de <strong className="text-foreground">{routeLabel}</strong>. Solicite a liberação ao administrador.</p>
''',
    '''        <p className="text-xs font-black uppercase tracking-[0.18em] text-red-400">Aviso do sistema</p>
        <h2 className="text-xl font-bold text-red-200">Acesso temporariamente suspenso</h2>
        <p className="text-sm text-muted-foreground">O sistema informa que seu acesso à área de <strong className="text-foreground">{routeLabel}</strong> está desativado no momento.</p>
        <div className="rounded-xl border border-red-400/25 bg-red-950/20 p-3 text-left">
          <p className="text-[11px] font-black uppercase tracking-wide text-red-300">Motivo informado</p>
          <p className="mt-1 text-sm leading-5 text-foreground">{reason || 'Acesso ainda não liberado para esta área.'}</p>
        </div>
''',
    "GastosPage denied reason UI",
)

replace_once(
    "client/src/pages/GastosPage.tsx",
    '''  if (routeAccessQuery.data && !routeAccessQuery.data.allowed) return <AcessoNegado routeLabel="Gastos" onLogout={handleLogout} />;''',
    '''  if (routeAccessQuery.data && !routeAccessQuery.data.allowed) return <AcessoNegado routeLabel="Gastos" reason={(routeAccessQuery.data as any).restrictionReason} onLogout={handleLogout} />;''',
    "GastosPage pass reason",
)

# ---------------------------------------------------------------------------
# client/src/pages/EmprestimoPage.tsx
# ---------------------------------------------------------------------------
replace_once(
    "client/src/pages/EmprestimoPage.tsx",
    '''function AcessoNegado({ routeLabel, onLogout }: { routeLabel: string; onLogout: () => void }) {''',
    '''function AcessoNegado({ routeLabel, reason, onLogout }: { routeLabel: string; reason?: string | null; onLogout: () => void }) {''',
    "EmprestimoPage denied props",
)

replace_once(
    "client/src/pages/EmprestimoPage.tsx",
    '''        <h2 className="text-xl font-bold text-red-300">Acesso não permitido</h2>
        <p className="text-sm text-muted-foreground">Você não tem permissão para acessar a área de <strong className="text-foreground">{routeLabel}</strong>. Solicite a liberação ao administrador.</p>
''',
    '''        <p className="text-xs font-black uppercase tracking-[0.18em] text-red-400">Aviso do sistema</p>
        <h2 className="text-xl font-bold text-red-200">Acesso temporariamente suspenso</h2>
        <p className="text-sm text-muted-foreground">O sistema informa que seu acesso à área de <strong className="text-foreground">{routeLabel}</strong> está desativado no momento.</p>
        <div className="rounded-xl border border-red-400/25 bg-red-950/20 p-3 text-left">
          <p className="text-[11px] font-black uppercase tracking-wide text-red-300">Motivo informado</p>
          <p className="mt-1 text-sm leading-5 text-foreground">{reason || 'Acesso ainda não liberado para esta área.'}</p>
        </div>
''',
    "EmprestimoPage denied reason UI",
)

replace_once(
    "client/src/pages/EmprestimoPage.tsx",
    '''  if (routeAccessQuery.data && !routeAccessQuery.data.allowed) return <AcessoNegado routeLabel="Empréstimos" onLogout={handleLogout} />;''',
    '''  if (routeAccessQuery.data && !routeAccessQuery.data.allowed) return <AcessoNegado routeLabel="Empréstimos" reason={(routeAccessQuery.data as any).restrictionReason} onLogout={handleLogout} />;''',
    "EmprestimoPage pass reason",
)

print("patch_route_block_reason: ok")
