import type {
  AnalyticsPoint,
  AppNotification,
  Creator,
  CreatorComment,
  TrailerSummary,
  Video,
} from "@/types/domain";

/**
 * Mock fixtures for the frontend walking skeleton (spec 10A.2).
 * Thumbnails use a deterministic placeholder service; the watch player
 * uses a public sample HLS stream until the real pipeline exists.
 */

const SAMPLE_HLS =
  "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8";

function thumb(seed: string): string {
  return `https://picsum.photos/seed/${seed}/640/360`;
}

export const creators: Creator[] = [
  {
    id: "c_1",
    username: "neondirector",
    displayName: "Neon Director",
    avatarUrl: thumb("neondirector-avatar"),
    followerCount: 850,
  },
  {
    id: "c_2",
    username: "synthstudios",
    displayName: "Synth Studios",
    avatarUrl: thumb("synthstudios-avatar"),
    followerCount: 4200,
  },
  {
    id: "c_3",
    username: "latentdreams",
    displayName: "Latent Dreams",
    avatarUrl: thumb("latentdreams-avatar"),
    followerCount: 11800,
  },
];

const base = {
  language: "en",
  visibility: "PUBLIC" as const,
  publicationStatus: "PUBLISHED" as const,
  processingStatus: "READY" as const,
  isAiGenerated: true,
  isLiked: false,
  hlsUrl: SAMPLE_HLS,
  createdAt: "2026-10-01T08:00:00Z",
  publishedAt: "2026-10-02T08:00:00Z",
  seasonNumber: null as number | null,
  episodeNumber: null as number | null,
  version: 0,
  trailerVideoId: null as string | null,
  trailer: null as TrailerSummary | null,
};

export const mockVideos: Video[] = [
  {
    ...base,
    id: "v_1",
    slug: "beyond-the-universe",
    title: "Beyond the Universe",
    description:
      "A lone AI probe drifts past the edge of the known galaxy and discovers it is not alone. A full-length AI-generated science fiction feature.",
    type: "MOVIE",
    thumbnailUrl: thumb("beyond-the-universe"),
    durationSeconds: 5100,
    genre: "Science Fiction",
    viewCount: 25000,
    likeCount: 1840,
    creator: creators[0],
  },
  {
    ...base,
    id: "v_2",
    slug: "the-last-kingdom-of-ai-s1e1",
    title: "The Last Kingdom of AI — The Beginning",
    description:
      "Season 1, Episode 1. In a world rebuilt by machines, one kingdom resists the central intelligence.",
    type: "EPISODE",
    thumbnailUrl: thumb("last-kingdom-s1e1"),
    durationSeconds: 1380,
    genre: "Fantasy",
    viewCount: 12400,
    likeCount: 920,
    creator: creators[1],
  },
  {
    ...base,
    id: "v_3",
    slug: "the-final-mission",
    title: "The Final Mission",
    description:
      "A two-minute AI-generated action sequence rendered entirely from a single prompt.",
    type: "SHORT",
    thumbnailUrl: thumb("final-mission"),
    durationSeconds: 125,
    genre: "Action",
    viewCount: 48000,
    likeCount: 5100,
    creator: creators[0],
  },
  {
    ...base,
    id: "v_4",
    slug: "echoes-of-tomorrow",
    title: "Echoes of Tomorrow",
    description:
      "A quiet AI drama about memory and loss, set in a city that never sleeps.",
    type: "MOVIE",
    thumbnailUrl: thumb("echoes-of-tomorrow"),
    durationSeconds: 4200,
    genre: "Drama",
    viewCount: 9800,
    likeCount: 610,
    creator: creators[1],
  },
  {
    ...base,
    id: "v_5",
    slug: "midnight-protocol",
    title: "Midnight Protocol",
    description:
      "A cyber-thriller short following a rogue process through a dying network.",
    type: "SHORT",
    thumbnailUrl: thumb("midnight-protocol"),
    durationSeconds: 300,
    genre: "Thriller",
    viewCount: 31200,
    likeCount: 2740,
    creator: creators[0],
  },
  {
    ...base,
    id: "v_6",
    slug: "the-garden-of-circuits",
    title: "The Garden of Circuits",
    description:
      "An animated AI short about a robot gardener tending the last green space on Earth.",
    type: "SHORT",
    thumbnailUrl: thumb("garden-of-circuits"),
    durationSeconds: 210,
    genre: "Animation",
    viewCount: 15600,
    likeCount: 1320,
    creator: creators[1],
  },
  {
    ...base,
    id: "v_9",
    slug: "the-last-kingdom-of-ai-s1e2",
    title: "The Last Kingdom of AI — The Betrayal",
    description:
      "Season 1, Episode 2. Trust fractures as the central intelligence offers the kingdom a bargain.",
    type: "EPISODE",
    thumbnailUrl: thumb("last-kingdom-s1e2"),
    durationSeconds: 1500,
    genre: "Fantasy",
    viewCount: 9100,
    likeCount: 640,
    creator: creators[1],
  },
  {
    ...base,
    id: "v_10",
    slug: "saltwater-static",
    title: "Saltwater Static",
    description:
      "A full-length AI drama following a radio operator on a flooded coast listening for a voice that may not exist.",
    type: "MOVIE",
    thumbnailUrl: thumb("saltwater-static"),
    durationSeconds: 5820,
    genre: "Drama",
    viewCount: 62000,
    likeCount: 7300,
    creator: creators[2],
  },
  {
    ...base,
    id: "v_11",
    slug: "paper-moons",
    title: "Paper Moons",
    description:
      "A romance feature about two archivists restoring films that were never really shot.",
    type: "MOVIE",
    thumbnailUrl: thumb("paper-moons"),
    durationSeconds: 4680,
    genre: "Romance",
    viewCount: 28400,
    likeCount: 3100,
    creator: creators[2],
  },
  {
    ...base,
    id: "v_12",
    slug: "hollow-signal",
    title: "Hollow Signal",
    description:
      "A sixty-second horror short. Something is answering the test broadcast.",
    type: "SHORT",
    thumbnailUrl: thumb("hollow-signal"),
    durationSeconds: 60,
    genre: "Horror",
    viewCount: 54000,
    likeCount: 6200,
    creator: creators[0],
  },
  {
    ...base,
    id: "v_13",
    slug: "the-moonlit-oath",
    title: "The Moonlit Oath",
    description:
      "A swordswoman bound by a vow she cannot remember making searches a lantern-lit city for the one who holds the other half of it.",
    type: "MOVIE",
    thumbnailUrl: thumb("moonlit-oath"),
    durationSeconds: 6240,
    genre: "Historical",
    viewCount: 88000,
    likeCount: 9400,
    creator: creators[2],
  },
  {
    ...base,
    id: "v_14",
    slug: "my-ai-roommate",
    title: "My AI Roommate",
    description:
      "A comedy about a lonely illustrator and the household robot that keeps rewriting her grocery list.",
    type: "MOVIE",
    thumbnailUrl: thumb("ai-roommate"),
    durationSeconds: 5400,
    genre: "Comedy",
    viewCount: 23100,
    likeCount: 2900,
    creator: creators[1],
  },
];

