export function manualSiteAccessFeedback(result: {created: boolean; status: string; expired: boolean}): {
  kind: 'success' | 'warning'; message: string; clearForm: boolean;
} {
  if (result.status === 'suspended') return {
    kind: 'warning', clearForm: false,
    message: 'Este e-mail já está cadastrado, mas continua suspenso. Use Reativar na lista para liberar o acesso.',
  };
  if (result.expired) return {
    kind: 'warning', clearForm: false,
    message: 'Este e-mail já está cadastrado, mas a autorização está vencida. Nenhum acesso foi liberado.',
  };
  if (result.status !== 'active') return {
    kind: 'warning', clearForm: false,
    message: 'Este e-mail já está cadastrado. Confira a situação na lista antes de liberar o acesso.',
  };
  return {
    kind: 'success', clearForm: true,
    message: result.created ? 'Autorização registrada.' : 'Este e-mail já está autorizado. Não foi criado outro cadastro.',
  };
}

/** Never display raw SQL, query parameters, driver messages or user identities. */
export function manualSiteAccessErrorMessage(code: string | undefined): string {
  if (code === 'BAD_REQUEST') return 'Confira o nome, o e-mail, o telefone e a validade informados.';
  if (code === 'FORBIDDEN' || code === 'UNAUTHORIZED') return 'Acesso reservado ao Super Admin. Entre novamente no ADM.';
  if (code === 'CONFLICT') return 'Alteração temporariamente bloqueada. Aguarde e tente novamente.';
  return 'Não foi possível salvar a autorização. Tente novamente. Código: SAE_ADD.';
}
