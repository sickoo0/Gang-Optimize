const assert = require('node:assert/strict');
const G = require('../host/geometry.js');

const pt = G.mmToPt;
const p = (x, y, w, h, rotated = false) => ({
  x, y, w: (rotated ? h : w) + 10, h: (rotated ? w : h) + 10,
  artworkW: w, artworkH: h, inset: 5, rotated
});
const board0 = [0, pt(500), pt(700), 0];
const board1 = [pt(730), pt(500), pt(1430), 0];

// Single original size, multiple copies, and artboards with nonzero document offsets.
const one = p(20, 20, 100, 60);
const boundsOne = G.expectedArtworkBounds(board0, one);
assert.deepEqual(boundsOne, {left:pt(25),top:pt(475),right:pt(125),bottom:pt(415)});
const copy2 = p(140, 20, 100, 60);
assert.ok(!G.overlaps(boundsOne, G.expectedArtworkBounds(board0, copy2)));
const secondBoardItem = p(20, 20, 100, 60);
assert.deepEqual(G.expectedArtworkBounds(board1, secondBoardItem), {
  left:pt(755),top:pt(475),right:pt(855),bottom:pt(415)
});

// A 90 degree rotation swaps full artwork bounds; it does not change its physical area.
const rotated = p(30, 45, 80, 140, true);
const rotatedBounds = G.expectedArtworkBounds(board0, rotated);
assert.ok(Math.abs(G.ptToMm(rotatedBounds.right-rotatedBounds.left)-140)<1e-10);
assert.ok(Math.abs(G.ptToMm(rotatedBounds.top-rotatedBounds.bottom)-80)<1e-10);

// Convert Illustrator's [top,left,bottom,right] actual bounds and enforce exact target.
const actualArray = [rotatedBounds.left,rotatedBounds.top,rotatedBounds.right,rotatedBounds.bottom];
const actual = G.rectFromGeometricBounds(actualArray);
assert.ok(G.equalBounds(actual, rotatedBounds, 0.1));
assert.ok(G.contains({left:pt(30),top:pt(455),right:pt(180),bottom:pt(365)}, actual, 0.1));
assert.ok(!G.equalBounds({...actual,left:actual.left+1},rotatedBounds,0.1), 'mispositioned actual bounds fail verification');
assert.ok(G.overlaps(boundsOne, {...boundsOne,left:boundsOne.left+1}), 'overlap detection uses measured bounds');

console.log('PASS: Illustrator point coordinates, nonzero artboard offsets, 0/90-degree bounds, margin containment, and actual-bound mismatch detection');
