# Architecture Metamodel

**Status:** V1 candidate
**Scope:** Architecture definition and architecture-model validation. Implementation mapping and implementation compliance are intentionally deferred.

# 1. Purpose

This specification defines a compact architecture metamodel that is readable by humans and AI tooling and suitable for deterministic validation. It extends the general C4 hierarchy with explicit ownership, Workflow/Tier grouping, atomic Services, and technology-specific Nodes.

The model deliberately minimizes authored concepts:

- Elements form a strict hierarchy through `parent`.
- Peer Elements interact through directed `Flow` relationships.
- Richer semantics are derived from Element types, Flow direction, hierarchy, and Node technology.
- Lower-level detail may refine higher-level architecture but is never inferred downward.

# 2. Core design principles

1. **Small authored model.** Prefer deterministic rules over many specialized relationship types.
2. **Hierarchy and interaction are orthogonal.** `parent` answers what an Element belongs to; `Flow` describes architecturally significant movement between peers.
3. **Containment never implies interaction.** Elements with the same parent have no implicit Flow.
4. **Flows remain at one abstraction level.** Cross-level Flow is prohibited.
5. **Project upward, never invent downward.** Lower-level Flow may derive higher-level Flow; higher-level Flow never invents child Flow.
6. **Missing detail is not contradictory detail.** Omitted refinement may be advisory; contradictory refinement is an error.
7. **Technology begins at Node.** Higher levels remain logical.
8. **A Node is not necessarily software.** Some Nodes execute code; others are infrastructure.
9. **Node topology is intentionally partial.** V1 models hierarchy plus architecturally significant data, information, event, or control Flow. It does not model every infrastructure/configuration relationship.
10. **Documentation is contextual metadata.** It enriches architecture without determining topology.
11. **Contracts are optional and deferred.** A future Contract may enrich Flow without changing the V1 topology model.

# 3. Abstraction hierarchy

```text
L1  Organization
        |
L2  Software System
        |
L3  Capability Group
       /   \
  Workflow  Tier
        |
L4  Service
        |
L5  Node
```

`Capability Group` is abstract. Concrete L3 Elements are `Workflow` or `Tier`.

## 3.1 Organization

An Organization represents ownership. It may be a team, business unit, or other organizational scope. Multiple Organizations may occur in one model so external dependencies remain visible.

Organizations have no architectural parent in V1 and do not participate in runtime Flow.

Compliance scope is not intrinsic to an Organization. It is input to a validation/compliance run so the same model can be evaluated from different ownership perspectives.

## 3.2 Software System

A Software System is an operational grouping containing a coherent body of functionality. It is logical and is not tied to one deployment technology.

## 3.3 Workflow

A Workflow groups Services that collaborate through an explicit directed graph to deliver a functional outcome. It may express synchronous processing, asynchronous processing, batch/data processing, orchestration, choreography, branching, convergence, retries, recovery, and cycles.

`Pipeline` is not a distinct metamodel type. A pipeline is modeled as a Workflow.

## 3.4 Tier

A Tier groups reusable or cross-cutting Services around a shared architectural concern, such as Control or Data. Tier membership does not imply Flow or execution ordering between its Services.

```text
Workflow = grouping + meaningful internal Flow graph
Tier     = grouping without internal connectivity requirement
```

## 3.5 Service

A Service is a logical, atomic, single-concern capability. It is technology-independent and may be realized by one or more Nodes.

## 3.6 Node

A Node is a technology-specific architecture Element representing something that executes, stores, transports, orchestrates, networks, secures, observes, or otherwise supports implementation.

Examples include Lambda, Spark job, Step Functions, S3, SNS, SQS, database, VPC, KMS key, and observability infrastructure.

A Node may be executable but does not inherently require source code.

# 4. Identity and references

Identity is part of the architecture contract. Names are descriptive; IDs are stable machine-facing keys.

**ID-001: Mandatory unique Element ID**
Every Element must have an ID unique within the architecture model.

