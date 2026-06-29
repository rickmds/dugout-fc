export type GameFormat = '4v4' | '7v7' | '9v9' | '11v11';

export interface PositionSlot {
  label: string;
  x: number; // 0–100, left → right (LB/LM/LW at low x, RB/RM/RW at high x)
  y: number; // 0–100, top (attack) → bottom (GK end)
}

export interface Formation {
  id: string;
  name: string;
  nickname: string;
  description: string;
  format: GameFormat;
  positions: PositionSlot[];
}

// ─── 11v11 ────────────────────────────────────────────────────────────────────

const FORMATIONS_11V11: Formation[] = [
  {
    id: '4-3-3',
    name: '4-3-3',
    nickname: 'Classic',
    description: 'Balanced with wide attackers. Great all-round formation for possession-based teams.',
    format: '11v11',
    positions: [
      { label: 'GK',  x: 50, y: 92 },
      { label: 'LB',  x: 20, y: 75 }, { label: 'CB',  x: 38, y: 75 }, { label: 'CB',  x: 62, y: 75 }, { label: 'RB',  x: 80, y: 75 },
      { label: 'LM',  x: 22, y: 52 }, { label: 'CM',  x: 50, y: 50 }, { label: 'RM',  x: 78, y: 52 },
      { label: 'LW',  x: 18, y: 22 }, { label: 'ST',  x: 50, y: 15 }, { label: 'RW',  x: 82, y: 22 },
    ],
  },
  {
    id: '4-4-2',
    name: '4-4-2',
    nickname: 'Flat',
    description: 'Two banks of four with two strikers. Physical and hard to break down.',
    format: '11v11',
    positions: [
      { label: 'GK',  x: 50, y: 92 },
      { label: 'LB',  x: 18, y: 75 }, { label: 'CB',  x: 38, y: 75 }, { label: 'CB',  x: 62, y: 75 }, { label: 'RB',  x: 82, y: 75 },
      { label: 'LM',  x: 18, y: 55 }, { label: 'CM',  x: 38, y: 55 }, { label: 'CM',  x: 62, y: 55 }, { label: 'RM',  x: 82, y: 55 },
      { label: 'ST',  x: 35, y: 18 }, { label: 'ST',  x: 65, y: 18 },
    ],
  },
  {
    id: '4-4-2-diamond',
    name: '4-4-2 Diamond',
    nickname: 'Diamond 442',
    description: 'A 4-4-2 with a diamond midfield. Controls the centre but can leave wide areas exposed.',
    format: '11v11',
    positions: [
      { label: 'GK',  x: 50, y: 92 },
      { label: 'LB',  x: 18, y: 75 }, { label: 'CB',  x: 38, y: 75 }, { label: 'CB',  x: 62, y: 75 }, { label: 'RB',  x: 82, y: 75 },
      { label: 'DM',  x: 50, y: 62 },
      { label: 'CM',  x: 28, y: 50 }, { label: 'CM',  x: 72, y: 50 },
      { label: 'CAM', x: 50, y: 38 },
      { label: 'ST',  x: 35, y: 18 }, { label: 'ST',  x: 65, y: 18 },
    ],
  },
  {
    id: '4-3-2-1',
    name: '4-3-2-1',
    nickname: 'Christmas Tree',
    description: 'Narrow and clinical. Two shadow strikers behind a lone forward. Great for counter-attacks.',
    format: '11v11',
    positions: [
      { label: 'GK',  x: 50, y: 92 },
      { label: 'LB',  x: 18, y: 75 }, { label: 'CB',  x: 38, y: 75 }, { label: 'CB',  x: 62, y: 75 }, { label: 'RB',  x: 82, y: 75 },
      { label: 'LM',  x: 22, y: 58 }, { label: 'CM',  x: 50, y: 56 }, { label: 'RM',  x: 78, y: 58 },
      { label: 'SS',  x: 32, y: 38 }, { label: 'SS',  x: 68, y: 38 },
      { label: 'ST',  x: 50, y: 15 },
    ],
  },
  {
    id: '4-1-2-1-2',
    name: '4-1-2-1-2',
    nickname: 'Diamond',
    description: 'Dominant in central midfield. Narrow shape — requires width from fullbacks.',
    format: '11v11',
    positions: [
      { label: 'GK',  x: 50, y: 92 },
      { label: 'LB',  x: 18, y: 75 }, { label: 'CB',  x: 38, y: 75 }, { label: 'CB',  x: 62, y: 75 }, { label: 'RB',  x: 82, y: 75 },
      { label: 'DM',  x: 50, y: 63 },
      { label: 'CM',  x: 28, y: 50 }, { label: 'CM',  x: 72, y: 50 },
      { label: 'CAM', x: 50, y: 37 },
      { label: 'ST',  x: 35, y: 18 }, { label: 'ST',  x: 65, y: 18 },
    ],
  },
  {
    id: '4-1-4-1',
    name: '4-1-4-1',
    nickname: 'Defensive Shield',
    description: 'Single pivot protects the back four. Wide midfielders provide width and tracking.',
    format: '11v11',
    positions: [
      { label: 'GK',  x: 50, y: 92 },
      { label: 'LB',  x: 18, y: 75 }, { label: 'CB',  x: 38, y: 75 }, { label: 'CB',  x: 62, y: 75 }, { label: 'RB',  x: 82, y: 75 },
      { label: 'DM',  x: 50, y: 63 },
      { label: 'LM',  x: 15, y: 48 }, { label: 'CM',  x: 35, y: 48 }, { label: 'CM',  x: 65, y: 48 }, { label: 'RM',  x: 85, y: 48 },
      { label: 'ST',  x: 50, y: 15 },
    ],
  },
  {
    id: '4-4-1-1',
    name: '4-4-1-1',
    nickname: 'Second Striker',
    description: 'Number 10 sits just behind the striker. Great for teams with a creative attacking midfielder.',
    format: '11v11',
    positions: [
      { label: 'GK',  x: 50, y: 92 },
      { label: 'LB',  x: 18, y: 75 }, { label: 'CB',  x: 38, y: 75 }, { label: 'CB',  x: 62, y: 75 }, { label: 'RB',  x: 82, y: 75 },
      { label: 'LM',  x: 18, y: 56 }, { label: 'CM',  x: 38, y: 56 }, { label: 'CM',  x: 62, y: 56 }, { label: 'RM',  x: 82, y: 56 },
      { label: 'SS',  x: 50, y: 35 },
      { label: 'ST',  x: 50, y: 18 },
    ],
  },
  {
    id: '3-5-2',
    name: '3-5-2',
    nickname: 'Wing Backs',
    description: 'Three centre-backs with attacking wing-backs. Overloads midfield and creates wide overloads.',
    format: '11v11',
    positions: [
      { label: 'GK',  x: 50, y: 92 },
      { label: 'CB',  x: 25, y: 75 }, { label: 'CB',  x: 50, y: 72 }, { label: 'CB',  x: 75, y: 75 },
      { label: 'LWB', x: 12, y: 55 }, { label: 'CM',  x: 32, y: 55 }, { label: 'CM',  x: 50, y: 50 }, { label: 'CM',  x: 68, y: 55 }, { label: 'RWB', x: 88, y: 55 },
      { label: 'ST',  x: 35, y: 18 }, { label: 'ST',  x: 65, y: 18 },
    ],
  },
  {
    id: '3-4-3',
    name: '3-4-3',
    nickname: 'Total Football',
    description: 'Attack-minded with three forwards. High risk, high reward. Requires fit, technical players.',
    format: '11v11',
    positions: [
      { label: 'GK',  x: 50, y: 92 },
      { label: 'CB',  x: 25, y: 75 }, { label: 'CB',  x: 50, y: 72 }, { label: 'CB',  x: 75, y: 75 },
      { label: 'LM',  x: 15, y: 52 }, { label: 'CM',  x: 38, y: 52 }, { label: 'CM',  x: 62, y: 52 }, { label: 'RM',  x: 85, y: 52 },
      { label: 'LW',  x: 18, y: 22 }, { label: 'ST',  x: 50, y: 15 }, { label: 'RW',  x: 82, y: 22 },
    ],
  },
  {
    id: '3-4-1-2',
    name: '3-4-1-2',
    nickname: '3 Diamond 2',
    description: 'Three at the back with a number 10 behind two strikers. Very attack-minded.',
    format: '11v11',
    positions: [
      { label: 'GK',  x: 50, y: 92 },
      { label: 'CB',  x: 25, y: 75 }, { label: 'CB',  x: 50, y: 72 }, { label: 'CB',  x: 75, y: 75 },
      { label: 'LM',  x: 15, y: 55 }, { label: 'CM',  x: 35, y: 55 }, { label: 'CM',  x: 65, y: 55 }, { label: 'RM',  x: 85, y: 55 },
      { label: 'CAM', x: 50, y: 38 },
      { label: 'ST',  x: 35, y: 18 }, { label: 'ST',  x: 65, y: 18 },
    ],
  },
  {
    id: '3-6-1',
    name: '3-6-1',
    nickname: 'Midfield Overload',
    description: 'Six midfielders dominate possession. Lone striker must be strong and hold up play.',
    format: '11v11',
    positions: [
      { label: 'GK',  x: 50, y: 92 },
      { label: 'CB',  x: 25, y: 75 }, { label: 'CB',  x: 50, y: 72 }, { label: 'CB',  x: 75, y: 75 },
      { label: 'LM',  x: 12, y: 52 }, { label: 'CM',  x: 30, y: 52 }, { label: 'CM',  x: 45, y: 45 }, { label: 'CM',  x: 55, y: 45 }, { label: 'CM',  x: 70, y: 52 }, { label: 'RM',  x: 88, y: 52 },
      { label: 'ST',  x: 50, y: 18 },
    ],
  },
  {
    id: '4-2-3-1',
    name: '4-2-3-1',
    nickname: 'Modern',
    description: 'The most popular modern formation. Double pivot protects, three behind the striker create.',
    format: '11v11',
    positions: [
      { label: 'GK',  x: 50, y: 92 },
      { label: 'LB',  x: 18, y: 78 }, { label: 'CB',  x: 38, y: 78 }, { label: 'CB',  x: 62, y: 78 }, { label: 'RB',  x: 82, y: 78 },
      { label: 'DM',  x: 35, y: 62 }, { label: 'DM',  x: 65, y: 62 },
      { label: 'LAM', x: 20, y: 42 }, { label: 'CAM', x: 50, y: 40 }, { label: 'RAM', x: 80, y: 42 },
      { label: 'ST',  x: 50, y: 15 },
    ],
  },
  {
    id: '5-3-2',
    name: '5-3-2',
    nickname: 'Defensive Block',
    description: 'Five at the back — very hard to break down. Wing-backs provide the only width in attack.',
    format: '11v11',
    positions: [
      { label: 'GK',  x: 50, y: 92 },
      { label: 'LWB', x: 10, y: 75 }, { label: 'CB',  x: 28, y: 75 }, { label: 'CB',  x: 50, y: 72 }, { label: 'CB',  x: 72, y: 75 }, { label: 'RWB', x: 90, y: 75 },
      { label: 'LM',  x: 25, y: 52 }, { label: 'CM',  x: 50, y: 50 }, { label: 'RM',  x: 75, y: 52 },
      { label: 'ST',  x: 35, y: 18 }, { label: 'ST',  x: 65, y: 18 },
    ],
  },
  {
    id: '5-4-1',
    name: '5-4-1',
    nickname: 'Park the Bus',
    description: 'Maximum defensive solidity. Extremely hard to score against. Counter-attack only.',
    format: '11v11',
    positions: [
      { label: 'GK',  x: 50, y: 92 },
      { label: 'LWB', x: 10, y: 75 }, { label: 'CB',  x: 28, y: 75 }, { label: 'CB',  x: 50, y: 72 }, { label: 'CB',  x: 72, y: 75 }, { label: 'RWB', x: 90, y: 75 },
      { label: 'LM',  x: 15, y: 55 }, { label: 'CM',  x: 35, y: 55 }, { label: 'CM',  x: 65, y: 55 }, { label: 'RM',  x: 85, y: 55 },
      { label: 'ST',  x: 50, y: 18 },
    ],
  },
];

