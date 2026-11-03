/* Run: node --test tests/anesthesia_smoke.test.js
 * Uses a minimal Sandboxels simulation stub; browser integration is separate.
 */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "anesthesia_mod_english_v3_2.js"), "utf8");

function createWorld() {
    const pixels = [];
    const drawn = [];
    const moves = [];
    const calls = { headAI: 0, bodyAI: 0 };
    const head = { element: "head", x: 6, y: 7, temp: 37, dead: false, color: "#8060ff",
        anOriginalColor: "#e8cba8" };
    const body = { element: "body", x: 6, y: 8, temp: 37, dead: false, color: "#5936d6",
        anOriginalColor: "#047e99", dir: 1 };
    pixels.push(head, body);
    const getPixel = (x, y) => pixels.find(p => !p.del && p.x === x && p.y === y) || null;
    const world = {
        elements: {
            head: { tick: () => calls.headAI++ },
            body: { tick: () => calls.bodyAI++ },
            nitrogen: { tick: () => {} }, chlorine: { tick: () => {} },
            methane: { tick: () => {} }, hydrogen: { tick: () => {} },
            anesthesia: { state: "gas", tempLow: -88.48, stateLow: ["nitrogen", "oxygen"] }
        },
        behaviors: { WALL: [["XX"]], GAS: [["M1"]], LIQUID: [["M1"]] },
        pixelTicks: 10, pixelSize: 6,
        getPixel,
        isEmpty: (x, y) => getPixel(x, y) === null,
        movePixel: (p, x, y) => { p.x = x; p.y = y; },
        tryMove: (p, x, y) => {
            moves.push({ element: p.element, dx: x - p.x, dy: y - p.y });
            if (p.element !== "body" || y !== p.y + 1 || getPixel(x, y)) return false;
            p.x = x; p.y = y;
            return true;
        },
        renderEachPixel: fn => drawn.push(fn),
        doHeat: () => {}, doBurning: () => {}, doElectricity: () => {}
    };
    vm.runInNewContext(source, world, { filename: "anesthesia_mod_english_v3_2.js" });
    return { world, head, body, pixels, drawn, moves, calls };
}

test("anesthetized humans retain natural colors and have a nonphysical Z marker", () => {
    const w = createWorld();
    w.world.elements.anesthetize_power.tool(w.head);
    assert.equal(w.head.color, "#e8cba8");
    assert.equal(w.body.color, "#047e99");
    assert.equal(w.pixels.length, 2);
    assert.equal(w.head.anStage, 3);
    assert.equal(w.head.anSleepUntil, 2710);
    assert.equal(w.drawn.length, 1);
    const calls = [];
    const ctx = { save() {}, restore() {}, strokeText(s) { calls.push(s); },
        fillText(s) { calls.push(s); } };
    w.drawn[0](w.head, ctx);
    assert.deepEqual(calls, ["z", "z"]);
    assert.equal(w.head.color, "#e8cba8");
});

test("all five anesthesia gases have liquid and frozen states", () => {
    const { world } = createWorld();
    for (const name of ["anesthesia", "nitrous_oxide", "isoflurane", "sevoflurane", "desflurane"]) {
        const gas = world.elements[name];
        const liquid = world.elements["liquid_" + name];
        const frozen = world.elements["frozen_" + name];
        assert.ok(liquid && frozen, name);
        assert.equal(gas.stateLow, "liquid_" + name);
        assert.equal(liquid.stateHigh, name);
        assert.equal(liquid.stateLow, "frozen_" + name);
        assert.equal(frozen.stateHigh, "liquid_" + name);
    }
});

