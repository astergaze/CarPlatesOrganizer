import TextRecognition from "@react-native-ml-kit/text-recognition";

export const recognizePlate = async (
  imageUri: string
): Promise<string | null> => {
  try {

    // Process the image locally
    const result = await TextRecognition.recognize(imageUri);

    console.log("Texto crudo encontrado:", result.text);
    // The OCR read every text, search for plates used in Argentina

    // New (Mercosur): 2 letters, 3 numbers, 2 letters (Ej: AA 123 BB)
    const regexNueva = /[A-Z]{2}\s*\d{3}\s*[A-Z]{2}/g;

    // Old: 3 letters, 3 numbers (Ej: ABC 123)
    const regexVieja = /[A-Z]{3}\s*\d{3}/g;

    // Search in the text
    const textoCompleto = result.text.toUpperCase(); // To mayus

    // Try search for the new plate
    const matchNueva = textoCompleto.match(regexNueva);
    if (matchNueva && matchNueva.length > 0) {
      // return first match
      return matchNueva[0].replace(/\s/g, "");
    }

    // else, search for the old one
    const matchVieja = textoCompleto.match(regexVieja);
    if (matchVieja && matchVieja.length > 0) {
      return matchVieja[0].replace(/\s/g, "");
    }

    // If a pattern isn't detected, give the most useful part of the text, or all the text if it is short
    if (result.blocks.length > 0) {
      return result.blocks[0].text.replace(/[^A-Z0-9]/g, "");
    }

    return null;
  } catch (error) {
    console.error("OCR Error:", error);
    return null;
  }
};