// ─── 9v9 ──────────────────────────────────────────────────────────────────────

const FORMATIONS_9V9: Formation[] = [
  {
    id: '9v9-3-2-3',
    name: '3-2-3',
    nickname: 'Classic 9v9',
    description: 'Balanced and popular for U11-U12. Good introduction to positional play.',
    format: '9v9',
    positions: [
      { label: 'GK',  x: 50, y: 92 },
      { label: 'CB',  x: 25, y: 75 }, { label: 'CB',  x: 50, y: 72 }, { label: 'CB',  x: 75, y: 75 },
      { label: 'CM',  x: 33, y: 55 }, { label: 'CM',  x: 67, y: 55 },
      { label: 'LW',  x: 18, y: 25 }, { label: 'ST',  x: 50, y: 18 }, { label: 'RW',  x: 82, y: 25 },
    ],
  },
  {
    id: '9v9-3-4-1-diamond',
    name: '3-4-1 Diamond',
    nickname: 'Diamond',
    description: 'Controls the midfield with a diamond shape. Number 10 behind the striker creates chances.',
    format: '9v9',
    positions: [
      { label: 'GK',  x: 50, y: 92 },
      { label: 'CB',  x: 25, y: 75 }, { label: 'CB',  x: 50, y: 72 }, { label: 'CB',  x: 75, y: 75 },
      { label: 'DM',  x: 50, y: 62 },
      { label: 'CM',  x: 28, y: 50 }, { label: 'CM',  x: 72, y: 50 },
      { label: 'CAM', x: 50, y: 38 },
      { label: 'ST',  x: 50, y: 18 },
    ],
  },
  {
    id: '9v9-3-3-2',
    name: '3-3-2',
    nickname: 'Double Striker',
    description: 'Two strikers supported by three midfielders. Great for teams with two strong forwards.',
    format: '9v9',
    positions: [
      { label: 'GK',  x: 50, y: 92 },
      { label: 'CB',  x: 25, y: 75 }, { label: 'CB',  x: 50, y: 72 }, { label: 'CB',  x: 75, y: 75 },
      { label: 'LM',  x: 20, y: 55 }, { label: 'CM',  x: 50, y: 52 }, { label: 'RM',  x: 80, y: 55 },
      { label: 'ST',  x: 33, y: 18 }, { label: 'ST',  x: 67, y: 18 },
    ],
  },
  {
    id: '9v9-2-3-3',
    name: '2-3-3',
    nickname: 'Attack',
    description: 'Very attack-minded. Two defenders hold while five push forward. High risk, high reward.',
    format: '9v9',
    positions: [
      { label: 'GK',  x: 50, y: 92 },
      { label: 'CB',  x: 30, y: 78 }, { label: 'CB',  x: 70, y: 78 },
      { label: 'LM',  x: 18, y: 58 }, { label: 'CM',  x: 50, y: 55 }, { label: 'RM',  x: 82, y: 58 },
      { label: 'LW',  x: 18, y: 25 }, { label: 'ST',  x: 50, y: 18 }, { label: 'RW',  x: 82, y: 25 },
    ],
  },
  {
    id: '9v9-3-2-3-hold',
    name: '3-2-3 Hold',
    nickname: 'Double Pivot',
    description: 'Two holding midfielders sit deep to protect the back three, with three attackers pushing forward.',
    format: '9v9',
    positions: [
      { label: 'GK',  x: 50, y: 92 },
      { label: 'CB',  x: 25, y: 75 }, { label: 'CB',  x: 50, y: 72 }, { label: 'CB',  x: 75, y: 75 },
      { label: 'DM',  x: 33, y: 60 }, { label: 'DM',  x: 67, y: 60 },
      { label: 'LW',  x: 18, y: 28 }, { label: 'ST',  x: 50, y: 20 }, { label: 'RW',  x: 82, y: 28 },
    ],
  },
  {
    id: '9v9-3-4-1-flat',
    name: '3-4-1',
    nickname: 'Flat Mid',
    description: 'Three defenders and four flat midfielders smother the opposition. Lone striker makes runs in behind.',
    format: '9v9',
    positions: [
      { label: 'GK',  x: 50, y: 92 },
      { label: 'CB',  x: 22, y: 76 }, { label: 'CB',  x: 50, y: 74 }, { label: 'CB',  x: 78, y: 76 },
      { label: 'LM',  x: 15, y: 55 }, { label: 'CM',  x: 38, y: 53 }, { label: 'CM',  x: 62, y: 53 }, { label: 'RM',  x: 85, y: 55 },
      { label: 'ST',  x: 50, y: 18 },
    ],
  },
  {
    id: '9v9-4-3-1',
    name: '4-3-1',
    nickname: 'Defensive',
    description: 'Four defenders make the team very hard to break down. Three midfielders hold possession. Lone striker on the break.',
    format: '9v9',
    positions: [
      { label: 'GK',  x: 50, y: 92 },
      { label: 'LB',  x: 18, y: 78 }, { label: 'CB',  x: 38, y: 75 }, { label: 'CB',  x: 62, y: 75 }, { label: 'RB',  x: 82, y: 78 },
      { label: 'LM',  x: 20, y: 55 }, { label: 'CM',  x: 50, y: 52 }, { label: 'RM',  x: 80, y: 55 },
      { label: 'ST',  x: 50, y: 18 },
    ],
  },
];

