
import { GoogleGenAI, Type } from "@google/genai";

// This function will be called to translate a batch of recent text segments.
export const translateText = async (
  segments: string[],
  targetLanguage: string
): Promise<string[]> => {
  if (!process.env.API_KEY) {
    throw new Error("API_KEY environment variable not set");
  }

  // Create a new instance for each call to ensure the latest API key is used.
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const model = 'gemini-2.5-flash';

  const prompt = `You are an expert real-time translator.
Translate the following array of text segments into ${targetLanguage}.
Maintain the original sentence structure and meaning, ensuring contextual accuracy based on the sequence of segments.
Provide your response as a JSON array of strings, where each string is the translation of the corresponding input segment.

Input Segments:
${JSON.stringify(segments)}

Provide only the JSON array of translated strings as your response.`;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.STRING,
          },
        },
      },
    });

    const jsonString = response.text;
    const translatedArray = JSON.parse(jsonString);

    if (Array.isArray(translatedArray) && translatedArray.every(item => typeof item === 'string')) {
      return translatedArray;
    } else {
      console.error("Parsed response is not an array of strings:", translatedArray);
      // Return an array of placeholders on failure to avoid crashing the app
      return segments.map(() => `[Translation Error]`);
    }
  } catch (error) {
    console.error("Error during translation API call:", error);
    // Return an array of placeholders on failure
    return segments.map(() => `[Translation Error]`);
  }
};
