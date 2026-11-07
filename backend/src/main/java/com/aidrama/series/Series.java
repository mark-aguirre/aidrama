package com.aidrama.series;

import com.aidrama.common.persistence.TimestampedEntity;
import com.aidrama.video.PublicationStatus;
import com.aidrama.video.Visibility;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.time.Instant;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * Table {@code drama_series}. Read-only in this slice: the MVP slice exposes public series
 * discovery, but creator-side series management is not part of it.
 */
@Entity
@Table(name = "drama_series")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Series extends TimestampedEntity {

    @Id
    private UUID id;

    @Column(name = "creator_id", nullable = false)
    private UUID creatorId;

    @Column(name = "title", nullable = false, length = 200)
    private String title;

    @Column(name = "slug", nullable = false, length = 120)
    private String slug;

    @Column(name = "description", nullable = false, length = 5000)
    private String description;

    @Column(name = "poster_url", length = 2048)
    private String posterUrl;

    @Column(name = "genre", length = 40)
    private String genre;

    @Column(name = "language", nullable = false, length = 35)
    private String language;

    @Enumerated(EnumType.STRING)
    @Column(name = "visibility", nullable = false, length = 20)
    private Visibility visibility;

    @Enumerated(EnumType.STRING)
    @Column(name = "publication_status", nullable = false, length = 20)
    private PublicationStatus publicationStatus;

    @Column(name = "published_at")
    private Instant publishedAt;

    @Version
    @Column(name = "version", nullable = false)
    private Long version;

    @Column(name = "deleted_at")
    private Instant deletedAt;
}
