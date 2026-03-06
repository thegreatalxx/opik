export const isProdTag = (tag: string) => /^prod(uction)?$/i.test(tag);

export const sortTags = (tags: string[]) => [
  ...tags.filter(isProdTag),
  ...tags.filter((t) => !isProdTag(t)),
];

export const getVersionDescription = (id: string, createdBy: string) => {
  const shortId = id.slice(0, 8);
  return `Updated by ${createdBy} ${shortId}`;
};

export const generateBlueprintDescription = (
  values: Record<string, unknown>,
): string => {
  return Object.entries(values)
    .map(([key, value]) => `Changed the \`${key}\` setting to \`${value}\`.`)
    .join(" ");
};
