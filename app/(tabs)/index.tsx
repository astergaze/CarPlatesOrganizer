import React, { useEffect, useState, useRef, useCallback } from "react";
import {
  StyleSheet,
  View,
  Image,
  Modal,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  ActivityIndicator, 
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
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
} from "react-native-paper";
import { useFocusEffect } from "expo-router";
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

export default function CameraScreen() {
  const [permission, requestPermission] = useCameraPermissions({
    request: false,
  });
  const [mediaPermission, requestMediaPermission] = MediaLibrary.usePermissions(
    { writeOnly: true }
  );

  const cameraRef = useRef<CameraView>(null);
  const [photoUri, setPhotoUri] = useState<string | null>(null);

  const [modalVisible, setModalVisible] = useState(false);
  const [newPlate, setNewPlate] = useState("");

  const [recentPlates, setRecentPlates] = useState<FolderPreview[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  const [isProcessingOCR, setIsProcessingOCR] = useState(false);

  useEffect(() => {
    initDB();
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadPlates();
    }, [])
  );

  const loadPlates = async () => {
    const plates = await getUniquePlates();
    setRecentPlates(plates);
  };

  useEffect(() => {
    (async () => {
      if (!permission?.granted) await requestPermission();
      if (!mediaPermission?.granted) await requestMediaPermission();
    })();
  }, []);

  const takePicture = async () => {
    if (cameraRef.current) {
      try {
        const photoData = await cameraRef.current.takePictureAsync({
          quality: 1,
          skipProcessing: true,
        });
        if (photoData?.uri) {
          setPhotoUri(photoData.uri);
          setModalVisible(true);

          performOCR(photoData.uri);

          loadPlates();
        }
      } catch (error) {
        console.log("Error foto:", error);
      }
    }
  };

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

  const saveFinalPhoto = async (plateNumber: string, isMainPlate: boolean) => {
    if (!photoUri) return;
    setIsSaving(true);

    try {
      const asset = await MediaLibrary.createAssetAsync(photoUri);

      const category = isMainPlate ? "Patente Principal" : "Detalle Auto";

      await insertImage(
        asset.uri,
        asset.id,
        category,
        plateNumber.toUpperCase()
      );

      setModalVisible(false);
      setPhotoUri(null);
      setNewPlate("");
      alert(`Guardado en: ${plateNumber.toUpperCase()}`);
    } catch (e) {
      alert("Error al guardar");
      console.log(e);
    } finally {
      setIsSaving(false);
    }
  };

  if (!permission || !mediaPermission)
    return <View style={{ backgroundColor: "#000", flex: 1 }} />;

  return (
    <PaperProvider theme={darkTheme}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />
      <View style={styles.container}>
        {!photoUri ? (
          <View style={{ flex: 1 }}>
            <CameraView
              style={StyleSheet.absoluteFillObject}
              facing="back"
              ref={cameraRef}
            />

            
            <View style={styles.overlayUI}>
              <View style={styles.buttonContainer}>
                <Button
                  mode="contained"
                  icon="camera"
                  onPress={takePicture}
                  buttonColor="#6a7ff8ff"
                  textColor="white"
                  contentStyle={{ height: 70, width: 70 }}
                  style={{ borderRadius: 50, justifyContent: "center" }}
                >
                  {""}
                </Button>
              </View>
            </View>
          </View>
        ) : (
          <View style={styles.previewContainer}>
            <Image source={{ uri: photoUri }} style={styles.preview} />
          </View>
        )}

        <Modal
          animationType="slide"
          transparent={true}
          visible={modalVisible}
          onRequestClose={() => setModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Title
                style={{
                  textAlign: "center",
                  marginBottom: 10,
                  color: "white",
                }}
              >
                Organizar Foto
              </Title>
              <Image
                source={{ uri: photoUri || "" }}
                style={{
                  width: 100,
                  height: 100,
                  alignSelf: "center",
                  borderRadius: 8,
                  marginBottom: 15,
                  borderColor: "#333",
                  borderWidth: 1,
                }}
              />

              <ScrollView>
                <Card style={styles.cardOption}>
                  <Card.Content>
                    <Paragraph style={{ color: "#aaa", marginBottom: 5 }}>
                      Nuevo Auto
                    </Paragraph>
                    <View
                      style={{ flexDirection: "row", alignItems: "center" }}
                    >
                      <View style={{ flex: 1 }}>
                        <TextInput
                          mode="outlined"
                          label={isProcessingOCR ? "Leyendo..." : "Patente"}
                          value={newPlate}
                          onChangeText={setNewPlate}
                          style={{
                            height: 45,
                            backgroundColor: "#2C2C2C",
                          }}
                          textColor="white"
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
                        onPress={() => saveFinalPhoto(newPlate, true)}
                      />
                    </View>
                  </Card.Content>
                </Card>

                <Text
                  style={{
                    textAlign: "center",
                    marginVertical: 15,
                    color: "#666",
                  }}
                >
                  --- O asignar a existente ---
                </Text>

                {recentPlates.map((item, index) => (
                  <TouchableOpacity
                    key={index}
                    onPress={() => saveFinalPhoto(item.plate, false)}
                    disabled={isSaving}
                  >
                    <Card style={styles.cardPlate}>
                      <Card.Content
                        style={{
                          flexDirection: "row",
                          justifyContent: "space-between",
                          alignItems: "center",
                        }}
                      >
                        <View
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 10,
                          }}
                        >
                          <Image
                            source={{ uri: item.coverUri }}
                            style={{
                              width: 40,
                              height: 40,
                              borderRadius: 5,
                              backgroundColor: "#333",
                            }}
                          />
                          <View>
                            <Title style={{ color: "#6480fdff" }}>
                              {item.plate}
                            </Title>
                            <Paragraph style={{ color: "#aaa", fontSize: 10 }}>
                              Agregar detalle
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
                  setPhotoUri(null);
                }}
                style={{ marginTop: 15, borderColor: "#FF5252" }}
              >
                Descartar Foto
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
  overlayUI: {
    flex: 1,
    backgroundColor: "transparent",
    justifyContent: "flex-end",
  },
  buttonContainer: {
    padding: 30,
    alignItems: "center",
    marginBottom: 20,
  },
  previewContainer: {
    flex: 1,
    backgroundColor: "black",
    justifyContent: "center",
  },
  preview: { width: "100%", height: "100%", opacity: 0.3 },

  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.8)",
  },
  modalContent: {
    backgroundColor: "#1E1E1E",
    borderTopLeftRadius: 25,
    borderTopRightRadius: 25,
    padding: 20,
    maxHeight: "85%",
    borderColor: "#333",
    borderWidth: 1,
  },
  cardOption: { marginBottom: 10, backgroundColor: "#2C2C2C" },
  cardPlate: {
    marginBottom: 8,
    backgroundColor: "#121212",
    borderColor: "#333",
    borderWidth: 1,
  },
});
