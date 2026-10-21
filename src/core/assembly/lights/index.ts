/**
 * Light sources by kind: each contributes the envelope the hub is built around
 * (`lightEnvelope`) and the insert the hub cuts for it (`lightInsert`). Bulb
 * sockets (E27 / E14) and LED strips register here in M2.3.
 */
import type { LightEnvelope, LightInsert } from '../../model/parts.ts';
import type { LightSource } from '../../model/project.ts';
import { puckEnvelope, puckInsert } from './puck.ts';

export function lightEnvelope(light: LightSource): LightEnvelope {
  switch (light.kind) {
    case 'puck':
      return puckEnvelope(light);
  }
}

export function lightInsert(light: LightSource): LightInsert {
  switch (light.kind) {
    case 'puck':
      return puckInsert(light);
  }
}
