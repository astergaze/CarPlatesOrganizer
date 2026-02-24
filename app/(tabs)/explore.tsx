import React, { useCallback, useState, useRef } from "react";
import {
  StyleSheet,
  View,
  FlatList,
  Image,
  StatusBar,
  TouchableOpacity,
  Alert,
  Modal as NativeModal,
  ActivityIndicator,
} from "react-native";
import { readAsStringAsync } from "expo-file-system/legacy";
import {
  Text,
  List,
  Modal,
  Button,
  IconButton,
  Provider as PaperProvider,
  MD3DarkTheme,
  Searchbar,
} from "react-native-paper";
import { useFocusEffect } from "expo-router";
import PagerView from "react-native-pager-view";

// --- LIBRERÍAS DE ACCESO ---
import * as FileSystem from "expo-file-system";
import {
  cacheDirectory,
  writeAsStringAsync,
  deleteAsync,
  EncodingType,
} from "expo-file-system/legacy";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing"; // Lo usaremos para Single Share y PDF
import Share from "react-native-share"; // Lo usaremos SOLO para el Pack de imágenes
import * as MediaLibrary from "expo-media-library";

import {
  initDB,
  getUniquePlates,
  getPhotosByPlate,
  deleteImage,
  deleteFolder,
  ImageRecord,
  FolderPreview,
} from "../../database";

const darkTheme = {
  ...MD3DarkTheme,
  colors: {
    ...MD3DarkTheme.colors,
    primary: "#485ec0ff",
    background: "#121212",
    surface: "#1E1E1E",
    onSurface: "#E0E0E0",
    elevation: { level2: "#2C2C2C" },
  },
};

