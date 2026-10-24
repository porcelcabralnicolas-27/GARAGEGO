import type { ReactNode } from 'react';

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="gg-page-header">
      <div>
        <h1 className="gg-page-header__title">{title}</h1>
        {description ? <p className="gg-page-header__desc">{description}</p> : null}
      </div>
      {actions ? <div className="gg-page-header__actions">{actions}</div> : null}
    </header>
  );
}
