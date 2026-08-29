# Reference: original Java Swing engine

This folder preserves the original Tomasulo-Visual engine for provenance and to
document the algorithm the web port replicates. **It is not built or executed by
the web app.** The authoritative, runnable engine is the TypeScript port in
[`../web/src/engine/`](../web/src/engine/).

`HeadlessTest.java` is the harness that produced the golden baselines in
`../web/test/golden/`. The web fidelity test (`npm test` in `web/`) confirms the
TypeScript engine reproduces those timing tables exactly for all 7 samples.

The full original GUI sources (Swing UIs, Diagram, etc.) live in the upstream
Tomasulo-Visual project and are omitted here since they cannot run in a browser.
