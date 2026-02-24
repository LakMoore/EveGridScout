/**
 * Resolves a standing hint string into a consistent display tag and friendly flag.
 */
export function resolveStandingHint(standingHint: string): {
  normalizedHint: string;
  precedence: number;
  color: string;
  isFriendly: boolean;
} {
  const normalizedHint = String(standingHint ?? "")
    .trim()
    .toLowerCase();

  const localTagRules: Array<{
    match: (hint: string) => boolean;
    color: string;
    isFriendly: boolean;
  }> = [
    {
      // Pilot is at war with you
      match: (hint) => /at war with you|at war with your/.test(hint),
      color: "#ad2828",
      isFriendly: false,
    },
    {
      // Pilot has horrible standing
      match: (hint) => /terrible standing|horrible standing/.test(hint),
      color: "#910203",
      isFriendly: false,
    },
    {
      // Pilot has bad standing
      match: (hint) => /bad standing/.test(hint),
      color: "#C14503",
      isFriendly: false,
    },
    {
      // Pilot is in your fleet/gang
      match: (hint) => /in your fleet|in your gang/.test(hint),
      color: "#751FAE",
      isFriendly: true,
    },
    {
      // Pilot is in your corporation
      match: (hint) =>
        /in your capsuleer corporation|in your corporation/.test(hint),
      color: "#157516",
      isFriendly: true,
    },
    {
      // Pilot is in your alliance
      match: (hint) => /in your alliance/.test(hint),
      color: "#021F76",
      isFriendly: true,
    },
    {
      // Pilot has good standing
      match: (hint) => /good standing/.test(hint),
      color: "#2862C2",
      isFriendly: true,
    },
    {
      // Pilot has excellent standing
      match: (hint) => /excellent standing/.test(hint),
      color: "#021F76",
      isFriendly: true,
    },
    {
      // Pilot has security status below -5
      match: (hint) => /security status below -5/.test(hint),
      color: "#8F0203",
      isFriendly: false,
    },
    {
      // Pilot has security status below 0
      match: (hint) => /security status below 0/.test(hint),
      color: "#B88206",
      isFriendly: false,
    },
    {
      // Pilot has no standing
      match: (_hint) => true,
      color: "#888889",
      isFriendly: false,
    },
  ];

  const matchedIndex = localTagRules.findIndex((rule) =>
    rule.match(normalizedHint),
  );
  const index = matchedIndex >= 0 ? matchedIndex : localTagRules.length - 1;
  const rule = localTagRules[index]!;

  return {
    normalizedHint,
    precedence: index,
    color: rule.color,
    isFriendly: rule.isFriendly,
  };
}
