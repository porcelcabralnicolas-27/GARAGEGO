import { Navigate, useNavigate, useParams } from 'react-router-dom';

import { PageHeader } from '../../shell/PageHeader';
import { Tabs } from '../../ui/controls';
import { CatalogSettings } from './CatalogSettings';
import { ChecklistSettings } from './ChecklistSettings';
import { DocumentSettings } from './DocumentSettings';
import { LimitsSettings } from './LimitsSettings';
import { ModerationSettings } from './ModerationSettings';

/**
 * Configuración del panel: las reglas del sistema que el equipo ajusta sin tocar el código, en
 * cuatro secciones. Cada una tiene su dirección (/configuracion/limites…), así se puede compartir
 * o volver con el botón Atrás.
 */
const SECTIONS = [
  { value: 'aprobacion', label: 'Aprobación y titularidad' },
  { value: 'limites', label: 'Límites' },
  { value: 'catalogos', label: 'Catálogos' },
  { value: 'moderacion', label: 'Moderación' },
] as const;

type Section = (typeof SECTIONS)[number]['value'];

const isSection = (value: string | undefined): value is Section =>
  SECTIONS.some((section) => section.value === value);

export function SettingsPage() {
  const { section } = useParams<{ section?: string }>();
  const navigate = useNavigate();

  if (!isSection(section)) return <Navigate to="/configuracion/aprobacion" replace />;

  return (
    <>
      <PageHeader
        title="Configuración"
        description="Reglas del sistema que el equipo puede ajustar sin tocar el código."
      />
      <Tabs
        value={section}
        onChange={(next) => navigate(`/configuracion/${next}`)}
        items={SECTIONS.map(({ value, label }) => ({ value, label }))}
      />
      <div style={{ padding: 'var(--gg-s4)', maxWidth: 960 }}>
        {section === 'aprobacion' ? (
          <div className="gg-stack" style={{ gap: 'var(--gg-s4)' }}>
            <ChecklistSettings />
            <DocumentSettings />
          </div>
        ) : null}
        {section === 'limites' ? <LimitsSettings /> : null}
        {section === 'catalogos' ? <CatalogSettings /> : null}
        {section === 'moderacion' ? <ModerationSettings /> : null}
      </div>
    </>
  );
}
