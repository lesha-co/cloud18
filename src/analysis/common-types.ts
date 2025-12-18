import z from "zod";

export const SubredditRow = z.object({
  id: z.number(),
  subreddit: z.string(),
  subscribers: z.number(),
  nsfw: z.union([z.literal(0), z.literal(1)]),
});
export type SubredditRow = z.infer<typeof SubredditRow>;

export const NodeData = SubredditRow.extend({
  linksTo: z.array(z.number()),
});
export type NodeData = z.infer<typeof NodeData>;
