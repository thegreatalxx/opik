export const serializeChatTemplate = (
  messages: Array<{ role: string; content: unknown }>,
): string =>
  JSON.stringify(messages.map(({ role, content }) => ({ role, content })));