**ID-002: Stable identity**
Changing an Element's display `name` must not require changing its ID.

**ID-003: References use IDs**
`parent`, `Flow.from`, and `Flow.to` reference Element IDs, never display names.

**REF-001: Parent resolves**
Every `parent` reference must resolve to an existing Element.

**REF-002: Flow endpoints resolve**
Every `Flow.from` and `Flow.to` must resolve to existing Elements.

**REF-003: Technology resolves**
Every Node `technology` must resolve to a known Technology definition.

## 4.1 Flow identity

A Flow ID is optional in V1. Without an explicit ID, the ordered pair `(from,to)` uniquely identifies a Flow and duplicate declarations are invalid.

An optional stable Flow ID is reserved for cases where future versions need multiple contracts or purposes between the same endpoints.

# 5. Structural hierarchy: `parent`

The only authored structural relationship is `parent`. Semantics such as ownership and containment are derived from the Element types.

## 5.1 Allowed parent relationships

```text
Organization
    +-- Software System

Software System
    +-- Workflow
    +-- Tier
    +-- Node

Workflow
    +-- Service

Tier
    +-- Service

Service
    +-- Node
```

A Node parented directly by Software System represents architecture-significant shared/system infrastructure that does not naturally belong to a specific Service.

## 5.2 Hierarchy rules

**HIER-001: Single parent**
Every non-Organization Element has exactly one parent. Organization Elements have no parent.

**HIER-002: Legal parent type**
The parent-child pair must match the allowed hierarchy.

**HIER-003: Parenthood does not imply Flow**
Containment or ownership never creates an interaction.

**HIER-004: Acyclic hierarchy**
Parent relationships must form an acyclic hierarchy.

# 6. Flow

```text
A ----------> B
```

> A Flow is a directed relationship representing architecturally significant transfer of data, information, events, or control from one Element to another.

Flow represents the principal architectural direction, not every runtime packet. A synchronous response does not automatically require a reverse Flow. Reverse Flow is modeled when the target independently initiates an architecturally significant interaction back toward the source.

## 6.1 Flow rules

**FLOW-001: Same abstraction level**
`level(from) == level(to)` is mandatory. Workflow and Tier are peers at L3.

Valid:

```text
Software System A -> Software System B
Workflow A        -> Tier B
Service A         -> Service B
Node A            -> Node B
```

Invalid:

```text
Tier A    -> Service B
Service A -> Node B
Node A    -> Service B
```

**FLOW-009: No explicit self-Flow**
`from` and `to` must be different Elements. Self-Flows created only by upward projection are discarded.

**FLOW-010: Organization excluded from Flow**
Organization cannot be a Flow endpoint. Upward projection terminates at Software System.

## 6.2 Direction and derived meaning

Flow direction reflects principal architectural movement. Richer verbs can be derived rather than authored.

```text
Lambda -> S3                write-like
S3 -> Lambda                read/input-like
Lambda -> SNS               publish/produce-like
SQS -> Lambda               delivery/consume/trigger-like
Step Function -> Lambda     control/invocation-like
```

## 6.3 What is not Flow

Generic configuration, placement, security, or dependency relationships are not automatically Flow.

Examples that must not be forced into Flow merely to capture association:

```text
Lambda -> VPC
Lambda -> IAM Role
S3 -> KMS Key
```

V1 does not attempt to represent every infrastructure relationship.

# 7. Flow projection, refinement, and consistency

## 7.1 Upward projection

Lower-level Flow can be deterministically projected to parent levels.

```text
L5   Node A1      -> Node B1
       |              |
L4   Service A    -> Service B
       |              |
L3   Workflow A   -> Tier B
       |              |
L2   System A     -> System B
```

Projection stops at Software System. If both endpoints project to the same parent, the resulting self-Flow is omitted.

**FLOW-002: Upward projection is deterministic.**

## 7.2 No downward inference

