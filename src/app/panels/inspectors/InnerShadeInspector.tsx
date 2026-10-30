import { useProjectStore } from '../../store/projectStore.ts';
import { useUiStore } from '../../store/uiStore.ts';
import styles from '../Inspector.module.css';
import { ShadeControls } from './ShadeControls.tsx';

export function InnerShadeInspector() {
  const inner = useProjectStore((s) => s.project.shades[1]);
  if (!inner) return null;
  const remove = () => {
    useProjectStore.getState().removeInnerShade();
    useUiStore.getState().select('outerShade', 'shade');
    useUiStore.getState().requestFit(true);
  };
  return (
    <>
      <ShadeControls role="inner" shade={inner} />
      <div className={styles.shadeActions}>
        <p className={styles.hint}>
          A second shade hangs from its own collar inside the outer one.
        </p>
        <button type="button" className={styles.wide} onClick={remove}>
          Remove inner shade
        </button>
      </div>
    </>
  );
}
