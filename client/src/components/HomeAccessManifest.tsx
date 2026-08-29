import { useEffect } from 'react';

/**
 * Compatibilidade temporária com o WelcomeScreen antigo.
 * A etapa separada de indicação foi removida: a indicação agora pertence
 * exclusivamente ao cadastro central (PasswordGate).
 */
export function HomeAccessManifest({ onGranted }: { onGranted: () => void }) {
  useEffect(() => {
    onGranted();
  }, [onGranted]);

  return null;
}
