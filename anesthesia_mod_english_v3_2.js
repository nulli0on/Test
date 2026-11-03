/*
 * Sandboxels - Advanced Anesthesia v3.2 (English only, mobile-friendly)
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
        desc: "SUCCESS: Advanced Anesthesia v3.2 is running. All recipes are fictional gameplay mechanics."
    };

    var MAX_DOSE = 120;
    var PALETTE = {
        head: [null, "#e1c9f7", "#aa8be7", "#8060ff"],
        body: [null, "#c5b5df", "#9271d5", "#5936d6"]
    };
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
    function setPart(p, dose, ventUntil, agent) {
        if (!p) return;
        var currentStage = stage(dose);
        p.anDose = dose;
        p.anStage = currentStage;
        p.anVentUntil = ventUntil;
        p.anAgent = currentStage ? agent : null;
        if (currentStage) {
            if (p.anOriginalColor === undefined) p.anOriginalColor = p.color;
            if (p.anColorStage !== currentStage) {
                var shade = PALETTE[p.element][currentStage];
                p.color = typeof pixelColorPick === "function" ? pixelColorPick(p, shade) : shade;
                p.anColorStage = currentStage;
            }
            if (p.element === "body") {
                if (p.anOldDir === undefined) p.anOldDir = p.dir === -1 ? -1 : 1;
                p.dir = (currentStage === 1 && pixelTicks % 3 === 0) ||
                        (currentStage === 2 && pixelTicks % 10 === 0) ? p.anOldDir : 0;
            }
            p.panic = 0;
        } else {
            if (p.anOriginalColor !== undefined) {
                p.color = p.anOriginalColor;
                delete p.anOriginalColor;
                delete p.anColorStage;
            }
            if (p.anOldDir !== undefined) {
                p.dir = p.anOldDir;
                delete p.anOldDir;
            }
        }
    }
    function setHuman(p, newDose, ventUntil, agent) {
        if (!isHuman(p)) return;
        var other = companion(p);
        var dose = limit(newDose);
        var until = ventUntil === undefined ? Math.max(p.anVentUntil || 0, other ? (other.anVentUntil || 0) : 0) : ventUntil;
        var active = agent === undefined ? (p.anAgent || (other && other.anAgent) || "anesthesia") : agent;
        setPart(p, dose, until, active);
        if (other) setPart(other, dose, until, active);
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
            dose -= 0.34 * (AGENTS[active] ? AGENTS[active].clear : 1);
            dose -= Math.min(3, counts._oxygen || 0) * 0.5;
            if (vent > pixelTicks) dose -= 1.10;
        }
        setHuman(p, dose, vent, active);
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

    // Instead of running on EVERY pixel, only wrap relevant elements' tick handlers.
    // This is much lighter on mobile, especially alongside chem.js and other large mods.
    function wrapTick(elementName, extra) {
        if (!elements[elementName]) return;
        var original = elements[elementName].tick;
        elements[elementName].tick = function (p) {
            if (typeof original === "function") original(p);
            if (!p.del && p.element === elementName) extra(p);
        };
    }
    wrapTick("head", humanTick);
    wrapTick("body", humanTick);
    wrapTick("nitrogen", craftGas);
    wrapTick("chlorine", craftGas);
    wrapTick("methane", craftGas);
    wrapTick("hydrogen", craftGas);

    ["head", "body"].forEach(function (name) {
        if (!elements[name]) return;
        var old = elements[name].hoverStat;
        elements[name].hoverStat = function (p) {
            var before = typeof old === "function" ? old(p) : "";
            var pct = Math.round((p.anDose || 0) / MAX_DOSE * 100);
            var label = AGENTS[p.anAgent] ? AGENTS[p.anAgent].label : "";
            return (before ? String(before) + " | " : "") +
                "Anesthesia: " + STAGES[stage(p.anDose || 0)] + " (" + pct + "%)" + (label ? " - " + label : "");
        };
    });
    elements.anesthetize_power = {
        name: "Anesthetize", color: "#9989c7", category: "tools", canPlace: false,
        desc: "Game tool: Sedates a human character.",
        tool: function (p) { if (isHuman(p) && !p.dead) setHuman(p, 105); }
    };
    elements.wake_power = {
        name: "Wake Up", color: "#eed48c", category: "tools", canPlace: false,
        desc: "Game tool: Removes the anesthesia effect. Does not heal injuries.",
        tool: function (p) { if (isHuman(p) && !p.dead) setHuman(p, 0, 0); }
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
