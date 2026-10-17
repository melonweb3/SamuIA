import type { ReactNode } from 'react';
import type { MatchState, StudioCommand, StudioSnapshot } from '../../../packages/shared/src/index';
export type Send = (command: StudioCommand) => Promise<boolean>;
export type ViewProps = { state: StudioSnapshot; send: Send };
export const matchTitle = (m: MatchState) => `${m.home.shortName} – ${m.away.shortName}`;
export const pretty = (s: string) => s.replaceAll('_', ' ');
export const statusLabels = {
  upcoming: 'Próximo',
  live: 'En directo',
  halftime: 'Descanso',
  finished: 'Finalizado',
};
export function Panel({
  title,
  meta,
  children,
  className = '',
}: {
  title: string;
  meta?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel ${className}`}>
      <header className="panel-head">
        <h2>{title}</h2>
        {meta}
      </header>
      {children}
    </section>
  );
}
export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}
export function Badge({ children }: { children: ReactNode }) {
  return <span className="badge">{children}</span>;
}
export function exportJson(value: unknown, filename: string) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
