/**
 * Mixamo animation FBX files under `public/fbx/`. Each URL is encoded for fetch.
 * Clip names are derived from these stems in {@link SceneBuilder.labelClipsFromSourceUrl}.
 *
 * **With skin vs without:** “Without skin” is fine if the FBX still contains a skinned rig
 * (Mixamo often does). If retarget fails, download the same animation **with skin** so
 * Three.js has a `SkinnedMesh` source for `SkeletonUtils.retargetClip`.
 */
const FBX_NAMES = [
  'Crouch To Stand.fbx',
  'Crouched Sneaking Left (1).fbx',
  'Crouched Sneaking Left.fbx',
  'Crouched Sneaking Right (1).fbx',
  'Crouched Sneaking Right.fbx',
  'Crouched To Standing.fbx',
  'Crouched Walking (1).fbx',
  'Crouched Walking.fbx',
  'Crouching Idle.fbx',
  'Idle-action-ready.fbx',
  'Left Strafe Walking.fbx',
  'Male Crouch Pose.fbx',
  'Neutral Idle.fbx',
  'Right Strafe Walking.fbx',
  'Start Walking.fbx',
  'Stop Walking.fbx',
  'Walking (1).fbx',
  'Walking Backwards (1).fbx',
  'Walking Backwards.fbx',
  'Walking Turn 180 (1).fbx',
  'Walking Turn 180.fbx',
  'Walking.fbx',
] as const

export const MIXAMO_FBX_CLIP_URLS: string[] = FBX_NAMES.map((name) =>
  encodeURI(`/fbx/${name}`),
)