/** The signed-in viewer's saved videos (spec 3.20). */
export const mockWatchlist: Video[] = [
  mockVideos[3],
  mockVideos[0],
  mockVideos[5],
];

/** In-app notifications (spec 3.21). */
export const mockNotifications: AppNotification[] = [
  {
    id: "n_1",
    type: "CREATOR_PUBLISHED",
    message: "Latent Dreams published a new film: Saltwater Static.",
    read: false,
    createdAt: "2026-11-07T02:10:00Z",
  },
  {
    id: "n_2",
    type: "NEW_COMMENT",
    message: "Avery left a comment on Beyond the Universe.",
    read: false,
    createdAt: "2026-11-06T18:40:00Z",
  },
  {
    id: "n_3",
    type: "PROCESSING_COMPLETE",
    message: "Rising Tide finished processing and is ready to publish.",
    read: false,
    createdAt: "2026-11-06T12:30:00Z",
  },
  {
    id: "n_4",
    type: "NEW_FOLLOWER",
    message: "Synth Studios started following you.",
    read: true,
    createdAt: "2026-11-05T09:15:00Z",
  },
  {
    id: "n_5",
    type: "CONTENT_LIKED",
    message: "Your short The Final Mission passed 5,000 likes.",
    read: true,
    createdAt: "2026-11-04T21:05:00Z",
  },
];

/** Recent comments across the creator's videos (spec 3.17). */
export const mockCreatorComments: CreatorComment[] = [
  {
    id: "cm_1",
    authorName: "Avery",
    videoTitle: "Beyond the Universe",
    body: "The third act completely caught me off guard. How did you prompt that lighting?",
    createdAt: "2026-11-06T18:40:00Z",
  },
  {
    id: "cm_2",
    authorName: "Juno",
    videoTitle: "The Final Mission",
    body: "Two minutes and not a wasted frame. More of this please.",
    createdAt: "2026-11-06T11:02:00Z",
  },
  {
    id: "cm_3",
    authorName: "Rhys",
    videoTitle: "Midnight Protocol",
    body: "The sound design is doing so much heavy lifting here.",
    createdAt: "2026-11-05T15:28:00Z",
  },
];

/** 14 days of view counts for the analytics chart (spec 3.22). */
export const mockViewsSeries: AnalyticsPoint[] = Array.from(
  { length: 14 },
  (_, i) => {
    const date = new Date(2026, 9, 24 + i);
    const base = 1800 + Math.round(Math.sin(i / 2) * 700) + i * 140;
    return {
      date: date.toISOString().slice(0, 10),
      views: Math.max(400, base),
    };
  },
);

/** The signed-in creator's own content, including non-published items. */
export const mockMyContent: Video[] = [
  mockVideos[0],
  mockVideos[2],
  mockVideos[4],
  {
    ...base,
    id: "v_7",
    slug: "untitled-draft",
    title: "Untitled Draft",
    description: "Work in progress.",
    type: "MOVIE",
    thumbnailUrl: null,
    hlsUrl: null,
    durationSeconds: 0,
    genre: "Drama",
    viewCount: 0,
    likeCount: 0,
    publicationStatus: "DRAFT",
    processingStatus: "READY",
    publishedAt: null,
    createdAt: "2026-11-05T10:00:00Z",
    creator: creators[0],
  },
  {
    ...base,
    id: "v_8",
    slug: "rising-tide",
    title: "Rising Tide",
    description: "Currently transcoding.",
    type: "MOVIE",
    thumbnailUrl: thumb("rising-tide"),
    hlsUrl: null,
    durationSeconds: 3600,
    genre: "Documentary",
    viewCount: 0,
    likeCount: 0,
    publicationStatus: "PROCESSING",
    processingStatus: "PROCESSING",
    publishedAt: null,
    createdAt: "2026-11-06T12:00:00Z",
    creator: creators[0],
  },
];
