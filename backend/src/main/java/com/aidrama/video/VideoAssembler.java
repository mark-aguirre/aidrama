package com.aidrama.video;

import com.aidrama.like.VideoLikeRepository;
import com.aidrama.series.Season;
import com.aidrama.series.SeasonRepository;
import com.aidrama.storage.MediaUrls;
import com.aidrama.user.CreatorSummary;
import com.aidrama.user.UserRepository;
import com.aidrama.video.VideoDtos.TrailerResponse;
import com.aidrama.video.VideoDtos.VideoResponse;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.stereotype.Component;

/**
 * Maps videos to {@link VideoResponse}. Related data (creators, assets, seasons, trailers) is loaded
 * with one query per kind for the whole list, so a page of N videos costs a constant number of queries.
 *
 * <p>Two views share one mapping. The public view ({@link #assemble}) exposes a trailer only when it is
 * playable. The creator view ({@link #assembleForCreator}) additionally reports the id of a linked trailer
 * that is not playable yet, so the creator UI can follow its processing.
 *
 * <p>Pass a viewer id to the public view to fill {@code isLiked}: the likes of a whole page are read with one
 * query. Without a viewer (anonymous caller, creator view) {@code isLiked} is false and no query runs.
 */
@Component
public class VideoAssembler {

    private static final Set<AssetType> PLAYBACK_ASSETS = EnumSet.of(AssetType.HLS_MASTER, AssetType.THUMBNAIL);

    private final UserRepository users;
    private final VideoRepository videoRepository;
    private final VideoAssetRepository assets;
    private final SeasonRepository seasons;
    private final MediaUrls mediaUrls;
    private final VideoLikeRepository likes;

    public VideoAssembler(
            UserRepository users,
            VideoRepository videoRepository,
            VideoAssetRepository assets,
            SeasonRepository seasons,
            MediaUrls mediaUrls,
            VideoLikeRepository likes) {
        this.users = users;
        this.videoRepository = videoRepository;
        this.assets = assets;
        this.seasons = seasons;
        this.mediaUrls = mediaUrls;
        this.likes = likes;
    }

    /** Public view: {@code trailer} and {@code trailerVideoId} are set only for a playable trailer. */
    public List<VideoResponse> assemble(List<Video> videos) {
        return build(videos, false, null);
    }

    public VideoResponse assembleOne(Video video) {
        return build(List.of(video), false, null).getFirst();
    }

    /** Public view that also sets {@code isLiked} for {@code viewerId} (null for an anonymous caller). */
    public List<VideoResponse> assemble(List<Video> videos, UUID viewerId) {
        return build(videos, false, viewerId);
    }

    public VideoResponse assembleOne(Video video, UUID viewerId) {
        return build(List.of(video), false, viewerId).getFirst();
    }

    /** Creator view: {@code trailerVideoId} is also set while the linked trailer exists but is not playable yet. */
    public List<VideoResponse> assembleForCreator(List<Video> videos) {
        return build(videos, true, null);
    }

    public VideoResponse assembleOneForCreator(Video video) {
        return build(List.of(video), true, null).getFirst();
    }

    private List<VideoResponse> build(List<Video> videos, boolean creatorView, UUID viewerId) {
        if (videos.isEmpty()) {
            return List.of();
        }
        List<UUID> videoIds = videos.stream().map(Video::getId).toList();
        Set<UUID> creatorIds = videos.stream().map(Video::getCreatorId).collect(Collectors.toSet());
        Set<UUID> seasonIds = videos.stream().map(Video::getSeasonId).filter(Objects::nonNull).collect(Collectors.toSet());

        Map<UUID, Video> trailers = liveTrailers(videos);
        Set<UUID> likedByViewer = viewerId == null ? Set.of() : likes.findLikedVideoIds(viewerId, videoIds);

        Map<UUID, CreatorSummary> creators = users.findCreatorSummaries(creatorIds).stream()
                .collect(Collectors.toMap(CreatorSummary::id, Function.identity()));

        // One asset query for the titles and for their playable trailers.
        List<UUID> assetOwnerIds = new ArrayList<>(videoIds);
        trailers.values().stream().filter(Video::isPlayableTrailer).map(Video::getId).forEach(assetOwnerIds::add);
        List<VideoAsset> playback =
                assets.findByVideoIdInAndAssetTypeInAndProcessingStatus(assetOwnerIds, PLAYBACK_ASSETS, ProcessingStatus.READY);
        Map<UUID, VideoAsset> hlsByVideo = new HashMap<>();
        Map<UUID, VideoAsset> thumbById = new HashMap<>();
        for (VideoAsset asset : playback) {
            if (asset.getAssetType() == AssetType.HLS_MASTER) {
                hlsByVideo.put(asset.getVideoId(), asset);
            } else {
                thumbById.put(asset.getId(), asset);
            }
        }
        Map<UUID, Integer> seasonNumbers = seasonIds.isEmpty()
                ? Map.of()
                : seasons.findAllByIdIn(seasonIds).stream()
                        .collect(Collectors.toMap(Season::getId, Season::getSeasonNumber));

        return videos.stream()
                .map(v -> {
                    Video linked = linkedTrailer(v, trailers);
                    TrailerResponse trailer = playableTrailer(linked, hlsByVideo, thumbById);
                    UUID trailerVideoId = creatorView
                            ? (linked == null ? null : linked.getId())
                            : (trailer == null ? null : trailer.id());
                    return toResponse(v, creators.get(v.getCreatorId()), hlsByVideo.get(v.getId()),
                            v.getThumbnailAssetId() == null ? null : thumbById.get(v.getThumbnailAssetId()),
                            v.getSeasonId() == null ? null : seasonNumbers.get(v.getSeasonId()),
                            trailerVideoId, trailer, likedByViewer.contains(v.getId()));
                })
                .toList();
    }

