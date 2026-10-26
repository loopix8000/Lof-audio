import { useMemo } from "react";
import { Track } from "../../types";
import { getFallbackCoverUrl } from "../../utils/lrc";
import { TableEntry } from "../../components/TrackRows";
import { matchesTrackQuery, naturalCompare } from "./filtering";
import type { LibraryStateModel } from "./useLibraryState";
import { isFolderWithin } from "../workspaces/scope";

interface Inputs {
  libraryState: LibraryStateModel;
}

export function useLibraryView({
  libraryState,
}: Inputs) {
  const {
    tracks,
    navCategory,
    activePlaylistId,
    playlists,
    subFilter,
    searchQuery,
    sortField,
    sortAsc,
    folderViewMode,
  } = libraryState;
  const displayedTracks = useMemo(() => {
    let list = [...tracks];

    if (navCategory === "favorites") {
      list = list.filter((t) => t.isFavorite);
    } else if (navCategory === "playlist" && activePlaylistId !== null) {
      const pl = playlists.find((p) => p.id === activePlaylistId);
      if (pl) {
        const set = new Set(pl.trackIds);
        list = list.filter((t) => set.has(t.id));
      }
    } else if (navCategory === "artists" && subFilter) {
      list = list.filter((t) => t.artist === subFilter);
    } else if (navCategory === "albums" && subFilter) {
      list = list.filter((t) => t.album === subFilter);
    } else if (navCategory === "folders" && subFilter) {
      list = list.filter((t) => isFolderWithin(t.folderPath, subFilter));
    }

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(t => matchesTrackQuery(t, q));
    }

    list.sort((a, b) => {
      let cmp = 0;
      if (sortField === "trackNumber") {
        cmp =
          (a.trackNumber ?? 99999) - (b.trackNumber ?? 99999) ||
          naturalCompare(a.fileName, b.fileName) ||
          naturalCompare(a.title, b.title);
      } else if (sortField === "title") {
        cmp =
          naturalCompare(a.title, b.title) ||
          naturalCompare(a.fileName, b.fileName);
      } else if (sortField === "artist") {
        cmp =
          naturalCompare(a.artist, b.artist) ||
          naturalCompare(a.album, b.album) ||
          (a.trackNumber ?? 99999) - (b.trackNumber ?? 99999) ||
          naturalCompare(a.title, b.title);
      } else if (sortField === "album") {
        cmp =
          naturalCompare(a.album, b.album) ||
          (a.trackNumber ?? 99999) - (b.trackNumber ?? 99999) ||
          naturalCompare(a.fileName, b.fileName) ||
          naturalCompare(a.title, b.title);
      } else if (sortField === "durationSecs") {
        cmp =
          a.durationSecs - b.durationSecs ||
          naturalCompare(a.title, b.title);
      } else if (sortField === "year") {
        cmp =
          (a.year ?? 0) - (b.year ?? 0) ||
          naturalCompare(a.album, b.album) ||
          naturalCompare(a.title, b.title);
      }
      return sortAsc ? cmp : -cmp;
    });

    return list;
  }, [
    tracks,
    navCategory,
    activePlaylistId,
    playlists,
    subFilter,
    searchQuery,
    sortField,
    sortAsc,
  ]);

  const totalDisplayedDuration = useMemo(
    () => displayedTracks.reduce((acc, t) => acc + (t.durationSecs || 0), 0),
    [displayedTracks]
  );

  const effectiveLibView = useMemo<
    "grouped" | "flat" | "artist-grid" | "album-grid" | "folder-grid" | "folder-directory"
  >(() => {
    if (navCategory === "all") return "grouped";
    if (navCategory === "favorites" || navCategory === "playlist") return "flat";
    if (navCategory === "artists") {
      return subFilter === null ? "artist-grid" : "grouped";
    }
    if (navCategory === "albums") {
      return subFilter === null ? "album-grid" : "grouped";
    }
    if (navCategory === "folders") {
      if (folderViewMode === "directory") return "folder-directory";
      return subFilter === null ? "folder-grid" : "grouped";
    }
    return "grouped";
  }, [navCategory, subFilter, folderViewMode]);

  const searchFilteredTracks = useMemo(() => {
    if (!searchQuery.trim()) return tracks;
    const q = searchQuery.trim().toLowerCase();
    return tracks.filter(t => matchesTrackQuery(t, q));
  }, [tracks, searchQuery]);

  const artistCards = useMemo(() => {
    const map = new Map<
      string,
      {
        artist: string;
        cover: string;
        albums: Set<string>;
        tracks: Track[];
      }
    >();
    for (const t of searchFilteredTracks) {
      const key = t.artist || "Unknown Artist";
      if (!map.has(key)) {
        map.set(key, {
          artist: key,
          cover: t.coverDataUrl || getFallbackCoverUrl(key, t.album),
          albums: new Set([t.album]),
          tracks: [t],
        });
      } else {
        const entry = map.get(key)!;
        entry.albums.add(t.album);
        entry.tracks.push(t);
        if (!entry.cover.startsWith("data:image/jpeg") && t.coverDataUrl) {
          entry.cover = t.coverDataUrl;
        }
      }
    }
    return Array.from(map.values())
      .map((item) => ({
        artist: item.artist,
        cover: item.cover,
        albumCount: item.albums.size,
        trackCount: item.tracks.length,
        tracks: item.tracks,
      }))
      .sort((a, b) => naturalCompare(a.artist, b.artist));
  }, [searchFilteredTracks]);

  const albumCards = useMemo(() => {
    const map = new Map<
      string,
      {
        album: string;
        artist: string;
        year: number | null;
        cover: string;
        tracks: Track[];
      }
    >();
    for (const t of searchFilteredTracks) {
      const key = t.album || "Unknown Album";
      if (!map.has(key)) {
        map.set(key, {
          album: key,
          artist: t.albumArtist || t.artist,
          year: t.year,
          cover: t.coverDataUrl || getFallbackCoverUrl(key, t.artist),
          tracks: [t],
        });
      } else {
        const entry = map.get(key)!;
        entry.tracks.push(t);
        if (!entry.cover.startsWith("data:image/jpeg") && t.coverDataUrl) {
          entry.cover = t.coverDataUrl;
        }
      }
    }
    return Array.from(map.values()).sort((a, b) =>
      naturalCompare(a.album, b.album)
    );
  }, [searchFilteredTracks]);

  const folderCards = useMemo(() => {
    const map = new Map<
      string,
      {
        folderPath: string;
        folderName: string;
        cover: string;
        tracks: Track[];
      }
    >();
    for (const t of searchFilteredTracks) {
      const key = t.folderPath;
      if (!map.has(key)) {
        const folderName = key.split(/[\\/]/).pop() || key;
        map.set(key, {
          folderPath: key,
          folderName,
          cover: t.coverDataUrl || getFallbackCoverUrl(folderName, t.artist),
          tracks: [t],
        });
      } else {
        const entry = map.get(key)!;
        entry.tracks.push(t);
        if (!entry.cover.startsWith("data:image/jpeg") && t.coverDataUrl) {
          entry.cover = t.coverDataUrl;
        }
      }
    }
    return Array.from(map.values()).sort((a, b) =>
      naturalCompare(a.folderName, b.folderName)
    );
  }, [searchFilteredTracks]);

  const albumGroups = useMemo(() => {
    const map = new Map<
      string,
      {
        key: string;
        album: string;
        artist: string;
        year: number | null;
        cover: string;
        tracks: Track[];
      }
    >();
    for (const t of displayedTracks) {
      const key = `${t.album}__${t.albumArtist || t.artist}`;
      if (!map.has(key)) {
        map.set(key, {
          key,
          album: t.album,
          artist: t.albumArtist || t.artist,
          year: t.year,
          cover: t.coverDataUrl || getFallbackCoverUrl(t.album, t.artist),
          tracks: [t],
        });
      } else {
        const g = map.get(key)!;
        g.tracks.push(t);
        if (!g.cover.startsWith("data:image/jpeg") && t.coverDataUrl) {
          g.cover = t.coverDataUrl;
        }
      }
    }
    return Array.from(map.values());
  }, [displayedTracks]);

  const tableEntries = useMemo<TableEntry[]>(() => {
    const entries: TableEntry[] = [];
    if (effectiveLibView === "grouped") {
      for (const group of albumGroups) {
        entries.push({ kind: "album", group });
        group.tracks.forEach((track, index) => entries.push({ kind: "track", track, index, previous: group.tracks[index - 1]?.id, next: group.tracks[index + 1]?.id }));
      }
    } else {
      displayedTracks.forEach((track, index) => entries.push({ kind: "track", track, index, previous: displayedTracks[index - 1]?.id, next: displayedTracks[index + 1]?.id }));
    }
    return entries;
  }, [effectiveLibView, albumGroups, displayedTracks]);

  const libraryCounts = useMemo(() => ({
    favorites: tracks.filter(t => t.isFavorite).length,
    artists: new Set(tracks.map(t => t.artist)).size,
    albums: new Set(tracks.map(t => t.album)).size,
  }), [tracks]);

  const currentViewTitle =
    navCategory === "all"
      ? "모든 음악"
      : navCategory === "favorites"
        ? "즐겨찾기"
        : navCategory === "artists"
          ? subFilter || "아티스트"
          : navCategory === "albums"
            ? subFilter || "앨범"
            : navCategory === "folders"
              ? subFilter
                ? subFilter.split(/[\\/]/).pop()
                : "폴더"
              : playlists.find((p) => p.id === activePlaylistId)?.name ||
              "플레이리스트";

  return {
    displayedTracks,
    libraryCounts,
    currentViewTitle,
    effectiveLibView,
    artistCards,
    searchFilteredTracks,
    albumCards,
    folderCards,
    totalDisplayedDuration,
    tableEntries,
  };
}

export type LibraryViewModel = ReturnType<typeof useLibraryView>;