```text
Service A -> Service B
```

never allows the validator to invent:

```text
Node A1 -> Node B1
```

**FLOW-003: Higher-level Flow never infers lower-level Flow.**

## 7.3 Downward refinement uses directed paths

A higher-level Flow may be checked for supporting lower-level detail without inventing that detail.

For declared:

```text
A -> B
```

let `descendants(A)` and `descendants(B)` represent lower-level Elements beneath each endpoint. Where the model has suitable lower-level decomposition, the validator searches for an explicitly declared directed Flow path from a descendant of A toward a descendant of B.

The path may traverse architecture-significant intermediary Nodes, including Nodes parented directly by the Software System.

Example:

```text
Service A -> Service B

A/Lambda -> SNS -> SQS -> B/Lambda
```

This is a valid lower-level refinement even though there is no direct A-child -> B-child edge.

**FLOW-004: Missing downward refinement is advisory, not structural error.**

Raise `UNREFINED_FLOW` only when the applicable validation scope/policy expects refinement, suitable lower-level decomposition exists, and no supporting directed path is modeled. The advisory must not claim that implementation is missing; indirect orchestration or deliberately omitted physical detail may explain the absence.

## 7.4 Contradictory direction

Declared:

```text
Service A -> Service B
```

with a lower-level directed path only in the reverse direction:

```text
B/... -> ... -> A/...
```

projects upward as `Service B -> Service A` and contradicts the declaration.

**FLOW-005: Contradictory downward direction**
Report `CONTRADICTORY_FLOW_DIRECTION` as an architecture-consistency error.

## 7.5 Undeclared reverse Flow

If the lower level supports both directions but the higher level declares only one:

```text
Declared:
A -> B

Lower-level projections:
A -> B
B -> A
```

then reverse coupling is missing from the higher-level design.

**FLOW-006: Undeclared reverse Flow**
Treat as architecture-consistency error by default. Policy may later control severity, but the reverse Flow must not be silently ignored.

## 7.6 Additional Flow to another pair

A lower-level Flow that projects to a different parent pair is an additional/undeclared Flow, not a reversal of an existing pair.

**FLOW-007: Different parent pair is additional Flow.**

## 7.7 Functional scope of Flow

**FLOW-008:** Flow means architecturally significant data, information, event, or control movement. It does not mean generic configuration/dependency.

# 8. Workflow graph semantics

A Workflow graph is not separately stored. It is derived from Service-level Flows whose endpoints are Services with the same Workflow parent.

## 8.1 Rules

**WF-001: Non-empty Workflow**
A Workflow contains at least one Service.

**WF-002: Single-Service Workflow is valid**
No internal Flow is required when there is exactly one Service.

**WF-003: Service participation**
In a multi-Service Workflow every Service participates in at least one internal Flow.

**WF-004: Weak connectivity**
Ignoring direction, the internal Service graph forms one connected component.

Invalid:

```text
A -> B

C -> D
```

**WF-005: Cycles are allowed**
Workflow is a directed graph, not necessarily a DAG.

**WF-006: Multiple entry and exit points are allowed.**

**WF-007: External Flow does not establish internal connectivity.**

**WF-008: Membership comes only from `parent`.**

**WF-009: Entry/exit characteristics are derived rather than mandatory properties.**

## 8.2 Multiple entry points

```text
Workflow A                       Workflow C
A3 ----------------------------> C1
                                  |
                                  v
                                 C3 -> C4
                                  ^
                                  |
B2 ----------------------------> C2
Workflow B
```

Workflow C's internal graph is:

```text
C1 -> C3 -> C4
C2 -> C3
```

`C1` and `C2` are both valid entry points. The external Service Flows project to:

```text
Workflow A -> Workflow C
Workflow B -> Workflow C
```

## 8.3 Orchestration and choreography

Both are valid. V1 does not require an `executionModel` property. Orchestration/choreography metadata should be introduced only when it enables an explicit architecture constraint.

