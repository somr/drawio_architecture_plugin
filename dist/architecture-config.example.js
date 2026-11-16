// Architecture configuration for the DrawIO Architecture Properties Plugin
// (docs/specs.md §19). Defines the Technology registry of the Architecture
// Metamodel (docs/architecture-metamodel.md §11.1).
//
// Install it like a plugin: DrawIO → Extras → Plugins → Add → select this
// file → restart DrawIO. DrawIO copies it into its plugins folder, next to
// properties-plugin.js:
//   Linux:   ~/.config/draw.io/plugins/
//   Windows: %APPDATA%\draw.io\plugins\
// To change the registry, edit that copy and restart DrawIO.
//
// Rules:
//   name, version  non-empty strings; the export records them as
//                  technologyRegistry: {name, version}. Bump the version on
//                  every change.
//   technologies   KEY: { kind, executable }
//     KEY          upper case letters, digits and "_", starting with a letter
//     kind         COMPUTE | STORAGE | MESSAGING | ORCHESTRATION | NETWORK |
//                  SECURITY | OBSERVABILITY
//     executable   true when executable implementation may later be expected
// Invalid entries are skipped with a warning in the DevTools console.

window.ArchitectureConfig = {
  name: 'example-aws',
  version: '1',
  technologies: {
    AWS_LAMBDA:               { kind: 'COMPUTE',       executable: true  },
    SPARK_JOB:                { kind: 'COMPUTE',       executable: true  },
    AWS_S3:                   { kind: 'STORAGE',       executable: false },
    AWS_SNS:                  { kind: 'MESSAGING',     executable: false },
    AWS_SQS:                  { kind: 'MESSAGING',     executable: false },
    AWS_KMS:                  { kind: 'SECURITY',      executable: false },
    AWS_CLOUDWATCH_LOG_GROUP: { kind: 'OBSERVABILITY', executable: false },
  },
};
