# Architecture-to-Implementation Mapping Specification

**Status:** V1 candidate
**Scope:** Defines how a declared architecture is intentionally related to an implementation workspace. It does not define architecture structure itself and does not perform implementation compliance analysis.

# 1. Purpose

The mapping specification connects the stable identities in the Architecture Metamodel to implementation locations that can be inspected by discovery tooling.

It exists to answer:

> Where is this architecture Element intended to be realized in the implementation?

The mapping describes **intent**. Discovery describes **current reality**. Compliance compares the two.

```text
Declared Architecture
        |
        v
Declared Mapping
        |
        v
Implementation Selectors
        |
        v
Discovery
        |
        v
Observed Implementation
        |
        v
Architecture Alignment
```

The mapping is deliberately separate from the architecture model so architecture and implementation can evolve independently.

---

# 2. Core principles

1. **Architecture and mapping are separate contracts.** Architecture says what should exist. Mapping says where that architecture is intended to be realized.
2. **The mapping targets a specific architecture revision.** Architecture may be ahead of implementation, including non-backwards-compatible redesigns.
3. **Mapping does not prove implementation exists.** A valid local selector may intentionally point to implementation that has not yet been created.
4. **Map the lowest modeled implementation-relevant architecture Element.** Prefer Node. Map Service directly only where that Service has no applicable Node decomposition.
5. **Mapping is many-to-many.** One architecture Element may require several selectors; one implementation scope may support several architecture Elements.
6. **Selectors define anchors and discovery boundaries.** They do not enumerate every implementation artifact.
7. **Discovery never silently edits mapping.** It may propose mappings but cannot approve them.
8. **Rejected proposals are remembered explicitly.** Negative mapping knowledge prevents the same false proposal from recurring.
9. **Local and external implementation references have different discovery responsibilities.** Local is inspectable; external is outside the current compliance workspace.
10. **Precision and resolution are separate dimensions.** A precise selector may be unresolved because architecture is ahead of code.
11. **Git is the normal V1 implementation version boundary.** When mapping, source, IaC, and architecture are in one worktree, the Git revision provides a reproducible workspace state.
12. **V1 is report-only.** Mapping/compliance findings do not block delivery.

---

# 3. Relationship to the Architecture Metamodel

The mapping specification assumes architecture Elements have stable IDs.

Typical hierarchy:

```text
Organization
    |
Software System
    |
Workflow / Tier
    |
Service
    |
Node
```

Mapping does not change this hierarchy and must not infer new architecture parentage.

## 3.1 Preferred mapping target

The preferred target is a Node because Node is the lowest technology-specific architecture Element and therefore normally provides the clearest bridge to source code, deployment definitions, or infrastructure.

A Node is not necessarily executable software:

```text
Lambda Node     -> source + IaC may be expected
Spark Job Node  -> source + deployment/IaC may be expected
S3 Node         -> IaC may be expected
SNS Node        -> IaC may be expected
```

## 3.2 Service mapping exception

A Service may be mapped directly only when the architecture intentionally stops at Service level for that implementation responsibility.

Valid:

```text
Service A
    |
    +-- no Nodes modeled

Service A -> implementation selectors
```

When a Service has applicable Node decomposition, its authoritative implementation mapping belongs to those Nodes:

```text
Service A
   +-- Node A1 -> implementation selectors
   +-- Node A2 -> implementation selectors
```

The Service realization is then derived from its Nodes rather than independently authored.

**MAP-001:** A direct mapping target is a Node, or a Service with no applicable Node decomposition.

---

# 4. Versioning and architecture evolution

## 4.1 Architecture revision reference

Every mapping document targets a specific architecture model/revision.

Conceptually:

```yaml
mappingVersion: 1

architecture:
  model: trade-modernization
  revision: <immutable-architecture-reference>
```

The exact revision mechanism may be a Git commit or another stable architecture revision identifier.

## 4.2 Architecture may be ahead of implementation

The mapping describes the **intended realization** of its architecture revision, not only what currently exists.

Example target architecture:

```text
A -> C -> B
```

Current implementation may still be:

```text
A -> B
```

The mapping may already contain selectors for C even if they do not resolve in the current workspace. Discovery reports the current state; compliance records the gap.

A missing future selector target therefore does not invalidate the mapping syntax.

## 4.3 Same-repository default