An important consequence is that a logical Service Flow does not always require a direct Node-to-Node edge. Physical realization may use intermediary messaging or orchestration, which is why downward refinement is path-based and advisory when absent.

# 9. Tier semantics

A Tier groups reusable or cross-cutting Services but imposes no internal graph.

**TIER-001:** Tier members are not required to Flow to one another.

**TIER-002:** Tier membership does not imply execution ordering.

A Tier Service can Flow to peer-level Services elsewhere. That Service Flow may project upward to a Tier-to-Workflow or Tier-to-Tier Flow.

# 10. Node kinds

V1 defines seven cloud/vendor-neutral kinds:

```text
COMPUTE
STORAGE
MESSAGING
ORCHESTRATION
NETWORK
SECURITY
OBSERVABILITY
```

## 10.1 COMPUTE

Executes application or processing logic. Examples: Lambda, Spark job, container workload, Kubernetes workload, Java process.

## 10.2 STORAGE

Persists architecture-significant data. Examples: S3, relational database, DynamoDB, Delta table, file/object store.

## 10.3 MESSAGING

Transports, buffers, distributes, or mediates events/information. Examples: SNS, SQS, Kafka topic/event stream.

## 10.4 ORCHESTRATION

Controls progression or execution. Examples: Step Functions, workflow engine, architecture-significant scheduler/orchestrator.

## 10.5 NETWORK

Provides architecture-significant networking, routing, exposure, or network boundaries. Examples: VPC, subnet, load balancer, API gateway, private endpoint, NAT gateway.

## 10.6 SECURITY

Provides architecture-significant security infrastructure. Examples: KMS key, explicitly modeled IAM construct, secret, certificate, WAF-like resource.

## 10.7 OBSERVABILITY

Provides logging, metrics, tracing, monitoring, or telemetry capability.

# 11. Node technology and characteristics

Node kind and concrete Technology are separate.

```text
AWS_LAMBDA -> COMPUTE
AWS_S3     -> STORAGE
AWS_SNS    -> MESSAGING
```

## 11.1 Technology registry

Intrinsic technology characteristics are defined once in a Technology registry.

```yaml
AWS_LAMBDA:
  kind: COMPUTE
  executable: true

AWS_S3:
  kind: STORAGE
  executable: false
```

`stateful` is intentionally not required in V1. Node kind already captures the architectural role needed for the first cut, and statefulness becomes ambiguous for technologies such as queues, workflow engines, and streams.

## 11.2 Node instance

Deployment-specific metadata belongs to the Node instance rather than to Technology.

```yaml
- id: experience-validator
  type: node
  parent: validation-service
  technology: AWS_LAMBDA
  provisioning: IAC
```

## 11.3 `executable`

`executable` is an intrinsic Technology characteristic indicating that executable implementation evidence may later be expected. It does not encode a source path and does not itself map architecture to source code.

## 11.4 `provisioning`

`provisioning` is Node-specific because the same technology may be provisioned differently in different architectures.

Initial values:

```text
IAC        expected to be provisioned through Infrastructure as Code
EXTERNAL   supplied/owned outside the modeled implementation
RUNTIME    deliberately created dynamically at runtime
```

Exact implementation evidence is deferred to the mapping/compliance specification.

## 11.5 Deliberately excluded from V1

V1 does not store:

```text
hasCode
sourcePath
terraformResource
canRead
canWrite
canTrigger
canProduce
canConsume
```

Those either belong to implementation mapping or would unnecessarily reproduce vendor integration matrices inside the core metamodel.

# 12. Node Flow semantics

The same Flow primitive applies at Node level.

V1 intentionally models **partial Node topology**. Only hierarchy and architecturally significant functional/data/event/control Flow are expressed. Placement, encryption, IAM, deployment association, and similar configuration relationships are outside the V1 Flow model.

Common meaningful paths include:

