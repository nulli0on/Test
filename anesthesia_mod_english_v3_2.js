/*
 * Sandboxels - Advanced Anesthesia v3.3.0 (English only, mobile-friendly)
 * FICTITIOUS in-game crafting only: NOT real chemistry or medical instructions.
 * Replaces v3.0 and v3.1. Remove older anesthesia mods before enabling this file.
 *
 * Loading check: Search for "Anesthesia Mod Loaded" or "anesthesia_mod_loaded".
 * If that marker is absent, Sandboxels did not execute this JS file.
 */
(function () {
    "use strict";

    // Register a visible marker FIRST, so loading can be tested without a console.
    // A present marker means that this JavaScript actually ran.
    elements.anesthesia_mod_loaded = {
        name: "Anesthesia Mod Loaded",
        hidden: false,
        color: "#f8cb51",
        behavior: behaviors.WALL,
        category: "special",
        state: "solid",
        density: 1000,
        desc: "SUCCESS: Advanced Anesthesia v3.3.0 is running. All recipes are fictional gameplay mechanics."
    };

    var MAX_DOSE = 120;
    // Minimum 90 simulated seconds at 30 TPS (gameplay balance, not clinical timing).
    // The timer freezes with the simulation.
    var SLEEP_TICKS = 90 * 30;
    var STAGES = ["Awake", "Sedated", "Deeply Sedated", "Anesthetized"];
    var AGENTS = {
        anesthesia:   { label: "Standard Anesthesia", uptake: 1.6, clear: 1.0 },
        nitrous_oxide: { label: "Nitrous Oxide",             uptake: 1.2, clear: 1.3 },
        isoflurane:    { label: "Isoflurane",           uptake: 2.8, clear: 0.9 },
        sevoflurane:   { label: "Sevoflurane",          uptake: 3.5, clear: 1.1 },
        desflurane:    { label: "Desflurane",           uptake: 3.2, clear: 1.5 }
    };
    // These are deliberately invented game recipes, not real-world syntheses.
    var RECIPES = [
        { a: "nitrogen", b: "ozone",          result: "nitrous_oxide", minTemp: 100 },
        { a: "chlorine", b: "carbon_dioxide", result: "isoflurane",    minTemp: 100 },
        { a: "methane",  b: "steam",          result: "sevoflurane",   minTemp: 100 },
        { a: "hydrogen", b: "carbon_dioxide", result: "desflurane",   minTemp: 100 }
    ];
    var NEIGHBORS = [[0,-1],[1,0],[0,1],[-1,0]];

    function isHuman(p) { return p && (p.element === "head" || p.element === "body"); }
    function limit(n) { return Math.max(0, Math.min(MAX_DOSE, n)); }
    function stage(n) { return n >= 90 ? 3 : n >= 45 ? 2 : n >= 15 ? 1 : 0; }
    function companion(p) {
        if (!isHuman(p)) return null;
        var other = getPixel(p.x, p.y + (p.element === "head" ? 1 : -1));
        if (!other || other.element !== (p.element === "head" ? "body" : "head")) return null;
        if (p._r != null && other._r != null && p._r !== other._r) return null;
        return other;
    }
    function adjacentGasAndOxygen(p, counts) {
        for (var dx = -1; dx <= 1; dx++) {
            for (var dy = -1; dy <= 1; dy++) {
                if (dx === 0 && dy === 0) continue;
                var other = getPixel(p.x + dx, p.y + dy);
                if (!other) continue;
                if (AGENTS[other.element]) counts[other.element] = (counts[other.element] || 0) + 1;
                if (other.element === "oxygen") counts._oxygen = (counts._oxygen || 0) + 1;
            }
        }
    }
    function setPart(p, dose, ventUntil, agent, sleepUntil) {
        if (!p) return;
        var currentStage = stage(dose);
        p.anDose = dose;
        p.anStage = currentStage;
        p.anVentUntil = ventUntil;
        p.anSleepUntil = sleepUntil;
        p.anAgent = currentStage ? agent : null;

        // v3.2 recolored heads and bodies purple. Undo that on existing pixels,
        // but never replace the natural skin/clothing colors in this release.
        if (p.anOriginalColor !== undefined) {
            p.color = p.anOriginalColor;
            delete p.anOriginalColor;
        }
        delete p.anColorStage;
        if (p.anOldDir !== undefined) {
            p.dir = p.anOldDir;
            delete p.anOldDir;
        }
        if (currentStage) p.panic = 0;
    }
    function setHuman(p, newDose, ventUntil, agent, renewSleep, forceWake) {
        if (!isHuman(p)) return;
        var other = companion(p);
        var oldDose = Math.max(p.anDose || 0, other ? (other.anDose || 0) : 0);
        var dose = limit(newDose);
        var vent = ventUntil === undefined ? Math.max(p.anVentUntil || 0, other ? (other.anVentUntil || 0) : 0) : ventUntil;
        var active = agent === undefined ? (p.anAgent || (other && other.anAgent) || "anesthesia") : agent;
        var sleepUntil = Math.max(p.anSleepUntil || 0, other ? (other.anSleepUntil || 0) : 0);
        if (forceWake) sleepUntil = 0;
        else if (renewSleep || (dose >= 90 && oldDose < 90)) sleepUntil = pixelTicks + SLEEP_TICKS;
        // Prevent the character leaving deep sleep before the minimum duration.
        if (sleepUntil > pixelTicks) dose = Math.max(dose, 90);
        setPart(p, dose, vent, active, sleepUntil);
        if (other) setPart(other, dose, vent, active, sleepUntil);
    }
    function humanTick(p) {
        if (!isHuman(p) || p.anTick === pixelTicks) return;
        var other = companion(p);
        p.anTick = pixelTicks;
        if (other) other.anTick = pixelTicks;
        if (p.dead || (other && other.dead)) return;

        var counts = {};
        adjacentGasAndOxygen(p, counts);
        if (other) adjacentGasAndOxygen(other, counts);
        var dose = Math.max(p.anDose || 0, other ? (other.anDose || 0) : 0);
        var vent = Math.max(p.anVentUntil || 0, other ? (other.anVentUntil || 0) : 0);
        var best = null, bestUptake = 0;
        for (var key in AGENTS) {
            if (!counts[key]) continue;
            var uptake = AGENTS[key].uptake * (1 + 0.2 * (Math.min(counts[key], 4) - 1));
            if (uptake > bestUptake) { bestUptake = uptake; best = key; }
        }
        var active = best || p.anAgent || (other && other.anAgent) || "anesthesia";
        if (best) dose += bestUptake;
        else if (dose > 0) {
            dose -= 0.12 * (AGENTS[active] ? AGENTS[active].clear : 1);
            dose -= Math.min(3, counts._oxygen || 0) * 0.5;
            if (vent > pixelTicks) dose -= 1.10;
        }
        setHuman(p, dose, vent, active);
    }

    // Deeply sedated and unconscious characters bypass the vanilla jump/walk AI.\n    // Light sedation still permits normal movement; it is not sleep.
    // Only body-driven gravity and ambient heat/fire/electricity continue.
    function sleepingTick(p) {
        var partner = companion(p);
        if ((p.element === "body" || !partner) && typeof tryMove === "function") {
            var oldX = p.x, oldY = p.y;
            var head = p.element === "body" ? partner : null;
            tryMove(p, oldX, oldY + 1);
            // Relation-linked pairs already move together in Sandboxels.
            // For ordinary pairs, bring the head DOWN into the vacated body
            // cell. If a displaced liquid or gas occupies that cell, swap it
            // into the old head position, as vanilla human gravity does.
            if (head && !head.del && p.x === oldX && p.y === oldY + 1 &&
                head.x === oldX && head.y === oldY - 1) {
                var displaced = typeof getPixel === "function" ? getPixel(oldX, oldY) : null;
                if (!displaced && typeof movePixel === "function") {
                    movePixel(head, oldX, oldY);
                } else if (displaced && displaced !== head &&
                    typeof swapPixels === "function") {
                    swapPixels(head, displaced);
                }
            }
        }
        if (p.del || !isHuman(p)) return;
        if (typeof doHeat === "function") doHeat(p);
        if (typeof doBurning === "function") doBurning(p);
        if (typeof doElectricity === "function") doElectricity(p);
        if (p.temp > 37) p.temp -= Math.min(1, p.temp - 37);
        else if (p.temp < 37) p.temp += Math.min(1, 37 - p.temp);
        if (partner && partner.dead) p.dead = partner.dead;
        p.panic = 0;
    }
    function craftGas(p) {
        if (!p || p.del) return;
        for (var i = 0; i < RECIPES.length; i++) {
            var recipe = RECIPES[i];
            if (p.element !== recipe.a) continue;
            for (var j = 0; j < NEIGHBORS.length; j++) {
                var xy = NEIGHBORS[j];
                var n = getPixel(p.x + xy[0], p.y + xy[1]);
                if (!n || n.element !== recipe.b) continue;
                if (Math.max(p.temp || 20, n.temp || 20) < recipe.minTemp) continue;
                if (Math.random() >= 0.25) continue;
                deletePixel(n.x, n.y);
                changePixel(p, recipe.result);
                return;
            }
        }
    }
    function defineVapor(key, name, colors, density, description) {
        elements[key] = {
            name: name, color: colors, behavior: behaviors.GAS,
            category: "gases", state: "gas", density: density,
            desc: "FICTIONAL game recipe: " + description + ". Not real chemistry or medical guidance.",
            tick: function (p) { if (Math.random() < 0.0015) deletePixel(p.x, p.y); }
        };
    }
    defineVapor("nitrous_oxide", "Nitrous Oxide (N2O)", ["#d8e7ff", "#d1edfa"], 1.97, "Nitrogen + ozone, 100 C");
    defineVapor("isoflurane", "Isoflurane Vapor", ["#c8cef5", "#d7d6f7"], 4.5, "Chlorine + CO2, 100 C");
    defineVapor("sevoflurane", "Sevoflurane Vapor", ["#d3f5e2", "#bdeacc"], 3.8, "Methane + steam, 100 C");
    defineVapor("desflurane", "Desflurane Vapor", ["#ffe0d6", "#f8c5d2"], 4.1, "Hydrogen + CO2, 100 C");

    // Selectable liquid and ice states. These approximate/game-tuned phase
    // temperatures are NOT medical guidance or synthesis instructions.
    // Solid and liquid forms only induce anesthesia after becoming vapor.
    function condensedPhases(gas, name, liquidColor, iceColor, boiling, freezing) {
        var liquid = "liquid_" + gas, ice = "frozen_" + gas;
        elements[gas].temp = boiling + 2;
        elements[gas].tempLow = boiling - 0.5;
        elements[gas].stateLow = liquid;
        elements[liquid] = {
            name: "Liquid " + name, color: liquidColor, behavior: behaviors.LIQUID,
            category: "liquids", state: "liquid", density: 1300,
            viscosity: 35, temp: boiling - 1, tempHigh: boiling, stateHigh: gas,
            tempLow: freezing, stateLow: ice,
            desc: "Liquid anesthetic: heat to produce vapor. Fictional gameplay only."
        };
        elements[ice] = {
            name: "Frozen " + name, color: iceColor, behavior: behaviors.WALL,
            category: "solids", state: "solid", density: 1450,
            temp: freezing - 3, tempHigh: freezing + 0.5, stateHigh: liquid,
            desc: "Frozen anesthetic: first melt, then vaporize. Fictional gameplay only."
        };
    }
    condensedPhases("anesthesia", "Anesthesia", "#aabfd2", "#dce8f0", -88.5, -90.8);
    condensedPhases("nitrous_oxide", "Nitrous Oxide", "#a9c7ef", "#dcecff", -88.5, -90.8);
    condensedPhases("isoflurane", "Isoflurane", "#b5b8de", "#e0e2fb", 48.5, -122);
    condensedPhases("sevoflurane", "Sevoflurane", "#9fdac0", "#dcf5e9", 58.5, -130);
    condensedPhases("desflurane", "Desflurane", "#ebbac2", "#f9e1e5", 23, -108);

    // Nonphysical Z: keeps skin/clothing exactly their original colors.
    // Uses the engine's drawing hook, not a new pixel or animation.
    if (typeof renderEachPixel === "function") {
        renderEachPixel(function (p, ctx) {
            if (!p || p.del || p.dead || p.element !== "head") return;
            if (!((p.anStage || 0) >= 2 || (p.anSleepUntil || 0) > pixelTicks)) return;
            var scale = typeof pixelSize === "number" ? pixelSize : 6;
            var size = Math.max(8, Math.round(scale * 1.5));
            ctx.save();
            ctx.font = "bold " + size + "px sans-serif";
            ctx.lineWidth = Math.max(1, Math.round(scale * 0.2));
            ctx.strokeStyle = "#30405c";
            ctx.fillStyle = "#c0dbff";
            ctx.strokeText("z", (p.x + 0.7) * scale, (p.y - 0.2) * scale);
            ctx.fillText("z", (p.x + 0.7) * scale, (p.y - 0.2) * scale);
            ctx.restore();
        });
    }

    // Wrap only the relevant elements, keeping the mod light on mobile.
    // Apply anesthesia BEFORE vanilla movement, and bypass voluntary AI when
    // deeply sedated or asleep; passive gravity/environmental effects continue.
    function wrapTick(elementName, extra, isHumanPart) {
        if (!elements[elementName]) return;
        var original = elements[elementName].tick;
        elements[elementName].tick = function (p) {
            if (isHumanPart) {
                if (!p.del && p.element === elementName) humanTick(p);
                if (p.del || p.element !== elementName) return;
                if (!p.dead && (p.anStage >= 2 || (p.anSleepUntil || 0) > pixelTicks)) sleepingTick(p);
                else if (typeof original === "function") original(p);
            } else {
                if (typeof original === "function") original(p);
                if (!p.del && p.element === elementName) extra(p);
            }
        };
    }
    wrapTick("head", null, true);
    wrapTick("body", null, true);
    wrapTick("nitrogen", craftGas, false);
    wrapTick("chlorine", craftGas, false);
    wrapTick("methane", craftGas, false);
    wrapTick("hydrogen", craftGas, false);

    ["head", "body"].forEach(function (name) {
        if (!elements[name]) return;
        var old = elements[name].hoverStat;
        elements[name].hoverStat = function (p) {
            var before = typeof old === "function" ? old(p) : "";
            var pct = Math.round((p.anDose || 0) / MAX_DOSE * 100);
            var label = AGENTS[p.anAgent] ? AGENTS[p.anAgent].label : "";
            var sleepLeft = Math.max(0, (p.anSleepUntil || 0) - pixelTicks);
            return (before ? String(before) + " | " : "") +
                "Anesthesia: " + STAGES[stage(p.anDose || 0)] + " (" + pct + "%)" +
                (sleepLeft ? " | Sleep: " + Math.ceil(sleepLeft / 30) + "s remaining (at 30 TPS)" : "") +
                (label ? " - " + label : "");
        };
    });
    elements.anesthetize_power = {
        name: "Anesthetize", color: "#9989c7", category: "tools", canPlace: false,
        desc: "Game tool: Sedates a human character.",
        tool: function (p) { if (isHuman(p) && !p.dead) setHuman(p, 105, undefined, undefined, true); }
    };
    elements.wake_power = {
        name: "Wake Up", color: "#eed48c", category: "tools", canPlace: false,
        desc: "Game tool: Removes the anesthesia effect. Does not heal injuries.",
        tool: function (p) { if (isHuman(p) && !p.dead) setHuman(p, 0, 0, null, false, true); }
    };
    elements.ventilate_power = {
        name: "Assist Breathing", color: "#79c8d9", category: "tools", canPlace: false,
        desc: "Game tool: Speeds recovery when no anesthetic gas is nearby.",
        tool: function (p) {
            if (!isHuman(p) || p.dead) return;
            var other = companion(p);
            var dose = Math.max(p.anDose || 0, other ? (other.anDose || 0) : 0);
            setHuman(p, dose, pixelTicks + 90);
        }
    };
})();