V1 assumes a compliance run normally operates on one local Git worktree containing some or all of:

```text
architecture/
mapping/
source/
terraform/
build files
configuration
```

When these are in one Git worktree, the Git revision provides a common reproducible implementation state.

The architecture reference remains explicit so architecture can conceptually or physically evolve independently.

---

# 5. Implementation locality

Each implementation reference has a locality.

```text
LOCAL
EXTERNAL
```

## 5.1 LOCAL

A LOCAL reference is expected to be inspectable inside the current compliance workspace.

```text
LOCAL
  -> mapping selector
  -> discovery
  -> observed artifacts/relationships
  -> compliance comparison
```

A LOCAL selector may currently be unresolved if the architecture/mapping is ahead of implementation.

## 5.2 EXTERNAL

An EXTERNAL reference identifies implementation outside the current discovery boundary.

```text
EXTERNAL
  -> declared mapping/reference
  -> no requirement for local discovery
```

EXTERNAL does not necessarily mean another Organization. Ownership and implementation locality are independent concepts.

A system owned by the same Organization can be external to the current repository/workspace.

**MAP-002:** Every implementation mapping is explicitly LOCAL or EXTERNAL.

---

# 6. Selector model

LOCAL mappings use selectors. A selector means:

> Look here for implementation evidence for this architecture Element.

A selector is not an exhaustive inventory and does not imply that every file/resource inside its scope exclusively implements the architecture Element.

Initial selector families:

```text
SOURCE
IAC
CONFIGURATION
```

**MAP-003:** LOCAL mappings use selectors, not exhaustive lists of discovered artifacts.

---

# 7. SOURCE selector

A SOURCE selector may contain:

```text
module
package
entryPoint
path
include[]
exclude[]
```

Not every field is required.

## 7.1 `module`

Defines the primary build/source boundary.

Example:

```yaml
type: SOURCE
module: processing/normalization
```

The discovery engine may identify the build system from workspace contents rather than requiring the mapping to duplicate Maven/Gradle/SBT metadata.

## 7.2 `package`

Narrows the source scope when a build module contains implementation for multiple architectural Elements.

```yaml
module: processing
package: com.example.trade.normalization
```

## 7.3 `entryPoint`

Provides a strong executable anchor.

Typical examples:

- Java `main`/bootstrap class;
- Lambda handler;
- Spark main class/object;
- other explicit executable entry point.

```yaml
entryPoint: com.example.trade.normalization.NormalizationJob
```

## 7.4 `path`

Provides a filesystem boundary where module/package/symbol identity is unsuitable.

Filesystem paths are weaker/stabler only as fallback selectors and should not normally replace logical build/symbol identity.

## 7.5 `include` and `exclude`

Optional boundaries can restrict discovery, for example to production source while excluding tests/generated code.

They should remain simple. The mapping must not become a second build system.

## 7.6 Selector specificity

Preferred specificity order:

```text
entryPoint
   >
package
   >
module
   >
path-only
```

More-specific anchors take precedence when broader scopes overlap.

---

# 8. IAC selector

V1 primarily targets Terraform-style Infrastructure as Code while keeping selector semantics conceptually generic.

An IAC selector may contain:

```text
module
resource
path
```

## 8.1 `module`

Defines an IaC discovery boundary.

```yaml
type: IAC
module: terraform/modules/normalization
```

## 8.2 `resource`

Provides a logical IaC anchor.

```yaml
resource: aws_lambda_function.normalizer
```

Logical resource identity is preferred over physical filename/line number because resources may move between files without changing meaning.

## 8.3 Module-only mapping

A Node may be realized by a composition of resources rather than one resource. A module-only selector is therefore valid:

```yaml
type: IAC
module: terraform/modules/processing-runtime
```

Discovery determines the resources and relationships inside that scope.

**MAP-004:** IaC selectors should prefer logical module/resource identity over filenames and line numbers.

---

# 9. CONFIGURATION selector

Configuration mapping is optional and expected to be uncommon in V1.

Example:

```yaml
type: CONFIGURATION
path: normalization/src/main/resources/application.conf
```

Most configuration should be followed by discovery from source/IaC rather than explicitly mapped.

V1 does not require key-level mapping selectors.

---

# 10. Anchors, scopes, and shared implementation

A selector can play two related roles:

```text
anchor  = specific implementation identity
scope   = discovery boundary/supporting implementation region
```