// ─── 7v7 ──────────────────────────────────────────────────────────────────────

const FORMATIONS_7V7: Formation[] = [
  {
    id: '7v7-2-3-1',
    name: '2-3-1',
    nickname: 'Balanced',
    description: 'The standard 7v7 formation. Easy to understand, good for player development.',
    format: '7v7',
    positions: [
      { label: 'GK', x: 50, y: 92 },
      { label: 'CB', x: 28, y: 76 }, { label: 'CB', x: 72, y: 76 },
      { label: 'LM', x: 18, y: 52 }, { label: 'CM', x: 50, y: 50 }, { label: 'RM', x: 82, y: 52 },
      { label: 'ST', x: 50, y: 18 },
    ],
  },
  {
    id: '7v7-3-2-1',
    name: '3-2-1',
    nickname: 'Solid',
    description: 'Three at the back gives extra defensive cover. Two central mids link play.',
    format: '7v7',
    positions: [
      { label: 'GK', x: 50, y: 92 },
      { label: 'CB', x: 22, y: 76 }, { label: 'CB', x: 50, y: 74 }, { label: 'CB', x: 78, y: 76 },
      { label: 'CM', x: 33, y: 52 }, { label: 'CM', x: 67, y: 52 },
      { label: 'ST', x: 50, y: 18 },
    ],
  },
  {
    id: '7v7-2-1-2-1',
    name: '2-1-2-1',
    nickname: 'Diamond',
    description: 'Diamond midfield for 7v7. Controls the centre, requires hard-working wide forwards.',
    format: '7v7',
    positions: [
      { label: 'GK', x: 50, y: 92 },
      { label: 'CB', x: 28, y: 78 }, { label: 'CB', x: 72, y: 78 },
      { label: 'DM', x: 50, y: 63 },
      { label: 'LM', x: 25, y: 48 }, { label: 'RM', x: 75, y: 48 },
      { label: 'ST', x: 50, y: 18 },
    ],
  },
  {
    id: '7v7-1-3-2',
    name: '1-3-2',
    nickname: 'Attack',
    description: 'Very attacking. One defender sits deep while three midfielders and two strikers press high.',
    format: '7v7',
    positions: [
      { label: 'GK', x: 50, y: 92 },
      { label: 'CB', x: 50, y: 78 },
      { label: 'LM', x: 18, y: 55 }, { label: 'CM', x: 50, y: 52 }, { label: 'RM', x: 82, y: 55 },
      { label: 'ST', x: 33, y: 18 }, { label: 'ST', x: 67, y: 18 },
    ],
  },
  {
    id: '7v7-2-2-2',
    name: '2-2-2',
    nickname: 'Pairs',
    description: 'Everything in pairs — great for teaching positional understanding to young players.',
    format: '7v7',
    positions: [
      { label: 'GK', x: 50, y: 92 },
      { label: 'CB', x: 28, y: 76 }, { label: 'CB', x: 72, y: 76 },
      { label: 'CM', x: 33, y: 52 }, { label: 'CM', x: 67, y: 52 },
      { label: 'ST', x: 33, y: 18 }, { label: 'ST', x: 67, y: 18 },
    ],
  },
  {
    id: '7v7-1-2-1-2',
    name: '1-2-1-2',
    nickname: 'Double Pivot',
    description: 'One sweeper, double pivot in midfield, two strikers. Solid and direct.',
    format: '7v7',
    positions: [
      { label: 'GK', x: 50, y: 92 },
      { label: 'CB', x: 50, y: 80 },
      { label: 'CM', x: 30, y: 60 }, { label: 'CM', x: 70, y: 60 },
      { label: 'AM', x: 50, y: 42 },
      { label: 'ST', x: 30, y: 18 }, { label: 'ST', x: 70, y: 18 },
    ],
  },
  {
    id: '7v7-3-1-2',
    name: '3-1-2',
    nickname: 'Attacking Three',
    description: 'Three defenders, one defensive mid, two strikers. Good width at the back.',
    format: '7v7',
    positions: [
      { label: 'GK', x: 50, y: 92 },
      { label: 'CB', x: 22, y: 76 }, { label: 'CB', x: 50, y: 74 }, { label: 'CB', x: 78, y: 76 },
      { label: 'DM', x: 50, y: 58 },
      { label: 'ST', x: 33, y: 18 }, { label: 'ST', x: 67, y: 18 },
    ],
  },
];