    /** The not-deleted videos that the given titles link as trailer, by id. Empty without a query when none link one. */
    private Map<UUID, Video> liveTrailers(List<Video> videos) {
        Set<UUID> trailerIds = videos.stream().map(Video::getTrailerVideoId).filter(Objects::nonNull).collect(Collectors.toSet());
        if (trailerIds.isEmpty()) {
            return Map.of();
        }
        return videoRepository.findByIdInAndDeletedAtIsNull(trailerIds).stream()
                .collect(Collectors.toMap(Video::getId, Function.identity()));
    }

    /** The linked trailer row, or null when there is none or it is gone. The creator check is defence in depth: the database already requires it. */
    private static Video linkedTrailer(Video parent, Map<UUID, Video> trailers) {
        if (parent.getTrailerVideoId() == null) {
            return null;
        }
        Video linked = trailers.get(parent.getTrailerVideoId());
        return linked != null && linked.getCreatorId().equals(parent.getCreatorId()) ? linked : null;
    }

    private TrailerResponse playableTrailer(Video linked, Map<UUID, VideoAsset> hlsByVideo, Map<UUID, VideoAsset> thumbById) {
        if (linked == null || !linked.isPlayableTrailer()) {
            return null;
        }
        VideoAsset hls = hlsByVideo.get(linked.getId());
        if (hls == null) {
            return null; // READY but no stream registered: not playable, so not a trailer.
        }
        VideoAsset thumbnail = linked.getThumbnailAssetId() == null ? null : thumbById.get(linked.getThumbnailAssetId());
        return new TrailerResponse(
                linked.getId(),
                linked.getTitle(),
                mediaUrls.publicUrl(hls.getStorageKey()),
                thumbnail == null ? null : mediaUrls.publicUrl(thumbnail.getStorageKey()),
                linked.getDurationSeconds() == null ? 0 : linked.getDurationSeconds());
    }

    private VideoResponse toResponse(
            Video v,
            CreatorSummary creator,
            VideoAsset hls,
            VideoAsset thumbnail,
            Integer seasonNumber,
            UUID trailerVideoId,
            TrailerResponse trailer,
            boolean liked) {
        return new VideoResponse(
                v.getId(),
                v.getSlug(),
                v.getTitle(),
                v.getDescription(),
                v.getType(),
                thumbnail == null ? null : mediaUrls.publicUrl(thumbnail.getStorageKey()),
                hls == null ? null : mediaUrls.publicUrl(hls.getStorageKey()),
                v.getDurationSeconds() == null ? 0 : v.getDurationSeconds(),
                v.getGenre() == null ? "" : v.getGenre(),
                v.getLanguage(),
                v.getVisibility(),
                v.getPublicationStatus(),
                v.getProcessingStatus(),
                v.isAiGenerated(),
                v.getViewCount(),
                v.getLikeCount(),
                liked,
                v.getPublishedAt(),
                v.getCreatedAt(),
                creator,
                seasonNumber,
                v.getEpisodeNumber(),
                v.getVersion() == null ? 0 : v.getVersion(),
                trailerVideoId,
                trailer);
    }
}