```text
COMPUTE        -> STORAGE
STORAGE        -> COMPUTE
COMPUTE        -> MESSAGING
MESSAGING      -> COMPUTE
MESSAGING      -> MESSAGING
ORCHESTRATION  -> COMPUTE
COMPUTE        -> OBSERVABILITY
```

Kind-level rules may check conceptual validity. Technology-specific compatibility belongs to the Technology registry or later implementation-validation layer.

# 13. Descriptions and documentation

Elements and Flows may contain:

```text
description?
documentation[]?
```

`description` provides concise local context. `documentation` contains references to human-readable supplementary material such as wiki pages, design documents, ADRs, or runbooks.

```yaml
description: >
  Normalizes incoming Trade Experiences into the canonical representation.
documentation:
  - uri: <wiki-or-document-reference>
    title: Experience Normalization Design
```

Documentation is optional in V1 and does not determine architecture topology or conformance.

# 14. Future Contract support

A Flow may later reference a machine-verifiable Contract:

```yaml
flows:
  - from: normalizer-service
    to: publication-service
    contract:
      ref: normalized-trade-experience-v3
```

Potential Contracts include OpenAPI, JSON Schema, Avro, Protobuf, event schemas, dataset/table schemas, and file layouts.

```text
documentation = human-oriented explanatory material
contract      = potentially machine-verifiable specification
```

Contract validation is outside V1.

# 15. Ownership scope and external dependencies

The model may contain multiple Organizations. Organizations do not form an architecture parent hierarchy in V1.

The active compliance scope is supplied to a validation/compliance run or policy, not stored as an immutable Organization property.

Elements owned by Organizations outside the active scope may legitimately stop decomposition at any level appropriate to the known external architecture. Their presence captures dependency context, not an obligation to model systems outside the owner's control in detail.

Completeness checks, including refinement advisories, must respect ownership scope and validation policy.

# 16. Validation categories

## 16.1 Metamodel validity

Hard failures where the model itself is malformed or violates invariant structural rules.

Examples:

- duplicate/missing IDs;
- unresolved references;
- illegal parent type;
- cyclic parent hierarchy;
- cross-level Flow;
- explicit self-Flow;
- Organization used as a Flow endpoint;
- invalid multi-Service Workflow connectivity.

## 16.2 Architecture consistency

Failures where separately authored abstraction levels contradict one another.

Examples:

- A -> B declared above while only B-descendant -> A-descendant path exists below;
- undeclared reverse Flow exposes bidirectional coupling omitted at the higher level.

Severity can later be made policy-driven, but such conditions must never be silently accepted.

## 16.3 Architecture completeness

Advisory conditions where the model is valid but could contain more detail.

Example: A -> B is declared, suitable lower-level decomposition exists, but no supporting lower-level directed path is modeled and the active policy expects refinement.

## 16.4 V1 result classes

```text
ERROR      malformed model or contradictory architectural definition
ADVISORY   valid model that may benefit from additional refinement
```

Implementation-compliance classifications are deferred.

# 17. Usage guidance

## 17.1 Model the highest useful abstraction first

Start with Organization and Software System, then decompose only as far as meaningful design decisions exist.

## 17.2 Use Workflow for a coherent functional graph

Use Workflow when Services collaborate as one meaningful processing graph. Branches, convergence, cycles, multiple entries, and multiple exits are valid.

## 17.3 Use Tier for cross-cutting/reusable grouping

Use Tier when Services share an architectural concern but do not form one internal processing graph.

## 17.4 Model Services around logical responsibility

Do not create one Service per infrastructure resource. A Service is logical and may be realized by several Nodes.

## 17.5 Model only architecture-significant Nodes

Not every Terraform resource deserves a Node. Include resources where technology, existence, topology, ownership, or Flow is an architecture-significant decision.

## 17.6 Prefer peer-level Flow

Do not express `Tier -> Service`. Model the relevant peer-level relationship, for example `Control Service -> Processing Service`, and allow upward projection to derive `Control Tier -> Processing Workflow`.