Example:

```yaml
type: SOURCE
module: common-processing
entryPoint: com.example.trade.HandlerA
```

`module` is broad scope; `entryPoint` is the precise anchor.

## 10.1 Shared modules/packages

Many-to-many mapping is allowed.

Example:

```text
common-processing module
   +-- Handler A -> Node A
   +-- Handler B -> Node B
   +-- shared helpers
```

Node A and Node B may both refer to the same module, while different entry points distinguish their runtime responsibility.

Shared helper code does not require its own architecture mapping unless it represents an architecture-significant capability.

## 10.2 Broad mapping is not exclusive ownership

Mapping Node A to module M does not imply every file/class in M implements Node A.

Discovery uses the selector as an analysis boundary and, where available, follows a specific anchor such as an entry point.

**MAP-005:** Mapping scope is a discovery boundary, not automatic ownership of every contained artifact.

---

# 11. Many-to-many mappings

The model permits:

```text
Architecture Element * <-> * Implementation selectors/scopes
```

## 11.1 One architecture Element to many implementation references

Example Lambda Node:

```text
Lambda Node
   +-- SOURCE entry point
   +-- SOURCE module
   +-- IAC Lambda resource
```

Example Spark Node:

```text
Spark Job Node
   +-- SOURCE entry point
   +-- SOURCE module
   +-- IAC/deployment module/resource
   +-- optional configuration
```

## 11.2 One implementation scope to multiple Elements

A single Java package/module may contain multiple Lambda handlers mapped to different Nodes. A Terraform module may also provision several architecture-significant Nodes.

These are valid as long as anchors/specificity provide sufficient separation for discovery or ambiguity is reported.

---

# 12. Mapping precision

V1 uses only three precision classifications.

```text
DETERMINISTIC
STRONG
INFERRED
```

## 12.1 DETERMINISTIC

An explicit mapping uniquely identifies the intended implementation target.

Examples:

```text
Node -> exact Java/Scala entry point
Node -> exact Terraform resource address
```

## 12.2 STRONG

An explicit mapping identifies a constrained implementation scope but not one uniquely identifiable runtime target.

Example:

```text
Lambda Node -> Java package containing multiple Lambda entry points
```

The package is clearly the intended discovery scope, but cannot uniquely identify which handler realizes the Node.

## 12.3 INFERRED

No authoritative declared mapping establishes the association. Discovery/agent reasoning proposes it from evidence such as naming, technology, topology, or surrounding context.

`INFERRED` is never automatically authoritative.

**MAP-006:** Precision is limited to DETERMINISTIC, STRONG, and INFERRED in V1.

---

# 13. Resolution state

Precision and resolution are independent.

V1 resolution states are:

```text
RESOLVED
UNRESOLVED
PROPOSED
AMBIGUOUS
EXTERNAL
```

## 13.1 RESOLVED

A declared LOCAL mapping selector resolves sufficiently for discovery.

Only declared mappings can be RESOLVED.

## 13.2 UNRESOLVED

A syntactically valid declared LOCAL mapping does not currently resolve in the workspace.

This can legitimately represent architecture ahead of implementation.

## 13.3 PROPOSED

Discovery/agent reasoning has identified a candidate association but it is not part of the declared mapping.

Normally:

```text
precision = INFERRED
state     = PROPOSED
```

## 13.4 AMBIGUOUS

A declared selector resolves to multiple incompatible candidates or behavior cannot safely be assigned between overlapping mappings.

This is distinct from STRONG. A STRONG package selector may resolve correctly to the intended package while still being less precise than a unique entry point. AMBIGUOUS means the selector/discovery cannot determine the intended resolution safely.

## 13.5 EXTERNAL

The reference is intentionally outside local discovery responsibility.

## 13.6 Prohibited transition

An automatically inferred proposal must never become:

```text
INFERRED + RESOLVED
```

Approval must update the declared mapping document. The next run then evaluates the approved selector as DETERMINISTIC or STRONG and RESOLVED/UNRESOLVED as appropriate.

**MAP-007:** Agent inference cannot silently become authoritative mapping.

---

# 14. Mapping approval lifecycle

```text
Discovery
   |
   v
Candidate association
   |
   v
INFERRED / PROPOSED
   |                 \
 approve              reject
   |                    \
   v                     v
mapping updated        rejection recorded
   |
   v
next analysis
   |
   +-- unique selector -> DETERMINISTIC / RESOLVED
   +-- scoped selector -> STRONG / RESOLVED
```

