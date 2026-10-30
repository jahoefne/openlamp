import { useProjectStore } from '../../store/projectStore.ts';
import { ShadeControls } from './ShadeControls.tsx';

export function ShadeInspector() {
  const shade = useProjectStore((s) => s.project.shades[0]);
  return <ShadeControls role="outer" shade={shade} />;
}