// ─── 4v4 (no GK — 4 outfield players per side) ───────────────────────────────

const FORMATIONS_4V4: Formation[] = [
  {
    id: '4v4-1-2-1',
    name: '1-2-1',
    nickname: 'Classic',
    description: 'The standard 4v4 shape. One defender, two wide midfielders, one striker. Great for learning spacing and width.',
    format: '4v4',
    positions: [
      { label: 'CB', x: 50, y: 78 },
      { label: 'LM', x: 22, y: 50 }, { label: 'RM', x: 78, y: 50 },
      { label: 'ST', x: 50, y: 18 },
    ],
  },
  {
    id: '4v4-1-1-2',
    name: '1-1-2',
    nickname: 'Two Strikers',
    description: 'Attack-minded. One defender holds, one midfielder links, two strikers press and finish.',
    format: '4v4',
    positions: [
      { label: 'CB', x: 50, y: 78 },
      { label: 'CM', x: 50, y: 52 },
      { label: 'ST', x: 28, y: 22 }, { label: 'ST', x: 72, y: 22 },
    ],
  },
  {
    id: '4v4-2-1-1',
    name: '2-1-1',
    nickname: 'Solid',
    description: 'Two defenders give defensive security. One midfielder links play. One striker leads the line.',
    format: '4v4',
    positions: [
      { label: 'CB', x: 30, y: 78 }, { label: 'CB', x: 70, y: 78 },
      { label: 'CM', x: 50, y: 50 },
      { label: 'ST', x: 50, y: 18 },
    ],
  },
  {
    id: '4v4-2-2',
    name: '2-2',
    nickname: 'Flat',
    description: 'Two defenders and two strikers. Direct and simple — great for the youngest players.',
    format: '4v4',
    positions: [
      { label: 'CB', x: 30, y: 78 }, { label: 'CB', x: 70, y: 78 },
      { label: 'ST', x: 30, y: 22 }, { label: 'ST', x: 70, y: 22 },
    ],
  },
];

