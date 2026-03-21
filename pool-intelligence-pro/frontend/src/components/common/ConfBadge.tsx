/** Badge inline de confiança de dado. Retorna null para 'high' ou undefined (sem ruído visual desnecessário). */
export function ConfBadge({ conf }: { conf?: 'high' | 'medium' | 'low' }) {
  if (!conf || conf === 'high') return null;
  return (
    <span
      className={`ml-1 text-[9px] px-1 rounded font-mono ${
        conf === 'medium' ? 'bg-yellow-500/10 text-yellow-400' : 'bg-muted text-muted-foreground'
      }`}
      title={conf === 'medium' ? 'Dado estimado ou suplementado' : 'Dado de baixa confiança — estimativa'}
    >
      {conf === 'medium' ? 'est.' : 'aprox.'}
    </span>
  );
}
