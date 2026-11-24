import type { Model } from './types';

/**
 * 聊天页模型选择器顶部的固定推荐位。
 *
 * 只在这里维护推荐顺序与定位文案；`id` 必须与站点 `/api/user/models` 返回的模型名一致。
 * 账号没有该模型时自动跳过，避免推荐出点不动的行。
 */
export type RecommendedModelPick = {
  id: string;
  tag: string;
};

export const recommendedModelPicks: RecommendedModelPick[] = [
  // 站点 OpenAI 渠道（gpt-* 全线 404 Invalid URL /v1/v1/chat/completions）修好之前，
  // 综合最强先放实测可用的 kimi-k3；修好后可换回 gpt-6-astra。
  { id: 'kimi-k3_官方', tag: '综合最强' },
  { id: 'qwen3.8-max', tag: '中文旗舰' },
  { id: 'kimi-k2.7-code', tag: '编程最强' },
  { id: 'deepseek-v4-pro-0813', tag: '深度推理' },
  { id: 'glm-5.3-flash', tag: '性价比最高' },
  { id: 'mimo-v2.6-pro-ultraspeed', tag: '响应最快' },
];

export function pickRecommendedModels(models: Model[]) {
  const byId = new Map(models.map((model) => [model.id, model]));
  return recommendedModelPicks.flatMap((pick) => {
    const model = byId.get(pick.id);
    return model ? [{ model, tag: pick.tag }] : [];
  });
}
