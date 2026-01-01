import { time_t } from "/quack/lib/constant/time.js";
import { MyNumber } from "/quack/lib/number.js";

/**
 * @param {NS} ns The Netscript API.
 * @returns {array} An array structured as follows:
 *     (1) header := An array of header names.  Headers appear in the left
 *         column of the HUD.
 *     (2) value := An array of values.  Each value corresponds to a header.
 *         Values appear in the right column of the HUD.
 */
function custom_hud_values(ns) {
    const to_fixed = true;
    const header = [];
    const value = [];

    // Our current negative karma value.
    header.push("Karma");
    value.push(MyNumber.format(ns.heart.break(), to_fixed));

    // The Hack XP of all scripts per second.
    header.push("Hack");
    value.push(`${MyNumber.format(ns.getTotalScriptExpGain(), to_fixed)}/s`);

    // The income of all scripts per second.
    header.push("Money");
    value.push(`${MyNumber.format(ns.getTotalScriptIncome()[0], to_fixed)}/s`);

    // The share power.  This is the percentage increase in reputation
    // gain while sharing RAM with a faction.  The share power is given
    // as a decimal number.  For example, a share power of 1.286 means
    // we have a 28.6% increase in reputation gain.
    const share_power = ns.getSharePower() - 1;
    const ndigit = 3;
    header.push("Share");
    value.push(ns.formatPercent(share_power, ndigit));

    // Home server RAM
    const home_ram = ns.getServerMaxRam("home") - ns.getServerUsedRam('home');
    header.push("RAM");
    value.push(ns.formatRam(home_ram,2));

    return [header, value];
}

function decorate(str, colour) {
    const reset = "\u001b[0m";
    return `${colour}${str}${reset}`;
}

/** @param {NS} ns The Netscript API. */
function shush(ns) {
    ns.disableLog("sleep");
}

/** @param {NS} ns The Netscript API. */
export async function main(ns) {
    shush(ns);

    // Custom colouring for the new fields.
    // eslint-disable-next-line no-eval
    const doc = eval("document");
    const hook0 = doc.getElementById("overview-extra-hook-0");
    const hook1 = doc.getElementById("overview-extra-hook-1");
    const fav_colour = "#C5D5EE"; // blueish
    hook0.style.color = fav_colour;
    hook1.style.color = fav_colour;

    // Make sure to clean up after ourselves.
    ns.atExit(() => {
        hook0.innerHTML = "";
        hook1.innerHTML = "";
    });

    // Constantly update the HUD.
    for (;;) {
        try {
            const [header, value] = custom_hud_values(ns);
            hook0.innerText = header.join("\n");
            hook1.innerText = value.join("\n");
        } catch (e) {
            const red = "\u001b[31m";
            ns.print(decorate(`No update: ${String(e)}`, red));
        }

        await ns.sleep(time_t.SECOND);
    }
}
