import assert from "node:assert/strict";
import { createSeededRandom } from "../src/seeded-random.js";
import {
  LOCKPICK_MIN_SOLUTION_MOVES,
  LOCKPICK_SCRAMBLE_MAX_MOVES,
  LOCKPICK_SCRAMBLE_MIN_MOVES,
  applyLockpickAction,
  findShortestSafeLockpickSolutionDistance,
  generateLockpickPuzzle,
  getLockpickActionDeltas,
  hasLockpickDanger,
  isLockpickSolved,
  validateLockpickRelations,
} from "../src/map/map-lockpick-engine.js";

const checks = [];

run("direct relations do not cascade", () => {
  const relations = [
    { master: 0, slave: 1, direction: "same" },
    { master: 1, slave: 2, direction: "opposite" },
  ];
  const positions = applyLockpickAction([0, 0, 0, 0, 0], relations, {
    master: 0,
    direction: 1,
  });
  assert.deepEqual(positions, [1, 1, 0, 0, 0]);
});

run("mutual relations keep independent directions", () => {
  const relations = [
    { master: 0, slave: 1, direction: "same" },
    { master: 1, slave: 0, direction: "opposite" },
  ];
  assert.deepEqual(getLockpickActionDeltas(relations, { master: 0, direction: 1 }), [1, 1, 0, 0, 0]);
  assert.deepEqual(getLockpickActionDeltas(relations, { master: 1, direction: 1 }), [-1, 1, 0, 0, 0]);
});

run("relation validator enforces the unique pure roles and triple-master limit", () => {
  const noPureSubordinate = validateLockpickRelations([
    { master: 0, slave: 1, direction: "same" },
    { master: 1, slave: 2, direction: "same" },
    { master: 2, slave: 3, direction: "same" },
    { master: 3, slave: 4, direction: "same" },
    { master: 4, slave: 1, direction: "same" },
  ]);
  assert.equal(noPureSubordinate.valid, false);

  const noPureMaster = validateLockpickRelations([
    { master: 0, slave: 1, direction: "same" },
    { master: 1, slave: 2, direction: "same" },
    { master: 2, slave: 3, direction: "same" },
    { master: 3, slave: 0, direction: "same" },
    { master: 3, slave: 4, direction: "same" },
  ]);
  assert.equal(noPureMaster.valid, false);

  const twoTripleMasters = validateLockpickRelations([
    { master: 0, slave: 1, direction: "same" },
    { master: 0, slave: 2, direction: "same" },
    { master: 0, slave: 4, direction: "same" },
    { master: 1, slave: 2, direction: "same" },
    { master: 1, slave: 3, direction: "same" },
    { master: 1, slave: 4, direction: "same" },
    { master: 2, slave: 3, direction: "same" },
    { master: 3, slave: 4, direction: "same" },
  ]);
  assert.equal(twoTripleMasters.valid, false);
});

run("generated puzzles satisfy graph, safety, and solution constraints", () => {
  for (let seedIndex = 0; seedIndex < 80; seedIndex += 1) {
    const puzzle = generateLockpickPuzzle({
      random: createSeededRandom(`lockpick-check-${seedIndex}`),
      includeSolution: true,
    });
    const relationValidation = validateLockpickRelations(puzzle.relations, puzzle.ringCount);
    assert.equal(relationValidation.valid, true, relationValidation.issues.join(", "));
    assert.equal(relationValidation.pureMasterIndices.length, 1);
    assert.equal(relationValidation.pureSubordinateIndices.length, 1);
    assert.notEqual(
      relationValidation.pureMasterIndices[0],
      relationValidation.pureSubordinateIndices[0],
    );
    assert.ok(relationValidation.outgoingCounts.every((count) => count >= 0 && count <= 3));
    assert.ok(relationValidation.outgoingCounts.filter((count) => count === 3).length <= 1);
    assert.ok(
      puzzle.scrambleMoveCount >= LOCKPICK_SCRAMBLE_MIN_MOVES
        && puzzle.scrambleMoveCount <= LOCKPICK_SCRAMBLE_MAX_MOVES,
    );
    assert.equal(Number.isFinite(puzzle.shortestSolutionMoves), true);
    assert.ok(puzzle.shortestSolutionMoves >= LOCKPICK_MIN_SOLUTION_MOVES);
    assert.equal(isLockpickSolved(puzzle.startPositions), false);
    assert.equal(hasLockpickDanger(puzzle.startPositions, puzzle.bumpOffsets), false);
    for (const bumpOffset of puzzle.bumpOffsets) {
      assert.ok(bumpOffset >= 2 && bumpOffset <= puzzle.sectorCount - 2);
    }

    let positions = puzzle.startPositions;
    for (const action of puzzle.solutionActions) {
      positions = applyLockpickAction(
        positions,
        puzzle.relations,
        action,
        puzzle.sectorCount,
      );
      assert.equal(hasLockpickDanger(positions, puzzle.bumpOffsets, puzzle.sectorCount), false);
    }
    assert.equal(isLockpickSolved(positions), true);
    assert.equal(
      findShortestSafeLockpickSolutionDistance({
        positions: puzzle.startPositions,
        relations: puzzle.relations,
        bumpOffsets: puzzle.bumpOffsets,
        sectorCount: puzzle.sectorCount,
        maxDepth: puzzle.scrambleMoveCount,
      }),
      puzzle.shortestSolutionMoves,
    );
  }
});

run("same seed produces the same hidden puzzle", () => {
  const first = generateLockpickPuzzle({ random: createSeededRandom("repeatable-lock") });
  const second = generateLockpickPuzzle({ random: createSeededRandom("repeatable-lock") });
  assert.deepEqual(first, second);
});

for (const check of checks) {
  try {
    check.test();
    console.log(`ok - ${check.name}`);
  } catch (error) {
    console.error(`not ok - ${check.name}`);
    throw error;
  }
}

console.log(`[lockpick-check] ${checks.length} checks passed`);

function run(name, test) {
  checks.push({ name, test });
}
