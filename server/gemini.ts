import { GoogleGenAI, Type } from "@google/genai";

const OCR_MODEL = "gemini-3-flash-preview";

let genaiClient: GoogleGenAI | null = null;

const withRetry = async <T>(
  operationName: string,
  fn: () => Promise<T>,
  retries = 3,
  initialDelay = 1000,
): Promise<T> => {
  let attempt = 0;
  while (attempt < retries) {
    try {
      return await fn();
    } catch (e: any) {
      attempt++;
      const msg = e.message || String(e);
      const isRetryable =
        e.status === 503 ||
        e.status === 429 ||
        msg.includes("503") ||
        msg.includes("429");
      if (attempt >= retries || !isRetryable) {
        throw new Error(`Gemini API Error during ${operationName}: ${msg}`);
      }
      console.log(
        `[Gemini API] Retry ${attempt}/${retries} for ${operationName} after ${initialDelay * attempt}ms due to: ${msg}`,
      );
      await new Promise((resolve) =>
        setTimeout(resolve, initialDelay * attempt),
      );
    }
  }
  throw new Error("unreachable");
};

function getGenaiClient(): GoogleGenAI {
  if (!genaiClient) {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error("Missing GEMINI_API_KEY environment variable.");
    }
    genaiClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  return genaiClient;
}

export interface ExtractedSessionHeader {
  sessionNumber: number;
  date: string;
  trainer: string;
}

export interface ExtractedPerformance {
  sessionNumber: number;
  machineName: string;
  settings: string;
  weight: number;
  reps: string | number;
  isStaticHold?: boolean;
}

export interface OCRMachineSetting {
  machineId: string;
  seat?: string;
  gap?: string;
  backPad?: string;
  handles?: string;
  armPad?: string;
  rawSettings?: Record<string, string>;
}

export interface OCRResult {
  sessionHeaders: ExtractedSessionHeader[];
  performances: ExtractedPerformance[];
}

export const MACHINE_SETTINGS_OCR_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    settings: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          machineId: {
            type: Type.STRING,
            description:
              "The official machine ID from the provided dictionary.",
          },
          seat: { type: Type.STRING },
          gap: { type: Type.STRING },
          backPad: { type: Type.STRING },
          handles: { type: Type.STRING },
          armPad: { type: Type.STRING },
          rawSettings: {
            type: Type.OBJECT,
            description: "Any other key-value settings found.",
          },
        },
        required: ["machineId"],
      },
    },
  },
  required: ["settings"],
};

export const CHART_OCR_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    sessionHeaders: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          sessionNumber: { type: Type.NUMBER },
          date: { type: Type.STRING },
          trainer: { type: Type.STRING },
        },
        required: ["sessionNumber", "date", "trainer"],
      },
    },
    performances: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          sessionNumber: { type: Type.NUMBER },
          machineName: { type: Type.STRING },
          settings: { type: Type.STRING },
          weight: { type: Type.NUMBER },
          reps: { type: Type.STRING },
          isStaticHold: { type: Type.BOOLEAN },
        },
        required: [
          "sessionNumber",
          "machineName",
          "settings",
          "weight",
          "reps",
        ],
      },
    },
  },
  required: ["sessionHeaders", "performances"],
};