test("sleep prevents jumping and walking but retains synchronized downward gravity", () => {
    const w = createWorld();
    w.world.elements.anesthetize_power.tool(w.head);
    w.world.elements.head.tick(w.head);
    w.world.elements.body.tick(w.body);
    assert.equal(w.calls.bodyAI, 0);
    assert.equal(w.calls.headAI, 0);
    assert.ok(w.moves.length >= 1);
    assert.ok(w.moves.every(m => m.dy >= 0 && m.dx === 0), "no lateral/upward movements");
    assert.equal(w.body.y, 9);
    assert.equal(w.head.y, 8);
    w.world.pixelTicks += 1200; // Still within the 90-second minimum
    w.world.elements.head.tick(w.head);
    w.world.elements.body.tick(w.body);
    assert.equal(w.head.anStage, 3);
    assert.equal(w.body.anStage, 3);
    assert.ok(w.moves.every(m => m.dy >= 0 && m.dx === 0));
});

test("manual wake clears sleep immediately and restores ordinary movement AI", () => {
    const w = createWorld();
    w.world.elements.anesthetize_power.tool(w.body);
    w.world.elements.wake_power.tool(w.head);
    assert.equal(w.head.anStage, 0);
    assert.equal(w.body.anStage, 0);
    assert.equal(w.head.anSleepUntil, 0);
    w.world.elements.body.tick(w.body);
    assert.equal(w.calls.bodyAI, 1);
});

test("light sedation remains mobile without falsely displaying a sleep marker", () => {
    const w = createWorld();
    for (const p of [w.head, w.body]) {
        p.anDose = 25; p.anStage = 1;
    }
    w.world.elements.head.tick(w.head);
    w.world.elements.body.tick(w.body);
    assert.equal(w.head.anStage, 1);
    assert.equal(w.body.anStage, 1);
    assert.equal(w.calls.headAI, 1);
    assert.equal(w.calls.bodyAI, 1);
    let painted = false;
    w.drawn[0](w.head, { save() {}, restore() {},
        strokeText() { painted = true; }, fillText() { painted = true; } });
    assert.equal(painted, false);
});

test("unconsciousness cannot end before the minimum sleep deadline", () => {
    const w = createWorld();
    w.world.elements.anesthetize_power.tool(w.head);
    w.world.pixelTicks = w.head.anSleepUntil - 1;
    w.world.elements.head.tick(w.head);
    w.world.elements.body.tick(w.body);
    assert.equal(w.head.anStage, 3);
    assert.equal(w.body.anStage, 3);
    assert.equal(w.calls.bodyAI, 0);
    assert.ok(w.head.anSleepUntil > w.world.pixelTicks);
});

test("relation-linked head and body fall together without a second head move", () => {
    const w = createWorld();
    w.head._r = 42; w.body._r = 42;
    w.world.tryMove = (p, x, y) => {
        assert.equal(p.element, "body");
        assert.equal(x, p.x);
        assert.equal(y, p.y + 1);
        w.head.y++; w.body.y++;
        // Sandboxels can return undefined for relation moves.
        return undefined;
    };
    w.world.elements.anesthetize_power.tool(w.body);
    w.world.elements.head.tick(w.head);
    w.world.elements.body.tick(w.body);
    assert.equal(w.head.y, 8);
    assert.equal(w.body.y, 9);
    assert.equal(w.calls.headAI, 0);
    assert.equal(w.calls.bodyAI, 0);
});

test("falling through liquid keeps the sleeping head attached", () => {
    const w = createWorld();
    const water = { element: "water", x: 6, y: 9, temp: 20 };
    w.pixels.push(water);
    w.world.tryMove = (p, x, y) => {
        assert.equal(p.element, "body");
        assert.equal(y, 9);
        // Simulate Sandboxels density displacement.
        water.y = p.y;
        p.y = y;
        return true;
    };
    w.world.swapPixels = (a, b) => {
        const x = a.x, y = a.y;
        a.x = b.x; a.y = b.y;
        b.x = x; b.y = y;
    };
    w.world.elements.anesthetize_power.tool(w.head);
    w.world.elements.head.tick(w.head);
    w.world.elements.body.tick(w.body);
    assert.equal(w.body.y, 9);
    assert.equal(w.head.y, 8);
    assert.equal(water.y, 7);
    assert.equal(w.calls.bodyAI, 0);
});
