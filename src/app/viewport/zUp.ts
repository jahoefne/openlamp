/**
 * Z is up, as on the printer bed. Imported first (main.tsx, Viewport.tsx) so
 * every Object3D, camera, light and OrbitControls is created with this up.
 */
import { Object3D } from 'three';

Object3D.DEFAULT_UP.set(0, 0, 1);
