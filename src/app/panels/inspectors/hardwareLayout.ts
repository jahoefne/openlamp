import {
  HUB_JOINT_GROUPS,
  LIGHT_GROUPS,
  MOUNT_GROUPS,
  type ParamGroup,
} from '@core/schema/defs.ts';

interface SectionSpec {
  id: string;
  title: string;
  description: string;
  keys?: readonly string[];
}

/** UI-only partition: unassigned parameters fall into the final construction section. */
function layout(
  groups: readonly ParamGroup[],
  label: string,
  primaryKeys: readonly string[],
  sections: readonly SectionSpec[],
) {
  const defs = groups.flatMap((g) => g.params);
  const ordered = (keys: readonly string[]) =>
    keys.flatMap((key) => defs.filter((d) => d.key === key));
  const assigned = new Set([...primaryKeys, ...sections.flatMap((s) => s.keys ?? [])]);
  return {
    primary: [
      { id: 'common', label, params: ordered(primaryKeys) },
    ] satisfies readonly ParamGroup[],
    sections: sections.map((section) => ({
      ...section,
      groups: [
        {
          id: section.id,
          label: section.title,
          params: section.keys ? ordered(section.keys) : defs.filter((d) => !assigned.has(d.key)),
        },
      ] satisfies readonly ParamGroup[],
    })),
  };
}

export const MOUNT_LAYOUT = {
  ceilingStrap: layout(
    MOUNT_GROUPS.ceilingStrap,
    'Strap size',
    ['strapWidth', 'strapThickness'],
    [
      {
        id: 'construction',
        title: 'Construction',
        description: 'Tunnel length and wall thickness',
      },
    ],
  ),
  ceilingCord: layout(
    MOUNT_GROUPS.ceilingCord,
    'Placement & shape',
    ['dropLength', 'grip', 'canopyDiameter', 'canopyHeight'],
    [
      {
        id: 'routing',
        title: 'Cable routing',
        description: 'Cord diameter and cable openings',
        keys: ['cordDiameter'],
      },
      { id: 'construction', title: 'Construction', description: 'Ceiling canopy fixings' },
    ],
  ),
  wallArm: layout(
    MOUNT_GROUPS.wallArm,
    'Placement & shape',
    ['armShape', 'armLength', 'armRiseAngle', 'armTubeDiameter', 'plateWidth', 'plateHeight'],
    [
      {
        id: 'routing',
        title: 'Cable routing',
        description: 'Cable bore through the arm',
        keys: ['armCableDiameter'],
      },
      {
        id: 'construction',
        title: 'Construction',
        description: 'Plate thickness and wall fixings',
      },
    ],
  ),
  standing: layout(
    MOUNT_GROUPS.standing,
    'Placement & shape',
    ['standingVariant', 'stemTotalHeight', 'baseDiameter', 'baseHeight', 'stemDiameter'],
    [
      {
        id: 'construction',
        title: 'Construction',
        description: 'Printed segments, weight pocket and lid',
      },
      {
        id: 'routing',
        title: 'Cable routing',
        description: 'Cable bore through the stem',
        keys: ['stemCableDiameter'],
      },
    ],
  ),
};

export const LIGHT_LAYOUT = {
  puck: layout(
    LIGHT_GROUPS.puck,
    'Light dimensions',
    ['puckDiameter', 'puckHeight'],
    [
      {
        id: 'fit',
        title: 'Puck fit',
        description: 'Clearance, pocket depth and light opening',
        keys: ['puckClearance', 'pocketExtraDepth', 'lightHoleDiameter'],
      },
      {
        id: 'housing',
        title: 'Housing & cable',
        description: 'Ledge, housing wall and cable slot',
      },
    ],
  ),
  bulb: layout(
    LIGHT_GROUPS.bulb,
    'Light setup',
    ['bulbFitting', 'bulbDiameter', 'bulbLength', 'bulbHeatClearance'],
    [
      { id: 'fit', title: 'Lampholder fit', description: 'Plate and skirt dimensions' },
      {
        id: 'routing',
        title: 'Cable routing',
        description: 'Cable opening through the hub',
        keys: ['bulbCableDiameter'],
      },
    ],
  ),
  strip: layout(
    LIGHT_GROUPS.strip,
    'Light dimensions',
    ['stripRingDiameter', 'stripWidth', 'stripThickness'],
    [{ id: 'channel', title: 'Channel & cable', description: 'Recess depth and cable slot' }],
  ),
};

export const HUB_LAYOUT = layout(
  HUB_JOINT_GROUPS,
  'Connection',
  ['shadeToHub', 'jointTolerance'],
  [
    {
      id: 'thread',
      title: 'Thread details',
      description: 'Pitch and depth of the printed thread',
      keys: ['threadPitch', 'threadDepth'],
    },
    {
      id: 'construction',
      title: 'Hub construction',
      description: 'Collars, shoulder, inner-shade spacing and vents',
    },
  ],
);
