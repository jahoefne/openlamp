/**
 * The inspector: the parameters of the lamp-tree node that is selected, and
 * only those (`uiStore.selection`): the project's output and view options,
 * the printer, the mount, the light, the outer or inner shade, or the hub &
 * joints. Every group is the core schema's (`SchemaForm`), edited through
 * the project store's actions.
 */
import { NODE_LABELS, type NodeId } from '../store/nodes.ts';
import { useShownNode } from '../store/selectors.ts';
import { useLightMode } from '../viewport/useLightMode.ts';
import { HubInspector } from './inspectors/HubInspector.tsx';
import { InnerShadeInspector } from './inspectors/InnerShadeInspector.tsx';
import { LightInspector } from './inspectors/LightInspector.tsx';
import { MountInspector } from './inspectors/MountInspector.tsx';
import { PrinterInspector } from './inspectors/PrinterInspector.tsx';
import { ProjectInspector } from './inspectors/ProjectInspector.tsx';
import { ShadeInspector } from './inspectors/ShadeInspector.tsx';
import styles from './Inspector.module.css';

function NodeInspector({ node }: { node: NodeId }) {
  switch (node) {
    case 'project':
      return <ProjectInspector />;
    case 'printer':
      return <PrinterInspector />;
    case 'mount':
      return <MountInspector />;
    case 'light':
      return <LightInspector />;
    case 'outerShade':
      return <ShadeInspector />;
    case 'innerShade':
      return <InnerShadeInspector />;
    case 'hub':
      return <HubInspector />;
  }
}

export function Inspector({ heading = true }: { heading?: boolean }) {
  const node = useShownNode();
  const lit = useLightMode() !== 'off';
  return (
    <div className={styles.inspector} data-node={node}>
      {heading ? (
        <>
          <p className={styles.eyebrow}>{lit ? 'Sculpt the light' : 'Make it yours'}</p>
          <h2 className={styles.title} id="inspector-title">
            {NODE_LABELS[node]}
          </h2>
          <p className={styles.intro}>
            {node === 'outerShade' || node === 'innerShade'
              ? 'The shape of things.'
              : 'Every detail, considered.'}
          </p>
        </>
      ) : null}
      {/* Keyed by node, so a form's local state (a half-typed number) never leaks into another. */}
      <form key={node} autoComplete="off" onSubmit={(e) => e.preventDefault()}>
        <NodeInspector node={node} />
      </form>
    </div>
  );
}
