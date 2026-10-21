/**
 * The assembly's warnings by project path, for the fields they are about.
 */
import { useMemo } from 'react';
import type { Warning } from '@core/model/assembly.ts';
import { useAssembly } from '../../store/selectors.ts';

export function useWarningsByPath(): ReadonlyMap<string, Warning[]> {
  const { warnings } = useAssembly();
  return useMemo(() => {
    const map = new Map<string, Warning[]>();
    for (const w of warnings) {
      if (!w.paramPath) continue;
      map.set(w.paramPath, [...(map.get(w.paramPath) ?? []), w]);
    }
    return map;
  }, [warnings]);
}