// ─── Exports ──────────────────────────────────────────────────────────────────

export const ALL_FORMATIONS: Formation[] = [
  ...FORMATIONS_11V11,
  ...FORMATIONS_9V9,
  ...FORMATIONS_7V7,
  ...FORMATIONS_4V4,
];

export const FORMATIONS_BY_FORMAT: Record<GameFormat, Formation[]> = {
  '11v11': FORMATIONS_11V11,
  '9v9':   FORMATIONS_9V9,
  '7v7':   FORMATIONS_7V7,
  '4v4':   FORMATIONS_4V4,
};

export const DEFAULT_FORMATION_PER_FORMAT: Record<GameFormat, string> = {
  '11v11': '4-3-3',
  '9v9':   '9v9-3-2-3',
  '7v7':   '7v7-2-3-1',
  '4v4':   '4v4-1-2-1',
};

export const DEFAULT_FAVOURITES: string[] = [
  '4-3-3',
  '9v9-3-2-3',
  '7v7-2-3-1',
  '4v4-1-2-1',
];

export function detectFormat(ageGroup: string | null | undefined): GameFormat {
  if (!ageGroup) return '11v11';
  const match = ageGroup.match(/U(\d+)/i);
  if (!match) return '11v11';
  const age = parseInt(match[1], 10);
  if (age <= 8)  return '4v4';
  if (age <= 10) return '7v7';
  if (age <= 12) return '9v9';
  return '11v11';
}

export function getFormationById(id: string): Formation | undefined {
  return ALL_FORMATIONS.find((f) => f.id === id);
}