The mapping document remains the authoritative source of accepted implementation associations.

---

# 15. Rejected mappings: negative knowledge

V1 records explicit rejected mapping candidates so discovery does not repeatedly propose known false associations.

Conceptually:

```yaml
rejections:
  - element: trade.matching.match-processor
    implementation:
      scope: LOCAL
      selector:
        type: SOURCE
        entryPoint: com.example.trade.match.MatchHandler
    reason: >
      This handler does not implement MatchProcessor.
      MatchProcessor is not yet implemented.
```

## 15.1 Rejection semantics

A rejection applies to the specific pair:

```text
architecture Element
        +
implementation selector
```

It does not suppress either side globally.

Therefore:

```text
trade.match != MatchProcessor
```

does not prevent `trade.match` from being proposed for another Service/Node.

## 15.2 Persistence

A rejection remains authoritative until removed or superseded through normal version-controlled change.

V1 does not require hashes, expiry dates, or automatic reconsideration heuristics.

## 15.3 Discovery behavior

Before proposing a candidate, discovery must consult:

```text
accepted mappings
rejected mappings
```

A candidate matching a rejection is suppressed.

**MAP-008:** Rejected pairings must not be re-proposed while the rejection remains in force.

---

# 16. Mapping validation versus mapping resolution

A mapping can be structurally valid even if its implementation does not yet exist.

## 16.1 Invalid mapping

Examples:

- architecture Element ID does not resolve;
- Service is directly mapped while applicable child Nodes are authoritative mapping targets;
- LOCAL selector illegally escapes workspace boundary;
- malformed selector;
- duplicate/conflicting mapping declarations that cannot be reconciled.

## 16.2 Valid but unresolved mapping

Example:

```yaml
element: trade.future.match-processor
implementation:
  scope: LOCAL
  selectors:
    - type: SOURCE
      module: matching-v2
      entryPoint: com.example.trade.NewMatchProcessor
```

If `matching-v2` does not yet exist, the mapping can remain valid while its state is `UNRESOLVED`.

This distinction is required to support architecture-ahead development.

---

# 17. Selector overlap and ambiguity

Overlapping selectors are not automatically invalid because shared implementation is legitimate.

Example:

```text
Node A -> module common-processing + entry point HandlerA
Node B -> module common-processing + entry point HandlerB
```

This is acceptable.

If Node A and Node B both map only to the same broad package/module and discovery cannot attribute observed behavior safely, report `AMBIGUOUS` rather than guessing.

Specific anchors take precedence over broad scopes when resolving behavior.

**MAP-009:** Ambiguous overlapping implementation scopes must be reported, not guessed.

---

# 18. External references

EXTERNAL mapping identifies an implementation boundary without local discovery.

Conceptually:

```yaml
- element: external.customer-master
  implementation:
    scope: EXTERNAL
    reference:
      description: Customer Master service implementation
      documentation:
        - uri: <reference>
```

External references may later support remote discovery, but generalized multi-repository discovery is outside V1.

**MAP-010:** EXTERNAL references do not require local resolution.

---

# 19. Discovery responsibilities

The mapping says **where to look**. Discovery says **what actually exists and behaves there**.

For LOCAL mapping:

```text
selector
   |
   v
resolve implementation scope/anchor
   |
   v
inspect source/IaC/configuration
   |
   v
produce observed artifacts and relationships
```

Discovery may find:

- expected implementation;
- implementation missing from an expected selector;
- additional architecture-significant implementation;
- behavior not represented in architecture;
- unmapped implementation artifacts;
- candidate mappings.

Discovery must not silently modify architecture or mapping.

**MAP-011:** Discovery uses mapping as intent and emits observed facts/proposals separately.

---

# 20. Observed evidence and effective precision

Observed architecture claims should retain evidence linking implementation behavior back through mapping.

Possible evidence sources include:

```text
SOURCE
CONFIGURATION
IAC
MAPPING
```

Relationship evidence may itself be DETERMINISTIC, STRONG, or INFERRED.

When producing an architecture-level observed relationship, effective precision cannot exceed the weakest material link in the evidence chain.

Example:

```text
source relationship evidence      DETERMINISTIC
source endpoint mapping           DETERMINISTIC
target endpoint mapping           STRONG
----------------------------------------------
effective architecture observation STRONG
```

