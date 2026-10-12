import { readFileSync } from "node:fs";
import { join } from "node:path";
import { BUNDLE } from "./tasks.mjs";

export const METRICS = ["verifiedTaskSuccess", "retries", "humanInterventions", "latencyMs", "tokens", "costUsd", "integrationFailures", "recoverySideEffects"];

export function metric(value, measured, reason, scope) {
  if (measured === true) {
    if (typeof value !== "number" || !Number.isFinite(value)) throw new Error("MEASURED_METRIC_REQUIRES_VALUE");
    return { value, measured: true, reason: reason ?? null, scope: scope ?? null };
  }
  if (value !== null) throw new Error("UNMEASURED_METRIC_REQUIRES_NULL");
  if (!reason) throw new Error("UNMEASURED_METRIC_REQUIRES_REASON");
  return { value: null, measured: false, reason, scope: scope ?? null };
}

export const unmeasured = (reason, scope) => metric(null, false, reason, scope);

function checkMetric(value, label) {
  if (!value || typeof value !== "object" || typeof value.measured !== "boolean") throw new Error(`REPORT_METRIC_MISSING: ${label}`);
  metric(value.value, value.measured, value.reason, value.scope);
}

export function loadTaxonomy(path = join(BUNDLE, "taxonomy.json")) {
  const taxonomy = JSON.parse(readFileSync(path, "utf8"));
  if (!Number.isInteger(taxonomy.version) || !taxonomy.reviewedAt || !taxonomy.reviewedBy) throw new Error("TAXONOMY_HEADER");
  if (!Array.isArray(taxonomy.categories) || taxonomy.categories.length < 8) throw new Error("TAXONOMY_CATEGORIES");
  const ids = new Set();
  for (const category of taxonomy.categories) {
    if (!category.id || ids.has(category.id)) throw new Error(`TAXONOMY_CATEGORY: ${category.id}`);
    ids.add(category.id);
    if (category.reviewed !== true || !category.evidence || !category.detection) throw new Error(`TAXONOMY_CATEGORY_REVIEW: ${category.id}`);
  }
  return taxonomy;
}

export function loadBaselines(path = join(BUNDLE, "baselines.json")) {
  const baselines = JSON.parse(readFileSync(path, "utf8"));
  if (baselines.measured !== false || baselines.overallSuperiority !== null) throw new Error("BASELINE_CLAIM");
  if (!Array.isArray(baselines.items) || baselines.items.length !== 3) throw new Error("BASELINE_ITEMS");
  for (const item of baselines.items) {
    if (item.status !== "not-run" || !item.reason) throw new Error(`BASELINE_STATUS: ${item.id}`);
  }
  if (baselines.cursorCloudOnly?.comparability !== "not-comparable") throw new Error("BASELINE_CLOUD_COMPARABILITY");
  return baselines;
}

export function validateReport(report) {
  if (!report || report.schemaVersion !== 1) throw new Error("REPORT_SCHEMA_VERSION");
  if (!report.generatedAt || Number.isNaN(Date.parse(report.generatedAt))) throw new Error("REPORT_TIMESTAMP");
  const measurement = report.measurement;
  if (!measurement || !measurement.mode || !measurement.provider || !Number.isInteger(measurement.credentialedCalls)) throw new Error("REPORT_MEASUREMENT");
  if (!Array.isArray(measurement.proves) || !measurement.proves.length) throw new Error("REPORT_MEASUREMENT_PROVES");
  if (!Number.isInteger(report.taxonomyVersion)) throw new Error("REPORT_TAXONOMY");
  if (report.baselines?.measured !== false) throw new Error("REPORT_BASELINES");
  if (!Array.isArray(report.tasks) || !report.tasks.length) throw new Error("REPORT_TASKS");
  const ids = new Set();
  for (const task of report.tasks) {
    if (!task.id || !task.kind || ids.has(task.id)) throw new Error(`REPORT_TASK: ${task.id}`);
    ids.add(task.id);
    if (typeof task.verified !== "boolean") throw new Error(`REPORT_TASK_VERIFIED: ${task.id}`);
    if (!task.verified && !task.failureCategory) throw new Error(`REPORT_TASK_FAILURE_CATEGORY: ${task.id}`);
    if (!task.verified && task.mutantCategory && task.failureCategory !== task.mutantCategory) throw new Error(`REPORT_MUTANT_CATEGORY: ${task.id} ${task.failureCategory} != ${task.mutantCategory}`);
    if (!(task.budgets?.timeSeconds > 0) || !(task.budgets?.costUsd > 0) || !(task.budgets?.tokens > 0)) throw new Error(`REPORT_TASK_BUDGET: ${task.id}`);
    if (!Array.isArray(task.successCriteria) || task.successCriteria.length < 2) throw new Error(`REPORT_TASK_CRITERIA: ${task.id}`);
    if (!Array.isArray(task.nodes) || !task.nodes.length) throw new Error(`REPORT_TASK_NODES: ${task.id}`);
    if (typeof task.contextBytes !== "number" || task.contextBytes <= 0) throw new Error(`REPORT_TASK_CONTEXT: ${task.id}`);
    for (const key of METRICS) checkMetric(task.metrics?.[key], `${task.id}.${key}`);
  }
  const aggregate = report.aggregate;
  for (const key of METRICS) checkMetric(aggregate?.[key], `aggregate.${key}`);
  if (!Number.isInteger(aggregate.sampleSize) || aggregate.sampleSize < 1) throw new Error("REPORT_SAMPLE_SIZE");
  if (aggregate.sampleSize < 5) {
    if (aggregate.interval95?.value !== null || !aggregate.interval95?.reason) throw new Error("REPORT_INTERVAL_UNSUPPORTED");
  } else if (!Array.isArray(aggregate.interval95?.value) || aggregate.interval95.value.length !== 2 || !aggregate.interval95.method) {
    throw new Error("REPORT_INTERVAL");
  }
  if (measurement.credentialedCalls === 0 && (aggregate.tokens.measured || aggregate.costUsd.measured)) throw new Error("REPORT_UNMEASURED_USAGE");
  if (report.claims?.overallSuperiority !== null || !report.claims?.reason) throw new Error("REPORT_CLAIM");
  return report;
}

export function wilson(successes, sampleSize) {
  if (sampleSize < 5) return null;
  const z = 1.959963984540054;
  const p = successes / sampleSize;
  const denom = 1 + (z * z) / sampleSize;
  const centre = (p + (z * z) / (2 * sampleSize)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / sampleSize + (z * z) / (4 * sampleSize * sampleSize))) / denom;
  return [Math.max(0, Number((centre - half).toFixed(4))), Math.min(1, Number((centre + half).toFixed(4)))];
}
