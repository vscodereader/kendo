import fs from 'node:fs';
import path from 'node:path';

export type UsageRecord = {
  createdAt: string;
  route: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  reasoningTokens: number;
  cachedInputTokens: number;
  estimatedUsd: number;
};

type Pricing = {
  inputPer1M: number;
  outputPer1M: number;
};

const PRICING_TABLE: Record<string, Pricing> = {
  'gpt-5.4': { inputPer1M: 2.5, outputPer1M: 15.0 },
  'gpt-5.4-mini': { inputPer1M: 0.75, outputPer1M: 4.5 },
  'gpt-5.4-nano': { inputPer1M: 0.2, outputPer1M: 1.25 },
  'gpt-5': { inputPer1M: 1.25, outputPer1M: 10.0 },
  'gpt-5-mini': { inputPer1M: 0.25, outputPer1M: 2.0 },
  'gpt-5-nano': { inputPer1M: 0.05, outputPer1M: 0.4 }
};

const usageFilePath = path.resolve(process.cwd(), 'usage-log.json');

function getPricing(model: string): Pricing {
  return PRICING_TABLE[model] ?? PRICING_TABLE['gpt-5.4-mini'];
}

export function buildUsageRecord(args: {
  route: string;
  model: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
    input_tokens_details?: { cached_tokens?: number };
    output_tokens_details?: { reasoning_tokens?: number };
  } | null;
}): UsageRecord {
  const usage = args.usage ?? {};
  const inputTokens = usage.input_tokens ?? 0;
  const outputTokens = usage.output_tokens ?? 0;
  const totalTokens = usage.total_tokens ?? inputTokens + outputTokens;
  const reasoningTokens = usage.output_tokens_details?.reasoning_tokens ?? 0;
  const cachedInputTokens = usage.input_tokens_details?.cached_tokens ?? 0;

  const pricing = getPricing(args.model);
  const estimatedUsd =
    (inputTokens / 1_000_000) * pricing.inputPer1M +
    (outputTokens / 1_000_000) * pricing.outputPer1M;

  return {
    createdAt: new Date().toISOString(),
    route: args.route,
    model: args.model,
    inputTokens,
    outputTokens,
    totalTokens,
    reasoningTokens,
    cachedInputTokens,
    estimatedUsd
  };
}

export function readUsageRecords(): UsageRecord[] {
  if (!fs.existsSync(usageFilePath)) return [];
  try {
    return JSON.parse(fs.readFileSync(usageFilePath, 'utf-8')) as UsageRecord[];
  } catch {
    return [];
  }
}

export function appendUsageRecord(record: UsageRecord) {
  const all = readUsageRecords();
  all.push(record);
  fs.writeFileSync(usageFilePath, JSON.stringify(all, null, 2), 'utf-8');
}

export function getUsageSummary() {
  const records = readUsageRecords();

  const totalInputTokens = records.reduce((sum, r) => sum + r.inputTokens, 0);
  const totalOutputTokens = records.reduce((sum, r) => sum + r.outputTokens, 0);
  const totalTokens = records.reduce((sum, r) => sum + r.totalTokens, 0);
  const totalEstimatedUsd = records.reduce((sum, r) => sum + r.estimatedUsd, 0);

  const budgetUsd = Number(process.env.OPENAI_BUDGET_USD ?? 0);
  const remainingUsd = Math.max(0, budgetUsd - totalEstimatedUsd);

  const currentModel = process.env.OPENAI_MODEL || 'gpt-5.4-mini';
  const pricing = getPricing(currentModel);

  const estimatedRemainingInputTokens =
    pricing.inputPer1M > 0 ? Math.floor((remainingUsd / pricing.inputPer1M) * 1_000_000) : 0;

  const estimatedRemainingOutputTokens =
    pricing.outputPer1M > 0 ? Math.floor((remainingUsd / pricing.outputPer1M) * 1_000_000) : 0;

  const avgCostPerToken = totalTokens > 0 ? totalEstimatedUsd / totalTokens : 0;

  const estimatedRemainingMixedTokens =
    avgCostPerToken > 0 ? Math.floor(remainingUsd / avgCostPerToken) : 0;

  return {
    budgetUsd,
    remainingUsd,
    totalInputTokens,
    totalOutputTokens,
    totalTokens,
    totalEstimatedUsd,
    currentModel,
    estimatedRemainingInputTokens,
    estimatedRemainingOutputTokens,
    estimatedRemainingMixedTokens,
    recentRuns: records.slice(-20).reverse()
  };
}