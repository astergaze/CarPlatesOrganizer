import * as SQLite from "expo-sqlite";


export interface FolderPreview {
  plate: string;
  coverUri: string;
}

export interface ImageRecord {
  id: number;
  imageUri: string;
  assetId: string; 
  category: string;
  detectedText: string;
  date: string;
}

const db = SQLite.openDatabaseSync("patentes_v7.db");

export const initDB = async (): Promise<void> => {
  try {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS images (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        imageUri TEXT NOT NULL,
        assetId TEXT, 
        category TEXT NOT NULL, 
        detectedText TEXT, 
        date TEXT NOT NULL
      );
    `);
    console.log("Base de datos v7 verificada");
  } catch (error) {
    console.error("Error initDB:", error);
  }
};

export const insertImage = async (
  imageUri: string,
  assetId: string, 
  category: string,
  detectedText: string
): Promise<void> => {
  try {
    const safeText = detectedText || "Desconocido";
    const safeUri = imageUri || "";
    const safeAssetId = assetId || "";

    if (!safeUri) throw new Error("URI vacía");

    await db.runAsync(
      "INSERT INTO images (imageUri, assetId, category, detectedText, date) VALUES (?, ?, ?, ?, ?)",
      [safeUri, safeAssetId, category, safeText, new Date().toISOString()]
    );
    console.log(`Guardado OK: ${safeText}`);
  } catch (error) {
    console.error("Error insertImage:", error);
    throw error;
  }
};

export const searchImages = async (query: string): Promise<ImageRecord[]> => {
  try {
    const safeQuery = query || "";
    const allRows = await db.getAllAsync<ImageRecord>(
      "SELECT * FROM images WHERE detectedText LIKE ? OR category LIKE ? ORDER BY id DESC",
      [`%${safeQuery}%`, `%${safeQuery}%`]
    );
    return allRows;
  } catch (error) {
    console.error("Error searchImages:", error);
    return [];
  }
};

export const getUniquePlates = async (): Promise<FolderPreview[]> => {
  try {
    const result = await db.getAllAsync<{
      detectedText: string;
      imageUri: string;
    }>(
      `SELECT detectedText, imageUri 
       FROM images 
       WHERE detectedText IS NOT NULL AND detectedText != ''
       GROUP BY detectedText 
       ORDER BY id DESC`
    );

    return result.map((r) => ({
      plate: r.detectedText,
      coverUri: r.imageUri,
    }));
  } catch (error) {
    console.error("Error getUniquePlates:", error);
    return [];
  }
};

export const getPhotosByPlate = async (
  plate: string
): Promise<ImageRecord[]> => {
  try {
    const result = await db.getAllAsync<ImageRecord>(
      "SELECT * FROM images WHERE detectedText = ? ORDER BY id DESC",
      [plate]
    );
    return result;
  } catch (error) {
    console.error("Error getPhotosByPlate:", error);
    return [];
  }
};

export const deleteImage = async (id: number): Promise<void> => {
  try {
    await db.runAsync("DELETE FROM images WHERE id = ?", [id]);
  } catch (error) {
    console.error("Error deleteImage:", error);
  }
};

export const deleteFolder = async (plate: string): Promise<void> => {
  try {
    await db.runAsync("DELETE FROM images WHERE detectedText = ?", [plate]);
  } catch (error) {
    console.error("Error deleteFolder:", error);
  }
};
