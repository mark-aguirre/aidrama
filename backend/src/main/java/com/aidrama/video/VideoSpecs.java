package com.aidrama.video;

import com.aidrama.series.Series;
import com.aidrama.user.UserProfile;
import jakarta.persistence.criteria.CriteriaBuilder;
import jakarta.persistence.criteria.CriteriaQuery;
import jakarta.persistence.criteria.Predicate;
import jakarta.persistence.criteria.Root;
import jakarta.persistence.criteria.Subquery;
import java.util.Collection;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import org.springframework.data.jpa.domain.Specification;

/**
 * Visibility predicates for videos. These are the single definition of "who may see what";
 * every public query composes one of them (SCHEMA.md, backend rule 1: episodes inherit parent access).
 */
public final class VideoSpecs {

    private static final Set<Visibility> DISCOVERABLE = Set.of(Visibility.PUBLIC);
    private static final Set<Visibility> LINKABLE = Set.of(Visibility.PUBLIC, Visibility.UNLISTED);

    /** Escape character for the LIKE patterns built by {@link #titleContains}. */
    private static final char LIKE_ESCAPE = '\\';

    private VideoSpecs() {}

    /**
     * Appears in lists and search: PUBLISHED, PUBLIC, not deleted, and when it belongs to a series
     * that series is PUBLISHED, PUBLIC and not deleted.
     */
    public static Specification<Video> discoverable() {
        return visibleTo(DISCOVERABLE, DISCOVERABLE);
    }

    /**
     * Reachable by direct link for anyone: PUBLISHED, PUBLIC or UNLISTED, not deleted, and when it
     * belongs to a series that series is PUBLISHED, not PRIVATE and not deleted.
     */
    public static Specification<Video> linkable() {
        return visibleTo(LINKABLE, LINKABLE);
    }

    public static Specification<Video> ofType(VideoType type) {
        return (root, query, cb) -> cb.equal(root.get("type"), type);
    }

    public static Specification<Video> ofGenre(String genre) {
        return (root, query, cb) -> cb.equal(root.get("genre"), genre);
    }

    public static Specification<Video> withSlug(String slug) {
        return (root, query, cb) -> cb.equal(root.get("slug"), slug);
    }

    public static Specification<Video> inSeries(UUID seriesId) {
        return (root, query, cb) -> cb.equal(root.get("seriesId"), seriesId);
    }

    public static Specification<Video> ownedBy(UUID creatorId) {
        return (root, query, cb) -> cb.and(cb.equal(root.get("creatorId"), creatorId), cb.isNull(root.get("deletedAt")));
    }

    public static Specification<Video> withPublicationStatus(PublicationStatus status) {
        return (root, query, cb) -> cb.equal(root.get("publicationStatus"), status);
    }

    /**
     * Case-insensitive substring match on the title. The text is matched literally: LIKE wildcards
     * inside it are escaped, so searching for "50%" finds the title containing a percent sign
     * instead of matching everything.
     */
    public static Specification<Video> titleContains(String text) {
        String pattern = "%" + escapeLikeWildcards(text.toLowerCase(Locale.ROOT)) + "%";
        return (root, query, cb) -> cb.like(cb.lower(root.get("title")), pattern, LIKE_ESCAPE);
    }

    /**
     * Case-insensitive substring match for global catalogue search. A video matches when the text
     * appears in its title, description or genre, or in the display name of its creator. As with
     * {@link #titleContains}, LIKE wildcards in the text are escaped so they match literally.
     */
    public static Specification<Video> matchesSearch(String text) {
        String pattern = "%" + escapeLikeWildcards(text.toLowerCase(Locale.ROOT)) + "%";
        return (root, query, cb) -> {
            Subquery<Integer> creator = query.subquery(Integer.class);
            Root<UserProfile> profile = creator.from(UserProfile.class);
            creator.select(cb.literal(1))
                    .where(
                            cb.equal(profile.get("userId"), root.get("creatorId")),
                            cb.like(cb.lower(profile.get("displayName")), pattern, LIKE_ESCAPE));
            return cb.or(
                    cb.like(cb.lower(root.get("title")), pattern, LIKE_ESCAPE),
                    cb.like(cb.lower(root.get("description")), pattern, LIKE_ESCAPE),
                    cb.like(cb.lower(root.get("genre")), pattern, LIKE_ESCAPE),
                    cb.exists(creator));
        };
    }

    private static String escapeLikeWildcards(String text) {
        StringBuilder escaped = new StringBuilder(text.length());
        for (int i = 0; i < text.length(); i++) {
            char c = text.charAt(i);
            if (c == LIKE_ESCAPE || c == '%' || c == '_') {
                escaped.append(LIKE_ESCAPE);
            }
            escaped.append(c);
        }
        return escaped.toString();
    }

    private static Specification<Video> visibleTo(Set<Visibility> videoVisibility, Set<Visibility> seriesVisibility) {
        return (root, query, cb) -> cb.and(
                cb.equal(root.get("publicationStatus"), PublicationStatus.PUBLISHED),
                root.get("visibility").in(videoVisibility),
                cb.isNull(root.get("deletedAt")),
                parentSeriesAllows(root, query, cb, seriesVisibility));
    }

    private static Predicate parentSeriesAllows(
            Root<Video> video, CriteriaQuery<?> query, CriteriaBuilder cb, Collection<Visibility> allowed) {
        Subquery<Integer> parent = query.subquery(Integer.class);
        Root<Series> series = parent.from(Series.class);
        parent.select(cb.literal(1))
                .where(
                        cb.equal(series.get("id"), video.get("seriesId")),
                        cb.equal(series.get("publicationStatus"), PublicationStatus.PUBLISHED),
                        series.get("visibility").in(allowed),
                        cb.isNull(series.get("deletedAt")));
        return cb.or(cb.isNull(video.get("seriesId")), cb.exists(parent));
    }
}
