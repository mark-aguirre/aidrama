package com.aidrama.discovery;

import com.aidrama.user.CreatorSummary;
import com.aidrama.video.VideoDtos.VideoResponse;
import java.util.List;
import java.util.UUID;

/** Public discovery response shapes. They mirror the frontend domain types. */
public final class DiscoveryDtos {

    private DiscoveryDtos() {}

    public record FeaturedTitle(VideoResponse video, String backdropUrl, String kicker, String tagline) {}

    public record PlatformStat(String value, String label) {}

    /** Everything the home page needs in one call (GET /home). {@code featured} is null while the catalog is empty. */
    public record HomeFeed(
            FeaturedTitle featured, List<PlatformStat> stats, List<VideoResponse> trending, List<VideoResponse> originals) {}

    /** The {@code Series} type of the frontend domain types. {@code genre} is an empty string when unset. */
    public record SeriesResponse(
            UUID id,
            String slug,
            String title,
            String description,
            String posterUrl,
            String genre,
            int seasonCount,
            int episodeCount,
            CreatorSummary creator) {}

    /** A series with its episodes, ordered by season number then episode number. */
    public record SeriesDetailResponse(SeriesResponse series, List<VideoResponse> episodes) {}
}
