# Model checks

Plain Node scripts (no dependencies) that exercise the model layer against a
minimal mock of DrawIO's cell model:

```bash
node test/model.check.js    # ShapeProperties + TechnologyRegistry: hierarchy, IDs,
                            # parent resolution, adoption, sync props, flow checks
node test/export.check.js   # ArchitectureModel: metamodel §18 example over two pages
                            # (zero findings, YAML layout) + every validation code
node test/modelpage.check.js # ModelDiagram tree layout + model page skipped by forEachPage
```

Each prints `all … checks passed` or throws on the first failed assertion.
`export.check.js` writes `clean.yaml` and `findings.txt` to a temp folder (or
to the folder given as second argument) for inspection.

Planned (parked): convert them to Node's built-in test runner (`node:test`)
with a shared mock module and an `npm test` script — no Jest needed. UI
testing in DrawIO itself: see `tools/drawio-cdp/`.
