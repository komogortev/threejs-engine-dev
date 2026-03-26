import { bindResolvePublicUrl, type SceneBuildOptions } from '@base/scene-builder'
import { getAppBaseUrl } from '@/utils/resolvePublicUrl'

/** Asset URLs in descriptors are site-root paths; bind them to the deployed app base. */
export function createSceneBuildOptions(): SceneBuildOptions {
  return { resolvePublicUrl: bindResolvePublicUrl(getAppBaseUrl()) }
}