## 17.7 Add physical detail only when it matters

A Service Flow is valid without Node refinement. Node detail is useful where the physical mechanism is an architecture decision or should later be enforceable.

## 17.8 Avoid unnecessarily duplicating derived Flow

Tooling should distinguish declared from derived Flow. A higher-level declaration captures architectural intent; lower-level Flow provides refinement/evidence. Derived information need not be redundantly authored merely for visualization.

# 18. Worked example

```text
Organization: Global Trade
|
+-- Software System: Trade Processing
    |
    +-- Workflow: Experience Processing
    |   |
    |   +-- Service: Ingestion
    |   |   +-- Node: Ingestion Lambda [COMPUTE]
    |   |
    |   +-- Service: Normalization
    |   |   +-- Node: Normalization Spark Job [COMPUTE]
    |   |
    |   +-- Service: Publication
    |       +-- Node: Publisher Lambda [COMPUTE]
    |
    +-- Tier: Data
    |   +-- Service: Curated Data
    |       +-- Node: Curated Bucket [STORAGE]
    |
    +-- Node: Published Topic [MESSAGING]
    +-- Node: Delivery Queue [MESSAGING]
    +-- Node: Shared KMS Key [SECURITY]
```

Service Flow: 

```text
Ingestion -> Normalization -> Publication
Normalization -> Curated Data
```

Possible Node refinement:

```text
Ingestion Lambda -> Normalization Spark Job
Normalization Spark Job -> Curated Bucket
Normalization Spark Job -> Publisher Lambda
Publisher Lambda -> Published Topic -> Delivery Queue
```

Shared system infrastructure can therefore participate in a lower-level directed refinement path without being artificially parented to one Service. Security configuration involving the KMS key is not forced into functional Flow.

# 19. Minimal conceptual serialization

This is illustrative rather than a frozen serialization schema.

```yaml
modelVersion: 1

elements:
  - id: global-trade
    name: Global Trade
    type: organization

  - id: trade-processing
    name: Trade Processing
    type: software-system
    parent: global-trade

  - id: experience-processing
    name: Experience Processing
    type: workflow
    parent: trade-processing

  - id: ingestion
    name: Ingestion
    type: service
    parent: experience-processing

  - id: normalization
    name: Normalization
    type: service
    parent: experience-processing

  - id: ingestion-lambda
    name: Ingestion Lambda
    type: node
    parent: ingestion
    technology: AWS_LAMBDA
    provisioning: IAC

  - id: normalization-job
    name: Normalization Spark Job
    type: node
    parent: normalization
    technology: SPARK_JOB
    provisioning: IAC

flows:
  - from: ingestion
    to: normalization

  - from: ingestion-lambda
    to: normalization-job
```

# 20. AI interpretation requirements

An AI consuming this model must:

1. Never invent architecture to fill missing detail.
2. Treat IDs, not display names, as identity.
3. Resolve every reference before reasoning over it.
4. Use `parent` as the only source of hierarchy membership.
5. Reject cross-level Flow.
6. Exclude Organization from Flow and stop projection at Software System.
7. Project Flow upward only.
8. Support lower-level directed **paths**, not only direct edges, when checking refinement.
9. Never manufacture a lower-level path from a higher-level declaration.
10. Distinguish missing refinement from contradictory direction.
11. Never infer interaction from common parentage.
12. Permit cycles and multiple entry/exit points in Workflow.
13. Apply Workflow connectivity rules only to Workflow, never Tier.
14. Never assume every Node has source code.
15. Never treat every infrastructure association as Flow.
16. Respect validation ownership scope when assessing completeness.
17. Treat descriptions/documentation as context rather than structural truth.
18. Treat Contract as optional/future in V1.

# 21. V1 rule catalogue

## Identity and references

