import { z } from 'zod';

export const Trace = z.object({
  title: z.string().min(1).max(160),
  values: z.array(z.string().max(60)).min(1).max(24),
  steps: z.array(z.object({
    focus: z.number().int().min(0).nullable(),
    active: z.array(z.number().int().min(0)).max(24),
    candidate: z.number().int().min(0).nullable(),
    explanation: z.string().min(1).max(1200),
    prediction: z.string().max(300),
  })).min(1).max(12),
}).superRefine((trace, ctx) => {
  for (const step of trace.steps) {
    const indices = [...step.active, ...[step.focus, step.candidate].filter((i) => i !== null)];
    if (indices.some((i) => i >= trace.values.length) || new Set(step.active).size !== step.active.length) {
      ctx.addIssue({ code: 'custom', message: 'Each index must identify a cell, and active indices must be unique.' });
    }
  }
});
