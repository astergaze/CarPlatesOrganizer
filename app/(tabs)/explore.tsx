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
} from "react-native";
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
import * as Sharing from "expo-sharing";
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

  useFocusEffect(
    useCallback(() => {
      initDB().then(() => loadFolders());
    }, [])
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
        const itemData = item.plate
          ? item.plate.toUpperCase()
          : "".toUpperCase();
        const textData = query.toUpperCase();
        return itemData.indexOf(textData) > -1;
      });
      setFilteredFolders(newData);
    } else {
      setFilteredFolders(folders);
    }
  };

  // const handleVoiceSearch = () => {
  //   Alert.alert("Info", "Requiere permisos nativos.");
  // };

  const openFolder = async (plate: string) => {
    const data = await getPhotosByPlate(plate);
    setPhotos(data);
    setSelectedPlate(plate);
    setFolderModalVisible(true);
  };

  const openFullScreen = (index: number) => {
    setSelectedIndex(index);
    setIsFullScreen(true);
  };

  const shareImage = async () => {
    const currentPhoto = photos[selectedIndex];
    if (currentPhoto && (await Sharing.isAvailableAsync())) {
      await Sharing.shareAsync(currentPhoto.imageUri);
    } else {
      Alert.alert("Error", "No se puede compartir");
    }
  };

  // Delete folder
  const handleDeleteFolder = (plate: string) => {
    Alert.alert(
      "Eliminar Carpeta",
      `¿Borrar todo sobre ${plate} de la galería y la app?`,
      [
        { text: "Cancelar" },
        {
          text: "Borrar Todo",
          style: "destructive",
          onPress: async () => {
            try {
              const photosToDelete = await getPhotosByPlate(plate);

              const assetIds = photosToDelete
                .map((p) => p.assetId)
                .filter((id) => id && id.length > 0);

              if (assetIds.length > 0) {
                await MediaLibrary.deleteAssetsAsync(assetIds);
              }

              await deleteFolder(plate);

              loadFolders();
              setSearchQuery("");
            } catch (e) {
              console.log("Error borrando carpeta:", e);
              Alert.alert("Error", "No se pudieron borrar algunos archivos.");
            }
          },
        },
      ]
    );
  };

  // Delete photo
  const handleDeleteCurrentPhoto = () => {
    const currentPhoto = photos[selectedIndex];
    if (!currentPhoto) return;

    Alert.alert("Borrar Imagen", "¿Eliminar esta foto de tu dispositivo?", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Borrar",
        style: "destructive",
        onPress: async () => {
          try {
            if (currentPhoto.assetId) {
              await MediaLibrary.deleteAssetsAsync([currentPhoto.assetId]);
            }

            await deleteImage(currentPhoto.id);

            const newPhotos = photos.filter((p) => p.id !== currentPhoto.id);
            setPhotos(newPhotos);

            if (newPhotos.length === 0) {
              setIsFullScreen(false);
              loadFolders();
            } else {
              if (selectedIndex >= newPhotos.length) {
                setSelectedIndex(newPhotos.length - 1);
              }
            }
          } catch (e) {
            console.log("Error al borrar:", e);
            Alert.alert("Error", "No se pudo borrar de la galería.");
          }
        },
      },
    ]);
  };

  const renderPhotoItem = ({
    item,
    index,
  }: {
    item: ImageRecord;
    index: number;
  }) => (
    <TouchableOpacity
      style={styles.photoContainer}
      onPress={() => openFullScreen(index)}
      activeOpacity={0.7}
    >
      <Image source={{ uri: item.imageUri }} style={styles.photo} />
      {item.category === "Patente Principal" && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>PATENTE</Text>
        </View>
      )}
    </TouchableOpacity>
  );

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
            placeholder="Buscar patente..."
            onChangeText={onChangeSearch}
            value={searchQuery}
            style={styles.searchBar}
            inputStyle={{ color: "white" }}
            iconColor="#868efcff"
            placeholderTextColor="#666"
            // right={() => (
            //   <IconButton
            //     icon="microphone"
            //     iconColor="#BB86FC"
            //     onPress={handleVoiceSearch}
            //   />
            // )}
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
              No se encontraron patentes.
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
                description="Toca para ver detalles"
                descriptionStyle={{ color: "#888" }}
                left={() => (
                  <Image
                    source={{ uri: item.coverUri }}
                    style={styles.folderThumb}
                  />
                )}
                right={(props) => (
                  <IconButton
                    {...props}
                    icon="delete-outline"
                    iconColor="#CF6679"
                    onPress={() => handleDeleteFolder(item.plate)}
                  />
                )}
                onPress={() => openFolder(item.plate)}
                style={styles.folderItem}
              />
            )}
          />
        )}

        <Modal
          visible={folderModalVisible}
          onDismiss={() => setFolderModalVisible(false)}
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
              </View>
            </View>
            <FlatList
              data={photos}
              renderItem={renderPhotoItem}
              keyExtractor={(item) => item.id.toString()}
              numColumns={3}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ padding: 5 }}
            />
            <Button
              mode="outlined"
              onPress={() => setFolderModalVisible(false)}
              textColor="white"
              style={styles.closeButton}
            >
              Cerrar
            </Button>
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
                <IconButton
                  icon="share-variant"
                  iconColor="white"
                  size={26}
                  onPress={shareImage}
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
  closeButton: { margin: 10, borderColor: "#555" },

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
});
