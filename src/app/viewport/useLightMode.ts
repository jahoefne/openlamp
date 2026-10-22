/**
 * The viewport's light mode (see lightMode.ts) from the view options.
 */
import { useUiStore } from '../store/uiStore.ts';
import { lightModeOf, type LightMode } from './lightMode.ts';

export function useLightMode(): LightMode {
  return useUiStore((s) => lightModeOf(s.lightOn, s.simpleLight, s.viewMode === 'bed'));
}
