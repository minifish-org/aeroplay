import assert from 'node:assert/strict';
import { build } from 'esbuild';

const bundle = await build({
  entryPoints: ['src/games/flappyFlight.ts'],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm'
});
const { planFlight, flightCollision } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`
);
const outcome = (plan, choice) =>
  plan.outcomes.find((item) => item.choice === choice);

// Both actions stay available so the model always chooses between them. Safety
// is reported as context instead of removing an option.
const ceiling = planFlight(40, 80, [], 0);
assert.deepEqual(
  Object.keys(ceiling.choices),
  ['0', '1'],
  'Flap and wait are both offered'
);
assert.equal(
  outcome(ceiling, '0').safe,
  false,
  'A flap near the ceiling is unsafe for its whole upward arc'
);
assert.equal(
  outcome(ceiling, '1').safe,
  true,
  'Waiting stays safe near the ceiling'
);
assert.match(ceiling.context, /Flap: unsafe/);

const ground = planFlight(430, 90, [], 0);
assert.equal(outcome(ground, '0').safe, true, 'A flap above the ground is safe');
assert.equal(
  outcome(ground, '1').safe,
  false,
  'Falling into the ground is unsafe'
);
assert.match(ground.context, /closest to the gap center/);

const pipe = { x: 82, gapY: 60, gap: 180, scored: false };
const besideGate = planFlight(112, -160, [pipe], 0);
assert.equal(
  outcome(besideGate, '1').safe,
  true,
  'Waiting keeps the bird inside the gate beside it'
);
assert.equal(
  outcome(besideGate, '0').safe,
  false,
  'A flap leaves that gate through its upper pipe'
);

const arriving = planFlight(112, 0, [{ ...pipe, x: 124 }], 0);
assert.equal(
  outcome(arriving, '1').safe,
  true,
  'Waiting is safe for a pipe arriving during the fall'
);
assert.equal(
  outcome(arriving, '0').safe,
  false,
  'Look ahead to a pipe arriving during the upward arc'
);

assert.equal(flightCollision(440, []), false);
assert.equal(flightCollision(441, []), true);
const untouched = structuredClone(pipe);
planFlight(160, 120, [pipe], 0);
assert.deepEqual(pipe, untouched, 'Planning never moves real pipes');
console.log(
  'PASS flight planning: ceiling arc, ground, gate clearance, arriving pipe, immutable state'
);
