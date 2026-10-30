import type { ReactNode } from 'react';
import { isParamVisible } from '@core/schema/defs.ts';
import type { SchemaFormProps } from '../forms/SchemaForm.tsx';
import { InspectorSection } from './InspectorSection.tsx';

/** Show only applicable technical groups and keep their field notes accessible when closed. */
export function ParameterSection({
  title,
  description,
  groups,
  values,
  warningsFor,
  children,
}: Pick<SchemaFormProps, 'groups' | 'values' | 'warningsFor'> & {
  title: string;
  description: string;
  children: ReactNode;
}) {
  const visible = groups.flatMap((g) => g.params).filter((d) => isParamVisible(d, values));
  if (visible.length === 0) return null;
  const warnings = [...new Set(visible.flatMap((d) => warningsFor?.(d.key) ?? []))];
  return (
    <InspectorSection title={title} description={description} warnings={warnings}>
      {children}
    </InspectorSection>
  );
}
