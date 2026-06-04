export const FREE_PLAN = "free";
export const PRO_PLAN = "pro";
export const FREE_PLAN_MESH_LIMIT = 1;
export const FREE_PLAN_AGENT_LIMIT = 10;

export const FREE_PLAN_MESH_LIMIT_MESSAGE =
  "Free plan limited to 1 mesh. Upgrade to Pro at meshwire.io/upgrade";
export const FREE_PLAN_AGENT_LIMIT_MESSAGE =
  "Free plan limited to 10 agents per mesh. Upgrade to Pro at meshwire.io/upgrade";

export function isFreePlan(user) {
  return (user?.plan || FREE_PLAN) === FREE_PLAN;
}

export function canCreateMesh(user, currentMeshCount) {
  return !isFreePlan(user) || currentMeshCount < FREE_PLAN_MESH_LIMIT;
}

export function canRegisterAgent(user, currentAgentCount) {
  return !isFreePlan(user) || currentAgentCount < FREE_PLAN_AGENT_LIMIT;
}
