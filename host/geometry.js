/* Shared, Illustrator independent point/bounds math for host placement and tests. */
(function (root, factory) {
  var geometry = factory();
  if (typeof module === 'object' && module.exports) module.exports = geometry;
  root.BytebaseGeometry = geometry;
  if (typeof $ !== 'undefined' && $.global) $.global.BytebaseGeometry = geometry;
}(typeof window !== 'undefined' ? window : this, function () {
  'use strict';
  function mmToPt(mm) { return mm * 72 / 25.4; }
  function ptToMm(pt) { return pt * 25.4 / 72; }
  function rectFromGeometricBounds(bounds) {
    if (!bounds || bounds.length < 4) throw Error('Missing Illustrator geometric bounds');
    // Illustrator returns [left, top, right, bottom].
    var r = { left:Number(bounds[0]), top:Number(bounds[1]), right:Number(bounds[2]), bottom:Number(bounds[3]) };
    if (!isFinite(r.left)||!isFinite(r.top)||!isFinite(r.right)||!isFinite(r.bottom)||r.right<=r.left||r.top<=r.bottom)
      throw Error('Invalid Illustrator geometric bounds: ['+bounds.join(', ')+']');
    return r;
  }
  function expectedArtworkBounds(artboardRect, placement) {
    // Illustrator artboardRect is [left, top, right, bottom]; layout y is down from the top.
    var left=Number(artboardRect[0])+mmToPt(Number(placement.x)+Number(placement.inset));
    var top=Number(artboardRect[1])-mmToPt(Number(placement.y)+Number(placement.inset));
    var w=mmToPt(placement.rotated?Number(placement.artworkH):Number(placement.artworkW));
    var h=mmToPt(placement.rotated?Number(placement.artworkW):Number(placement.artworkH));
    return {left:left,top:top,right:left+w,bottom:top-h};
  }
  function equalBounds(actual, expected, tolerancePt) {
    var e=Number(tolerancePt);
    return Math.abs(actual.left-expected.left)<=e && Math.abs(actual.top-expected.top)<=e &&
      Math.abs(actual.right-expected.right)<=e && Math.abs(actual.bottom-expected.bottom)<=e;
  }
  function contains(outer, inner, tolerancePt) {
    var e=Number(tolerancePt)||0;
    return inner.left>=outer.left-e && inner.top<=outer.top+e &&
      inner.right<=outer.right+e && inner.bottom>=outer.bottom-e;
  }
  function overlaps(a,b) {
    return a.left < b.right && a.right > b.left && a.top > b.bottom && a.bottom < b.top;
  }
  return {mmToPt:mmToPt,ptToMm:ptToMm,rectFromGeometricBounds:rectFromGeometricBounds,
    expectedArtworkBounds:expectedArtworkBounds,equalBounds:equalBounds,contains:contains,overlaps:overlaps};
}));
