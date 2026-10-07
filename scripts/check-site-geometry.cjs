const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const source = fs.readFileSync(path.join(__dirname, '../src/domain/site-geometry.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const geometry = {};
vm.runInNewContext(compiled, { exports: geometry, Math, Number, Map }, { filename: 'site-geometry.ts' });

function near(actual, expected) { assert.ok(Math.abs(actual - expected) < 0.000001, `${actual} != ${expected}`); }
const map = {
  width: 200, height: 100,
  scale_start_x: 0, scale_start_y: 0, scale_end_x: 50, scale_end_y: 0, scale_distance_metres: 100,
};

// A rectangle catches the error of treating X/Y percentages as equal distances.
near(geometry.siteDistanceMetres({ x: 0, y: 0 }, { x: 0, y: 100 }, map), 100);
near(geometry.siteDistanceMetres({ x: 0, y: 0 }, { x: 100, y: 0 }, map), 200);
near(geometry.siteDistanceMetres({ x: 0, y: 0 }, { x: 100, y: 100 }, map), Math.hypot(200, 100));
near(geometry.siteDistanceMetres({ x: 50, y: 40 }, { x: 50, y: 40 }, map), 0);
near(geometry.siteDistanceMetres({ x: 0, y: 0 }, { x: 100, y: 100 }, { ...map, width: 2000, height: 1000 }), Math.hypot(200, 100));
assert.equal(geometry.siteDistanceMetres({ x: 0, y: 0 }, { x: 100, y: 0 }, { ...map, scale_distance_metres: null }), null);
assert.equal(geometry.siteDistanceMetres({ x: 0, y: 0 }, { x: 100, y: 0 }, { ...map, scale_end_x: 0 }), null);
assert.equal(geometry.siteDistanceMetres({ x: -1, y: 0 }, { x: 100, y: 0 }, map), null);
assert.equal(geometry.validMapScale({ start: { x: 0, y: 0 }, end: { x: 0, y: 0 }, distanceMetres: 10 }, map), false);
assert.equal(geometry.validMapScale({ start: { x: 0, y: 0 }, end: { x: 50, y: 0 }, distanceMetres: Infinity }, map), false);
assert.equal(geometry.validMapScale({ start: { x: 0, y: 0 }, end: { x: 50, y: 0 }, distanceMetres: -1 }, map), false);
assert.equal(geometry.validMapScale({ start: { x: 0, y: 0 }, end: { x: 50, y: 0 }, distanceMetres: 100 }, { width: 0, height: 100 }), false);

const centre = geometry.pointFromTap(150, 75, 300, 150);
assert.equal(centre.x, 50); assert.equal(centre.y, 50);
assert.equal(geometry.pointFromTap(-1, 0, 300, 150), null);
assert.equal(geometry.pointFromTap(301, 0, 300, 150), null);
assert.equal(geometry.pointFromTap(0, 0, 0, 150), null);
assert.equal(geometry.validMapPoint({ x: NaN, y: 50 }), false);
assert.equal(geometry.validVenuePoint({ latitude: -37.818, longitude: 144.974 }), true);
assert.equal(geometry.validVenuePoint({ latitude: 91, longitude: 144.974 }), false);
assert.equal(geometry.validVenuePoint({ latitude: 0, longitude: Infinity }), false);

const structure = {
  locations: [{ id: 'l', name: 'Water B', map_x: 20, map_y: 40 }],
  posts: [{ id: 'p', location_id: 'l', name: 'First Aid', map_x: null, map_y: null }],
};
const inherited = geometry.sitePins(structure).find(pin => pin.kind === 'post');
assert.equal(inherited.inherited, true); assert.equal(inherited.point.x, 20); assert.equal(inherited.point.y, 40);
const own = geometry.sitePins({ ...structure, posts: [{ ...structure.posts[0], map_x: 75, map_y: 50 }] }).find(pin => pin.kind === 'post');
assert.equal(own.inherited, false); assert.equal(own.point.x, 75);
const unplaced = geometry.sitePins({ ...structure, locations: [{ ...structure.locations[0], map_x: null, map_y: null }] }).find(pin => pin.kind === 'post');
assert.equal(unplaced.point, null);

// Equal physical image distances give equal radii even when X/Y percentages
// differ on a rectangular image. Rendering uses the same shorter-edge unit.
near(geometry.radiusFromEdge({ x: 50, y: 50 }, { x: 55, y: 50 }, map), 10);
near(geometry.radiusFromEdge({ x: 50, y: 50 }, { x: 50, y: 60 }, map), 10);
near(geometry.circleDiameter(10, { width: 300, height: 150 }), 30);
near(geometry.circleDiameter(10, { width: 150, height: 300 }), 30);
near(geometry.circleDiameter(10, { width: 600, height: 300 }), 60);
const circle = { centre: { x: 50, y: 50 }, radiusPercent: 10 };
assert.equal(geometry.circleContains(circle, { x: 54, y: 50 }, map), true);
assert.equal(geometry.circleContains(circle, { x: 56, y: 50 }, map), false);
assert.equal(geometry.circleContains(circle, { x: 50, y: 59 }, map), true);
assert.equal(geometry.circleContains(circle, { x: 50, y: 61 }, map), false);
assert.equal(geometry.validMapCircle({ ...circle, radiusPercent: NaN }), false);
assert.equal(geometry.validMapCircle({ ...circle, radiusPercent: 0 }), false);
assert.equal(geometry.validMapCircle({ ...circle, radiusPercent: 51 }), false);
assert.equal(geometry.validMapCircle({ ...circle, centre: { x: 101, y: 50 } }), false);

const locationPin = { id: 'location', kind: 'location', point: { x: 50, y: 50 }, radiusPercent: 40, checkIn: null };
const postPin = { id: 'post', kind: 'post', point: { x: 52, y: 50 }, radiusPercent: null,
  checkIn: { centre: { x: 10, y: 10 }, radiusPercent: 5 } };
assert.equal(geometry.pinAtPoint([locationPin, postPin], { x: 52, y: 50 }, map).id, 'post');
assert.equal(geometry.pinAtPoint([locationPin, postPin], { x: 50, y: 80 }, map).id, 'location');
assert.equal(geometry.pinAtPoint([locationPin, postPin], { x: 10, y: 10 }, map).id, 'post');
assert.equal(geometry.pinAtPoint([locationPin, postPin], { x: 0, y: 100 }, map), null);

console.log('Passed: image coordinates, scale, inheritance, portrait/landscape circle sizing, containment, and selecting posts/check-in areas within locations.');
