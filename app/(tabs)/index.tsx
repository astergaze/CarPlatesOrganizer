import React, { useEffect, useState, useCallback } from "react";
import {
  StyleSheet,
  View,
  Image,
  Modal,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  Alert,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as MediaLibrary from "expo-media-library";
import {
  Button,
  TextInput,
  Text,
  Card,
  Title,
  Paragraph,
  Provider as PaperProvider,
  IconButton,
  MD3DarkTheme,
  ActivityIndicator,
} from "react-native-paper";
import { useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// Asegúrate de que estas rutas sean correctas en tu proyecto
import { recognizePlate } from "../../services/ocr";
import {
  initDB,
  insertImage,
  getUniquePlates,
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
  },
};

export default function InputScreen() {
  const insets = useSafeAreaInsets();

  // --- PERMISOS ---
  const [mediaPermission, requestMediaPermission] =
    MediaLibrary.usePermissions();
  const [cameraPermission, requestCameraPermission] =
    ImagePicker.useCameraPermissions();

  // --- ESTADOS ---
  const [selectedUris, setSelectedUris] = useState<string[]>([]); // Array para manejar múltiples fotos
  const [modalVisible, setModalVisible] = useState(false);
  const [newPlate, setNewPlate] = useState("");
  const [recentPlates, setRecentPlates] = useState<FolderPreview[]>([]);

  // Estados de carga
  const [isSaving, setIsSaving] = useState(false);
  const [isProcessingOCR, setIsProcessingOCR] = useState(false);

  // --- CICLO DE VIDA ---
  useEffect(() => {
    initDB();
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadPlates();
    }, []),
  );

  const loadPlates = async () => {
    const plates = await getUniquePlates();
    setRecentPlates(plates);
  };

  const checkPermissions = async () => {
    if (!cameraPermission?.granted) await requestCameraPermission();
    if (!mediaPermission?.granted) await requestMediaPermission();
  };

  // --- FUNCIONES PRINCIPALES ---

  // 1. ABRIR CÁMARA NATIVA (Mejor calidad y Zoom)
  const openNativeCamera = async () => {
    await checkPermissions();
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 1, // Calidad máxima para el S25 Ultra
      exif: true,
      allowsEditing: false, // Dejar false para mantener la foto original completa
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      const uri = result.assets[0].uri;
      setSelectedUris([uri]); // Guardamos en array aunque sea una sola
      setModalVisible(true);
      performOCR(uri); // Intentamos leer patente automáticamente
    }
  };

  // 2. ABRIR GALERÍA (Importación múltiple)
  const openGallery = async () => {
    await checkPermissions();
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true, // ¡Clave para importar carpetas!
      quality: 1,
      orderedSelection: true,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      const uris = result.assets.map((asset) => asset.uri);
      setSelectedUris(uris);
      setModalVisible(true);

      // Si seleccionó solo una, intentamos OCR. Si son muchas, mejor que escriba manual.
      if (uris.length === 1) {
        performOCR(uris[0]);
      } else {
        setNewPlate(""); // Limpiamos para evitar confusiones
      }
    }
  };

  // --- LÓGICA DE OCR ---
  const performOCR = async (uri: string) => {
    setIsProcessingOCR(true);
    setNewPlate("");
    try {
      const detectedText = await recognizePlate(uri);
      if (detectedText) {
        setNewPlate(detectedText);
      }
    } catch (e) {
      console.log("Error OCR ignorado o fallido", e);
    } finally {
      setIsProcessingOCR(false);
    }
  };

  // --- GUARDADO ---
  const savePhotos = async (plateNumber: string, isMainPlate: boolean) => {
    if (selectedUris.length === 0) return;
    if (!plateNumber || plateNumber.length < 3) {
      Alert.alert("Error", "La patente debe tener al menos 3 caracteres.");
      return;
    }

    setIsSaving(true);
    const cleanPlate = plateNumber.toUpperCase().trim();

    try {
      let savedCount = 0;

      // Iteramos sobre todas las fotos seleccionadas
      for (const uri of selectedUris) {
        // 1. Crear asset en la galería del sistema (OrganizadorPatente)
        // Nota: createAssetAsync mueve el archivo a la galería de DCIM/Pictures
        const asset = await MediaLibrary.createAssetAsync(uri);

        try {
          const album = await MediaLibrary.getAlbumAsync(cleanPlate);
          if (album === null) {
            // Primer foto de esta patente: crea el álbum
            await MediaLibrary.createAlbumAsync(cleanPlate, asset, false);
          } else {
            // El álbum ya existe: agrega la foto
            await MediaLibrary.addAssetsToAlbumAsync([asset], album, false);
          }
        } catch (albumError) {
          // Si falla el álbum no bloqueamos el guardado en BD
          console.warn("No se pudo crear/actualizar álbum:", albumError);
        }
        // 2. Determinar categoría
        // Si es importación masiva, todas van como detalle salvo lógica específica.
        // Aquí simplificamos: Si el usuario eligió "Nuevo Auto" y es UNA sola foto, es Principal.
        // Si son varias, todas van como Detalle para no tener múltiples portadas, o puedes refinar esto.
        let category = "Detalle Auto";
        if (selectedUris.length === 1 && isMainPlate) {
          category = "Patente Principal";
        }

        // 3. Insertar en BD
        await insertImage(uri, asset.id, category, cleanPlate);
        savedCount++;
      }

      // Éxito
      setModalVisible(false);
      setSelectedUris([]);
      setNewPlate("");

      // Feedback al usuario
      if (savedCount === 1) {
        Alert.alert("Guardado", `Foto asignada a: ${cleanPlate}`);
      } else {
        Alert.alert(
          "Fotos guardadas",
          `Se guardaron ${savedCount} fotos en ${cleanPlate}`,
        );
      }

      loadPlates(); // Recargar lista de abajo
    } catch (e) {
      Alert.alert("Error", "Hubo un problema al guardar las imágenes.");
      console.log(e);
    } finally {
      setIsSaving(false);
    }
  };

  // --- RENDER ---
  return (
    <PaperProvider theme={darkTheme}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />
      <View style={styles.container}>
        {/* PANTALLA PRINCIPAL (HUB) */}
        <View style={styles.menuContainer}>
          <View style={{ marginBottom: 40, alignItems: "center" }}>
            <Title style={styles.appTitle}>Organizador de Patentes</Title>
            <Paragraph style={{ color: "#888" }}>
              Selecciona el origen de las imágenes
            </Paragraph>
          </View>

          <View style={styles.buttonsRow}>
            {/* BOTÓN CÁMARA NATIVA */}
            <TouchableOpacity
              style={styles.bigButton}
              onPress={openNativeCamera}
              activeOpacity={0.8}
            >
              <View style={styles.iconCircle}>
                <IconButton icon="camera" iconColor="white" size={40} />
              </View>
              <Text style={styles.bigButtonText}>Cámara</Text>
              <Text style={styles.bigButtonSub}>Nativa</Text>
            </TouchableOpacity>

            {/* BOTÓN GALERÍA */}
            <TouchableOpacity
              style={[styles.bigButton, styles.galleryButton]}
              onPress={openGallery}
              activeOpacity={0.8}
            >
              <View
                style={[styles.iconCircle, { backgroundColor: "#485ec0ff" }]}
              >
                <IconButton icon="image-multiple" iconColor="white" size={40} />
              </View>
              <Text style={styles.bigButtonText}>Galería</Text>
              <Text style={styles.bigButtonSub}>Importar Fotos</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* --- MODAL DE CLASIFICACIÓN --- */}
        <Modal
          animationType="slide"
          transparent={true}
          visible={modalVisible}
          onRequestClose={() => setModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View
              style={[
                styles.modalContent,
                { paddingBottom: insets.bottom + 20 },
              ]}
            >
              <Title style={styles.modalTitle}>
                {selectedUris.length > 1
                  ? `Guardar ${selectedUris.length} Fotos`
                  : "Guardar Foto"}
              </Title>

              {/* Previsualización pequeña */}
              {selectedUris.length > 0 && (
                <Image
                  source={{ uri: selectedUris[0] }}
                  style={styles.miniPreview}
                />
              )}

              <ScrollView showsVerticalScrollIndicator={false}>
                {/* OPCIÓN 1: NUEVA PATENTE */}
                <Card style={styles.cardOption}>
                  <Card.Content>
                    <Paragraph style={{ color: "#aaa", marginBottom: 5 }}>
                      Nueva Patente
                    </Paragraph>
                    <View
                      style={{ flexDirection: "row", alignItems: "center" }}
                    >
                      <View style={{ flex: 1 }}>
                        <TextInput
                          mode="outlined"
                          label={isProcessingOCR ? "Escaneando..." : "Patente"}
                          value={newPlate}
                          onChangeText={setNewPlate}
                          style={{ height: 45, backgroundColor: "#2C2C2C" }}
                          textColor="white"
                          autoCapitalize="characters"
                          disabled={isProcessingOCR}
                          right={
                            isProcessingOCR ? (
                              <TextInput.Icon
                                icon={() => (
                                  <ActivityIndicator color="#2761ceff" />
                                )}
                              />
                            ) : null
                          }
                          theme={{
                            colors: {
                              primary: "#425be7ff",
                              onSurfaceVariant: "#888",
                            },
                          }}
                        />
                      </View>
                      <IconButton
                        icon="check-circle"
                        iconColor="#03DAC6"
                        size={35}
                        disabled={newPlate.length < 3 || isSaving}
                        onPress={() => savePhotos(newPlate, true)}
                      />
                    </View>
                  </Card.Content>
                </Card>

                <Text style={styles.dividerText}>
                  --- O asignar a carpeta existente ---
                </Text>

                {/* OPCIÓN 2: LISTA DE EXISTENTES */}
                {recentPlates.map((item, index) => (
                  <TouchableOpacity
                    key={index}
                    onPress={() => savePhotos(item.plate, false)}
                    disabled={isSaving}
                  >
                    <Card style={styles.cardPlate}>
                      <Card.Content style={styles.cardPlateContent}>
                        <View style={styles.plateInfo}>
                          <Image
                            source={{ uri: item.coverUri }}
                            style={styles.plateThumb}
                          />
                          <View>
                            <Title style={{ color: "#6480fdff" }}>
                              {item.plate}
                            </Title>
                            <Paragraph style={{ color: "#aaa", fontSize: 10 }}>
                              Agregar{" "}
                              {selectedUris.length > 1 ? "fotos" : "foto"}
                            </Paragraph>
                          </View>
                        </View>
                        <IconButton icon="folder-image" iconColor="#6480fdff" />
                      </Card.Content>
                    </Card>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <Button
                mode="outlined"
                textColor="#FF5252"
                onPress={() => {
                  setModalVisible(false);
                  setSelectedUris([]);
                  setNewPlate("");
                }}
                style={{ marginTop: 15, borderColor: "#FF5252" }}
              >
                Descartar / Cancelar
              </Button>
            </View>
          </View>
        </Modal>
      </View>
    </PaperProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "black" },

  // Estilos del Menú Principal
  menuContainer: {
    flex: 1,
    justifyContent: "center",
    padding: 20,
  },
  appTitle: {
    fontSize: 32,
    fontWeight: "bold",
    color: "white",
    textAlign: "center",
  },
  buttonsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 15,
  },
  bigButton: {
    flex: 1,
    height: 160,
    backgroundColor: "#1E1E1E",
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#333",
    elevation: 5,
  },
  galleryButton: {
    backgroundColor: "#1A1A1A",
  },
  iconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "#333",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 10,
  },
  bigButtonText: {
    color: "white",
    fontSize: 18,
    fontWeight: "bold",
  },
  bigButtonSub: {
    color: "#888",
    fontSize: 11,
    marginTop: 2,
  },

  // Estilos Modal
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.85)",
  },
  modalContent: {
    backgroundColor: "#1E1E1E",
    borderTopLeftRadius: 25,
    borderTopRightRadius: 25,
    padding: 20,
    maxHeight: "90%",
    borderColor: "#333",
    borderWidth: 1,
  },
  modalTitle: {
    textAlign: "center",
    marginBottom: 10,
    color: "white",
    fontWeight: "bold",
  },
  miniPreview: {
    width: 100,
    height: 100,
    alignSelf: "center",
    borderRadius: 10,
    marginBottom: 20,
    borderColor: "#444",
    borderWidth: 1,
  },
  cardOption: { marginBottom: 10, backgroundColor: "#2C2C2C" },
  dividerText: {
    textAlign: "center",
    marginVertical: 15,
    color: "#666",
    fontSize: 12,
  },
  cardPlate: {
    marginBottom: 8,
    backgroundColor: "#121212",
    borderColor: "#333",
    borderWidth: 1,
  },
  cardPlateContent: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  plateInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  plateThumb: {
    width: 40,
    height: 40,
    borderRadius: 5,
    backgroundColor: "#333",
  },
});
