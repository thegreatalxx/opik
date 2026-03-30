import { LLMMessageFormatImplementation } from "../../types";
import { detectGoogleFormat } from "./detector";
import { mapGoogleMessages } from "./mapper";

export const googleFormat: LLMMessageFormatImplementation = {
  name: "google",
  detector: detectGoogleFormat,
  mapper: mapGoogleMessages,
};

export { detectGoogleFormat, mapGoogleMessages };