export default function GalleryScreen() {
  const [folders, setFolders] = useState<FolderPreview[]>([]);
  const [filteredFolders, setFilteredFolders] = useState<FolderPreview[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

  const [selectedPlate, setSelectedPlate] = useState<string | null>(null);
  const [photos, setPhotos] = useState<ImageRecord[]>([]);
  const [folderModalVisible, setFolderModalVisible] = useState(false);

  const [isFullScreen, setIsFullScreen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const pagerRef = useRef<PagerView>(null);

  const [isExporting, setIsExporting] = useState(false);
  const [downloadingPlate, setDownloadingPlate] = useState<string | null>(null);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<Set<number>>(
    new Set(),
  );

  useFocusEffect(
    useCallback(() => {
      initDB().then(() => loadFolders());
    }, []),
  );

  const loadFolders = async () => {
    const data = await getUniquePlates();
    setFolders(data);
    setFilteredFolders(data);
  };

  const onChangeSearch = (query: string) => {
    setSearchQuery(query);
    if (query) {
      const newData = folders.filter((item) => {
        const itemData = item.plate ? item.plate.toUpperCase() : "";
        return itemData.indexOf(query.toUpperCase()) > -1;
      });
      setFilteredFolders(newData);
    } else {
      setFilteredFolders(folders);
    }
  };

  const openFolder = async (plate: string) => {
    const data = await getPhotosByPlate(plate);
    setPhotos(data);
    setSelectedPlate(plate);
    setFolderModalVisible(true);
  };

  // =========================================================
  // HELPER: Convertir imagen a Base64 de forma SEGURA
  // =========================================================
  const getCleanBase64 = async (uri: string) => {
    try {
      let cleanUri = decodeURIComponent(uri);

      // Asegurar prefijo para Android
      if (
        !cleanUri.startsWith("file://") &&
        !cleanUri.startsWith("content://")
      ) {
        cleanUri = `file://${cleanUri}`;
      }

      // CAMBIO AQUÍ:
      // Usamos 'readAsStringAsync' (importado de legacy) directamente.
      // Y mantenemos el string "base64" para evitar líos de tipos.
      return await readAsStringAsync(cleanUri, {
        encoding: "base64",
      });
    } catch (error) {
      console.warn("Error leyendo imagen para base64:", uri, error);
      return null;
    }
  };

  // =========================================================
  // MÉTODO 1: PDF (Optimizado para memoria secuencial)
  // =========================================================
  const generateAndSharePDF = async (
    plate: string,
    photosToShare: ImageRecord[],
  ) => {
    try {
      setIsExporting(true);

      const validPhotos: { uri: string; category: string; b64: string }[] = [];

      for (let i = 0; i < photosToShare.length; i++) {
        const p = photosToShare[i];
        const b64 = await getCleanBase64(p.imageUri);
        if (b64) {
          validPhotos.push({
            uri: p.imageUri,
            category: p.category || `Foto ${i + 1}`,
            b64,
          });
        }
      }

      if (validPhotos.length === 0) {
        Alert.alert("Error", "No se pudieron leer los archivos de imagen.");
        return;
      }

      // Mismo HTML que shareImagesPack, pero con estilo para PDF
      const imagesHtml = validPhotos
        .map(
          (p, i) => `
      <div class="card">
        <img src="data:image/jpeg;base64,${p.b64}" />
        <div class="label">${p.category}</div>
      </div>`,
        )
        .join("");

      const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <style>
    body { font-family: sans-serif; padding: 20px; background: white; }
    h1 { text-align: center; margin-bottom: 5px; color: #333; }
    .meta { text-align: center; color: #666; font-size: 12px; margin-bottom: 20px; }
    .grid { display: flex; flex-wrap: wrap; gap: 10px; justify-content: center; }
    .card { width: 45%; border: 1px solid #ccc; padding: 5px; border-radius: 5px; text-align: center; break-inside: avoid; }
    img { width: 100%; height: 180px; object-fit: contain; margin-bottom: 5px; }
    .label { font-size: 10px; font-weight: bold; color: #444; }
  </style>
</head>
<body>
  <h1>Patente: ${plate}</h1>
  <div class="meta">Fecha: ${new Date().toLocaleDateString()}</div>
  <div class="grid">${imagesHtml}</div>
</body>
</html>`;

      // Convertir HTML a PDF directamente
      const { uri } = await Print.printToFileAsync({ html });

      await Sharing.shareAsync(uri, {
        UTI: ".pdf",
        mimeType: "application/pdf",
        dialogTitle: `Reporte ${plate}`,
      });

      // Limpiar PDF temporal
      await deleteAsync(uri, { idempotent: true });
    } catch (error: any) {
      console.error("Error Generando PDF:", error);
      Alert.alert("Error PDF", "Hubo un problema: " + error.message);
    } finally {
      setIsExporting(false);
      setDownloadingPlate(null);
    }
  };

  // =========================================================
  // MÉTODO 2: PACK IMÁGENES (WhatsApp/Telegram)
  // =========================================================
  const shareImagesPack = async (photosToShare: ImageRecord[]) => {
    try {
      setIsExporting(true);

      if (photosToShare.length === 0) {
        Alert.alert("Error", "No hay imágenes válidas para compartir.");
        return;
      }

      // If only 1 photo, share directly
      if (photosToShare.length === 1) {
        const uri = photosToShare[0].imageUri;
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(uri, {
            mimeType: "image/jpeg",
            dialogTitle: `Foto ${selectedPlate}`,
          });
        }
        return;
      }

      // For multiple photos: create a ZIP file and share it
      // Since expo doesn't have a native zip, we generate a self-contained HTML
      // gallery that works offline (images embedded as base64)
      const validPhotos: { uri: string; category: string; b64: string }[] = [];

      for (let i = 0; i < photosToShare.length; i++) {
        const p = photosToShare[i];
        const b64 = await getCleanBase64(p.imageUri);
        if (b64) {
          validPhotos.push({
            uri: p.imageUri,
            category: p.category || `Foto ${i + 1}`,
            b64,
          });
        }
      }

      if (validPhotos.length === 0) {
        Alert.alert("Error", "No se pudieron leer las imágenes.");
        return;
      }

      // Build a self-contained HTML gallery
      const imagesHtml = validPhotos
        .map(
          (p, i) => `
        <div class="card">
          <div class="num">${i + 1}</div>
          <img src="data:image/jpeg;base64,${p.b64}" />
          <div class="label">${p.category}</div>
        </div>`,
        )
        .join("");

      const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Fotos - ${selectedPlate}</title>
  <style>
    body { margin: 0; background: #111; font-family: sans-serif; color: white; }
    h2 { text-align: center; padding: 20px 0 5px; letter-spacing: 2px; }
    .sub { text-align: center; color: #888; font-size: 12px; margin-bottom: 20px; }
    .grid { display: flex; flex-wrap: wrap; gap: 10px; padding: 10px; justify-content: center; }
    .card { background: #222; border-radius: 10px; overflow: hidden; width: 160px; text-align: center; position: relative; }
    .num { position: absolute; top: 6px; left: 8px; background: rgba(0,0,0,0.6); border-radius: 50%; width: 22px; height: 22px; line-height: 22px; font-size: 11px; }
    img { width: 160px; height: 160px; object-fit: cover; display: block; }
    .label { padding: 6px; font-size: 11px; color: #aaa; }
  </style>
</head>
<body>
  <h2>🚗 ${selectedPlate}</h2>
  <div class="sub">${validPhotos.length} fotos · ${new Date().toLocaleDateString()}</div>
  <div class="grid">${imagesHtml}</div>
</body>
</html>`;

      // Save HTML to cache directory
      const htmlPath = `${cacheDirectory}fotos_${selectedPlate}_${Date.now()}.html`;
      await writeAsStringAsync(htmlPath, html, {
        encoding: EncodingType.UTF8,
      });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(htmlPath, {
          mimeType: "text/html",
          dialogTitle: `Fotos de ${selectedPlate}`,
          UTI: "public.html",
        });
      } else {
        Alert.alert(
          "No disponible",
          "Tu dispositivo no soporta compartir archivos.",
        );
      }

      // Cleanup
      await deleteAsync(htmlPath, { idempotent: true });
    } catch (error: any) {
      console.error("Error Share Pack:", error);
      if (!error?.message?.includes("User did not share")) {
        Alert.alert(
          "Error al compartir",
          "Ocurrió un problema: " + error.message,
        );
      }
    } finally {
      setIsExporting(false);
      setDownloadingPlate(null);
    }
  };

  const handleExportAction = (
    plate: string,
    photosToExport: ImageRecord[],
    fromList = false,
  ) => {
    if (photosToExport.length === 0) {
      Alert.alert("Vacío", "No hay fotos.");
      return;
    }

    Alert.alert("Exportar", `Opciones para ${plate}:`, [
      { text: "Cancelar", style: "cancel" },
      {
        text: "📄 Reporte PDF",
        onPress: async () => {
          if (fromList) setDownloadingPlate(plate);
          else setIsExporting(true);
          await generateAndSharePDF(plate, photosToExport);
          if (fromList) setDownloadingPlate(null);
          else setIsExporting(false);
        },
      },
      {
        text: "🖼️ Pack Imágenes",
        onPress: async () => {
          if (fromList) setDownloadingPlate(plate);
          else setIsExporting(true);
          await shareImagesPack(photosToExport);
          if (fromList) setDownloadingPlate(null);
          else setIsExporting(false);
        },
      },
    ]);
  };

  const handleQuickExport = async (plate: string) => {
    if (downloadingPlate || isExporting) return;
    setDownloadingPlate(plate);
    try {
      const photosData = await getPhotosByPlate(plate);
      setTimeout(() => {
        setDownloadingPlate(null);
        handleExportAction(plate, photosData, true);
      }, 100);
    } catch (e) {
      setDownloadingPlate(null);
      Alert.alert("Error", "No se cargaron las fotos.");
    }
  };

  // Borrar Carpeta
  const handleDeleteFolder = (plate: string) => {
    Alert.alert("Eliminar", `¿Borrar ${plate}?`, [
      { text: "Cancelar" },
      {
        text: "Borrar",
        style: "destructive",
        onPress: async () => {
          try {
            const photosToDelete = await getPhotosByPlate(plate);
            const assetIds = photosToDelete
              .map((p) => p.assetId)
              .filter((id) => id && id.length > 0);
            if (assetIds.length > 0)
              await MediaLibrary.deleteAssetsAsync(assetIds);

            await deleteFolder(plate);
            setFolderModalVisible(false);
            loadFolders();
            setSearchQuery("");
          } catch (e) {
            Alert.alert("Error", "Fallo al borrar.");
          }
        },
      },
    ]);
  };

  // Borrar Foto Individual
  const handleDeleteCurrentPhoto = () => {
    const currentPhoto = photos[selectedIndex];
    if (!currentPhoto) return;
    Alert.alert("Borrar", "¿Eliminar foto?", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Borrar",
        style: "destructive",
        onPress: async () => {
          try {
            if (currentPhoto.assetId)
              await MediaLibrary.deleteAssetsAsync([currentPhoto.assetId]);
            await deleteImage(currentPhoto.id);
            const newPhotos = photos.filter((p) => p.id !== currentPhoto.id);
            setPhotos(newPhotos);
            if (newPhotos.length === 0) {
              setIsFullScreen(false);
              setFolderModalVisible(false);
              loadFolders();
            } else if (selectedIndex >= newPhotos.length) {
              setSelectedIndex(newPhotos.length - 1);
            }
          } catch (e) {
            Alert.alert("Error", "No se pudo borrar.");
          }
        },
      },
    ]);
  };

  const openFullScreen = (index: number) => {
    setSelectedIndex(index);
    setIsFullScreen(true);
  };
  const toggleSelectionMode = () => {
    setIsSelectionMode((prev) => !prev);
    setSelectedPhotoIds(new Set());
  };

  const togglePhotoSelection = (id: number) => {
    setSelectedPhotoIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    setSelectedPhotoIds(new Set(photos.map((p) => p.id)));
  };

  // =========================================================
  // MÉTODO 3: COMPARTIR INDIVIDUAL (Restaurado a Expo Sharing)
  // =========================================================
  const shareSingleImage = async () => {
    const currentPhoto = photos[selectedIndex];
    if (currentPhoto && (await Sharing.isAvailableAsync())) {
      // Usamos Sharing.shareAsync estándar, funciona perfecto para 1 sola foto
      await Sharing.shareAsync(currentPhoto.imageUri);
    }
  };

  const renderPhotoItem = ({
    item,
    index,
  }: {
    item: ImageRecord;
    index: number;
  }) => {
    const isSelected = selectedPhotoIds.has(item.id);
    return (
      <TouchableOpacity
        style={styles.photoContainer}
        onPress={() => {
          if (isSelectionMode) togglePhotoSelection(item.id);
          else openFullScreen(index);
        }}
        onLongPress={() => {
          if (!isSelectionMode) {
            setIsSelectionMode(true);
            togglePhotoSelection(item.id);
          }
        }}
        activeOpacity={0.7}
      >
        <Image source={{ uri: item.imageUri }} style={styles.photo} />
        {item.category === "Patente Principal" && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>PATENTE</Text>
          </View>
        )}
        {isSelectionMode && (
          <View
            style={[
              styles.selectionOverlay,
              isSelected && styles.selectionOverlayActive,
            ]}
          >
            {isSelected && (
              <View style={styles.checkCircle}>
                <Text
                  style={{ color: "white", fontSize: 14, fontWeight: "bold" }}
                >
                  ✓
                </Text>
              </View>
            )}
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const headerImage =
    photos.find((p) => p.category === "Patente Principal") || photos[0];

  return (
    <PaperProvider theme={darkTheme}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />
      <View style={styles.container}>
        <View style={styles.headerContainer}>
          <Text variant="headlineSmall" style={styles.mainTitle}>
            Mis Carpetas
          </Text>
          <Searchbar
            placeholder="Buscar..."
            onChangeText={onChangeSearch}
            value={searchQuery}
            style={styles.searchBar}
            inputStyle={{ color: "white" }}
            iconColor="#868efcff"
            placeholderTextColor="#666"
          />
        </View>

        {filteredFolders.length === 0 ? (
          <View style={styles.emptyState}>
            <IconButton
              icon="folder-search-outline"
              size={60}
              iconColor="#333"
            />
            <Text style={{ color: "#666", marginTop: 10 }}>
              Sin resultados.
            </Text>
          </View>
        ) : (
          <FlatList
            data={filteredFolders}
            keyExtractor={(item) => item.plate}
            contentContainerStyle={{ paddingBottom: 20 }}
            renderItem={({ item }) => (
              <List.Item
                title={item.plate}
                titleStyle={styles.folderTitle}
                description="Ver detalles"
                descriptionStyle={{ color: "#888" }}
                left={() => (
                  <Image
                    source={{ uri: item.coverUri }}
                    style={styles.folderThumb}
                  />
                )}
                right={(props) => (
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    {downloadingPlate === item.plate ? (
                      <ActivityIndicator
                        size="small"
                        color="#485ec0ff"
                        style={{ marginRight: 15 }}
                      />
                    ) : (
                      <IconButton
                        {...props}
                        icon="export-variant"
                        iconColor="#485ec0ff"
                        onPress={() => handleQuickExport(item.plate)}
                      />
                    )}
                    <IconButton
                      {...props}
                      icon="delete-outline"
                      iconColor="#CF6679"
                      onPress={() => handleDeleteFolder(item.plate)}
                    />
                  </View>
                )}
                onPress={() => openFolder(item.plate)}
                style={styles.folderItem}
              />
            )}
          />
        )}

        <Modal
          visible={folderModalVisible}
          onDismiss={() => {
            setFolderModalVisible(false);
            setIsSelectionMode(false);
            setSelectedPhotoIds(new Set());
          }}
          contentContainerStyle={styles.modalContainer}
        >
          <View style={styles.modalInner}>
            <View style={styles.folderHeader}>
              {headerImage && (
                <Image
                  source={{ uri: headerImage.imageUri }}
                  style={styles.headerImage}
                  resizeMode="cover"
                />
              )}
              <View style={styles.headerOverlay}>
                <Text variant="headlineMedium" style={styles.headerTitle}>
                  {selectedPlate}
                </Text>
                <Text style={{ color: "#ddd", fontSize: 12 }}>
                  {photos.length} Fotos
                </Text>
              </View>
            </View>
            <View style={styles.actionRow}>
              {isSelectionMode ? (
                <>
                  <Button
                    mode="contained"
                    icon="share-variant"
                    buttonColor="#485ec0ff"
                    textColor="white"
                    onPress={() => {
                      const selected = photos.filter((p) =>
                        selectedPhotoIds.has(p.id),
                      );
                      if (selected.length === 0) {
                        Alert.alert(
                          "Selección vacía",
                          "Seleccioná al menos una foto.",
                        );
                        return;
                      }
                      handleExportAction(selectedPlate!, selected);
                    }}
                    loading={isExporting}
                    disabled={isExporting || selectedPhotoIds.size === 0}
                    style={{ flex: 1, marginRight: 5 }}
                    labelStyle={{ fontSize: 12 }}
                  >
                    {isExporting
                      ? "Procesando..."
                      : `Exportar (${selectedPhotoIds.size})`}
                  </Button>
                  <Button
                    mode="text"
                    onPress={selectAll}
                    textColor="#868efc"
                    compact
                    labelStyle={{ fontSize: 11 }}
                  >
                    Todo
                  </Button>
                  <Button
                    mode="outlined"
                    icon="close"
                    onPress={toggleSelectionMode}
                    textColor="#aaa"
                    style={{ borderColor: "#555" }}
                    compact
                  >
                    Cancelar
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    mode="contained"
                    icon="checkbox-multiple-outline"
                    buttonColor="#2a2a2a"
                    textColor="white"
                    onPress={toggleSelectionMode}
                    style={{
                      flex: 1,
                      marginRight: 5,
                      borderWidth: 1,
                      borderColor: "#444",
                    }}
                    labelStyle={{ fontSize: 12 }}
                  >
                    Seleccionar fotos
                  </Button>
                  <Button
                    mode="contained"
                    icon="share-variant"
                    buttonColor="#485ec0ff"
                    textColor="white"
                    onPress={() => handleExportAction(selectedPlate!, photos)}
                    loading={isExporting}
                    disabled={isExporting}
                    style={{ flex: 1, marginRight: 5 }}
                    labelStyle={{ fontSize: 12 }}
                  >
                    {isExporting ? "..." : "Exportar todo"}
                  </Button>
                  <Button
                    mode="outlined"
                    icon="close"
                    onPress={() => {
                      setFolderModalVisible(false);
                      setIsSelectionMode(false);
                      setSelectedPhotoIds(new Set());
                    }}
                    textColor="#aaa"
                    style={{ borderColor: "#555" }}
                    compact
                  >
                    Cerrar
                  </Button>
                </>
              )}
            </View>
            <FlatList
              data={photos}
              renderItem={renderPhotoItem}
              keyExtractor={(item) => item.id.toString()}
              numColumns={3}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ padding: 5 }}
            />
          </View>
        </Modal>

        <NativeModal
          visible={isFullScreen}
          transparent={true}
          onRequestClose={() => setIsFullScreen(false)}
          animationType="fade"
        >
          <View style={styles.fullScreenContainer}>
            {photos.length > 0 && (
              <PagerView
                style={styles.pagerView}
                initialPage={selectedIndex}
                ref={pagerRef}
                onPageSelected={(e) => setSelectedIndex(e.nativeEvent.position)}
              >
                {photos.map((img) => (
                  <View key={img.id} style={styles.page}>
                    <Image
                      source={{ uri: img.imageUri }}
                      style={styles.fullScreenImage}
                      resizeMode="contain"
                    />
                  </View>
                ))}
              </PagerView>
            )}
            <View style={styles.topBar}>
              <IconButton
                icon="arrow-left"
                iconColor="white"
                size={28}
                onPress={() => setIsFullScreen(false)}
                style={styles.floatBtn}
              />
              <View style={{ flexDirection: "row", gap: 10 }}>
                {/* BOTON SINGLE SHARE CORREGIDO */}
                <IconButton
                  icon="share-variant"
                  iconColor="white"
                  size={26}
                  onPress={shareSingleImage}
                  style={styles.floatBtn}
                />
                <IconButton
                  icon="trash-can-outline"
                  iconColor="#FF5252"
                  size={26}
                  onPress={handleDeleteCurrentPhoto}
                  style={styles.floatBtn}
                />
              </View>
            </View>
            <View style={styles.bottomInfo}>
              <Text style={{ color: "white", fontWeight: "bold" }}>
                {selectedIndex + 1} / {photos.length}
              </Text>
              <Text style={{ color: "#aaa", fontSize: 12 }}>
                {photos[selectedIndex]?.category}
              </Text>
            </View>
          </View>
        </NativeModal>
      </View>
    </PaperProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#121212" },
  headerContainer: {
    padding: 20,
    paddingBottom: 10,
    backgroundColor: "#1E1E1E",
    borderBottomWidth: 1,
    borderBottomColor: "#333",
  },
  mainTitle: { color: "white", fontWeight: "bold", marginBottom: 15 },
  searchBar: { backgroundColor: "#2C2C2C", borderRadius: 10, height: 50 },
  emptyState: { flex: 1, justifyContent: "center", alignItems: "center" },
  folderItem: {
    backgroundColor: "#1E1E1E",
    marginVertical: 4,
    marginHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#333",
  },
  folderTitle: { color: "white", fontWeight: "bold", fontSize: 18 },
  folderThumb: {
    width: 60,
    height: 60,
    borderRadius: 10,
    marginLeft: 10,
    backgroundColor: "#333",
  },
  modalContainer: { padding: 15, flex: 1, justifyContent: "center" },
  modalInner: {
    backgroundColor: "#1E1E1E",
    borderRadius: 15,
    height: "85%",
    borderWidth: 1,
    borderColor: "#333",
    overflow: "hidden",
  },
  folderHeader: { height: 140, width: "100%", position: "relative" },
  headerImage: { width: "100%", height: "100%" },
  headerOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(0,0,0,0.6)",
    padding: 10,
    alignItems: "center",
  },
  headerTitle: {
    color: "white",
    fontWeight: "bold",
    textShadowColor: "black",
    textShadowRadius: 10,
  },
  actionRow: {
    flexDirection: "row",
    padding: 10,
    backgroundColor: "#252525",
    alignItems: "center",
    justifyContent: "space-between",
  },
  photoContainer: {
    flex: 1,
    margin: 3,
    aspectRatio: 1,
    position: "relative",
    borderRadius: 8,
    overflow: "hidden",
  },
  photo: { width: "100%", height: "100%", backgroundColor: "#333" },
  badge: {
    position: "absolute",
    top: 4,
    right: 4,
    backgroundColor: "#8688fcff",
    paddingHorizontal: 6,
    borderRadius: 4,
  },
  badgeText: { color: "white", fontSize: 9, fontWeight: "bold" },
  fullScreenContainer: { flex: 1, backgroundColor: "black" },
  pagerView: { flex: 1 },
  page: { justifyContent: "center", alignItems: "center", flex: 1 },
  fullScreenImage: { width: "100%", height: "100%" },
  topBar: {
    position: "absolute",
    top: 40,
    left: 10,
    right: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    zIndex: 10,
  },
  floatBtn: { backgroundColor: "rgba(0,0,0,0.5)" },
  bottomInfo: {
    position: "absolute",
    bottom: 40,
    width: "100%",
    alignItems: "center",
    zIndex: 10,
  },
  selectionOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.15)",
    borderRadius: 8,
  },
  selectionOverlayActive: {
    backgroundColor: "rgba(72, 94, 192, 0.45)",
    borderWidth: 2,
    borderColor: "#868efc",
  },
  checkCircle: {
    position: "absolute",
    top: 6,
    right: 6,
    backgroundColor: "#485ec0ff",
    borderRadius: 12,
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
  },
});
