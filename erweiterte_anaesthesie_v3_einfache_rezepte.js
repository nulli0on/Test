/*
 * Sandboxels – Erweiterte Anästhesie v3.0
 * Reale Namen der Narkosemittel, aber ABSICHTLICH ERFUNDENE
 * Ein-Schritt-Spielrezepte. KEINE echte Chemie oder Medizin.
 * Ersetzt v2.1 (nicht beide Mods gleichzeitig aktivieren).
 *
 * Rezepte: Gase beruehren sich, mindestens eines ist ausreichend warm.
 *   Stickstoff + Ozon         (100 C) -> Lachgas
 *   Chlor + Kohlendioxid      (100 C) -> Isofluran-Dampf
 *   Methan + Wasserdampf      (100 C) -> Sevofluran-Dampf
 *   Wasserstoff + Kohlendioxid(100 C) -> Desfluran-Dampf
 * Das Vanilla-Rezept Stickstoff + Sauerstoff -> Anesthesia bleibt unveraendert.
 */
(() => {
    "use strict";

    const CFG = {
        maxDose: 120,
        stages: [15, 45, 90],
        naturalRecovery: 0.34,
        oxygenRecovery: 0.50,
        ventilationRecovery: 1.10,
        ventilationTicks: 90,
        humanColors: {
            head: [null, "#e1c9f7", "#aa8be7", "#8060ff"],
            body: [null, "#c5b5df", "#9271d5", "#5936d6"]
        }
    };
    const labels = ["Wach", "Sediert", "Tief sediert", "Narkotisiert"];
    const isHumanPart = p => p && (p.element === "head" || p.element === "body");
    const clamp = n => Math.max(0, Math.min(CFG.maxDose, n));

    // Die Werte sind reine Gameplay-Einstellungen, keine klinischen Staerken.
    const agents = {
        anesthesia:     { label: "Original-Anesthesia", uptake: 1.6, clear: 1.0 },
        nitrous_oxide:   { label: "Lachgas",             uptake: 1.2, clear: 1.3 },
        isoflurane:      { label: "Isofluran",           uptake: 2.8, clear: 0.9 },
        sevoflurane:     { label: "Sevofluran",          uptake: 3.5, clear: 1.1 },
        desflurane:      { label: "Desfluran",           uptake: 3.2, clear: 1.5 }
    };

    const recipes = [
        { a:"nitrogen", b:"ozone",          result:"nitrous_oxide", temp:100 },
        { a:"chlorine", b:"carbon_dioxide", result:"isoflurane",    temp:100 },
        { a:"methane",  b:"steam",          result:"sevoflurane",   temp:100 },
        { a:"hydrogen", b:"carbon_dioxide", result:"desflurane",   temp:100 }
    ];

    function stage(dose) {
        if (dose >= CFG.stages[2]) return 3;
        if (dose >= CFG.stages[1]) return 2;
        if (dose >= CFG.stages[0]) return 1;
        return 0;
    }

    function otherPart(p) {
        if (!isHumanPart(p)) return null;
        const other = getPixel(p.x, p.y + (p.element === "head" ? 1 : -1));
        if (!other || other.element !== (p.element === "head" ? "body" : "head")) return null;
        if (p._r != null && other._r != null && p._r !== other._r) return null;
        return other;
    }

    function nearbyGas(p, counts) {
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                if (!dx && !dy) continue;
                const n = getPixel(p.x + dx, p.y + dy);
                if (n && agents[n.element]) counts[n.element] = (counts[n.element] || 0) + 1;
            }
        }
    }

    function nearbyOxygen(p) {
        let count = 0;
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                if (!dx && !dy) continue;
                const n = getPixel(p.x + dx, p.y + dy);
                if (n && n.element === "oxygen") count++;
            }
        }
        return count;
    }

    function syncPart(p, dose, ventUntil, agentKey) {
        if (!p) return;
        const level = stage(dose);
        p.anDose = dose;
        p.anStage = level;
        p.anVentUntil = ventUntil;
        p.anAgent = level ? agentKey : null;

        // Originale Pixel-Farbe sichern und beim Aufwachen zurueckgeben.
        if (level > 0) {
            if (p.anOriginalColor === undefined) p.anOriginalColor = p.color;
            if (p.anColorStage !== level) {
                const target = CFG.humanColors[p.element][level];
                p.color = typeof pixelColorPick === "function" ? pixelColorPick(p, target) : target;
                p.anColorStage = level;
            }
            if (p.anOldDir === undefined) p.anOldDir = p.dir === -1 || p.dir === 1 ? p.dir : 1;
            const mayWalk = (level === 1 && pixelTicks % 3 === 0) ||
                (level === 2 && pixelTicks % 10 === 0);
            p.dir = mayWalk ? p.anOldDir : 0;
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

    function modifyHuman(p, newDose, ventUntil, agentKey) {
        if (!isHumanPart(p)) return;
        const partner = otherPart(p);
        const dose = clamp(newDose);
        const vent = ventUntil === undefined
            ? Math.max(p.anVentUntil || 0, partner ? partner.anVentUntil || 0 : 0)
            : ventUntil;
        const key = agentKey === undefined
            ? (p.anAgent || (partner && partner.anAgent) || "anesthesia")
            : agentKey;
        syncPart(p, dose, vent, key);
        if (partner) syncPart(partner, dose, vent, key);
    }

    function makeVapor(id, title, color, density, recipe) {
        elements[id] = {
            name: title,
            color: color,
            behavior: behaviors.GAS,
            category: "gases",
            state: "gas",
            density: density,
            temp: 20,
            tick(pixel) {
                // Langsame Verduennung (rein visuelle Spielmechanik).
                if (Math.random() < 0.0015) deletePixel(pixel.x, pixel.y);
            },
            desc: `Fiktive Spielherstellung: ${recipe}. Kontakt faerbt Menschen je nach Narkosestufe lila. Keine echte Herstellung.`
        };
    }

    makeVapor("nitrous_oxide", "Lachgas (N2O)", ["#d8e7ff", "#d1edfa"], 1.97,
        "Stickstoff + Ozon bei >=100 °C");
    makeVapor("isoflurane", "Isofluran-Dampf", ["#c8cef5", "#d7d6f7"], 4.5,
        "Chlor + Kohlendioxid bei >=100 °C");
    makeVapor("sevoflurane", "Sevofluran-Dampf", ["#d3f5e2", "#bdeacc"], 3.8,
        "Methan + Wasserdampf bei >=100 °C");
    makeVapor("desflurane", "Desfluran-Dampf", ["#ffe0d6", "#f8c5d2"], 4.1,
        "Wasserstoff + Kohlendioxid bei >=100 °C");

    // Ein-Schritt-Spiel-Crafting mit zwei Gasen und Waerme.
    // Global statt elements.X.reactions, damit bestehende Vanilla-Reaktionen
    // (besonders O2 + N2 -> Anesthesia) nicht ueberschrieben werden.
    function tryCraftGas(p) {
        for (const recipe of recipes) {
            if (p.element !== recipe.a) continue;
            for (const [dx, dy] of [[0,-1],[1,0],[0,1],[-1,0]]) {
                const n = getPixel(p.x + dx, p.y + dy);
                if (!n || n.element !== recipe.b) continue;
                if (Math.max(p.temp || 20, n.temp || 20) < recipe.temp) continue;
                if (Math.random() >= 0.25) continue;
                // Zwei Gaspixel -> ein Narkosegas-Pixel.
                deletePixel(n.x, n.y);
                changePixel(p, recipe.result);
                return;
            }
        }
    }

    // Kopf und Koerper sind ein Spielercharakter: nur einmal pro Tick aktualisieren.
    function tickHuman(p) {
        if (p.anTick === pixelTicks) return;
        const partner = otherPart(p);
        p.anTick = pixelTicks;
        if (partner) partner.anTick = pixelTicks;
        if (p.dead || (partner && partner.dead)) return;

        let dose = Math.max(p.anDose || 0, partner ? partner.anDose || 0 : 0);
        const ventUntil = Math.max(p.anVentUntil || 0, partner ? partner.anVentUntil || 0 : 0);
        const counts = {};
        nearbyGas(p, counts);
        if (partner) nearbyGas(partner, counts);

        let best = null;
        let uptake = 0;
        for (const key of Object.keys(counts)) {
            const n = Math.min(counts[key], 4);
            const amount = agents[key].uptake * (1 + 0.20 * (n-1));
            if (amount > uptake) { uptake = amount; best = key; }
        }

        let activeAgent = best || p.anAgent || (partner && partner.anAgent) || "anesthesia";
        if (best) {
            dose += uptake;
        } else if (dose > 0) {
            const clearance = agents[activeAgent] ? agents[activeAgent].clear : 1;
            const oxygen = Math.min(3, nearbyOxygen(p) + (partner ? nearbyOxygen(partner) : 0));
            dose -= CFG.naturalRecovery * clearance;
            dose -= oxygen * CFG.oxygenRecovery;
            if (ventUntil > pixelTicks) dose -= CFG.ventilationRecovery;
        }
        modifyHuman(p, dose, ventUntil, activeAgent);
    }

    runPerPixel(p => {
        if (isHumanPart(p)) tickHuman(p);
        else if (p && (p.element === "nitrogen" || p.element === "chlorine" ||
                        p.element === "methane" || p.element === "hydrogen")) tryCraftGas(p);
    });

    for (const key of ["head", "body"]) {
        if (!elements[key]) continue;
        const old = elements[key].hoverStat;
        elements[key].hoverStat = function(p) {
            const before = typeof old === "function" ? old(p) : "";
            const progress = Math.round((p.anDose || 0) / CFG.maxDose * 100);
            const agent = agents[p.anAgent] ? agents[p.anAgent].label : "";
            return (before ? String(before) + " | " : "") +
                `Narkose: ${labels[stage(p.anDose || 0)]} (${progress}%)` + (agent ? ` – ${agent}` : "");
        };
    }

    elements.anesthetize_power = {
        name: "Anästhesieren", color: "#9989c7", category: "tools",
        desc: "Mit grossem Pinsel ganze Gruppen direkt narkotisieren (Spielmechanik).",
        tool(p) { if (isHumanPart(p) && !p.dead) modifyHuman(p, 105); }
    };
    elements.wake_power = {
        name: "Aufwecken", color: "#eed48c", category: "tools",
        desc: "Setzt den Narkosefortschritt zurueck. Heilt keine Verletzungen.",
        tool(p) { if (isHumanPart(p) && !p.dead) modifyHuman(p, 0, 0); }
    };
    elements.ventilate_power = {
        name: "Beatmen", color: "#79c8d9", category: "tools",
        desc: "Beschleunigt das Aufwachen, wenn kein Narkosegas mehr anliegt (Spielmechanik).",
        tool(p) {
            if (!isHumanPart(p) || p.dead) return;
            const partner = otherPart(p);
            const dose = Math.max(p.anDose || 0, partner ? partner.anDose || 0 : 0);
            modifyHuman(p, dose, pixelTicks + CFG.ventilationTicks);
        }
    };
})();