export async function extractMachineSettingsFromImage(
  images: { base64: string; mimeType: string }[],
): Promise<OCRMachineSetting[]> {
  const ai = getGenaiClient();

  const machineDictionary = {
    LP: "m-leg-press",
    LE: "m-ext",
    LC: "m-leg-curl",
    ABD: "m-hip-abd",
    ADD: "m-hip-add",
    CP: "m-chest-press",
    OP: "m-overhead-press",
    SD: "m-dip",
    CF: "m-chest-fly",
    TE: "m-tricep-ext",
    LR: "m-lateral-raise",
    CR: "m-compound-row",
    PD: "m-pulldown",
    PO: "m-pullover",
    SR: "m-simple-row",
    BC: "m-bicep",
    "LE/L": "m-lumbar",
    AB: "m-abs",
    TR: "m-torso-rotation",
    CE: "m-neck",
  };

  const systemInstruction = `You are an expert at decoding messy, handwritten clinical workout charts. Your specific task is to extract historical MACHINE SETTINGS from Column 2 of the provided chart.

**CONTEXT & VISUAL LAYOUT:**
1. **Column 1 (Far Left):** Contains the Machine Name or Abbreviation (e.g., "LP", "Chest Press").
2. **Column 2 (Immediately Right):** Contains the "Settings" box. This is a messy string of symbols, letters, and numbers (e.g., "S4 G2", "S-4, B-P2", "W, S5", "H: M").

**MACHINE ID DICTIONARY:**
Map abbreviations to these official IDs:
${JSON.stringify(machineDictionary, null, 2)}

**EXTRACTION HEURISTICS (The Decoder):**
- **Seat Height:** Look for "S", "St", or "Seat" followed by a number (e.g., "S4" -> seat: "4").
- **Gap:** Look for "G", "Gp", or "Gap" followed by a number (e.g., "G2" -> gap: "2").
- **Back Pad:** Look for "B", "Bk", "Back", or protocol positions like "P2", "P3" (e.g., "B: P2" -> backPad: "P2").
- **Handles/Arm Pads (Width):** Look for "H", "W", "M", "N" indicating Wide, Middle, or Narrow setups (e.g., "H: M" -> handles: "M").

**STRICT RULES:**
- Setting values MUST be numeric (e.g. "4", "2.5", "12"), pin/protocol codes (e.g. "P2", "P3"), or width codes (e.g. "W", "M", "N", "Wide", "Narrow").
- NEVER return English words like "project", "client", "exercise", "routine", "general", or notes as machine settings.
- Ignore weight and rep data. ONLY focus on the static machine settings.
- If a machine is listed multiple times, return it only once with its most recent/complete settings.
- If a field is not found or is ambiguous/illegible, omit it from the object.
- CRITICAL: Process EVERY image in the array. Each image may have different settings.
- Return ONLY valid JSON matching the requested schema.`;

  const imageParts = images.map((img) => ({
    inlineData: { data: img.base64, mimeType: img.mimeType },
  }));

  const response = await withRetry("extractMachineSettingsFromImage", () =>
    ai.models.generateContent({
      model: OCR_MODEL,
      contents: [
        {
          parts: [
            ...imageParts,
            {
              text: `Analyze the charts and extract all machine settings found in the second column across all ${images.length} images.`,
            },
          ],
        },
      ],
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: MACHINE_SETTINGS_OCR_SCHEMA,
      },
    }),
  );

  if (!response.text) {
    throw new Error("No data returned from settings extraction.");
  }

  try {
    const parsed = JSON.parse(response.text);
    return parsed.settings as OCRMachineSetting[];
  } catch (e) {
    console.error("Settings Parse Error:", response.text);
    throw new Error("Failed to parse extracted settings.");
  }
}

export async function processLegacyChart(
  images: { base64: string; mimeType: string }[],
  expectedSessions: number,
  pageIndex?: number,
  totalPages?: number,
): Promise<OCRResult> {
  const ai = getGenaiClient();

  const systemInstruction = `You are a high-precision clinical data extraction AI. You are extracting data from Page ${pageIndex !== undefined ? pageIndex + 1 : "N"} of ${totalPages ? totalPages : images.length} training chart images.

**CRITICAL: FULL HORIZONTAL SCAN (12 COLUMNS)**
- Every MSF Legacy Chart page contains a grid with exactly 12 vertical columns for sessions.
- You MUST scan across all 12 columns for EVERY machine row.
- Even if a column looks faint or has minimal data, attempt to extract the session number, date, weight, and reps.
- DO NOT skip any data points. If a value is present, it is critical medical/fitness history.

**PASS 1: THE CHRONOLOGICAL TIMELINE (HEADERS)**
- There is a blue header row.
- Row 1: Session Number (1, 2, 3... up to 12 per page).
- Row 2: Date (e.g., "5/21").
- Row 3: Trainer Initials (e.g., "AJ").
- Extract all 12 headers into the sessionHeaders array.

**PASS 2: THE PERFORMANCE GRID**
- Column 1: Machine Name (e.g., "Leg Press", "LP").
- Column 2: Machine Settings (e.g., "S4", "G2").
- Columns 3-14: Performance Data.
- Top number in a box = Weight.
- Bottom number in a box = Reps.
- If bottom text includes "SH" or "sec" or is > 20, set isStaticHold to true.

**DATA INTEGRITY:**
- If data is illegible, use "0" for numbers and "CONFIRM" for text. Do not hallucinate.
- Ensure the sessionNumber in 'performances' matches the sessionNumber extracted in 'sessionHeaders'.

Expected total columns in this segment: 12.
Return ONLY valid JSON matching the requested schema.`;

  const imageParts = images.map((img) => ({
    inlineData: { data: img.base64, mimeType: img.mimeType },
  }));

  const response = await withRetry("processLegacyChart", () =>
    ai.models.generateContent({
      model: OCR_MODEL,
      contents: [
        {
          parts: [
            ...imageParts,
            {
              text: `Analyze all ${images.length} training chart images and extract data session-by-session into a consolidated structure. Total expected columns to find: up to 12 per page.`,
            },
          ],
        },
      ],
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: CHART_OCR_SCHEMA,
      },
    }),
  );

  if (!response.text) {
    throw new Error("No data returned from OCR engine.");
  }

  try {
    return JSON.parse(response.text) as OCRResult;
  } catch (e) {
    console.error("OCR Parse Error:", response.text);
    throw new Error("Failed to parse clinical chart data.");
  }
}
