/**
 * Rota antiga, mantida só como redirecionamento.
 * Conteúdo real mudou pra pages/sources/pdpj.tsx — ver
 * docs/roadmap/23-meujudi-cs-v0.3.0-refatoracao.md Fase 1.
 */

import { useEffect } from 'react';
import { useRouter } from 'next/router';

export default function PjeConnectionRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/sources/pdpj/');
  }, [router]);

  return null;
}
