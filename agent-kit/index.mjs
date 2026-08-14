export {
  CONTRACT_ID,
  TARGET_COURSE_PROJECT_SCHEMA_VERSION,
  author,
  buildAuthoringIndex,
  defineCourseProject,
  defineScene,
  defineSurface,
  makeProjectState,
  validateCourseProject,
} from './src/semantic-sdk.mjs'
export {
  loadCapabilityCards,
  searchCapabilityCards,
} from './src/capability-index.mjs'
export {
  assembleBuildGraph,
  createBuildGraph,
  planBuildGraph,
  validateBuildGraph,
} from './src/build-graph.mjs'
export {
  RevisionConflictError,
  applyAuthoringPatch,
  makeAuthoringAddress,
  parseAuthoringAddress,
} from './src/authoring-patch.mjs'
export {
  createMicroRig,
  scaffoldWorkspace,
  validateMicroRig,
  validateWorkspace,
} from './src/workspace.mjs'
export {
  PRODUCT_COMPILER_ID,
  PRODUCT_COURSE_PROJECT_SCHEMA_VERSION,
  compileCourseProjectV9,
} from './src/product-v9-compiler.mjs'