- `ID-001` Element IDs are mandatory and unique.
- `ID-002` Element IDs are stable independently of display names.
- `ID-003` Parent and Flow references use IDs.
- `REF-001` Parent references resolve.
- `REF-002` Flow endpoints resolve.
- `REF-003` Technology references resolve.

## Hierarchy

- `HIER-001` Every non-Organization Element has exactly one parent; Organizations have none.
- `HIER-002` Parent-child type combinations must be legal.
- `HIER-003` Parentage never implies Flow.
- `HIER-004` Parent hierarchy is acyclic.

## Flow

- `FLOW-001` Flow endpoints are peers at the same abstraction level.
- `FLOW-002` Lower-level Flow projects upward deterministically.
- `FLOW-003` Higher-level Flow never infers lower-level Flow.
- `FLOW-004` Missing lower-level directed-path refinement is advisory only when expected by scope/policy.
- `FLOW-005` Opposite lower-level directed-path refinement is a contradiction.
- `FLOW-006` Undeclared reverse Flow is an architecture-consistency error by default.
- `FLOW-007` Flow projecting to another parent pair is an additional/undeclared Flow, not a reversal.
- `FLOW-008` Flow represents architecturally significant data, information, event, or control movement, not generic configuration/dependency.
- `FLOW-009` Explicit self-Flow is prohibited.
- `FLOW-010` Organization cannot participate in Flow; projection stops at Software System.

## Workflow

- `WF-001` Workflow contains at least one Service.
- `WF-002` Single-Service Workflow is valid without internal Flow.
- `WF-003` Every Service in a multi-Service Workflow participates in at least one internal Flow.
- `WF-004` Internal Workflow graph is weakly connected.
- `WF-005` Cycles are permitted.
- `WF-006` Multiple entry and exit points are permitted.
- `WF-007` External Flow does not establish internal Workflow connectivity.
- `WF-008` Workflow membership is determined only by parentage.
- `WF-009` Entry/exit characteristics are derived, not mandatory authored properties.

## Tier

- `TIER-001` Tier members are not required to Flow to one another.
- `TIER-002` Tier membership does not imply execution ordering.

## Node

- `NODE-001` Node technology resolves to one Node kind.
- `NODE-002` Intrinsic Technology characteristics such as `executable` are reusable; `provisioning` belongs to the Node instance.
- `NODE-003` A Node does not inherently require source code.
- `NODE-004` Infrastructure/configuration association is not Flow unless architecturally significant data, information, event, or control actually moves in that direction.

# 22. Explicitly deferred topics

The following are outside V1:

- source-code mapping;
- repository/module/package mapping;
- Terraform resource mapping; [architecture-mapping-specification.md](architecture-mapping-specification.md)
- observed architecture extraction;
- architecture-to-implementation compliance;
- implementation evidence/confidence;
- automated remediation;
- Contract/schema compatibility validation;
- runtime/deployed-environment validation;
- vendor-specific Flow compatibility matrices;
- complete networking/IAM/encryption relationship modeling;
- frozen JSON/YAML schema for serialization.

One issue remains intentionally open for testing against real designs: whether system-level ownership is sufficient for Nodes that implement Workflow-wide orchestration, or whether a future ownership construct is required. V1 does not relax hierarchy for this case; architects should model a Service when an orchestration capability is itself a logical concern, otherwise keep genuinely shared infrastructure at Software System level.

# 23. Summary

V1 is centered on two authored relationship concepts:

```text
VERTICAL:   parent
HORIZONTAL: Flow
```

and five abstraction levels:

```text
Organization
Software System
Workflow / Tier
Service
Node
```

The model provides stable identity, strict hierarchy, peer-level directional Flow, upward projection, path-based downward refinement checks, explicit distinction between Workflow and Tier, technology-specific Nodes, external ownership scope, documentation metadata, and deterministic validity/consistency/completeness rules.

This specification defines the architecture side of the contract. Implementation mapping for Java, Scala/Spark, build modules, and Terraform should be defined as a separate specification layered on top of this metamodel.
