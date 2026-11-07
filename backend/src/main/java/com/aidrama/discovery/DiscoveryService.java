package com.aidrama.discovery;

import com.aidrama.common.api.PageParams;
import com.aidrama.common.api.Paginated;
import com.aidrama.common.exception.BadRequestException;
import com.aidrama.common.exception.FieldIssue;
import com.aidrama.common.exception.NotFoundException;
import com.aidrama.discovery.DiscoveryDtos.FeaturedTitle;
import com.aidrama.discovery.DiscoveryDtos.HomeFeed;
import com.aidrama.discovery.DiscoveryDtos.PlatformStat;
import com.aidrama.discovery.DiscoveryDtos.SeriesDetailResponse;
import com.aidrama.discovery.DiscoveryDtos.SeriesResponse;
import com.aidrama.security.AuthenticatedUser;
import com.aidrama.series.SeasonRepository;
import com.aidrama.series.Series;
import com.aidrama.series.SeriesRepository;
import com.aidrama.user.CreatorSummary;
import com.aidrama.user.UserRepository;
import com.aidrama.video.GenreCatalog;
import com.aidrama.video.PublicationStatus;
import com.aidrama.video.Video;
import com.aidrama.video.VideoAssembler;
import com.aidrama.video.VideoDtos.VideoResponse;
import com.aidrama.video.VideoRepository;
import com.aidrama.video.VideoSpecs;
import com.aidrama.video.VideoType;
import com.aidrama.video.Visibility;
import jakarta.persistence.EntityManager;
import jakarta.persistence.criteria.CriteriaBuilder;
import jakarta.persistence.criteria.CriteriaQuery;
import jakarta.persistence.criteria.Root;
import java.text.NumberFormat;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Public discovery and watch (spec 7.2). Every list is built from {@link VideoSpecs#discoverable()}
 * or a series equivalent, so the published, public, not-deleted and parent-series rules cannot be forgotten.
 */
@Service
@Transactional(readOnly = true)
public class DiscoveryService {

    private static final int HOME_RAIL_SIZE = 8;
    private static final int MAX_EPISODES_PER_SERIES = 500;
    private static final int TAGLINE_MAX = 140;

    /** Longest accepted search term; a longer one is a client bug rather than a search. */
    private static final int MAX_SEARCH_LENGTH = 200;

    private final VideoRepository videos;
    private final SeriesRepository seriesRepo;
    private final SeasonRepository seasons;
    private final UserRepository users;
    private final VideoAssembler assembler;
    private final GenreCatalog genres;
    private final EntityManager em;

    public DiscoveryService(
            VideoRepository videos,
            SeriesRepository seriesRepo,
            SeasonRepository seasons,
            UserRepository users,
            VideoAssembler assembler,
            GenreCatalog genres,
            EntityManager em) {
        this.videos = videos;
        this.seriesRepo = seriesRepo;
        this.seasons = seasons;
        this.users = users;
        this.assembler = assembler;
        this.genres = genres;
        this.em = em;
    }

    /** Sort keys accepted by {@code GET /videos}. Matches {@code SortKey} in the frontend client. */
    public enum VideoSort {
        POPULAR(Sort.by(Sort.Direction.DESC, "viewCount", "id")),
        RECENT(Sort.by(Sort.Direction.DESC, "publishedAt", "id")),
        LIKED(Sort.by(Sort.Direction.DESC, "likeCount", "id"));

        private final Sort sort;

        VideoSort(Sort sort) {
            this.sort = sort;
        }

        public Sort sort() {
            return sort;
        }
    }

    /** @param viewer the signed-in caller, or null; only used to fill {@code isLiked} on the videos */
    public HomeFeed home(AuthenticatedUser viewer) {
        Specification<Video> discoverable = VideoSpecs.discoverable();
        // Fetch one extra of each rail so the featured title can be removed from them.
        List<Video> recent = videos.findBy(discoverable, q -> q.sortBy(VideoSort.RECENT.sort()).limit(HOME_RAIL_SIZE + 1).all());
        List<Video> popular = videos.findBy(discoverable, q -> q.sortBy(VideoSort.POPULAR.sort()).limit(HOME_RAIL_SIZE + 1).all());

        Video featured = recent.isEmpty() ? null : recent.getFirst();
        List<Video> originals = recent.stream().filter(v -> featured == null || !v.getId().equals(featured.getId())).limit(HOME_RAIL_SIZE).toList();
        List<Video> trending = popular.stream().filter(v -> featured == null || !v.getId().equals(featured.getId())).limit(HOME_RAIL_SIZE).toList();

        // One assembly pass for the union of all rails.
        Map<UUID, Video> union = new LinkedHashMap<>();
        if (featured != null) {
            union.put(featured.getId(), featured);
        }
        originals.forEach(v -> union.put(v.getId(), v));
        trending.forEach(v -> union.put(v.getId(), v));
        Map<UUID, VideoResponse> byId = assembler.assemble(List.copyOf(union.values()), viewerId(viewer)).stream()
                .collect(Collectors.toMap(VideoResponse::id, Function.identity()));

        FeaturedTitle featuredTitle = null;
        if (featured != null) {
            VideoResponse fv = byId.get(featured.getId());
            featuredTitle = new FeaturedTitle(
                    fv,
                    fv.thumbnailUrl() == null ? "" : fv.thumbnailUrl(),
                    fv.genre().isEmpty() ? "Featured" : "Featured " + fv.genre(),
                    tagline(fv.description(), fv.title()));
        }
        return new HomeFeed(
                featuredTitle,
                stats(discoverable),
                trending.stream().map(v -> byId.get(v.getId())).toList(),
                originals.stream().map(v -> byId.get(v.getId())).toList());
    }

    public Paginated<VideoResponse> listVideos(
            VideoType type, String genre, VideoSort sort, PageParams params, AuthenticatedUser viewer) {
        Specification<Video> spec = VideoSpecs.discoverable();
        if (type != null) {
            spec = spec.and(VideoSpecs.ofType(type));
        }
        String genreFilter = genres.forFilter(genre);
        if (genreFilter != null) {
            spec = spec.and(VideoSpecs.ofGenre(genreFilter));
        }
        Page<Video> page = videos.findAll(spec, params.toPageRequest((sort == null ? VideoSort.POPULAR : sort).sort()));
        UUID viewerId = viewerId(viewer);
        return Paginated.of(page, list -> assembler.assemble(list, viewerId));
    }

    /**
     * Global catalogue search (spec 3.14). Matches the term, case-insensitively, against a video's
     * title, description and genre, and against its creator's display name. Only discoverable videos
     * are returned (published, public, not deleted, and their parent series likewise), ordered by
     * popularity. An absent or blank term matches nothing, so the result is an empty page.
     */
    public Paginated<VideoResponse> search(String term, PageParams params, AuthenticatedUser viewer) {
        String text = normalizeSearch(term);
        if (text == null) {
            return new Paginated<>(List.of(), new Paginated.Pagination(params.page(), params.pageSize(), 0, 1, false));
        }
        Specification<Video> spec = VideoSpecs.discoverable().and(VideoSpecs.matchesSearch(text));
        Page<Video> page = videos.findAll(spec, params.toPageRequest(VideoSort.POPULAR.sort()));
        UUID viewerId = viewerId(viewer);
        return Paginated.of(page, list -> assembler.assemble(list, viewerId));
    }

    /**
     * Watch lookup. Anyone may open a PUBLISHED video that is PUBLIC or UNLISTED (and whose parent
     * series allows it). Otherwise only the owner may, so private and draft videos stay hidden. A
     * hidden video is reported as 404.
     */
    public VideoResponse getBySlug(String slug, AuthenticatedUser viewer) {
        Video video = videos.findOne(VideoSpecs.linkable().and(VideoSpecs.withSlug(slug)))
                .or(() -> viewer == null
                        ? java.util.Optional.empty()
                        : videos.findBySlugAndDeletedAtIsNull(slug).filter(v -> v.isOwnedBy(viewer.id())))
                .orElseThrow(() -> new NotFoundException("Video"));
        return assembler.assembleOne(video, viewerId(viewer));
    }

    public Paginated<SeriesResponse> listSeries(String genre, PageParams params) {
        Specification<Series> spec = (root, q, cb) -> cb.and(
                cb.equal(root.get("publicationStatus"), PublicationStatus.PUBLISHED),
                cb.equal(root.get("visibility"), Visibility.PUBLIC),
                cb.isNull(root.get("deletedAt")));
        String genreFilter = genres.forFilter(genre);
        if (genreFilter != null) {
            spec = spec.and((root, q, cb) -> cb.equal(root.get("genre"), genreFilter));
        }
        Page<Series> page = seriesRepo.findAll(spec, params.toPageRequest(Sort.by(Sort.Direction.DESC, "publishedAt", "id")));
        return Paginated.of(page, list -> toSeriesResponses(list, null));
    }

    public SeriesDetailResponse getSeriesBySlug(String slug, AuthenticatedUser viewer) {
        Series series = seriesRepo.findOne((root, q, cb) -> cb.and(
                        cb.equal(root.get("slug"), slug),
                        cb.equal(root.get("publicationStatus"), PublicationStatus.PUBLISHED),
                        root.get("visibility").in(Set.of(Visibility.PUBLIC, Visibility.UNLISTED)),
                        cb.isNull(root.get("deletedAt"))))
                .orElseThrow(() -> new NotFoundException("Series"));

        Specification<Video> episodeSpec = VideoSpecs.linkable()
                .and(VideoSpecs.inSeries(series.getId()))
                .and(VideoSpecs.ofType(VideoType.EPISODE));
        List<Video> episodes = videos.findBy(
                episodeSpec, q -> q.sortBy(Sort.by("episodeNumber", "id")).limit(MAX_EPISODES_PER_SERIES).all());
        List<VideoResponse> ordered = assembler.assemble(episodes, viewerId(viewer)).stream()
                .sorted(Comparator.comparing(VideoResponse::seasonNumber, Comparator.nullsLast(Comparator.naturalOrder()))
                        .thenComparing(VideoResponse::episodeNumber, Comparator.nullsLast(Comparator.naturalOrder())))
                .toList();
        SeriesResponse response = toSeriesResponses(List.of(series), Map.of(series.getId(), ordered.size())).getFirst();
        return new SeriesDetailResponse(response, ordered);
    }

    // ---- helpers ----

    private static UUID viewerId(AuthenticatedUser viewer) {
        return viewer == null ? null : viewer.id();
    }

    /**
     * Trims the raw term and treats blank as absent, so {@code ?q=} matches nothing instead of
     * erroring. A term longer than any title or name could be is a client bug rather than a search,
     * so it is rejected with 400 rather than silently returning an empty page.
     */
    private static String normalizeSearch(String raw) {
        if (raw == null) {
            return null;
        }
        String trimmed = raw.trim();
        if (trimmed.isEmpty()) {
            return null;
        }
        if (trimmed.length() > MAX_SEARCH_LENGTH) {
            throw new BadRequestException(
                    "VALIDATION_ERROR",
                    "Request validation failed.",
                    List.of(new FieldIssue("q", "must be at most " + MAX_SEARCH_LENGTH + " characters")));
        }
        return trimmed;
    }

    /** @param episodeCounts overrides the public episode count (used by the detail page); null means query it. */
    private List<SeriesResponse> toSeriesResponses(List<Series> list, Map<UUID, Integer> episodeCounts) {
        if (list.isEmpty()) {
            return List.of();
        }
        Set<UUID> ids = list.stream().map(Series::getId).collect(Collectors.toSet());
        Map<UUID, CreatorSummary> creators = users
                .findCreatorSummaries(list.stream().map(Series::getCreatorId).collect(Collectors.toSet()))
                .stream()
                .collect(Collectors.toMap(CreatorSummary::id, Function.identity()));
        Map<UUID, Integer> seasonCounts = counts(seasons.countLiveBySeries(ids));
        Map<UUID, Integer> episodes = episodeCounts != null ? episodeCounts : counts(videos.countPublicEpisodesBySeries(ids));
        return list.stream()
                .map(s -> new SeriesResponse(
                        s.getId(),
                        s.getSlug(),
                        s.getTitle(),
                        s.getDescription(),
                        s.getPosterUrl(),
                        s.getGenre() == null ? "" : s.getGenre(),
                        seasonCounts.getOrDefault(s.getId(), 0),
                        episodes.getOrDefault(s.getId(), 0),
                        creators.get(s.getCreatorId())))
                .toList();
    }

    private static Map<UUID, Integer> counts(List<Object[]> rows) {
        Map<UUID, Integer> out = new HashMap<>();
        for (Object[] row : rows) {
            out.put((UUID) row[0], ((Number) row[1]).intValue());
        }
        return out;
    }

    /** Platform numbers for the home hero, computed with the same visibility predicate as the lists. */
    private List<PlatformStat> stats(Specification<Video> discoverable) {
        CriteriaBuilder cb = em.getCriteriaBuilder();
        CriteriaQuery<Object[]> cq = cb.createQuery(Object[].class);
        Root<Video> root = cq.from(Video.class);
        cq.multiselect(cb.count(root), cb.countDistinct(root.get("creatorId")), cb.coalesce(cb.sum(root.<Long>get("viewCount")), 0L))
                .where(discoverable.toPredicate(root, cq, cb));
        Object[] row = em.createQuery(cq).getSingleResult();
        NumberFormat compact = NumberFormat.getCompactNumberInstance(Locale.US, NumberFormat.Style.SHORT);
        return List.of(
                new PlatformStat(compact.format(((Number) row[0]).longValue()), "Videos"),
                new PlatformStat(compact.format(((Number) row[1]).longValue()), "Creators"),
                new PlatformStat(compact.format(((Number) row[2]).longValue()), "Views"));
    }

    private static String tagline(String description, String title) {
        String text = description == null ? "" : description.strip();
        if (text.isEmpty()) {
            return title;
        }
        int end = text.indexOf(". ");
        String first = end > 0 ? text.substring(0, end + 1) : text;
        return first.length() > TAGLINE_MAX ? first.substring(0, TAGLINE_MAX - 1).stripTrailing() + "…" : first;
    }
}
