// Reads a `baw contract-call preview --json` response on stdin.
// Prints the requestId only when the simulation is completely clean, otherwise
// prints DIRTY/FAIL/PARSE_FAIL so the caller can refuse to execute.
let s = "";
process.stdin.on("data", (d) => (s += d));
process.stdin.on("end", () => {
  try {
    const j = JSON.parse(s);
    if (!j.success) {
      console.log("FAIL " + JSON.stringify(j).slice(0, 400));
      return;
    }
    const d = j.data;
    const sr = d.simulationResult || {};
    const clean =
      sr.simulationCode === "000000000" &&
      !sr.simulationErrorDetail &&
      !(d.risks?.riskDetails || []).length &&
      !Object.keys(d.risks?.addresses || {}).length &&
      !(d.risks?.riskBehaviors || []).length &&
      d.requireConfirmation === false;
    if (!clean) {
      console.log(
        "DIRTY code=" +
          sr.simulationCode +
          " err=" +
          JSON.stringify(sr.simulationErrorDetail) +
          " risks=" +
          JSON.stringify(d.risks).slice(0, 300) +
          " confirm=" +
          d.requireConfirmation
      );
      return;
    }
    console.log(d.requestId);
  } catch (e) {
    console.log("PARSE_FAIL " + e.message);
  }
});
