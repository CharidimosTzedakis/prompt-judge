import * as z from "zod";

export const ScoreEntry = z
  .object({
    criterionId: z.string(),
    score: z.int().min(1).max(5),
    reasoning: z.string().meta({
      description:
        "One or two sentences citing what in the output drove the score."
    })
  })
  .strict();

export const Score = z
  .object({
    scores: z.array(ScoreEntry),
    summary: z.string().meta({
      description: "Two sentences on the output's overall quality."
    })
  })
  .strict();

export type Score = z.infer<typeof Score>;