Agent-proposed mappings (`INFERRED / PROPOSED`) must not be used as authoritative facts for blocking or definitive compliance claims.

V1 has no blocking behavior regardless, but this trust boundary must still be preserved.

---

# 21. Alignment semantics

V1 reports architecture alignment rather than a boolean compliant/non-compliant result.

Comparison categories:

```text
MATCHED
MISSING
UNEXPECTED
CONTRADICTORY
UNRESOLVED
UNMAPPED
```

Mapping discovery additionally produces:

```text
PROPOSED
```

## 21.1 MATCHED

Declared architecture expectation is supported by observed implementation evidence.

## 21.2 MISSING

A declared architecture Element/Flow has no supporting implementation evidence after the relevant scope was successfully analyzed.

Wording must remain evidence-aware, for example:

> No supporting implementation evidence was found.

rather than asserting absence that static analysis cannot prove.

## 21.3 UNEXPECTED

Observed architecture-significant implementation Element/Flow is not represented by declared architecture.

The finding is neutral about root cause. Architecture, mapping, implementation, or discovery may require correction.

## 21.4 CONTRADICTORY

Observed/declared evidence clearly establishes a direction/state contrary to a declared architecture expectation.

## 21.5 UNRESOLVED

A declared LOCAL mapping cannot currently be resolved in the implementation workspace.

## 21.6 UNMAPPED

Discovery found architecture-significant implementation for which no accepted declared mapping exists.

## 21.7 PROPOSED

Discovery suggests a candidate mapping but it has not been approved.

Rejected proposals are not compliance findings. They remain negative mapping knowledge while the discovered implementation may continue to appear as UNMAPPED.

---

# 22. Alignment precision

Alignment finding precision remains separate from category:

```text
DETERMINISTIC
STRONG
INFERRED
```

Examples:

```text
UNEXPECTED + DETERMINISTIC
UNEXPECTED + STRONG
UNEXPECTED + INFERRED
```

These communicate very different levels of evidence authority without introducing numeric scores.

---

# 23. Delta semantics across Git revisions

Initial SDLC adoption should emphasize changes in alignment rather than total conformance.

Given a base revision and a candidate/PR revision, finding lifecycle is derived as:

```text
NEW
UNCHANGED
CHANGED
RESOLVED
```

Conceptually:

```text
absent  -> present  = NEW
present -> present  = UNCHANGED
present -> modified = CHANGED
present -> absent   = RESOLVED
```

This supports architecture-ahead transitions without requiring all existing gaps to be corrected by every PR.

---

# 24. V1 enforcement policy

V1 is explicitly **REPORT ONLY**.

It must not:

- block a pull request;
- fail a merge because of architectural alignment;
- produce a pass/fail architecture score;
- produce a compliance percentage;
- automatically assign Critical/High/Medium/Low severity;
- automatically change architecture, mapping, or implementation.

The initial objective is architecture visibility, mapping maturity, discovery calibration, and team-managed architectural debt.

Typical report summary:

```text
Architecture Alignment

Matched
Missing
Unexpected
Contradictory
Unresolved mappings
Unmapped observations
Proposed mappings

Delta from base:
New
Resolved
Changed
Unchanged
```

All counts must be computed from actual analysis results; this specification does not prescribe thresholds.

---

# 25. Initial SDLC behavior

## 25.1 Local/on-demand

Developers can run alignment analysis and inspect evidence, unresolved mapping, and proposed mappings.

## 25.2 Pull request

Produce an informational architecture alignment result emphasizing delta from the PR base.

Existing issues may remain visible without blocking delivery.

## 25.3 Main branch

Produce a current-state architecture alignment snapshot suitable for team review and architectural debt tracking.

Governance remains a team activity rather than an automated merge gate in V1.

---

# 26. Example mapping document

The syntax below is illustrative. A formal schema is intentionally deferred until semantics are accepted.

```yaml
mappingVersion: 1

architecture:
  model: trade-modernization
  revision: <immutable-architecture-reference>

workspace:
  type: GIT_WORKTREE

mappings:
  - element: trade.ingestion.lambda
    implementation:
      scope: LOCAL
      selectors:
        - type: SOURCE
          module: ingestion
          package: com.example.trade.ingestion
          entryPoint: com.example.trade.ingestion.IngestionHandler

        - type: IAC
          module: terraform/modules/ingestion
          resource: aws_lambda_function.ingestion

  - element: trade.normalization.spark-job
    implementation:
      scope: LOCAL
      selectors:
        - type: SOURCE
          module: normalization
          entryPoint: com.example.trade.normalization.NormalizationJob

        - type: IAC
          module: terraform/modules/normalization

  - element: external.customer-master
    implementation:
      scope: EXTERNAL
      reference:
        description: External Customer Master implementation

rejections:
  - element: trade.matching.match-processor
    implementation:
      scope: LOCAL
      selector:
        type: SOURCE
        entryPoint: com.example.trade.match.MatchHandler
    reason: >
      MatchHandler is not the implementation of MatchProcessor.
      MatchProcessor is not yet implemented.
```

---

# 27. AI interpretation requirements

An AI using this mapping specification must:

1. Treat declared mapping as authoritative intent.
2. Never infer architecture parentage from implementation structure.
3. Prefer Node mapping; use Service mapping only when applicable Node decomposition is absent.
4. Treat LOCAL selectors as discovery anchors/boundaries, not exhaustive ownership declarations.
5. Treat EXTERNAL implementation as outside local discovery responsibility.
6. Allow valid LOCAL selectors to remain UNRESOLVED when architecture is ahead of implementation.
7. Never convert INFERRED/PROPOSED mapping into RESOLVED without approval represented by a declared mapping change.
8. Consult rejections before proposing a mapping.
9. Suppress only the rejected Element-selector pair, not either side globally.
10. Report ambiguity instead of guessing between overlapping mappings.
11. Prefer specific anchors over broader scopes.
12. Never require every source file or Terraform resource to have an architecture mapping.
13. Preserve evidence for observed behavior and mapping resolution.
14. Never use a proposed mapping as though it were an accepted architecture fact.
15. Treat mapping precision and resolution state as independent dimensions.
16. Keep V1 report-only and non-blocking.

---

# 28. V1 rule catalogue

### Mapping targets

- `MAP-001` Direct mapping targets Node, or Service only when applicable Node decomposition is absent.
- `MAP-002` Every implementation mapping is LOCAL or EXTERNAL.

### Selectors

- `MAP-003` LOCAL mappings use selectors rather than exhaustive artifact inventories.
- `MAP-004` IaC selectors prefer logical module/resource identity over filename/line number.
- `MAP-005` Selector scope is a discovery boundary, not automatic exclusive ownership.

### Precision and resolution

- `MAP-006` Precision is limited to DETERMINISTIC, STRONG and INFERRED.
- `MAP-007` Agent inference cannot silently become authoritative mapping or RESOLVED state.

## Negative knowledge

- `MAP-008` Rejected Element-selector pairings must not be re-proposed while the rejection remains in force.

## Ambiguity and external mapping

- `MAP-009` Ambiguous overlapping scopes are reported rather than guessed.
- `MAP-010` EXTERNAL implementation references do not require local resolution.

## Discovery/evidence

- `MAP-011` Discovery treats mapping as intent and emits observed facts/proposals separately.
- `MAP-012` Observed architecture claims retain evidence connecting implementation observations through mapping to architecture Elements.

---

# 29. Explicitly deferred topics

Outside V1:

- generalized remote/multi-repository discovery;
- numeric confidence scores;
- automatic mapping approval;
- automatic rejection expiry;
- mandatory mapping of every implementation artifact;
- per-finding severity levels;
- compliance percentages/scores;
- merge blocking;
- automated architecture/code remediation;
- frozen YAML/JSON schema;
- detailed implementation analyzer design.

---

# 30. Summary

The mapping specification creates a controlled bridge between architecture intent and implementation discovery:

```text
Architecture revision
        |
        v
Declared Mapping
        |
        +-- LOCAL selectors -> discoverable implementation
        |
        +-- EXTERNAL reference -> known but opaque implementation
        |
        v
Observed Implementation
        |
        v
Alignment Report
```

The key trust boundary is explicit:

```text
accepted mapping      = authoritative intent
rejected mapping      = authoritative negative knowledge
discovery observation = evidence
agent proposal        = INFERRED / PROPOSED, never automatically authoritative
```

Architecture may lead implementation, mappings may point to future local targets, and V1 reports alignment/delta without blocking the SDLC.
